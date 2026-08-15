from datetime import datetime, timezone

import pytest

from app.models.document import DocumentMeta


@pytest.fixture
def fake_doc_repo() -> "FakeDocumentRepository":
    return FakeDocumentRepository()


@pytest.fixture
def fake_vector_repo() -> "FakeVectorRepository":
    return FakeVectorRepository()


class FakeDocumentRepository:
    def __init__(self) -> None:
        self.docs: dict[str, DocumentMeta] = {}

    async def create(
        self, company_id: str, filename: str, size_bytes: int
    ) -> DocumentMeta:
        doc = DocumentMeta(
            document_id=f"doc_{len(self.docs)}",
            company_id=company_id,
            filename=filename,
            size_bytes=size_bytes,
            created_at=datetime.now(timezone.utc),
        )
        self.docs[doc.document_id] = doc
        return doc

    async def mark_ready(self, document_id: str, chunk_count: int) -> None:
        doc = self.docs[document_id]
        self.docs[document_id] = doc.model_copy(
            update={"status": "ready", "chunk_count": chunk_count}
        )

    async def mark_failed(self, document_id: str, error: str) -> None:
        doc = self.docs[document_id]
        self.docs[document_id] = doc.model_copy(
            update={"status": "failed", "error": error[:500]}
        )

    async def find_by_document_id(self, document_id: str) -> DocumentMeta | None:
        return self.docs.get(document_id)

    async def list_by_company(self, company_id: str) -> list[DocumentMeta]:
        return [d for d in self.docs.values() if d.company_id == company_id]

    async def delete(self, document_id: str) -> bool:
        if document_id not in self.docs:
            return False
        del self.docs[document_id]
        return True


class FakeVectorRepository:
    def __init__(self) -> None:
        self.added: list[dict] = []
        self.deleted: list[tuple[str, str]] = []
        self.query_result: dict = {
            "documents": [[]],
            "metadatas": [[]],
            "distances": [[]],
        }

    async def add_chunks(
        self,
        company_id: str,
        ids: list[str],
        texts: list[str],
        metadatas: list[dict],
    ) -> None:
        self.added.append(
            {
                "company_id": company_id,
                "ids": ids,
                "texts": texts,
                "metadatas": metadatas,
            }
        )

    async def query(self, company_id: str, text: str, k: int) -> dict:
        return self.query_result

    async def delete_document_chunks(
        self, company_id: str, document_id: str
    ) -> None:
        self.deleted.append((company_id, document_id))
