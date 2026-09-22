# Hint — Authentication

> **Status: multi-user auth.** Email/password registration, Google OAuth, and a
> seeded superadmin. JWT access tokens, no refresh flow. Plan and limits on
> `GET /auth/me` come from Polar — billing contract:
> [`02-backend.md`](02-backend.md#billing). Admin UI (sign-up, Google, billing):
> [`04-admin.md`](04-admin.md).

Companies, documents, and billing routes require a bearer token. Widget-facing
`POST /api/v1/retrieve`, `POST /api/v1/chat`, `POST /api/v1/hint`,
`GET /api/v1/companies/{id}/widget-config`, and `GET /health` stay public
so the embed keeps working without credentials. `POST /api/v1/webhooks/polar`
is public to the internet but accepted only with a valid Polar signature.
Chat/hint contracts: [`06-ai-layer.md`](06-ai-layer.md).

## Model

Two roles share one `users` collection and one JWT shape (`sub` = normalized
email). Subscription fields are denormalized on the same document so
`require_user` is a single read.

| Role | How the row is created | What they can do |
|---|---|---|
| `superadmin` | Boot seed from `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Every company (including legacy rows backfilled at boot). Company creation and URL ingestion ignore plan limits (`max_companies` 10000). |
| `user` | `POST /auth/register` or Google callback | Only companies whose `owner_id` is their `user_id`. Creating a company needs `subscription_status` of `active` or `trialing`. Limits come from `plan` (`basic` / `pro`). |

```
.env (ADMIN_EMAIL / ADMIN_PASSWORD)
  └─ lifespan → AuthService.ensure_admin_user()
       └─ users.upsert(email, bcrypt, role=superadmin, user_id)   # idempotent
  └─ backfill_legacy_company_owners()
       └─ companies without owner_id → superadmin user_id          # once

POST /api/v1/auth/register { email, password }     # password ≥ 8
  └─ users.insert(role=user, password_hash, user_id=usr_<hex8>)
       └─ JWT HS256 { sub: email, iat, exp }

POST /api/v1/auth/login { email, password }
  └─ authenticate (strip+lower email, verify hash)
       └─ password_hash is None (Google-only) → same 401 as a bad password
       └─ JWT

GET /api/v1/auth/google/login
  └─ 307 accounts.google.com + httponly cookie g_state
       └─ GET /api/v1/auth/google/callback?code&state
            └─ find by google_sub, else link by email, else create
            └─ 307 {ADMIN_UI_URL}/#token=…&email=…

Authorization: Bearer <token>
  └─ require_user → decode → users.find_by_email → UserInDB
```

Google authorization-code flow:

```
Browser                Backend                         Google
  |  GET /auth/google/login                              |
  |------------------------->|                           |
  |  307 + Set-Cookie g_state |                          |
  |<-------------------------|  accounts.google.com      |
  |----------------------------------------------------->|
  |  consent (scope: openid email)                       |
  |  GET /auth/google/callback?code&state                |
  |------------------------->|  POST oauth2/token        |
  |                          |-------------------------->|
  |                          |  GET tokeninfo (aud, sub) |
  |                          |-------------------------->|
  |  307 {ADMIN_UI_URL}/#token=…&email=…                 |
  |<-------------------------|                           |
```

State cookie mismatch redirects to `{ADMIN_UI_URL}/#error=oauth_state` and
issues no session. Token exchange or `aud` mismatch redirects to
`#error=google_auth_failed`. An email that already has a password gets
`google_sub` linked; both sign-in methods work afterwards.

Layering (top-down only):

```
routes/auth.py + deps.require_user
  └─ services/auth_service.py
        └─ repositories/user_repo.py
              └─ models/user.py · models/billing.py (PlanLimits)
```

`user_id` is `usr_` + 8 hex chars. `password_hash` is `null` for Google-only
accounts. New `user` rows start with `plan` and `subscription_status` null
until a Polar webhook lands ([`02-backend.md`](02-backend.md#billing)).

## Preset superadmin seeding

On every backend start, after `mongo.ensure_indexes()`:

```python
# backend/app/main.py lifespan
await AuthService(UserRepository(mongo.get_db()), get_settings()).ensure_admin_user()
await backfill_legacy_company_owners(mongo.get_db(), settings.admin_email)
```

| `ADMIN_PASSWORD` | Behavior |
|---|---|
| Set | `email = ADMIN_EMAIL.strip().lower()`, bcrypt-hash the password, `update_one` upsert on `users`. `$set` the hash **and** `role: "superadmin"` every boot so a rotated password takes effect on restart. `$setOnInsert` writes `email`, `user_id`, and `created_at` only on first insert. A second update fills `user_id` on a legacy row that predates it. |
| Empty / unset | Seeding skipped. `AuthService` logs a **warning**. Login for that email returns 401. Self-service `POST /auth/register` still works. Fail-closed so an empty env never yields a passwordless superadmin. |

Default email: `admin@hint.local`. Password has **no** default — `.env.example`
leaves it blank on purpose.

Hash scheme: `passlib` `CryptContext(schemes=["bcrypt"])`. Stored value starts
with `$2b$`. The plaintext password is never written to Mongo.

Companies created before `owner_id` existed are assigned the superadmin
`user_id` once (`owner_id` missing). Later boots match nothing.

### Seed log is not visible under default uvicorn

`ensure_admin_user` logs `INFO app.services.auth_service: Preset admin user ensured: {email}`.
Uvicorn's default logging config does **not** surface that logger, so

```bash
docker compose logs backend | grep "Preset admin user ensured"
```

matches nothing even when seeding succeeded. Proof of seed: a successful login,
or one `users` document with `role: "superadmin"` whose `password_hash` is a
`$2b$` bcrypt string.

To make the line visible later: `logging.basicConfig` in `main.py`, or a uvicorn
`log_config` that includes `app.services`. Not wired in the POC.

## Endpoints

Mounted at `/api/v1` (`backend/app/main.py`).

### POST /api/v1/auth/register → 201 (public)

```json
// Request — email must be a valid address; password 8–200 chars
{"email": "ada@example.com", "password": "long-enough"}

// Response 201 — same body as login
{
  "access_token": "eyJ…",
  "token_type": "bearer",
  "expires_in": 43200,
  "email": "ada@example.com"
}
```

Email is stored `strip().lower()`. The new row is `role: "user"` with no plan.

| Status | `detail` | When |
|---|---|---|
| 409 | `Email is already registered` | That email already has a `users` row (password or Google) |
| 422 | FastAPI validation | Bad email, or password shorter than 8 / longer than 200 |

### POST /api/v1/auth/login → 200 (public)

```json
// Request
{"email": "admin@hint.local", "password": "your-password"}
// email: 3–200 chars · password: 1–200 chars (Pydantic Field)

// Response 200
{
  "access_token": "eyJ…",
  "token_type": "bearer",
  "expires_in": 43200,
  "email": "admin@hint.local"
}
```

`expires_in` is seconds (`ACCESS_TOKEN_TTL_MINUTES * 60`; default 720 min → 43200).

Email is normalized (`strip().lower()`) on seed, register, and login, so
`Admin@Hint.local ` signs in.

| Status | `detail` | When |
|---|---|---|
| 401 | `Invalid email or password` | Unknown email, wrong password, **or** a Google-only account (`password_hash` is null). Same body — no enumeration |
| 422 | FastAPI validation | Body missing / too short |

### GET /api/v1/auth/google/login → 307 (public)

Redirects to `https://accounts.google.com/o/oauth2/v2/auth` with
`scope=openid email`, `prompt=select_account`, and a `state` query param.
Sets cookie `g_state` (`httponly`, `samesite=lax`, `max_age=600`).

| Status | `detail` | When |
|---|---|---|
| 503 | `Google sign-in is not configured` | `GOOGLE_CLIENT_ID` is empty |

### GET /api/v1/auth/google/callback → 307 (public)

Query: `code`, `state`. Exchanges the code at Google, checks `aud` equals
`GOOGLE_CLIENT_ID`, then resolves the user:

1. `google_sub` already stored → that user.
2. Else email already stored → `set_google_sub` on that row (password login
   keeps working).
3. Else insert a Google-only user (`password_hash: null`, `role: "user"`).

| Outcome | Redirect |
|---|---|
| Cookie `g_state` ≠ `state` | `{ADMIN_UI_URL}/#error=oauth_state` |
| Exchange, `aud`, or missing email/`sub` | `{ADMIN_UI_URL}/#error=google_auth_failed` |
| Success | `{ADMIN_UI_URL}/#token=<jwt>&email=<urlencoded email>` |

`ADMIN_UI_URL` defaults to `http://localhost:3001`. On load the Admin SPA
runs `consumeAuthCallback()`: a `#token` + `#email` pair is stored, an
`#error` is shown on the auth screen, and the fragment is removed from the
URL ([`04-admin.md`](04-admin.md#boot-order)). Curl can still inspect the
redirect with `-D -` and redirects off.

### GET /api/v1/auth/me → 200 (bearer)

```json
{
  "email": "ada@example.com",
  "role": "user",
  "created_at": "2026-09-21T12:00:00Z",
  "plan": "basic",
  "subscription_status": "trialing",
  "limits": {"max_companies": 1, "url_ingestion": false}
}
```

`plan` and `subscription_status` are `null` until a subscription webhook
arrives. `limits` is always present:

| Caller | `limits` |
|---|---|
| `superadmin` | `max_companies: 10000`, `url_ingestion: true` (even with `plan: null`) |
| `user` with `subscription_status` `active` or `trialing` | Basic: 1 company, no URL ingest. Pro: 10 companies, URL ingest |
| `user` with no subscription, or `canceled` / `revoked` / `past_due` | `max_companies: 0`, `url_ingestion: false` |

Used by the SPA on reload (`restoreSession`) before rendering the panel.
After checkout, poll this route — the webhook, not the checkout response,
writes the plan.

## JWT

| Claim | Value |
|---|---|
| `sub` | Email (already normalized) |
| `iat` | UTC now |
| `exp` | `iat + ACCESS_TOKEN_TTL_MINUTES` |
| alg | `HS256` (`JWT_ALGORITHM`, not overridable from compose) |
| secret | `JWT_SECRET` |

`decode_token` raises `jwt.PyJWTError` on bad/expired tokens or a missing `sub`.
The token does not carry `role` or `plan`; both are read from Mongo on each
protected request.

There is **no** server-side revocation list. Sign-out is client-only
(`localStorage` cleared). A stolen token works until `exp` or a `JWT_SECRET` change.

## Route protection

`require_user` (`backend/app/routes/deps.py`) uses `HTTPBearer(auto_error=False)`
so a missing header becomes a controlled 401 instead of FastAPI's default 403.
It decodes the JWT, loads `users` by email, and returns `UserInDB` (role, plan,
subscription). It does **not** check the plan — company and URL gates do that
and return 402 / 403 ([`02-backend.md`](02-backend.md#plan-limits-and-ownership)).

| Status | `detail` | `WWW-Authenticate` |
|---|---|---|
| 401 | `Missing bearer token` | `Bearer` |
| 401 | `Invalid or expired token - sign in again` | `Bearer` |
| 401 | `Unknown user` | `Bearer` (valid JWT but email no longer in `users`) |

Applied as router-level `dependencies=[Depends(require_user)]` on
`companies_router`, `documents_router`, and `billing_router`. `/auth/me`
depends on `require_user` in-handler. Login, register, and both Google
routes are public. The Polar webhook router has no bearer check.

| Route | Auth | Why |
|---|---|---|
| `POST /api/v1/auth/register` | public | Self-service signup |
| `POST /api/v1/auth/login` | public | Must be reachable to obtain a token |
| `GET /api/v1/auth/google/login` | public | OAuth redirect |
| `GET /api/v1/auth/google/callback` | public | OAuth code exchange |
| `GET /api/v1/auth/me` | bearer | Session restore; returns role, plan, limits |
| `POST /api/v1/billing/checkout` | bearer | Start Polar checkout |
| `GET /api/v1/billing/portal` | bearer | Polar customer portal |
| `POST /api/v1/webhooks/polar` | signature | Subscription state sync (not a user JWT) |
| `GET/POST /api/v1/companies` | bearer | Caller-scoped; create is plan-gated |
| `GET /api/v1/companies/{id}` | bearer | Owner or superadmin. Another user's company is **404**, same body as unknown |
| `PATCH /api/v1/companies/{id}/widget-config` | bearer | Owner or superadmin |
| `GET /api/v1/companies/{id}/widget-config` | **public** | Widget empty-state chips. Lives on `widget_config_router` (same `/companies` prefix, **no** `require_user`). Do not move GET onto the JWT-wrapped companies router |
| `GET/POST/DELETE /api/v1/companies/{id}/documents…` | bearer | Owner or superadmin. `POST …/from-url` is also Pro-gated (403) |
| `POST /api/v1/retrieve` | **public** | Widget calls this from arbitrary customer origins with no credentials. Company-scoped chunks are world-readable by `company_id`. Locking this down needs public API keys (Phase 6), not user auth |
| `POST /api/v1/chat` | **public** | Widget chat (SSE). Anyone with a `company_id` can spend that company's LLM tokens. Same Phase 6 hardening item |
| `POST /api/v1/hint` | **public** | Widget hover hints (JSON + in-process cache). Same token-spend trade-off as `/chat` |
| `GET /health` | **public** | Compose healthcheck + admin badge |

### Error codes (auth and the gates next to it)

| Status | Typical `detail` | Who raises it |
|---|---|---|
| 401 | `Invalid email or password` · `Missing bearer token` · `Invalid or expired token - sign in again` · `Unknown user` | Login, or `require_user` |
| 402 | `An active subscription is required to create companies` | `POST /companies` when `limits.max_companies` is 0 |
| 403 | `Your plan allows up to N company(ies) — upgrade to Pro for more` | `POST /companies` at the plan cap |
| 403 | `URL ingestion is a Pro feature — upgrade your plan` | `POST …/documents/from-url` when `url_ingestion` is false |
| 403 | `Invalid webhook signature` | `POST /webhooks/polar` (not a user error) |
| 409 | `Email is already registered` | `POST /auth/register` |
| 503 | `Google sign-in is not configured` | Google routes when `GOOGLE_CLIENT_ID` is empty |
| 503 | `Polar billing is not configured; set POLAR_ACCESS_TOKEN in .env and restart` | Checkout, portal, and the webhook when the access token is empty |

Ownership mismatches are **404** `Unknown company_id`, not 403, so a guess
does not confirm that another user's company exists.

## Environment variables

Defined in `backend/app/config.py`. Compose passes them through from `.env`.

| Variable | Settings default | Compose | Consumed by |
|---|---|---|---|
| `JWT_SECRET` | `dev-insecure-secret-change-me` | `${JWT_SECRET:-dev-insecure-secret-change-me}` | backend — **change before any shared/deployed stack** |
| `JWT_ALGORITHM` | `HS256` | not set (code default) | backend |
| `ACCESS_TOKEN_TTL_MINUTES` | `720` (12 h) | `${ACCESS_TOKEN_TTL_MINUTES:-720}` | backend |
| `ADMIN_EMAIL` | `admin@hint.local` | `${ADMIN_EMAIL:-admin@hint.local}` | backend superadmin seed + legacy company backfill |
| `ADMIN_PASSWORD` | `""` | `${ADMIN_PASSWORD:-}` | backend seed — **required** for superadmin login; empty does not disable `/auth/register` |
| `ADMIN_UI_URL` | `http://localhost:3001` | `${ADMIN_UI_URL:-http://localhost:3001}` | Google callback and Polar checkout `success_url` |
| `GOOGLE_CLIENT_ID` | `""` | `${GOOGLE_CLIENT_ID:-}` | backend — empty → Google routes 503 |
| `GOOGLE_CLIENT_SECRET` | `""` | `${GOOGLE_CLIENT_SECRET:-}` | backend code exchange |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/v1/auth/google/callback` | same default | Must match the Google Cloud OAuth client's authorized redirect URI |

Polar variables (`POLAR_*`) are listed in
[`02-backend.md`](02-backend.md#environment-variables-billing-and-auth).

The Admin SPA does not read Google or Polar settings. It only stores the
token it got from `/login`.

## Rotation procedure

| What you change | How to apply | Effect on existing sessions |
|---|---|---|
| `ADMIN_PASSWORD` in `.env` | `docker compose up -d backend` (restart) | Seed upsert re-hashes and re-asserts `role: superadmin`. **Old JWTs keep working** until they expire — no revocation list. The new password is required on the next login. |
| `ADMIN_EMAIL` in `.env` | Restart backend | Upsert creates/updates the **new** email row as superadmin. The old email row remains (still superadmin if it was). Tokens for the old `sub` still validate if that row exists. Legacy company backfill looks up the **new** email; companies already backfilled stay on the old `user_id`. |
| `JWT_SECRET` | Restart backend | All outstanding tokens fail `decode_token` → SPA 401 → login screen. |
| `ACCESS_TOKEN_TTL_MINUTES` | Restart backend | Affects **newly issued** tokens only. |
| `GOOGLE_CLIENT_SECRET` | Restart backend | New Google callbacks use the new secret. Outstanding Hint JWTs are unchanged. In-flight `code` values die with Google's short code TTL. |
| `GOOGLE_CLIENT_ID` | Restart backend, and update the Cloud OAuth client | `aud` check uses the new id. Callbacks from the old client fail closed (`#error=google_auth_failed`). Existing `google_sub` links stay valid — `sub` is the Google account, not the client id. |
| `GOOGLE_REDIRECT_URI` | Restart backend **and** add the same URI on the Google client | Mismatch fails at Google before the callback, or at the token endpoint. |

```bash
# 1. edit .env
# 2. recreate the backend container so it re-reads env
docker compose up -d backend

# 3. confirm login (replace the password)
curl -s -X POST localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@hint.local","password":"NEW_PASSWORD"}'
```

One-time Google Cloud and Polar sandbox setup (including `ngrok` for local
webhooks): the README checklist.

## Admin client contract

| Key | Value |
|---|---|
| Storage | `localStorage` keys `hint.admin.token` and `hint.admin.email` (`shared/lib/auth-storage.ts`) |
| Header | `Authorization: Bearer <token>` on every `request()` except when no session |
| Boot | `consumeAuthCallback()` (hash token, `#error`, `?checkout=success`) then `restoreSession` → `GET /auth/me`; failure → `logout()` |
| 401 | `clearSession()` + registered handler (`logout` in `app.tsx`) — login screen, not an error wall |
| Sign out | Client-only; the JWT is still valid on the server until `exp` |

The SPA auth screen calls `POST /auth/login`, `POST /auth/register`, and
navigates to `GET /auth/google/login`. Checkout and the customer portal are
`POST /billing/checkout` and `GET /billing/portal` from the billing screen
([`04-admin.md`](04-admin.md)). The seeded superadmin still signs in with
email and password and skips plan limits.

`localStorage` throws in some private-mode browsers. Writes/reads are try/catch:
the session then lives only in memory and a reload returns to login.

Two tabs: sign-out in one does **not** notify the other (no `storage` listener).
The second tab keeps its in-memory `isAuthenticated` until its next 401.

## Accepted POC trade-offs

- **`localStorage` instead of an httpOnly cookie.** Readable by XSS on the admin
  origin. Accepted: the SPA renders no third-party content, and a cookie flow
  would need CSRF plus same-site coordination with `:8000`. The Google `g_state`
  cookie is httponly; the session JWT is not.
- **No refresh token.** One access token (12 h default) instead of the 30 min +
  7 day pair in the workspace security rule.
- **Public `/retrieve`, `/chat`, `/hint`, `GET …/widget-config`.** See the
  route table. User auth does not protect knowledge-base reads, LLM spend,
  or the starter-question list by `company_id`.
- **No rate limit** on `/login` or `/register`. Brute-force is in scope for Phase 6.
- **CORS `*`** still applies, including to `/auth/*`. Fine for the POC;
  tighten with the widget origin list later if the admin is ever exposed.
- **Google tokens are not stored.** Only `google_sub` (and email) is kept.
  Hint's own JWT is what later requests send.

## Failure modes (auth-specific)

| Symptom | Cause | Fix |
|---|---|---|
| Superadmin login 401, no `role: superadmin` row | `ADMIN_PASSWORD` unset at boot | Set it in `.env`, restart backend |
| Login 401 after a password change in `.env` without restart | Seed has not re-hashed | `docker compose up -d backend` |
| Login 401 for an account that signed up with Google | `password_hash` is null | Use Google again, or register was never given a password |
| `409 Email is already registered` | Second `POST /register` for the same email | `POST /login`, or Google (which links) |
| Panel bounce to login after a backend rebuild | `JWT_SECRET` changed (or default used then overridden) | Sign in again |
| `Missing bearer token` in curl | Forgot `-H "Authorization: Bearer …"` | Login or register first; see [`02-backend.md`](02-backend.md#end-to-end-curl-walkthrough) |
| `Unknown user` | Token `sub` not in `users` (email rotated and old row deleted) | Login with an email that still exists |
| `503 Google sign-in is not configured` | Empty `GOOGLE_CLIENT_ID` | Set the Google client id and secret, restart |
| Browser lands on `/#error=oauth_state` | `g_state` cookie missing or not the `state` query (stale tab, cookie blocked) | Start again at `GET /auth/google/login` |
| Browser lands on `/#error=google_auth_failed` | Secret/redirect mismatch, or `aud` ≠ `GOOGLE_CLIENT_ID` | Align Cloud console redirect URI with `GOOGLE_REDIRECT_URI` |
