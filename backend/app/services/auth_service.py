import logging
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import Settings
from app.models.user import UserInDB
from app.repositories.user_repo import UserRepository

logger = logging.getLogger(__name__)
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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

    async def authenticate(self, email: str, password: str) -> UserInDB | None:
        user = await self.repo.find_by_email(email.strip().lower())
        if user is None:
            return None
        if not _pwd_context.verify(password, user.password_hash):
            return None
        return user

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
