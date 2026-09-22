import secrets
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import UserInDB

_SUBSCRIPTION_FIELDS = frozenset(
    {
        "plan",
        "subscription_status",
        "polar_customer_id",
        "polar_subscription_id",
        "current_period_end",
    }
)


def _new_user_id() -> str:
    return f"usr_{secrets.token_hex(4)}"


def _to_user(doc: dict | None) -> UserInDB | None:
    if doc is None:
        return None
    payload = {key: value for key, value in doc.items() if key != "_id"}
    if not payload.get("user_id"):
        # Upgrade window: legacy seed row before upsert backfill.
        payload["user_id"] = ""
    return UserInDB(**payload)


class UserRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["users"]

    async def find_by_email(self, email: str) -> UserInDB | None:
        doc = await self.collection.find_one({"email": email})
        return _to_user(doc)

    async def find_by_user_id(self, user_id: str) -> UserInDB | None:
        doc = await self.collection.find_one({"user_id": user_id})
        return _to_user(doc)

    async def find_by_google_sub(self, sub: str) -> UserInDB | None:
        doc = await self.collection.find_one({"google_sub": sub})
        return _to_user(doc)

    async def create(
        self,
        email: str,
        *,
        password_hash: str | None,
        google_sub: str | None = None,
        role: str = "user",
    ) -> UserInDB:
        doc = {
            "user_id": _new_user_id(),
            "email": email,
            "role": role,
            "password_hash": password_hash,
            "google_sub": google_sub,
            "created_at": datetime.now(timezone.utc),
            "plan": None,
            "subscription_status": None,
            "polar_customer_id": None,
            "polar_subscription_id": None,
            "current_period_end": None,
        }
        await self.collection.insert_one(doc)  # DuplicateKeyError → 409 upstream
        doc.pop("_id", None)
        return UserInDB(**doc)

    async def set_google_sub(self, user_id: str, sub: str) -> None:
        await self.collection.update_one(
            {"user_id": user_id}, {"$set": {"google_sub": sub}}
        )

    async def update_subscription(self, user_id: str, fields: dict) -> None:
        updates = {
            key: value for key, value in fields.items() if key in _SUBSCRIPTION_FIELDS
        }
        if not updates:
            return
        await self.collection.update_one({"user_id": user_id}, {"$set": updates})

    async def upsert(self, email: str, password_hash: str) -> None:
        """Superadmin seed — unchanged semantics, now writes role + user_id on insert."""
        await self.collection.update_one(
            {"email": email},
            {
                "$set": {"password_hash": password_hash, "role": "superadmin"},
                "$setOnInsert": {
                    "user_id": _new_user_id(),
                    "email": email,
                    "created_at": datetime.now(timezone.utc),
                },
            },
            upsert=True,
        )
        # $setOnInsert only runs on first insert; existing seed rows need a user_id too.
        await self.collection.update_one(
            {"email": email, "user_id": {"$exists": False}},
            {"$set": {"user_id": _new_user_id()}},
        )
