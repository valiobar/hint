from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from fastapi.concurrency import run_in_threadpool

from app.config import get_settings


class VectorRepository:
    def __init__(self, client: ClientAPI):
        settings = get_settings()
        self._client = client
        self._embedding_fn = OpenAIEmbeddingFunction(
            api_key=settings.openai_api_key,
            model_name=settings.embedding_model,
        )

    def _collection(self, company_id: str) -> Collection:
        return self._client.get_or_create_collection(
            name=f"kb_{company_id}",
            embedding_function=self._embedding_fn,
            metadata={"hnsw:space": "cosine"},
        )

    async def add_chunks(
        self,
        company_id: str,
        ids: list[str],
        texts: list[str],
        metadatas: list[dict[str, str | int]],
    ) -> None:
        collection = await run_in_threadpool(self._collection, company_id)
        await run_in_threadpool(
            collection.upsert, ids=ids, documents=texts, metadatas=metadatas
        )

    async def query(self, company_id: str, text: str, k: int) -> dict:
        collection = await run_in_threadpool(self._collection, company_id)
        count = await run_in_threadpool(collection.count)
        if count == 0:
            return {"documents": [[]], "metadatas": [[]], "distances": [[]]}
        return await run_in_threadpool(
            collection.query, query_texts=[text], n_results=min(k, count)
        )

    async def delete_document_chunks(
        self, company_id: str, document_id: str
    ) -> None:
        collection = await run_in_threadpool(self._collection, company_id)
        await run_in_threadpool(
            collection.delete, where={"document_id": document_id}
        )

    async def count(self, company_id: str) -> int:
        collection = await run_in_threadpool(self._collection, company_id)
        return await run_in_threadpool(collection.count)
