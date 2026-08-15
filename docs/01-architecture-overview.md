# Hint — Architecture Overview

> **Status: Phase 2 (admin panel + preset-admin auth) complete.**
> Backend API contracts: [`02-backend.md`](02-backend.md). Admin SPA:
> [`04-admin.md`](04-admin.md). Auth contract: [`05-auth.md`](05-auth.md).
> Remaining docs — `03-widget.md` and chat/hint API contracts — land in
> Phases 3–5 per `plans/hint_poc_implementation.md`.

Hint is a browser-first AI guidance layer for SaaS web apps: an embeddable React
widget (chat + hover hints, arriving in Phases 3–5) backed by a FastAPI RAG backend.
A SaaS company uploads its product docs through an admin panel, then adds a single
`<script>` tag to its app; the widget answers "how do I …?" questions grounded in
those docs plus the current page context.

## Components

| Service      | Tech                              | Port (host) | Purpose                                                  |
|--------------|-----------------------------------|-------------|----------------------------------------------------------|
| `backend`    | Python 3.12, FastAPI, uvicorn     | 8000        | API: auth, companies, document ingestion, retrieval ([`02-backend.md`](02-backend.md), [`05-auth.md`](05-auth.md)); chat/hints in Phase 3 |
| `mongo`      | `mongo:7`                         | —           | `companies`, `documents` metadata, `users` (preset admin) |
| `chromadb`   | `chromadb/chroma:0.5.23`          | —           | Per-company vector collections `kb_{company_id}`          |
| `admin`      | React 18 + Vite + TS → nginx      | 3001        | Full admin panel: login, companies, upload, snippet ([`04-admin.md`](04-admin.md)) |
| `widget-cdn` | nginx (multi-stage pnpm build)    | 1337        | Serves `loader.js` + `hint-widget.js` under `/embed/v1/` |
| `demo`       | `nginx:alpine` (static mount)     | 3002        | Fake SaaS host page carrying the embed snippet            |

All six services share one Docker network (`hint-network`). Only `backend`, `admin`,
`widget-cdn`, and `demo` are exposed to the host. ChromaDB listens on port 8000 *inside*
the network (same as the backend) — it is intentionally never mapped to the host, so
there is no conflict.

## Request flow

What works today (Phase 2 — the admin SPA is the primary operator path; curl is
the debug path). Admin companies/documents calls carry
`Authorization: Bearer <jwt>`. `/retrieve` and `/health` stay public for the widget.

```
Admin SPA (:3001) — see 04-admin.md / 05-auth.md:
  POST /api/v1/auth/login  {email, password} ──▶ backend ──▶ users (bcrypt) ──▶ JWT
  GET  /api/v1/auth/me     Bearer ───────────▶ backend ──▶ session restore
  GET/POST /api/v1/companies  Bearer ────────▶ backend ──▶ MongoDB (companies)
  POST /api/v1/companies/{id}/documents Bearer ▶ backend ──▶ extract → chunk (800/150) → embed → ChromaDB (kb_{id})
                                                          └─▶ MongoDB (documents metadata: processing → ready | failed)
  GET /health (no token) ────────────────────▶ backend ──▶ ping Mongo + Chroma

Widget path (public — no token):
  POST /api/v1/retrieve ─────────────────────▶ backend ──▶ Chroma query (kb_{id}) → top-k chunks {text, filename, score}

Widget (Phase 0 placeholder):
  Browser (demo page :3002)
    └─▶ <script src="http://localhost:1337/embed/v1/loader.js" data-hint-company-id=…>
          └─▶ loader.js: singleton guard → window.__HINT__ → injects hint-widget.js
                └─▶ widget bundle: #hint-root + open Shadow DOM → placeholder badge
```

Target end-user flow (from the master plan; built out in Phases 3–5):

```
host page <script src=".../loader.js" data-hint-company-id="abc"> (singleton guard)
  └─▶ widget bundle → Shadow DOM mount
       ├─ chat:  POST /api/v1/chat  (SSE stream)   { company_id, messages, page_context }
       └─ hint:  POST /api/v1/hint  (JSON)         { company_id, element, page_context }
                     backend: LangGraph → Chroma retrieval (filtered by company) → LLM → response
```

## Compose service map

Defined in `docker-compose.yml` (project name `hint`):

| Service      | Build / image                   | Host port | Depends on                            | Volumes                    |
|--------------|---------------------------------|-----------|----------------------------------------|----------------------------|
| `mongo`      | `mongo:7`                       | —         | — (healthcheck: `mongosh ping`)         | `mongo-data:/data/db`      |
| `chromadb`   | `chromadb/chroma:0.5.23`        | —         | —                                       | `chroma-data:/chroma/chroma` |
| `backend`    | `./backend` (python:3.12-slim)  | 8000      | `mongo` (healthy), `chromadb` (started) | —                          |
| `admin`      | `./admin` (node:22 → nginx)     | 3001      | `backend`                               | —                          |
| `widget-cdn` | `./widget` (node:22 → nginx)    | 1337      | —                                       | —                          |
| `demo`       | `nginx:alpine`                  | 3002      | `widget-cdn`                            | `./demo` (read-only bind)  |

Startup order: Mongo must pass its healthcheck and Chroma must start before the backend
boots; the backend's own container healthcheck polls `/health` (stdlib `urllib`, no curl
in the slim image). The backend still reports `degraded` (HTTP 503) if a store dies later.

## Environment variables

Backend settings are defined in `backend/app/config.py` (Pydantic `BaseSettings`, reads
env vars and `.env` for local non-Docker runs). Template: `.env.example`.

| Variable          | Default (settings)                  | Set by compose to                    | Consumed by |
|-------------------|-------------------------------------|--------------------------------------|-------------|
| `MONGODB_URL`     | `mongodb://localhost:27017/hint` | `mongodb://mongo:27017/hint`      | backend     |
| `MONGODB_DB_NAME` | `hint`                           | `hint`                            | backend     |
| `CHROMA_HOST`     | `localhost`                         | `chromadb`                           | backend     |
| `CHROMA_PORT`     | `8000`                              | `8000`                               | backend     |
| `OPENAI_API_KEY`  | `""` — empty still allows boot      | `${OPENAI_API_KEY:-}` from `.env`    | backend — **required** for document upload and `/retrieve` (503 without it) |
| `LLM_MODEL`       | `gpt-4o-mini`                       | `${LLM_MODEL:-gpt-4o-mini}`          | backend (Phase 3) |
| `EMBEDDING_MODEL` | `text-embedding-3-small`            | `${EMBEDDING_MODEL:-…}`              | backend (Phase 1) |
| `CORS_ORIGINS`    | `["*"]` (POC: widget runs on arbitrary customer origins) | not overridden | backend |
| `JWT_SECRET`      | `dev-insecure-secret-change-me` | `${JWT_SECRET:-dev-insecure-secret-change-me}` | backend — change before any shared stack; see [`05-auth.md`](05-auth.md) |
| `ACCESS_TOKEN_TTL_MINUTES` | `720` (12 h)        | `${ACCESS_TOKEN_TTL_MINUTES:-720}` | backend JWT expiry |
| `ADMIN_EMAIL`     | `admin@hint.local`              | `${ADMIN_EMAIL:-admin@hint.local}` | backend preset-admin seed |
| `ADMIN_PASSWORD`  | `""` — empty skips seeding      | `${ADMIN_PASSWORD:-}`        | backend — **required** for admin login |

Admin build-time variables (Vite, baked into the bundle via Docker build args in compose):

| Variable               | Compose value            | Consumed by                  |
|------------------------|--------------------------|------------------------------|
| `VITE_API_URL`         | `http://localhost:8000`  | admin (`shared/config`) — API base + snippet `data-hint-api-url` |
| `VITE_WIDGET_CDN_URL`  | `http://localhost:1337`  | admin — embed snippet `src` |

## Embed contract (Phase 0)

```html
<script src="http://localhost:1337/embed/v1/loader.js"
        data-hint-company-id="cmp_demo0001"
        data-hint-api-url="http://localhost:8000" defer></script>
```

- `data-hint-company-id` — **required**; loader logs an error and aborts without it.
- `data-hint-api-url` — optional; defaults to `http://localhost:8000`.
- **Singleton guard**: the loader sets `window.__HINT__`; a second tag on the same
  page is a no-op with a console warning (the demo page includes a duplicate tag to keep
  this permanently tested).
- The loader injects `hint-widget.js`, resolved relative to its own `src`, so loader
  and bundle always come from the same CDN path (`/embed/v1/`).
- The bundle mounts `#hint-root` (`position: fixed`, max z-index) with an **open
  Shadow DOM** for two-way style isolation. In Phase 0 it renders a placeholder badge
  ("Hint · {companyId}", bottom-right); Phase 4 swaps in the real widget UI only.
- CDN caching: `loader.js` is served with `Cache-Control: no-cache`; both files get
  `Access-Control-Allow-Origin: *`.

## Backend layering

`backend/app/` follows `routes/ → services/ → repositories/ → models/` (top-down only).
As of Phase 2 the layers include auth (`routes/auth.py`, `services/auth_service.py`,
`repositories/user_repo.py`, `models/user.py`) plus companies, documents, and retrieve.
Companies/documents routers take `require_admin`; `/retrieve` and `/health` stay public.
`ai/` remains reserved for Phase 3 (LangGraph). Full inventory:
[`02-backend.md`](02-backend.md), [`05-auth.md`](05-auth.md).

## Running the stack

```bash
cp .env.example .env
# set OPENAI_API_KEY (upload/retrieve) and ADMIN_PASSWORD (admin login) — both required
docker compose up --build

curl -s http://localhost:8000/health
# → {"status":"ok","mongo":"ok","chroma":"ok"}   (503 + "degraded" if a store is down)

open http://localhost:3001    # admin panel — sign in, create company, upload, copy snippet
open http://localhost:3002    # demo page, one Hint badge bottom-right
```

Primary operator walkthrough: [`04-admin.md`](04-admin.md) and the README.
Curl/debug path (login first, then bearer on admin routes):
[`02-backend.md`](02-backend.md#end-to-end-curl-walkthrough).

Common failure modes:

- **`pnpm install --frozen-lockfile` fails on first build** — generate
  `pnpm-lock.yaml` in `widget/` and `admin/` locally (`pnpm install`) before building.
- **Node/pnpm mismatch** — images use `node:22-alpine` with `packageManager: pnpm@9.15.9`
  pinned; do not downgrade to node:20 (corepack resolves a pnpm that needs Node ≥ 22).
- **Mongo not ready** — compose gates the backend on the Mongo healthcheck; if `/health`
  shows `"mongo":"error: …"` after startup, check `docker compose logs mongo`.
- **Admin login always 401** — `ADMIN_PASSWORD` was empty at boot, so seeding was
  skipped. Set it in `.env` and `docker compose up -d backend`. Auth details:
  [`05-auth.md`](05-auth.md).
