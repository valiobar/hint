from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from polar_sdk.webhooks import WebhookUnknownTypeError, WebhookVerificationError

from app.config import Settings
from app.models.user import UserInDB
from app.services.billing_service import BillingService


def _user(**overrides) -> UserInDB:
    payload = {
        "user_id": "usr_aaa11111",
        "email": "ada@example.com",
        "role": "user",
        "created_at": datetime.now(timezone.utc),
    }
    payload.update(overrides)
    return UserInDB(**payload)


class FakeUserRepo:
    def __init__(self) -> None:
        self.updates: list[tuple[str, dict]] = []

    async def update_subscription(self, user_id: str, fields: dict) -> None:
        self.updates.append((user_id, fields))


def _svc(repo: FakeUserRepo | None = None) -> BillingService:
    settings = Settings(
        polar_access_token="polar_tok",
        polar_webhook_secret="whsec_test",
        polar_environment="sandbox",
        polar_product_id_basic="prod_basic",
        polar_product_id_pro="prod_pro",
        admin_ui_url="http://localhost:3001",
    )
    svc = BillingService(repo or FakeUserRepo(), settings)
    svc.client = MagicMock()
    return svc


def _event(
    *,
    type_: str = "subscription.created",
    user_id: str | None = "usr_aaa11111",
    product_id: str = "prod_basic",
    status: str = "trialing",
    period_end: datetime | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        TYPE=type_,
        data=SimpleNamespace(
            id="sub_1",
            status=status,
            product_id=product_id,
            customer_id="cus_1",
            current_period_end=period_end or datetime(2026, 10, 1, tzinfo=timezone.utc),
            customer=SimpleNamespace(external_id=user_id),
        ),
    )


@pytest.mark.asyncio
async def test_create_checkout_sends_external_customer_and_returns_url() -> None:
    svc = _svc()
    svc.client.checkouts.create_async = AsyncMock(
        return_value=SimpleNamespace(url="https://sandbox.polar.sh/checkout/abc")
    )
    url = await svc.create_checkout(_user(), "basic")
    assert url == "https://sandbox.polar.sh/checkout/abc"
    request = svc.client.checkouts.create_async.call_args.kwargs["request"]
    assert request["products"] == ["prod_basic"]
    assert request["external_customer_id"] == "usr_aaa11111"
    assert request["customer_email"] == "ada@example.com"
    assert request["success_url"] == "http://localhost:3001/?checkout=success"


@pytest.mark.asyncio
async def test_create_portal_returns_customer_portal_url() -> None:
    svc = _svc()
    svc.client.customer_sessions.create_async = AsyncMock(
        return_value=SimpleNamespace(
            customer_portal_url="https://sandbox.polar.sh/portal/xyz"
        )
    )
    url = await svc.create_portal(_user(polar_customer_id="cus_1"))
    assert url == "https://sandbox.polar.sh/portal/xyz"
    request = svc.client.customer_sessions.create_async.call_args.kwargs["request"]
    assert request["external_customer_id"] == "usr_aaa11111"


@pytest.mark.asyncio
async def test_apply_webhook_writes_subscription_fields() -> None:
    repo = FakeUserRepo()
    svc = _svc(repo)
    period_end = datetime(2026, 10, 1, tzinfo=timezone.utc)
    with patch(
        "app.services.billing_service.validate_event",
        return_value=_event(period_end=period_end),
    ):
        await svc.apply_webhook(b"{}", {"webhook-id": "1"})
    assert repo.updates == [
        (
            "usr_aaa11111",
            {
                "plan": "basic",
                "subscription_status": "trialing",
                "polar_customer_id": "cus_1",
                "polar_subscription_id": "sub_1",
                "current_period_end": period_end,
            },
        )
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("event_type", "polar_status", "plan", "status"),
    [
        ("subscription.canceled", "canceled", None, "canceled"),
        ("subscription.revoked", "unpaid", None, "revoked"),
    ],
)
async def test_apply_webhook_clears_plan_when_access_ends(
    event_type: str, polar_status: str, plan: str | None, status: str
) -> None:
    repo = FakeUserRepo()
    svc = _svc(repo)
    with patch(
        "app.services.billing_service.validate_event",
        return_value=_event(
            type_=event_type, product_id="prod_pro", status=polar_status
        ),
    ):
        await svc.apply_webhook(b"{}", {"webhook-id": "1"})
    assert repo.updates[0][1]["plan"] is plan
    assert repo.updates[0][1]["subscription_status"] == status


@pytest.mark.asyncio
async def test_apply_webhook_skips_missing_external_id() -> None:
    repo = FakeUserRepo()
    svc = _svc(repo)
    with patch(
        "app.services.billing_service.validate_event",
        return_value=_event(user_id=None),
    ):
        await svc.apply_webhook(b"{}", {"webhook-id": "1"})
    assert repo.updates == []


@pytest.mark.asyncio
async def test_apply_webhook_ignores_unrelated_and_unknown_events() -> None:
    repo = FakeUserRepo()
    svc = _svc(repo)
    with patch(
        "app.services.billing_service.validate_event",
        return_value=_event(type_="order.created"),
    ):
        await svc.apply_webhook(b"{}", {"webhook-id": "1"})
    with patch(
        "app.services.billing_service.validate_event",
        side_effect=WebhookUnknownTypeError("future.event"),
    ):
        await svc.apply_webhook(b"{}", {"webhook-id": "1"})
    assert repo.updates == []


@pytest.mark.asyncio
async def test_apply_webhook_propagates_bad_signature() -> None:
    svc = _svc()
    with (
        patch(
            "app.services.billing_service.validate_event",
            side_effect=WebhookVerificationError("bad sig"),
        ),
        pytest.raises(WebhookVerificationError),
    ):
        await svc.apply_webhook(b"{}", {"webhook-id": "1"})
