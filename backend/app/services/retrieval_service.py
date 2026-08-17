from app.models.retrieval import Chunk
from app.repositories.vector_repo import VectorRepository


class RetrievalService:
    def __init__(self, vector_repo: VectorRepository):
        self.vector_repo = vector_repo

    async def retrieve(
        self, company_id: str, query: str, k: int = 5
    ) -> list[Chunk]:
        res = await self.vector_repo.query(company_id, query, k)
        documents = res["documents"][0] or []
        metadatas = res["metadatas"][0] or []
        distances = res["distances"][0] or []
        return [
            Chunk(
                text=text,
                filename=str(meta["filename"]),
                source_url=(
                    str(meta["source_url"]) if meta.get("source_url") else None
                ),
                score=score,
            )
            for text, meta, score in zip(documents, metadatas, distances)
        ]
