import secrets
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.company import Company


class CompanyRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["companies"]

    async def create(self, name: str) -> Company:
        doc = {
            "company_id": f"cmp_{secrets.token_hex(4)}",
            "name": name,
            "created_at": datetime.now(timezone.utc),
        }
        await self.collection.insert_one(doc)
        return Company(**doc)

    async def find_by_company_id(self, company_id: str) -> Company | None:
        doc = await self.collection.find_one({"company_id": company_id})
        return Company(**doc) if doc else None

    async def list_all(self) -> list[Company]:
        docs = await self.collection.find().sort("created_at", -1).to_list(None)
        return [Company(**doc) for doc in docs]
