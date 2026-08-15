# Hint POC

Browser-first AI guidance layer for SaaS apps: an embeddable Shadow DOM widget plus a
FastAPI RAG backend. Companies upload product docs; end users get chat answers and hover
hints grounded in that knowledge and the live page context.

## Architecture

| Service | Tech | Host port | Purpose |
|---|---|---|---|
| `backend` | FastAPI (Python 3.12) | 8000 | Auth, companies, document ingestion, retrieval (`docs/02-backend.md`, `docs/05-auth.md`); chat in Phase 3 |
| `mongo` | mongo:7 | — (internal) | companies, documents, users |
| `chromadb` | chromadb/chroma:0.5.23 | — (internal) | per-company vector collections |
| `admin` | React + Vite → nginx | 3001 | company + KB management (`docs/04-admin.md`) |
| `widget-cdn` | Vite IIFE → nginx | 1337 | `loader.js` + `hint-widget.js` |
| `demo` | static nginx | 3002 | fake SaaS host with embed snippet |

Traffic: Admin / Demo / Widget (browser) → Backend (:8000). Mongo and Chroma stay on the
compose network only. Chroma listens on 8000 inside the network (same as backend) but is
never published to the host. Admin companies/documents calls send a JWT; `/retrieve` and
`/health` stay public so the embed works without credentials.

## Quick start

```bash
cp .env.example .env
# Required before first boot:
#   ADMIN_PASSWORD   — preset admin login (empty disables login entirely)
#   OPENAI_API_KEY   — document upload and /retrieve (503 without it)
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

## Admin walkthrough (primary)

With `ADMIN_PASSWORD` and `OPENAI_API_KEY` set, stack up:

1. Open http://localhost:3001 — login screen.
2. Sign in with `ADMIN_EMAIL` (default `admin@hint.local`) and the `ADMIN_PASSWORD`
   from `.env`.
3. Create a company (name, 1–100 characters). It appears in the sidebar and is
   auto-selected.
4. Drop or browse product docs (`.pdf`, `.md`, `.txt`, `.html`, ≤ 10 MB). Rows go
   `uploading` → `ready` (or `failed` with a reason — e.g. a scanned PDF).
5. Copy the embed snippet from the company detail pane and paste it into a host page.

Reload stays signed in (token in `localStorage`). Sign out clears it. A 401
(expired/tampered token) returns you to the login screen instead of an error wall.

Full FSD map, store actions, and failure modes: `docs/04-admin.md`.
Auth contract (seeding, JWT, rotation): `docs/05-auth.md`.

## Debug path: curl

Same flow over HTTP. Obtain a token first — companies/documents return 401 without it.
`POST /api/v1/retrieve` stays public (widget path). Full contracts:
`docs/02-backend.md`.

```bash
TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@hint.local","password":"YOUR_ADMIN_PASSWORD"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

curl -s -X POST localhost:8000/api/v1/companies \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name": "Acme Corp"}'
# → {"company_id":"cmp_1a2b3c4d","name":"Acme Corp","created_at":"…"}

curl -s -X POST "localhost:8000/api/v1/companies/cmp_1a2b3c4d/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@user-manual.pdf" -F "files=@faq.md"

curl -s -X POST localhost:8000/api/v1/retrieve \
  -H 'Content-Type: application/json' \
  -d '{"company_id": "cmp_1a2b3c4d", "query": "how do I export a report?", "k": 3}'
```

Without `OPENAI_API_KEY`, the stack still boots but upload and `/retrieve` return
`503` with an actionable message. A scanned/image-only PDF is marked
`"status": "failed"` (no OCR in the POC) — the rest of the batch still ingests.

## Environment variables

Copy `.env.example` → `.env`. Compose injects Mongo/Chroma URLs for the backend; the
variables below are the ones you normally set on the host.

| Variable | Default | Consumed by | Notes |
|---|---|---|---|
| `ADMIN_PASSWORD` | `""` | backend | **Required** for admin login; empty skips seeding and every login is 401 |
| `ADMIN_EMAIL` | `admin@hint.local` | backend | Preset admin email (normalized to lowercase) |
| `JWT_SECRET` | `dev-insecure-secret-change-me` | backend | Change before any shared/deployed stack |
| `ACCESS_TOKEN_TTL_MINUTES` | `720` | backend | Access-token lifetime (no refresh token in the POC) |
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

The admin panel copies this with the selected `company_id` baked in:

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

**Phase 2 (admin panel + preset-admin auth) — complete.** Sign in, create a company,
upload docs, copy the snippet. Companies/documents require a JWT; `/retrieve` stays
public for the widget. Admin auth landed here instead of the Phase 6 hardening pass.

See `plans/hint_poc_implementation.md` (master),
`plans/phase_2_admin_panel.md` (this phase), and the architecture docs:
`docs/01-architecture-overview.md` (stack), `docs/02-backend.md` (API + ingestion),
`docs/04-admin.md` (admin SPA), `docs/05-auth.md` (auth contract).
