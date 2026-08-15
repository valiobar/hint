from app.models.document import DocumentMeta
from app.repositories.document_repo import DocumentRepository
from app.repositories.vector_repo import VectorRepository
from app.services.text_extraction import build_splitter, extract_text

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024


class FileTooLargeError(ValueError):
    pass


class IngestionService:
    def __init__(self, doc_repo: DocumentRepository, vector_repo: VectorRepository):
        self.doc_repo = doc_repo
        self.vector_repo = vector_repo
        self.splitter = build_splitter()

    async def ingest_file(
        self, company_id: str, filename: str, raw: bytes
    ) -> DocumentMeta:
        if len(raw) > MAX_FILE_SIZE_BYTES:
            raise FileTooLargeError(f"{filename} exceeds 10 MB limit")

        doc = await self.doc_repo.create(company_id, filename, len(raw))
        try:
            text = extract_text(raw, filename)
            chunks = self.splitter.split_text(text)
            await self.vector_repo.add_chunks(
                company_id=company_id,
                ids=[f"{doc.document_id}:{i}" for i in range(len(chunks))],
                texts=chunks,
                metadatas=[
                    {
                        "document_id": doc.document_id,
                        "filename": filename,
                        "chunk_index": i,
                    }
                    for i in range(len(chunks))
                ],
            )
            await self.doc_repo.mark_ready(doc.document_id, chunk_count=len(chunks))
        except Exception as exc:
            await self.doc_repo.mark_failed(doc.document_id, error=str(exc))
        refreshed = await self.doc_repo.find_by_document_id(doc.document_id)
        assert refreshed is not None
        return refreshed

    async def delete_document(self, company_id: str, document_id: str) -> bool:
        doc = await self.doc_repo.find_by_document_id(document_id)
        if doc is None or doc.company_id != company_id:
            return False
        await self.vector_repo.delete_document_chunks(company_id, document_id)
        return await self.doc_repo.delete(document_id)
