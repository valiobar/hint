from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from polar_sdk.webhooks import WebhookVerificationError

from app.config import Settings
from app.main import app
from app.models.user import UserInDB
from app.routes.deps import get_auth_service, get_billing_service, require_user


def _user(**overrides) -> UserInDB:
    payload = {
        "user_id": "usr_aaa11111",
        "email": "ada@example.com",
        "role": "user",
        "created_at": datetime.now(timezone.utc),
    }
    payload.update(overrides)
    return UserInDB(**payload)


class FakeBillingService:
    def __init__(self) -> None:
        self.checkout_calls: list[tuple[str, str]] = []
        self.portal_calls: list[str] = []
        self.webhook_calls: list[tuple[bytes, dict]] = []
        self.webhook_error: Exception | None = None

    async def create_checkout(self, user: UserInDB, plan: str) -> str:
        self.checkout_calls.append((user.user_id, plan))
        return f"https://sandbox.polar.sh/checkout/{plan}"

    async def create_portal(self, user: UserInDB) -> str:
        self.portal_calls.append(user.user_id)
        return "https://sandbox.polar.sh/portal/xyz"

    async def apply_webhook(self, payload: bytes, headers: dict) -> None:
        if self.webhook_error is not None:
            raise self.webhook_error
        self.webhook_calls.append((payload, headers))


def _override_user(user: UserInDB) -> None:
    async def _user_dep() -> UserInDB:
        return user

    app.dependency_overrides[require_user] = _user_dep


def test_checkout_returns_polar_url() -> None:
    fake = FakeBillingService()
    _override_user(_user())
    app.dependency_overrides[get_billing_service] = lambda: fake
    try:
        res = TestClient(app).post("/api/v1/billing/checkout", json={"plan": "basic"})
        assert res.status_code == 200
        assert res.json() == {
            "checkout_url": "https://sandbox.polar.sh/checkout/basic"
        }
        assert fake.checkout_calls == [("usr_aaa11111", "basic")]
    finally:
        app.dependency_overrides.clear()


def test_checkout_rejects_unknown_plan() -> None:
    _override_user(_user())
    app.dependency_overrides[get_billing_service] = lambda: FakeBillingService()
    try:
        res = TestClient(app).post("/api/v1/billing/checkout", json={"plan": "enterprise"})
        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_checkout_unconfigured_is_503() -> None:
    _override_user(_user())
    try:
        with patch(
            "app.routes.deps.get_settings",
            return_value=Settings(polar_access_token=""),
        ):
            res = TestClient(app).post(
                "/api/v1/billing/checkout", json={"plan": "pro"}
            )
        assert res.status_code == 503
        assert "POLAR_ACCESS_TOKEN" in res.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_checkout_requires_auth() -> None:
    app.dependency_overrides[get_auth_service] = lambda: object()
    app.dependency_overrides[get_billing_service] = lambda: FakeBillingService()
    try:
        res = TestClient(app).post("/api/v1/billing/checkout", json={"plan": "basic"})
        assert res.status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_portal_returns_url_when_customer_on_file() -> None:
    fake = FakeBillingService()
    _override_user(_user(polar_customer_id="cus_1"))
    app.dependency_overrides[get_billing_service] = lambda: fake
    try:
        res = TestClient(app).get("/api/v1/billing/portal")
        assert res.status_code == 200
        assert res.json() == {"portal_url": "https://sandbox.polar.sh/portal/xyz"}
        assert fake.portal_calls == ["usr_aaa11111"]
    finally:
        app.dependency_overrides.clear()


def test_portal_without_subscription_is_404() -> None:
    _override_user(_user())
    app.dependency_overrides[get_billing_service] = lambda: FakeBillingService()
    try:
        res = TestClient(app).get("/api/v1/billing/portal")
        assert res.status_code == 404
        assert res.json()["detail"] == "No subscription on file"
    finally:
        app.dependency_overrides.clear()


def test_webhook_accepts_valid_event() -> None:
    fake = FakeBillingService()
    app.dependency_overrides[get_billing_service] = lambda: fake
    try:
        res = TestClient(app).post(
            "/api/v1/webhooks/polar",
            content=b'{"type":"order.created"}',
            headers={"webhook-id": "evt_1"},
        )
        assert res.status_code == 202
        assert fake.webhook_calls[0][0] == b'{"type":"order.created"}'
    finally:
        app.dependency_overrides.clear()


def test_webhook_bad_signature_is_403() -> None:
    fake = FakeBillingService()
    fake.webhook_error = WebhookVerificationError("bad sig")
    app.dependency_overrides[get_billing_service] = lambda: fake
    try:
        res = TestClient(app).post("/api/v1/webhooks/polar", content=b"{}")
        assert res.status_code == 403
        assert res.json()["detail"] == "Invalid webhook signature"
    finally:
        app.dependency_overrides.clear()


def test_webhook_is_public() -> None:
    app.dependency_overrides[get_billing_service] = lambda: FakeBillingService()
    try:
        res = TestClient(app).post("/api/v1/webhooks/polar", content=b"{}")
        assert res.status_code == 202
    finally:
        app.dependency_overrides.clear()
