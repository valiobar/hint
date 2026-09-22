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
| `backend` | FastAPI (Python 3.12) | 8000 | Auth, Polar billing, companies, document ingestion, retrieval, chat (SSE), hints (`docs/02-backend.md`, `docs/05-auth.md`, `docs/06-ai-layer.md`) |
| `mongo` | mongo:7 | — (internal) | companies (per owner), documents, users (plan on the user) |
| `chromadb` | chromadb/chroma:0.5.23 | — (internal) | per-company vector collections |
| `admin` | React + Vite → nginx | 3001 | company + KB management (`docs/04-admin.md`) |
| `widget-cdn` | Vite IIFE → nginx | 1337 | `loader.js` + hashed `hint-widget.js` |
| `demo` | static nginx | 3002 | fake SaaS host (Acme Invoicing) with the embed snippet |

Traffic: Admin / Demo / Widget (browser) → Backend (`:8000`). Mongo and
Chroma stay on the compose network only. Chroma listens on 8000 *inside*
the network (same as backend) but is never published to the host. Admin
companies/documents/billing calls send a JWT; `/retrieve`, `/chat`,
`/hint`, `GET /companies/{id}/widget-config`, and `/health` stay public
so the embed works without credentials. Polar webhooks are
signature-checked, not JWT-checked.

## Quick start

```bash
cp .env.example .env
# Required before first boot:
#   ADMIN_PASSWORD   — seeded superadmin login (empty skips that seed only)
#   OPENAI_API_KEY   — upload, /retrieve, /chat, /hint (503 without it)
# Google and Polar are optional at boot — see "One-time external setup".
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
IP. Production (DigitalOcean droplet, GHCR + `deploy.sh`) is documented
in [`docs/deployment.md`](docs/deployment.md).

## One-time external setup

The stack boots without these. The seeded superadmin
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`) can create companies and ingest files
with no Polar account. Self-service users, Google sign-in, and paid plans
need the accounts below. Click-by-click (where each token comes from,
sandbox vs production, and how to prove it in Admin):
[`plans/polar_sandbox_and_google_auth_setup.md`](plans/polar_sandbox_and_google_auth_setup.md).
API shapes: [`docs/02-backend.md`](docs/02-backend.md#register--checkout--webhook--create-company).

**Polar sandbox**

1. Create a sandbox organization at [polar.sh](https://polar.sh).
2. Create two products, **Basic** and **Pro**. Set trial days on each
   product (Hint does not store a trial length; Polar does).
3. Copy each product id into `.env` as `POLAR_PRODUCT_ID_BASIC` and
   `POLAR_PRODUCT_ID_PRO`.
4. Create an organization access token → `POLAR_ACCESS_TOKEN`.
   Leave `POLAR_ENVIRONMENT=sandbox`.
5. Add a webhook endpoint. Local Polar cannot call `localhost`. In
   another terminal run `ngrok http 8000` and set the endpoint URL to
   `https://<ngrok-host>/api/v1/webhooks/polar`. Copy the signing secret
   to `POLAR_WEBHOOK_SECRET`.
6. `docker compose up -d backend` so the container re-reads `.env`.

Handled events and the signature check:
[`docs/02-backend.md`](docs/02-backend.md#post-apiv1webhookspolar--202-signature).
Empty `POLAR_ACCESS_TOKEN` makes checkout, portal, and the webhook return
503; the rest of the API stays up.

**Google sign-in**

1. In Google Cloud Console, create an OAuth client of type **Web
   application**.
2. Authorized redirect URI must equal `GOOGLE_REDIRECT_URI`
   (default `http://localhost:8000/api/v1/auth/google/callback`).
3. Put the client id and secret in `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`. `ADMIN_UI_URL` (default
   `http://localhost:3001`) is where the callback redirects with
   `#token=…`.
4. Restart the backend. Empty `GOOGLE_CLIENT_ID` makes
   `GET /api/v1/auth/google/login` return 503.

Contract, including secret rotation: [`docs/05-auth.md`](docs/05-auth.md).

## Try it (Admin → Demo → widget)

With `ADMIN_PASSWORD` and `OPENAI_API_KEY` set, stack up:

1. Open http://localhost:3001 — login screen.
2. Sign in with `ADMIN_EMAIL` (default `admin@hint.local`) and the
   `ADMIN_PASSWORD` from `.env`. That account is the superadmin: it
   skips plan limits. A registered user needs a Polar subscription
   before `POST /companies` returns 201.
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
| First-run callout | After ~1.5 s on the first 5 page opens per company; click opens chat, X hides it for this load |
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

## Deploying to production

Same operational model as vbar-viber-bot: GitHub Actions builds images,
pushes them to GHCR (`ghcr.io/valiobar/hint-<service>:<sha>` and
`:latest`), then SSH-runs root `deploy.sh` on the VPS. The droplet
**never builds** app images.

Full operator checklist (droplet bootstrap, GitHub secrets, first
deploy): [`docs/deployment.md`](docs/deployment.md).

Admin and demo **bake** `VITE_API_URL` and `VITE_WIDGET_CDN_URL` at
**image build** time. In production those are GitHub Actions secrets
(the VPS `.env` cannot change already-built JS). Example for droplet
`159.89.26.67`:

```
VITE_API_URL=http://159.89.26.67:8000
VITE_WIDGET_CDN_URL=http://159.89.26.67:1337
```

Change `JWT_SECRET` before anyone else can reach Admin. OpenAI usage is
billed to the key in `.env`.

## Environment variables

Copy `.env.example` → `.env`. Compose injects Mongo/Chroma URLs for the
backend; the variables below are the ones you normally set on the host.

| Variable | Default | Consumed by | Notes |
|---|---|---|---|
| `IMAGE_TAG` | `latest` | compose (prod) | GHCR tag; CI writes the git SHA into the VPS `.env` |
| `ADMIN_PASSWORD` | `""` | backend | **Required** for the seeded superadmin; empty skips that seed. `POST /auth/register` still works |
| `ADMIN_EMAIL` | `admin@hint.local` | backend | Superadmin email (normalized to lowercase) |
| `JWT_SECRET` | `dev-insecure-secret-change-me` | backend | Change before any shared/deployed stack |
| `ACCESS_TOKEN_TTL_MINUTES` | `720` | backend | Access-token lifetime (no refresh token) |
| `ADMIN_UI_URL` | `http://localhost:3001` | backend | Redirect after Google and Polar checkout |
| `GOOGLE_CLIENT_ID` | `""` | backend | Empty → Google routes return 503 |
| `GOOGLE_CLIENT_SECRET` | `""` | backend | OAuth code exchange |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/v1/auth/google/callback` | backend | Must match the Google Cloud client |
| `POLAR_ACCESS_TOKEN` | `""` | backend | Empty → billing routes and the webhook return 503 |
| `POLAR_WEBHOOK_SECRET` | `""` | backend | Polar webhook signature |
| `POLAR_ENVIRONMENT` | `sandbox` | backend | `sandbox` or production |
| `POLAR_PRODUCT_ID_BASIC` | `""` | backend | Basic product (1 company, files only) |
| `POLAR_PRODUCT_ID_PRO` | `""` | backend | Pro product (10 companies, files and URLs) |
| `OPENAI_API_KEY` | `""` | backend | Required for upload, `/retrieve`, `/chat`, `/hint` (503 without it); stack boots without it |
| `LLM_PROVIDER` | `openai` | backend | Chat / hint factory; unknown value raises at first LLM call |
| `LLM_MODEL` | `gpt-4o-mini` | backend | Chat / hint model |
| `HINT_CACHE_TTL_SECONDS` | `3600` | backend | In-process hint cache TTL (cleared on backend restart) |
| `HINT_CACHE_MAX_ENTRIES` | `1024` | backend | Hint cache cap (oldest-first eviction) |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | backend | Document embeddings |
| `MONGODB_URL` | set by compose | backend | Override only for local (non-Docker) runs |
| `MONGODB_DB_NAME` | `hint` (compose) | backend | Database name |
| `CHROMA_HOST` / `CHROMA_PORT` | set by compose | backend | Override only for local runs |
| `VITE_API_URL` | `http://localhost:8000` | admin + demo (build arg) | Admin → backend URL + snippet `data-hint-api-url`. Production: GitHub secret, inlined at image build |
| `VITE_WIDGET_CDN_URL` | `http://localhost:1337` | admin + demo (build arg) | Embed snippet CDN base. Production: GitHub secret, inlined at image build |

## Local frontend dev (optional)

Package manager is **pnpm** (pinned to 9.15.9 via `packageManager` in
each package). Run the backend via compose (or local uvicorn) first.

```bash
cd widget && pnpm install && pnpm dev
cd admin  && pnpm install && pnpm dev
```

## Debug path: curl

Same flow over HTTP. Obtain a token first — companies/documents/billing
return 401 without it. The sample below uses the superadmin, who is not
plan-gated. Register → checkout → webhook is a separate walkthrough in
`docs/02-backend.md`. `POST /api/v1/retrieve`, `/chat`, `/hint`, and
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

- **Admin** — email sign-up and sign-in, Google, Polar Basic / Pro checkout,
  companies, ingest, embed snippet, starter questions. The seeded superadmin
  skips billing.
- **Widget** — Shadow DOM guide bar, streamed chat, empty-state
  starter chips, hover hints, chips, walkthroughs, markdown / copy /
  new chat
- **Backend** — multi-user auth, Polar plans (Basic / Pro), LangGraph
  RAG chat (SSE), and cached hover hints

This is still a POC: no OCR, no server-side chat history, hint cache is
in-process, no refresh tokens. Plan limits apply to registered users;
the seeded superadmin bypasses them.

## Docs

| Doc | Content |
|---|---|
| [`docs/HOW_TO_PLAY.md`](docs/HOW_TO_PLAY.md) | Product walkthrough and feature checklist |
| [`docs/deployment.md`](docs/deployment.md) | Production: GHCR images, `deploy.sh`, droplet + GitHub secrets |
| [`docs/01-architecture-overview.md`](docs/01-architecture-overview.md) | Stack, ports, embed contract |
| [`docs/02-backend.md`](docs/02-backend.md) | API + ingestion |
| [`docs/03-widget.md`](docs/03-widget.md) | Widget architecture, dependencies, runtime |
| [`docs/04-admin.md`](docs/04-admin.md) | Admin SPA |
| [`docs/05-auth.md`](docs/05-auth.md) | Auth contract |
| [`docs/06-ai-layer.md`](docs/06-ai-layer.md) | LangGraph, SSE, hint cache, walkthrough prompt |
| [`demo/ADMIN_USER_MANUAL.md`](demo/ADMIN_USER_MANUAL.md) | Operator screens and errors |
| [`demo/USER_MANUAL.md`](demo/USER_MANUAL.md) | Acme Invoicing demo controls |
