# Hint Admin — User Manual

Operator guide for the Hint Admin panel at **https://admin.hint.codebar.cc**.

Use this app to create companies, upload product documentation into each company's
knowledge base, watch ingestion status, delete docs, set starter questions for
the widget empty state, and copy the embed snippet that turns Hint on in a host
page (including the demo at https://demo.hint.codebar.cc).

This is the **operator** UI. End users never see it — they see the Hint widget
on the customer app (or the Acme Invoicing demo). For the demo host itself, see
[`USER_MANUAL.md`](USER_MANUAL.md).

| Service | Production URL |
|---|---|
| Admin | https://admin.hint.codebar.cc |
| Backend | https://api.hint.codebar.cc |
| Widget CDN | https://cdn.hint.codebar.cc |
| Demo | https://demo.hint.codebar.cc |

Local Docker Compose still uses `http://localhost:3001` (admin), `:8000` (API),
`:1337` (CDN), and `:3002` (demo). Everything below is the same; only the host
changes.

---

## 1. What Admin is for

| You do this in Admin | What it enables |
|---|---|
| Sign in, sign up, or continue with Google | Companies and documents are JWT-protected |
| Subscribe to Basic or Pro | A `user` account can create companies only while the plan is `active` or `trialing` |
| Create a company | Gets a `cmp_…` id and its own knowledge-base collection |
| Upload `.pdf` / `.md` / `.txt` / `.html` | Text is extracted, chunked, embedded, stored in Chroma |
| Wait until status is `ready` | Chat and hover hints can answer from that doc |
| Copy the embed snippet | Paste into a host page (or override the demo company) |
| Save starter questions | Empty chat on the host shows those lines as clickable chips |
| Delete a document | Removes the file metadata **and** its vector chunks |

Admin does **not** chat, show hover hints, or edit documents in place. Those
happen on the host page through the widget. Starter questions are **static
copy you type here** — they are not generated from the knowledge base or
the current page.

---

## 2. Before you open Admin

The production stack is already running behind Caddy on the droplet
(`159.89.26.67`). Sign up on the auth screen, or sign in as the seeded
superadmin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` in the server `.env`).

To run the same panel on your laptop instead:

```bash
cp .env.example .env
# Set these in .env:
#   OPENAI_API_KEY   — required for upload / chat / hints (503 without it)
#   ADMIN_PASSWORD   — required for the seeded superadmin; sign-up works without it
#   POLAR_*          — required before Subscribe works (see README)
docker compose up --build
```

| Service | Production | Local |
|---|---|---|
| Admin | https://admin.hint.codebar.cc | http://localhost:3001 |
| Backend | https://api.hint.codebar.cc | http://localhost:8000 |
| Widget CDN | https://cdn.hint.codebar.cc | http://localhost:1337 |
| Demo | https://demo.hint.codebar.cc | http://localhost:3002 |

Two accounts can open the panel:

| Account | How you get it | Billing |
|---|---|---|
| Seeded superadmin | `ADMIN_EMAIL` / `ADMIN_PASSWORD` in the server `.env` (usually `admin@hint.local`) | Skips the billing screen and plan limits |
| Registered user | **Sign up** on the auth screen, or **Continue with Google** | Lands on **Choose your plan**. Company creation stays locked until Polar reports `active` or `trialing` |

There is no “forgot password” in the UI. Google sign-in needs
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Checkout needs
`POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, and the two product ids.
Empty Polar config makes **Subscribe** return 503. Trial length is set on
the Polar product, not in this repo. Local Polar webhooks need a public
URL (see the README checklist).

A `company_id` created on your laptop is **not** on production (and the
other way around). Always open Demo with a `cmp_…` from **this** Admin.

---

## 3. Sign in, sign up, and Google

Open https://admin.hint.codebar.cc. The card is **Hint Admin**. It starts on
**Sign in**. **No account yet? Sign up** switches to registration;
**Already have an account? Sign in** switches back. **Continue with Google**
is on both modes.

### 3.1 Sign in

1. Enter email and password.
2. Click **Sign in**. The button reads **Signing in…** while the request runs.

| Field | Rule | Message |
|---|---|---|
| Email | Trimmed, at least 3 characters | `Email is required` |
| Password | At least 1 character | `Password is required` |

This is not a full email-format check. `Admin@Hint.local ` (mixed case, trailing
space) still works — the backend lowercases and trims.

The password field is cleared after every attempt (success or failure).

| Where you land | Who |
|---|---|
| Two-pane panel | Superadmin, or a user whose plan is `active` or `trialing` |
| **Choose your plan** | A user with no plan, or `canceled` / `revoked` / `past_due` |

On the panel, the sidebar bottom shows your email and **Sign out**. A
non-superadmin account also shows a plan line (`basic · trialing`) and a
**Billing** button there. **Billing** keeps the sidebar and opens the plan
cards in the main pane. The companies list loads above the account block.
The token is stored in the browser (`localStorage`) so a refresh stays
signed in.

### 3.2 Sign up

1. Click **No account yet? Sign up**.
2. Enter email, password, and confirm password.
3. Click **Create account** (label becomes **Creating account…**).

| Field | Rule | Message |
|---|---|---|
| Email | Valid email after trim | `Enter a valid email` |
| Password | 8–200 characters, with a lowercase letter, an uppercase letter, a number, and a symbol | The first failing rule (`Password must be at least 8 characters`, `…lowercase letter`, `…uppercase letter`, `…a number`, `…a symbol`, `…at most 200 characters`) |
| Confirm | Must equal the password | `Passwords do not match` |

A new account has no plan. Success opens **Choose your plan**, not the
company list. Password and confirm are cleared after the attempt.

| Message | Meaning | What to do |
|---|---|---|
| `Email is already registered` | That email already has a password account (HTTP 409) | Switch to **Sign in**, or use Google (Google links an existing email) |

### 3.3 Continue with Google

**Continue with Google** leaves the admin page for
`{API}/api/v1/auth/google/login` (production:
`https://api.hint.codebar.cc/api/v1/auth/google/login`). After Google
accepts the account, the API redirects back to Admin with `#token` and
`#email` in the URL. Admin stores that session, then removes the fragment
so a refresh does not replay it.

A Google account with no plan opens billing, same as email sign-up. An
account that already has `active` or `trialing` opens the panel. If an
older session was in this browser, the fragment session replaces it.

| Fragment | What you see |
|---|---|
| `#error=oauth_state` | `Google sign-in expired — try again` on the auth screen. No session is stored |
| `#error=google_auth_failed` | `Google sign-in failed — try again`. No session is stored |

Empty `GOOGLE_CLIENT_ID` makes the Google start URL return 503.

### Sign-in errors

| Message | Meaning | What to do |
|---|---|---|
| `Invalid email or password` | Wrong creds, a Google-only account (no password), **or** `ADMIN_PASSWORD` was empty when the backend booted (no superadmin seeded) | Check the password, use Google for a Google-only account, or set `ADMIN_PASSWORD` and restart `backend` |
| `API unreachable — is the backend running?` | Backend down, CORS, or the admin image was built with the wrong API URL | Confirm https://api.hint.codebar.cc/health; rebuild admin if `VITE_API_URL` changed |
| Sudden jump back to the auth screen (no error wall) | Token expired, secret rotated, or any authenticated call returned 401 | Sign in again |

Default token lifetime is **12 hours** (`ACCESS_TOKEN_TTL_MINUTES=720`). There
is no refresh token. Sign-out only clears the browser; an already-issued token
stays valid on the server until it expires.

---

## 3a. Billing

A `user` who is not `active` or `trialing` sees this screen instead of the
panel. A subscribed user can also open it from the header **Billing** button.

```
┌──────────────────┬──────────────────────────────────┐
│  hint            │  Billing                         │
│  Companies       │  Choose your plan               │
│                  │  You need an active subscription…│
│                  │                                  │
│                  │  Current plan  basic  [trialing] │
│                  │  ┌ Basic ──┐  ┌ Pro ─────────┐  │
│                  │  │[Subscribe]│  │[Subscribe]   │  │
│                  │  └─────────┘  └──────────────┘  │
│ you@example.com  │  [Back to panel] [Manage sub…]  │
│ basic · trialing │                                  │
│ [Billing]        │                                  │
│ [Sign out]       │                                  │
└──────────────────┴──────────────────────────────────┘
```

| Control | When it shows | What it does |
|---|---|---|
| **Subscribe** on a card | That card is not your current `active` / `trialing` plan | `POST /api/v1/billing/checkout` with `{"plan":"basic"}` or `{"plan":"pro"}`, then the browser goes to the Polar checkout URL |
| **Current plan** | The card matches a plan that is already `active` or `trialing` | Button stays disabled |
| **Current** badge + status pill | You already have a `plan` | Shows `basic` or `pro`, and `trialing` / `active` / `canceled` / `revoked` / `past due` |
| **Back to panel** | Status is `active` or `trialing` (you opened billing from the sidebar, or you are still inside the trial) | Returns the main pane to the company view. The sidebar stays. Hidden when the plan does not grant access |
| **Manage subscription** | You already have a `plan` on the account | Opens the Polar customer portal in a new tab (`GET /api/v1/billing/portal`) |
| **Sign out** | Always, in the sidebar account block | Clears the session and returns to the auth screen |

**Subscribe** reads **Redirecting…** while the checkout URL is loading.
Closing the Polar tab without paying leaves you on the plan cards the next
time you open Admin — nothing was stored.

### After you pay

Polar redirects back to Admin with `?checkout=success`. Admin shows
**Finalizing your subscription…** and polls `GET /auth/me` about every 2
seconds (up to about a minute). When the status becomes `active` or
`trialing`, the panel opens and companies load.

If the webhook is slower than that minute, the screen says **Payment
received — your plan is being activated. Refresh in a minute.** A reload
runs `GET /auth/me` again and opens the panel once Polar has written the
plan.

Trial days are whatever you configured on the Polar product. The Admin
pill shows `trialing` for the whole trial; you can create companies during
it. Card entry happens on Polar. In the Polar **sandbox**, the test card
is `4242 4242 4242 4242` (any future expiry, any CVC).

### What each plan unlocks

| | Basic | Pro | Superadmin |
|---|---|---|---|
| How you get it | Subscribe | Subscribe, or upgrade from Basic | `ADMIN_EMAIL` seed. No Polar checkout |
| Companies you can create | 1 | 10 | Effectively unlimited (limit 10000) |
| File upload (`.pdf` `.md` `.txt` `.html`) | Yes | Yes | Yes |
| Paste support-page URLs | No — company detail shows **URL ingestion is a Pro feature** and **Upgrade** | Yes | Yes |
| Sidebar plan line and **Billing** | Yes (`basic · trialing`) | Yes | Hidden. Email and **Sign out** stay |
| Sees other people's companies | No — list is only yours | No | Yes — every company |

Downgrading (Pro → Basic, or cancel) keeps companies you already created.
You can still open them, upload files, and edit starter questions. You
cannot create another company past the new cap. A canceled, revoked, or
past-due account goes back to **Choose your plan** on the next visit;
existing companies stay on the account for when the plan is active again.

The UI hides the create form and the URL form when the plan does not allow
them. The API still answers **402** / **403** if something calls it directly.

---

## 4. Screen layout

```
┌────────────────────┬─────────────────────────────────────────┤
│  [Company name   ] │  Company name                           │
│  [Create company ] │  cmp_1a2b3c4d                           │
│                    │                                         │
│  Acme Corp         │  Embed snippet                          │
│  cmp_1a2b3c4d      │  <script …>                    [Copy]   │
│                    │                                         │
│                    │  Starter questions                      │
│  you@example.com ☽ │  [How do I …                    ] × 4   │
│  basic · trialing  │                    [Save questions]     │
│  [Billing]         │                                         │
│  [Sign out]        │  Documents                              │
│                    │  [ drop / browse files ]                │
│                    │  user-manual.md  12 KB · 8 chunks  ready│
│                    │                                 [Delete]│
└────────────────────┴─────────────────────────────────────────┘
```

| Region | What it shows |
|---|---|
| Left sidebar | Create-company form, or a plan-limit notice, plus the company list. The bottom account block shows email, an icon theme button, plan line + **Billing** (hidden for superadmin), and **Sign out** |
| Right pane | Plan cards while billing is open; otherwise the product overview until you select or create a company, then name, id, snippet, starter questions, dropzone, document list |

After a **page reload**, companies come back but **nothing is selected**. Click
the company again. That is expected — selection is not saved.

---

## 5. Theme

The sidebar account block has an icon button beside the email. In light mode
it is a moon (**Switch to dark theme**). In dark mode it is a sun (**Switch
to light theme**). The sign-in screen uses the same icon in the top-right
corner. The choice is stored in the browser (`hint.admin.theme`).

---

## 6. Create a company (full first setup)

Creating the company is only the first click. A new company starts with **no**
starter questions and **no** knowledge base — chat and hover hints have nothing
to quote, and the widget empty state is just “Ask anything about this app…”.
Do all three steps before you copy the snippet or open Demo.

### 6.1 Name the company

1. In the sidebar, type a name in **Company name** (e.g. `Acme Invoicing`).
2. Click **Create company** (label becomes **Creating…**).
3. The new company is added at the **top** of the list and **auto-selected**.
4. The right pane opens with name, `cmp_…` id, embed snippet, empty starter
   questions, and an empty Documents list.

| Rule | Message |
|---|---|
| Name empty after trim | `Company name is required` |
| Name longer than 100 characters | `Company name must be at most 100 characters` |

The backend assigns a `company_id` like `cmp_1a2b3c4d`. You cannot rename or
delete a company in this POC — only manage its documents and questions.

Empty list copy: **No companies yet — create the first one above.**

### When the plan is full

The create form is replaced when you already have as many companies as
`limits.max_companies`:

| Account | What the sidebar shows |
|---|---|
| Basic, 1 company | **Plan limit reached (1 company).** plus **Upgrade plan** (opens billing) |
| Pro, 10 companies | **Plan limit reached (10 companies).** No upgrade button — Pro is the top plan |
| Superadmin | The create form stays |

Companies you already have stay in the list and stay usable. **Upgrade plan**
opens the same billing screen as the header button.

Copy that `cmp_…` now. Demo and the embed snippet must use **this** id (a leftover
id from another machine 404s and disables the widget).

### 6.2 Save starter questions (empty-state chips)

New companies ship `suggested_questions: []`. Until you save some, the host
chat has no chips.

1. Stay on the company you just created (it is already selected).
2. Under **Starter questions**, fill 1–4 fields (placeholder `How do I …`).
   Blank slots are fine — only non-empty trimmed lines are stored.
3. Click **Save questions** (label becomes **Saving…**).

Suggested defaults for the Acme Invoicing demo (each line ≤ 120 characters):

| # | Question |
|---|---|
| 1 | How do I create an invoice? |
| 2 | How do I export a report? |
| 3 | How do I add a customer? |
| 4 | How do I mark an invoice as paid? |

| Rule | What happens |
|---|---|
| 0–4 questions | Four fields; blanks are dropped on save |
| Each line 1–120 characters after trim | Longer text: `Each question must be at most 120 characters` |
| Save with every field empty | Valid — clears chips after the next host reload |

The widget caches chips **in memory for that tab**. After you save, reload the
**host** page (Demo). New chat in the same tab is not enough. Full field and
error detail: [§12](#12-starter-questions).

### 6.3 Ingest knowledge-base data

Until at least one document is `ready`, chat and hover hints have almost
nothing useful. You can mix files and support-page URLs on the same company.

**Files** — drop or browse under **Documents**:

- Allowed: `.pdf`, `.md`, `.txt`, `.html`, `.htm`, each ≤ 10 MB.
- For the demo, upload [`USER_MANUAL.md`](USER_MANUAL.md) from this `demo/`
  folder (it names every control on the Acme page).
- Valid files upload immediately. A mixed drop is fine: good files go,
  rejected ones stay under the dropzone (`Unsupported file type` / `File
  exceeds 10 MB`).

**URLs** — Pro and the superadmin only. On Basic, the form is replaced by
**URL ingestion is a Pro feature** and an **Upgrade** button (opens billing).
The server returns 403 if a Basic token calls the URL endpoint anyway.

When the form is visible, under the dropzone: **Paste support page URLs, one per line
(http/https, max 20)**:

1. Paste public `http`/`https` pages (one per line). No crawl — each line is
   a single page.
2. Click **Add URLs** (label becomes **Ingesting…**).
3. Invalid / non-http / overflow lines stay as alerts; valid lines POST.
4. The form clears after a successful submit. A fetch/extract failure still
   creates a row with status `failed` (other URLs in the batch are unchanged).
5. URL rows use the page title as the filename and show `source_url` as a
   new-tab link.

Ingestion is **synchronous** (the request waits). Each source becomes a
Documents row: `uploading` / `processing` → `ready` (chunk count > 0) or
`failed` (reason under the name). One failed item does **not** roll back the
rest. There is no OCR — scanned/image-only PDFs fail.

`OPENAI_API_KEY` must be set on the backend or upload/URL ingest returns 503.
Full file rules, statuses, and delete: [§8](#8-upload-documents-knowledge-base)–[§10](#10-delete-a-document).

### 6.4 Done — try it on Demo

You are finished when:

- the company exists and is selected
- **Save questions** succeeded (chips you want are stored)
- at least one Documents row is `ready`

Then either copy the embed snippet, or open:

```
https://demo.hint.codebar.cc/?company_id=cmp_YOUR_ID
```

Hard-refresh. Empty chat should show your chips; asking one of them (or
hovering a labeled control with the lightbulb on) should answer from the
docs you just ingested. If the guide bar greys out, the `company_id` on the
page is not this one.

---

## 7. Select a company

Click a company in the sidebar. The selected row is highlighted. The right pane
shows:

- Company **name**
- `company_id` in a `<code>` block (this is what the widget uses)
- Embed snippet
- Starter questions (four optional fields)
- Documents dropzone and list

There is no search or sort. Newest created company is first.

---

## 8. Upload documents (knowledge base)

This is the step that makes chat and hover hints useful. Until at least one
document is `ready`, the widget has almost nothing to quote.

### How to upload

1. Select a company.
2. Drop files on **Drop files here or click to browse (pdf, md, txt, html · max 10 MB)**,
   or click / press Enter or Space to open the file picker.
3. You can select **multiple** files in one go.
4. Valid files start uploading immediately. Rejected files stay local and show
   a reason under the dropzone — they are not sent.

### Accepted files

| Allowed | Not allowed |
|---|---|
| `.pdf`, `.md`, `.txt`, `.html`, `.htm` | Images, Office docs, `.png`, `.docx`, … |
| Each file ≤ 10 MB | Anything over 10 MB |

Client-side rejection messages:

- `{filename}: Unsupported file type: .png`
- `{filename}: File exceeds 10 MB`

A mixed drop is fine: good files upload, bad ones are listed underneath.

### What happens on the server

Ingestion is **synchronous** (the request waits). For each file:

1. A row is created with status `processing`.
2. Text is extracted (no OCR — scanned/image-only PDFs fail).
3. Text is split into overlapping chunks.
4. Chunks are embedded (`OPENAI_API_KEY`) and written to that company's
   Chroma collection (`kb_{company_id}`).
5. Status becomes `ready` (with a chunk count) or `failed` (with a reason).

One failed file does **not** roll back the rest of the batch.

### Upload errors (under the dropzone)

| Message | Cause | Fix |
|---|---|---|
| `OPENAI_API_KEY is not configured; set it in .env and restart` | 503 — no key | Set the key, restart backend, upload again |
| Network / unreachable | Backend down | Check https://api.hint.codebar.cc/health, then retry |
| Whole request rejected (413) | A file over 10 MB slipped past the client | Remove it and retry |

---

## 9. Document list and statuses

Each row shows:

- Filename
- Size (e.g. `12 KB`)
- Chunk count (`8 chunks`)
- A status pill
- **Delete**

Placeholder rows appear **during** the upload request with an `uploading` pill.

| Pill | Meaning | Can Hint use it? |
|---|---|---|
| `uploading` | Browser is still sending the batch | No |
| `processing` | Server accepted the file and is ingesting | Not yet |
| `ready` | Chunks are in the vector store | **Yes** |
| `failed` | Extraction/embed failed; reason shown under the name | No — delete and fix the file |

Typical `failed` reasons:

- `No extractable text (scanned PDF or empty file)` — no OCR in this POC
- `Unsupported file type: .png` — if something bypassed the client check

Empty list copy: **No documents yet — drop the product docs above.**

There is no “reprocess” button. Delete the failed row and upload a better file
(text PDF, markdown, etc.).

---

## 10. Delete a document

1. Click **Delete** on the row.
2. Confirm: `Delete "{filename}" and its knowledge-base chunks?`
3. Cancel leaves the document. Confirm removes the Mongo row **and** the
   Chroma chunks.

Chat/hints stop using that file after delete. Other documents on the same
company are unchanged.

If delete fails (e.g. already gone), an error appears above the list. Click
the company again to refresh.

---

## 11. Embed snippet

When a company is selected, **Embed snippet** shows a ready-to-paste tag
(URLs come from the admin image build):

```html
<script src="https://cdn.hint.codebar.cc/embed/v1/loader.js"
        data-hint-company-id="cmp_1a2b3c4d"
        data-hint-api-url="https://api.hint.codebar.cc" defer></script>
```

| Attribute | Role |
|---|---|
| `src` | Loads the widget from the CDN |
| `data-hint-company-id` | Which knowledge base chat/hints use |
| `data-hint-api-url` | Backend the widget calls |

Click **Copy**. The button reads **Copied** for about two seconds.

If copy is blocked, select the `<pre>` text and copy manually.

### Using the snippet on the demo page

The demo ships a placeholder company id. To point it at the company you just
created, either:

1. Paste the snippet into a host HTML file, **or**
2. Open the demo with a query override (no HTML edit):

   ```
   https://demo.hint.codebar.cc/?company_id=cmp_YOUR_ID
   ```

Then hard-refresh. Chat and hover hints use **that** company's `ready` docs.

A leftover `cmp_…` from another machine (or `cmp_YOUR_ID`) returns 404 and
the widget disables itself. Always use an id created on **this** Admin.

A second `<script>` tag on the same page is a no-op (singleton). The demo
includes a duplicate on purpose.

---

## 12. Starter questions

When a company is selected, **Starter questions** sits under the embed
snippet. These lines become clickable chips in the widget when the chat
thread is empty. Clicking a chip sends that exact text as the first
user message (same path as typing and hitting send).

New companies start with **no** questions. Until you save some, the
widget empty state is only the existing sentence
(“Ask anything about this app…”).

### How to save

1. Select a company.
2. Fill any of the four fields (placeholder `How do I …`). Empty slots
   are fine — only non-empty trimmed lines are saved.
3. Click **Save questions** (label becomes **Saving…**).
4. Reload the **host** page (Demo or the real embed). Open an empty
   chat. The chips should match what you saved.

| Rule | What happens |
|---|---|
| 0–4 questions | Four fields; blank ones are dropped on save |
| Each line 1–120 characters after trim | Longer text: `Each question must be at most 120 characters` |
| Save with every field empty | Valid — clears chips after the next host reload |
| Duplicate lines | Allowed (no uniqueness check) |

The widget caches the list **in memory for that tab**. A “New chat” in
the same tab brings the chips back without another request. An Admin
edit does **not** appear until the host page is reloaded.

### Checking it on Demo

```
https://demo.hint.codebar.cc/?company_id=cmp_YOUR_ID
```

Open Hint chat with an empty thread. You should see up to four chips
under the empty-state sentence. Click one — that question is sent.

### Errors

| Message | Meaning | What to do |
|---|---|---|
| `Each question must be at most 120 characters` | A field is too long (client check) | Shorten it and save again |
| Backend `detail` under the form (422) | More than 4 items, a blank entry, or a line over 120 characters | Fix the fields; the last good save is still stored |
| Network / unreachable | Backend down | Retry Save once the API is back |

---

## 13. Recommended first-time walkthrough

**Registered user**

1. Open https://admin.hint.codebar.cc and click **No account yet? Sign up**
   (or **Continue with Google**).
2. On **Choose your plan**, subscribe to Basic or Pro and finish Polar
   checkout. Wait until the panel appears (see [§3a](#3a-billing)).
3. Confirm the sidebar plan line shows your plan.

**Superadmin shortcut** — sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
and skip step 2. There is no plan line.

4. Create a company, e.g. `Acme Invoicing`.
5. Upload [`USER_MANUAL.md`](USER_MANUAL.md) from this `demo/` folder (it
   describes every control on the demo page — good Hint training data).
   On Pro or as superadmin you can also paste a public support-page URL.
6. Wait until the row is `ready` and `chunk_count` is greater than 0.
7. Under the snippet, save three starter questions (e.g. “How do I
   create an invoice?”, “How do I export a report?”, “How do I add a
   customer?”).
8. Copy the snippet, or open
   `https://demo.hint.codebar.cc/?company_id=` plus the `cmp_…` id from the header.
9. On the demo: open Hint chat — click a chip, or type “how do I create
   an invoice?”
10. Toggle the lightbulb and hover **Export report** / **Customer name**.

If answers are empty or generic, the doc is not `ready`, the wrong
`company_id` is on the page, or the API key is missing.

---

## 14. Sign out and sessions

| Action | Result |
|---|---|
| **Sign out** (sidebar account block) | Token and email cleared; next visit is the auth screen. Billing flags are cleared too |
| Reload while signed in | Session restored via `GET /auth/me`; companies reload; **selection is lost**. A user without an active plan sees billing again |
| Token expired / `JWT_SECRET` changed | Next API call 401 → login screen |
| Private-mode Safari (or `localStorage` blocked) | Login can work for this tab only; reload returns to login |
| Two tabs | Sign-out in one tab does **not** sign the other out until that tab hits a 401 |

You cannot change the password in the UI. Edit `ADMIN_PASSWORD` in the server
`.env` and restart the backend. Old tokens still work until they expire; the
new password is required on the next login.

---

## 15. What you cannot do in this POC

- Reset or change the password from the UI
- Invite links or extra roles beyond `user` and the seeded superadmin
- Rename or delete a company
- Edit or reprocess a document in place
- Search / filter / paginate companies or documents
- See chat transcripts or hint analytics
- Configure the widget look (colors, position) from Admin
- Auto-generate starter questions from the knowledge base or the
  current page (v2 — not built)

Those are out of scope for the current panel.

---

## 16. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Superadmin login always 401 | `ADMIN_PASSWORD` empty at boot | Set it, restart backend. Email sign-up still works |
| Login 401 after editing `.env` | Backend has not re-seeded | Restart the `backend` container |
| **Subscribe** shows a 503 | Polar token or product ids empty | Set `POLAR_*` in `.env`, restart backend. Sandbox webhooks need a public URL |
| Stuck on **Finalizing your subscription…** then the timeout line | Polar webhook has not updated the user yet | Refresh after a minute. Confirm `POLAR_WEBHOOK_SECRET` matches the endpoint Polar calls |
| Sidebar says plan limit reached | Basic already has 1 company, or Pro has 10 | **Upgrade plan** (Basic), or use a company you already created |
| URL form missing, “Pro feature” | Account is Basic (`url_ingestion` false) | **Upgrade**, or sign in as superadmin |
| Google button ends on an error line | State cookie expired, or client id / redirect URI mismatch | Start **Continue with Google** again. See [`docs/05-auth.md`](../docs/05-auth.md) |
| Bounce to login after rebuild | `JWT_SECRET` changed | Sign in again |
| Badge `API unreachable` | Backend / Caddy not serving https://api.hint.codebar.cc | Check `backend` and Caddy; `curl -s https://api.hint.codebar.cc/health` |
| Badge `degraded` | Mongo or Chroma unhealthy | Check those containers |
| Upload 503 about `OPENAI_API_KEY` | Key missing | Set it, restart backend |
| Every PDF is `failed` | Scanned / image-only PDF | Use a text PDF, `.md`, or `.txt` |
| `ready` but chat knows nothing | Widget still on a leftover / placeholder `cmp_…` | Use `?company_id=` from **this** Admin, or paste the new snippet |
| Guide bar greyed out (“Hint is not configured”) | Chat/hint returned 404 `Unknown company_id` | Create a company here, then open Demo with that id |
| Empty chat has no chips | Never saved, saved empty, or host not reloaded | Save 1–4 lines, then **reload Demo** with the same `?company_id=` |
| Chips still show the old copy after Save | Widget caches the list for the tab | Reload the host page (New chat is not enough) |
| Reload “lost” the company | Selection is in-memory | Click the company in the sidebar |
| Copy does nothing | Clipboard API blocked | Select the snippet text and copy |
| Admin UI looks old after a code change | Admin image is built in CI | Push to `main` (or rebuild locally) — a container restart alone is not enough |

---

## 17. Environment that affects Admin

Admin itself only bakes two URLs at **image build** time (GitHub Actions
secrets on production):

| Variable | Production | Local default | Used for |
|---|---|---|---|
| `VITE_API_URL` | `https://api.hint.codebar.cc` | `http://localhost:8000` | All Admin API calls + snippet `data-hint-api-url` |
| `VITE_WIDGET_CDN_URL` | `https://cdn.hint.codebar.cc` | `http://localhost:1337` | Snippet `src` |

Changing those requires rebuilding the **admin** image.

These backend variables control whether you can sign in and upload:

| Variable | Default | Effect |
|---|---|---|
| `ADMIN_EMAIL` | `admin@hint.local` | Superadmin login email |
| `ADMIN_PASSWORD` | *(empty)* | Must be set or **superadmin** login is disabled. Sign-up still works |
| `JWT_SECRET` | `dev-insecure-secret-change-me` | Change before any shared stack |
| `ACCESS_TOKEN_TTL_MINUTES` | `720` | How long a sign-in lasts |
| `OPENAI_API_KEY` | *(empty)* | Required to ingest docs |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | *(empty)* | Empty disables **Continue with Google** (503) |
| `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCT_ID_BASIC`, `POLAR_PRODUCT_ID_PRO` | *(empty)* | Empty makes checkout and the portal 503 |
| `POLAR_ENVIRONMENT` | `sandbox` | `sandbox` or `production` |
| `ADMIN_UI_URL` | `http://localhost:3001` | Where Google and Polar send the browser back |

---

## 18. Related files

| Path | Role |
|---|---|
| https://admin.hint.codebar.cc | Admin app |
| https://demo.hint.codebar.cc | Demo host (needs `?company_id=cmp_…`) |
| https://api.hint.codebar.cc/health | Backend health |
| https://cdn.hint.codebar.cc/embed/v1/loader.js | Widget loader |
| `demo/ADMIN_USER_MANUAL.md` | This manual |
| `demo/USER_MANUAL.md` | Demo host (Acme Invoicing) manual — good upload fodder |
| `docs/HOW_TO_PLAY.md` | Tester playthrough (save questions → Demo chips) |
| `docs/04-admin.md` | Admin architecture (FSD, store, APIs) |
| `docs/05-auth.md` | JWT, seeding, rotation |
| `docs/02-backend.md` | Upload / retrieve contracts |
| `docs/deployment.md` | Compose-on-VPS deploy |

---

*Last updated for sign-up, Google, Polar billing (Basic / Pro), and plan gates in the panel.*
