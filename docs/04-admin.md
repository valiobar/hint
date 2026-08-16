# Hint — Admin Panel

> **Status: Phase 2 complete.** React 18 + Vite + TypeScript, strict Feature-Sliced
> Design (`app → widgets → features → entities → shared`), Zustand, Zod.
> Auth contract: [`05-auth.md`](05-auth.md). Backend APIs: [`02-backend.md`](02-backend.md).

The admin SPA (`admin/`, host port **3001**) is the operator UI for the knowledge
base: sign in as the preset admin, create companies, upload product docs, watch
per-file ingestion status, delete documents, and copy the embed snippet.

## FSD layout

Upper layers import only from layers below. Features never import other features
or widgets — all cross-feature state goes through `shared/store/admin-store.ts`.
Each slice exposes a public `index.ts`; consumers import `@/features/login`, never
`@/features/login/ui/login-form`.

```
admin/src/
├── app/
│   ├── app.tsx + app.module.css     # auth gate + two-pane layout
│   └── styles/global.css            # reset; imports shared tokens
├── widgets/
│   ├── companies-sidebar/           # list + create-company feature
│   ├── company-detail/              # snippet + starter questions + upload + document list
│   ├── product-overview/            # unselected-company product + feature cards
│   └── api-status/                  # GET /health badge (public, no token)
├── features/
│   ├── login/                       # Zod schema + login form
│   ├── create-company/              # Zod schema + name form
│   ├── upload-documents/            # client pre-validation + dropzone
│   ├── delete-document/             # confirm + store action
│   ├── copy-embed-snippet/          # buildEmbedSnippet + CopyBlock
│   └── edit-suggested-questions/    # 0–4 starter chips for the widget empty state
├── entities/
│   ├── company/                     # CompanyListItem
│   └── document/                    # DocumentRow (status pill + error)
├── shared/
│   ├── api/                         # http.ts, types, auth/companies/documents
│   ├── config/                      # API_URL, WIDGET_CDN_URL (Vite env)
│   ├── store/admin-store.ts         # single Zustand store
│   ├── ui/                          # button, text-input, status-pill,
│   │                                # copy-block, spinner + variables.css
│   └── lib/                         # auth-storage, error-message, format-bytes
└── main.tsx
```

Path alias: `@/*` → `src/*` (`admin/tsconfig.json` + `admin/vite.config.ts`).

## State (`shared/store/admin-store.ts`)

One global store (the admin page is a singleton SPA, not an embeddable runtime).

| Field | Type | Notes |
|---|---|---|
| `adminEmail` | `string \| null` | From login / `GET /auth/me` |
| `isAuthenticated` | `boolean` | Auth gate in `app.tsx` |
| `isAuthenticating` | `boolean` | Login button "Signing in…" |
| `authError` | `string \| null` | Backend `detail` or network message |
| `companies` | `Company[]` | Newest-first after create (prepend) |
| `isLoadingCompanies` | `boolean` | Sidebar spinner |
| `companiesError` | `string \| null` | List/load failures |
| `selectedCompanyId` | `string \| null` | **In-memory only** — not persisted |
| `documents` | `DocumentMeta[]` | For the selected company |
| `isLoadingDocuments` | `boolean` | Detail spinner |
| `documentsError` | `string \| null` | List/delete failures |
| `uploadingFiles` | `{ name, sizeBytes }[]` | Placeholder rows during the request |
| `uploadError` | `string \| null` | 503 / 413 / network under the dropzone |
| `isSavingSuggestedQuestions` | `boolean` | Save button "Saving…" on the starter-questions form |
| `suggestedQuestionsError` | `string \| null` | PATCH `detail` or network under the form |

### Actions

| Action | What it does |
|---|---|
| `login(email, password)` | `POST /auth/login` → `writeSession` → `loadCompanies` |
| `logout()` | `clearSession` + wipe companies/documents/selection (no leak into the next sign-in) |
| `restoreSession()` | If `localStorage` has a session, `GET /auth/me`; on failure, `logout()` |
| `loadCompanies()` | `GET /companies` |
| `createCompany(name)` | `POST /companies` → prepend → `selectCompany` |
| `selectCompany(id)` | Reset documents/errors, then `loadDocuments` |
| `loadDocuments()` | `GET /companies/{id}/documents` (no-op if nothing selected) |
| `uploadDocuments(files)` | Show uploading rows → multipart POST → refresh list |
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
| app (session boot) | `GET /api/v1/auth/me` | bearer |
| companies-sidebar | `GET /api/v1/companies` | bearer |
| create-company | `POST /api/v1/companies` | bearer |
| company-detail | `GET /api/v1/companies/{id}/documents` | bearer |
| edit-suggested-questions | `PATCH /api/v1/companies/{id}/widget-config` | bearer |
| upload-documents | `POST /api/v1/companies/{id}/documents` (multipart `files`) | bearer |
| delete-document | `DELETE /api/v1/companies/{id}/documents/{doc_id}` | bearer |
| api-status | `GET /health` | public (raw `fetch`, no token) |

`GET /api/v1/companies/{id}` exists on the backend but the SPA never calls it —
selection is the in-memory `company_id` from the list.

## UX flows

### Login → panel

1. Open http://localhost:3001. Unauthenticated render is `data-testid="login-screen"`.
2. Zod (`loginSchema`): email trimmed, min 3 chars; password min 1. Messages:
   "Email is required" / "Password is required". Not a full RFC email check —
   matches the backend `LoginRequest` (`min_length=3`).
3. Success: token + email in `localStorage`, header shows the email, companies load.
   `selectedCompanyId` starts `null`, so the main pane is
   `ProductOverview` (`data-testid="product-overview"`): short product
   copy plus feature cards (how each works, how to open it in the UI).
4. Failure: same backend string for unknown email and wrong password
   (`Invalid email or password`). Password field is cleared after the attempt.

### Unselected company (product overview)

When `selectedCompanyId` is `null` (fresh login or reload), `app.tsx`
renders `widgets/product-overview` instead of `CompanyDetail`. Copy lives
in `widgets/product-overview/lib/features.ts` — keep it aligned with the
shipped widget/admin UI.

| Card | How it is opened |
|---|---|
| Knowledge base | Company → Documents dropzone |
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
4. During the request, placeholder rows show a `uploading` pill. The response
   replaces them with `ready` / `failed` (failed rows show `document.error`).
5. Copy block holds the documented script tag (see below). Under it, **Starter
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

Header **Sign out** → `logout()`. Next reload stays on the login screen.

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

## Failure modes

| Symptom | Cause | What the UI does |
|---|---|---|
| Login screen, "API unreachable — is the backend running?" | Backend down / CORS / wrong `VITE_API_URL` | `ApiError(0, …)` on login or any `request()` |
| Health badge "API unreachable" (red) | Same, independently | Badge uses its own `fetch` to `/health` |
| Health "degraded" | Mongo or Chroma ping failed | Badge shows `mongo=` / `chroma=` values |
| `Invalid email or password` | Wrong creds or `ADMIN_PASSWORD` unset (seeding skipped) | Same 401 body; no user enumeration |
| Sudden return to login, no error wall | 401 on any authenticated call | `http.ts` clears session + `logout()` |
| 503 detail under the dropzone | Missing `OPENAI_API_KEY` | Verbatim: `OPENAI_API_KEY is not configured; set it in .env and restart` |
| Red `failed` pill + reason | Scanned PDF, empty file, unsupported type that slipped past the client | Row stays; batch does not roll back |
| `{name}: Unsupported file type: .png` / `File exceeds 10 MB` | Client pre-validation | No network request for those files |
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
  in Phase 2, not the Phase 6 hardening pass.
- `selectedCompanyId` is not written to `localStorage`.
