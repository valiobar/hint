# Hint — AI Layer (LangGraph chat + hints)

> **Status: Phase 3 complete.** Widget-facing chat (SSE) and hover hints sit on
> top of the Phase 1 retrieval stack. Layering:
> `routes/assist.py` → `ai/` → `services/retrieval_service.py`.
> Wire contract: `backend/app/models/assist.py`. HTTP surface:
> [`02-backend.md`](02-backend.md). Auth (both endpoints stay **public**):
> [`05-auth.md`](05-auth.md). Stack/env:
> [`01-architecture-overview.md`](01-architecture-overview.md).
> `03-widget.md` stays reserved for the Phase 4 widget.

Phase 3 adds two public endpoints under `/api/v1`:

| Endpoint | Transport | Pipeline | Typical latency |
|---|---|---|---|
| `POST /api/v1/chat` | SSE (`text/event-stream`) | `condense_query → retrieve (k=5) → generate_answer` | 1–4 s, tokens arrive progressively |
| `POST /api/v1/hint` | JSON | query from element label + page title → retrieve (k=3) → 1 LLM call → clamp 140 chars | first hover 300–1500 ms; repeats ~instant from cache |

Both consume `RetrievalService.retrieve()` unchanged. Unknown `company_id` is
rejected with 404 **before** any LLM or retrieval work. Empty
`OPENAI_API_KEY` is 503 on both (same `require_openai_key` guard as upload /
`/retrieve`). The stack still boots without a key (Phase 0 behavior).

A real `OPENAI_API_KEY` is required to exercise these endpoints. The widget
that will call them lands in Phases 4–5; until then curl / Swagger / a
cross-origin `fetch` stream are the demo path.

## Layering

`ai/` is the only layer that constructs LLM clients. Routes call `ai/` entry
points; `ai/` calls `RetrievalService`. No other layer imports LangChain.

```
routes/assist.py          POST /chat (SSE) · POST /hint (JSON)
  └─▶ ai/
        llm_factory.py    create_chat_llm(streaming, temperature, max_tokens)
        prompts.py        CONDENSE_PROMPT · ANSWER_SYSTEM · HINT_PROMPT + formatters
        chat_graph.py     ChatState · build_chat_graph(retrieval_service)
        hint_chain.py     build_hint_query · generate_hint
        └─▶ services/retrieval_service.py   retrieve(company_id, query, k) → list[Chunk]
        └─▶ services/hint_cache.py          sha1 key · TTL · oldest-first eviction
              └─▶ repositories/vector_repo.py   Chroma collection kb_{company_id}
                    └─▶ models/assist.py        ElementDescriptor · PageContext · Chat* · Hint*
```

The graph is compiled **per request** via a factory that closes over the
request-scoped `RetrievalService` (matches the existing `Depends` wiring).
Compile cost is negligible for the POC.

`HintCache` is a process singleton from `get_hint_cache()` in `routes/deps.py`.

## Chat graph

Topology (`backend/app/ai/chat_graph.py`):

```
START → condense_query → retrieve → generate_answer → END
```

| Node | When it runs | LLM? | Writes |
|---|---|---|---|
| `condense_query` | Always. If `len(messages) == 1`, skips the LLM and copies the last user message into `query`. Follow-ups are rewritten into a standalone search query. Empty rewrite falls back to the raw last user message. | Yes, only on follow-ups (`temperature=0.0`, `max_tokens=100`) | `query` |
| `retrieve` | Always | No — `RetrievalService.retrieve(company_id, query, k=5)` | `chunks` |
| `generate_answer` | Always | Yes, streaming (`max_tokens=400`). System prompt is backend-owned; history is the request's `user`/`assistant` messages. | `answer` |

### State (`ChatState`)

```
{
  company_id,          # from the request
  company_name,        # loaded in the route (answer prompt needs it)
  messages,            # list[ChatMessage] — role is user|assistant only
  page_context,        # PageContext from the widget
  query,               # standalone search string (condense output)
  chunks,              # list[Chunk] from retrieval
  answer,              # full generated text (also streamed token-by-token)
}
```

The backend is **stateless**: the widget resends the full message history on
every chat request. There is no conversation collection.

### Token streaming

The route uses `graph.astream_events(initial_state, version="v2")` and yields
only `on_chat_model_stream` events whose `langgraph_node == "generate_answer"`.
The condense LLM call never leaks tokens into the SSE stream.

Source filenames are collected from the `retrieve` node's `on_chain_end`
output and **deduplicated in order** (`dict.fromkeys`) for the final `done`
event.

`POST` cannot use the browser `EventSource` API (no request body). The Phase 4
widget — and the Step 8 browser check — read the stream with `fetch` +
`ReadableStream`.

## SSE protocol — `POST /api/v1/chat` (public)

`Content-Type: text/event-stream`. HTTP status is 200 once the stream starts.
Errors **before** the first byte stay regular HTTP errors (404 / 422 / 503).

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
| `token` | raw token string (not JSON) | Repeated; only tokens from `generate_answer` |
| `done` | `{"sources": ["user-manual.pdf"]}` | Always last on success. `sources` is `[]` when the KB is empty |
| `error` | `{"detail": "Chat generation failed"}` | Mid-stream LLM/network failure. HTTP status is already 200; the widget must treat the message as failed |

Empty-KB behavior: retrieval returns `[]`; the answer prompt tells the model
the docs do not cover it (`format_chunks` renders
`(no documentation uploaded for this product yet)`). `done` still fires with
`"sources": []`.

Client disconnect cancels the `EventSourceResponse` generator; the in-flight
LLM call is dropped with it.

## Hint chain — `POST /api/v1/hint` (public)

`backend/app/ai/hint_chain.py` — one non-streaming LLM call, then a hard
140-char clamp (`HINT_MAX_CHARS`).

```
query = element.text or element.attrs["aria-label"] + " — " + page_context.title
chunks = retrieve(company_id, query, k=3)
hint  = llm(HINT_PROMPT).strip()[:140]
source = chunks[0].filename if chunks else None
```

| Field | Rule |
|---|---|
| `hint` | One sentence, ≤ 140 characters after clamp. The prompt already asks for ≤ 140 chars so clamping is a safety net, not the normal path. |
| `source` | Filename of the top retrieved chunk, or `null` when the KB is empty |

Empty-KB behavior: the prompt says "describe it neutrally from its label
alone"; `source` is `null`.

## Hint cache

`backend/app/services/hint_cache.py`. In-process `OrderedDict` with TTL and a
max-size cap. Redis-shaped interface (`key` / `get` / `set`) so Phase 6 can
swap in a shared store without changing the route.

### Key recipe

```
sha1(company_id | url_path | selector_path | element_text)
```

`url_path` is `urlparse(page_context.url).path` — query strings do not bust
the cache (`/reports?tab=1` and `/reports?tab=2` share a key). `element_text`
is `element.text or ""` (aria-label is **not** part of the key).

### Semantics

| Knob | Settings default | Behavior |
|---|---|---|
| TTL | `HINT_CACHE_TTL_SECONDS=3600` | `get` deletes and misses after expiry (`time.monotonic`) |
| Cap | `HINT_CACHE_MAX_ENTRIES=1024` | Inserting a **new** key at capacity evicts the oldest entry (`popitem(last=False)`). Updates of an existing key do not evict. |
| Scope | per process | Restart empties the cache. Not shared across replicas. |
| Racing identical hovers | accepted | Two concurrent misses both call the LLM; last `set` wins. No per-key lock in the POC. |

Cache is checked **after** the 404 company lookup, so unknown companies never
poison the store.

## Prompt inventory and grounding rules

All prompts live in `backend/app/ai/prompts.py`. The system prompt is
backend-owned — `ChatMessage.role` is `Literal["user", "assistant"]` and the
wire never accepts a client `system` message.

| Prompt | Used by | Grounding rule |
|---|---|---|
| `CONDENSE_PROMPT` | `condense_query` (follow-ups only) | Rewrite the follow-up as a standalone **search query**. Return only the query text. |
| `ANSWER_SYSTEM` | `generate_answer` | Answer **only** from the documentation excerpts and the current page snapshot. Point at a concrete on-screen element for UI actions. If the excerpts do not cover it, say so — do not invent features. Keep answers under 120 words. |
| `HINT_PROMPT` | `generate_hint` | One sentence, max 140 characters, grounded in the excerpts. If the excerpts do not mention the element, describe it neutrally from its label. No quotes, markdown, or exclamation marks. |

Formatters (same file):

| Helper | Empty input | Non-empty |
|---|---|---|
| `format_chunks` | `(no documentation uploaded for this product yet)` | `[1] (filename)\n{text}` blocks |
| `format_interactive` | `(none captured)` | `- <tag> "label" (selector_path)` |
| `format_history` | — | `role: content` lines, **excluding** the last message (that is the follow-up) |
| `format_element` | label falls back to `(unlabeled)` | `<tag> "label" role=… at selector_path` |

## LLM factory

`create_chat_llm()` in `backend/app/ai/llm_factory.py` reads `LLM_PROVIDER` /
`LLM_MODEL` / `OPENAI_API_KEY` from settings.

| `LLM_PROVIDER` | Behavior |
|---|---|
| `openai` (default) | `ChatOpenAI` with the requested `streaming` / `temperature` / `max_tokens` |
| anything else | `ValueError("Unsupported LLM provider: …")` at call time |

Anthropic is reserved for later — add a branch in the factory; call sites stay
unchanged.

Call-site defaults:

| Call site | `streaming` | `temperature` | `max_tokens` |
|---|---|---|---|
| Condense | no | `0.0` | `100` |
| Answer | yes | factory default `0.2` | `400` |
| Hint | no | `0.2` | `80` |

## Environment variables

Defined in `backend/app/config.py`. Compose currently passes `LLM_MODEL` and
`OPENAI_API_KEY`; the others use settings defaults unless you export them.

| Variable | Settings default | Consumed by | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | `""` | embeddings + chat/hint LLM | **Required** for `/chat`, `/hint`, upload, `/retrieve`. Empty → 503 with an actionable message. Stack still boots. |
| `LLM_PROVIDER` | `openai` | `create_chat_llm` | Unknown value raises at first LLM call. Not passed by compose (code default). |
| `LLM_MODEL` | `gpt-4o-mini` | `create_chat_llm` | Compose: `${LLM_MODEL:-gpt-4o-mini}` |
| `HINT_CACHE_TTL_SECONDS` | `3600` | `HintCache` | Not passed by compose (code default). |
| `HINT_CACHE_MAX_ENTRIES` | `1024` | `HintCache` | Not passed by compose (code default). |

## Wire-contract caps

Enforced by Pydantic on `models/assist.py` — oversized payloads 422 **before**
any LLM spend. The Phase 6 "backend re-validates caps" item is already free.

| Field | Cap |
|---|---|
| `PageContext.interactive` | ≤ 60 elements |
| `PageContext.visible_text_excerpt` | ≤ 2000 chars |
| `PageContext.headings` | ≤ 10 |
| `ChatMessage.content` | 1–4000 chars |
| `ChatRequest.messages` | 1–30 |
| `ElementDescriptor.text` | ≤ 220 chars |
| `ElementDescriptor.selector_path` | 1–512 chars |
| `company_id` | 1–64 chars |

`ChatMessage.role` is `user` or `assistant` only.

## Failure modes

| Symptom | Cause | Behavior / fix |
|---|---|---|
| `404 {"detail":"Unknown company_id"}` | Body `company_id` is not in Mongo | Raised in-handler (ID is in the body, same pattern as `/retrieve`) before retrieval or LLM. Stream never starts. |
| `422` validation error | > 60 interactive elements, > 2000-char excerpt, empty `messages`, etc. | Pydantic / FastAPI. No LLM spend. |
| `503 {"detail":"OPENAI_API_KEY is not configured; set it in .env and restart"}` | Empty key | Router-level `require_openai_key`. Set the key, `docker compose up -d backend`. |
| `event: error` then stream close | LLM/network failure after tokens were sent | HTTP status stays 200. Widget must mark the assistant message failed. |
| Chat answer says docs don't cover it; `done` has `"sources":[]` | Company exists, no ready documents | Expected empty-KB path. |
| Hint `source: null`, generic label-based sentence | Empty KB | Expected. Prompt falls back to the element label. |
| Second identical hint is still slow | Different `url` **path**, `selector_path`, or `element.text`; or process restarted | Cache key ignores query string only. Restart clears the in-process store. |
| Follow-up answer drifts off-topic | Condense rewrite was empty or weak | Node falls back to the raw last user message if the rewrite is blank; otherwise tune `CONDENSE_PROMPT`. |
| `ValueError: Unsupported LLM provider` | `LLM_PROVIDER` is not `openai` | Set `LLM_PROVIDER=openai` or add a factory branch. |

## Tests

Unit tests in `backend/tests/` use in-memory fakes (no Mongo / Chroma / network):

| File | Covers |
|---|---|
| `test_assist_models.py` | Contract caps (41 elements / 2001-char excerpt / empty messages → validation error) |
| `test_hint_cache.py` | Key stability across query-string URL variants; TTL expiry; oldest-first eviction |
| `test_hint_chain.py` | Query prefers `text` then `aria-label`; 140-char clamp; `source: null` on empty KB |
| `test_chat_graph.py` | Single message skips condense; retrieval called with `(company_id, query, 5)`; answer state non-empty |

```bash
cd backend && python -m pytest tests/ -v
```

Request-level SSE / cache-hit / 404 checks are in the
[`02-backend.md` curl walkthrough](02-backend.md#end-to-end-curl-walkthrough).
