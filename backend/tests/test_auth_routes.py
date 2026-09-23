from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.models.billing import SUPERADMIN_LIMITS
from app.models.user import UserInDB
from app.routes.deps import get_auth_service, require_user
from app.services.auth_service import EmailTakenError


class FakeAuthService:
    def __init__(self) -> None:
        self.registered: list[tuple[str, str]] = []

    async def register(self, email: str, password: str) -> UserInDB:
        email = email.strip().lower()
        if email == "taken@example.com":
            raise EmailTakenError(email)
        self.registered.append((email, password))
        return UserInDB(
            user_id="usr_newuser",
            email=email,
            created_at=datetime.now(timezone.utc),
        )

    def create_access_token(self, email: str) -> tuple[str, int]:
        return f"tok-{email}", 43200

    def google_login_url(self, state: str) -> str:
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"


def test_register_returns_token() -> None:
    fake = FakeAuthService()
    app.dependency_overrides[get_auth_service] = lambda: fake
    try:
        res = TestClient(app).post(
            "/api/v1/auth/register",
            json={"email": "Ada@Example.com", "password": "hunter22"},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["access_token"] == "tok-ada@example.com"
        assert body["email"] == "ada@example.com"
        assert body["expires_in"] == 43200
    finally:
        app.dependency_overrides.clear()


def test_register_duplicate_email_is_409() -> None:
    app.dependency_overrides[get_auth_service] = lambda: FakeAuthService()
    try:
        res = TestClient(app).post(
            "/api/v1/auth/register",
            json={"email": "taken@example.com", "password": "hunter22"},
        )
        assert res.status_code == 409
        assert res.json()["detail"] == "Email is already registered"
    finally:
        app.dependency_overrides.clear()


def test_register_short_password_is_422() -> None:
    app.dependency_overrides[get_auth_service] = lambda: FakeAuthService()
    try:
        res = TestClient(app).post(
            "/api/v1/auth/register",
            json={"email": "ada@example.com", "password": "short7s"},
        )
        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_google_login_unconfigured_is_503() -> None:
    app.dependency_overrides[get_auth_service] = lambda: FakeAuthService()
    try:
        with patch(
            "app.routes.auth.get_settings",
            return_value=Settings(google_client_id=""),
        ):
            res = TestClient(app).get(
                "/api/v1/auth/google/login", follow_redirects=False
            )
        assert res.status_code == 503
        assert res.json()["detail"] == "Google sign-in is not configured"
    finally:
        app.dependency_overrides.clear()


def test_google_login_redirects_when_configured() -> None:
    app.dependency_overrides[get_auth_service] = lambda: FakeAuthService()
    try:
        with patch(
            "app.routes.auth.get_settings",
            return_value=Settings(google_client_id="gid.apps.googleusercontent.com"),
        ):
            res = TestClient(app).get(
                "/api/v1/auth/google/login", follow_redirects=False
            )
        assert res.status_code == 307
        assert res.headers["location"].startswith(
            "https://accounts.google.com/o/oauth2/v2/auth"
        )
        assert "g_state" in res.cookies
    finally:
        app.dependency_overrides.clear()


def test_google_callback_state_mismatch_redirects_to_spa() -> None:
    app.dependency_overrides[get_auth_service] = lambda: FakeAuthService()
    try:
        with patch(
            "app.routes.auth.get_settings",
            return_value=Settings(admin_ui_url="http://localhost:3001"),
        ):
            res = TestClient(app).get(
                "/api/v1/auth/google/callback",
                params={"code": "x", "state": "nope"},
                follow_redirects=False,
            )
        assert res.status_code == 307
        assert res.headers["location"] == "http://localhost:3001/#error=oauth_state"
    finally:
        app.dependency_overrides.clear()


def test_me_returns_role_plan_and_limits() -> None:
    user = UserInDB(
        user_id="usr_admin01",
        email="admin@hint.local",
        role="superadmin",
        created_at=datetime.now(timezone.utc),
    )

    async def _user() -> UserInDB:
        return user

    app.dependency_overrides[require_user] = _user
    try:
        res = TestClient(app).get("/api/v1/auth/me")
        assert res.status_code == 200
        body = res.json()
        assert body["email"] == "admin@hint.local"
        assert body["role"] == "superadmin"
        assert body["plan"] is None
        assert body["limits"] == SUPERADMIN_LIMITS.model_dump()
    finally:
        app.dependency_overrides.clear()
