# Hint — Architecture Overview

> **Status: widget, Admin, and the AI layer are shipped.** Multi-user auth
> and Polar billing run on the API and in the Admin SPA
> ([`05-auth.md`](05-auth.md), [`02-backend.md`](02-backend.md#billing),
> [`04-admin.md`](04-admin.md)). Backend API contracts:
> [`02-backend.md`](02-backend.md).
> AI runtime (LangGraph chat + hints): [`06-ai-layer.md`](06-ai-layer.md).
> Admin SPA: [`04-admin.md`](04-admin.md). Auth contract:
> [`05-auth.md`](05-auth.md). Widget (embed, FSD, store, chat, hints,
> walkthroughs): [`03-widget.md`](03-widget.md).
> Tester playthrough: [`HOW_TO_PLAY.md`](HOW_TO_PLAY.md).

Hint is a browser-first AI guidance layer for SaaS web apps: an embeddable React
widget backed by a FastAPI RAG backend.
A SaaS company uploads its product docs through an admin panel, then adds a single
`<script>` tag to its app; the widget answers "how do I …?" questions grounded in
those docs plus the current page context.

## Components

| Service      | Tech                              | Port (host) | Purpose                                                  |
|--------------|-----------------------------------|-------------|----------------------------------------------------------|
| `backend`    | Python 3.12, FastAPI, uvicorn     | 8000        | API: auth, Polar billing, companies, document ingestion, retrieval, chat (SSE), hints ([`02-backend.md`](02-backend.md), [`05-auth.md`](05-auth.md), [`06-ai-layer.md`](06-ai-layer.md)) |
| `mongo`      | `mongo:7`                         | —           | `companies` (with `owner_id`), `documents` metadata, `users` (superadmin seed + registered users, plan on the user doc) |
| `chromadb`   | `chromadb/chroma:0.5.23`          | —           | Per-company vector collections `kb_{company_id}`          |
| `admin`      | React 18 + Vite + TS → nginx      | 3001        | Admin panel: sign-up, Google, Polar billing, companies, upload, snippet ([`04-admin.md`](04-admin.md)) |
| `widget-cdn` | nginx (multi-stage pnpm build)    | 1337        | Serves `loader.js` + hashed `hint-widget.{hash}.js` under `/embed/v1/` |
| `demo`       | `nginx:alpine` (static mount)     | 3002        | Fake SaaS host page carrying the embed snippet            |

All six services share one Docker network (`hint-network`). Only `backend`, `admin`,
`widget-cdn`, and `demo` are exposed to the host. ChromaDB listens on port 8000 *inside*
the network (same as the backend) — it is intentionally never mapped to the host, so
there is no conflict.

## Request flow

What works today: the admin SPA is the primary operator path; curl is the
debug path. The SPA signs in with email, Google, or a new registration, then
sends subscribed users through Polar checkout before company creation. The
seeded superadmin skips that gate. Companies/documents/billing calls
carry `Authorization: Bearer <jwt>`. `/retrieve`, `/chat`, `/hint`,
`GET /companies/{id}/widget-config`, and `/health` stay public for the widget.
`POST /webhooks/polar` is public and signature-checked.

```
Admin SPA (:3001) — see 04-admin.md / 05-auth.md:
  POST /api/v1/auth/login  {email, password} ──▶ backend ──▶ users (bcrypt) ──▶ JWT
  POST /api/v1/auth/register {email, password} ▶ backend ──▶ users (role=user) ──▶ JWT
  GET  /api/v1/auth/google/login ─────────────▶ 307 Google ──▶ callback ──▶ JWT in SPA hash
  GET  /api/v1/auth/me     Bearer ───────────▶ backend ──▶ email, role, plan, limits
  POST /api/v1/billing/checkout Bearer ──────▶ backend ──▶ Polar checkout URL
  Polar ── POST /api/v1/webhooks/polar (signed) ▶ backend ──▶ users.plan + subscription_status
  GET/POST /api/v1/companies  Bearer ────────▶ backend ──▶ MongoDB (owner-scoped; create is plan-gated)
  PATCH /api/v1/companies/{id}/widget-config Bearer ▶ backend ──▶ companies.suggested_questions
  POST /api/v1/companies/{id}/documents Bearer ▶ backend ──▶ extract → chunk (800/150) → embed → ChromaDB (kb_{id})
                                                          └─▶ MongoDB (documents metadata: processing → ready | failed)
  GET /health (no token) ────────────────────▶ backend ──▶ ping Mongo + Chroma

Widget path (public — no token):
  GET  /api/v1/companies/{id}/widget-config ─▶ backend ──▶ companies.suggested_questions (empty-state chips)
  POST /api/v1/retrieve ─────────────────────▶ backend ──▶ Chroma query (kb_{id}) → top-k chunks
  POST /api/v1/chat     (SSE) ───────────────▶ backend ──▶ LangGraph (condense → retrieve k=5 → assess page → answer)
  POST /api/v1/hint     (JSON) ──────────────▶ backend ──▶ retrieve k=3 → 1 LLM call → clamp 140 chars
                                                          └─ in-process TTL cache (sha1 key)

Widget (shipped UI):
  Browser (demo page :3002)
    └─▶ <script src="http://localhost:1337/embed/v1/loader.js" data-hint-company-id=…>
          └─▶ loader.js: singleton guard → window.__HINT__ → injects hint-widget.{hash}.js
                └─▶ #hint-root + open Shadow DOM
                      ├─ GuideBar (chat toggle, hover-hint toggle, drag dock, first-run callout)
                      ├─ ChatPanel → POST /api/v1/chat (SSE)
                      ├─ HintLayer → POST /api/v1/hint
                      └─ WalkthroughLayer (parses a completed numbered answer; no extra HTTP call)
```

End-user flow:

```
host page <script src=".../loader.js" data-hint-company-id="abc"> (singleton guard)
  └─▶ widget bundle → Shadow DOM mount
       ├─ chat:  POST /api/v1/chat  (SSE stream)   { company_id, messages, page_context }
       └─ hint:  POST /api/v1/hint  (JSON)         { company_id, element, page_context }
                     backend: LangGraph → Chroma retrieval (filtered by company) → LLM → response
```

## Compose service map

Defined in `docker-compose.yml` (local builds) and
`infrastructure/docker-compose.yml` (production GHCR images). Project
name `hint`. See [`deployment.md`](deployment.md).

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
| `OPENAI_API_KEY`  | `""` — empty still allows boot      | `${OPENAI_API_KEY:-}` from `.env`    | backend — **required** for upload, `/retrieve`, `/chat`, `/hint` (503 without it) |
| `LLM_PROVIDER`    | `openai`                            | not overridden (code default)        | backend — `create_chat_llm`; unknown value raises at first LLM call |
| `LLM_MODEL`       | `gpt-4o-mini`                       | `${LLM_MODEL:-gpt-4o-mini}`          | backend chat / hint model |
| `HINT_CACHE_TTL_SECONDS` | `3600`                       | not overridden (code default)        | backend in-process hint cache TTL |
| `HINT_CACHE_MAX_ENTRIES` | `1024`                       | not overridden (code default)        | backend hint cache cap (oldest-first eviction) |
| `EMBEDDING_MODEL` | `text-embedding-3-small`            | `${EMBEDDING_MODEL:-…}`              | backend (Phase 1) |
| `CORS_ORIGINS`    | `["*"]` (POC: widget runs on arbitrary customer origins) | not overridden | backend |
| `JWT_SECRET`      | `dev-insecure-secret-change-me` | `${JWT_SECRET:-dev-insecure-secret-change-me}` | backend — change before any shared stack; see [`05-auth.md`](05-auth.md) |
| `ACCESS_TOKEN_TTL_MINUTES` | `720` (12 h)        | `${ACCESS_TOKEN_TTL_MINUTES:-720}` | backend JWT expiry |
| `ADMIN_EMAIL`     | `admin@hint.local`              | `${ADMIN_EMAIL:-admin@hint.local}` | backend superadmin seed |
| `ADMIN_PASSWORD`  | `""` — empty skips seeding      | `${ADMIN_PASSWORD:-}`        | backend — **required** for superadmin login; register still works |
| `ADMIN_UI_URL`    | `http://localhost:3001`         | `${ADMIN_UI_URL:-http://localhost:3001}` | Google callback and Polar `success_url` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `""` — empty disables Google (503) | `${GOOGLE_CLIENT_ID:-}` / `${GOOGLE_CLIENT_SECRET:-}` | backend OAuth |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/v1/auth/google/callback` | same default | Must match the Google Cloud client |
| `POLAR_ACCESS_TOKEN` | `""` — empty → billing 503   | `${POLAR_ACCESS_TOKEN:-}`    | backend Polar API |
| `POLAR_WEBHOOK_SECRET` | `""`                         | `${POLAR_WEBHOOK_SECRET:-}`  | webhook signature check |
| `POLAR_ENVIRONMENT` | `sandbox`                     | `${POLAR_ENVIRONMENT:-sandbox}` | `sandbox` or production server |
| `POLAR_PRODUCT_ID_BASIC` / `POLAR_PRODUCT_ID_PRO` | `""` | from `.env` | Checkout products; webhook maps the Basic id, everything else to Pro |

Admin build-time variables (Vite, baked into the bundle via Docker build args in compose):

| Variable               | Compose value            | Consumed by                  |
|------------------------|--------------------------|------------------------------|
| `VITE_API_URL`         | `http://localhost:8000`  | admin (`shared/config`) — API base + snippet `data-hint-api-url` |
| `VITE_WIDGET_CDN_URL`  | `http://localhost:1337`  | admin — embed snippet `src` |

## Embed contract

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
- The loader injects the current `hint-widget.{hash}.js`, resolved relative to its
  own `src`, so loader and bundle always come from the same CDN path (`/embed/v1/`).
- The bundle mounts `#hint-root` (`position: fixed`, max z-index) with an **open
  Shadow DOM** for two-way style isolation. It renders the guide bar (chat,
  hover hints, first-run callout), not a placeholder badge.
- CDN caching: `loader.js` is `Cache-Control: no-store`. The hashed bundle
  (`hint-widget.{hash}.js` and its CSS) is
  `Cache-Control: public, max-age=31536000, immutable`. Both get
  `Access-Control-Allow-Origin: *`.

Widget architecture (FSD, store, page context, chat, hints, walkthroughs):
[`03-widget.md`](03-widget.md). The walkthrough step-list prompt stays in
[`06-ai-layer.md`](06-ai-layer.md#step-list-contract-guided-walkthroughs).

## Backend layering

`backend/app/` follows `routes/ → services/ → repositories/ → models/` (top-down only).
`ai/` sits beside `services/`: routes call `ai/` entry points, `ai/` calls
`RetrievalService`. As of Phase 3 the layers include auth, companies, documents,
retrieve, and assist (`routes/assist.py`, `ai/chat_graph.py`, `ai/hint_chain.py`,
`services/hint_cache.py`, `models/assist.py`), plus billing
(`routes/billing.py`, `routes/webhooks.py`, `services/billing_service.py`,
`models/billing.py`). Companies/documents/billing routers take
`require_user`; `/retrieve`, `/chat`, `/hint`,
`GET /companies/{id}/widget-config`, and `/health` stay public.
`POST /webhooks/polar` is signature-checked.
Full inventory: [`02-backend.md`](02-backend.md), [`03-widget.md`](03-widget.md),
[`05-auth.md`](05-auth.md), [`06-ai-layer.md`](06-ai-layer.md).

## Running the stack

```bash
cp .env.example .env
# set OPENAI_API_KEY (upload / retrieve / chat / hint) and ADMIN_PASSWORD (superadmin login)
# Google + Polar are optional at boot (those routes 503 until set) — README checklist
docker compose up --build

curl -s http://localhost:8000/health
# → {"status":"ok","mongo":"ok","chroma":"ok"}   (503 + "degraded" if a store is down)

open http://localhost:3001    # admin panel — sign in, create company, upload, copy snippet
open http://localhost:3002    # demo page — Hint guide bar at the bottom of the viewport
```

Primary operator walkthrough: [`04-admin.md`](04-admin.md) and the README.
Curl/debug path (login first, then bearer on admin routes; chat/hint are public
and need a real `OPENAI_API_KEY`):
[`02-backend.md`](02-backend.md#end-to-end-curl-walkthrough).
AI runtime: [`06-ai-layer.md`](06-ai-layer.md).

Common failure modes:

- **`pnpm install --frozen-lockfile` fails on first build** — generate
  `pnpm-lock.yaml` in `widget/` and `admin/` locally (`pnpm install`) before building.
- **Node/pnpm mismatch** — images use `node:22-alpine` with `packageManager: pnpm@9.15.9`
  pinned; do not downgrade to node:20 (corepack resolves a pnpm that needs Node ≥ 22).
- **Mongo not ready** — compose gates the backend on the Mongo healthcheck; if `/health`
  shows `"mongo":"error: …"` after startup, check `docker compose logs mongo`.
- **Superadmin login always 401** — `ADMIN_PASSWORD` was empty at boot, so seeding was
  skipped. Set it in `.env` and `docker compose up -d backend`. Self-service
  register does not need that password. Auth details: [`05-auth.md`](05-auth.md).
