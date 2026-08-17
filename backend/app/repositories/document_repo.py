import secrets
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.document import DocumentMeta, SourceType


class DocumentRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["documents"]

    async def create(
        self,
        company_id: str,
        filename: str,
        size_bytes: int,
        source_type: SourceType = "file",
        source_url: str | None = None,
    ) -> DocumentMeta:
        doc = {
            "document_id": f"doc_{secrets.token_hex(6)}",
            "company_id": company_id,
            "filename": filename,
            "size_bytes": size_bytes,
            "chunk_count": 0,
            "status": "processing",
            "source_type": source_type,
            "source_url": source_url,
            "error": None,
            "created_at": datetime.now(timezone.utc),
        }
        await self.collection.insert_one(doc)
        return DocumentMeta(**doc)

    async def mark_ready(self, document_id: str, chunk_count: int) -> None:
        await self.collection.update_one(
            {"document_id": document_id},
            {"$set": {"status": "ready", "chunk_count": chunk_count}},
        )

    async def mark_failed(self, document_id: str, error: str) -> None:
        await self.collection.update_one(
            {"document_id": document_id},
            {"$set": {"status": "failed", "error": error[:500]}},
        )

    async def find_by_document_id(self, document_id: str) -> DocumentMeta | None:
        doc = await self.collection.find_one({"document_id": document_id})
        return DocumentMeta(**doc) if doc else None

    async def list_by_company(self, company_id: str) -> list[DocumentMeta]:
        docs = await (
            self.collection.find({"company_id": company_id})
            .sort("created_at", -1)
            .to_list(None)
        )
        return [DocumentMeta(**doc) for doc in docs]

    async def delete(self, document_id: str) -> bool:
        result = await self.collection.delete_one({"document_id": document_id})
        return result.deleted_count == 1
