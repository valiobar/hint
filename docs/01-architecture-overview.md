# Hint — Architecture Overview

> **Status: Phase 3 (AI layer) complete.**
> Backend API contracts: [`02-backend.md`](02-backend.md). AI runtime
> (LangGraph chat + hints): [`06-ai-layer.md`](06-ai-layer.md). Admin SPA:
> [`04-admin.md`](04-admin.md). Auth contract: [`05-auth.md`](05-auth.md).
> Remaining docs — `03-widget.md` (reserved for the Phase 4 widget) — land in
> Phases 4–5 per `plans/hint_poc_implementation.md`. Until that file exists,
> widget walkthrough inventory lives in this overview
> ([guided walkthroughs](#widget-feature-inventory--guided-walkthroughs)).

Hint is a browser-first AI guidance layer for SaaS web apps: an embeddable React
widget (UI in Phases 4–5) backed by a FastAPI RAG backend whose chat/hint APIs
are live as of Phase 3.
A SaaS company uploads its product docs through an admin panel, then adds a single
`<script>` tag to its app; the widget answers "how do I …?" questions grounded in
those docs plus the current page context.

## Components

| Service      | Tech                              | Port (host) | Purpose                                                  |
|--------------|-----------------------------------|-------------|----------------------------------------------------------|
| `backend`    | Python 3.12, FastAPI, uvicorn     | 8000        | API: auth, companies, document ingestion, retrieval, chat (SSE), hints ([`02-backend.md`](02-backend.md), [`05-auth.md`](05-auth.md), [`06-ai-layer.md`](06-ai-layer.md)) |
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

What works today (Phase 3 — the admin SPA is the primary operator path; curl is
the debug path). Admin companies/documents calls carry
`Authorization: Bearer <jwt>`. `/retrieve`, `/chat`, `/hint`, and `/health`
stay public for the widget.

```
Admin SPA (:3001) — see 04-admin.md / 05-auth.md:
  POST /api/v1/auth/login  {email, password} ──▶ backend ──▶ users (bcrypt) ──▶ JWT
  GET  /api/v1/auth/me     Bearer ───────────▶ backend ──▶ session restore
  GET/POST /api/v1/companies  Bearer ────────▶ backend ──▶ MongoDB (companies)
  POST /api/v1/companies/{id}/documents Bearer ▶ backend ──▶ extract → chunk (800/150) → embed → ChromaDB (kb_{id})
                                                          └─▶ MongoDB (documents metadata: processing → ready | failed)
  GET /health (no token) ────────────────────▶ backend ──▶ ping Mongo + Chroma

Widget path (public — no token; live as of Phase 3):
  POST /api/v1/retrieve ─────────────────────▶ backend ──▶ Chroma query (kb_{id}) → top-k chunks
  POST /api/v1/chat     (SSE) ───────────────▶ backend ──▶ LangGraph (condense → retrieve k=5 → assess page → answer)
  POST /api/v1/hint     (JSON) ──────────────▶ backend ──▶ retrieve k=3 → 1 LLM call → clamp 140 chars
                                                          └─ in-process TTL cache (sha1 key)

Widget (Phase 0 placeholder — UI in Phase 4):
  Browser (demo page :3002)
    └─▶ <script src="http://localhost:1337/embed/v1/loader.js" data-hint-company-id=…>
          └─▶ loader.js: singleton guard → window.__HINT__ → injects hint-widget.js
                └─▶ widget bundle: #hint-root + open Shadow DOM → placeholder badge
```

Target end-user flow (backend half is live; widget UI in Phases 4–5):

```
host page <script src=".../loader.js" data-hint-company-id="abc"> (singleton guard)
  └─▶ widget bundle → Shadow DOM mount
       ├─ chat:  POST /api/v1/chat  (SSE stream)   { company_id, messages, page_context }   ← live
       └─ hint:  POST /api/v1/hint  (JSON)         { company_id, element, page_context }   ← live
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
| `OPENAI_API_KEY`  | `""` — empty still allows boot      | `${OPENAI_API_KEY:-}` from `.env`    | backend — **required** for upload, `/retrieve`, `/chat`, `/hint` (503 without it) |
| `LLM_PROVIDER`    | `openai`                            | not overridden (code default)        | backend — `create_chat_llm`; unknown value raises at first LLM call |
| `LLM_MODEL`       | `gpt-4o-mini`                       | `${LLM_MODEL:-gpt-4o-mini}`          | backend chat / hint model |
| `HINT_CACHE_TTL_SECONDS` | `3600`                       | not overridden (code default)        | backend in-process hint cache TTL |
| `HINT_CACHE_MAX_ENTRIES` | `1024`                       | not overridden (code default)        | backend hint cache cap (oldest-first eviction) |
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

## Widget feature inventory — guided walkthroughs

`03-widget.md` is still reserved/missing (pre-existing Phase 4/5 gap). This
section is the widget-side inventory until that file exists. The prompt-level
step-list contract the parser depends on lives in
[`06-ai-layer.md`](06-ai-layer.md#step-list-contract-guided-walkthroughs).
No HTTP / SSE / Pydantic change — the widget parses completed assistant
`content` client-side.

End-to-end: user asks a how-to question → `ANSWER_SYSTEM` returns a numbered
list → `parseWalkthroughSteps` yields ≥2 steps → "Walk me through it" appears
under that message → start closes the chat panel and highlights one host
control at a time.

### Store (`widget/src/shared/store/hint-store.ts`)

`walkthrough` is **transient** — omitted from `partialize`. A reload drops
the overlay; the source assistant message (persisted) still shows the start
button.

```
walkthrough: {
  steps: Array<{ instruction: string; label: string | null }>;
  activeStepIndex: number;
} | null
```

| Action | Behavior |
|---|---|
| `startWalkthrough(steps)` | Requires `steps.length >= 2` and `!isDisabled`. Sets `activeStepIndex: 0`, closes the panel (`isOpen: false`), clears `activeHint`. |
| `nextWalkthroughStep()` | Increments index. Past the last step → `walkthrough = null` (Done / auto-advance on the last control). |
| `prevWalkthroughStep()` | Decrements, clamped at `0`. |
| `stopWalkthrough()` | `walkthrough = null`. Also bound to Escape on the host document. |
| `sendMessage()` | Clears `walkthrough` when a new chat turn starts. |
| `disableWidget()` | Clears `walkthrough` (unknown `company_id` 404 path). |
| `clearMessages()` | New-chat reset — see [Chat panel UX](#chat-panel-ux-markdown-copy-new-chat). Also clears `walkthrough` (its source message is gone). |

### Layer mount

`WalkthroughLayer` mounts next to `HintLayer` in `widget/src/app/hint-app.tsx`
(inside the open Shadow DOM under `#hint-root`). It renders nothing when
`walkthrough` is `null`.

While a walkthrough is active:

1. `useWalkthroughTarget(label, stepIndex)` resolves the current step's
   quoted label via `findElementByLabel` (excludes `#hint-root`). Retry
   window: every 200 ms for 2 s, so menus/dialogs that appear after the
   previous click can still resolve.
2. On hit: persistent host-page outline (`outlineElement`) +
   `scrollIntoView({ block: 'center' })`.
3. `WalkthroughCard` ("Step N of M" + instruction + Back / Next|Done /
   Stop) is placed by `computeCardPlacement`: below the target if it fits,
   otherwise above; `floating` (bottom-center) when there is no rect
   (unresolved label or instruction-only step).
4. Unresolved step copy: *"Can't find this element on the current page —
   do the step manually, then press Next."* Back / Next / Stop stay usable.

Chat entry: `widgets/chat-panel/ui/message-list.tsx` runs the parser only
on **completed** assistant messages (not failed, not the in-flight stream
placeholder). `WalkthroughStartButton` appears when the parser returns a
non-empty list.

### Auto-advance

`WalkthroughLayer` listens for capture-phase `pointerdown` on `document`.
If the event target is the highlighted element or a descendant (icon
inside a button), it waits **600 ms** then calls `nextWalkthroughStep`.
The delay lets the host UI react (open a menu) before the next resolve
starts. The pending timer is cleared on unmount so a manual Next / Stop
does not race.

Clicks inside the widget never auto-advance: `findElementByLabel` cannot
return a node under `#hint-root`.

Try it on the demo host after `docker compose up --build`:

```bash
open http://localhost:3002
# ask "how do I …" in the Hint panel → Walk me through it
```

### Chat panel UX (markdown, copy, new chat)

| Action | Behavior |
|---|---|
| `clearMessages()` | No-op while `isStreaming`. Resets `messages`, `chatError`, `walkthrough`. Persisted `messages` clear via the existing `partialize`. Bound to the header "New chat" button (`chat-panel-new-chat`), disabled while streaming or when there is nothing to clear. |

Assistant messages render through `MarkdownContent`
(`widget/src/shared/ui/markdown/`) over `parseMarkdownBlocks`
(`widget/src/shared/lib/markdown.ts`): paragraphs, ordered/unordered
lists, and `inline code`, with all plain-text runs delegated to
`renderWithElementChips` — chips keep working inside list items.
`MarkdownContent` takes the inline renderer as a prop, so `shared/`
never imports from `features/locate-element` (FSD boundary); the widget
layer (`message-list.tsx`) injects the chip parser. Unmatched `**bold**`
now renders as `<strong>`; unmatched `"quoted"` text stays literal prose
with quotes preserved. The walkthrough parser (`parseWalkthroughSteps`)
still consumes **raw** message content. User messages stay plain text.

Completed assistant bubbles expose a copy button (copies the **raw**
markdown, transient "Copied" state for 2 s via `useCopyToClipboard`;
requires a secure context for `navigator.clipboard` — on plain-HTTP
hosts the write fails silently with a dev console warning).

## Backend layering

`backend/app/` follows `routes/ → services/ → repositories/ → models/` (top-down only).
`ai/` sits beside `services/`: routes call `ai/` entry points, `ai/` calls
`RetrievalService`. As of Phase 3 the layers include auth, companies, documents,
retrieve, and assist (`routes/assist.py`, `ai/chat_graph.py`, `ai/hint_chain.py`,
`services/hint_cache.py`, `models/assist.py`). Companies/documents routers take
`require_admin`; `/retrieve`, `/chat`, `/hint`, and `/health` stay public.
Full inventory: [`02-backend.md`](02-backend.md), [`05-auth.md`](05-auth.md),
[`06-ai-layer.md`](06-ai-layer.md).

## Running the stack

```bash
cp .env.example .env
# set OPENAI_API_KEY (upload / retrieve / chat / hint) and ADMIN_PASSWORD (admin login)
docker compose up --build

curl -s http://localhost:8000/health
# → {"status":"ok","mongo":"ok","chroma":"ok"}   (503 + "degraded" if a store is down)

open http://localhost:3001    # admin panel — sign in, create company, upload, copy snippet
open http://localhost:3002    # demo page, one Hint badge bottom-right
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
- **Admin login always 401** — `ADMIN_PASSWORD` was empty at boot, so seeding was
  skipped. Set it in `.env` and `docker compose up -d backend`. Auth details:
  [`05-auth.md`](05-auth.md).
