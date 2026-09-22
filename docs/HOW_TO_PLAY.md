# Hint — What it is and how to play with it

This is the tester / demo guide. After reading it you should know what
Hint does, which screens exist, and how to exercise every feature.

Deeper operator manuals (every invoice button, every admin error
string): [`demo/USER_MANUAL.md`](../demo/USER_MANUAL.md) and
[`demo/ADMIN_USER_MANUAL.md`](../demo/ADMIN_USER_MANUAL.md).

---

## What Hint is

Hint is an **in-app AI guide** you drop into a SaaS product with one
`<script>` tag.

A company uploads its product docs in **Admin**. End users on the host
app get:

- a **chat** that answers “how do I …?” from those docs **and** what is
  on the current page
- **hover hints** (one short sentence) on buttons and fields
- **element chips** and a **walkthrough** that point at real controls on
  the page

Nothing is a generic ChatGPT overlay. Answers are grounded in the
company’s knowledge base. If you never upload docs, chat and hints have
nothing useful to retrieve.

The repo ships a fake host app (**Acme Invoicing**) so you can try the
widget without embedding it in a real product.

---

## The three screens

| Screen | Local URL | Who uses it | What it is |
|---|---|---|---|
| **Admin** | http://localhost:3001 | You (operator) | Sign up or sign in, subscribe (Basic / Pro), companies, upload docs, copy the embed snippet |
| **Demo** | http://localhost:3002 | Stand-in for a customer app | Fake invoicing UI + the Hint widget |
| **API** | http://localhost:8000/docs | Debug | Swagger for login / companies / chat / hints |

If the stack is on a server instead of your laptop, keep the **same
ports** and replace `localhost` with that host (for example
`http://128.140.66.250:3001`).

Chat, hints, and the widget **do not** live in Admin. Admin only
prepares the knowledge base. Play with the widget on **Demo**.

---

## Before you start

Local:

```bash
cp .env.example .env
# set ADMIN_PASSWORD and OPENAI_API_KEY
docker compose up --build
```

You need:

- **`OPENAI_API_KEY`** — otherwise upload / chat / hints return 503
- **`ADMIN_PASSWORD`** — only for the seeded superadmin shortcut below. Email sign-up works without it
- **Polar sandbox** — for the register-and-subscribe path: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCT_ID_BASIC`, `POLAR_PRODUCT_ID_PRO`, and a public webhook URL (README checklist). `POLAR_ENVIRONMENT=sandbox`

Default superadmin email: `admin@hint.local` (or whatever you set as `ADMIN_EMAIL`). Google sign-in also needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

---

## 15-minute playthrough

Do this once in order. After that, skip around the feature list.

### 1. Register and subscribe

Open http://localhost:3001 (or `http://YOUR_IP:3001`).

Click **No account yet? Sign up** (or **Continue with Google**). Create
the account. You land on **Choose your plan**, not the company list.

Click **Subscribe** on Basic or Pro. Polar sandbox opens. Pay with the
test card:

| Field | Value |
|---|---|
| Card | `4242 4242 4242 4242` |
| Expiry | Any future date |
| CVC | Any 3 digits |

Polar sends you back to Admin with `?checkout=success`. Wait on
**Finalizing your subscription…** until the panel appears. The header
shows a plan line such as `basic · trialing`. Trial length is whatever
you set on the Polar product.

**Superadmin shortcut.** Skip signup and checkout: sign in with
`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`. That account has no plan
line, no **Billing** button, and no company or URL cap. Use it when
Polar is not configured.

### 2. Create a company

Name it something obvious, e.g. `Acme Invoicing`.

The UI shows a `cmp_…` id. **Copy that id.** It is unique to this
database (laptop and server do not share companies).

On Basic you can create one company. The sidebar then shows **Plan
limit reached (1 company).** and **Upgrade plan**. Pro allows 10. A
Pro account at 10 sees the same notice without the upgrade button.

### 3. Upload a knowledge base

Upload a `.md` / `.txt` / `.html` / `.pdf` (max 10 MB). Wait until the
row is **ready** (not `uploading` or `failed`).

If you have no product docs, save the sample at the bottom of this file
as `acme-invoicing.md` and upload that. Chat will then match the demo
page.

Scanned/image-only PDFs fail (no OCR in this POC).

### 4. Open Demo with *this* company

```
http://localhost:3002/?company_id=cmp_YOUR_ID
```

Replace `cmp_YOUR_ID` with the id from step 2. Without the query param,
Demo uses whatever company id is hardcoded in `demo/index.html`, which
is often a leftover from another machine and will 404.

You should see **Acme Invoicing** and a Hint **guide bar** (bottom of
the viewport) with chat and a lightbulb.

### 5. Chat

In Admin, under the embed snippet, save 3 starter questions (for
example “How do I create an invoice?”). Reload Demo, open chat — the
empty state shows those chips. Click one: it sends that exact text as
the first user message.

Or type:

> How do I create an invoice?

Tokens should stream in. A finished answer may list **sources** under
the bubble (a filename, or the host and path of a URL you ingested).

### 6. Hover hints

Click the **lightbulb** on the guide bar so hints are on. Hover
**Export report** (or another labeled button) for about half a second.
A short tooltip (≤ 140 characters) should appear.

### 7. Walkthrough (optional)

Ask a how-to that needs several UI steps, e.g.:

> How do I export a report?

If the answer is a numbered list, **Walk me through it** appears under
the message. Start it: the chat closes and the page highlights one
control at a time (Back / Next / Done / Stop, or click the highlighted
control to advance).

---

## Feature list (what to try)

### Admin

| Feature | How to try | What “good” looks like |
|---|---|---|
| Sign up | **No account yet? Sign up**, valid email, password with upper, lower, number, symbol | **Choose your plan** (no companies yet) |
| Google | **Continue with Google** | Same as sign-up or sign-in, depending on whether that account already has a plan. `#error=…` stays on the auth screen |
| Subscribe | **Subscribe** on Basic or Pro, sandbox card `4242 4242 4242 4242` | Polling in the main pane (sidebar stays), then the panel. Sidebar pill like `basic · trialing` |
| Billing again | Sidebar **Billing** | Plan cards in the main pane, sidebar stays. **Back to panel** returns. **Manage subscription** opens the Polar portal in a new tab |
| Superadmin login | Email + password from `.env` | Panel immediately. No pill, no **Billing**, no create/URL gate. Sidebar still shows email and **Sign out** |
| Stay signed in | Refresh the tab | Still signed in (`localStorage` JWT). A user without an active plan sees billing cards beside the sidebar |
| Sign out | Sidebar **Sign out** | Back to the auth screen |
| Create company | Name, 1–100 characters, while under the plan cap | Appears in the sidebar, auto-selected, `cmp_…` id |
| Plan cap | Basic with 1 company, or Pro with 10 | Create form becomes **Plan limit reached**. Basic also shows **Upgrade plan** |
| Upload docs | Drop or browse `.pdf` / `.md` / `.txt` / `.html` | Status `uploading` → `ready` |
| Paste support URLs | Company detail, under the dropzone — one `http`/`https` URL per line (max 20) | On Pro and superadmin: row goes `ready`, or `failed` if the page is empty or JS-rendered. On Basic the form is replaced by **URL ingestion is a Pro feature** and **Upgrade** |
| Failed ingest | Upload a scanned PDF | Status `failed` with a reason; other files in the same batch can still succeed |
| Copy embed snippet | Company detail pane | `<script src="…/loader.js" data-hint-company-id="cmp_…" data-hint-api-url="…">` |
| Starter questions | Company detail, under the snippet — save up to 4 lines | Demo empty chat shows those chips after a **reload** of the host page |
| Delete document | Delete on a ready row | File and its vectors gone; chat no longer cites it |

Admin does **not** include end-user chat. Use Demo for that.

### Widget — guide bar

| Feature | How to try | What “good” looks like |
|---|---|---|
| Embed | Demo loads `loader.js` | Guide bar appears (bottom). Duplicate script on the demo page is intentional — console warns, second tag is ignored |
| First-run callout | Open Demo for a company you have not visited five times | After about 1.5 s a note appears by the bar (“ask me anything about this app”). Click it to open chat; the X hides it for this page load. It stops after 5 page opens for that company (`localStorage`) |
| Open / close chat | Chat icon on the bar | Panel slides open as a dialog titled Hint |
| Hover-hint mode | Lightbulb on the bar | Hover a control ~0.5 s → tooltip |
| Drag the bar | Grip on the bar | Bar moves; it remembers side (left/right) and height for this tab |

### Widget — chat

| Feature | How to try | What “good” looks like |
|---|---|---|
| Streamed answer | Ask a how-to from the uploaded docs | Tokens appear as they generate; not one dump at the end |
| Grounding | Ask something in the doc | Answer matches the KB; **sources** under the bubble (filename, or host + path for a URL) |
| Page awareness | Ask a how-to while on the wrong tab | Answer may start with “go to Invoices / Reports first” instead of inventing a hidden button |
| Follow-up | Ask “and then what?” | Uses conversation history (condenses into a new search query) |
| Markdown | Ask for steps | Numbered/bullet lists and `` `code` `` render as lists/code, not a wall of text |
| Element chips | Answer mentions a control in `"quotes"` or **bold** | Chip in the bubble; click it → host control flashes / is clicked or focused |
| Copy answer | Copy icon on a finished assistant bubble | Copies the raw markdown. On **http://** (no TLS) the clipboard write may fail silently — that is a browser limit, not a broken button |
| Starter chips | Empty chat after Admin saved 3 questions (reload Demo) | Chips under the empty-state sentence; click sends that label. New chat brings them back without another GET. Save `[]` in Admin + reload → chips gone, sentence remains |
| New chat | Header button (page icon) | Thread clears. Disabled while streaming or when the thread is already empty |
| Persistence | Send a message, refresh Demo | Same thread comes back (`sessionStorage`, per company). A walkthrough in progress does **not** survive refresh |

### Widget — hover hints

| Feature | How to try | What “good” looks like |
|---|---|---|
| First hover | Lightbulb on, hover **Export report** | Tooltip within ~0.3–1.5 s |
| Repeat hover | Hover the same control again | Near-instant (in-memory cache on the backend; a backend restart clears it) |
| Length | Read the tooltip | One sentence, ≤ 140 characters |

### Widget — guided walkthrough

| Feature | How to try | What “good” looks like |
|---|---|---|
| Start button | Ask a multi-step how-to | **Walk me through it** under a completed assistant message (needs ≥ 2 numbered steps) |
| Highlight | Start the walkthrough | Overlay on the matching control; card “Step N of M” |
| Next / Back / Stop | Card buttons, or **Escape** to stop | Moves or exits. Last step: Done |
| Click to advance | Click the highlighted control | After a short delay, next step (so menus can open) |
| Missing control | Step names a label not on this page | Card says to do it manually, then press Next — you are not stuck |

If the model does not emit a numbered list, there is no start button.
That is expected, not a crash. Ask again with “give me numbered steps”.

### Demo host (Acme Invoicing)

The page is a busy fake SaaS so hints and chips have real targets. Nothing
is saved to a real backend; actions show up in the **Activity** sidebar
and toasts.

Useful controls to hover or ask about:

- Tabs: **Invoices**, **Customers**, **Reports**, **Settings**
- **Export report**, **Create invoice**, invoice row actions
- Form fields: Customer name, Amount, Due date, …

Full control inventory: [`demo/USER_MANUAL.md`](../demo/USER_MANUAL.md).

---

## Suggested questions (Demo + sample KB)

Use these after the sample markdown below is **ready**:

| Ask | Feature you are testing |
|---|---|
| How do I create an invoice? | Chat + chips / walkthrough |
| How do I export a report? | Chat + hover **Export report** |
| How do I mark an invoice as paid? | Row actions on Invoices |
| What does the workspace Sandbox mean? | Retrieval from the sample doc |
| How do I add a customer? | Customers tab |
| (On Settings) How do I export a report? | Page-aware “you’re on the wrong tab” |

Bad tests (do not treat these as product bugs):

- Asking about Admin (“how do I create a company?”) on Demo — unless you
  uploaded Admin docs, the KB is about invoicing.
- Asking with a `company_id` that was never created **on this** stack —
  404, widget may disable.
- Asking before the doc is `ready` — empty or weak answers.

---

## Sample knowledge base (upload this)

Save as `acme-invoicing.md`, upload in Admin, wait for **ready**.

```markdown
# Acme Invoicing — user guide

Acme Invoicing is a simple billing workspace. The header shows the
current time and the workspace name (for example Sandbox).

## Create an invoice

1. Open the **Invoices** tab.
2. Fill in **Customer name**, **Billing email**, **Amount**, and **Due date**.
3. Optionally set currency, priority, and notes.
4. Click **Create invoice**. The new row appears in the table.

## Export a report

1. Open the **Reports** tab, or stay on **Invoices**.
2. Click **Export report**.
3. Watch **Export progress** until it finishes. A banner confirms the export.

## Mark an invoice sent or paid

On the Invoices table, use **Mark sent** or **Mark paid** on that row.
**Delete** removes the row from this demo session only.

## Customers

Open the **Customers** tab to browse the customer list. Use search to
filter by name.

## Settings

The **Settings** tab holds workspace preferences. It is not where
invoices are created or exported.
```

---

## Embed snippet (real host later)

Admin copies something like:

```html
<script src="http://localhost:1337/embed/v1/loader.js"
        data-hint-company-id="cmp_YOUR_ID"
        data-hint-api-url="http://localhost:8000"
        defer></script>
```

On a deployed server, both URLs must be **that server’s IP or host**,
not `localhost`. `localhost` in a visitor’s browser means *their*
machine. Production images bake those URLs at CI build time — see
[`deployment.md`](deployment.md).

- `data-hint-company-id` — required
- `data-hint-api-url` — required in production; if omitted, the loader
  falls back to `http://localhost:8000`

---

## When something looks broken

| What you see | Likely cause | What to do |
|---|---|---|
| Admin login goes to `localhost:8000` | Admin JS was built with local URLs | Rebuild admin with `VITE_API_URL` / `VITE_WIDGET_CDN_URL` pointing at the public host |
| Widget missing on Demo | `loader.js` still loaded from `localhost:1337` | Point the script `src` at `http://HOST:1337/embed/v1/loader.js` |
| Chat / login 404 `Unknown company_id` | Id from another machine, or never created here | Create a company on **this** Admin; open Demo with `?company_id=cmp_…` |
| Chat / upload 503 | Missing `OPENAI_API_KEY` | Set it in `.env`, restart `backend` |
| Superadmin login always 401 | Empty `ADMIN_PASSWORD` at boot (superadmin never seeded) | Set password, restart `backend`. Sign-up still works |
| **Subscribe** errors, or checkout never unlocks the panel | Polar env empty, or the webhook cannot reach this machine | Set `POLAR_*`, expose the webhook (README). Then refresh Admin |
| Hints empty / wrong | Lightbulb off, or KB not `ready`, or wrong company | Toggle lightbulb; wait for `ready`; check the query param |
| Copy does nothing on http:// | Insecure origin, no clipboard | Expected on plain HTTP; try the text still in the bubble |
| Guide bar never appears | Ad blocker, or `company_id` missing on the script | Check the console; confirm `loader.js` returns 200 |

Health check:

```bash
curl -s http://localhost:8000/health
# {"status":"ok","mongo":"ok","chroma":"ok"}
```

---

## What this POC does not do

Useful so testers do not file these as bugs:

- No “forgot password” or password change in Admin
- The seeded superadmin (`ADMIN_EMAIL`) skips Polar and plan limits.
  A registered Basic or Pro account does not
- No OCR for scanned PDFs
- No server-side chat history (refresh is `sessionStorage` only)
- No analytics, thumbs-up/down, or theming API
- Hover-hint cache dies when the backend process restarts
- Not a generic web assistant — it only knows uploaded docs + the page
  snapshot
- Starter questions are **static per company** (Admin copy). v2
  (generate from the knowledge base + current page headings) is not built

---

## Related docs

| Doc | When you need it |
|---|---|
| [`README.md`](../README.md) | Quick start, env vars |
| [`demo/ADMIN_USER_MANUAL.md`](../demo/ADMIN_USER_MANUAL.md) | Every Admin screen and error |
| [`demo/USER_MANUAL.md`](../demo/USER_MANUAL.md) | Every Demo control |
| [`01-architecture-overview.md`](01-architecture-overview.md) | Services, ports, embed contract |
| [`03-widget.md`](03-widget.md) | Widget architecture, store, chat, hints, walkthroughs |
| [`06-ai-layer.md`](06-ai-layer.md) | Chat / hint pipelines, walkthrough prompt contract |
