# Hint Admin — User Manual

Operator guide for the Hint Admin panel at **http://localhost:3001**.

Use this app to create companies, upload product documentation into each company's
knowledge base, watch ingestion status, delete docs, set starter questions for
the widget empty state, and copy the embed snippet that turns Hint on in a host
page (including the demo at http://localhost:3002).

This is the **operator** UI. End users never see it — they see the Hint widget
on the customer app (or the Acme Invoicing demo). For the demo host itself, see
[`USER_MANUAL.md`](USER_MANUAL.md).

---

## 1. What Admin is for

| You do this in Admin | What it enables |
|---|---|
| Sign in as the preset admin | Companies and documents are JWT-protected |
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

From the Hint repo root:

```bash
cp .env.example .env
# Set both of these in .env:
#   ADMIN_PASSWORD   — required; empty means every login is 401
#   OPENAI_API_KEY   — required for upload / chat / hints (503 without it)
docker compose up --build
```

| Service | URL | Needed for Admin? |
|---|---|---|
| Admin | http://localhost:3001 | This app |
| Backend | http://localhost:8000 | Yes — login, companies, upload |
| Widget CDN | http://localhost:1337 | Only for the copied snippet to work |
| Demo | http://localhost:3002 | Optional — to try the snippet |

Default login email is `ADMIN_EMAIL` (usually `admin@hint.local`). The password
is whatever you put in `ADMIN_PASSWORD`. There is no “forgot password” and no
self-registration — one preset operator, seeded when the backend starts.

---

## 3. Sign in

1. Open http://localhost:3001.
2. You should see **Hint Admin** with Email and Password fields.
3. Enter the admin email and password from `.env`.
4. Click **Sign in**. The button reads **Signing in…** while the request runs.

### Validation (before the request)

| Field | Rule | Message |
|---|---|---|
| Email | Trimmed, at least 3 characters | `Email is required` |
| Password | At least 1 character | `Password is required` |

This is not a full email-format check. `Admin@Hint.local ` (mixed case, trailing
space) still works — the backend lowercases and trims.

### After a successful sign-in

- The two-pane panel appears.
- The header shows your email and a **Sign out** button.
- The companies list loads on the left.
- The token is stored in the browser (`localStorage`) so a refresh stays signed in.

The password field is cleared after every attempt (success or failure).

### Sign-in errors

| Message | Meaning | What to do |
|---|---|---|
| `Invalid email or password` | Wrong creds, **or** `ADMIN_PASSWORD` was empty when the backend booted (no admin user seeded) | Check `.env`, then `docker compose up -d backend` and try again |
| `API unreachable — is the backend running?` | Backend down, CORS, or the admin image was built with the wrong API URL | Start backend on :8000; rebuild admin if `VITE_API_URL` changed |
| Sudden jump back to the login screen (no error wall) | Token expired, secret rotated, or any authenticated call returned 401 | Sign in again |

Default token lifetime is **12 hours** (`ACCESS_TOKEN_TTL_MINUTES=720`). There
is no refresh token. Sign-out only clears the browser; an already-issued token
stays valid on the server until it expires.

---

## 4. Screen layout

```
┌──────────────────────────────────────────────────────────────┐
│  Hint Admin     [API badge]   admin@hint.local   [Sign out]  │
├────────────────────┬─────────────────────────────────────────┤
│  [Company name   ] │  Company name                           │
│  [Create company ] │  cmp_1a2b3c4d                           │
│                    │                                         │
│  Acme Corp         │  Embed snippet                          │
│  cmp_1a2b3c4d      │  <script …>                    [Copy]   │
│                    │                                         │
│                    │  Starter questions                      │
│                    │  [How do I …                    ] × 4   │
│                    │                    [Save questions]     │
│                    │                                         │
│  Contoso           │  Documents                              │
│  cmp_9f8e7d6c      │  [ drop / browse files ]                │
│                    │  user-manual.md  12 KB · 8 chunks  ready│
│                    │                                 [Delete]│
└────────────────────┴─────────────────────────────────────────┘
```

| Region | What it shows |
|---|---|
| Header | Title, API health badge, signed-in email, **Sign out** |
| Left sidebar | Create-company form + company list |
| Right pane | Empty placeholder until you select or create a company; then name, id, snippet, starter questions, dropzone, document list |

After a **page reload**, companies come back but **nothing is selected**. Click
the company again. That is expected — selection is not saved.

---

## 5. API status badge (header)

The badge calls `GET /health` once when the panel loads (no login token).

| Badge text | Meaning |
|---|---|
| `checking…` | Request in flight |
| `API ok · mongo=ok · chroma=ok` | Backend + Mongo + Chroma healthy |
| `API degraded · mongo=… · chroma=…` | Backend answered but a store ping failed |
| `API unreachable` | Could not reach http://localhost:8000 |

A red / unreachable badge usually means the backend container is down. Login
and uploads will fail until it is back.

The badge does **not** auto-refresh. Reload the admin page to check again.

---

## 6. Create a company

1. In the sidebar, type a name in **Company name**.
2. Click **Create company** (label becomes **Creating…**).
3. The new company is added at the **top** of the list and **auto-selected**.
4. The right pane opens with that company's id and embed snippet.

| Rule | Message |
|---|---|
| Name empty after trim | `Company name is required` |
| Name longer than 100 characters | `Company name must be at most 100 characters` |

The backend assigns a `company_id` like `cmp_1a2b3c4d`. You cannot rename or
delete a company in this POC — only manage its documents.

Empty list copy: **No companies yet — create the first one above.**

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
| Network / unreachable | Backend down | Check the health badge and `:8000` |
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

When a company is selected, **Embed snippet** shows a ready-to-paste tag:

```html
<script src="http://localhost:1337/embed/v1/loader.js"
        data-hint-company-id="cmp_1a2b3c4d"
        data-hint-api-url="http://localhost:8000" defer></script>
```

| Attribute | Role |
|---|---|
| `src` | Loads the widget from the CDN (`:1337`) |
| `data-hint-company-id` | Which knowledge base chat/hints use |
| `data-hint-api-url` | Backend the widget calls (`:8000`) |

Click **Copy**. The button reads **Copied** for about two seconds.

If copy is blocked (some non-HTTPS contexts), select the `<pre>` text and copy
manually.

### Using the snippet on the demo page

The demo already embeds a default company (`cmp_demo0001`). To point it at the
company you just created, either:

1. Paste the snippet into a host HTML file, **or**
2. Open the demo with a query override (no HTML edit):

   ```
   http://localhost:3002/?company_id=cmp_YOUR_ID
   ```

Then hard-refresh. Chat and hover hints use **that** company's `ready` docs.

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
http://localhost:3002/?company_id=cmp_YOUR_ID
```

Open Hint chat with an empty thread. You should see up to four chips
under the empty-state sentence. Click one — that question is sent.

### Errors

| Message | Meaning | What to do |
|---|---|---|
| `Each question must be at most 120 characters` | A field is too long (client check) | Shorten it and save again |
| Backend `detail` under the form (422) | More than 4 items, a blank entry, or a line over 120 characters | Fix the fields; the last good save is still stored |
| Network / unreachable | Backend down | Check the health badge; retry Save |

---

## 13. Recommended first-time walkthrough

1. Set `ADMIN_PASSWORD` and `OPENAI_API_KEY` in `.env`. Start the stack.
2. Open http://localhost:3001 and sign in.
3. Confirm the header badge is `API ok`.
4. Create a company, e.g. `Acme Invoicing`.
5. Upload [`USER_MANUAL.md`](USER_MANUAL.md) from this `demo/` folder (it
   describes every control on the demo page — good Hint training data).
6. Wait until the row is `ready` and `chunk_count` is greater than 0.
7. Under the snippet, save three starter questions (e.g. “How do I
   create an invoice?”, “How do I export a report?”, “How do I add a
   customer?”).
8. Copy the snippet, or open
   `http://localhost:3002/?company_id=` plus the `cmp_…` id from the header.
9. On the demo: open Hint chat — click a chip, or type “how do I create
   an invoice?”
10. Toggle the lightbulb and hover **Export report** / **Customer name**.

If answers are empty or generic, the doc is not `ready`, the wrong
`company_id` is on the page, or the API key is missing.

---

## 14. Sign out and sessions

| Action | Result |
|---|---|
| **Sign out** | Token and email cleared; next visit is the login screen |
| Reload while signed in | Session restored via `GET /auth/me`; companies reload; **selection is lost** |
| Token expired / `JWT_SECRET` changed | Next API call 401 → login screen |
| Private-mode Safari (or `localStorage` blocked) | Login can work for this tab only; reload returns to login |
| Two tabs | Sign-out in one tab does **not** sign the other out until that tab hits a 401 |

You cannot change the password in the UI. Edit `ADMIN_PASSWORD` in `.env` and
restart the backend. Old tokens still work until they expire; the new password
is required on the next login.

---

## 15. What you cannot do in this POC

- Create extra admin users, roles, or invite links
- Reset or change the password from the UI
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
| Login always 401 | `ADMIN_PASSWORD` empty at boot | Set it, restart backend |
| Login 401 after editing `.env` | Backend has not re-seeded | `docker compose up -d backend` |
| Bounce to login after rebuild | `JWT_SECRET` changed | Sign in again |
| Badge `API unreachable` | Backend not on :8000 | `docker compose up -d backend` |
| Badge `degraded` | Mongo or Chroma unhealthy | Check those containers |
| Upload 503 about `OPENAI_API_KEY` | Key missing | Set it, restart backend |
| Every PDF is `failed` | Scanned / image-only PDF | Use a text PDF, `.md`, or `.txt` |
| `ready` but chat knows nothing | Widget still on `cmp_demo0001` | Use `?company_id=` or paste the new snippet |
| Empty chat has no chips | Never saved, saved empty, or host not reloaded | Save 1–4 lines, then **reload Demo** with the same `?company_id=` |
| Chips still show the old copy after Save | Widget caches the list for the tab | Reload the host page (New chat is not enough) |
| Reload “lost” the company | Selection is in-memory | Click the company in the sidebar |
| Copy does nothing | Clipboard API blocked | Select the snippet text and copy |
| Admin UI looks old after a code change | Admin image is built at Docker build time | `docker compose up -d --build admin` (restart alone is not enough) |

---

## 17. Environment that affects Admin

Admin itself only bakes two URLs at **image build** time:

| Variable | Default | Used for |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | All Admin API calls + snippet `data-hint-api-url` |
| `VITE_WIDGET_CDN_URL` | `http://localhost:1337` | Snippet `src` |

Changing those requires rebuilding the **admin** image.

These backend variables control whether you can sign in and upload:

| Variable | Default | Effect |
|---|---|---|
| `ADMIN_EMAIL` | `admin@hint.local` | Login email |
| `ADMIN_PASSWORD` | *(empty)* | Must be set or login is disabled |
| `JWT_SECRET` | `dev-insecure-secret-change-me` | Change before any shared stack |
| `ACCESS_TOKEN_TTL_MINUTES` | `720` | How long a sign-in lasts |
| `OPENAI_API_KEY` | *(empty)* | Required to ingest docs |

---

## 18. Related files

| Path | Role |
|---|---|
| http://localhost:3001 | Admin app |
| `demo/ADMIN_USER_MANUAL.md` | This manual |
| `demo/USER_MANUAL.md` | Demo host (Acme Invoicing) manual — good upload fodder |
| `docs/HOW_TO_PLAY.md` | Tester playthrough (save questions → Demo chips) |
| `docs/04-admin.md` | Admin architecture (FSD, store, APIs) |
| `docs/05-auth.md` | JWT, seeding, rotation |
| `docs/02-backend.md` | Upload / retrieve contracts |

---

*Last updated for starter questions (empty-state chips configured per company).*
