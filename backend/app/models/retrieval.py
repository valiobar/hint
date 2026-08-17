from pydantic import BaseModel, Field


class Chunk(BaseModel):
    text: str
    filename: str
    source_url: str | None = None
    score: float  # cosine distance; lower = more similar


class RetrieveRequest(BaseModel):
    company_id: str
    query: str = Field(min_length=1, max_length=1000)
    k: int = Field(default=5, ge=1, le=20)


class RetrieveResponse(BaseModel):
    chunks: list[Chunk]
