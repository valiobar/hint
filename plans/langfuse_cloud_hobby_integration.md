# Langfuse Cloud (Hobby) Observability for Hint — Implementation Plan

> **Status: plan only — nothing below is implemented yet.**
> Scope: LLM tracing/observability for the Hint backend via **Langfuse Cloud
> Hobby (free tier)**, project **`hint-staging`**. Self-hosted Langfuse is
> explicitly out of scope for this plan (a later plan can revisit).
> Docs reviewed before planning: `docs/01-architecture-overview.md`,
> `docs/02-backend.md`, `docs/04-admin.md`, `docs/06-ai-layer.md`,
> `docs/deployment.md`.

## Overview

Hint's AI layer (`backend/app/ai/`) makes up to three LLM calls per chat
request (condense → assess → answer, orchestrated by a LangGraph graph in
`chat_graph.py`) and one LLM call per hint (`hint_chain.py`). Today there is
zero visibility into prompts, completions, token usage, latency, or cost —
debugging a bad answer means reproducing it locally.

This plan wires the **Langfuse Python SDK (v3) LangChain `CallbackHandler`**
into both real invoke paths so every chat and hint produces a trace in
Langfuse Cloud with nested LLM generations, token counts, latency, and
(approximate) cost. The integration is:

- **Feature-flagged**: `LANGFUSE_ENABLED=false` by default; when disabled (or
  when keys are missing) the code path is a no-op and behavior is identical
  to today. Existing tests keep passing with no Langfuse env set.
- **Layered like the rest of the backend**: only `app/ai/` touches the
  Langfuse SDK (new `app/ai/observability.py`), mirroring the existing rule
  that only `ai/` constructs LLM clients. Routes just pass an opaque
  LangChain `config` through.
- **Staging-first**: one Cloud Hobby project `hint-staging`. Production
  enablement is a separate decision after the PII review in Guardrails.

One Langfuse Cloud organization can later host projects for other apps;
this plan scopes **Hint only**.

### Observability ≠ billing source of truth (important)

Langfuse cost numbers are for **dashboards and debugging, not customer
billing**:

- `deepseek-flash` is served through an OpenAI-compatible API and is **not**
  in Langfuse's built-in model price list — cost shows as `0` /unknown until
  a **custom model definition** with prices is added in project settings
  (Step 9), and even then it is approximate (e.g. DeepSeek's cache-hit
  discounts and pricing changes are not modeled).
- Token usage is whatever the provider reports on the OpenAI-compatible
  response; streaming paths can under-report on some providers.
- When Hint bills customers for usage later, the source of truth must be a
  **usage ledger owned by Hint** (e.g. a Mongo `usage_events` collection
  written by the backend per request). That ledger is out of scope here and
  must be its own plan; nothing in this plan may be repurposed as billing.

## Pros / Cons

**Pros**

- Immediate visibility into every chat/hint: full prompt chain, per-node
  LLM generations, tokens, latency, approximate cost — no code-side logging
  to build or store.
- Cloud Hobby is free (no card), so zero infra to run — no new compose
  service, no Postgres/ClickHouse to babysit (vs self-hosting now).
- LangChain-native callback: one handler traces the whole LangGraph graph
  (condense/assess/answer nested under one trace) with no per-node code.
- Feature flag + missing-keys fail-safe means zero risk to the request
  path; disabled == today's behavior, and existing tests run unchanged.
- Tags/metadata (`company:{id}`, `chat`/`hint`) give per-tenant filtering in
  the Langfuse UI for free, useful for debugging a specific customer.
- Foundation for later evals: the same project hosts golden datasets and
  scores (optional v1.2, PR3).

**Cons / accepted trade-offs**

- **Data leaves our infra**: prompts include end-user chat messages and
  `page_context` (page text excerpt, element labels) sent to Langfuse Cloud
  (EU region). Accepted for staging; production enablement requires the
  PII review in Guardrails.
- Hobby cap ~**50k units/month** — roughly 4–6 observations per chat
  (trace + graph spans + up to 3 generations) and ~2 per hint. Fine for
  staging traffic; a demo blast could eat the quota (Langfuse drops
  overage rather than billing, but traces are then lost).
- Cost figures are approximate (custom price entry, see above) — never a
  billing source.
- SSE latency: the callback handler batches in a background thread, so
  request latency impact is negligible, but a hard container kill can lose
  the last unflushed events (mitigated by shutdown flush, Step 8).
- One more dependency (`langfuse`) in the backend image.
- Per-conversation grouping (Langfuse `session_id`) is **not** possible
  without a wire-contract change: the widget is stateless and
  `ChatRequest` has no conversation id. Deferred (see Edge Cases).

## Current State Analysis

### ✅ Existing (verified in repo)

- ✅ LangChain/LangGraph stack: `langchain>=0.3,<0.4`, `langgraph>=0.2,<0.3`,
  `langchain-openai>=0.2,<0.3` in `backend/requirements.txt` — Langfuse's
  LangChain integration slots straight in.
- ✅ Two and only two LLM invoke paths, both in `app/ai/`:
  - chat: `routes/assist.py::chat` → `build_chat_graph(...)` →
    `graph.astream_events(initial_state, version="v2")` (no `config` passed
    today — the insertion point).
  - hint: `routes/assist.py::hint` → `generate_hint(...)` →
    `hint_llm.ainvoke(prompt)` (also `config`-less today).
- ✅ Default LLM is DeepSeek via OpenAI-compatible API:
  `LLM_PROVIDER=deepseek`, `DEEPSEEK_MODEL=deepseek-flash`
  (`app/config.py`, `.env.example`) — needs custom model pricing in
  Langfuse.
- ✅ Settings pattern: pydantic-settings in `backend/app/config.py`, env
  passed through both `docker-compose.yml` (local) and
  `infrastructure/docker-compose.yml` (VPS) with `${VAR:-default}`.
- ✅ Lifespan hook in `backend/app/main.py` (`lifespan`) — place for the
  shutdown flush.
- ✅ Unit-test infra with fake LLMs (`GenericFakeChatModel` in
  `backend/tests/conftest.py`) — new tests follow the same style.
- ✅ Hint cache (`services/hint_cache.py`) sits **in front of**
  `generate_hint`, so cache hits will correctly produce no trace.

### ❌ Missing Components

- ❌ Langfuse Cloud account / org / project `hint-staging` + API keys
- ❌ `langfuse` dependency in `backend/requirements.txt`
- ❌ Settings: `langfuse_enabled` / `langfuse_public_key` /
  `langfuse_secret_key` / `langfuse_host` in `app/config.py`
- ❌ Env plumbing: `.env.example`, `docker-compose.yml`,
  `infrastructure/docker-compose.yml`
- ❌ `backend/app/ai/observability.py` (client singleton, handler factory,
  `trace_config()` helper, shutdown flush)
- ❌ Wiring into `routes/assist.py` (chat) and `ai/hint_chain.py` (hint)
- ❌ Shutdown flush in `main.py`
- ❌ Custom model price entry for `deepseek-flash` in the Langfuse project
- ❌ Tests: `backend/tests/test_observability.py`
- ❌ Docs updates (`docs/06-ai-layer.md`, `docs/02-backend.md`, README,
  `docs/deployment.md`)
- ❌ (optional v1.1, PR2) Admin "Open in Langfuse" link
- ❌ (optional v1.2, PR3) Golden evals dataset + runner + scores

---

# Implementation Steps

Steps 1–10 are **PR1** (core tracing). Step 11 is **PR2** (optional admin
link). Step 12 is **PR3** (optional golden evals). Step 13 (docs) closes PR1
(and each later PR updates docs for its own scope).

## PR1 — Tracing + env + docs

### Step 1: Langfuse Cloud signup and project (manual, no code)

**File(s)**: none (external setup; secrets go into local/VPS `.env` only —
**never committed**)

**Changes**:
- Sign up at Langfuse Cloud, **EU region** (`https://cloud.langfuse.com`);
  Hobby tier, no card required.
- Create organization (e.g. `hint`), then project **`hint-staging`**.
- Project → Settings → API Keys → create key pair; note the public key
  (`pk-lf-…`), secret key (`sk-lf-…`), and host URL.
- Put the three values into the **staging** `.env` (local dev and/or VPS),
  alongside `LANGFUSE_ENABLED=true` when ready to test.

**Pseudo-code** (resulting `.env` fragment on the machine that runs the
stack — not committed):

```bash
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx
LANGFUSE_HOST=https://cloud.langfuse.com
```

### Step 2: Backend settings

**File(s)**: `backend/app/config.py`

**Changes**:
- Add four fields to `Settings`, defaults chosen so an unset environment is
  a hard no-op (`langfuse_enabled: bool = False`).

**Pseudo-code**:

```python
class Settings(BaseSettings):
    # ... existing fields ...

    # Langfuse observability (staging-first; tracing only, never billing)
    langfuse_enabled: bool = False
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"
```

**Code Location**: `backend/app/config.py`, after the Polar block (~line 44)

### Step 3: Env plumbing (example file + both compose files)

**File(s)**: `.env.example`, `docker-compose.yml`,
`infrastructure/docker-compose.yml`

**Changes**:
- `.env.example`: document the four vars in the backend section with a
  comment that keys are per-environment secrets and cost in Langfuse is
  approximate (not billing). Keys stay empty in the example.
- Both compose files: pass the vars into the `backend` service with safe
  defaults (`LANGFUSE_ENABLED:-false`).

**Pseudo-code** (`.env.example` addition):

```bash
# --- Langfuse observability (optional; staging-first) ---
# LANGFUSE_ENABLED=false          # true → trace /chat and /hint to Langfuse Cloud
# LANGFUSE_PUBLIC_KEY=            # pk-lf-… from project hint-staging (never commit real keys)
# LANGFUSE_SECRET_KEY=            # sk-lf-…
# LANGFUSE_HOST=https://cloud.langfuse.com   # EU region
```

**Pseudo-code** (both compose files, `backend.environment`):

```yaml
      - LANGFUSE_ENABLED=${LANGFUSE_ENABLED:-false}
      - LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY:-}
      - LANGFUSE_SECRET_KEY=${LANGFUSE_SECRET_KEY:-}
      - LANGFUSE_HOST=${LANGFUSE_HOST:-https://cloud.langfuse.com}
```

**Code Location**: `docker-compose.yml` backend `environment` block
(after `DEEPSEEK_BASE_URL`); same spot in
`infrastructure/docker-compose.yml`.

### Step 4: Dependency

**File(s)**: `backend/requirements.txt`

**Changes**:
- Add the Langfuse SDK v3 (OTel-based; ships the LangChain
  `CallbackHandler` under `langfuse.langchain`). Pin major version like the
  other deps.

**Pseudo-code**:

```text
langfuse>=3,<4
```

**Code Location**: next to the other AI deps (`langchain-openai` line)

### Step 5: Observability module (`app/ai/observability.py`)

**File(s)**: `backend/app/ai/observability.py` (new)

**Changes**:
- Lazy process-singleton `Langfuse` client, created **only** when
  `langfuse_enabled` and both keys are non-empty (fail-safe: misconfig
  degrades to "tracing off", never a request error).
- `trace_config(name, company_id, tags)` returns a LangChain
  `RunnableConfig` dict (callbacks + trace attributes via the
  `langfuse_*` metadata keys the v3 handler reads) or `None` when disabled.
- `shutdown_langfuse()` flushes the background queue (called from lifespan).
- `user_id` is the **tenant** (`company_id`) — end users are anonymous on
  the public widget endpoints; no personal identifier exists or should be
  invented.

**Pseudo-code**:

```python
from langfuse import Langfuse
from langfuse.langchain import CallbackHandler

from app.config import get_settings

_client: Langfuse | None = None


def _get_client() -> Langfuse | None:
    global _client
    settings = get_settings()
    if not (
        settings.langfuse_enabled
        and settings.langfuse_public_key
        and settings.langfuse_secret_key
    ):
        return None
    if _client is None:
        _client = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
    return _client


def trace_config(*, name: str, company_id: str) -> dict | None:
    """RunnableConfig for graph/LLM invokes; None when tracing is off."""
    if _get_client() is None:
        return None
    settings = get_settings()
    return {
        "callbacks": [CallbackHandler()],
        "run_name": name,  # trace name: "chat" | "hint"
        "metadata": {
            "langfuse_user_id": company_id,          # tenant, not a person
            "langfuse_tags": [
                name,
                f"company:{company_id}",
                f"provider:{settings.llm_provider}",
            ],
            # no PII beyond what the prompt itself already carries
        },
    }


def shutdown_langfuse() -> None:
    if _client is not None:
        _client.flush()
        _client.shutdown()
```

> Verify exact v3 API names against the installed SDK during
> implementation (`CallbackHandler` kwargs, `langfuse_*` metadata keys,
> `flush`/`shutdown`) — the SDK is actively evolving; the shape above is
> the documented v3 pattern.

### Step 6: Wire chat (`routes/assist.py`)

**File(s)**: `backend/app/routes/assist.py`

**Changes**:
- Build `config = trace_config(name="chat", company_id=body.company_id)` in
  the `chat` route and pass it to `graph.astream_events(...)`.
- `astream_events` already consumes a `RunnableConfig`; callbacks propagate
  to every node/LLM call, so condense/assess/answer generations nest under
  one trace automatically. **No change** to the SSE token filtering — the
  existing `langgraph_node == ANSWER_NODE` check keys off LangGraph
  metadata that a `None`/extra config does not disturb.

**Pseudo-code**:

```python
from app.ai.observability import trace_config

@router.post("/chat")
async def chat(body: ChatRequest, ...) -> EventSourceResponse:
    ...
    graph = build_chat_graph(retrieval)
    config = trace_config(name="chat", company_id=body.company_id)

    async def event_stream():
        ...
        async for event in graph.astream_events(
            initial_state, version="v2", **({"config": config} if config else {})
        ):
            ...
```

**Code Location**: `chat` handler, around the current
`graph.astream_events(initial_state, version="v2")` call (~line 47)

### Step 7: Wire hint (`ai/hint_chain.py`)

**File(s)**: `backend/app/ai/hint_chain.py`

**Changes**:
- `generate_hint` builds its own config (keeps routes ignorant of Langfuse
  for the hint path) and passes it to `hint_llm.ainvoke(...)`.
- Cache hits never reach `generate_hint`, so they correctly emit no trace
  (and burn no Hobby units).

**Pseudo-code**:

```python
from app.ai.observability import trace_config

async def generate_hint(body, retrieval_service, llm=None) -> HintResponse:
    hint_llm = llm or create_chat_llm(temperature=0.2, max_tokens=80)
    chunks = await retrieval_service.retrieve(...)
    config = trace_config(name="hint", company_id=body.company_id)
    result = await hint_llm.ainvoke(
        HINT_PROMPT.format(...),
        **({"config": config} if config else {}),
    )
    ...
```

**Code Location**: `generate_hint`, around the `hint_llm.ainvoke(...)` call
(~line 26)

### Step 8: Flush on shutdown (`main.py`)

**File(s)**: `backend/app/main.py`

**Changes**:
- Call `shutdown_langfuse()` in the lifespan teardown so batched events are
  delivered before the container stops (SIGTERM path in compose).

**Pseudo-code**:

```python
from app.ai.observability import shutdown_langfuse

@asynccontextmanager
async def lifespan(app: FastAPI):
    ...  # existing startup
    yield
    shutdown_langfuse()
    mongo.close()
```

**Code Location**: `lifespan`, teardown after `yield` (~line 55)

### Step 9: Custom model price for `deepseek-flash` (manual, Langfuse UI)

**File(s)**: none (Langfuse project settings)

**Changes**:
- In project `hint-staging` → Settings → **Models**: check whether
  `deepseek-flash` is matched; if not, add a custom model definition so
  generations get a (rough) cost.
- Record clearly in the entry description that prices are approximate and
  **not** the billing source (see Overview).

**Pseudo-code** (model definition to enter in the UI):

```yaml
model_name: deepseek-flash
match_pattern: "(?i)^(deepseek-flash)$"
unit: TOKENS
input_price:  <current DeepSeek Flash $/1M input tokens at setup time>
output_price: <current DeepSeek Flash $/1M output tokens at setup time>
# check https://api-docs.deepseek.com pricing page when implementing;
# cache-hit discounts are NOT modeled → cost is an approximation
```

### Step 10: Tests

**File(s)**: `backend/tests/test_observability.py` (new)

**Changes**:
- Unit tests, no network (same style as `test_llm_factory.py`): clear the
  `get_settings` lru_cache per test via monkeypatched env.
- Cover: disabled by default → `trace_config` returns `None`; enabled but
  missing keys → `None` (fail-safe); enabled + keys → config contains a
  `CallbackHandler`, `run_name`, tenant `langfuse_user_id`, and expected
  tags; `shutdown_langfuse()` is a no-op when never enabled.
- Existing suites (`test_chat_graph.py`, `test_hint_chain.py`) must pass
  unchanged with no Langfuse env set — that is the flag-off guarantee.

**Pseudo-code**:

```python
import pytest
from app.ai import observability
from app.config import get_settings


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setattr(observability, "_client", None)
    yield
    get_settings.cache_clear()


def test_disabled_by_default_returns_none():
    assert observability.trace_config(name="chat", company_id="cmp_x") is None


def test_enabled_without_keys_is_fail_safe(monkeypatch):
    monkeypatch.setenv("LANGFUSE_ENABLED", "true")
    get_settings.cache_clear()
    assert observability.trace_config(name="chat", company_id="cmp_x") is None


def test_enabled_with_keys_builds_config(monkeypatch):
    monkeypatch.setenv("LANGFUSE_ENABLED", "true")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    get_settings.cache_clear()
    cfg = observability.trace_config(name="hint", company_id="cmp_x")
    assert cfg is not None and cfg["run_name"] == "hint"
    assert cfg["metadata"]["langfuse_user_id"] == "cmp_x"
    assert "company:cmp_x" in cfg["metadata"]["langfuse_tags"]
    assert len(cfg["callbacks"]) == 1


def test_shutdown_noop_when_disabled():
    observability.shutdown_langfuse()  # must not raise
```

### Verification runbook (PR1 acceptance, manual)

Not a code step — this is the "done" check for PR1:

1. `cp .env.example .env`, fill `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, and
   the four `LANGFUSE_*` values (Step 1); `docker compose up --build`.
2. On the demo page (`http://localhost:3002`): send **one chat message**
   and hover **one element** (hint).
3. In Langfuse Cloud → `hint-staging` → Traces: within a few seconds see
   two traces — `chat` (nested condense/assess/answer generations for a
   follow-up, or 1–2 for a first message) and `hint` (one generation) —
   each with token counts, latency, and tags
   `company:<id>` / `provider:deepseek`.
4. After Step 9, generations show a non-zero (approximate) cost.
5. Repeat the same hover → no new `hint` trace (cache hit, by design).
6. Set `LANGFUSE_ENABLED=false`, restart backend, chat again → no new
   traces, endpoint behavior unchanged.
7. `cd backend && python -m pytest tests/ -v` → green.

## PR2 — Optional v1.1: Admin "Open in Langfuse"

### Step 11: Company-scoped Langfuse link in admin

**File(s)**: `admin/src/shared/config/index.ts`,
`admin/src/vite-env.d.ts`, `admin/src/widgets/company-detail/ui/company-detail.tsx`,
`admin/src/widgets/company-detail/ui/company-detail.test.tsx`,
`admin/Dockerfile`, `docker-compose.yml`,
`infrastructure/docker-compose.yml`

**Changes**:
- **Verified constraint**: the backend is stateless and stores **no
  conversations** (see `docs/06-ai-layer.md`), so admin cannot deep-link a
  specific trace id. Scope v1.1 to a **project/company-level** link:
  open the Langfuse traces list; per-company filtering relies on the
  `company:{company_id}` tag from PR1 (applied manually in the Langfuse UI —
  its filter-URL query format is not a stable public contract, so do not
  encode it).
- New build-time var `VITE_LANGFUSE_PROJECT_URL` (full project URL, e.g.
  `https://cloud.langfuse.com/project/<projectId>`); empty → link hidden.
  Wire it through `admin/Dockerfile` args and both compose files exactly
  like `VITE_API_URL`.
- Render an external link in `company-detail.tsx` (near the embed snippet
  block), labeled with the tag to filter by.

**Pseudo-code** (`shared/config/index.ts` + component):

```ts
export const LANGFUSE_PROJECT_URL: string =
	import.meta.env.VITE_LANGFUSE_PROJECT_URL ?? '';
```

```tsx
{LANGFUSE_PROJECT_URL && (
	<a
		href={`${LANGFUSE_PROJECT_URL}/traces`}
		target="_blank"
		rel="noreferrer"
	>
		Open traces in Langfuse (filter tag: company:{company.company_id})
	</a>
)}
```

**Code Location**: `company-detail.tsx`, alongside the `EmbedSnippet`
feature block

## PR3 — Optional v1.2: Golden evals (separate PR, manual run)

### Step 12: Golden dataset + eval runner + scores

**File(s)**: `backend/evals/golden_dataset.json` (new),
`backend/evals/run_golden_evals.py` (new), `backend/requirements-dev.txt`
(only if a scoring helper is needed)

**Changes**:
- ~10 golden items: `{question, page_context (optional), expected_keywords}`
  for a seeded demo company (Acme Invoicing docs from
  `docs/HOW_TO_PLAY.md`).
- Runner (manual, **not CI** — burns real DeepSeek tokens and Hobby units):
  upserts the dataset into Langfuse, runs `build_chat_graph` against the
  local stack for each item, scores keyword presence 0/1, and links runs +
  scores to dataset items so regressions are visible in the Langfuse UI.

**Pseudo-code** (`run_golden_evals.py` core loop):

```python
import asyncio, json
from langfuse import Langfuse
from app.ai.chat_graph import build_chat_graph

async def main() -> None:
    lf = Langfuse()  # env-configured
    items = json.load(open("evals/golden_dataset.json"))
    dataset = lf.get_or_create_dataset(name="hint-golden-v1")
    # upsert items, then:
    for item in dataset.items:
        with item.run(run_name="golden-eval") as root:
            graph = build_chat_graph(retrieval_service)
            state = await graph.ainvoke(make_state(item.input))
            hit = all(
                kw.lower() in state["answer"].lower()
                for kw in item.expected_output["keywords"]
            )
            root.score(name="keyword_match", value=1.0 if hit else 0.0)
    lf.flush()

asyncio.run(main())
```

## Final Step 13: Update Documentation (MANDATORY)

**File(s)**: `docs/06-ai-layer.md`, `docs/02-backend.md`, `README.md`,
`docs/deployment.md` (PR1); `docs/04-admin.md` (PR2, if shipped)

**Changes** (PR1):
- `docs/06-ai-layer.md`: add an **Observability (Langfuse)** section —
  layering (`observability.py` inside `ai/`), the four env vars in the
  existing environment-variables table, trace naming/tags, the
  cache-hit-has-no-trace behavior, and the "cost ≈ approximate, never
  billing" caveat; add rows to the failure-modes table (bad keys → tracing
  silently off; quota exceeded → traces dropped, requests unaffected).
- `docs/02-backend.md`: env var list + note that `/chat` and `/hint`
  behavior is unchanged when the flag is off.
- `README.md`: add Langfuse to "One-time external setup" (signup, project
  `hint-staging`, where keys go) and to the env comments in Quick start.
- `docs/deployment.md`: the four vars in the VPS `.env` checklist.
- If any PR ships without doc-relevant changes, this step still completes
  with an explicit note why no update is needed.

**Pseudo-code** (env-table rows for `docs/06-ai-layer.md`):

```markdown
| `LANGFUSE_ENABLED` | `false` | `ai/observability.py` | `true` → trace /chat and /hint. Off or missing keys → no-op. |
| `LANGFUSE_PUBLIC_KEY` | `""` | `ai/observability.py` | `pk-lf-…` from project hint-staging. Never committed. |
| `LANGFUSE_SECRET_KEY` | `""` | `ai/observability.py` | `sk-lf-…`. Never committed. |
| `LANGFUSE_HOST` | `https://cloud.langfuse.com` | `ai/observability.py` | EU Cloud region. |
```

---

## Edge Cases

- **Flag on, keys missing/typo'd**: `trace_config` returns `None`; requests
  work, tracing silently off. Bad-but-present keys: the SDK logs auth
  errors in the background worker and drops events — requests still
  unaffected. Consider calling `client.auth_check()` once at startup and
  logging a warning (not raising) so misconfig is visible in backend logs.
- **SSE mid-stream failure**: the route's existing `except` path still
  emits `event: error`; the Langfuse trace records the exception on the
  failing generation. No change to the SSE contract.
- **Client disconnect during chat**: generator is cancelled; the trace may
  end up partial (condense/retrieve spans only). Acceptable.
- **Hint cache hit**: no LLM call → intentionally no trace and no Hobby
  units burned. Do not "fix" this.
- **Hobby quota exhausted (~50k units/mo)**: Langfuse drops/limits
  ingestion; requests are never blocked. Watch usage in the Langfuse org
  page during demos.
- **No session grouping**: `ChatRequest` has no conversation id (the widget
  resends full history; backend is stateless). Adding
  `langfuse_session_id` needs a widget-generated conversation id on the
  wire (`models/assist.py` + widget store) — explicitly out of scope;
  candidate for a future plan.
- **PII surface**: traced inputs include end-user chat text and
  `page_context.visible_text_excerpt` from customer pages. Staging only
  until reviewed; never add extra identifiers (emails, tokens) to
  metadata/tags. `user_id` stays the tenant `company_id`.
- **Streaming token usage**: some OpenAI-compatible providers omit usage on
  streamed responses; if the answer generation shows 0 tokens, check
  DeepSeek's `stream_options` include-usage support before blaming
  Langfuse.
- **Graph is compiled per request**: a fresh `CallbackHandler` per request
  is the supported pattern; no cross-request state to worry about.

## Testing Checklist

- [ ] `cd backend && python -m pytest tests/ -v` green with **no**
      `LANGFUSE_*` env set (flag-off guarantee).
- [ ] New `test_observability.py` passes (disabled default, fail-safe on
      missing keys, config shape when enabled, shutdown no-op).
- [ ] Manual: one chat → `chat` trace in `hint-staging` with nested
      generations, tokens, latency, tags `company:<id>`,
      `provider:deepseek`.
- [ ] Manual: one hint → `hint` trace with one generation; repeat hover →
      no second trace (cache).
- [ ] Manual: cost column non-zero after the `deepseek-flash` custom price
      entry (and understood as approximate).
- [ ] Manual: `LANGFUSE_ENABLED=false` restart → no traces, identical
      endpoint behavior.
- [ ] `git grep -i "sk-lf-"` returns nothing tracked (no committed secrets).
- [ ] PR2 (if shipped): admin shows the link only when
      `VITE_LANGFUSE_PROJECT_URL` is set; component test covers both
      states.
- [ ] PR3 (if shipped): eval runner uploads dataset, produces runs +
      `keyword_match` scores visible in Langfuse.

## Files to Modify

**PR1 — tracing + env + docs**

- [ ] `backend/requirements.txt` — add `langfuse>=3,<4`
- [ ] `backend/app/config.py` — four `langfuse_*` settings
- [ ] `backend/app/ai/observability.py` — **new** module
- [ ] `backend/app/routes/assist.py` — pass config into `astream_events`
- [ ] `backend/app/ai/hint_chain.py` — pass config into `ainvoke`
- [ ] `backend/app/main.py` — shutdown flush in lifespan
- [ ] `backend/tests/test_observability.py` — **new** tests
- [ ] `.env.example` — document the four vars (empty keys)
- [ ] `docker-compose.yml` — pass-through env
- [ ] `infrastructure/docker-compose.yml` — pass-through env
- [ ] `docs/06-ai-layer.md`, `docs/02-backend.md`, `README.md`,
      `docs/deployment.md` — Step 13

**PR2 — admin link (optional v1.1)**

- [ ] `admin/src/shared/config/index.ts`, `admin/src/vite-env.d.ts`
- [ ] `admin/src/widgets/company-detail/ui/company-detail.tsx` (+ test)
- [ ] `admin/Dockerfile`, `docker-compose.yml`,
      `infrastructure/docker-compose.yml` — `VITE_LANGFUSE_PROJECT_URL` arg
- [ ] `docs/04-admin.md`

**PR3 — golden evals (optional v1.2)**

- [ ] `backend/evals/golden_dataset.json` — **new**
- [ ] `backend/evals/run_golden_evals.py` — **new**
- [ ] `backend/requirements-dev.txt` — only if needed

## Implementation Order

1. Step 1 (Cloud project + keys) — unblocks manual verification later.
2. Steps 2–4 (settings, env plumbing, dependency) — inert scaffolding.
3. Step 5 (`observability.py`) → Step 10 tests for it.
4. Steps 6–7 (wire chat, then hint) — verify locally after each.
5. Step 8 (shutdown flush).
6. Step 9 (custom model price) + verification runbook → **ship PR1**.
7. Step 13 docs for PR1 (inside PR1, before merge).
8. Step 11 → **PR2** (only after PR1 traces are confirmed useful).
9. Step 12 → **PR3** (independent of PR2).

## Guardrails (recap)

- **Staging first**: keys exist only for `hint-staging`; production stays
  `LANGFUSE_ENABLED=false` until the PII review passes.
- **Secrets**: keys live in `.env` (gitignored) / VPS env only; never in
  compose defaults, code, docs, or this plan.
- **No PII in metadata/tags**: tenant `company_id` only; prompt/completion
  content is already the maximum data shared.
- **Quota**: Hobby ≈ 50k units/month; check org usage before demo blasts.
- **Feature flag**: default off everywhere; a Langfuse outage or misconfig
  must never affect `/chat` or `/hint`.
- **Billing**: Langfuse cost is approximate observability data. Customer
  billing requires a Hint-owned usage ledger — separate future plan.
