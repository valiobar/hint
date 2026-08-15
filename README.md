# Hint POC

Browser-first AI guidance layer for SaaS apps: an embeddable Shadow DOM widget plus a
FastAPI RAG backend. Companies upload product docs; end users get chat answers and hover
hints grounded in that knowledge and the live page context.

## Architecture

| Service | Tech | Host port | Purpose |
|---|---|---|---|
| `backend` | FastAPI (Python 3.12) | 8000 | Companies, document ingestion, retrieval (`docs/02-backend.md`); chat in Phase 3 |
| `mongo` | mongo:7 | — (internal) | companies, documents metadata |
| `chromadb` | chromadb/chroma:0.5.23 | — (internal) | per-company vector collections |
| `admin` | React + Vite → nginx | 3001 | company + KB management (Phase 2+) |
| `widget-cdn` | Vite IIFE → nginx | 1337 | `loader.js` + `hint-widget.js` |
| `demo` | static nginx | 3002 | fake SaaS host with embed snippet |

Traffic: Admin / Demo / Widget (browser) → Backend (:8000). Mongo and Chroma stay on the
compose network only. Chroma listens on 8000 inside the network (same as backend) but is
never published to the host.

## Quick start

```bash
cp .env.example .env        # set OPENAI_API_KEY — required for upload/retrieve
docker compose up --build
```

| Service | URL |
|---|---|
| Backend | http://localhost:8000 (`/health`, `/docs`) |
| Admin | http://localhost:3001 |
| Widget CDN | http://localhost:1337/embed/v1/loader.js |
| Demo page | http://localhost:3002 |

Stop / restart (named volumes keep Mongo + Chroma data):

```bash
docker compose down
docker compose up -d
```

## End-to-end example: create company → upload docs → retrieve

With the stack up and `OPENAI_API_KEY` set in `.env`
(full API contracts in `docs/02-backend.md`):

```bash
# 1. create a company (note the returned company_id)
curl -s -X POST localhost:8000/api/v1/companies \
  -H 'Content-Type: application/json' -d '{"name": "Acme Corp"}'
# → {"company_id":"cmp_1a2b3c4d","name":"Acme Corp","created_at":"…"}

# 2. upload documents (pdf / md / txt / html, ≤ 10 MB each)
curl -s -X POST "localhost:8000/api/v1/companies/cmp_1a2b3c4d/documents" \
  -F "files=@user-manual.pdf" -F "files=@faq.md"
# → per-file status: [{"document_id":"doc_…","status":"ready","chunk_count":42,…}, …]

# 3. retrieve relevant chunks (RAG debug endpoint; Phase 3 chat reuses this service)
curl -s -X POST localhost:8000/api/v1/retrieve \
  -H 'Content-Type: application/json' \
  -d '{"company_id": "cmp_1a2b3c4d", "query": "how do I export a report?", "k": 3}'
# → {"chunks":[{"text":"…export…","filename":"user-manual.pdf","score":0.31}, …]}
```

Without `OPENAI_API_KEY`, the stack still boots but upload and `/retrieve` return
`503` with an actionable message. A scanned/image-only PDF is marked
`"status": "failed"` (no OCR in the POC) — the rest of the batch still ingests.

## Environment variables

Copy `.env.example` → `.env`. Compose injects Mongo/Chroma URLs for the backend; the
variables below are the ones you normally set on the host.

| Variable | Default | Consumed by | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | `""` | backend | Required for document upload and `/retrieve` (503 without it); stack boots without it |
| `LLM_MODEL` | `gpt-4o-mini` | backend | Chat / hint model |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | backend | Document embeddings |
| `MONGODB_URL` | set by compose | backend | Override only for local (non-Docker) runs |
| `MONGODB_DB_NAME` | `hint` (compose) | backend | Database name |
| `CHROMA_HOST` / `CHROMA_PORT` | set by compose | backend | Override only for local runs |
| `VITE_API_URL` | `http://localhost:8000` | admin (build arg) | Admin → backend URL |
| `VITE_WIDGET_CDN_URL` | `http://localhost:1337` | admin (build arg) | Embed snippet CDN base |

## Local frontend dev (optional)

Package manager is **pnpm** (pinned to 9.15.9 via `packageManager` in each package).

```bash
cd widget && pnpm install && pnpm dev
cd admin  && pnpm install && pnpm dev
```

## Embed snippet (Phase 0)

```html
<script src="http://localhost:1337/embed/v1/loader.js"
        data-hint-company-id="cmp_demo0001"
        data-hint-api-url="http://localhost:8000"
        defer></script>
```

- Singleton: a second tag on the same page is a no-op (console warning). The demo page
  includes a duplicate on purpose.
- Mounts `#hint-root` with an open Shadow DOM and a placeholder badge until Phase 4.

## Status

**Phase 1 (knowledge base backend) — complete.** Companies CRUD, document ingestion
(parse → chunk → embed → per-company Chroma collections), and the `/retrieve` debug
endpoint are live and curl-testable.

See `plans/hint_poc_implementation.md` (master),
`plans/phase_1_knowledge_base_backend.md` (this phase), and the architecture docs:
`docs/01-architecture-overview.md` (stack) and `docs/02-backend.md` (backend API,
ingestion pipeline, data layout).
