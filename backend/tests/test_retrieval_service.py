import pytest

from app.services.retrieval_service import RetrievalService


@pytest.mark.asyncio
async def test_retrieve_maps_chroma_response_to_chunks(fake_vector_repo) -> None:
    fake_vector_repo.query_result = {
        "documents": [["Export reports from Settings → Export."]],
        "metadatas": [[{"filename": "user-manual.pdf", "document_id": "doc_1"}]],
        "distances": [[0.31]],
    }
    svc = RetrievalService(fake_vector_repo)
    chunks = await svc.retrieve("cmp_x", "how do I export?", k=3)
    assert len(chunks) == 1
    assert chunks[0].text == "Export reports from Settings → Export."
    assert chunks[0].filename == "user-manual.pdf"
    assert chunks[0].score == 0.31


@pytest.mark.asyncio
async def test_retrieve_returns_empty_for_empty_collection(fake_vector_repo) -> None:
    svc = RetrievalService(fake_vector_repo)
    chunks = await svc.retrieve("cmp_x", "anything", k=5)
    assert chunks == []
