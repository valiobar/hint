# Hint — Widget

> **Status: shipped.** Embeddable React 18 IIFE (Vite), open Shadow DOM,
> Feature-Sliced Design (`app → widgets → features → entities → shared`),
> one Zustand store. No router, no auth, no JWT. Runtime dependencies are
> React, React DOM, and Zustand.
> Embed contract and ports: [`01-architecture-overview.md`](01-architecture-overview.md).
> Chat / hint HTTP and the walkthrough prompt:
> [`02-backend.md`](02-backend.md), [`06-ai-layer.md`](06-ai-layer.md).
> Operator setup (snippet, starter questions): [`04-admin.md`](04-admin.md).
> Tester checklist: [`HOW_TO_PLAY.md`](HOW_TO_PLAY.md).

The widget (`widget/`, CDN host port **1337**) is what an end user sees
on a host SaaS page. A single `<script>` tag loads it. It answers from
that company's docs plus the live page: streamed chat, hover hints,
element chips, and guided walkthroughs.

It does not upload documents, sign users in, or talk to Mongo or Chroma.
Those stay on the backend. The widget calls three public HTTP routes
and reads the host DOM.

## Runtime dependencies

```
host page
  ├─ <script src="…/embed/v1/loader.js" data-hint-company-id data-hint-api-url>
  │     └─ widget-cdn (:1337)  loader.js  →  hint-widget.{hash}.js + .css
  └─ DOM the widget reads and highlights (outside the shadow root)

widget bundle
  ├─ POST /api/v1/chat                          SSE, no token
  ├─ POST /api/v1/hint                          JSON, no token
  └─ GET  /api/v1/companies/{id}/widget-config  JSON, no token
        └─ backend (:8000) → Chroma + LLM  (see 06-ai-layer.md)
```

| Depends on | For | Does not depend on |
|---|---|---|
| `widget-cdn` | `loader.js`, hashed JS, hashed CSS | Admin SPA, demo page (demo only hosts the snippet) |
| Backend public assist routes | Chat, hints, starter questions | `/auth/*`, `/billing/*`, company CRUD, document upload, `POST /retrieve` |
| Host DOM | Page context, element chips, walkthrough targets | Host CSS (styles live in the shadow root) |
| `sessionStorage` | Chat thread, dock side, hint-mode toggle | Server-side history |
| `localStorage` | Intro open count (5 page loads per company) | The chat store |

Unknown `company_id` is a 404 from chat or hint. The store then sets
`isDisabled` and the guide bar stops. A failed widget-config fetch is
softer: empty starter chips, no error banner.

CORS on the backend is `*` so the bundle can run on a customer origin.
The widget sends no `Authorization` header.

### npm

Production dependencies in `widget/package.json`: `react`, `react-dom`,
`zustand`. Markdown, SSE parsing, element lookup, and the hint cache are
local code. Package manager is pnpm 9.15.9. There is no shared package
with `admin/`.

## Embed and mount

```html
<script src="http://localhost:1337/embed/v1/loader.js"
        data-hint-company-id="cmp_YOUR_ID"
        data-hint-api-url="http://localhost:8000"
        defer></script>
```

| Attribute | Required | Behavior |
|---|---|---|
| `data-hint-company-id` | yes | Loader aborts without it |
| `data-hint-api-url` | no | Defaults to `http://localhost:8000` (wrong on a remote host) |

`widget/build-plugins/content-hash-and-loader.ts` writes `loader.js`
after the Vite build, once the content hash is known. The loader is the
only URL a host page names.

1. Singleton guard: a second tag on the same page is a no-op
   (`window.__HINT__.mounted`) plus a console warning. The demo page
   includes a duplicate on purpose.
2. Sets `window.__HINT__` (`companyId`, `apiUrl`, `cdnBaseUrl`) before
   the IIFE runs. `widget/src/shared/config/index.ts` reads that global.
   A bundle loaded without it does not mount.
3. Injects `hint-widget.{hash}.js` from the same CDN directory.

`widget/src/app/mount.tsx` then:

1. Creates `#hint-root` (`position: fixed`, `z-index: 2147483647`,
   zero size — children paint out of it).
2. Attaches an **open** shadow root.
3. Loads `hint-widget.{hash}.css` into that root
   (`app/load-shadow-css.ts`). CSS failure removes the host node and
   disables the widget.
4. Renders `HintApp` into the shadow root.

Caching (`widget/nginx.conf`):

| File | Cache-Control |
|---|---|
| `/embed/v1/loader.js` | `no-store` |
| `/embed/v1/hint-widget.{hash}.js` and `.css` | `public, max-age=31536000, immutable` |

Both send `Access-Control-Allow-Origin: *`. A new deploy reaches an
already-embedded page on the next navigation, because the page re-fetches
the loader and the loader names the new hash.

Host-page highlights are the exception to shadow isolation. Chips and
walkthroughs add a `<style id="hint-element-highlight-style">` to
`document.head` and a class on the host element
(`shared/lib/element-highlight.ts`). Shadow CSS variables do not apply
outside the root, so the accent color is inlined there.

## FSD layout

Upper layers import only from layers below. Features do not import other
features or widgets. Cross-feature state goes through
`shared/store/hint-store.ts`. Each slice exposes `index.ts`; consumers
import `@/features/hover-hint`, not the file inside it.

```
widget/src/
├── app/
│   ├── mount.tsx                  # #hint-root + open shadow + CSS
│   ├── load-shadow-css.ts
│   └── hint-app.tsx               # guide bar, chat, hint layer, walkthrough layer
├── widgets/
│   ├── guide-bar/                 # dock, chat toggle, lightbulb, intro callout
│   └── chat-panel/                # panel, message list, new chat
├── features/
│   ├── send-message/              # composer → store.sendMessage
│   ├── suggested-questions/       # GET widget-config, empty-state chips
│   ├── onboarding-intro/          # first-run callout
│   ├── hover-hint/                # dwell engine, tooltip, in-page cache
│   ├── locate-element/            # chips, flash, click/focus the host control
│   └── walkthrough/               # parse numbered answers, overlay, card
├── entities/
│   └── message/                   # MessageBubble (markdown slot, sources, copy)
└── shared/
    ├── api/                       # assist.ts, sse.ts, request caps
    ├── config/                    # window.__HINT__
    ├── store/hint-store.ts
    ├── ui/                        # icons, markdown, variables.css
    └── lib/                       # page context, element lookup, intro storage
```

`app/hint-app.tsx` mounts two features directly (`HintLayer`,
`WalkthroughLayer`) next to the two widgets. They overlay the host page,
so they are not children of the guide bar or the chat panel. That is the
one place `app/` reaches past `widgets/`.

`shared/ui/markdown` does not import `features/locate-element`.
`MarkdownContent` takes the inline renderer as a prop.
`widgets/chat-panel/ui/message-list.tsx` passes
`renderWithElementChips`. Chips work inside list items, and `shared/`
stays below `features/`.

## What calls what

| Slice | Reads | Writes | Network |
|---|---|---|---|
| `guide-bar` | dock, hint mode, intro flag | `togglePanel`, `toggleHintMode`, `setDockPosition` | none |
| `onboarding-intro` | `hasSeenIntro`, dock side | `openPanel`, `markIntroSeen` | none |
| `send-message` | `isStreaming`, `isDisabled` | `sendMessage` | none (the store calls chat) |
| `suggested-questions` | store messages empty | `sendMessage(question)` | `GET …/widget-config` |
| `chat-panel` | messages, streaming, walkthrough | `clearMessages`, `startWalkthrough` | none |
| `locate-element` | host DOM | flash / click / focus a control | none |
| `hover-hint` | hint mode, `activeHint` | `showHint` / `hideHint` / `disableWidget` | `POST /hint` |
| `walkthrough` | `walkthrough` | next / prev / stop | none |
| `hint-store.sendMessage` | messages, page context | thread, `isStreaming`, `chatError` | `POST /chat` (SSE) |

Keyboard: Ctrl/Cmd+/ toggles the panel (`hint-app.tsx`), unless the
widget is disabled. Escape stops a walkthrough (bound on the host
document inside `WalkthroughLayer`).

## Store

`shared/store/hint-store.ts`. One store for the page. Persisted with
Zustand `persist` under `hint:chat:{companyId}` so two companies on one
origin do not share a thread.

| Field | Persisted | Notes |
|---|---|---|
| `messages` | sessionStorage, last 30 non-empty | Dropped if content is empty (reload mid-stream does not restore a blank bubble) |
| `isHintModeEnabled` | sessionStorage | Lightbulb |
| `dockSide`, `dockTopFraction` | sessionStorage | Left/right and vertical fraction |
| `isOpen`, `isStreaming`, `chatError`, `activeHint` | no | Fresh each load |
| `walkthrough` | no | Reload drops the overlay; the source message still shows **Walk me through it** |
| `hasSeenIntro` | no | Session UI. The 5-open budget is `localStorage` in `shared/lib/intro-storage.ts` |

`sessionStorage` that throws (sandboxed iframe, strict privacy mode)
falls back to an in-memory `Map`. Persistence degrades; mount does not
throw.

Intro: `hint:introOpens:{companyId}` counts page loads, max 5
(`INTRO_MAX_OPENS`). A legacy `hint:introSeen:{companyId}=1` counts as
already finished. Dismiss or opening the panel sets `hasSeenIntro` for
this load only. Later loads still show the callout until the budget is
spent. The callout waits ~1.5 s, hides while dragging, and is not shown
when the widget is disabled.

### Actions that matter across features

| Action | Behavior |
|---|---|
| `sendMessage(text)` | No-op while streaming, disabled, or blank. Appends the user turn and an empty assistant bubble, clears any walkthrough, streams tokens into that bubble, then writes `sources` from `event: done`. |
| `clearMessages()` | No-op while `isStreaming`. Clears messages, `chatError`, and `walkthrough`. |
| `disableWidget()` | `isDisabled`, hint mode off, hint and walkthrough cleared. 404 from chat or hint. |
| `startWalkthrough(steps)` | Requires `steps.length >= 2` and `!isDisabled`. Index 0, closes the panel, clears `activeHint`. |
| `nextWalkthroughStep()` | Past the last step → `walkthrough = null`. |
| `prevWalkthroughStep()` | Clamped at 0. |
| `stopWalkthrough()` | `walkthrough = null`. |

A 404 sets the assistant bubble failed **and** disables the widget.
Other `ApiError`s (503 missing OpenAI key, network) fail that bubble
and surface `detail` as `chatError`. Mid-stream `event: error` marks
the bubble failed without disabling the widget.

Wire messages sent to `/chat` drop failed bubbles and empty content,
keep at most `MAX_MESSAGES`, and truncate each to `MAX_MESSAGE_CHARS`
(`shared/api/types.ts`). The same caps exist on the backend; the widget
clips before the request.

## Page context

`shared/lib/page-context.ts` runs on every chat send and every hint
fetch. It does not include anything inside `#hint-root`.

| Field | Source | Cap |
|---|---|---|
| `url` | `location.href` | `MAX_URL_CHARS` |
| `title` | `document.title` | 512 |
| `headings` | visible `h1–h3` text | `MAX_HEADINGS` |
| `visible_text_excerpt` | `main` innerText, else `body` | `MAX_TEXT_EXCERPT_CHARS` |
| `interactive` | visible controls matching `INTERACTIVE_SELECTOR` | `MAX_INTERACTIVE_ELEMENTS` |

Each interactive entry is an `ElementDescriptor` (tag, text, role, attrs,
`selector_path`) from `shared/lib/element-descriptor.ts`. The backend
uses that list for page-aware answers and for the walkthrough step
labels. Contract: [`06-ai-layer.md`](06-ai-layer.md).

## Chat

`POST /api/v1/chat` via `fetch` + `ReadableStream`
(`shared/api/sse.ts`). Browsers cannot use `EventSource` here because
the request has a body.

| SSE event | Widget |
|---|---|
| `token` | Append to the in-flight assistant bubble |
| `done` | `sources` on that bubble (filename, or host + path when the value is an `http` URL) |
| `error` | `isFailed` on that bubble |

Rendering (`entities/message` + `shared/ui/markdown`):

- Assistant bubbles: paragraphs, ordered/unordered lists, inline code.
  Plain-text runs go through `renderWithElementChips`.
- User bubbles: plain text.
- Quoted or bold control labels become chips. Click flashes the host
  control and clicks or focuses it (`performElementAction`). Lookup
  excludes `#hint-root`.
- Copy on a **finished** assistant bubble copies raw markdown. Needs a
  secure context; on plain `http://` the clipboard write fails with a
  console warning.
- New chat is the header control. Disabled while streaming or when the
  thread is already empty.

Empty thread: a fixed sentence plus `SuggestedQuestions`. Chips come
from `GET /api/v1/companies/{id}/widget-config` (0–4 strings). The
feature caches them in a module `Map` for the page lifetime, so New
chat does not refetch. A host reload does. 404 or network yields `[]`
(sentence only). The questions are operator copy from Admin, not
generated from the knowledge base.

## Hover hints

Lightbulb sets `isHintModeEnabled`. `createHintEngine`
(`features/hover-hint/lib/hint-engine.ts`) listens on the host document.

1. Pointer dwell ~400 ms (`DWELL_MS`) on a visible interactive element
   outside `#hint-root`.
2. In-page `Map` keyed by the element descriptor, cap 200. Hit → tooltip
   immediately, no request.
3. Miss → `POST /hint` with the descriptor and a fresh page context.
   Leaving the element aborts the request.
4. 404 disables the widget. The backend has a second cache (in-process,
   cleared on restart); this Map dies on navigation. Both are documented
   in [`06-ai-layer.md`](06-ai-layer.md#hint-cache).

The tooltip is one sentence, ≤ 140 characters, clamped on the server.

## Guided walkthroughs

No extra HTTP call. The prompt-level step list is owned by
`ANSWER_SYSTEM` ([`06-ai-layer.md`](06-ai-layer.md#step-list-contract-guided-walkthroughs)).
The widget parses the completed assistant string.

End-to-end: user asks a how-to → the answer is a numbered list →
`parseWalkthroughSteps` yields at least 2 steps → **Walk me through it**
under that message → start closes the chat panel and highlights one host
control at a time.

`message-list.tsx` runs the parser only on completed assistant messages
(not failed, not the in-flight stream). If the model does not follow the
format, there is no button and the answer stays a normal chat bubble.

```
walkthrough: {
  steps: Array<{ instruction: string; label: string | null }>;
  activeStepIndex: number;
} | null
```

`WalkthroughLayer` renders nothing when `walkthrough` is null.

1. `useWalkthroughTarget(label, stepIndex)` resolves the quoted label
   with `findElementByLabel` (excludes `#hint-root`). Retry: every 200 ms
   for 2 s, so a menu that opens after the previous click can still
   resolve.
2. On hit: host outline (`outlineElement`) and
   `scrollIntoView({ block: 'center' })`.
3. `WalkthroughCard` ("Step N of M", instruction, Back / Next or Done /
   Stop) is placed by `computeCardPlacement`: below the target if it
   fits, otherwise above. `floating` (bottom-center) when there is no
   rect (unresolved label or instruction-only step).
4. Unresolved copy: "Can't find this element on the current page — do
   the step manually, then press Next." Back / Next / Stop stay usable.

Auto-advance: capture-phase `pointerdown` on `document`. If the target
is the highlighted element or a descendant, wait **600 ms**, then
`nextWalkthroughStep`. The delay lets the host UI open a menu before
the next resolve. The timer is cleared on unmount so a manual Next or
Stop does not race. Clicks inside the widget never advance, because
`findElementByLabel` cannot return a node under `#hint-root`.

## What this package does not do

- No JWT, no register, no billing UI.
- No `POST /retrieve`. Retrieval happens inside `/chat` and `/hint`.
- No server-side transcript. Refresh keeps `sessionStorage` for this tab.
- No authored tours. Walkthroughs exist only when the model emits a
  numbered list the parser accepts.
- No OCR and no document upload. A scanned PDF fails in Admin; the
  widget then has nothing new to retrieve.
- Starter questions are not generated from the page or the knowledge base.
