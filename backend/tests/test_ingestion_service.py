import pytest

from app.services.ingestion_service import IngestionService


@pytest.mark.asyncio
async def test_ingest_marks_ready_with_deterministic_chunk_ids(
    fake_doc_repo,
    fake_vector_repo,
) -> None:
    svc = IngestionService(fake_doc_repo, fake_vector_repo)
    doc = await svc.ingest_file(
        "cmp_x", "guide.md", b"# Title\n" + b"word " * 500
    )
    assert doc.status == "ready"
    assert doc.chunk_count > 1
    call = fake_vector_repo.added[0]
    assert call["ids"][0] == f"{doc.document_id}:0"
    assert call["metadatas"][0] == {
        "document_id": doc.document_id,
        "filename": "guide.md",
        "chunk_index": 0,
    }


@pytest.mark.asyncio
async def test_ingest_failure_marks_failed_and_skips_chroma(
    fake_doc_repo,
    fake_vector_repo,
) -> None:
    svc = IngestionService(fake_doc_repo, fake_vector_repo)
    doc = await svc.ingest_file(
        "cmp_x", "scan.pdf", b"%PDF-1.4 (no text layer)"
    )
    assert doc.status == "failed"
    assert doc.error
    assert fake_vector_repo.added == []


@pytest.mark.asyncio
async def test_delete_removes_chunks_then_metadata(
    fake_doc_repo,
    fake_vector_repo,
) -> None:
    svc = IngestionService(fake_doc_repo, fake_vector_repo)
    doc = await svc.ingest_file("cmp_x", "guide.md", b"hello world content")
    assert doc.status == "ready"

    deleted = await svc.delete_document("cmp_x", doc.document_id)
    assert deleted is True
    assert fake_vector_repo.deleted == [("cmp_x", doc.document_id)]
    assert doc.document_id not in fake_doc_repo.docs


@pytest.mark.asyncio
async def test_delete_rejects_cross_company(
    fake_doc_repo,
    fake_vector_repo,
) -> None:
    svc = IngestionService(fake_doc_repo, fake_vector_repo)
    doc = await svc.ingest_file("cmp_x", "guide.md", b"hello world content")

    deleted = await svc.delete_document("cmp_other", doc.document_id)
    assert deleted is False
    assert fake_vector_repo.deleted == []
    assert doc.document_id in fake_doc_repo.docs
