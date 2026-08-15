# Hint POC — Browser-First AI Guidance Layer

## Overview

A proof of concept for **Hint**: an embeddable AI guidance layer for SaaS web apps.

A SaaS company uploads its product documentation (user manuals, help articles) through a
simple admin panel. The documents are chunked, embedded, and stored in a vector store,
keyed by **company ID**. The company then adds a single `<script>` tag (with its company ID)
to its web app. The script injects a React widget (Shadow DOM, **one instance per page**)
that provides two interaction modes:

1. **AI Chat** — the user asks "how do I …?" and the assistant answers using RAG over the
   company's knowledge base **plus** a snapshot of what is currently rendered on the page
   (serialized DOM context), so answers can point to concrete on-screen elements.
2. **Hover Hints** — when the user hovers over an interactive element (button, link, input
   menu item), the widget sends a compact descriptor of that element + page context to theV
   backend and shows a short tooltip explaining what the element does, grounded in the
   uploaded documentation.

### System components

| Component | Technology | Responsibility |
|---|---|---|
| `widget/` | React 18 + TypeScript + Vite (IIFE/UMD build + `loader.js`) | Embeddable UI: chat panel, hover-hint engine, DOM context extraction. Shadow DOM isolation, singleton per page |
| `backend/` | Python 3.12, FastAPI | Company CRUD, document ingestion, RAG retrieval, chat (SSE streaming), hint endpoint |
| AI runtime | LangGraph (+ LangChain components) | Chat graph: retrieve → ground → answer; hint chain: element descriptor + retrieval → one-sentence hint |
| `admin/` | Small React + Vite SPA (no auth) | Create company, upload multiple files, copy embed snippet |
| Vector store | ChromaDB | One collection per company (`kb_{company_id}`) |
| Metadata DB | MongoDB (Motor async) | `companies`, `documents` collections |
| LLM / embeddings | OpenAI (switchable via env) | `gpt-4o-mini` class model for chat/hints, `text-embedding-3-small` for embeddings |
| Orchestration | Docker Compose | mongo, chromadb, backend, admin, demo page |

### Request flow

```
Admin flow:
  admin SPA ──POST /companies──────────────▶ backend ──▶ MongoDB (companies)
  admin SPA ──POST /companies/{id}/documents▶ backend ──▶ parse → chunk → embed → ChromaDB (kb_{id})
                                                      └─▶ MongoDB (documents metadata)

End-user flow:
  host page <script src=".../loader.js" data-company-id="abc"> (singleton guard)
    └─▶ widget bundle → Shadow DOM mount
         ├─ chat:  POST /api/v1/chat  (SSE stream)   { company_id, messages, page_context }
         └─ hint:  POST /api/v1/hint  (JSON)         { company_id, element, page_context }
                       backend: LangGraph → Chroma retrieval (filtered by company) → LLM → response
```

## Pros / Cons

**Pros**

- Script-tag delivery means zero install friction for the SaaS company — one snippet with
  `data-company-id`, same mechanism proven in the marketing-player project.
- Shadow DOM isolation guarantees the widget cannot break or be broken by host page CSS.
- Per-company Chroma collections give hard tenant isolation of knowledge with no query-time
  filtering bugs possible.
- LangGraph gives an explicit, debuggable graph (retrieve → grade → answer) that is easy to
  extend later (e.g. multi-step guidance, action suggestions) without rewriting the chat code.
- Sending serialized page context with every request keeps the backend stateless — no
  session store needed for the POC.
- Hover hints and chat share the same retrieval layer, so knowledge is ingested once.

**Cons / accepted trade-offs**

- No auth on the admin panel — anyone with the URL can create companies and upload files.
  Acceptable for a POC; noted as a hardening item.
- DOM serialization is heuristic — complex canvas/iframe-heavy apps won't be well understood.
- Hover hints call the LLM per element (with caching); latency on first hover may be
  300–1500 ms. Mitigated by client + server caching and a small model.
- One LLM provider wired first (OpenAI); the factory keeps it switchable but Anthropic
  support is not implemented in Phase 1.
- No rate limiting / abuse protection on the public widget endpoints in the POC.

## Current State Analysis

### ✅ Existing

- Empty workspace (`/Users/valentinbarakov/proecti/task`) with Cursor rules only.
- Reference implementation for the embed mechanism: `~/Projects/marketing-app`
  (loader.js pattern, Shadow DOM mount, Vite IIFE build, nginx CDN container).

### ❌ Missing Components

- ❌ Monorepo scaffold (backend, widget, admin, docker-compose, docs)
- ❌ Backend: FastAPI app, config, Mongo/Chroma clients
- ❌ Company CRUD (routes/services/repositories)
- ❌ Document ingestion pipeline (parse → chunk → embed → store)
- ❌ RAG retrieval layer
- ❌ LangGraph chat graph + SSE chat endpoint
- ❌ Hint endpoint + hint chain + caching
- ❌ Admin SPA (create company, upload files, embed snippet)
- ❌ Widget: loader.js + singleton guard
- ❌ Widget: Shadow DOM runtime + chat UI (SSE client)
- ❌ Widget: DOM context extractor
- ❌ Widget: hover-hint engine + tooltip UI
- ❌ Demo host page for E2E testing
- ❌ Documentation (`docs/`)

---

# Implementation Phases

Phases are sequential; each phase ends in a runnable, demoable state.

- **Phase 0** — Repo scaffold & infrastructure (compose stack boots)
- **Phase 1** — Knowledge base backend (companies + ingestion + retrieval, testable via curl)
- **Phase 2** — Admin panel (create company, upload docs, copy snippet)
- **Phase 3** — AI layer (LangGraph chat with SSE, hint endpoint)
- **Phase 4** — Embeddable widget: loader, Shadow DOM runtime, chat UI
- **Phase 5** — Hover hints: DOM scanning, context extraction, tooltip
- **Phase 6** — Demo page, hardening pass, documentation

---

## Phase 0 — Repo Scaffold & Infrastructure

### Step 0.1: Monorepo layout + Docker Compose

**File(s)**: `docker-compose.yml`, `backend/Dockerfile`, `backend/requirements.txt`,
`admin/Dockerfile`, `widget/Dockerfile`, `.env.example`, `README.md`

**Changes**:
- Create top-level folders: `backend/`, `widget/`, `admin/`, `demo/`, `docs/`, `plans/`
- Compose stack: `mongo`, `chromadb`, `backend`, `admin`, `widget-cdn` (nginx serving the
  built widget + `loader.js`), `demo` (static host page)
- Only `backend` (:8000), `admin` (:3001), `widget-cdn` (:1337), `demo` (:3002) exposed

**Pseudo-code**:

```yaml
# docker-compose.yml
services:
  mongo:
    image: mongo:7
    volumes: [mongo-data:/data/db]
    healthcheck: { test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"] }

  chromadb:
    image: chromadb/chroma:latest
    volumes: [chroma-data:/chroma/chroma]

  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - MONGODB_URL=mongodb://mongo:27017/hint
      - CHROMA_HOST=chromadb
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      mongo: { condition: service_healthy }
      chromadb: { condition: service_started }

  admin:
    build: ./admin
    ports: ["3001:80"]

  widget-cdn:
    build: ./widget          # multi-stage: pnpm build → nginx
    ports: ["1337:80"]

  demo:
    image: nginx:alpine
    volumes: ["./demo:/usr/share/nginx/html:ro"]
    ports: ["3002:80"]

volumes: { mongo-data: {}, chroma-data: {} }
```

```txt
# backend/requirements.txt (key deps)
fastapi
uvicorn[standard]
motor
pydantic-settings
langchain
langgraph
langchain-openai
chromadb                 # HttpClient mode
pypdf
python-multipart
sse-starlette
```

### Step 0.2: FastAPI application skeleton

**File(s)**: `backend/app/main.py`, `backend/app/config.py`, `backend/app/db/mongo.py`,
`backend/app/db/chroma.py`

**Changes**:
- `BaseSettings` config from env, lifespan-managed Mongo + Chroma clients, CORS open for POC
  (widget runs on arbitrary customer origins), `/health` endpoint
- Layered layout: `routes/ → services/ → repositories/ → models/`

**Pseudo-code**:

```python
# backend/app/config.py
class Settings(BaseSettings):
    mongodb_url: str
    chroma_host: str
    chroma_port: int = 8000
    openai_api_key: str
    llm_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"

# backend/app/main.py
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.mongo = AsyncIOMotorClient(settings.mongodb_url)
    app.state.chroma = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
    yield
    app.state.mongo.close()

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(companies_router, prefix="/api/v1")
app.include_router(documents_router, prefix="/api/v1")
app.include_router(assist_router, prefix="/api/v1")   # chat + hint

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

---

## Phase 1 — Knowledge Base Backend

### Step 1.1: Company models, repository, routes

**File(s)**: `backend/app/models/company.py`, `backend/app/repositories/company_repo.py`,
`backend/app/services/company_service.py`, `backend/app/routes/companies.py`

**Changes**:
- `POST /api/v1/companies` (name → generated `company_id`), `GET /api/v1/companies`,
  `GET /api/v1/companies/{id}`
- Unique index on `company_id`

**Pseudo-code**:

```python
class CompanyCreate(BaseModel):
    name: str

class Company(BaseModel):
    company_id: str          # short slug, e.g. "cmp_a1b2c3"
    name: str
    created_at: datetime

class CompanyRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["companies"]

    async def create(self, name: str) -> Company:
        doc = {"company_id": f"cmp_{secrets.token_hex(4)}", "name": name,
               "created_at": datetime.utcnow()}
        await self.collection.insert_one(doc)
        return Company(**doc)

    async def find_by_company_id(self, company_id: str) -> Company | None:
        doc = await self.collection.find_one({"company_id": company_id})
        return Company(**doc) if doc else None

@router.post("/companies", response_model=Company)
async def create_company(body: CompanyCreate, svc: CompanyService = Depends(get_company_service)):
    return await svc.create_company(body.name)
```

### Step 1.2: Document ingestion pipeline (upload → parse → chunk → embed → Chroma)

**File(s)**: `backend/app/routes/documents.py`, `backend/app/services/ingestion_service.py`,
`backend/app/repositories/document_repo.py`, `backend/app/repositories/vector_repo.py`,
`backend/app/models/document.py`

**Changes**:
- `POST /api/v1/companies/{company_id}/documents` — multipart, multiple files
  (pdf / md / txt / html)
- Parse with `pypdf` / plain read, chunk with `RecursiveCharacterTextSplitter`
  (~800 chars, 150 overlap), embed with OpenAI, upsert into Chroma collection
  `kb_{company_id}` with metadata `{document_id, filename, chunk_index}`
- Store document metadata (filename, size, chunk_count, status) in Mongo
- `GET .../documents` list, `DELETE .../documents/{id}` removes chunks by metadata filter

**Pseudo-code**:

```python
class IngestionService:
    def __init__(self, doc_repo: DocumentRepository, vector_repo: VectorRepository):
        ...

    async def ingest(self, company_id: str, file: UploadFile) -> DocumentMeta:
        raw = await file.read()
        text = extract_text(raw, file.content_type)          # pypdf | decode | html2text
        chunks = self.splitter.split_text(text)
        doc = await self.doc_repo.create(company_id, file.filename, len(chunks))
        await self.vector_repo.add_chunks(
            company_id=company_id,
            ids=[f"{doc.document_id}:{i}" for i in range(len(chunks))],
            texts=chunks,
            metadatas=[{"document_id": doc.document_id, "filename": file.filename,
                        "chunk_index": i} for i in range(len(chunks))],
        )
        await self.doc_repo.mark_ready(doc.document_id)
        return doc

class VectorRepository:                                       # Adapter over Chroma
    def _collection(self, company_id: str):
        return self.client.get_or_create_collection(
            name=f"kb_{company_id}",
            embedding_function=OpenAIEmbeddingFunction(model=settings.embedding_model),
        )

    async def add_chunks(self, company_id, ids, texts, metadatas):
        await run_in_threadpool(self._collection(company_id).add,
                                ids=ids, documents=texts, metadatas=metadatas)
```

### Step 1.3: Retrieval layer

**File(s)**: `backend/app/services/retrieval_service.py`

**Changes**:
- `retrieve(company_id, query, k=5)` → list of `{text, filename, score}`
- Internal `POST /api/v1/retrieve` endpoint for debugging (curl-testable before AI exists)

**Pseudo-code**:

```python
class RetrievalService:
    async def retrieve(self, company_id: str, query: str, k: int = 5) -> list[Chunk]:
        col = self.vector_repo._collection(company_id)
        res = await run_in_threadpool(col.query, query_texts=[query], n_results=k)
        return [Chunk(text=d, filename=m["filename"], score=s)
                for d, m, s in zip(res["documents"][0], res["metadatas"][0], res["distances"][0])]
```

**Phase 1 exit criteria**: `curl` can create a company, upload a PDF, and get relevant
chunks back from `/retrieve`.

---

## Phase 2 — Admin Panel

### Step 2.1: Admin SPA scaffold + company form

**File(s)**: `admin/` (Vite + React + TS), `admin/src/api/client.ts`,
`admin/src/pages/companies.tsx`

**Changes**:
- Single-page app, no auth. Left: company list + "create company" form (name only).
  Right: selected company detail.
- Form validation with Zod.

**Pseudo-code**:

```tsx
const CompaniesPage = () => {
	const [companies, setCompanies] = useState<Company[]>([]);
	const [selected, setSelected] = useState<Company | null>(null);

	const handleCreate = async (name: string) => {
		const company = await api.createCompany({ name });
		setCompanies((prev) => [...prev, company]);
		setSelected(company);
	};

	return (
		<div className={styles.layout}>
			<CompanyList companies={companies} onSelect={setSelected} />
			<CreateCompanyForm onSubmit={handleCreate} />
			{selected && <CompanyDetail company={selected} />}
		</div>
	);
};
```

### Step 2.2: Multi-file upload + document list + embed snippet

**File(s)**: `admin/src/pages/company-detail.tsx`, `admin/src/components/file-upload.tsx`,
`admin/src/components/embed-snippet.tsx`

**Changes**:
- Drag-and-drop multi-file upload (`FormData`, `files[]`), per-file status (uploading /
  processing / ready), document list with delete
- Copyable embed snippet with the company ID baked in

**Pseudo-code**:

```tsx
const handleUpload = async (files: File[]) => {
	const form = new FormData();
	files.forEach((f) => form.append('files', f));
	await api.uploadDocuments(company.companyId, form);
	await refreshDocuments();
};

const EmbedSnippet = ({ companyId }: { companyId: string }) => {
	const snippet =
		`<script src="${CDN_URL}/embed/v1/loader.js" ` +
		`data-hint-company-id="${companyId}" defer></script>`;
	return <CopyBlock text={snippet} />;
};
```

**Phase 2 exit criteria**: full admin flow works in a browser — create company, upload
3 files, see them "ready", copy the snippet.

---

## Phase 3 — AI Layer (LangGraph)

### Step 3.1: Page-context contract (shared request models)

**File(s)**: `backend/app/models/assist.py`

**Changes**:
- Define the wire contract the widget will send. Compact, token-budgeted representation of
  the current page and (for hints) the hovered element.

**Pseudo-code**:

```python
class ElementDescriptor(BaseModel):
    tag: str                       # "button"
    text: str | None               # visible label, truncated to 120 chars
    role: str | None               # ARIA role
    attrs: dict[str, str]          # id, name, aria-label, placeholder, href, type
    selector_path: str             # "main > form > button.submit"

class PageContext(BaseModel):
    url: str
    title: str
    headings: list[str]                       # h1–h3 texts
    interactive: list[ElementDescriptor]      # visible interactive elements, max ~40
    visible_text_excerpt: str                 # main-content text, max ~2000 chars

class ChatRequest(BaseModel):
    company_id: str
    messages: list[ChatMessage]               # role: user|assistant
    page_context: PageContext

class HintRequest(BaseModel):
    company_id: str
    element: ElementDescriptor
    page_context: PageContext
```

### Step 3.2: LangGraph chat graph + SSE endpoint

**File(s)**: `backend/app/ai/chat_graph.py`, `backend/app/ai/prompts.py`,
`backend/app/ai/llm_factory.py`, `backend/app/routes/assist.py`

**Changes**:
- Graph: `condense_query` (rewrite follow-up into standalone query) → `retrieve`
  (RetrievalService, k=5) → `answer` (streaming LLM, grounded in chunks + page context)
- `POST /api/v1/chat` streams tokens via `sse-starlette`; final event carries source
  filenames
- LLM provider behind a small factory (OpenAI now, Anthropic later)

**Pseudo-code**:

```python
class ChatState(TypedDict):
    company_id: str
    messages: list[ChatMessage]
    page_context: PageContext
    query: str
    chunks: list[Chunk]

async def condense_query(state: ChatState) -> dict:
    if len(state["messages"]) == 1:
        return {"query": state["messages"][-1].content}
    rewritten = await llm.ainvoke(CONDENSE_PROMPT.format(history=..., question=...))
    return {"query": rewritten.content}

async def retrieve(state: ChatState) -> dict:
    return {"chunks": await retrieval_service.retrieve(state["company_id"], state["query"])}

graph = StateGraph(ChatState)
graph.add_node("condense_query", condense_query)
graph.add_node("retrieve", retrieve)
graph.add_node("answer", answer)          # streams via astream_events
graph.add_edge(START, "condense_query")
graph.add_edge("condense_query", "retrieve")
graph.add_edge("retrieve", "answer")

@router.post("/chat")
async def chat(body: ChatRequest):
    async def event_stream():
        async for event in compiled_graph.astream_events(initial_state(body)):
            if is_token(event):
                yield {"event": "token", "data": token_text(event)}
        yield {"event": "done", "data": json.dumps({"sources": source_files})}
    return EventSourceResponse(event_stream())
```

```python
# prompts.py — answer system prompt (essence)
ANSWER_SYSTEM = """You are Hint, an in-app guide for {company_name}.
Answer ONLY from the documentation excerpts and the current page snapshot.
The user is currently on: {url} — "{title}".
Visible interactive elements: {interactive_summary}
When the answer involves a UI action, point to the concrete on-screen element
(e.g. 'click the "Export" button in the top toolbar').
If the docs don't cover it, say so briefly. Keep answers under 120 words."""
```

### Step 3.3: Hint endpoint + caching

**File(s)**: `backend/app/ai/hint_chain.py`, `backend/app/routes/assist.py`,
`backend/app/services/hint_cache.py`

**Changes**:
- `POST /api/v1/hint` → single non-streaming LLM call: retrieval query built from element
  label + page title; returns `{hint: str, source: str | None}` (one sentence, ≤ 140 chars)
- In-memory TTL cache keyed by `sha1(company_id + url_path + selector_path + text)` so
  repeated hovers across users are free

**Pseudo-code**:

```python
@router.post("/hint", response_model=HintResponse)
async def hint(body: HintRequest):
    key = hint_cache.key(body)
    if cached := hint_cache.get(key):
        return cached
    query = f"{body.element.text or body.element.attrs.get('aria-label', '')} — {body.page_context.title}"
    chunks = await retrieval_service.retrieve(body.company_id, query, k=3)
    result = await llm.ainvoke(HINT_PROMPT.format(element=body.element, chunks=chunks,
                                                  page=body.page_context.title))
    response = HintResponse(hint=result.content.strip()[:140],
                            source=chunks[0].filename if chunks else None)
    hint_cache.set(key, response, ttl=3600)
    return response
```

**Phase 3 exit criteria**: `curl` chat request streams a grounded answer with sources;
hint request returns a one-liner; second identical hint request returns instantly from cache.

---

## Phase 4 — Embeddable Widget: Loader, Runtime, Chat

### Step 4.1: Widget scaffold + loader.js with singleton guard

**File(s)**: `widget/` (Vite + React + TS, IIFE build), `widget/src/lib.tsx` (entry),
`widget/public/loader.js`, `widget/vite.config.ts`

**Changes**:
- Mirror the marketing-player build approach: tiny `loader.js` fetched by the script tag,
  which injects the real bundle. **Singleton**: `window.__HINT__` guard — a second
  script tag on the same page is a no-op with a console warning.
- Reads `data-hint-company-id` and optional `data-hint-api-url` from its own tag.

**Pseudo-code**:

```typescript
// widget/public/loader.js (plain JS, no build)
(() => {
	if (window.__HINT__) {
		console.warn('Hint is already initialized on this page');
		return;
	}
	const tag = document.currentScript;
	const companyId = tag?.getAttribute('data-hint-company-id');
	if (!companyId) {
		console.error('Hint: data-hint-company-id is required');
		return;
	}
	window.__HINT__ = { companyId, apiUrl: tag.getAttribute('data-hint-api-url') };
	const script = document.createElement('script');
	script.src = new URL('hint-widget.js', tag.src).href;
	document.head.appendChild(script);
})();
```

```tsx
// widget/src/lib.tsx — bundle entry
const mount = () => {
	const config = window.__HINT__;
	if (!config || config.mounted) { return; }
	config.mounted = true;
	const host = document.createElement('div');
	host.id = 'hint-root';
	document.body.appendChild(host);
	const shadow = host.attachShadow({ mode: 'open' });
	injectStyles(shadow);                       // compiled CSS as string
	createRoot(shadow).render(<HintApp companyId={config.companyId} />);
};
mount();
```

### Step 4.2: Widget state store + API client

**File(s)**: `widget/src/store.ts` (Zustand), `widget/src/api/client.ts`

**Changes**:
- Single store (one instance per page, so no per-instance runtime needed):
  chat messages, panel open state, hint mode on/off, streaming status
- SSE chat client using `fetch` + `ReadableStream` (POST body, so `EventSource` is not usable)

**Pseudo-code**:

```typescript
interface HintState {
	isOpen: boolean;
	isHintModeEnabled: boolean;
	messages: ChatMessage[];
	isStreaming: boolean;
	sendMessage: (text: string) => Promise<void>;
}

const sendMessage = async (text: string) => {
	set((s) => ({ messages: [...s.messages, { role: 'user', content: text }], isStreaming: true }));
	const response = await fetch(`${apiUrl}/api/v1/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			company_id: companyId,
			messages: get().messages,
			page_context: extractPageContext(),
		}),
	});
	for await (const event of parseSseStream(response.body)) {
		if (event.name === 'token') { appendToLastAssistantMessage(event.data); }
		if (event.name === 'done') { setSources(JSON.parse(event.data).sources); }
	}
	set({ isStreaming: false });
};
```

### Step 4.3: Chat UI (distinct, not a generic bubble)

**File(s)**: `widget/src/ui/launcher.tsx`, `widget/src/ui/chat-panel.tsx`,
`widget/src/ui/message-list.tsx`, `widget/src/ui/styles/*`

**Changes**:
- Product-feel goal from the brief: recognizable, not "another chatbot bubble".
  POC direction: a slim **edge-docked guide bar** (right edge) that expands into a panel;
  a visible "hints" toggle on the bar; answers render UI-element references as
  highlighted chips (clicking a chip flashes/scrolls to the real element via its selector).
- Keyboard shortcut (`?` or `Cmd+/`) opens the panel.

**Pseudo-code**:

```tsx
const HintApp = ({ companyId }: HintAppProps) => {
	const isOpen = useHintStore((s) => s.isOpen);
	return (
		<>
			<GuideBar />                          {/* edge-docked: logo, hints toggle, open chat */}
			{isOpen && <ChatPanel />}
			<HintLayer />                         {/* Phase 5 */}
		</>
	);
};

const AssistantMessage = ({ message }: { message: ChatMessage }) => (
	<div className={styles.assistant}>
		{renderWithElementChips(message.content, handleChipClick)}
		{/* chip click → document.querySelector(selector)?.scrollIntoView() + flash outline */}
	</div>
);
```

**Phase 4 exit criteria**: demo page with the script tag shows the widget, chat streams
grounded answers about the uploaded manual, second script tag is ignored.

---

## Phase 5 — Hover Hints & DOM Understanding

### Step 5.1: Page-context extractor

**File(s)**: `widget/src/lib/page-context.ts`, `widget/src/lib/element-descriptor.ts`

**Changes**:
- `extractPageContext()`: url, title, h1–h3, visible main-content text (truncated),
  up to ~40 visible interactive elements (`button, a, input, select, [role=button], [role=menuitem], [onclick]`)
- `describeElement(el)`: tag, trimmed text, role, whitelisted attrs, short CSS path
- Skip Hint's own shadow host; skip invisible elements (`offsetParent === null` /
  zero rect)

**Pseudo-code**:

```typescript
const INTERACTIVE_SELECTOR =
	'button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="tab"]';

const extractPageContext = (): PageContext => {
	const interactive = [...document.querySelectorAll(INTERACTIVE_SELECTOR)]
		.filter(isVisible)
		.filter((el) => !el.closest('#hint-root'))
		.slice(0, 40)
		.map(describeElement);
	return {
		url: location.href,
		title: document.title,
		headings: [...document.querySelectorAll('h1, h2, h3')].map((h) => h.textContent!.trim()).slice(0, 10),
		interactive,
		visible_text_excerpt: extractMainText(2000),
	};
};

const describeElement = (el: Element): ElementDescriptor => ({
	tag: el.tagName.toLowerCase(),
	text: el.textContent?.trim().slice(0, 120) || null,
	role: el.getAttribute('role'),
	attrs: pickAttrs(el, ['id', 'name', 'aria-label', 'placeholder', 'href', 'type', 'title']),
	selector_path: buildCssPath(el, 4),      // max 4 ancestors, prefer ids/stable classes
});
```

### Step 5.2: Hover-hint engine (delegated listener + debounce + cache)

**File(s)**: `widget/src/lib/hint-engine.ts`

**Changes**:
- One delegated `mouseover` listener on `document` (capture phase), active only when hint
  mode is on. On hover of an interactive element: 400 ms dwell debounce → check client
  cache (`Map` keyed by selector path + text) → fetch `/api/v1/hint` → show tooltip.
- Abort in-flight request on `mouseout`; MutationObserver not needed since matching is
  done per-event (no upfront scan to keep stale).

**Pseudo-code**:

```typescript
const createHintEngine = (deps: HintEngineDeps) => {
	let dwellTimer: number | null = null;
	let abortController: AbortController | null = null;
	const cache = new Map<string, HintResponse>();

	const handleMouseOver = (event: MouseEvent) => {
		const target = (event.target as Element).closest(INTERACTIVE_SELECTOR);
		if (!target || target.closest('#hint-root')) { return; }
		dwellTimer = window.setTimeout(() => showHintFor(target), 400);
	};

	const showHintFor = async (el: Element) => {
		const descriptor = describeElement(el);
		const key = `${location.pathname}|${descriptor.selector_path}|${descriptor.text}`;
		const cached = cache.get(key);
		if (cached) { deps.showTooltip(el, cached.hint); return; }
		deps.showTooltip(el, null);                       // loading shimmer
		abortController = new AbortController();
		const hint = await fetchHint(descriptor, { signal: abortController.signal });
		cache.set(key, hint);
		deps.showTooltip(el, hint.hint);
	};

	const handleMouseOut = () => {
		if (dwellTimer) { clearTimeout(dwellTimer); }
		abortController?.abort();
		deps.hideTooltip();
	};

	return {
		enable: () => { document.addEventListener('mouseover', handleMouseOver, true);
		                document.addEventListener('mouseout', handleMouseOut, true); },
		disable: () => { /* remove both listeners, hide tooltip */ },
	};
};
```

### Step 5.3: Tooltip UI inside the Shadow DOM

**File(s)**: `widget/src/ui/hint-tooltip.tsx`

**Changes**:
- Tooltip rendered inside the widget's shadow root but positioned against the host
  element's `getBoundingClientRect()` (fixed positioning + viewport flip); subtle target
  outline while shown; loading shimmer state

**Pseudo-code**:

```tsx
const HintTooltip = () => {
	const activeHint = useHintStore((s) => s.activeHint);   // { rect, text | null }
	if (!activeHint) { return null; }
	const position = computePlacement(activeHint.rect);        // above, flip below near top edge
	return (
		<div className={styles.tooltip} style={{ '--x': `${position.x}px`, '--y': `${position.y}px` } as CSSProperties}
			role="tooltip" data-testid="hint-tooltip">
			{activeHint.text ?? <Shimmer />}
		</div>
	);
};
```

**Phase 5 exit criteria**: with hint mode on, hovering a button on the demo page for
~0.5 s shows a doc-grounded one-line hint; re-hover is instant (cache).

---

## Phase 6 — Demo Page, Hardening, Documentation

### Step 6.1: Demo host page

**File(s)**: `demo/index.html`

**Changes**:
- A fake SaaS dashboard (a few buttons, a form, a nav, a settings section) whose features
  match a sample user-manual PDF checked into `demo/sample-docs/`. Contains the embed
  snippet with a seeded company ID. Also includes a **duplicate** script tag to prove the
  singleton guard.

**Pseudo-code**:

```html
<body>
  <nav>… "Invoices" "Reports" "Settings" …</nav>
  <main>
    <button id="export-report">Export report</button>
    <form> … invoice creation form … </form>
  </main>
  <script src="http://localhost:1337/embed/v1/loader.js"
          data-hint-company-id="cmp_demo0001"
          data-hint-api-url="http://localhost:8000" defer></script>
  <!-- duplicate on purpose: must be a no-op -->
  <script src="http://localhost:1337/embed/v1/loader.js"
          data-hint-company-id="cmp_other" defer></script>
</body>
```

### Step 6.2: Hardening pass

**File(s)**: `backend/app/routes/*`, `widget/src/api/client.ts`

**Changes**:
- Backend: validate `company_id` exists on chat/hint (404 otherwise), cap request body
  size, cap `page_context` sizes server-side, structured logging of latency per endpoint
- Widget: graceful degradation — if the backend is down, chat shows a friendly error and
  hint mode silently disables; all fetches have timeouts

**Pseudo-code**:

```python
async def require_company(company_id: str, repo: CompanyRepository = Depends(...)) -> Company:
    company = await repo.find_by_company_id(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    return company
```

### Step 6.3: Update Documentation (MANDATORY)

**File(s)**: `docs/01-architecture-overview.md`, `docs/02-backend.md`, `docs/03-widget.md`,
`docs/04-admin.md`, `docs/05-api-contracts.md`, `README.md`

**Changes**:
- Since this is a greenfield repo, `docs/` is created as part of the plan, not just updated:
  architecture overview (diagram + component table), backend layering + env vars, widget
  embed contract (`loader.js` attributes, singleton behavior, Shadow DOM), admin usage,
  full API contracts with example payloads (chat SSE event shapes, hint request/response)
- README: exact run commands (`docker compose up --build`), ports, demo walkthrough,
  known limitations (no auth, no rate limiting, heuristic DOM parsing)

**Pseudo-code**:

```markdown
# docs/05-api-contracts.md (excerpt)
## POST /api/v1/chat  → text/event-stream
Request: { company_id, messages: [{role, content}], page_context: {...} }
Events:  event: token  data: "To export a report, "
         event: done   data: {"sources": ["user-manual.pdf"]}
Errors:  404 unknown company_id · 422 invalid body
```

---

## Edge Cases

- **Duplicate script tags** → loader singleton guard; second tag logs a warning, no-op.
- **Unknown / deleted company ID in the snippet** → widget mounts, first API call gets 404,
  widget shows "not configured" state and disables itself.
- **Empty knowledge base** (company created, no docs) → chat answers "I don't have
  documentation for this yet"; hints return a generic descriptor-based fallback or nothing.
- **Non-text PDFs (scanned images)** → ingestion marks the document `failed` with a reason;
  admin shows the failure. OCR is out of scope.
- **Huge pages** → context extractor caps interactive elements (40) and text (2000 chars);
  backend re-validates caps.
- **SPA navigation** (pushState) → page context is extracted per request, so it is always
  current; no re-mount needed. Hovering during route transitions aborts stale hint requests.
- **Hovering rapidly across many elements** → dwell debounce + abort of in-flight requests
  prevents request storms.
- **Host page CSS / z-index wars** → Shadow DOM + max z-index on the host node.
- **CORS** → widget runs on arbitrary customer origins; backend allows `*` for the POC.

## Testing Checklist

- [ ] `docker compose up --build` boots all services; `/health` returns ok
- [ ] Create company via admin; company appears in Mongo with unique `company_id`
- [ ] Upload PDF + MD + TXT together; all become `ready`; chunk counts > 0 in Chroma
- [ ] `/retrieve` returns relevant chunks for a manual-specific query
- [ ] Chat streams tokens over SSE; answer cites uploaded doc content; sources listed
- [ ] Chat references an on-screen element when the question is action-oriented
- [ ] Hint request returns ≤ 140 chars; identical second request served from cache (fast)
- [ ] Widget mounts on demo page via loader.js; duplicate tag is a no-op
- [ ] Chat panel opens/closes; keyboard shortcut works; streaming renders progressively
- [ ] Hint mode toggle on/off; hover dwell shows tooltip; mouseout hides and aborts
- [ ] Unknown company ID → widget disables gracefully, no console spam
- [ ] Backend down → chat shows friendly error, hints silently off
- [ ] Backend unit tests: ingestion chunking, retrieval, hint cache key, company 404 guard
- [ ] Widget unit tests (Vitest): page-context extractor, element descriptor, hint engine
      debounce/abort, singleton guard

## Files to Modify (all new — greenfield)

- [ ] `docker-compose.yml`, `.env.example`, `README.md`
- [ ] `backend/Dockerfile`, `backend/requirements.txt`
- [ ] `backend/app/main.py`, `backend/app/config.py`
- [ ] `backend/app/db/mongo.py`, `backend/app/db/chroma.py`
- [ ] `backend/app/models/{company,document,assist}.py`
- [ ] `backend/app/repositories/{company_repo,document_repo,vector_repo}.py`
- [ ] `backend/app/services/{company_service,ingestion_service,retrieval_service,hint_cache}.py`
- [ ] `backend/app/ai/{chat_graph,hint_chain,prompts,llm_factory}.py`
- [ ] `backend/app/routes/{companies,documents,assist}.py`
- [ ] `admin/` (Vite app: pages, api client, upload + snippet components, Dockerfile)
- [ ] `widget/public/loader.js`, `widget/src/lib.tsx`, `widget/vite.config.ts`, `widget/Dockerfile`
- [ ] `widget/src/store.ts`, `widget/src/api/client.ts`
- [ ] `widget/src/lib/{page-context,element-descriptor,hint-engine}.ts`
- [ ] `widget/src/ui/{launcher,chat-panel,message-list,hint-tooltip}.tsx` + styles
- [ ] `demo/index.html`, `demo/sample-docs/`
- [ ] `docs/01..05` documentation files

## Implementation Order

1. **Phase 0** — scaffold + compose (0.1 → 0.2)
2. **Phase 1** — companies → ingestion → retrieval (1.1 → 1.2 → 1.3); verify with curl
3. **Phase 2** — admin (2.1 → 2.2); verify full upload flow in browser
4. **Phase 3** — AI (3.1 contract first → 3.2 chat → 3.3 hints); verify with curl
5. **Phase 4** — widget (4.1 loader → 4.2 store/API → 4.3 chat UI); verify on demo page
6. **Phase 5** — hints (5.1 extractor → 5.2 engine → 5.3 tooltip)
7. **Phase 6** — demo polish → hardening → **documentation (mandatory final step)**

Phases 2 and 3 are independent of each other and can be swapped or parallelized;
everything else is sequential.
