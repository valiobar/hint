from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import UserInDB


class UserRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["users"]

    async def find_by_email(self, email: str) -> UserInDB | None:
        doc = await self.collection.find_one({"email": email})
        return UserInDB(**doc) if doc else None

    async def upsert(self, email: str, password_hash: str) -> None:
        """Idempotent seed: re-hashes on every boot so rotating ADMIN_PASSWORD works."""
        await self.collection.update_one(
            {"email": email},
            {
                "$set": {"password_hash": password_hash},
                "$setOnInsert": {
                    "email": email,
                    "created_at": datetime.now(timezone.utc),
                },
            },
            upsert=True,
        )
