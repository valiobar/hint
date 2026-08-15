from datetime import datetime
from typing import Literal

from pydantic import BaseModel

DocumentStatus = Literal["processing", "ready", "failed"]


class DocumentMeta(BaseModel):
    document_id: str  # "doc_a1b2c3d4e5f6"
    company_id: str
    filename: str
    size_bytes: int
    chunk_count: int = 0
    status: DocumentStatus = "processing"
    error: str | None = None
    created_at: datetime
