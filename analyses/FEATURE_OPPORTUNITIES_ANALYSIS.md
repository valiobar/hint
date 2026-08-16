# Feature Opportunities Analysis — Top 5 by User Value vs Effort

## 1. Overview

This analysis surveys the entire Hint system (widget, backend, admin, demo) to
identify the five most valuable features to build next, prioritized by
**end-user/admin value first, implementation effort second**.

Key files reviewed:

- `widget/src/shared/store/hint-store.ts` — single Zustand store (state, actions, persistence)
- `widget/src/shared/lib/page-context.ts` — page snapshot sent with every chat request
- `widget/src/features/locate-element/*` — label→element resolution, flash, click/focus actions
- `widget/src/features/hover-hint/*` — dwell engine, tooltip, placement
- `widget/src/entities/message/ui/message-bubble.tsx` — message rendering
- `backend/app/routes/assist.py` — `/chat` (SSE) and `/hint` endpoints
- `backend/app/ai/chat_graph.py`, `backend/app/ai/hint_chain.py` — LangGraph RAG pipeline
- `plans/hint_poc_implementation.md`, `demo/ADMIN_USER_MANUAL.md` — declared scope and known gaps

## 2. Architecture Context

Hint is a POC with three runtime surfaces:

1. **Widget** (`widget/`) — React IIFE in an open Shadow DOM, FSD layers
   (`app → widgets → features → entities → shared`), one Zustand store
   (`shared/store/hint-store.ts`) persisted to `sessionStorage` per company.
2. **Backend** (`backend/`) — single FastAPI service, layered
   `routes → ai/services → repositories → models`, MongoDB (companies,
   documents, users) + ChromaDB (`kb_{company_id}`), OpenAI-only LLM factory.
3. **Admin** (`admin/`) — React SPA for company/document management and embed
   snippet generation.

What users can do **today**: streamed RAG chat with source filenames, element
chips that locate/act on host controls, hover hints (≤140 chars) on
interactive elements, draggable dock, per-tab persistence.

What does **not** exist today (confirmed in code and
`demo/ADMIN_USER_MANUAL.md` "out of scope" notes): analytics/transcripts,
answer feedback, theming API, guided tours, suggested prompts, markdown
rendering, server-side conversation storage, rate limiting/API keys.

## 3. Top 5 Feature Opportunities

Ranked by value-to-effort ratio. Effort assumes the existing seams described
in the Evidence sections.

---

### Feature 1 — Suggested starter questions (empty state + page-aware prompts)

- **Value: High** · **Effort: Low** · **Ratio: best in class**

**Problem.** The chat panel's empty state shows nothing actionable. New users
face a blank composer and must guess what the assistant can do — the classic
"blank page problem" that kills activation for embedded assistants. The
hover-hint mode partially compensates, but only for users who discover the
lightbulb toggle.

**Proposal.** When `messages.length === 0`, render 3–4 clickable suggestion
chips (e.g. "What can I do on this page?", "How do I create an invoice?").
Clicking a chip calls the existing `sendMessage` action verbatim. Two tiers:

1. **v1 (near-zero effort):** static per-company suggestions configured in
   admin, delivered via a tiny `GET /api/v1/companies/{id}/widget-config`
   response cached by the widget.
2. **v2:** generate suggestions server-side from the top KB chunks plus the
   `page_context` headings already sent with every chat request.

**Evidence of the seam.** The store already exposes everything needed — the
empty-state component only needs `messages` and `sendMessage`:

```61:75:widget/src/shared/store/hint-store.ts
	messages: UiChatMessage[];
	chatError: string | null;
	activeHint: ActiveHint | null;
	dockSide: DockSide;
	/** Guide bar center Y as a fraction of the viewport height. */
	dockTopFraction: number;
	openPanel: () => void;
	closePanel: () => void;
	togglePanel: () => void;
	toggleHintMode: () => void;
	showHint: (rect: HintRectSnapshot, text: string | null) => void;
	hideHint: () => void;
	disableWidget: () => void;
	setDockPosition: (side: DockSide, topFraction: number) => void;
	sendMessage: (text: string) => Promise<void>;
```

And `extractPageContext()` (`widget/src/shared/lib/page-context.ts`) already
collects the headings a v2 generator would need — no new page scraping.

**Scope.** New `features/suggested-questions/` slice-free UI component in the
chat panel; optional one small backend endpoint. No store schema change.

---

### Feature 2 — Answer feedback (👍/👎) + admin transcripts/analytics

- **Value: High** (compounding — it improves the KB itself) · **Effort: Low–Medium**

**Problem.** Admins are completely blind: no chat transcripts, no hint
analytics, no signal about which questions fail
(`demo/ADMIN_USER_MANUAL.md` explicitly lists these as out of scope). Without
feedback, admins cannot tell which documents are missing or misleading, so KB
quality never improves — the core value loop of the product is open.

**Proposal.**

1. Add 👍/👎 buttons to completed assistant messages in `MessageBubble`.
2. `POST /api/v1/feedback` stores `{company_id, question, answer, sources, rating, url}`
   in a new Mongo `feedback` collection (fits the existing
   `routes → services → repositories` layering; index on `company_id`).
3. Admin panel gets a read-only "Feedback" tab per company: worst-rated
   questions first — a direct to-do list for documentation gaps.

**Evidence of the seam.** `MessageBubble` already renders per-message footers
(failure note, sources), so a feedback row is an additive block:

```48:57:widget/src/entities/message/ui/message-bubble.tsx
		{isFailed && (
			<p className={styles.failedNote} role="alert">
				This answer failed to load. Try again.
			</p>
		)}
		{sources && sources.length > 0 && (
			<p className={styles.sources} data-testid="message-sources">
				From: {sources.join(', ')}
			</p>
		)}
```

The `done` SSE event already delivers `sources` per answer
(`backend/app/routes/assist.py`, line 65), so the feedback payload needs no
new pipeline data.

**Scope.** One endpoint + repo + collection, small widget UI, one admin tab.
No changes to the chat pipeline.

---

### Feature 3 — Host theming via loader attributes

- **Value: High** (adoption blocker for real customers) · **Effort: Low**

**Problem.** The widget is hardcoded indigo (`--hint-accent: #4f46e5` in
`widget/src/shared/ui/styles/variables.css`). Any customer whose brand isn't
indigo gets a visually foreign element on their page. For an embeddable
product, brand mismatch is a top rejection reason — and there is currently no
runtime theming API at all.

**Proposal.** Accept optional loader attributes and map them to the CSS
custom properties already defined on `:host`:

```html
<script src=".../loader.js"
        data-hint-company-id="cmp_…"
        data-hint-accent="#0f766e"
        data-hint-radius="8px" defer></script>
```

The loader already parses `data-hint-*` attributes into `window.__HINT__`
(`widget/build-plugins/content-hash-and-loader.ts`), and `mount.tsx` owns the
shadow root, so applying overrides is a few lines of
`hostElement.style.setProperty('--hint-accent', …)`. The admin embed-snippet
generator (`admin/src/features/copy-embed-snippet/`) gains a color picker.

One caveat: the host-page highlight color used by
`widget/src/shared/lib/element-highlight.ts` is injected into
`document.head` (outside the shadow root) and currently matches the hardcoded
accent — it must read the same config value to stay in sync.

**Scope.** Loader attribute parsing, one config field, ~5 CSS variable
overrides, admin snippet UI. No store or backend changes.

---

### Feature 4 — Guided step-by-step walkthroughs ("Show me how")

- **Value: Very High** (flagship differentiator) · **Effort: Medium–High**

**Problem.** Today the assistant *tells* users what to do and can highlight
one element at a time via chips. The natural next step — walking a user
through a multi-step flow ("create your first invoice") step by step — is the
single most valuable interaction an in-app guide can offer, and every
building block already exists.

**Proposal.**

1. Extend the chat prompt so the LLM can return a structured step list
   (`[{label, instruction}]`) when the user asks a "how do I…" question —
   the answer node already receives the interactive-element descriptors.
2. New `features/walkthrough/` with store state
   `{steps, activeStepIndex} | null` and actions `startWalkthrough`,
   `nextStep`, `stopWalkthrough`.
3. Each step: resolve the element with the existing
   `findElementByLabel`, highlight it with the existing flash/outline
   helpers, show a floating "Step 2 of 4" card with Next/Stop.

**Evidence of the seam.** Element resolution, highlighting, and action
execution are already isolated pure utilities:

```3:11:widget/src/features/locate-element/lib/perform-element-action.ts
export const performElementAction = (el: Element): void => {
	const target = el as HTMLElement;
	const tag = target.tagName.toLowerCase();
	if (FOCUS_TAGS.has(tag) || target.isContentEditable) {
		target.focus();
		return;
	}
	target.click();
};
```

And the backend already receives up to `MAX_INTERACTIVE_ELEMENTS` structured
descriptors per request via `extractPageContext()`
(`widget/src/shared/lib/page-context.ts`, lines 31–36), so the LLM can ground
steps in real, currently-visible controls.

**Scope.** Prompt/schema change in `backend/app/ai/chat_graph.py`, new widget
feature + store slice fields, step-card UI. The largest of the five, but it
reuses `locate-element` and `hover-hint` placement logic rather than building
new DOM machinery.

---

### Feature 5 — Chat panel UX bundle: markdown rendering, copy answer, new chat

- **Value: Medium–High** · **Effort: Low**

**Problem.** Three small everyday frictions:

1. Assistant answers render as plain text — the LLM naturally emits lists and
   `**bold**`, which today is only consumed by the chip parser
   (`widget/src/features/locate-element/ui/render-with-element-chips.tsx`);
   numbered instructions arrive as an unreadable wall of text.
2. No way to copy an answer (users screenshot or retype).
3. No way to start over — `messages` persists per tab with no
   `clearMessages` action in the store, so a cluttered history follows the
   user until the tab closes.

**Proposal.** In one pass: (a) lightweight markdown rendering (bold, lists,
inline code — a minimal renderer or `marked` behind `shared/lib/markdown.ts`
per the 3rd-party-library rule) composed *with* the existing chip parser;
(b) a copy-to-clipboard button on assistant bubbles; (c) a "New chat" button
in the panel header backed by a new `clearMessages` store action.

**Evidence of the seam.** The store's persistence already partializes
`messages` (`widget/src/shared/store/hint-store.ts`, lines 200–207), so
`clearMessages: () => set({ messages: [], chatError: null })` propagates to
`sessionStorage` for free. `MessageBubble` accepts `children: ReactNode`, so
swapping plain text for a markdown tree is a call-site change in the message
list, not a rewrite.

**Scope.** One shared markdown util, small `MessageBubble`/panel-header
additions, one store action. No backend changes.

---

## 4. What Works Well (Foundations these features build on)

- **Pattern: pure, isolated DOM utilities in `locate-element/lib/` and
  `shared/lib/`** (`find-element-by-label.ts`, `flash-element.ts`,
  `element-highlight.ts`, `page-context.ts`). Each is a small pure function
  with its own tests.
  **Why it works:** walkthroughs (Feature 4) become composition, not new
  machinery.
  **Where else to apply:** keep the walkthrough step-resolver in
  `features/walkthrough/lib/` following the same pure-function style.

- **Pattern: single store with graceful persistence**
  (`hint-store.ts` lines 13–32 — `sessionStorage` probe with in-memory
  fallback; lines 200–207 — explicit `partialize`).
  **Why it works:** new state (feedback given, walkthrough progress,
  suggestions seen) slots into one place with deliberate persistence
  decisions instead of scattered `localStorage` calls.
  **Where else to apply:** the admin store could adopt the same storage-probe
  fallback for its JWT handling.

- **Pattern: caps enforced at the API boundary**
  (`MAX_MESSAGES`, `MAX_MESSAGE_CHARS`, `MAX_INTERACTIVE_ELEMENTS` in
  `shared/api/types.ts`, applied in `toWireMessages` and
  `extractPageContext`).
  **Why it works:** token cost and payload size stay bounded no matter what
  the host page looks like.
  **Where else to apply:** cap the suggested-questions response (Feature 1)
  and walkthrough step count (Feature 4) the same way.

- **Pattern: layered backend with dependency-injected services**
  (`assist.py` — routes depend on `RetrievalService`, `CompanyRepository`,
  `HintCache` via `Depends`).
  **Why it works:** the feedback endpoint (Feature 2) is additive — new repo,
  new route, zero changes to existing code paths.

## 5. Summary — Priority Matrix

| # | Feature | User Value | Effort | Value/Effort |
|---|---------|-----------|--------|--------------|
| 1 | Suggested starter questions (empty state) | **High** | Low | ★★★★★ |
| 2 | Answer feedback + admin transcripts | **High** | Low–Medium | ★★★★★ |
| 3 | Host theming via loader attributes | **High** (adoption) | Low | ★★★★ |
| 5 | Chat UX bundle (markdown, copy, new chat) | **Medium–High** | Low | ★★★★ |
| 4 | Guided step-by-step walkthroughs | **Very High** | Medium–High | ★★★ |

Note: Features 1–3 and 5 are all shippable independently and in parallel;
Feature 4 is the strategic bet and benefits from landing after Feature 5
(markdown/structured answers) and Feature 2 (feedback tells you which flows
users struggle with — the best candidates for walkthroughs).

## 6. Suggested Implementation Order

1. **Feature 5 — Chat UX bundle** (quickest win, pure frontend, improves
   every existing conversation immediately).
2. **Feature 1 — Suggested starter questions** (v1 static config; fixes
   activation; reuses the widget-config endpoint that Feature 3 also needs).
3. **Feature 3 — Host theming** (ship alongside Feature 1 — both touch the
   loader/config path and the admin snippet UI, so do them in one pass).
4. **Feature 2 — Answer feedback + transcripts** (small backend addition;
   start collecting data early so Feature 4 has evidence to prioritize
   flows).
5. **Feature 4 — Guided walkthroughs** (largest scope; by this point
   markdown/structured rendering, widget-config plumbing, and feedback data
   all exist and de-risk it).

**Deliberately excluded from the top 5** (lower user-visible value or higher
effort right now): server-side conversation persistence (sessionStorage is
adequate for POC), Redis shared hint cache (single-replica deployment),
rate limiting/API keys (important hardening, but security work rather than a
user-value feature — schedule it with Phase 6), i18n, and OCR ingestion.
