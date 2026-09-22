# Hint — Admin Panel

> **Status: operator SPA shipped.** React 18 + Vite + TypeScript, strict
> Feature-Sliced Design (`app → widgets → features → entities → shared`),
> Zustand, Zod. Email sign-in and sign-up, Google, Polar billing (Basic / Pro),
> companies, file and URL ingest, starter questions, embed snippet.
> Auth contract: [`05-auth.md`](05-auth.md). Billing contract:
> [`02-backend.md`](02-backend.md#billing).

The admin SPA (`admin/`, host port **3001**) is the operator UI for the knowledge
base. A visitor signs in, signs up, or continues with Google. A `user` without
an `active` or `trialing` plan sees the billing screen before the panel. The
seeded superadmin skips billing and plan limits. From the panel they create
companies, upload product docs or (on Pro) paste support-page URLs, watch
per-document ingestion status, delete documents, and copy the embed snippet.

## FSD layout

Upper layers import only from layers below. Features never import other features
or widgets — all cross-feature state goes through `shared/store/admin-store.ts`.
Each slice exposes a public `index.ts`; consumers import `@/features/login`, never
`@/features/login/ui/login-form`.

```
admin/src/
├── app/
│   ├── app.tsx + app.module.css     # boot + auth / billing / panel branch
│   └── styles/global.css            # reset; imports shared tokens
├── widgets/
│   ├── auth-screen/                 # login ⇄ signup + Continue with Google
│   ├── billing/                     # plan cards, portal, checkout polling
│   ├── companies-sidebar/           # list + create form, or plan-limit notice
│   ├── company-detail/              # snippet + questions + upload + URL or Pro hint
│   ├── product-overview/            # unselected-company product + feature cards
│   └── api-status/                  # GET /health badge (public, no token)
├── features/
│   ├── login/                       # Zod schema + login form
│   ├── register/                    # Zod schema + signup form
│   ├── create-company/              # Zod schema + name form
│   ├── upload-documents/            # client pre-validation + dropzone
│   ├── add-url-source/              # paste URLs (one per line) → ingestUrls
│   ├── delete-document/             # confirm + store action
│   ├── copy-embed-snippet/          # buildEmbedSnippet + CopyBlock
│   └── edit-suggested-questions/    # 0–4 starter chips for the widget empty state
├── entities/
│   ├── company/                     # CompanyListItem
│   └── document/                    # DocumentRow (status pill + URL link + error)
├── shared/
│   ├── api/                         # http.ts, types, auth, billing, companies, documents
│   ├── config/                      # API_URL, WIDGET_CDN_URL (Vite env)
│   ├── store/admin-store.ts         # single Zustand store + plan selectors
│   ├── ui/                          # button, text-input, status-pill, wordmark,
│   │                                # google icon, copy-block, spinner + variables.css
│   └── lib/                         # auth-storage, auth-callback, error-message, format-bytes
└── main.tsx
```

Path alias: `@/*` → `src/*` (`admin/tsconfig.json` + `admin/vite.config.ts`).

## State (`shared/store/admin-store.ts`)

One global store (the admin page is a singleton SPA, not an embeddable runtime).

| Field | Type | Notes |
|---|---|---|
| `me` | `Me \| null` | `GET /auth/me`: `email`, `role`, `plan`, `subscription_status`, `limits` |
| `adminEmail` | `string \| null` | Header label. Always `me.email` while a session is loaded |
| `isAuthenticated` | `boolean` | Auth gate in `app.tsx` |
| `isAuthenticating` | `boolean` | Login / signup button pending label |
| `authError` | `string \| null` | Backend `detail`, network message, or Google fragment error |
| `checkoutPending` | `boolean` | Set when the URL is `?checkout=success`. Cleared when polling sees `active` / `trialing`, and on `logout` |
| `showBilling` | `boolean` | Header **Billing**, sidebar **Upgrade plan**, and the URL **Upgrade** button set this `true`. **Back to panel** sets it `false`. Default `false`; cleared on `logout` |
| `companies` | `Company[]` | Newest-first after create (prepend) |
| `isLoadingCompanies` | `boolean` | Sidebar spinner |
| `companiesError` | `string \| null` | List/load failures |
| `selectedCompanyId` | `string \| null` | **In-memory only** — not persisted |
| `documents` | `DocumentMeta[]` | For the selected company |
| `isLoadingDocuments` | `boolean` | Detail spinner |
| `documentsError` | `string \| null` | List/delete failures |
| `uploadingFiles` | `{ name, sizeBytes }[]` | Placeholder rows during the request |
| `uploadError` | `string \| null` | 503 / 413 / network under the dropzone |
| `isIngestingUrls` | `boolean` | URL form button "Ingesting…" |
| `ingestUrlsError` | `string \| null` | 503 / 422 / network under the URL form |
| `isSavingSuggestedQuestions` | `boolean` | Save button "Saving…" on the starter-questions form |
| `suggestedQuestionsError` | `string \| null` | PATCH `detail` or network under the form |

### Actions

| Action | What it does |
|---|---|
| `login(email, password)` | `POST /auth/login` → `writeSession` → `GET /auth/me` → `loadCompanies` |
| `register(email, password)` | `POST /auth/register` → `writeSession` → `GET /auth/me`. Does not load companies (the new account has no plan yet) |
| `refreshMe()` | `GET /auth/me` and replace `me`. Returns `null` on failure. Checkout polling uses this |
| `logout()` | `clearSession` + wipe `me`, billing flags, companies, documents, selection |
| `restoreSession()` | If `localStorage` has a session, `GET /auth/me` then `loadCompanies`; on failure, `logout()` |

### Selectors

| Selector | True when |
|---|---|
| `selectNeedsBilling` | Authenticated, `role !== 'superadmin'`, and `subscription_status` is not `active` or `trialing` |
| `selectCanCreateCompany` | `me.limits.max_companies > companies.length` |
| `selectCanIngestUrls` | `me.limits.url_ingestion === true` |

Limits the API returns (see [`02-backend.md`](02-backend.md#plan-limits-and-ownership)): Basic 1 company and no URL ingest; Pro 10 companies and URL ingest; superadmin 10000 and URL ingest; no active plan is 0 companies and no URL ingest.
| `loadCompanies()` | `GET /companies` |
| `createCompany(name)` | `POST /companies` → prepend → `selectCompany` |
| `selectCompany(id)` | Reset documents/errors, then `loadDocuments` |
| `loadDocuments()` | `GET /companies/{id}/documents` (no-op if nothing selected) |
| `uploadDocuments(files)` | Show uploading rows → multipart POST → refresh list |
| `ingestUrls(urls)` | `POST …/documents/from-url` → refresh list |
| `deleteDocument(id)` | `DELETE` then drop the row locally |
| `updateSuggestedQuestions(questions)` | `PATCH …/widget-config` → replace that company in `companies` |

All async actions surface `ApiError.detail` via `toErrorMessage`. `createCompany`
lets the form catch the throw (inline error). The others set store error fields.

## API consumption

`shared/api/http.ts` `request<T>()` prefixes `API_URL`, attaches
`Authorization: Bearer <token>` when a session exists, and on **401** clears
storage and calls the handler registered by `app.tsx` (`logout`). Caller headers
win so multipart uploads do **not** set `Content-Type` (the browser keeps the
boundary).

| Feature / widget | Endpoint | Auth |
|---|---|---|
| login | `POST /api/v1/auth/login` | public |
| register | `POST /api/v1/auth/register` | public |
| Continue with Google | full-page `GET /api/v1/auth/google/login` (`googleLoginUrl()`, not `fetch`) | public |
| app (session boot, checkout poll) | `GET /api/v1/auth/me` | bearer |
| billing Subscribe | `POST /api/v1/billing/checkout` body `{"plan":"basic"}` or `{"plan":"pro"}`, then `window.location.assign(checkout_url)` | bearer |
| billing Manage subscription | `GET /api/v1/billing/portal` → `window.open(portal_url)` | bearer |
| companies-sidebar | `GET /api/v1/companies` | bearer |
| create-company | `POST /api/v1/companies` | bearer |
| company-detail | `GET /api/v1/companies/{id}/documents` | bearer |
| edit-suggested-questions | `PATCH /api/v1/companies/{id}/widget-config` | bearer |
| upload-documents | `POST /api/v1/companies/{id}/documents` (multipart `files`) | bearer |
| add-url-source | `POST /api/v1/companies/{id}/documents/from-url` `{urls}` | bearer |
| delete-document | `DELETE /api/v1/companies/{id}/documents/{doc_id}` | bearer |
| api-status | `GET /health` | public (raw `fetch`, no token) |

`GET /api/v1/companies/{id}` exists on the backend but the SPA never calls it —
selection is the in-memory `company_id` from the list.

## View flow

`app.tsx` picks one screen. Later branches are not mounted.

| State | View |
|---|---|
| No session | Auth screen (`data-testid="login-screen"` wrapping `auth-screen`): login ⇄ signup, plus Google |
| Session + `?checkout=success` still pending | `CheckoutPending` (`data-testid="checkout-pending"`) polls `GET /auth/me` |
| Session + no `active` / `trialing` plan, and `role` is `user` | `BillingScreen` (`data-testid="billing-screen"`) |
| Session + header/upgrade set `showBilling` | Same billing screen. **Back to panel** only while status is `active` or `trialing` |
| Session + active plan, or superadmin, and billing is closed | Panel: sidebar + (`CompanyDetail` or `ProductOverview`) |

`checkoutPending` wins over the plan cards whenever it is set, including for a
user who already has access, until polling clears it.

### Boot order

On mount, before `restoreSession`:

1. `consumeAuthCallback()` (`shared/lib/auth-callback.ts`) reads the URL once, then `history.replaceState` to the path when it found a token, an OAuth error, or `?checkout=success`.
2. `#token` and `#email` together → `writeSession`. A fragment session replaces whatever was already in `localStorage`.
3. `#error=oauth_state` → `authError` `Google sign-in expired — try again`. Any other `#error` (including `google_auth_failed`) → `Google sign-in failed — try again`. No session is written for an error-only fragment.
4. `?checkout=success` → `checkoutPending: true`.
5. `restoreSession()` → if a session exists, `GET /auth/me` then `loadCompanies()`.

Google start is a navigation to `{API_URL}/api/v1/auth/google/login`, not an XHR. The API redirects back to `ADMIN_UI_URL` with the fragment.

### Auth screen

1. Open http://localhost:3001. Default mode is login.
2. Login Zod (`loginSchema`): email trimmed, min 3 chars; password min 1. Messages:
   "Email is required" / "Password is required". Not a full RFC email check —
   matches the backend `LoginRequest` (`min_length=3`).
3. Signup Zod (`registerSchema`): `Enter a valid email`; password 8–200 with
   lower, upper, digit, and symbol; confirm must match (`Passwords do not match`).
   Duplicate email surfaces the backend 409 `Email is already registered`.
4. **No account yet? Sign up** / **Already have an account? Sign in** clears `authError`.
5. Login success loads companies. Register success only stores `me`. The view
   branch then shows billing, because a new user has `plan: null`.
6. Failure: same backend string for unknown email and wrong password
   (`Invalid email or password`), including a Google-only account. Password
   fields are cleared after the attempt.
7. Panel success: header shows the email. `selectedCompanyId` starts `null`, so
   the main pane is `ProductOverview` (`data-testid="product-overview"`).
   Non-superadmin header adds `data-testid="plan-pill"` (`basic · trialing`)
   and **Billing**. `StatusPill` is only for document statuses, so the plan
   line is a plain span.

### Billing screen

Plan cards are fixed copy in `billing-screen.tsx`:

| Card | Bullets |
|---|---|
| Basic | 1 company; file ingestion; chat + hover hints widget |
| Pro | Up to 10 companies; everything in Basic; URL ingestion |

**Subscribe** calls `createCheckout(plan)` and assigns `checkout_url`. The
current `active` / `trialing` card is disabled (**Current plan**). **Manage
subscription** calls `getPortalUrl()` and opens `portal_url` in a new tab.
Footer **Sign out** is `logout()`.

`CheckoutPending` polls every 2s, up to 30 attempts. `active` or `trialing`
clears `checkoutPending` and calls `loadCompanies()`. After 30 attempts the
copy is: `Payment received — your plan is being activated. Refresh in a minute.`

### Plan gates in the panel

Server still returns 402 / 403. These branches are UX.

| Selector false | UI |
|---|---|
| `selectCanCreateCompany` | Sidebar replaces `CreateCompanyForm` with `data-testid="company-limit-notice"`: `Plan limit reached (N company/companies).` **Upgrade plan** (`showBilling`) renders when `plan !== 'pro'` |
| `selectCanIngestUrls` | Company detail replaces `UrlSourceForm` with `data-testid="url-pro-hint"` and a ghost **Upgrade** button |

A Pro account at 10 companies sees the notice without the upgrade button.
Superadmin limits stay above any realistic company count, and `url_ingestion`
is true, so both forms stay. Downgrade does not remove companies already in
the list; only the create form is replaced.

### Unselected company (product overview)

When `selectedCompanyId` is `null` (fresh login or reload), `app.tsx`
renders `widgets/product-overview` instead of `CompanyDetail`. Copy lives
in `widgets/product-overview/lib/features.ts` — keep it aligned with the
shipped widget/admin UI.

| Card | How it is opened |
|---|---|
| Knowledge base | Company → Documents dropzone. URL form on Pro and superadmin; Basic shows the Pro hint |
| Embed snippet | Company → copy block |
| Starter questions | Company → four fields under the snippet; Save |
| Guide bar | Host page pill; Ctrl/Cmd + / |
| Chat | Sparkle on the guide bar |
| Element chips | Quoted labels in a completed chat answer |
| Hover hints | Lightbulb on the guide bar, then hover a control |
| Guided walkthroughs | **Walk me through it** under a how-to answer |

### Create → upload → snippet

1. Sidebar form: name 1–100 chars after trim (`createCompanySchema`).
2. Create prepends the company and auto-selects it (detail pane + snippet appear).
3. Dropzone accepts `.pdf`, `.md`, `.txt`, `.html`, `.htm`, max 10 MB
   (`validateFiles`). Invalid files stay local (`name: reason`); valid ones POST.
4. **Add URLs** (`features/add-url-source/`) sits under the dropzone. Paste
   http/https support-page URLs, one per line, max 20 (`validateUrls`).
   Invalid / non-http / overflow lines stay as `role="alert"` reasons; valid
   lines `POST …/documents/from-url`. The form clears after a successful
   submit. Fetch/extract failures still return 201 with per-row `failed`
   status — those rows show `document.error`.
5. During a file upload, placeholder rows show a `uploading` pill. The
   response replaces them with `ready` / `failed` (failed rows show
   `document.error`). URL documents use the page title as `filename` and
   render `source_url` as a new-tab link on the row.
6. Copy block holds the documented script tag (see below). Under it, **Starter
   questions** (`features/edit-suggested-questions/`) offers four optional
   fields (max 120 chars each). Save sends the non-empty trimmed lines
   (`PATCH …/widget-config`). An empty save is valid and clears chips on the
   next host **reload** (the widget caches in memory for the tab lifetime).
   Confirm dialog before delete: `Delete "{filename}" and its knowledge-base chunks?`

### Session across reload

- Token + email persist (`hint.admin.token`, `hint.admin.email`).
- `restoreSession` validates with `GET /auth/me` before the panel renders.
- **`selectedCompanyId` is not persisted.** After reload the list is back but
  nothing is selected — the main pane shows `ProductOverview` again. Click
  the company to reload documents. This matches the store contract
  (Steps 3 / 13 / 14), not a product bug.

### Sign out

Header **Sign out**, or the billing footer, → `logout()`. Next reload stays on
the auth screen. `checkoutPending` and `showBilling` are cleared with the session.

## Embed snippet

`buildEmbedSnippet(companyId)` in `features/copy-embed-snippet/lib/build-snippet.ts`:

```html
<script src="{WIDGET_CDN_URL}/embed/v1/loader.js"
        data-hint-company-id="{companyId}"
        data-hint-api-url="{API_URL}" defer></script>
```

Compose bake-in: `WIDGET_CDN_URL=http://localhost:1337`,
`API_URL=http://localhost:8000`. Same contract as
[`01-architecture-overview.md`](01-architecture-overview.md#embed-contract-phase-0).

If `navigator.clipboard` is unavailable (non-secure context), the `<pre>` stays
selectable for a manual copy.

## Build args and local run

Vite env, read in `shared/config/index.ts`, baked at **build** time (not runtime):

| Variable | Default in code | Compose build arg | Used for |
|---|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | `http://localhost:8000` | `request()` base + snippet `data-hint-api-url` |
| `VITE_WIDGET_CDN_URL` | `http://localhost:1337` | `http://localhost:1337` | snippet `src` |

```bash
# Docker (production-shaped nginx on :3001)
docker compose up --build admin

# Local Vite (talks to backend on :8000)
cd admin && pnpm install && pnpm dev
```

Changing `VITE_*` requires a rebuild of the admin image (`docker compose up --build admin`).
`ADMIN_PASSWORD` / `JWT_SECRET` are **backend** env — see [`05-auth.md`](05-auth.md).

## Tests

```bash
cd admin && pnpm test
```

`validateUrls` (valid / invalid / protocol / 20-URL cap), the URL form,
`consumeAuthCallback` (token write, error fragment, `?checkout=success`, URL scrub),
billing screen (subscribe redirect, portal, back to panel), checkout polling
(unlock vs timeout), sidebar limit notice (Basic upgrade vs Pro at the cap),
and the company-detail Pro hint. Backend contracts: [`02-backend.md`](02-backend.md).

## Failure modes

| Symptom | Cause | What the UI does |
|---|---|---|
| Login screen, "API unreachable — is the backend running?" | Backend down / CORS / wrong `VITE_API_URL` | `ApiError(0, …)` on login or any `request()` |
| Health badge "API unreachable" (red) | Same, independently | Badge uses its own `fetch` to `/health` |
| Health "degraded" | Mongo or Chroma ping failed | Badge shows `mongo=` / `chroma=` values |
| `Invalid email or password` | Wrong creds or `ADMIN_PASSWORD` unset (seeding skipped) | Same 401 body; no user enumeration |
| Sudden return to the auth screen, no error wall | 401 on any authenticated call, including from the billing screen | `http.ts` clears session + `logout()` |
| Auth screen `Google sign-in expired — try again` | `#error=oauth_state` | Start **Continue with Google** again |
| Auth screen `Google sign-in failed — try again` | `#error=google_auth_failed` (or any other `#error`) | Check Google client id, secret, and `GOOGLE_REDIRECT_URI` ([`05-auth.md`](05-auth.md)) |
| Billing alert under the cards | Checkout or portal `ApiError.detail` (503 when Polar env is empty) | Set `POLAR_*`, restart backend |
| **Finalizing your subscription…** then the timeout sentence | Webhook slower than ~60s of polling | Refresh; `restoreSession` reads the plan |
| Sidebar limit notice / URL Pro hint | Plan cap or `url_ingestion` false | Upgrade, or use the superadmin account |
| 503 detail under the dropzone | Missing `OPENAI_API_KEY` | Verbatim: `OPENAI_API_KEY is not configured; set it in .env and restart` |
| Red `failed` pill + reason | Scanned PDF, empty file, unsupported type that slipped past the client | Row stays; batch does not roll back |
| `{name}: Unsupported file type: .png` / `File exceeds 10 MB` | Client pre-validation | No network request for those files |
| `{url}: Not a valid URL` / `Only http/https URLs` / `Max 20 URLs per request` | Client `validateUrls` | Invalid lines stay as alerts; valid lines still POST |
| 503 / network under the URL form | Missing key or backend down | `ingestUrlsError` under the form; dropzone `uploadError` is separate |
| Red `failed` pill on a URL row | Fetch timeout/4xx, unsupported content type, empty/JS-rendered page | Row stays with `document.error`; other URLs in the batch unaffected |
| Empty sidebar "No companies yet" | Fresh DB | Dropzone hidden until a company is selected |
| Empty detail "No documents yet" | Company with `[]` from `GET .../documents` | Dropzone still active |
| Delete 404 in `documentsError` | Already deleted elsewhere | Next `selectCompany` refreshes the list |
| Reload loses the selected company | `selectedCompanyId` is in-memory | Click the company again |
| Private-mode Safari: login works, reload logs out | `localStorage` throws | `auth-storage` swallows; session is memory-only |

## Shared UI

| Primitive | Role |
|---|---|
| `Button` | Submit / Sign out |
| `TextInput` | `type="text"` (default) or `type="password"` |
| `StatusPill` | `processing` \| `ready` \| `failed` \| `uploading` |
| `CopyBlock` | Snippet + copy button |
| `Spinner` | List loading |
| `variables.css` | Colors, spacing, radius — imported from `app/styles/global.css` |

Tokens live in `admin/src/shared/ui/styles/variables.css`. Add new values there
before hardcoding colors in a module.

## Accepted deviations from the original Phase 2 sketch

The parent plan (`plans/hint_poc_implementation.md` Steps 2.1–2.2) sketched a
flat `pages/` + `api/client.ts` SPA with **no auth**. What shipped:

- Strict FSD under `admin/src/{app,widgets,features,entities,shared}`.
- Preset-admin JWT (Steps 11–14 of `plans/phase_2_admin_panel.md`) — auth landed
  in Phase 2, not the Phase 6 hardening pass. Register, Google, and Polar
  checkout are in this SPA (`plans/multi_user_billing_frontend.md`).
- `selectedCompanyId` is not written to `localStorage`.
- Plan changes in another tab are not pushed (no `storage` listener). The
  second tab catches up on the next `refreshMe` or reload.
