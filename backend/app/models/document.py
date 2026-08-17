from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

DocumentStatus = Literal["processing", "ready", "failed"]
SourceType = Literal["file", "url"]


class DocumentMeta(BaseModel):
    document_id: str  # "doc_a1b2c3d4e5f6"
    company_id: str
    filename: str  # for URL sources: page <title> or the URL itself
    size_bytes: int
    chunk_count: int = 0
    status: DocumentStatus = "processing"
    source_type: SourceType = "file"
    source_url: str | None = None
    error: str | None = None
    created_at: datetime


class IngestUrlsRequest(BaseModel):
    urls: list[HttpUrl] = Field(min_length=1, max_length=20)
