import secrets
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.company import Company


class CompanyRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["companies"]

    async def create(self, name: str, owner_id: str) -> Company:
        doc = {
            "company_id": f"cmp_{secrets.token_hex(4)}",
            "name": name,
            "owner_id": owner_id,
            "created_at": datetime.now(timezone.utc),
            "suggested_questions": [],
        }
        await self.collection.insert_one(doc)
        return Company(**doc)

    async def find_by_company_id(self, company_id: str) -> Company | None:
        doc = await self.collection.find_one({"company_id": company_id})
        return Company(**doc) if doc else None

    async def list_all(self) -> list[Company]:
        docs = await self.collection.find().sort("created_at", -1).to_list(None)
        return [Company(**doc) for doc in docs]

    async def list_by_owner(self, owner_id: str) -> list[Company]:
        docs = (
            await self.collection.find({"owner_id": owner_id})
            .sort("created_at", -1)
            .to_list(None)
        )
        return [Company(**doc) for doc in docs]

    async def count_by_owner(self, owner_id: str) -> int:
        return await self.collection.count_documents({"owner_id": owner_id})

    async def replace_suggested_questions(
        self, company_id: str, questions: list[str]
    ) -> Company | None:
        doc = await self.collection.find_one_and_update(
            {"company_id": company_id},
            {"$set": {"suggested_questions": questions}},
            return_document=True,
        )
        return Company(**doc) if doc else None
