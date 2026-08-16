# Hint — Backend (Knowledge Base API)

> **Status: Phase 3 (AI layer) complete.**
> Covers JWT auth, companies CRUD, document ingestion (parse → chunk → embed → Chroma),
> retrieval, and the widget-facing chat (SSE) + hint endpoints. AI runtime:
> [`06-ai-layer.md`](06-ai-layer.md). Auth contract (seeding, token TTL,
> protected vs public): [`05-auth.md`](05-auth.md). Admin SPA:
> [`04-admin.md`](04-admin.md). Stack/env:
> [`01-architecture-overview.md`](01-architecture-overview.md).

## Layering

`backend/app/` follows a strict top-down layering — routes never touch the database,
repositories never contain business rules:

```
routes/        auth.py · companies.py · widget_config.py · documents.py
               · retrieve.py · assist.py · deps.py
  └─▶ ai/              llm_factory.py · prompts.py · chat_graph.py · hint_chain.py
  └─▶ services/        auth_service.py · company_service.py · ingestion_service.py
                       · retrieval_service.py · text_extraction.py · hint_cache.py
        └─▶ repositories/  user_repo.py · company_repo.py · document_repo.py
                           · vector_repo.py (Chroma adapter)
              └─▶ models/     user.py · company.py · document.py · retrieval.py
                              · assist.py
db/            mongo.py (Motor client, ensure_indexes) · chroma.py (HttpClient)
config.py      Settings (BaseSettings) · get_settings() cached accessor
main.py        lifespan (connect + indexes + seed admin) · CORS · /health · routers
```

`ai/` is the only layer that constructs LLM clients. Routes call `ai/` entry
points; `ai/` calls `RetrievalService`. Graph topology, SSE event shapes,
prompts, and hint-cache semantics: [`06-ai-layer.md`](06-ai-layer.md).

Cross-cutting rules:

- Every endpoint declares a `response_model`; all I/O is `async`.
- Chroma's Python client is synchronous — **every** Chroma call goes through
  `run_in_threadpool` inside `VectorRepository`; no other layer touches the Chroma client.
- `routes/deps.py` centralizes dependency wiring plus three guards:
  - `require_admin` — 401 unless `Authorization: Bearer` decodes to a `users` row.
    Applied at router level on companies + documents. `GET …/widget-config` lives
    on a **separate** `widget_config` router (same `/companies` prefix, **no**
    JWT) so the embed can read starter questions. Full contract: [`05-auth.md`](05-auth.md).
  - `require_company` — 404 `"Unknown company_id"` before any company-scoped work.
  - `require_openai_key` — 503 with an actionable message when `OPENAI_API_KEY` is empty
    (the stack boots without it; ingestion, `/retrieve`, `/chat`, and `/hint` need it).

## Authentication

Preset admin user, seeded at startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (bcrypt,
idempotent upsert). Login returns a JWT (HS256, default 12 h). Companies and
documents routers require it; `POST /api/v1/retrieve`, `POST /api/v1/chat`,
`POST /api/v1/hint`, `GET /api/v1/companies/{id}/widget-config`, and
`GET /health` do not.

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
token (Phase 2), including `PATCH …/widget-config`. `/auth/login`, `/retrieve`,
`/chat`, `/hint`, `GET /companies/{id}/widget-config`, and `/health` are public.

### POST /api/v1/companies → 201

Create a company. `company_id` is a generated slug (`cmp_` + 8 hex chars).

```json
// Request
{"name": "Acme Corp"}                  // 1–100 chars

// Response 201
{"company_id": "cmp_1a2b3c4d", "name": "Acme Corp", "created_at": "2026-08-08T12:00:00Z", "suggested_questions": []}
```

Errors: `401` missing/invalid token · `422` invalid body (empty or >100-char name).
New companies start with `suggested_questions: []` (no default prompts).

### GET /api/v1/companies → 200

List all companies, newest first. Response: `[Company]` (same shape as above).
Errors: `401` missing/invalid token.

### GET /api/v1/companies/{company_id} → 200

Fetch one company. Errors: `401` missing/invalid token · `404` `{"detail": "Unknown company_id"}`.

### GET /api/v1/companies/{company_id}/widget-config → 200 (public)

Widget empty-state chips. **No bearer token.** Mounted on `widget_config_router`
(not the JWT-wrapped `companies_router`) so a later auth change does not
accidentally lock the embed. Anyone with a `company_id` can read the prompt
list — same trade-off as public `/chat` / `/hint`.

```json
{"company_id":"cmp_1a2b3c4d","suggested_questions":["How do I create an invoice?"]}
```

`suggested_questions` is 0–4 strings (already capped by PATCH). Empty list is
valid — the widget keeps the empty-state sentence and renders no chips.

Errors: `404` `{"detail":"Unknown company_id"}`. No bearer token.

v2 (generate from the knowledge base + page headings) is **not** built.

### PATCH /api/v1/companies/{company_id}/widget-config → 200 (bearer)

Replace the company's starter questions. Admin editor calls this.

```json
// Request
{"suggested_questions":["How do I create an invoice?","How do I export a report?"]}

// Response 200 — full Company including suggested_questions
{"company_id":"cmp_1a2b3c4d","name":"Acme Corp","created_at":"2026-08-08T12:00:00Z","suggested_questions":["How do I create an invoice?","How do I export a report?"]}
```

Caps (422 if violated): 0–4 items; each 1–120 characters after trim; blank
entries rejected. `[]` clears chips (visible on the host after reload — the
widget caches in memory for the page lifetime).

Errors: `401` · `404` unknown id · `422` more than 4 items, blank
entries, or an item longer than 120 characters.

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

Debug endpoint for verifying RAG quality with curl. The chat graph and hint
chain consume the same `RetrievalService.retrieve()` unchanged.

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

### POST /api/v1/chat → 200 SSE (public)

LangGraph graph `condense_query → retrieve (k=5) → generate_answer`. Streams
tokens over `text/event-stream`. The widget (Phase 4) and curl both use POST +
a readable stream — browsers cannot use `EventSource` (no request body).
Runtime details: [`06-ai-layer.md`](06-ai-layer.md).

A real `OPENAI_API_KEY` is required. Caps are enforced by Pydantic before any
LLM spend (≤ 60 interactive elements, ≤ 2000-char excerpt, 1–30 messages,
1–4000 chars per message). `role` is `user` or `assistant` only — the system
prompt is backend-owned.

```json
// Request
{
  "company_id": "cmp_1a2b3c4d",
  "messages": [
    {"role": "user", "content": "How do I export a report?"}
  ],
  "page_context": {
    "url": "https://app.acme.com/reports",
    "title": "Reports",
    "headings": ["Reports"],
    "visible_text_excerpt": "Monthly reports overview",
    "interactive": [
      {
        "tag": "button",
        "text": "Export report",
        "role": null,
        "attrs": {"id": "export-report"},
        "selector_path": "main > button#export-report"
      }
    ]
  }
}
```

```
event: token
data: To export a report,

event: token
data:  click the "Export report" button

event: done
data: {"sources": ["user-manual.pdf"]}
```

| Event | `data` | When |
|---|---|---|
| `token` | raw token string | Repeated; only tokens from `generate_answer` (condense never leaks) |
| `done` | `{"sources": ["user-manual.pdf"]}` | Success. `sources` is `[]` when the KB is empty |
| `error` | `{"detail": "Chat generation failed"}` | Mid-stream LLM/network failure. HTTP status is already 200 |

| Status | `detail` | When |
|---|---|---|
| 404 | `Unknown company_id` | Body `company_id` is not in Mongo. Raised before the stream starts |
| 422 | FastAPI validation | Caps exceeded, empty `messages`, invalid `role`, etc. |
| 503 | `OPENAI_API_KEY is not configured; set it in .env and restart` | Empty key (router-level `require_openai_key`) |

Empty KB: the model is told the docs do not cover it; `done` still fires with
`"sources": []`. Follow-ups are rewritten into a standalone query
(`condense_query`); a single-message request skips that LLM call.

### POST /api/v1/hint → 200 (public)

One non-streaming LLM call. Retrieval query is
`element.text or aria-label — page title`; top-3 chunks; response clamped to
140 characters. Served from an in-process TTL cache keyed by
`sha1(company_id | url_path | selector_path | element_text)` so repeated
hovers are free. Cache recipe / TTL / eviction:
[`06-ai-layer.md`](06-ai-layer.md#hint-cache).

```json
// Request
{
  "company_id": "cmp_1a2b3c4d",
  "element": {
    "tag": "button",
    "text": "Export report",
    "role": null,
    "attrs": {"id": "export-report"},
    "selector_path": "main > button#export-report"
  },
  "page_context": {
    "url": "https://app.acme.com/reports",
    "title": "Reports",
    "headings": ["Reports"],
    "interactive": [],
    "visible_text_excerpt": ""
  }
}

// Response 200
{"hint": "Exports the current report as a downloadable file.", "source": "user-manual.pdf"}
```

| Field | Rule |
|---|---|
| `hint` | One sentence, ≤ 140 characters (hard clamp after the model) |
| `source` | Top chunk filename, or `null` when the KB is empty |

| Status | `detail` | When |
|---|---|---|
| 404 | `Unknown company_id` | Body `company_id` is not in Mongo. Cache is not consulted |
| 422 | FastAPI validation | Caps exceeded / missing `element` / invalid body |
| 503 | `OPENAI_API_KEY is not configured; set it in .env and restart` | Empty key |

Identical second request (same company, URL **path**, selector, element text)
returns the same JSON from cache — typically tens of milliseconds, no LLM
tokens. Query-string differences do not bust the cache. Restarting the
backend empties the store (per-process).

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
| `companies` | `{company_id, name, created_at, suggested_questions}`                  | `company_id` **unique** |
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
A real OpenAI key is required for upload, `/retrieve`, `/chat`, and `/hint`.
The browser path (login → create → upload → copy snippet) is in the README and
[`04-admin.md`](04-admin.md); this is the debug path. Chat/hint runtime:
[`06-ai-layer.md`](06-ai-layer.md).

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
# → {"company_id":"cmp_1a2b3c4d","name":"Acme Corp","created_at":"…","suggested_questions":[]}

# 1b. public widget-config (no token) — empty until PATCH
curl -s localhost:8000/api/v1/companies/cmp_1a2b3c4d/widget-config
# → {"company_id":"cmp_1a2b3c4d","suggested_questions":[]}

# 1c. set starter questions (bearer)
curl -s -X PATCH localhost:8000/api/v1/companies/cmp_1a2b3c4d/widget-config \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"suggested_questions":["How do I create an invoice?","How do I export a report?"]}'
# → Company with suggested_questions set

curl -s localhost:8000/api/v1/companies/cmp_1a2b3c4d/widget-config
# → {"company_id":"cmp_1a2b3c4d","suggested_questions":["How do I create an invoice?",…]}

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

# 5. chat streams tokens over SSE (-N disables curl buffering)
#    Requires a real OPENAI_API_KEY. Public — no token.
PAGE_CTX='{"url":"https://app.acme.com/reports","title":"Reports",
  "headings":["Reports"],"visible_text_excerpt":"Monthly reports overview",
  "interactive":[{"tag":"button","text":"Export report","role":null,
    "attrs":{"id":"export-report"},"selector_path":"main > button#export-report"}]}'

curl -N -s -X POST localhost:8000/api/v1/chat \
  -H 'Content-Type: application/json' \
  -d "{\"company_id\":\"cmp_1a2b3c4d\",
       \"messages\":[{\"role\":\"user\",\"content\":\"How do I export a report?\"}],
       \"page_context\":$PAGE_CTX}"
# → many `event: token` lines arriving progressively; answer references the
#   "Export report" button; then `event: done` `data: {"sources":["user-manual.pdf"]}`

# 6. hint — one-liner; second identical call is served from cache
time curl -s -X POST localhost:8000/api/v1/hint \
  -H 'Content-Type: application/json' \
  -d "{\"company_id\":\"cmp_1a2b3c4d\",
       \"element\":{\"tag\":\"button\",\"text\":\"Export report\",\"role\":null,
         \"attrs\":{\"id\":\"export-report\"},\"selector_path\":\"main > button#export-report\"},
       \"page_context\":$PAGE_CTX}"
# → {"hint":"…≤140 chars…","source":"user-manual.pdf"}   first call ~1s
time curl -s -X POST localhost:8000/api/v1/hint \
  -H 'Content-Type: application/json' \
  -d "{\"company_id\":\"cmp_1a2b3c4d\",
       \"element\":{\"tag\":\"button\",\"text\":\"Export report\",\"role\":null,
         \"attrs\":{\"id\":\"export-report\"},\"selector_path\":\"main > button#export-report\"},
       \"page_context\":$PAGE_CTX}"
# → identical JSON, wall time ~0.05s (cache hit)

# 7. negative paths
curl -s -o /dev/null -w '%{http_code}' \
  "localhost:8000/api/v1/companies/cmp_nope/documents"                      # 401 (no token)
curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  "localhost:8000/api/v1/companies/cmp_nope/documents"                      # 404
curl -s -o /dev/null -w '%{http_code}' -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "localhost:8000/api/v1/companies/cmp_1a2b3c4d/documents/doc_xxx"          # 204 (real id) / 404
# after a 204, /retrieve no longer returns chunks from the deleted document
curl -s -X POST localhost:8000/api/v1/chat \
  -H 'Content-Type: application/json' \
  -d "{\"company_id\":\"cmp_nope\",\"messages\":[{\"role\":\"user\",\"content\":\"Hi\"}],
       \"page_context\":$PAGE_CTX}"                                         # 404
curl -s -X POST localhost:8000/api/v1/hint \
  -H 'Content-Type: application/json' \
  -d "{\"company_id\":\"cmp_nope\",\"element\":{\"tag\":\"button\",\"text\":\"X\",
       \"role\":null,\"attrs\":{},\"selector_path\":\"button\"},
       \"page_context\":$PAGE_CTX}"                                         # 404
```

## Failure modes

| Symptom | Cause | Behavior / fix |
|---|---|---|
| `401 {"detail":"Missing bearer token"}` on companies/documents | No `Authorization` header | `POST /api/v1/auth/login` first; pass `Authorization: Bearer $TOKEN` |
| `401 {"detail":"Invalid email or password"}` | Wrong creds, or `ADMIN_PASSWORD` unset so seeding was skipped | Set `ADMIN_PASSWORD` in `.env`, restart backend, use that password |
| `401 {"detail":"Invalid or expired token - sign in again"}` | Expired / tampered JWT, or `JWT_SECRET` changed | Login again |
| `503 {"detail":"OPENAI_API_KEY is not configured; set it in .env and restart"}` on upload / retrieve / chat / hint | Empty `OPENAI_API_KEY` | Stack boots fine (Phase 0 behavior preserved); set the key in `.env`, `docker compose up -d` |
| Chat stream ends with `event: error` | LLM/network failure after tokens were sent | HTTP status stays 200; treat the assistant message as failed. See [`06-ai-layer.md`](06-ai-layer.md#failure-modes) |
| Hint `source: null` / chat `done` with `"sources":[]` | Company exists, no ready documents | Expected empty-KB path — model uses the page/label, not invented features |
| Upload returns `status: "failed"`, error "No extractable text (scanned PDF or empty file)" | Scanned/image-only PDF, or empty file | Expected — no OCR in the POC; response is still 201 with per-file status |
| Upload returns `status: "failed"`, error "Unsupported file type: .png" | Extension outside pdf/md/txt/html/htm | Batch continues; other files unaffected |
| `413 {"detail":"big.pdf exceeds 10 MB"}` | Single file over the 10 MB cap | Whole request rejected before any processing |
| `404 {"detail":"Unknown company_id"}` | Wrong/missing company slug | Create the company first; IDs are `cmp_`-prefixed |
| Upload takes seconds | Ingestion is synchronous in-request (accepted POC trade-off) | The `status` field already supports moving to a background queue later without an API change |
| Mongo record exists but retrieval misses its content | Chroma delete succeeded, Mongo delete raced/failed (or ingestion failed mid-way) | Delete order is chunks-first, so worst case is a visible, re-deletable Mongo record — never orphaned invisible chunks |
| Garbled characters in retrieved text | Non-UTF-8 source file | `decode(errors="replace")` keeps ingestion alive with replacement chars |

## Tests

Unit tests live in `backend/tests/` (extraction, ingestion, retrieval, assist
contract, hint cache, hint chain, chat graph — service / `ai/` layer with
in-memory fakes; no Mongo/Chroma/network needed):

| File | Covers |
|---|---|
| `test_text_extraction.py` / `test_ingestion_service.py` / `test_retrieval_service.py` | Phase 1 pipeline |
| `test_assist_models.py` | Wire-contract caps (41 elements / 2001-char excerpt / empty messages) |
| `test_hint_cache.py` | Key stability across query-string URLs; TTL expiry; oldest-first eviction |
| `test_hint_chain.py` | Query build; 140-char clamp; `source: null` on empty KB |
| `test_chat_graph.py` | Single message skips condense; retrieval `(company_id, query, 5)`; answer produced |
| `test_company_models.py` | Widget-config caps (blank / >120 chars / >4 items) and trim |
| `test_widget_config_routes.py` | Public GET 200/404; PATCH without token is 401 |

```bash
cd backend && pip install -r requirements-dev.txt && python -m pytest tests/ -v
```

Route-level behavior (404 guard, 413, 503-without-key, SSE tokens, hint cache
hit) is covered by the curl walkthrough above. Graph / prompt / cache
semantics: [`06-ai-layer.md`](06-ai-layer.md).
