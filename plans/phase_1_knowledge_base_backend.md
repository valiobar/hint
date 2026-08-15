# Phase 1 — Knowledge Base Backend (Detailed Implementation Plan)

> Parent plan: `plans/hintora_poc_implementation.md` (Phase 1, Steps 1.1–1.3).
> Docs reviewed: `docs/01-architecture-overview.md` (compose map, env vars, backend
> layering, Phase 0 status).
> Goal: companies CRUD + document ingestion (parse → chunk → embed → Chroma) +
> retrieval, all curl-testable. No AI/chat yet — that is Phase 3.

## Overview

Phase 1 turns the empty backend skeleton from Phase 0 into a working knowledge base:

- **Companies**: `POST /api/v1/companies` (name → generated `cmp_xxxxxxxx` slug),
  `GET /api/v1/companies`, `GET /api/v1/companies/{company_id}`. Unique Mongo index on
  `company_id`, created at startup.
- **Documents**: `POST /api/v1/companies/{company_id}/documents` accepts multiple files
  (pdf / md / txt / html) as multipart. Each file is parsed, chunked
  (`RecursiveCharacterTextSplitter`, ~800 chars / 150 overlap), embedded with OpenAI,
  and upserted into per-company Chroma collection `kb_{company_id}` with metadata
  `{document_id, filename, chunk_index}`. Metadata (filename, size, chunk_count,
  status, error) lives in Mongo `documents`. List and delete endpoints included;
  delete removes both the Mongo record and the Chroma chunks (metadata filter).
- **Retrieval**: `RetrievalService.retrieve(company_id, query, k=5)` returning
  `{text, filename, score}` chunks, exposed via a debug endpoint `POST /api/v1/retrieve`
  so RAG quality can be verified with curl before any LLM code exists (Phase 3 reuses
  this service unchanged).

Everything follows the Phase 0 layering: `routes/ → services/ → repositories/ →
models/`, with `db/mongo.py` / `db/chroma.py` providing clients. Chroma's Python client
is synchronous, so every Chroma call goes through `run_in_threadpool` (same pattern as
`db/chroma.ping()`).

**Exit criteria** (from the parent plan): with the stack up and `OPENAI_API_KEY` set,
`curl` can create a company, upload a PDF, see it become `ready`, and get relevant
chunks back from `/retrieve`.

## Pros / Cons

**Pros**

- Ingestion and retrieval land before any AI code, so RAG quality is measurable with
  curl and the Phase 3 chat graph plugs into an already-proven `RetrievalService`.
- Per-company Chroma collections (`kb_{company_id}`) give hard tenant isolation — no
  query-time filter can leak another company's chunks.
- Chunk IDs are deterministic (`{document_id}:{chunk_index}`), so re-ingestion or
  deletion is precise, and `DELETE` uses a simple metadata filter.
- Per-file status (`processing` / `ready` / `failed` + error reason) means one bad file
  in a multi-file upload never fails the batch — exactly what the admin UI (Phase 2)
  needs to render.
- HTML text extraction uses a small stdlib `HTMLParser` subclass instead of adding
  `html2text`/`beautifulsoup4` — no new runtime dependency for a POC-grade need.

**Cons / accepted trade-offs**

- Ingestion is synchronous within the request (no background queue). A large PDF blocks
  the upload response for seconds. Fine for a POC; the `status` field already supports
  moving to background processing later without an API change.
- Embeddings are generated inside Chroma's `OpenAIEmbeddingFunction` (blocking, run in a
  threadpool) rather than via async OpenAI calls — simpler, at the cost of thread usage.
- `POST /api/v1/retrieve` is an unauthenticated debug endpoint; acceptable for the POC
  (whole API is open), revisited in the Phase 6 hardening pass.
- No OCR: scanned/image PDFs yield empty text and are marked `failed` (documented edge
  case in the parent plan).
- Score returned is the raw Chroma cosine **distance** (lower = more similar), not a
  normalized similarity — good enough for debugging and Phase 3 thresholds.

## Current State Analysis

### ✅ Existing (Phase 0)

- Compose stack boots; `/health` verifies Mongo + Chroma connectivity.
- `backend/app/config.py` — `Settings` with `openai_api_key`, `embedding_model`,
  Mongo/Chroma settings; `get_settings()` cached accessor.
- `backend/app/db/mongo.py` — module-level Motor client, `get_db()`, `ping()`.
- `backend/app/db/chroma.py` — module-level `chromadb.HttpClient`, `get_chroma()`,
  `ping()` via `run_in_threadpool`.
- `backend/app/main.py` — lifespan wiring, CORS, `/health`. No business routers yet.
- Empty packages: `models/`, `repositories/`, `services/`, `routes/`, `ai/`, `tests/`.
- `requirements.txt` already ships `langchain` (brings `langchain-text-splitters`),
  `chromadb`, `pypdf`, `python-multipart` — no runtime dependency changes needed.

### ❌ Missing Components (all of Phase 1)

- ✅ `models/company.py`, `repositories/company_repo.py` + startup index bootstrap — Step 1
- ✅ `services/company_service.py`, `routes/companies.py`, deps wiring — Step 2
- ✅ `models/document.py`, `repositories/document_repo.py` — Step 3
- ✅ `repositories/vector_repo.py` (Chroma adapter + OpenAI embeddings) — Step 4
- ✅ `services/text_extraction.py` (pdf/md/txt/html → text, chunker) — Step 5
- ✅ `services/ingestion_service.py` — Step 6
- ✅ `routes/documents.py` (upload / list / delete) — Step 7
- ✅ `services/retrieval_service.py`, `routes/retrieve.py` — Step 8
- ✅ Unit tests + `requirements-dev.txt` — Step 9
- ✅ E2E curl verification of exit criteria — Step 10
- ✅ `docs/02-backend.md` + overview/README updates — Step 11

---

## Implementation Steps

### ✅ Step 1: Company model + repository + index bootstrap

**File(s)**: `backend/app/models/company.py`, `backend/app/repositories/company_repo.py`,
`backend/app/db/mongo.py` (add `ensure_indexes`), `backend/app/main.py` (call it in lifespan)

**Changes**:
- `Company` response model (`company_id`, `name`, `created_at`) and `CompanyCreate`
  request model (`name`, 1–100 chars).
- `CompanyRepository` with `create`, `find_by_company_id`, `list_all` (newest first).
- `ensure_indexes(db)` creates the unique index on `companies.company_id` plus the
  Step 3 `documents` indexes; called once in `main.py` lifespan right after
  `mongo.connect()` (idempotent — `create_index` is a no-op when the index exists).

**Pseudo-code**:

```python
# backend/app/models/company.py
from datetime import datetime

from pydantic import BaseModel, Field


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class Company(BaseModel):
    company_id: str  # short slug, e.g. "cmp_a1b2c3d4"
    name: str
    created_at: datetime
```

```python
# backend/app/repositories/company_repo.py
import secrets
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.company import Company


class CompanyRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["companies"]

    async def create(self, name: str) -> Company:
        doc = {
            "company_id": f"cmp_{secrets.token_hex(4)}",
            "name": name,
            "created_at": datetime.now(timezone.utc),
        }
        await self.collection.insert_one(doc)
        return Company(**doc)

    async def find_by_company_id(self, company_id: str) -> Company | None:
        doc = await self.collection.find_one({"company_id": company_id})
        return Company(**doc) if doc else None

    async def list_all(self) -> list[Company]:
        docs = await self.collection.find().sort("created_at", -1).to_list(None)
        return [Company(**doc) for doc in docs]
```

```python
# backend/app/db/mongo.py — add
async def ensure_indexes() -> None:
    db = get_db()
    await db["companies"].create_index("company_id", unique=True)
    await db["documents"].create_index("document_id", unique=True)
    await db["documents"].create_index("company_id")

# backend/app/main.py — lifespan becomes
@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo.connect()
    chroma.connect()
    await mongo.ensure_indexes()
    yield
    mongo.close()
```

### ✅ Step 2: Company service + routes + dependency wiring

**File(s)**: `backend/app/services/company_service.py`, `backend/app/routes/companies.py`,
`backend/app/routes/deps.py`, `backend/app/main.py` (register router)

**Changes**:
- `routes/deps.py` centralizes FastAPI `Depends` factories for repositories and
  services (reused by Steps 7–8) plus the shared `require_company` guard — every
  company-scoped endpoint 404s early on an unknown `company_id`.
- `CompanyService` is a thin pass-through for now (business rules land here later).
- Router registered in `main.py` under `/api/v1`, with `response_model` on every
  endpoint (performance rule).

**Pseudo-code**:

```python
# backend/app/routes/deps.py
from fastapi import Depends, HTTPException

from app.db.chroma import get_chroma
from app.db.mongo import get_db
from app.models.company import Company
from app.repositories.company_repo import CompanyRepository
from app.services.company_service import CompanyService


def get_company_repo() -> CompanyRepository:
    return CompanyRepository(get_db())


def get_company_service(
    repo: CompanyRepository = Depends(get_company_repo),
) -> CompanyService:
    return CompanyService(repo)


async def require_company(
    company_id: str,
    repo: CompanyRepository = Depends(get_company_repo),
) -> Company:
    company = await repo.find_by_company_id(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    return company
```

```python
# backend/app/services/company_service.py
from app.models.company import Company
from app.repositories.company_repo import CompanyRepository


class CompanyService:
    def __init__(self, repo: CompanyRepository):
        self.repo = repo

    async def create_company(self, name: str) -> Company:
        return await self.repo.create(name.strip())

    async def list_companies(self) -> list[Company]:
        return await self.repo.list_all()

    async def get_company(self, company_id: str) -> Company | None:
        return await self.repo.find_by_company_id(company_id)
```

```python
# backend/app/routes/companies.py
from fastapi import APIRouter, Depends, HTTPException

from app.models.company import Company, CompanyCreate
from app.routes.deps import get_company_service
from app.services.company_service import CompanyService

router = APIRouter(prefix="/companies", tags=["companies"])


@router.post("", response_model=Company, status_code=201)
async def create_company(
    body: CompanyCreate,
    svc: CompanyService = Depends(get_company_service),
) -> Company:
    return await svc.create_company(body.name)


@router.get("", response_model=list[Company])
async def list_companies(
    svc: CompanyService = Depends(get_company_service),
) -> list[Company]:
    return await svc.list_companies()


@router.get("/{company_id}", response_model=Company)
async def get_company(
    company_id: str,
    svc: CompanyService = Depends(get_company_service),
) -> Company:
    company = await svc.get_company(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    return company
```

```python
# backend/app/main.py — after middleware
from app.routes.companies import router as companies_router

app.include_router(companies_router, prefix="/api/v1")
```

### ✅ Step 3: Document model + repository

**File(s)**: `backend/app/models/document.py`, `backend/app/repositories/document_repo.py`

**Changes**:
- `DocumentMeta` with lifecycle status: `processing` → `ready` | `failed` (+ `error`
  reason for the admin UI). `document_id` is a generated `doc_xxxxxxxxxxxx` slug.
- Repository: `create` (status `processing`), `mark_ready(chunk_count)`,
  `mark_failed(error)`, `list_by_company`, `find_by_document_id`, `delete`.
- Indexes already created in Step 1's `ensure_indexes`.

**Pseudo-code**:

```python
# backend/app/models/document.py
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
```

```python
# backend/app/repositories/document_repo.py
import secrets
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.document import DocumentMeta


class DocumentRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["documents"]

    async def create(self, company_id: str, filename: str, size_bytes: int) -> DocumentMeta:
        doc = {
            "document_id": f"doc_{secrets.token_hex(6)}",
            "company_id": company_id,
            "filename": filename,
            "size_bytes": size_bytes,
            "chunk_count": 0,
            "status": "processing",
            "error": None,
            "created_at": datetime.now(timezone.utc),
        }
        await self.collection.insert_one(doc)
        return DocumentMeta(**doc)

    async def mark_ready(self, document_id: str, chunk_count: int) -> None:
        await self.collection.update_one(
            {"document_id": document_id},
            {"$set": {"status": "ready", "chunk_count": chunk_count}},
        )

    async def mark_failed(self, document_id: str, error: str) -> None:
        await self.collection.update_one(
            {"document_id": document_id},
            {"$set": {"status": "failed", "error": error[:500]}},
        )

    async def find_by_document_id(self, document_id: str) -> DocumentMeta | None:
        doc = await self.collection.find_one({"document_id": document_id})
        return DocumentMeta(**doc) if doc else None

    async def list_by_company(self, company_id: str) -> list[DocumentMeta]:
        docs = await self.collection.find({"company_id": company_id}) \
            .sort("created_at", -1).to_list(None)
        return [DocumentMeta(**doc) for doc in docs]

    async def delete(self, document_id: str) -> bool:
        result = await self.collection.delete_one({"document_id": document_id})
        return result.deleted_count == 1
```

### ✅ Step 4: Vector repository — Chroma adapter with OpenAI embeddings

**File(s)**: `backend/app/repositories/vector_repo.py`

**Changes**:
- Adapter over the Chroma HTTP client: one collection per company (`kb_{company_id}`),
  cosine space, `OpenAIEmbeddingFunction` configured from settings.
- All Chroma calls wrapped in `run_in_threadpool` (sync client, async app).
- Public API: `add_chunks`, `query`, `delete_document_chunks`, `count` — no other layer
  ever touches the Chroma client directly.

**Pseudo-code**:

```python
# backend/app/repositories/vector_repo.py
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

    async def delete_document_chunks(self, company_id: str, document_id: str) -> None:
        collection = await run_in_threadpool(self._collection, company_id)
        await run_in_threadpool(collection.delete, where={"document_id": document_id})

    async def count(self, company_id: str) -> int:
        collection = await run_in_threadpool(self._collection, company_id)
        return await run_in_threadpool(collection.count)
```

```python
# backend/app/routes/deps.py — add
from app.repositories.vector_repo import VectorRepository


def get_vector_repo() -> VectorRepository:
    return VectorRepository(get_chroma())
```

### ✅ Step 5: Text extraction + chunking helpers

**File(s)**: `backend/app/services/text_extraction.py`

**Changes**:
- `extract_text(raw, filename)` dispatches on file extension: `pypdf` for PDF, UTF-8
  decode for md/txt, stdlib `HTMLParser`-based tag stripper for HTML (skips
  `<script>`/`<style>`; no new dependency — deviation from the parent plan's
  `html2text` mention, noted in Pros).
- `UnsupportedFileTypeError` / `EmptyDocumentError` custom exceptions so the ingestion
  service can map failures to precise `failed` reasons.
- `build_splitter()` returns the shared `RecursiveCharacterTextSplitter`
  (800 chars / 150 overlap, from the parent plan).

**Pseudo-code**:

```python
# backend/app/services/text_extraction.py
import io
from html.parser import HTMLParser
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

SUPPORTED_EXTENSIONS = {".pdf", ".md", ".txt", ".html", ".htm"}


class UnsupportedFileTypeError(ValueError):
    pass


class EmptyDocumentError(ValueError):
    pass


class _HtmlTextExtractor(HTMLParser):
    _SKIPPED_TAGS = {"script", "style"}

    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in self._SKIPPED_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIPPED_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0 and data.strip():
            self._parts.append(data.strip())

    def text(self) -> str:
        return "\n".join(self._parts)


def extract_text(raw: bytes, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFileTypeError(f"Unsupported file type: {suffix or 'none'}")

    if suffix == ".pdf":
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    elif suffix in {".html", ".htm"}:
        parser = _HtmlTextExtractor()
        parser.feed(raw.decode("utf-8", errors="replace"))
        text = parser.text()
    else:  # .md / .txt
        text = raw.decode("utf-8", errors="replace")

    if not text.strip():
        raise EmptyDocumentError("No extractable text (scanned PDF or empty file)")
    return text


def build_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
```

### ✅ Step 6: Ingestion service

**File(s)**: `backend/app/services/ingestion_service.py`

**Changes**:
- `ingest_file(company_id, filename, raw)` runs the full pipeline for one file:
  extract → chunk → Mongo `processing` record → Chroma upsert → `ready` (or `failed`
  with reason — the record survives so the admin UI can display the error).
- Deterministic chunk IDs `{document_id}:{chunk_index}` and metadata
  `{document_id, filename, chunk_index}` per the parent plan.
- `delete_document` removes Chroma chunks first, then the Mongo record (if Chroma
  deletion fails, metadata still points at the orphaned chunks for a retry).
- 10 MB per-file cap enforced here (single source of truth, not in the route).

**Pseudo-code**:

```python
# backend/app/services/ingestion_service.py
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

    async def ingest_file(self, company_id: str, filename: str, raw: bytes) -> DocumentMeta:
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
                    {"document_id": doc.document_id, "filename": filename, "chunk_index": i}
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
```

### ✅ Step 7: Documents routes — upload / list / delete

**File(s)**: `backend/app/routes/documents.py`, `backend/app/routes/deps.py` (add
factories), `backend/app/main.py` (register router)

**Changes**:
- `POST /api/v1/companies/{company_id}/documents` — multipart with repeated `files`
  field. Files are processed sequentially; per-file success/failure is reflected in each
  returned `DocumentMeta.status` (batch never 500s because one file is bad). Oversized
  files are rejected up front with 413.
- `GET /api/v1/companies/{company_id}/documents` — list, newest first.
- `DELETE /api/v1/companies/{company_id}/documents/{document_id}` — 204 or 404.
- All three depend on `require_company` (404 for unknown company) and on
  `require_openai_key` for upload (503 with an actionable message when
  `OPENAI_API_KEY` is empty — Phase 0 allowed booting without it).

**Pseudo-code**:

```python
# backend/app/routes/deps.py — add
from app.repositories.document_repo import DocumentRepository
from app.services.ingestion_service import IngestionService
from app.config import get_settings


def get_document_repo() -> DocumentRepository:
    return DocumentRepository(get_db())


def get_ingestion_service(
    doc_repo: DocumentRepository = Depends(get_document_repo),
    vector_repo: VectorRepository = Depends(get_vector_repo),
) -> IngestionService:
    return IngestionService(doc_repo, vector_repo)


def require_openai_key() -> None:
    if not get_settings().openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured; set it in .env and restart",
        )
```

```python
# backend/app/routes/documents.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app.models.company import Company
from app.models.document import DocumentMeta
from app.routes.deps import (
    get_document_repo,
    get_ingestion_service,
    require_company,
    require_openai_key,
)
from app.services.ingestion_service import MAX_FILE_SIZE_BYTES, IngestionService

router = APIRouter(prefix="/companies/{company_id}/documents", tags=["documents"])


@router.post("", response_model=list[DocumentMeta], status_code=201,
             dependencies=[Depends(require_openai_key)])
async def upload_documents(
    files: list[UploadFile],
    company: Company = Depends(require_company),
    svc: IngestionService = Depends(get_ingestion_service),
) -> list[DocumentMeta]:
    if not files:
        raise HTTPException(status_code=422, detail="No files provided")
    results: list[DocumentMeta] = []
    for file in files:
        raw = await file.read()
        if len(raw) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=413, detail=f"{file.filename} exceeds 10 MB")
        results.append(
            await svc.ingest_file(company.company_id, file.filename or "unnamed", raw)
        )
    return results


@router.get("", response_model=list[DocumentMeta])
async def list_documents(
    company: Company = Depends(require_company),
    repo=Depends(get_document_repo),
) -> list[DocumentMeta]:
    return await repo.list_by_company(company.company_id)


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    company: Company = Depends(require_company),
    svc: IngestionService = Depends(get_ingestion_service),
) -> None:
    deleted = await svc.delete_document(company.company_id, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Unknown document_id")
```

```python
# backend/app/main.py — add
from app.routes.documents import router as documents_router

app.include_router(documents_router, prefix="/api/v1")
```

### ✅ Step 8: Retrieval service + debug `/retrieve` endpoint

**File(s)**: `backend/app/services/retrieval_service.py`, `backend/app/models/retrieval.py`,
`backend/app/routes/retrieve.py`, `backend/app/main.py` (register router)

**Changes**:
- `RetrievalService.retrieve(company_id, query, k=5)` → `list[Chunk]` with
  `{text, filename, score}` (score = cosine distance, lower is closer). This is the
  exact interface Phase 3's chat graph and hint chain will consume.
- Debug endpoint `POST /api/v1/retrieve` guarded by `require_company` (company taken
  from the body, so the guard is invoked inside the handler) and `require_openai_key`
  (query embedding needs the key).
- Empty knowledge base returns `[]`, not an error (parent-plan edge case).

**Pseudo-code**:

```python
# backend/app/models/retrieval.py
from pydantic import BaseModel, Field


class Chunk(BaseModel):
    text: str
    filename: str
    score: float  # cosine distance; lower = more similar


class RetrieveRequest(BaseModel):
    company_id: str
    query: str = Field(min_length=1, max_length=1000)
    k: int = Field(default=5, ge=1, le=20)


class RetrieveResponse(BaseModel):
    chunks: list[Chunk]
```

```python
# backend/app/services/retrieval_service.py
from app.models.retrieval import Chunk
from app.repositories.vector_repo import VectorRepository


class RetrievalService:
    def __init__(self, vector_repo: VectorRepository):
        self.vector_repo = vector_repo

    async def retrieve(self, company_id: str, query: str, k: int = 5) -> list[Chunk]:
        res = await self.vector_repo.query(company_id, query, k)
        return [
            Chunk(text=text, filename=str(meta["filename"]), score=score)
            for text, meta, score in zip(
                res["documents"][0], res["metadatas"][0], res["distances"][0]
            )
        ]
```

```python
# backend/app/routes/retrieve.py
from fastapi import APIRouter, Depends, HTTPException

from app.models.retrieval import RetrieveRequest, RetrieveResponse
from app.routes.deps import (
    get_company_repo,
    get_retrieval_service,
    require_openai_key,
)
from app.services.retrieval_service import RetrievalService

router = APIRouter(tags=["retrieval"])


@router.post("/retrieve", response_model=RetrieveResponse,
             dependencies=[Depends(require_openai_key)])
async def retrieve(
    body: RetrieveRequest,
    svc: RetrievalService = Depends(get_retrieval_service),
    company_repo=Depends(get_company_repo),
) -> RetrieveResponse:
    if await company_repo.find_by_company_id(body.company_id) is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    chunks = await svc.retrieve(body.company_id, body.query, body.k)
    return RetrieveResponse(chunks=chunks)
```

```python
# backend/app/routes/deps.py — add
from app.services.retrieval_service import RetrievalService


def get_retrieval_service(
    vector_repo: VectorRepository = Depends(get_vector_repo),
) -> RetrievalService:
    return RetrievalService(vector_repo)

# backend/app/main.py — add
from app.routes.retrieve import router as retrieve_router

app.include_router(retrieve_router, prefix="/api/v1")
```

### ✅ Step 9: Unit tests + dev requirements

**File(s)**: `backend/requirements-dev.txt`, `backend/tests/test_text_extraction.py`,
`backend/tests/test_ingestion_service.py`, `backend/tests/test_retrieval_service.py`,
`backend/tests/conftest.py`

**Changes**:
- Dev-only deps (`pytest`, `pytest-asyncio`) in `requirements-dev.txt` — kept out of
  the Docker image.
- Pure-function tests for text extraction (txt/md passthrough, HTML tag + script
  stripping, unsupported extension, empty content) and chunker config.
- Service tests with in-memory fakes for `DocumentRepository` / `VectorRepository` —
  no Mongo/Chroma/network needed: happy path marks `ready` with correct chunk IDs and
  metadata; extraction failure marks `failed` and skips Chroma; delete removes chunks
  then metadata and rejects cross-company deletes; retrieval maps Chroma's nested
  response into `Chunk` objects and returns `[]` for an empty collection.
- Route-level behavior (404 guard, 413, 503-without-key) is covered by the curl
  checklist in Step 10 — no HTTP-level test harness in this phase.

**Pseudo-code**:

```txt
# backend/requirements-dev.txt
-r requirements.txt
pytest>=8,<9
pytest-asyncio>=0.24,<1
```

```python
# backend/tests/conftest.py
from app.models.document import DocumentMeta


class FakeDocumentRepository:
    def __init__(self) -> None:
        self.docs: dict[str, DocumentMeta] = {}

    async def create(self, company_id, filename, size_bytes) -> DocumentMeta:
        doc = DocumentMeta(document_id=f"doc_{len(self.docs)}", company_id=company_id,
                           filename=filename, size_bytes=size_bytes,
                           created_at=datetime.now(timezone.utc))
        self.docs[doc.document_id] = doc
        return doc

    async def mark_ready(self, document_id, chunk_count): ...
    async def mark_failed(self, document_id, error): ...
    # find_by_document_id / delete backed by self.docs


class FakeVectorRepository:
    def __init__(self) -> None:
        self.added: list[dict] = []
        self.query_result = {"documents": [[]], "metadatas": [[]], "distances": [[]]}

    async def add_chunks(self, company_id, ids, texts, metadatas):
        self.added.append({"company_id": company_id, "ids": ids,
                           "texts": texts, "metadatas": metadatas})

    async def query(self, company_id, text, k):
        return self.query_result

    async def delete_document_chunks(self, company_id, document_id): ...
```

```python
# backend/tests/test_text_extraction.py (essence)
def test_extracts_plain_and_markdown_text():
    assert extract_text(b"# Title\nBody", "guide.md") == "# Title\nBody"
    assert extract_text(b"hello", "notes.txt") == "hello"


def test_html_strips_tags_and_scripts():
    html = b"<html><script>var x;</script><h1>Docs</h1><p>Use export.</p></html>"
    text = extract_text(html, "page.html")
    assert "Docs" in text and "Use export." in text and "var x" not in text


def test_rejects_unsupported_and_empty():
    with pytest.raises(UnsupportedFileTypeError):
        extract_text(b"...", "image.png")
    with pytest.raises(EmptyDocumentError):
        extract_text(b"   ", "empty.txt")
```

```python
# backend/tests/test_ingestion_service.py (essence)
async def test_ingest_marks_ready_with_deterministic_chunk_ids():
    svc = IngestionService(fake_doc_repo, fake_vector_repo)
    doc = await svc.ingest_file("cmp_x", "guide.md", b"# Title\n" + b"word " * 500)
    assert doc.status == "ready" and doc.chunk_count > 1
    call = fake_vector_repo.added[0]
    assert call["ids"][0] == f"{doc.document_id}:0"
    assert call["metadatas"][0] == {"document_id": doc.document_id,
                                    "filename": "guide.md", "chunk_index": 0}


async def test_ingest_failure_marks_failed_and_skips_chroma():
    doc = await svc.ingest_file("cmp_x", "scan.pdf", b"%PDF-1.4 (no text layer)")
    assert doc.status == "failed" and doc.error
    assert fake_vector_repo.added == []
```

**Run**: `cd backend && pip install -r requirements-dev.txt && python -m pytest tests/ -v`

### ✅ Step 10: E2E verification against exit criteria (curl)

**File(s)**: none (verification only; commands land in `docs/02-backend.md` in Step 11)

**Changes**:
- With `OPENAI_API_KEY` set in `.env`, run the full flow against the compose stack and
  confirm every parent-plan exit criterion for Phase 1.

**Pseudo-code**:

```bash
docker compose up --build -d
curl -s localhost:8000/health                       # {"status":"ok",...}

# 1. create a company
curl -s -X POST localhost:8000/api/v1/companies \
  -H 'Content-Type: application/json' -d '{"name": "Acme Corp"}'
# → {"company_id":"cmp_1a2b3c4d","name":"Acme Corp","created_at":"..."}

# 2. upload documents (multi-file)
curl -s -X POST "localhost:8000/api/v1/companies/cmp_1a2b3c4d/documents" \
  -F "files=@user-manual.pdf" -F "files=@faq.md"
# → [{"document_id":"doc_...","status":"ready","chunk_count":42,...}, {...}]

# 3. list documents — both "ready"
curl -s "localhost:8000/api/v1/companies/cmp_1a2b3c4d/documents"

# 4. retrieve relevant chunks
curl -s -X POST localhost:8000/api/v1/retrieve \
  -H 'Content-Type: application/json' \
  -d '{"company_id": "cmp_1a2b3c4d", "query": "how do I export a report?", "k": 3}'
# → {"chunks":[{"text":"...export...","filename":"user-manual.pdf","score":0.31}, ...]}

# 5. negative paths
curl -s -o /dev/null -w '%{http_code}' \
  "localhost:8000/api/v1/companies/cmp_nope/documents"          # 404
curl -s -X DELETE \
  "localhost:8000/api/v1/companies/cmp_1a2b3c4d/documents/doc_xxx" -w '%{http_code}'
# 204, then /retrieve for that doc's content returns nothing from it
```

### ✅ Step 11: Update Documentation (MANDATORY)

**File(s)**: `docs/02-backend.md` (new), `docs/01-architecture-overview.md` (update),
`README.md` (update)

**Changes**:
- New `docs/02-backend.md`: backend layering with the now-real
  routes/services/repositories inventory; API contracts for all Phase 1 endpoints
  (request/response shapes, status codes: 201/204/404/413/422/503, example payloads);
  ingestion pipeline description (extract → chunk 800/150 → embed → `kb_{company_id}`,
  chunk ID scheme, metadata shape); document status lifecycle
  (`processing`/`ready`/`failed`); Mongo collections + indexes; runnable curl
  walkthrough from Step 10; failure modes (missing `OPENAI_API_KEY` → 503, scanned
  PDF → `failed` doc).
- `docs/01-architecture-overview.md`: bump status line to "Phase 1 complete", mark
  `OPENAI_API_KEY` as now-required for ingestion/retrieval, link `02-backend.md`,
  update the request-flow diagram (admin-flow half is now real).
- `README.md`: add the create-company → upload → retrieve curl walkthrough as the
  end-to-end example per the documentation quality bar.

**Pseudo-code**:

```markdown
# docs/02-backend.md (skeleton)
## Layering
routes/ (companies, documents, retrieve) → services/ (company, ingestion,
retrieval, text_extraction) → repositories/ (company, document, vector) → models/

## API contracts
### POST /api/v1/companies → 201
Request:  {"name": "Acme Corp"}
Response: {"company_id": "cmp_1a2b3c4d", "name": "Acme Corp", "created_at": "..."}
Errors:   422 invalid body

### POST /api/v1/companies/{company_id}/documents → 201 (multipart, files[])
Response: [DocumentMeta] — per-file status: ready | failed (error reason included)
Errors:   404 unknown company · 413 file > 10 MB · 422 no files · 503 no OPENAI_API_KEY
...

## Data
Mongo `companies` (unique company_id) · `documents` (unique document_id, company_id idx)
Chroma `kb_{company_id}` — ids "{document_id}:{i}", metadata {document_id, filename, chunk_index}
```

---

## Edge Cases

- **Scanned / image-only PDF** → `pypdf` extracts empty text → `EmptyDocumentError` →
  document marked `failed` with reason; upload response still 201 with per-file status.
- **Unsupported extension** (e.g. `.png`, no extension) → `failed` with
  "Unsupported file type"; batch continues.
- **File > 10 MB** → 413 before any processing (checked in the route from the
  service-owned constant).
- **Unknown `company_id`** on any documents/retrieve call → 404 via `require_company`
  (retrieve validates in-handler since the ID is in the body).
- **Empty knowledge base** (company exists, no docs) → `/retrieve` returns
  `{"chunks": []}`; `VectorRepository.query` short-circuits on `count == 0` — also
  avoids Chroma erroring when `n_results` exceeds collection size (k is clamped).
- **Missing `OPENAI_API_KEY`** → stack boots (Phase 0 behavior preserved), but upload
  and retrieve return 503 with an actionable message instead of a deep OpenAI stack
  trace.
- **Duplicate filename uploaded twice** → allowed; two separate `document_id`s and
  chunk sets (dedup is not a POC concern; delete works per document).
- **Chroma delete succeeds but Mongo delete races/fails** (or vice versa) → delete
  order is chunks-first, so the worst case is a Mongo record pointing at no chunks —
  visible and re-deletable, never orphaned invisible chunks.
- **Non-UTF-8 text files** → `decode(errors="replace")` keeps ingestion alive with
  replacement chars instead of failing the file.

## Testing Checklist

- [x] `docker compose up --build` still boots; `/health` returns ok (no Phase 0 regression) — Step 10
- [x] `POST /api/v1/companies` returns 201 with `cmp_`-prefixed ID; Mongo has unique index on `company_id` — Step 10
- [ ] `GET /api/v1/companies` and `GET /api/v1/companies/{id}` work; unknown ID → 404
- [x] Multi-file upload (pdf + md) → all `ready`, `chunk_count > 0` each — Step 10
- [ ] Chroma collection `kb_{company_id}` contains the chunks with correct metadata
- [x] Scanned/empty PDF → `failed` with reason (unit: `test_ingest_failure_marks_failed_and_skips_chroma`) — Step 9
- [ ] File > 10 MB → 413; unsupported extension → `failed` status
- [x] `POST /api/v1/retrieve` returns relevant chunks for a manual-specific query — Step 10
- [x] `/retrieve` empty collection → `[]` (unit: `test_retrieve_returns_empty_for_empty_collection`) — Step 9
- [x] `DELETE .../documents/{id}` → 204; deleted doc's content no longer retrievable — Step 10
- [x] Unknown company on documents/retrieve endpoints → 404 — Step 10
- [x] Empty/missing `OPENAI_API_KEY` → upload/retrieve return 503 with clear message — observed before key was set — Step 10
- [x] `python -m pytest backend/tests/ -v` — all unit tests pass (10 passed) — Step 9
- [ ] No linter errors in changed backend files

## Files to Modify

- [x] `backend/app/models/company.py` (new) — Step 1
- [x] `backend/app/repositories/company_repo.py` (new) — Step 1
- [x] `backend/app/db/mongo.py` (add `ensure_indexes`) — Step 1
- [x] `backend/app/main.py` (lifespan indexes + companies/docs/retrieve routers) — Steps 1, 2, 7, 8
- [x] `backend/app/services/company_service.py` (new) — Step 2
- [x] `backend/app/routes/companies.py` (new) — Step 2
- [x] `backend/app/routes/deps.py` (new, grows in Steps 4, 7, 8) — Steps 2, 4, 7, 8
- [x] `backend/app/models/document.py` (new) — Step 3
- [x] `backend/app/repositories/document_repo.py` (new) — Step 3
- [x] `backend/app/repositories/vector_repo.py` (new) — Step 4
- [x] `backend/app/services/text_extraction.py` (new) — Step 5
- [x] `backend/app/services/ingestion_service.py` (new) — Step 6
- [x] `backend/app/routes/documents.py` (new) — Step 7
- [x] `backend/app/models/retrieval.py` (new) — Step 8
- [x] `backend/app/services/retrieval_service.py` (new) — Step 8
- [x] `backend/app/routes/retrieve.py` (new) — Step 8
- [x] `backend/requirements-dev.txt` (new) — Step 9
- [x] `backend/tests/conftest.py`, `backend/tests/test_text_extraction.py`,
      `backend/tests/test_ingestion_service.py`, `backend/tests/test_retrieval_service.py` (new) — Step 9
- [x] `docs/02-backend.md` (new) — Step 11
- [x] `docs/01-architecture-overview.md` (update) — Step 11
- [x] `README.md` (update) — Step 11

## Implementation Order

1. **Step 1** — company model + repo + indexes (foundation; guard deps need it)
2. **Step 2** — company service + routes + `deps.py` (first curl-testable endpoint)
3. **Step 3** — document model + repo (pure Mongo, no external deps)
4. **Step 4** — vector repo (Chroma adapter; needs `OPENAI_API_KEY` from here on)
5. **Step 5** — text extraction helpers (pure functions, independently testable)
6. **Step 6** — ingestion service (composes Steps 3–5)
7. **Step 7** — documents routes (exposes Step 6)
8. **Step 8** — retrieval service + `/retrieve` (completes the pipeline)
9. **Step 9** — unit tests (extraction/ingestion/retrieval)
10. **Step 10** — E2E curl verification of exit criteria
11. **Step 11** — **documentation (mandatory final step)**

Steps 3–5 are mutually independent and can be done in any order after Step 2;
everything else is sequential.
