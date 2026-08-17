import pytest

from app.services.retrieval_service import RetrievalService


@pytest.mark.asyncio
async def test_retrieve_maps_chroma_response_to_chunks(fake_vector_repo) -> None:
    fake_vector_repo.query_result = {
        "documents": [
            [
                "Export reports from Settings → Export.",
                "Reset your password from Account.",
            ]
        ],
        "metadatas": [
            [
                {"filename": "user-manual.pdf", "document_id": "doc_1"},
                {
                    "filename": "Reset Password",
                    "document_id": "doc_2",
                    "source_url": "https://support.example.com/reset",
                },
            ]
        ],
        "distances": [[0.31, 0.22]],
    }
    svc = RetrievalService(fake_vector_repo)
    chunks = await svc.retrieve("cmp_x", "how do I export?", k=3)
    assert len(chunks) == 2
    assert chunks[0].text == "Export reports from Settings → Export."
    assert chunks[0].filename == "user-manual.pdf"
    assert chunks[0].source_url is None
    assert chunks[0].score == 0.31
    assert chunks[1].filename == "Reset Password"
    assert chunks[1].source_url == "https://support.example.com/reset"
    assert chunks[1].score == 0.22


@pytest.mark.asyncio
async def test_retrieve_returns_empty_for_empty_collection(fake_vector_repo) -> None:
    svc = RetrievalService(fake_vector_repo)
    chunks = await svc.retrieve("cmp_x", "anything", k=5)
    assert chunks == []
