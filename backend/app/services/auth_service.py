import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from passlib.context import CryptContext

from app.config import Settings
from app.models.user import UserInDB
from app.repositories.user_repo import UserRepository

logger = logging.getLogger(__name__)
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


class EmailTakenError(Exception):
    def __init__(self, email: str):
        self.email = email
        super().__init__(email)


class GoogleAuthError(Exception):
    pass


class AuthService:
    def __init__(self, repo: UserRepository, settings: Settings):
        self.repo = repo
        self.settings = settings

    async def ensure_admin_user(self) -> None:
        if not self.settings.admin_password:
            logger.warning(
                "ADMIN_PASSWORD is not set - admin login is disabled; "
                "set it in .env and restart"
            )
            return
        email = self.settings.admin_email.strip().lower()
        await self.repo.upsert(email, _pwd_context.hash(self.settings.admin_password))
        logger.info("Preset admin user ensured: %s", email)

    async def register(self, email: str, password: str) -> UserInDB:
        email = email.strip().lower()
        if await self.repo.find_by_email(email):
            raise EmailTakenError(email)
        return await self.repo.create(
            email, password_hash=_pwd_context.hash(password)
        )

    async def authenticate(self, email: str, password: str) -> UserInDB | None:
        user = await self.repo.find_by_email(email.strip().lower())
        if user is None or user.password_hash is None:
            return None  # unknown, or Google-only account — same 401, no enumeration
        return user if _pwd_context.verify(password, user.password_hash) else None

    def google_login_url(self, state: str) -> str:
        params = {
            "client_id": self.settings.google_client_id,
            "redirect_uri": self.settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email",
            "state": state,
            "prompt": "select_account",
        }
        return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"

    async def google_exchange(self, code: str) -> UserInDB:
        async with httpx.AsyncClient(timeout=10) as client:
            token_res = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": self.settings.google_client_id,
                    "client_secret": self.settings.google_client_secret,
                    "redirect_uri": self.settings.google_redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            token_res.raise_for_status()
            id_token = token_res.json().get("id_token")
            if not id_token:
                raise GoogleAuthError("missing id_token")
            info_res = await client.get(
                GOOGLE_TOKENINFO_URL, params={"id_token": id_token}
            )
            info_res.raise_for_status()
            claims = info_res.json()  # Google-verified: aud, exp, email, sub

        if claims.get("aud") != self.settings.google_client_id:
            raise GoogleAuthError("aud mismatch")
        email_raw = claims.get("email")
        sub = claims.get("sub")
        if not isinstance(email_raw, str) or not isinstance(sub, str):
            raise GoogleAuthError("missing email or sub")
        email = email_raw.strip().lower()

        user = await self.repo.find_by_google_sub(sub)
        if user:
            return user
        user = await self.repo.find_by_email(email)
        if user:  # link Google to existing account
            await self.repo.set_google_sub(user.user_id, sub)
            return user
        return await self.repo.create(email, password_hash=None, google_sub=sub)

    def create_access_token(self, email: str) -> tuple[str, int]:
        expires_in = self.settings.access_token_ttl_minutes * 60
        now = datetime.now(timezone.utc)
        payload = {"sub": email, "iat": now, "exp": now + timedelta(seconds=expires_in)}
        token = jwt.encode(
            payload, self.settings.jwt_secret, algorithm=self.settings.jwt_algorithm
        )
        return token, expires_in

    def decode_token(self, token: str) -> str:
        """Returns the subject (email). Raises jwt.PyJWTError when invalid/expired."""
        payload = jwt.decode(
            token, self.settings.jwt_secret, algorithms=[self.settings.jwt_algorithm]
        )
        subject = payload.get("sub")
        if not isinstance(subject, str):
            raise jwt.InvalidTokenError("Token has no subject")
        return subject
