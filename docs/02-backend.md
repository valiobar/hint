# Hint — Backend (Knowledge Base API)

> **Status: Phase 2 (admin panel + preset-admin auth) complete.**
> Covers JWT auth, companies CRUD, document ingestion (parse → chunk → embed → Chroma),
> and the retrieval debug endpoint. Chat / hints (LangGraph, `ai/`) arrive in Phase 3.
> Auth contract (seeding, token TTL, protected vs public): [`05-auth.md`](05-auth.md).
> Admin SPA: [`04-admin.md`](04-admin.md). Stack/env:
> [`01-architecture-overview.md`](01-architecture-overview.md).

## Layering

`backend/app/` follows a strict top-down layering — routes never touch the database,
repositories never contain business rules:

```
routes/        auth.py · companies.py · documents.py · retrieve.py · deps.py
  └─▶ services/        auth_service.py · company_service.py · ingestion_service.py
                       · retrieval_service.py · text_extraction.py
        └─▶ repositories/  user_repo.py · company_repo.py · document_repo.py
                           · vector_repo.py (Chroma adapter)
              └─▶ models/     user.py · company.py · document.py · retrieval.py
db/            mongo.py (Motor client, ensure_indexes) · chroma.py (HttpClient)
config.py      Settings (BaseSettings) · get_settings() cached accessor
main.py        lifespan (connect + indexes + seed admin) · CORS · /health · routers
```

Cross-cutting rules:

- Every endpoint declares a `response_model`; all I/O is `async`.
- Chroma's Python client is synchronous — **every** Chroma call goes through
  `run_in_threadpool` inside `VectorRepository`; no other layer touches the Chroma client.
- `routes/deps.py` centralizes dependency wiring plus three guards:
  - `require_admin` — 401 unless `Authorization: Bearer` decodes to a `users` row.
    Applied at router level on companies + documents. Full contract: [`05-auth.md`](05-auth.md).
  - `require_company` — 404 `"Unknown company_id"` before any company-scoped work.
  - `require_openai_key` — 503 with an actionable message when `OPENAI_API_KEY` is empty
    (the stack boots without it; only ingestion/retrieval need it).

## Authentication

Preset admin user, seeded at startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (bcrypt,
idempotent upsert). Login returns a JWT (HS256, default 12 h). Companies and
documents routers require it; `POST /api/v1/retrieve` and `GET /health` do not.

If `ADMIN_PASSWORD` is empty, seeding is skipped and every login is 401 (fail-closed).

### POST /api/v1/auth/login → 200 (public)

```json
// Request
{"email": "admin@hint.local", "password": "your-password"}

// Response 200
{"access_token": "eyJ…", "token_type": "bearer", "expires_in": 43200, "email": "admin@hint.local"}
```

Errors: `401` `{"detail": "Invalid email or password"}` (unknown email and wrong
password share this body) · `422` invalid body.

### GET /api/v1/auth/me → 200 (bearer)

```json
{"email": "admin@hint.local", "created_at": "2026-08-15T12:00:00Z"}
```

Errors: `401` `Missing bearer token` · `Invalid or expired token - sign in again` ·
`Unknown user`. All 401s from `require_admin` include `WWW-Authenticate: Bearer`.

Send the token on every admin call:

```
Authorization: Bearer <access_token>
```

Seeding, TTL, rotation, and the public-`/retrieve` trade-off:
[`05-auth.md`](05-auth.md).

## API contracts

All routes are mounted under `/api/v1`. Companies and documents require a bearer
token (Phase 2). `/auth/login`, `/retrieve`, and `/health` are public.

### POST /api/v1/companies → 201

Create a company. `company_id` is a generated slug (`cmp_` + 8 hex chars).

```json
// Request
{"name": "Acme Corp"}                  // 1–100 chars

// Response 201
{"company_id": "cmp_1a2b3c4d", "name": "Acme Corp", "created_at": "2026-08-08T12:00:00Z"}
```

Errors: `401` missing/invalid token · `422` invalid body (empty or >100-char name).

### GET /api/v1/companies → 200

List all companies, newest first. Response: `[Company]` (same shape as above).
Errors: `401` missing/invalid token.

### GET /api/v1/companies/{company_id} → 200

Fetch one company. Errors: `401` missing/invalid token · `404` `{"detail": "Unknown company_id"}`.

### POST /api/v1/companies/{company_id}/documents → 201

Upload one or more files as multipart form data (repeated `files` field). Supported
types: `.pdf`, `.md`, `.txt`, `.html`, `.htm`. Files are ingested sequentially and
synchronously (no background queue in the POC); each file gets its own status, so one
bad file never fails the batch.

```json
// Response 201 — one DocumentMeta per uploaded file
[
  {
    "document_id": "doc_a1b2c3d4e5f6",
    "company_id": "cmp_1a2b3c4d",
    "filename": "user-manual.pdf",
    "size_bytes": 482133,
    "chunk_count": 42,
    "status": "ready",
    "error": null,
    "created_at": "2026-08-08T12:01:00Z"
  },
  {
    "document_id": "doc_f6e5d4c3b2a1",
    "company_id": "cmp_1a2b3c4d",
    "filename": "scan.pdf",
    "size_bytes": 90210,
    "chunk_count": 0,
    "status": "failed",
    "error": "No extractable text (scanned PDF or empty file)",
    "created_at": "2026-08-08T12:01:02Z"
  }
]
```

Errors: `401` missing/invalid token · `404` unknown company · `413` file > 10 MB
(checked before any processing) · `422` no files · `503` `OPENAI_API_KEY` not configured.

### GET /api/v1/companies/{company_id}/documents → 200

List a company's documents, newest first. Response: `[DocumentMeta]`.
Errors: `401` missing/invalid token · `404` unknown company.

### DELETE /api/v1/companies/{company_id}/documents/{document_id} → 204

Delete a document: Chroma chunks are removed first (metadata filter on `document_id`),
then the Mongo record. Errors: `401` missing/invalid token · `404` unknown company
or unknown/cross-company `document_id`.

### POST /api/v1/retrieve → 200

Debug endpoint for verifying RAG quality with curl before any LLM code exists.
Phase 3's chat graph consumes the same `RetrievalService.retrieve()` unchanged.

```json
// Request
{"company_id": "cmp_1a2b3c4d", "query": "how do I export a report?", "k": 3}
// query: 1–1000 chars · k: 1–20, default 5

// Response 200
{
  "chunks": [
    {"text": "…To export a report, open…", "filename": "user-manual.pdf", "score": 0.31}
  ]
}
```

- `score` is the raw Chroma cosine **distance** — lower = more similar (not a
  normalized similarity).
- An empty knowledge base returns `{"chunks": []}`, not an error.

Errors: `404` unknown `company_id` (validated in-handler since the ID is in the body) ·
`422` invalid body · `503` `OPENAI_API_KEY` not configured (query embedding needs it).

### GET /health → 200 | 503

Pings Mongo and Chroma. `{"status":"ok","mongo":"ok","chroma":"ok"}`, or 503 with
`"status":"degraded"` and per-store error names.

## Ingestion pipeline

`IngestionService.ingest_file(company_id, filename, raw)` runs per file:

1. **Size gate** — > 10 MB raises (the route pre-checks and returns 413;
   `MAX_FILE_SIZE_BYTES` lives in the service as the single source of truth).
2. **Mongo record** — `documents` row created with `status: "processing"`.
3. **Extract** (`services/text_extraction.py`) — `pypdf` for PDF; UTF-8 decode
   (`errors="replace"`) for md/txt; a stdlib `HTMLParser` subclass for HTML that skips
   `<script>`/`<style>` (no beautifulsoup/html2text dependency). Unsupported extension
   → `UnsupportedFileTypeError`; empty result (e.g. scanned PDF) → `EmptyDocumentError`.
4. **Chunk** — `RecursiveCharacterTextSplitter`, chunk_size **800** chars,
   overlap **150**.
5. **Embed + upsert** — Chroma collection `kb_{company_id}` (cosine space), embeddings
   via `OpenAIEmbeddingFunction` (`EMBEDDING_MODEL`, default `text-embedding-3-small`).
   - Chunk IDs are deterministic: `"{document_id}:{chunk_index}"` — re-ingestion
     upserts in place, deletion is precise.
   - Chunk metadata: `{"document_id": …, "filename": …, "chunk_index": …}`.
6. **Finalize** — `status: "ready"` + `chunk_count` on success; any failure marks the
   record `status: "failed"` with the error reason (truncated to 500 chars) — the
   record survives so the admin UI can display it.

### Document status lifecycle

```
processing ──ingestion ok──▶ ready    (chunk_count > 0)
     └───────any failure───▶ failed   (error = reason; chunk_count stays 0)
```

There is no retry endpoint in Phase 1 — re-upload the file (new `document_id`) or
delete the failed record.

## Data

### MongoDB (indexes created at startup via `mongo.ensure_indexes()`, idempotent)

| Collection  | Document shape                                                        | Indexes |
|-------------|-----------------------------------------------------------------------|---------|
| `companies` | `{company_id, name, created_at}`                                      | `company_id` **unique** |
| `documents` | `{document_id, company_id, filename, size_bytes, chunk_count, status, error, created_at}` | `document_id` **unique** · `company_id` |
| `users`     | `{email, password_hash, created_at}`                                  | `email` **unique** |

### ChromaDB

One collection per company — `kb_{company_id}` (cosine HNSW space). Per-company
collections give hard tenant isolation: no query-time filter can leak another
company's chunks.

| Field    | Value                                                    |
|----------|----------------------------------------------------------|
| ids      | `"{document_id}:{chunk_index}"` (deterministic)          |
| documents| chunk text (~800 chars, 150 overlap)                     |
| metadata | `{"document_id": str, "filename": str, "chunk_index": int}` |

## End-to-end curl walkthrough

Prerequisite: `OPENAI_API_KEY` **and** `ADMIN_PASSWORD` set in `.env`, stack up.
The browser path (login → create → upload → copy snippet) is in the README and
[`04-admin.md`](04-admin.md); this is the debug path.

```bash
docker compose up --build -d
curl -s localhost:8000/health
# → {"status":"ok","mongo":"ok","chroma":"ok"}

# 0. obtain a token (use the ADMIN_EMAIL / ADMIN_PASSWORD from .env)
TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@hint.local","password":"YOUR_ADMIN_PASSWORD"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# unauthenticated admin call
curl -s localhost:8000/api/v1/companies
# → {"detail":"Missing bearer token"}   (401)

# 1. create a company
curl -s -X POST localhost:8000/api/v1/companies \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name": "Acme Corp"}'
# → {"company_id":"cmp_1a2b3c4d","name":"Acme Corp","created_at":"…"}

# 2. upload documents (multi-file; use the company_id from step 1)
curl -s -X POST "localhost:8000/api/v1/companies/cmp_1a2b3c4d/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@user-manual.pdf" -F "files=@faq.md"
# → [{"document_id":"doc_…","status":"ready","chunk_count":42,…}, {…}]

# 3. list documents — both "ready"
curl -s "localhost:8000/api/v1/companies/cmp_1a2b3c4d/documents" \
  -H "Authorization: Bearer $TOKEN"

# 4. retrieve relevant chunks — public, no token (widget path)
curl -s -X POST localhost:8000/api/v1/retrieve \
  -H 'Content-Type: application/json' \
  -d '{"company_id": "cmp_1a2b3c4d", "query": "how do I export a report?", "k": 3}'
# → {"chunks":[{"text":"…export…","filename":"user-manual.pdf","score":0.31}, …]}

# 5. negative paths
curl -s -o /dev/null -w '%{http_code}' \
  "localhost:8000/api/v1/companies/cmp_nope/documents"                      # 401 (no token)
curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  "localhost:8000/api/v1/companies/cmp_nope/documents"                      # 404
curl -s -o /dev/null -w '%{http_code}' -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "localhost:8000/api/v1/companies/cmp_1a2b3c4d/documents/doc_xxx"          # 204 (real id) / 404
# after a 204, /retrieve no longer returns chunks from the deleted document
```

## Failure modes

| Symptom | Cause | Behavior / fix |
|---|---|---|
| `401 {"detail":"Missing bearer token"}` on companies/documents | No `Authorization` header | `POST /api/v1/auth/login` first; pass `Authorization: Bearer $TOKEN` |
| `401 {"detail":"Invalid email or password"}` | Wrong creds, or `ADMIN_PASSWORD` unset so seeding was skipped | Set `ADMIN_PASSWORD` in `.env`, restart backend, use that password |
| `401 {"detail":"Invalid or expired token - sign in again"}` | Expired / tampered JWT, or `JWT_SECRET` changed | Login again |
| `503 {"detail":"OPENAI_API_KEY is not configured; set it in .env and restart"}` on upload/retrieve | Empty `OPENAI_API_KEY` | Stack boots fine (Phase 0 behavior preserved); set the key in `.env`, `docker compose up -d` |
| Upload returns `status: "failed"`, error "No extractable text (scanned PDF or empty file)" | Scanned/image-only PDF, or empty file | Expected — no OCR in the POC; response is still 201 with per-file status |
| Upload returns `status: "failed"`, error "Unsupported file type: .png" | Extension outside pdf/md/txt/html/htm | Batch continues; other files unaffected |
| `413 {"detail":"big.pdf exceeds 10 MB"}` | Single file over the 10 MB cap | Whole request rejected before any processing |
| `404 {"detail":"Unknown company_id"}` | Wrong/missing company slug | Create the company first; IDs are `cmp_`-prefixed |
| Upload takes seconds | Ingestion is synchronous in-request (accepted POC trade-off) | The `status` field already supports moving to a background queue later without an API change |
| Mongo record exists but retrieval misses its content | Chroma delete succeeded, Mongo delete raced/failed (or ingestion failed mid-way) | Delete order is chunks-first, so worst case is a visible, re-deletable Mongo record — never orphaned invisible chunks |
| Garbled characters in retrieved text | Non-UTF-8 source file | `decode(errors="replace")` keeps ingestion alive with replacement chars |

## Tests

Unit tests live in `backend/tests/` (extraction, ingestion, retrieval — service layer
with in-memory fakes; no Mongo/Chroma/network needed):

```bash
cd backend && pip install -r requirements-dev.txt && python -m pytest tests/ -v
```

Route-level behavior (404 guard, 413, 503-without-key) is covered by the curl
walkthrough above.
