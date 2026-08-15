# Phase 0 — Repo Scaffold & Infrastructure (Detailed Implementation Plan)

> Parent plan: `plans/hint_poc_implementation.md` (Phase 0, Steps 0.1–0.2).
> Goal: a monorepo where `docker compose up --build` boots the full stack — Mongo,
> ChromaDB, FastAPI backend (with `/health`), admin SPA shell, widget CDN (nginx serving
> a placeholder `loader.js` + bundle), and a demo host page. No business logic yet.

## Overview

Phase 0 creates the skeleton every later phase plugs into:

- **Monorepo layout**: `backend/`, `widget/`, `admin/`, `demo/`, `docs/`, `plans/` plus
  root-level compose, env template, and README.
- **Backend**: FastAPI app with `BaseSettings` config, lifespan-managed Mongo + Chroma
  clients, permissive CORS, and a `/health` endpoint that verifies both stores are
  reachable. Layered folders (`routes/`, `services/`, `repositories/`, `models/`, `db/`,
  `ai/`) are created empty (with `__init__.py`) so Phase 1+ steps only add files.
- **Widget**: Vite + React + TS project with an IIFE build named `hint-widget.js`, a
  placeholder mount (console log + tiny badge in Shadow DOM proving isolation works), and
  the real `loader.js` with the singleton guard (written once here, reused unchanged in
  Phase 4). Multi-stage Dockerfile → nginx serving `/embed/v1/`.
- **Admin**: Vite + React + TS shell ("Hint Admin" placeholder page), multi-stage
  Dockerfile → nginx.
- **Demo**: static placeholder page already carrying the embed snippet (+ duplicate tag),
  served by stock nginx.
- **Compose**: all six services on one network, health-checked startup order, named
  volumes for Mongo/Chroma data, only backend/admin/widget-cdn/demo exposed to the host.

**Exit criteria**: `docker compose up --build` succeeds from a clean checkout;
`curl localhost:8000/health` returns `{"status":"ok","mongo":"ok","chroma":"ok"}`;
`localhost:3001` shows the admin shell; `localhost:1337/embed/v1/loader.js` serves the
loader; `localhost:3002` shows the demo page with the placeholder widget badge mounted
once (duplicate tag ignored).

## Pros / Cons

**Pros**

- All infrastructure decisions (ports, env vars, service names, build pipelines) are made
  once; Phases 1–6 only add application code — no Dockerfile/compose churn later.
- The placeholder widget already exercises the full delivery chain (script tag → loader →
  CDN bundle → Shadow DOM mount → singleton guard), so the riskiest embed mechanics are
  proven before any AI work starts.
- `/health` checking Mongo **and** Chroma catches misconfigured networking on day one
  instead of mid-Phase-1.
- Empty layered packages committed up front make later diffs small and reviewable.

**Cons / accepted trade-offs**

- Full `chromadb` package in the backend image is heavy (~500 MB image); acceptable for a
  POC, could switch to the thin `chromadb-client` later.
- Admin and widget are rebuilt via Docker on every change (no dev-server containers with
  hot reload in compose); local `pnpm dev` covers the dev loop instead.
- CORS is `*` and Mongo/Chroma have no auth — fine on a local compose network, listed as a
  hardening item in the parent plan (Phase 6).
- `requirements.txt` already includes Phase 1–3 deps (langchain, langgraph, pypdf) so the
  image doesn't change per phase — slightly slower first build in exchange for stability.

## Current State Analysis

### ✅ Existing

- `plans/hint_poc_implementation.md` — approved master plan.
- `.cursor/rules/` — workspace rules.
- Reference for the widget build/CDN pattern: `~/Projects/marketing-app`
  (Vite IIFE build, loader.js, nginx CDN container, pnpm).

### ❌ Missing Components (all of Phase 0)

- ✅ Root files: `.gitignore`, `.env.example`, `.editorconfig`, `README.md` (stub) — Step 1
- ✅ `docker-compose.yml` — Step 9
- ✅ Backend package skeleton (`app/` with layered subpackages) — Step 2
- ✅ Backend `config.py` (BaseSettings) — Step 3
- ✅ Backend `db/mongo.py`, `db/chroma.py` + FastAPI dependencies — Step 4
- ✅ Backend `main.py` (lifespan, CORS, `/health`) — Step 5
- ✅ Backend `Dockerfile`, `requirements.txt` — Step 6
- ✅ Widget Vite project + placeholder entry + `loader.js` + nginx Dockerfile — Step 7
- ✅ Admin Vite project shell + nginx Dockerfile — Step 8
- ✅ Demo placeholder page — Step 9
- ✅ Initial `docs/` (architecture overview + run instructions) — Step 11

---

## Implementation Steps

### ✅ Step 1: Root scaffold — folders, gitignore, editorconfig, env template

**File(s)**: `.gitignore`, `.editorconfig`, `.env.example`, `README.md` (stub),
empty dirs `backend/`, `widget/`, `admin/`, `demo/`, `docs/`

**Changes**:
- Create the monorepo top level. `.env.example` documents every variable any service
  reads; `README.md` gets a stub filled in properly in Step 10.
- `.editorconfig` enforces UTF-8 (required by the planning rule for `plans/*.md`).

**Pseudo-code**:

```gitignore
# .gitignore
.env
__pycache__/
*.pyc
.venv/
node_modules/
dist/
.DS_Store
```

```ini
# .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true

[*.py]
indent_style = space
indent_size = 4

[*.{ts,tsx,js,json,yml,yaml}]
indent_style = tab
```

```bash
# .env.example
# --- backend ---
OPENAI_API_KEY=sk-...            # required from Phase 1 (ingestion/chat); stack boots without it
LLM_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
# set automatically inside compose; override only for local (non-docker) runs:
# MONGODB_URL=mongodb://localhost:27017/hint
# CHROMA_HOST=localhost
# CHROMA_PORT=8001
```

### ✅ Step 2: Backend package skeleton (layered layout)

**File(s)**:
`backend/app/__init__.py`, `backend/app/main.py` (filled in Step 5),
`backend/app/config.py` (Step 3), and empty packages:
`backend/app/routes/__init__.py`, `backend/app/services/__init__.py`,
`backend/app/repositories/__init__.py`, `backend/app/models/__init__.py`,
`backend/app/db/__init__.py`, `backend/app/ai/__init__.py`,
`backend/tests/__init__.py`

**Changes**:
- Create the full layered structure now so Phase 1–3 steps only add modules and never
  reshuffle imports.

**Pseudo-code**:

```text
backend/
├── Dockerfile
├── requirements.txt
├── app/
│   ├── __init__.py
│   ├── main.py            # Step 5
│   ├── config.py          # Step 3
│   ├── db/                # Step 4: mongo.py, chroma.py
│   ├── routes/            # Phase 1+
│   ├── services/          # Phase 1+
│   ├── repositories/      # Phase 1+
│   ├── models/            # Phase 1+
│   └── ai/                # Phase 3
└── tests/
```

### ✅ Step 3: Backend settings (`BaseSettings`)

**File(s)**: `backend/app/config.py`

**Changes**:
- Pydantic `BaseSettings` reading from env (and `.env` for local non-docker runs).
- `openai_api_key` defaults to `""` so the Phase 0 stack boots without a key; Phase 1
  code fails fast with a clear error when it is actually needed.
- Cached accessor via `lru_cache` so settings are constructed once.

**Pseudo-code**:

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_url: str = "mongodb://localhost:27017/hint"
    mongodb_db_name: str = "hint"
    chroma_host: str = "localhost"
    chroma_port: int = 8000

    openai_api_key: str = ""          # required from Phase 1; empty allows Phase 0 boot
    llm_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"

    cors_origins: list[str] = ["*"]   # POC: widget runs on arbitrary customer origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### ✅ Step 4: Database clients — Mongo + Chroma modules and FastAPI dependencies

**File(s)**: `backend/app/db/mongo.py`, `backend/app/db/chroma.py`

**Changes**:
- Module-level holders initialized/closed by the lifespan (Step 5); typed `get_db` /
  `get_chroma` FastAPI dependencies for later routes.
- Chroma via `chromadb.HttpClient`; its calls are sync, so later phases wrap them with
  `run_in_threadpool` — the client module stays dumb.
- Each module exposes a `ping()` used by `/health`.

**Pseudo-code**:

```python
# backend/app/db/mongo.py
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import get_settings

_client: AsyncIOMotorClient | None = None


def connect() -> None:
    global _client
    _client = AsyncIOMotorClient(get_settings().mongodb_url)


def close() -> None:
    if _client is not None:
        _client.close()


def get_db() -> AsyncIOMotorDatabase:
    assert _client is not None, "Mongo client not initialized"
    return _client[get_settings().mongodb_db_name]


async def ping() -> bool:
    await get_db().command("ping")
    return True
```

```python
# backend/app/db/chroma.py
import chromadb
from chromadb.api import ClientAPI
from fastapi.concurrency import run_in_threadpool
from app.config import get_settings

_client: ClientAPI | None = None


def connect() -> None:
    global _client
    settings = get_settings()
    _client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)


def get_chroma() -> ClientAPI:
    assert _client is not None, "Chroma client not initialized"
    return _client


async def ping() -> bool:
    await run_in_threadpool(get_chroma().heartbeat)
    return True
```

### ✅ Step 5: FastAPI app — lifespan, CORS, `/health`

**File(s)**: `backend/app/main.py`

**Changes**:
- Lifespan connects/closes both clients; CORS from settings; `/health` reports overall
  status plus per-dependency status (`mongo`, `chroma`) and returns 503 if either is down.
- Router includes for `companies`/`documents`/`assist` are added in Phases 1/3 — Phase 0
  deliberately registers no business routers (deviation from the condensed master-plan
  pseudo-code, which showed the final state).

**Pseudo-code**:

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import chroma, mongo


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo.connect()
    chroma.connect()
    yield
    mongo.close()


app = FastAPI(title="Hint Backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> JSONResponse:
    statuses: dict[str, str] = {}
    for name, dep in (("mongo", mongo), ("chroma", chroma)):
        try:
            await dep.ping()
            statuses[name] = "ok"
        except Exception as exc:                      # noqa: BLE001 — health must not raise
            statuses[name] = f"error: {type(exc).__name__}"
    healthy = all(v == "ok" for v in statuses.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "degraded", **statuses},
    )
```

### ✅ Step 6: Backend `requirements.txt` + `Dockerfile`

**File(s)**: `backend/requirements.txt`, `backend/Dockerfile`

**Changes**:
- Pin major versions of everything Phases 0–3 need so the image is stable across phases.
- `python:3.12-slim`, non-root user, uvicorn on :8000, container healthcheck hits
  `/health` using stdlib (no curl in slim image).

**Pseudo-code**:

```txt
# backend/requirements.txt
fastapi>=0.115,<1
uvicorn[standard]>=0.30,<1
motor>=3.5,<4
pydantic-settings>=2.4,<3
chromadb>=0.5,<0.6
langchain>=0.3,<0.4
langgraph>=0.2,<0.3
langchain-openai>=0.2,<0.3
pypdf>=4.3,<5
python-multipart>=0.0.9
sse-starlette>=2.1,<3
```

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### ✅ Step 7: Widget scaffold — Vite IIFE build, loader.js, placeholder mount, nginx image

**File(s)**: `widget/package.json`, `widget/vite.config.ts`, `widget/tsconfig.json`,
`widget/src/lib.tsx`, `widget/src/global.d.ts`, `widget/public/loader.js`,
`widget/Dockerfile`, `widget/nginx.conf`

**Changes**:
- pnpm project; Vite `build.lib` in IIFE mode emitting a single self-contained
  `hint-widget.js` (React bundled in — the host page provides nothing).
- `loader.js` is the **final** loader (singleton guard + attribute parsing from the master
  plan Step 4.1) — written once here, not a throwaway.
- `lib.tsx` mounts a placeholder badge inside a Shadow DOM so Phase 0 already proves
  isolation + mount; Phase 4 replaces the placeholder component only.
- nginx serves both files under `/embed/v1/` with permissive CORS and no-cache on
  `loader.js` (bundle can be cached).

**Pseudo-code**:

```jsonc
// widget/package.json (essentials)
{
	"name": "hint-widget",
	"private": true,
	"scripts": { "dev": "vite", "build": "tsc -b && vite build" },
	"dependencies": { "react": "^18.3.0", "react-dom": "^18.3.0", "zustand": "^5.0.0" },
	"devDependencies": { "typescript": "~5.6.0", "vite": "^5.4.0", "@vitejs/plugin-react": "^4.3.0" }
}
```

```typescript
// widget/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: {
		lib: {
			entry: 'src/lib.tsx',
			name: 'HintWidget',
			formats: ['iife'],
			fileName: () => 'hint-widget.js',
		},
	},
});
```

```typescript
// widget/public/loader.js (final version — plain JS, no build step)
(() => {
	if (window.__HINT__) {
		console.warn('Hint is already initialized on this page');
		return;
	}
	const tag = document.currentScript;
	const companyId = tag && tag.getAttribute('data-hint-company-id');
	if (!companyId) {
		console.error('Hint: data-hint-company-id is required');
		return;
	}
	window.__HINT__ = {
		companyId,
		apiUrl: tag.getAttribute('data-hint-api-url') || 'http://localhost:8000',
	};
	const script = document.createElement('script');
	script.src = new URL('hint-widget.js', tag.src).href;
	script.defer = true;
	document.head.appendChild(script);
})();
```

```tsx
// widget/src/lib.tsx — Phase 0 placeholder mount (Phase 4 swaps <PlaceholderBadge /> for <HintApp />)
import { createRoot } from 'react-dom/client';

const PlaceholderBadge = ({ companyId }: { companyId: string }) => (
	<div className="badge" data-testid="hint-placeholder-badge">
		Hint · {companyId}
	</div>
);

const mount = () => {
	const config = window.__HINT__;
	if (!config || config.mounted) {
		return;
	}
	config.mounted = true;
	const host = document.createElement('div');
	host.id = 'hint-root';
	host.style.cssText = 'position:fixed;z-index:2147483647;';
	document.body.appendChild(host);
	const shadow = host.attachShadow({ mode: 'open' });
	const style = document.createElement('style');
	style.textContent = '.badge{position:fixed;bottom:16px;right:16px;padding:8px 12px;' +
		'border-radius:8px;background:#111;color:#fff;font:12px sans-serif;}';
	shadow.appendChild(style);
	const container = document.createElement('div');
	shadow.appendChild(container);
	createRoot(container).render(<PlaceholderBadge companyId={config.companyId} />);
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', mount);
} else {
	mount();
}
```

```typescript
// widget/src/global.d.ts
interface HintGlobal {
	companyId: string;
	apiUrl: string;
	mounted?: boolean;
}

interface Window {
	__HINT__?: HintGlobal;
}
```

```dockerfile
# widget/Dockerfile — multi-stage: pnpm build → nginx
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/hint-widget.js /usr/share/nginx/html/embed/v1/
COPY --from=build /app/public/loader.js       /usr/share/nginx/html/embed/v1/
```

```nginx
# widget/nginx.conf
server {
    listen 80;

    location /embed/v1/ {
        root /usr/share/nginx/html;
        add_header Access-Control-Allow-Origin *;

        location = /embed/v1/loader.js {
            root /usr/share/nginx/html;
            add_header Access-Control-Allow-Origin *;
            add_header Cache-Control "no-cache";
        }
    }
}
```

### ✅ Step 8: Admin SPA shell + nginx image

**File(s)**: `admin/package.json`, `admin/vite.config.ts`, `admin/tsconfig.json`,
`admin/index.html`, `admin/src/main.tsx`, `admin/src/app.tsx`,
`admin/src/config.ts`, `admin/Dockerfile`, `admin/nginx.conf`

**Changes**:
- Standard Vite React SPA. Phase 0 renders a shell page ("Hint Admin" header + note
  that company management arrives in Phase 2) and reads `VITE_API_URL` /
  `VITE_WIDGET_CDN_URL` (build args) into a typed config module.
- Same multi-stage Dockerfile pattern as the widget; nginx with SPA fallback.

**Pseudo-code**:

```tsx
// admin/src/config.ts
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
export const WIDGET_CDN_URL: string = import.meta.env.VITE_WIDGET_CDN_URL ?? 'http://localhost:1337';

// admin/src/app.tsx — Phase 0 shell
export const App = () => (
	<main className={styles.shell}>
		<h1>Hint Admin</h1>
		<p>Company &amp; knowledge-base management arrives in Phase 2.</p>
		<ApiStatusBadge />   {/* fetches `${API_URL}/health`, shows ok/degraded */}
	</main>
);
```

```dockerfile
# admin/Dockerfile
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
ARG VITE_API_URL
ARG VITE_WIDGET_CDN_URL
ENV VITE_API_URL=$VITE_API_URL VITE_WIDGET_CDN_URL=$VITE_WIDGET_CDN_URL
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

```nginx
# admin/nginx.conf — SPA fallback
server {
    listen 80;
    root /usr/share/nginx/html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### ✅ Step 9: Demo host page + `docker-compose.yml`

**File(s)**: `demo/index.html`, `docker-compose.yml`

**Changes**:
- Demo page: minimal fake-SaaS markup (nav + two buttons + form — enough for Phase 5
  hover targets later) with the embed snippet **and a duplicate tag** to prove the
  singleton guard from day one. Company ID is a placeholder until Phase 1 can create one.
- Compose: six services, one network, health-gated ordering, named volumes. Chroma's
  container port is 8000 (same as backend) — never exposed to the host, so no conflict.

**Pseudo-code**:

```html
<!-- demo/index.html -->
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Acme Invoicing — Demo Host</title></head>
<body>
  <nav><a href="#">Invoices</a> <a href="#">Reports</a> <a href="#">Settings</a></nav>
  <main>
    <h1>Invoices</h1>
    <button id="export-report" type="button">Export report</button>
    <form>
      <input name="customer" placeholder="Customer name">
      <button type="submit">Create invoice</button>
    </form>
  </main>

  <script src="http://localhost:1337/embed/v1/loader.js"
          data-hint-company-id="cmp_demo0001"
          data-hint-api-url="http://localhost:8000" defer></script>
  <!-- duplicate on purpose: must be a no-op (singleton guard) -->
  <script src="http://localhost:1337/embed/v1/loader.js"
          data-hint-company-id="cmp_other" defer></script>
</body>
</html>
```

```yaml
# docker-compose.yml
name: hint

services:
  mongo:
    image: mongo:7
    volumes:
      - mongo-data:/data/db
    networks: [hint-network]
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 3s
      retries: 10

  chromadb:
    image: chromadb/chroma:0.5.23
    volumes:
      - chroma-data:/chroma/chroma
    networks: [hint-network]

  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - MONGODB_URL=mongodb://mongo:27017/hint
      - MONGODB_DB_NAME=hint
      - CHROMA_HOST=chromadb
      - CHROMA_PORT=8000
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - LLM_MODEL=${LLM_MODEL:-gpt-4o-mini}
      - EMBEDDING_MODEL=${EMBEDDING_MODEL:-text-embedding-3-small}
    depends_on:
      mongo: { condition: service_healthy }
      chromadb: { condition: service_started }
    networks: [hint-network]

  admin:
    build:
      context: ./admin
      args:
        VITE_API_URL: http://localhost:8000
        VITE_WIDGET_CDN_URL: http://localhost:1337
    ports: ["3001:80"]
    depends_on: [backend]
    networks: [hint-network]

  widget-cdn:
    build: ./widget
    ports: ["1337:80"]
    networks: [hint-network]

  demo:
    image: nginx:alpine
    volumes:
      - ./demo:/usr/share/nginx/html:ro
    ports: ["3002:80"]
    depends_on: [widget-cdn]
    networks: [hint-network]

networks:
  hint-network: {}

volumes:
  mongo-data: {}
  chroma-data: {}
```

### ✅ Step 10: Verification pass + README

**File(s)**: `README.md`

**Changes**:
- Run the full stack from a clean state and execute the checklist below; fix anything
  broken (typical suspects: Chroma image tag/heartbeat path, pnpm lockfile missing on
  first build — run `pnpm install` locally once to generate lockfiles before building).
- Write the real README: what Hint is (2 sentences), architecture table, exact run
  commands, ports, env vars, and current status (Phase 0 complete).

**Deviation (build fix)**: `corepack` on `node:20-alpine` resolved pnpm 11, which needs
Node ≥ 22 (`node:sqlite`). Fixed by bumping `widget/` + `admin/` Dockerfiles to
`node:22-alpine`, pinning `packageManager: pnpm@9.15.9`, and adding `.dockerignore`
files so `node_modules` is not sent as build context.

**Pseudo-code**:

```markdown
# README.md (skeleton)
# Hint POC
Browser-first AI guidance layer: embeddable widget + FastAPI RAG backend.

## Quick start
cp .env.example .env        # add OPENAI_API_KEY (needed from Phase 1)
docker compose up --build

| Service    | URL                                      |
|------------|------------------------------------------|
| Backend    | http://localhost:8000 (/health, /docs)   |
| Admin      | http://localhost:3001                    |
| Widget CDN | http://localhost:1337/embed/v1/loader.js |
| Demo page  | http://localhost:3002                    |

## Status
Phase 0 (scaffold & infrastructure) — see plans/hint_poc_implementation.md
```

```bash
# verification commands
docker compose up --build -d
curl -s http://localhost:8000/health          # {"status":"ok","mongo":"ok","chroma":"ok"}
curl -sI http://localhost:1337/embed/v1/loader.js | head -1   # HTTP/1.1 200
open http://localhost:3002                    # badge bottom-right, exactly one
docker compose down && docker compose up -d   # data survives (named volumes)
```

### ✅ Step 11: Update Documentation (MANDATORY)

**File(s)**: `docs/01-architecture-overview.md`

**Changes**:
- Greenfield repo, so this step **creates** the initial doc rather than updating:
  component table + request-flow diagram (from the master plan), compose service map with
  ports, env var table (variable → default → consuming service), and the embed contract
  as it exists after Phase 0 (`loader.js` attributes, singleton behavior, Shadow DOM
  mount, placeholder badge).
- Remaining docs (`02-backend`, `03-widget`, `04-admin`, `05-api-contracts`) stay
  deferred to their phases per the master plan — noted explicitly in the doc header.

**Pseudo-code**:

```markdown
# docs/01-architecture-overview.md (skeleton)
# Hint — Architecture Overview
> Status: Phase 0. Docs 02–05 are added in later phases.

## Components
| Service    | Tech            | Port (host) | Purpose                        |
|------------|-----------------|-------------|--------------------------------|
| backend    | FastAPI 3.12    | 8000        | API, RAG, chat/hint (Phase 1+) |
| mongo      | mongo:7         | —           | companies, documents metadata  |
| chromadb   | chroma:0.5.23   | —           | per-company vector collections |
| admin      | React/Vite      | 3001        | company + KB management        |
| widget-cdn | nginx           | 1337        | loader.js + widget bundle      |
| demo       | nginx           | 3002        | fake SaaS host page            |

## Environment variables
| Variable        | Default          | Consumed by |
|-----------------|------------------|-------------|
| OPENAI_API_KEY  | "" (Phase 1+)    | backend     |
| MONGODB_URL     | set by compose   | backend     |
| ...             |                  |             |

## Embed contract (Phase 0)
<script src=".../embed/v1/loader.js" data-hint-company-id="..." [data-hint-api-url="..."] defer>
- Singleton: second tag on the same page is a no-op (console warning)
- Mounts #hint-root with an open Shadow DOM; placeholder badge until Phase 4
```

---

## Edge Cases

- **First build without lockfiles** → `pnpm install --frozen-lockfile` fails; Step 10
  requires generating `pnpm-lock.yaml` for `widget/` and `admin/` locally before the first
  compose build.
- **Chroma port collision confusion** → Chroma listens on 8000 inside the network like the
  backend; only the backend maps 8000 to the host. Never expose Chroma.
- **`OPENAI_API_KEY` missing** → stack must still boot in Phase 0 (key defaults to `""`);
  `.env.example` documents when it becomes required.
- **Mongo not ready when backend starts** → `depends_on.condition: service_healthy` gates
  startup; `/health` still reports `degraded` (503) if a store dies later.
- **`document.currentScript` is null** (loader injected via `innerHTML` or loaded async
  in exotic ways) → loader logs an error and aborts instead of throwing.
- **Widget script tag before `</body>` vs in `<head>`** → `lib.tsx` waits for
  `DOMContentLoaded` when the document is still loading, so both placements work.
- **Duplicate loader tags** → `window.__HINT__` guard: second tag warns and no-ops
  (demo page includes a duplicate tag to keep this permanently tested).
- **Host page has max z-index elements** → host node uses `z-index: 2147483647` +
  `position: fixed`; Shadow DOM prevents style bleed in both directions.
- **Stale widget bundle cached by browser** → `loader.js` served with `Cache-Control:
  no-cache`; content-hashed bundle filenames are a Phase 4/6 improvement, noted not blocking.

## Testing Checklist

- [x] `docker compose up --build` completes from a clean checkout with only
      `cp .env.example .env` done (no API key) ✅ Step 10
- [x] `curl localhost:8000/health` → 200 `{"status":"ok","mongo":"ok","chroma":"ok"}` ✅ Step 10
- [ ] `docker compose stop chromadb` → `/health` returns 503 with `"chroma":"error: …"`;
      `start` restores 200
- [x] `localhost:8000/docs` renders (FastAPI OpenAPI UI) ✅ Step 10
- [x] `localhost:3001` shows admin shell; API status badge reads "ok" ✅ Step 10
- [x] `curl -I localhost:1337/embed/v1/loader.js` → 200, `Cache-Control: no-cache`,
      `Access-Control-Allow-Origin: *` ✅ Step 10
- [x] `localhost:3002` shows demo page with exactly **one** Hint badge (bottom-right) ✅ Step 10
- [x] Browser console on demo page: warning about the duplicate tag, no errors ✅ Step 10
      (only harmless `favicon.ico` 404)
- [x] Badge survives host-page CSS (Shadow DOM): demo `<style>` rules don't affect it ✅ Step 10
- [x] `docker compose down && docker compose up -d` → Mongo/Chroma volumes persist ✅ Step 10
- [x] `docker compose config` validates; no orphan/unused env vars ✅ Step 10

## Files to Modify (all new)

- [x] `.gitignore`, `.editorconfig`, `.env.example` ✅ Step 1
- [x] `README.md` ✅ Step 1 (stub); ✅ Step 10 (full content)
- [x] `docker-compose.yml` ✅ Step 9
- [x] `backend/Dockerfile`, `backend/requirements.txt` ✅ Step 6
- [x] `backend/app/__init__.py` + empty layered packages (`routes/`, `services/`,
      `repositories/`, `models/`, `db/`, `ai/`, `tests/`) ✅ Step 2
- [x] `backend/app/config.py` ✅ Step 3
- [x] `backend/app/db/mongo.py`, `backend/app/db/chroma.py` ✅ Step 4
- [x] `backend/app/main.py` ✅ Step 5
- [x] `widget/package.json`, `widget/pnpm-lock.yaml`, `widget/vite.config.ts`,
      `widget/tsconfig.json` ✅ Step 7
- [x] `widget/src/lib.tsx`, `widget/src/global.d.ts`, `widget/public/loader.js` ✅ Step 7
- [x] `widget/Dockerfile`, `widget/nginx.conf` ✅ Step 7
- [x] `admin/package.json`, `admin/pnpm-lock.yaml`, `admin/vite.config.ts`,
      `admin/tsconfig.json`, `admin/index.html` ✅ Step 8
- [x] `admin/src/main.tsx`, `admin/src/app.tsx`, `admin/src/config.ts` ✅ Step 8
- [x] `admin/Dockerfile`, `admin/nginx.conf` ✅ Step 8
- [x] `demo/index.html` ✅ Step 9
- [x] `docs/01-architecture-overview.md` ✅ Step 11

## Implementation Order

1. **Step 1** — root scaffold (folders, gitignore, editorconfig, env template)
2. **Steps 2–6** — backend: skeleton → config → db clients → main → Dockerfile
   (Steps 3 and 4 are independent; 5 depends on both)
3. **Step 7** — widget (independent of backend; can run in parallel with 2–6)
4. **Step 8** — admin (independent; its status badge just needs the backend URL)
5. **Step 9** — demo page + compose (needs service names/ports from all previous steps)
6. **Step 10** — full-stack verification + README
7. **Step 11** — **Update Documentation (mandatory final step)**
