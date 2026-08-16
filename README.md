# Hint POC

Browser-first AI guidance layer for SaaS apps: an embeddable Shadow DOM
widget plus a FastAPI RAG backend. A company uploads product docs in
Admin; end users on a host page get chat answers, hover hints, and
on-page walkthroughs grounded in that knowledge and the live page.

**New here?** Follow [`docs/HOW_TO_PLAY.md`](docs/HOW_TO_PLAY.md) — what
the app does, the feature list, a 15-minute playthrough, and a sample
doc to upload.

## Architecture

| Service | Tech | Host port | Purpose |
|---|---|---|---|
| `backend` | FastAPI (Python 3.12) | 8000 | Auth, companies, document ingestion, retrieval, chat (SSE), hints (`docs/02-backend.md`, `docs/05-auth.md`, `docs/06-ai-layer.md`) |
| `mongo` | mongo:7 | — (internal) | companies, documents, users |
| `chromadb` | chromadb/chroma:0.5.23 | — (internal) | per-company vector collections |
| `admin` | React + Vite → nginx | 3001 | company + KB management (`docs/04-admin.md`) |
| `widget-cdn` | Vite IIFE → nginx | 1337 | `loader.js` + hashed `hint-widget.js` |
| `demo` | static nginx | 3002 | fake SaaS host (Acme Invoicing) with the embed snippet |

Traffic: Admin / Demo / Widget (browser) → Backend (`:8000`). Mongo and
Chroma stay on the compose network only. Chroma listens on 8000 *inside*
the network (same as backend) but is never published to the host. Admin
companies/documents calls send a JWT; `/retrieve`, `/chat`, `/hint`,
`GET /companies/{id}/widget-config`, and `/health` stay public so the
embed works without credentials.

## Quick start

```bash
cp .env.example .env
# Required before first boot:
#   ADMIN_PASSWORD   — preset admin login (empty disables login entirely)
#   OPENAI_API_KEY   — upload, /retrieve, /chat, /hint (503 without it)
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

On a remote host, keep the same ports and replace `localhost` with that
IP. See [Deploying beyond localhost](#deploying-beyond-localhost).

## Try it (Admin → Demo → widget)

With `ADMIN_PASSWORD` and `OPENAI_API_KEY` set, stack up:

1. Open http://localhost:3001 — login screen.
2. Sign in with `ADMIN_EMAIL` (default `admin@hint.local`) and the
   `ADMIN_PASSWORD` from `.env`.
3. Create a company (name, 1–100 characters). Copy the `cmp_…` id.
4. Drop or browse product docs (`.pdf`, `.md`, `.txt`, `.html`, ≤ 10 MB).
   Rows go `uploading` → `ready` (or `failed` — e.g. a scanned PDF).
5. Under the embed snippet, save 3 starter questions (optional). Open
   the demo **with that company** (do not skip the query param):

   ```
   http://localhost:3002/?company_id=cmp_YOUR_ID
   ```

6. Use the Hint guide bar (bottom of the viewport): empty chat shows
   those chips (click one to send it), lightbulb for hover hints,
   **Walk me through it** on numbered how-to answers. Reload the host
   after editing questions in Admin — the widget caches them in memory
   until then.

Reload stays signed in on Admin (token in `localStorage`). Sign out
clears it. A 401 returns you to the login screen.

A leftover `cmp_…` hardcoded in `demo/index.html` is almost always from
another machine and will 404 on this stack. Always override with
`?company_id=`.

Full playthrough, feature list, and a sample markdown KB:
[`docs/HOW_TO_PLAY.md`](docs/HOW_TO_PLAY.md).
Admin internals: `docs/04-admin.md`. Auth: `docs/05-auth.md`.
Demo controls: `demo/USER_MANUAL.md`.

## Widget features

The widget mounts `#hint-root` with an **open Shadow DOM** (style
isolation from the host page).

| Feature | What to expect |
|---|---|
| Guide bar | Chat toggle + lightbulb (hover-hint mode); drag to dock left/right |
| Chat | SSE token stream, source filenames, follow-ups, page-aware answers |
| Starter chips | Empty-state chips from Admin (`GET …/widget-config`, in-memory cache; reload to pick up edits) |
| Markdown | Numbered/bullet lists and inline code in assistant bubbles |
| Element chips | Quoted / bold control names; click flashes or acts on the host control |
| Copy answer | Copies raw markdown from a finished assistant bubble (needs a secure context; may no-op on plain `http://`) |
| New chat | Clears the thread (`sessionStorage` follows) |
| Hover hints | ≤ 140 characters after ~0.5 s dwell; repeats hit an in-process cache |
| Walkthrough | **Walk me through it** on ≥ 2 numbered steps; highlights one control at a time |

Chat history is `sessionStorage` per company (survives refresh, not a
new browser tab’s first visit). Walkthrough state is not persisted.

## Embed snippet

Admin copies this with the selected `company_id` baked in:

```html
<script src="http://localhost:1337/embed/v1/loader.js"
        data-hint-company-id="cmp_YOUR_ID"
        data-hint-api-url="http://localhost:8000"
        defer></script>
```

- `data-hint-company-id` — **required**; loader aborts without it.
- `data-hint-api-url` — backend the widget calls. If omitted, the loader
  falls back to `http://localhost:8000` (wrong on a remote host).
- **Singleton guard**: a second tag on the same page is a no-op
  (console warning). The demo page includes a duplicate on purpose.
- `loader.js` is `Cache-Control: no-store`; it injects the current
  hashed `hint-widget.{hash}.js` from the same CDN path (`/embed/v1/`).

## Deploying beyond localhost

Admin **bakes** `VITE_API_URL` and `VITE_WIDGET_CDN_URL` at **image
build** time (`docker-compose.yml` build args). The browser uses those
values, not “whatever host you opened”. If they stay
`http://localhost:8000`, login from another machine calls *that
machine’s* localhost and fails.

For a public IP (example `YOUR_IP`):

1. Quote the URLs in compose (YAML treats `:port` as nested mapping
   otherwise):

   ```yaml
   args:
     VITE_API_URL: "http://YOUR_IP:8000"
     VITE_WIDGET_CDN_URL: "http://YOUR_IP:1337"
   ```

2. Point `demo/index.html` (and any embed snippet) at the same host —
   not `localhost`.
3. Rebuild admin so the JS bundle picks up the args:

   ```bash
   docker compose build --no-cache admin
   docker compose up -d
   ```

4. Open Demo as `http://YOUR_IP:3002/?company_id=cmp_…` using a company
   created **on that server**.

Change `JWT_SECRET` before anyone else can reach Admin. OpenAI usage is
billed to the key in `.env`.

## Environment variables

Copy `.env.example` → `.env`. Compose injects Mongo/Chroma URLs for the
backend; the variables below are the ones you normally set on the host.

| Variable | Default | Consumed by | Notes |
|---|---|---|---|
| `ADMIN_PASSWORD` | `""` | backend | **Required** for admin login; empty skips seeding and every login is 401 |
| `ADMIN_EMAIL` | `admin@hint.local` | backend | Preset admin email (normalized to lowercase) |
| `JWT_SECRET` | `dev-insecure-secret-change-me` | backend | Change before any shared/deployed stack |
| `ACCESS_TOKEN_TTL_MINUTES` | `720` | backend | Access-token lifetime (no refresh token in the POC) |
| `OPENAI_API_KEY` | `""` | backend | Required for upload, `/retrieve`, `/chat`, `/hint` (503 without it); stack boots without it |
| `LLM_PROVIDER` | `openai` | backend | Chat / hint factory; unknown value raises at first LLM call |
| `LLM_MODEL` | `gpt-4o-mini` | backend | Chat / hint model |
| `HINT_CACHE_TTL_SECONDS` | `3600` | backend | In-process hint cache TTL (cleared on backend restart) |
| `HINT_CACHE_MAX_ENTRIES` | `1024` | backend | Hint cache cap (oldest-first eviction) |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | backend | Document embeddings |
| `MONGODB_URL` | set by compose | backend | Override only for local (non-Docker) runs |
| `MONGODB_DB_NAME` | `hint` (compose) | backend | Database name |
| `CHROMA_HOST` / `CHROMA_PORT` | set by compose | backend | Override only for local runs |
| `VITE_API_URL` | `http://localhost:8000` | admin (build arg) | Admin → backend URL + snippet `data-hint-api-url` |
| `VITE_WIDGET_CDN_URL` | `http://localhost:1337` | admin (build arg) | Embed snippet CDN base |

## Local frontend dev (optional)

Package manager is **pnpm** (pinned to 9.15.9 via `packageManager` in
each package). Run the backend via compose (or local uvicorn) first.

```bash
cd widget && pnpm install && pnpm dev
cd admin  && pnpm install && pnpm dev
```

## Debug path: curl

Same flow over HTTP. Obtain a token first — companies/documents return
401 without it. `POST /api/v1/retrieve`, `/chat`, `/hint`, and
`GET /api/v1/companies/{id}/widget-config` stay public (widget path).
Full contracts: `docs/02-backend.md`. AI runtime:
`docs/06-ai-layer.md`.

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

Without `OPENAI_API_KEY`, the stack still boots but upload, `/retrieve`,
`/chat`, and `/hint` return `503`. A scanned/image-only PDF is marked
`"status": "failed"` (no OCR in the POC) — the rest of the batch still
ingests.

Chat (SSE) and hints, once a company has a `ready` document:

```bash
PAGE_CTX='{"url":"https://app.acme.com/reports","title":"Reports",
  "headings":["Reports"],"visible_text_excerpt":"Monthly reports overview",
  "interactive":[{"tag":"button","text":"Export report","role":null,
    "attrs":{"id":"export-report"},"selector_path":"main > button#export-report"}]}'

# Chat — SSE token stream (-N disables curl buffering)
curl -N -s -X POST localhost:8000/api/v1/chat \
  -H 'Content-Type: application/json' \
  -d "{\"company_id\":\"cmp_1a2b3c4d\",
       \"messages\":[{\"role\":\"user\",\"content\":\"How do I export a report?\"}],
       \"page_context\":$PAGE_CTX}"
# → event: token … then event: done  {"sources":["user-manual.pdf"]}

# Hint — one sentence ≤ 140 chars; second identical call is a cache hit
curl -s -X POST localhost:8000/api/v1/hint \
  -H 'Content-Type: application/json' \
  -d "{\"company_id\":\"cmp_1a2b3c4d\",
       \"element\":{\"tag\":\"button\",\"text\":\"Export report\",\"role\":null,
         \"attrs\":{\"id\":\"export-report\"},\"selector_path\":\"main > button#export-report\"},
       \"page_context\":$PAGE_CTX}"
# → {"hint":"…","source":"user-manual.pdf"}
```

Swagger UI at http://localhost:8000/docs lists both under the `assist`
tag.

## Status

Widget + Admin + AI layer are in one runnable POC:

- **Admin** — preset-admin JWT, companies, ingest, embed snippet,
  starter questions
- **Widget** — Shadow DOM guide bar, streamed chat, empty-state
  starter chips, hover hints, chips, walkthroughs, markdown / copy /
  new chat
- **Backend** — LangGraph RAG chat (SSE) and cached hover hints

This is still a POC: one admin user, no OCR, no server-side chat
history, hint cache is in-process.

## Docs

| Doc | Content |
|---|---|
| [`docs/HOW_TO_PLAY.md`](docs/HOW_TO_PLAY.md) | Product walkthrough and feature checklist |
| [`docs/01-architecture-overview.md`](docs/01-architecture-overview.md) | Stack, ports, widget inventory |
| [`docs/02-backend.md`](docs/02-backend.md) | API + ingestion |
| [`docs/04-admin.md`](docs/04-admin.md) | Admin SPA |
| [`docs/05-auth.md`](docs/05-auth.md) | Auth contract |
| [`docs/06-ai-layer.md`](docs/06-ai-layer.md) | LangGraph, SSE, hint cache, walkthrough prompt |
| [`demo/ADMIN_USER_MANUAL.md`](demo/ADMIN_USER_MANUAL.md) | Operator screens and errors |
| [`demo/USER_MANUAL.md`](demo/USER_MANUAL.md) | Acme Invoicing demo controls |
