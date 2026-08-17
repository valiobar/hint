from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.models.document import IngestUrlsRequest
from app.models.retrieval import Chunk
from app.services.ingestion_service import IngestionService
from app.services.page_extraction import extract_page
from app.services.text_extraction import EmptyDocumentError
from app.services.url_fetcher import FetchedPage, UrlFetchError

URL = "https://support.example.com/reset-password"
HTML = (
    b"<html><head><title>Reset Password</title></head>"
    b"<body><nav>Home | Pricing</nav><main><article>"
    b"<h1>Reset Password</h1>"
    b"<p>Step 1: open settings and choose reset password "
    b"from the account menu on this page.</p>"
    b"<p>Step 2: confirm the email address for the account.</p>"
    b"<p>Step 3: choose a new password you have not used before.</p>"
    b"</article></main><footer>Copyright 2026</footer></body></html>"
)


@pytest.mark.asyncio
async def test_ingest_url_success(
    monkeypatch, fake_doc_repo, fake_vector_repo
) -> None:
    monkeypatch.setattr(
        "app.services.ingestion_service.fetch_page",
        AsyncMock(
            return_value=FetchedPage(
                raw=HTML, content_type="text/html", final_url=URL
            )
        ),
    )
    doc = await IngestionService(fake_doc_repo, fake_vector_repo).ingest_url(
        "cmp_1", URL
    )
    assert doc.status == "ready"
    assert doc.source_type == "url"
    assert doc.source_url == URL
    assert doc.filename == "Reset Password"
    assert fake_vector_repo.added[0]["metadatas"][0]["source_url"] == URL


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error",
    [
        "Failed to fetch",
        "Unsupported content type: application/pdf",
    ],
)
async def test_ingest_url_records_fetch_errors(
    monkeypatch, fake_doc_repo, fake_vector_repo, error: str
) -> None:
    monkeypatch.setattr(
        "app.services.ingestion_service.fetch_page",
        AsyncMock(side_effect=UrlFetchError(error)),
    )
    doc = await IngestionService(fake_doc_repo, fake_vector_repo).ingest_url(
        "cmp_1", URL
    )
    assert doc.status == "failed"
    assert error in (doc.error or "")
    assert fake_vector_repo.added == []


def test_extract_page_html_plain_and_empty(monkeypatch) -> None:
    page = extract_page(HTML, "text/html", URL)
    assert page.title == "Reset Password"
    assert "Step 1" in page.text
    assert "Home | Pricing" not in page.text
    assert "Copyright 2026" not in page.text

    monkeypatch.setattr(
        "app.services.page_extraction.trafilatura.extract",
        lambda *args, **kwargs: None,
    )
    fallback = extract_page(HTML, "text/html", URL)
    assert "Step 1" in fallback.text
    assert fallback.title == "Reset Password"

    assert extract_page(b"plain body", "text/plain", URL).text == "plain body"
    with pytest.raises(EmptyDocumentError):
        extract_page(b"   ", "text/plain", URL)


@pytest.mark.parametrize(
    "payload",
    [{}, {"urls": []}, {"urls": ["not-a-url"]}],
    ids=["missing", "empty", "not-a-url"],
)
def test_from_url_payload_rejected(payload: dict) -> None:
    with pytest.raises(ValidationError):
        IngestUrlsRequest.model_validate(payload)


def test_chat_sources_prefer_url_and_dedupe() -> None:
    chunks = [
        Chunk(text="a", filename="Reset Password", source_url=URL, score=0.1),
        Chunk(text="a2", filename="Reset Password", source_url=URL, score=0.15),
        Chunk(text="b", filename="manual.pdf", source_url=None, score=0.2),
    ]
    sources = list(dict.fromkeys(c.source_url or c.filename for c in chunks))
    assert sources == [URL, "manual.pdf"]
