from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.usage import UsageKind


class UsageRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["usage_events"]

    async def record(
        self,
        company_id: str,
        owner_id: str,
        kind: UsageKind,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        billable_usd: float,
        price_tier: str,
    ) -> None:
        await self.collection.insert_one(
            {
                "company_id": company_id,
                "owner_id": owner_id,
                "kind": kind,
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": cost_usd,
                "billable_usd": billable_usd,
                "price_tier": price_tier,  # "peak" | "offpeak" | "flat" (auditable)
                "created_at": datetime.now(timezone.utc),
            }
        )

    async def total_billable(
        self, owner_id: str, start: datetime, end: datetime
    ) -> float:
        cursor = self.collection.aggregate(
            [
                {
                    "$match": {
                        "owner_id": owner_id,
                        "created_at": {"$gte": start, "$lte": end},
                    }
                },
                {"$group": {"_id": None, "billable": {"$sum": "$billable_usd"}}},
            ]
        )
        docs = [doc async for doc in cursor]
        return float(docs[0]["billable"]) if docs else 0.0
