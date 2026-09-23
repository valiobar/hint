from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import Settings
from app.models.billing import NO_PLAN_LIMITS, PLAN_LIMITS, SUPERADMIN_LIMITS
from app.models.user import UserInDB
from app.routes.deps import resolve_limits
from app.services.auth_service import (
    GOOGLE_AUTH_URL,
    AuthService,
    EmailTakenError,
    GoogleAuthError,
)


def _user(**overrides) -> UserInDB:
    payload = {
        "user_id": "usr_aaa11111",
        "email": "ada@example.com",
        "role": "user",
        "password_hash": "hashed",
        "google_sub": None,
        "created_at": datetime.now(timezone.utc),
        "plan": None,
        "subscription_status": None,
    }
    payload.update(overrides)
    return UserInDB(**payload)


class FakeUserRepo:
    def __init__(self, users: list[UserInDB] | None = None) -> None:
        self.users = list(users or [])
        self.created: list[dict] = []
        self.linked: list[tuple[str, str]] = []

    async def find_by_email(self, email: str) -> UserInDB | None:
        return next((u for u in self.users if u.email == email), None)

    async def find_by_google_sub(self, sub: str) -> UserInDB | None:
        return next((u for u in self.users if u.google_sub == sub), None)

    async def create(
        self,
        email: str,
        *,
        password_hash: str | None,
        google_sub: str | None = None,
        role: str = "user",
    ) -> UserInDB:
        user = _user(
            user_id=f"usr_{len(self.users):08d}",
            email=email,
            password_hash=password_hash,
            google_sub=google_sub,
            role=role,
        )
        self.users.append(user)
        self.created.append(
            {
                "email": email,
                "password_hash": password_hash,
                "google_sub": google_sub,
            }
        )
        return user

    async def set_google_sub(self, user_id: str, sub: str) -> None:
        self.linked.append((user_id, sub))
        self.users = [
            u.model_copy(update={"google_sub": sub}) if u.user_id == user_id else u
            for u in self.users
        ]


def _svc(repo: FakeUserRepo | None = None, **settings_kw) -> AuthService:
    settings = Settings(
        jwt_secret="test-secret",
        google_client_id="gid.apps.googleusercontent.com",
        google_client_secret="gsecret",
        google_redirect_uri="http://localhost:8000/api/v1/auth/google/callback",
        **settings_kw,
    )
    return AuthService(repo or FakeUserRepo(), settings)


@pytest.mark.asyncio
async def test_register_normalizes_email_and_hashes_password() -> None:
    repo = FakeUserRepo()
    user = await _svc(repo).register("  Ada@Example.com ", "hunter22")
    assert user.email == "ada@example.com"
    assert repo.created[0]["password_hash"] != "hunter22"
    assert repo.created[0]["password_hash"].startswith("$2")


@pytest.mark.asyncio
async def test_register_rejects_duplicate_email() -> None:
    repo = FakeUserRepo([_user(email="ada@example.com")])
    with pytest.raises(EmailTakenError):
        await _svc(repo).register("ada@example.com", "hunter22")


@pytest.mark.asyncio
async def test_authenticate_rejects_google_only_account() -> None:
    repo = FakeUserRepo(
        [_user(email="ada@example.com", password_hash=None, google_sub="sub-1")]
    )
    assert await _svc(repo).authenticate("ada@example.com", "anything") is None


@pytest.mark.asyncio
async def test_authenticate_accepts_matching_password() -> None:
    svc = _svc()
    user = await svc.register("ada@example.com", "hunter22")
    found = await svc.authenticate("Ada@Example.com", "hunter22")
    assert found is not None
    assert found.email == user.email
    assert await svc.authenticate("ada@example.com", "wrong-pass") is None


def test_google_login_url_includes_state_and_client() -> None:
    url = _svc().google_login_url("abc123")
    assert url.startswith(GOOGLE_AUTH_URL)
    assert "client_id=gid.apps.googleusercontent.com" in url
    assert "state=abc123" in url
    assert "prompt=select_account" in url
    assert "scope=openid+email" in url


@pytest.mark.asyncio
async def test_google_exchange_creates_user_when_unknown() -> None:
    repo = FakeUserRepo()
    svc = _svc(repo)
    token_res = MagicMock()
    token_res.json.return_value = {"id_token": "idt"}
    token_res.raise_for_status = MagicMock()
    info_res = MagicMock()
    info_res.json.return_value = {
        "aud": svc.settings.google_client_id,
        "email": "Ada@Example.com",
        "sub": "sub-9",
    }
    info_res.raise_for_status = MagicMock()
    client = AsyncMock()
    client.post = AsyncMock(return_value=token_res)
    client.get = AsyncMock(return_value=info_res)
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False

    with patch("app.services.auth_service.httpx.AsyncClient", return_value=client):
        user = await svc.google_exchange("code-1")

    assert user.email == "ada@example.com"
    assert user.google_sub == "sub-9"
    assert user.password_hash is None
    assert repo.created[0]["google_sub"] == "sub-9"


@pytest.mark.asyncio
async def test_google_exchange_links_existing_email() -> None:
    existing = _user(email="ada@example.com", password_hash="hashed")
    repo = FakeUserRepo([existing])
    svc = _svc(repo)
    token_res = MagicMock()
    token_res.json.return_value = {"id_token": "idt"}
    token_res.raise_for_status = MagicMock()
    info_res = MagicMock()
    info_res.json.return_value = {
        "aud": svc.settings.google_client_id,
        "email": "ada@example.com",
        "sub": "sub-9",
    }
    info_res.raise_for_status = MagicMock()
    client = AsyncMock()
    client.post = AsyncMock(return_value=token_res)
    client.get = AsyncMock(return_value=info_res)
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False

    with patch("app.services.auth_service.httpx.AsyncClient", return_value=client):
        user = await svc.google_exchange("code-1")

    assert user.email == "ada@example.com"
    assert repo.linked == [(existing.user_id, "sub-9")]
    assert repo.created == []


@pytest.mark.asyncio
async def test_google_exchange_rejects_aud_mismatch() -> None:
    svc = _svc()
    token_res = MagicMock()
    token_res.json.return_value = {"id_token": "idt"}
    token_res.raise_for_status = MagicMock()
    info_res = MagicMock()
    info_res.json.return_value = {
        "aud": "other-client",
        "email": "ada@example.com",
        "sub": "sub-9",
    }
    info_res.raise_for_status = MagicMock()
    client = AsyncMock()
    client.post = AsyncMock(return_value=token_res)
    client.get = AsyncMock(return_value=info_res)
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False

    with (
        patch("app.services.auth_service.httpx.AsyncClient", return_value=client),
        pytest.raises(GoogleAuthError, match="aud mismatch"),
    ):
        await svc.google_exchange("code-1")


def test_resolve_limits_by_role_and_subscription() -> None:
    assert resolve_limits(_user(role="superadmin")) == SUPERADMIN_LIMITS
    assert (
        resolve_limits(_user(plan="pro", subscription_status="active"))
        == PLAN_LIMITS["pro"]
    )
    assert (
        resolve_limits(_user(plan="basic", subscription_status="trialing"))
        == PLAN_LIMITS["basic"]
    )
    assert (
        resolve_limits(_user(plan="pro", subscription_status="canceled"))
        == NO_PLAN_LIMITS
    )
    assert resolve_limits(_user()) == NO_PLAN_LIMITS
