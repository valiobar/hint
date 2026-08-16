# Hint — Authentication

> **Status: Phase 2 complete.** Single preset admin, JWT access tokens, no refresh
> flow. Admin UI: [`04-admin.md`](04-admin.md). Backend layering:
> [`02-backend.md`](02-backend.md).

Admin companies/documents routes require a bearer token. Widget-facing
`POST /api/v1/retrieve`, `POST /api/v1/chat`, `POST /api/v1/hint`,
`GET /api/v1/companies/{id}/widget-config`, and `GET /health` stay public
so the embed keeps working without credentials.
Chat/hint contracts: [`06-ai-layer.md`](06-ai-layer.md).

## Model

One operator, seeded from env into Mongo `users`. No registration, no roles,
no refresh tokens.

```
.env (ADMIN_EMAIL / ADMIN_PASSWORD)
  └─ lifespan → AuthService.ensure_admin_user()
       └─ users.upsert(email, bcrypt hash)     # idempotent; re-hashes every boot

POST /api/v1/auth/login { email, password }
  └─ authenticate (strip+lower email, verify hash)
       └─ JWT HS256 { sub: email, iat, exp }   # TTL = ACCESS_TOKEN_TTL_MINUTES

Authorization: Bearer <token>
  └─ require_admin → decode → users.find_by_email → AdminUser
```

Layering (top-down only):

```
routes/auth.py + deps.require_admin
  └─ services/auth_service.py
        └─ repositories/user_repo.py
              └─ models/user.py
```

## Preset-admin seeding

On every backend start, after `mongo.ensure_indexes()`:

```python
# backend/app/main.py lifespan
await AuthService(UserRepository(mongo.get_db()), get_settings()).ensure_admin_user()
```

| `ADMIN_PASSWORD` | Behavior |
|---|---|
| Set | `email = ADMIN_EMAIL.strip().lower()`, bcrypt-hash the password, `update_one` upsert on `users`. `$set` the hash every boot so a rotated password takes effect on restart. `$setOnInsert` writes `email` + `created_at` only on first insert. |
| Empty / unset | Seeding skipped. `AuthService` logs a **warning**. Every login returns 401. Fail-closed so an empty env never yields a passwordless panel. |

Default email: `admin@hint.local`. Password has **no** default — `.env.example`
leaves it blank on purpose.

Hash scheme: `passlib` `CryptContext(schemes=["bcrypt"])`. Stored value starts
with `$2b$`. The plaintext password is never written to Mongo.

### Seed log is not visible under default uvicorn

`ensure_admin_user` logs `INFO app.services.auth_service: Preset admin user ensured: {email}`.
Uvicorn's default logging config does **not** surface that logger, so

```bash
docker compose logs backend | grep "Preset admin user ensured"
```

matches nothing even when seeding succeeded. Proof of seed: a successful login,
or one `users` document whose `password_hash` is a `$2b$` bcrypt string.

To make the line visible later: `logging.basicConfig` in `main.py`, or a uvicorn
`log_config` that includes `app.services`. Not wired in the POC.

## Endpoints

Mounted at `/api/v1` (`backend/app/main.py`).

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

Email is normalized (`strip().lower()`) on both seed and login, so
`Admin@Hint.local ` signs in.

| Status | `detail` | When |
|---|---|---|
| 401 | `Invalid email or password` | Unknown email **or** wrong password (same body — no enumeration) |
| 401 | `Invalid email or password` | `ADMIN_PASSWORD` was empty at boot (no user row, or leftover row with a stale hash if you later unset the password — login still fails if the password does not match) |
| 422 | FastAPI validation | Body missing / too short |

### GET /api/v1/auth/me → 200 (bearer)

```json
// Response 200
{"email": "admin@hint.local", "created_at": "2026-08-15T12:00:00Z"}
```

Used by the SPA on reload (`restoreSession`) before rendering the panel.

## JWT

| Claim | Value |
|---|---|
| `sub` | Admin email (already normalized) |
| `iat` | UTC now |
| `exp` | `iat + ACCESS_TOKEN_TTL_MINUTES` |
| alg | `HS256` (`JWT_ALGORITHM`, not overridable from compose) |
| secret | `JWT_SECRET` |

`decode_token` raises `jwt.PyJWTError` on bad/expired tokens or a missing `sub`.

There is **no** server-side revocation list. Sign-out is client-only
(`localStorage` cleared). A stolen token works until `exp` or a `JWT_SECRET` change.

## Route protection

`require_admin` (`backend/app/routes/deps.py`) uses `HTTPBearer(auto_error=False)`
so a missing header becomes a controlled 401 instead of FastAPI's default 403.

| Status | `detail` | `WWW-Authenticate` |
|---|---|---|
| 401 | `Missing bearer token` | `Bearer` |
| 401 | `Invalid or expired token - sign in again` | `Bearer` |
| 401 | `Unknown user` | `Bearer` (valid JWT but email no longer in `users`) |

Applied as router-level `dependencies=[Depends(require_admin)]` on
`companies_router` and `documents_router`. Auth routes: login public, `/me`
depends on `require_admin` in-handler.

| Route | Auth | Why |
|---|---|---|
| `POST /api/v1/auth/login` | public | Must be reachable to obtain a token |
| `GET /api/v1/auth/me` | bearer | Session restore |
| `GET/POST /api/v1/companies` | bearer | Operator-only |
| `GET /api/v1/companies/{id}` | bearer | Operator-only (unused by the SPA) |
| `PATCH /api/v1/companies/{id}/widget-config` | bearer | Operator-only (Admin starter questions). Lives on `companies_router`. |
| `GET /api/v1/companies/{id}/widget-config` | **public** | Widget empty-state chips. Lives on `widget_config_router` (same `/companies` prefix, **no** `require_admin`). Do not move GET onto the JWT-wrapped companies router. |
| `GET/POST/DELETE /api/v1/companies/{id}/documents…` | bearer | Operator-only |
| `POST /api/v1/retrieve` | **public** | Widget calls this from arbitrary customer origins with no credentials. Company-scoped chunks are world-readable by `company_id`. Locking this down needs public API keys (Phase 6), not admin auth. |
| `POST /api/v1/chat` | **public** | Widget chat (SSE). Anyone with a `company_id` can spend that company's LLM tokens. Same Phase 6 hardening item. |
| `POST /api/v1/hint` | **public** | Widget hover hints (JSON + in-process cache). Same token-spend trade-off as `/chat`. |
| `GET /health` | **public** | Compose healthcheck + admin badge |

## Environment variables

Defined in `backend/app/config.py`. Compose passes them through from `.env`.

| Variable | Settings default | Compose | Consumed by |
|---|---|---|---|
| `JWT_SECRET` | `dev-insecure-secret-change-me` | `${JWT_SECRET:-dev-insecure-secret-change-me}` | backend — **change before any shared/deployed stack** |
| `JWT_ALGORITHM` | `HS256` | not set (code default) | backend |
| `ACCESS_TOKEN_TTL_MINUTES` | `720` (12 h) | `${ACCESS_TOKEN_TTL_MINUTES:-720}` | backend |
| `ADMIN_EMAIL` | `admin@hint.local` | `${ADMIN_EMAIL:-admin@hint.local}` | backend seed |
| `ADMIN_PASSWORD` | `""` | `${ADMIN_PASSWORD:-}` | backend seed — **required** for login |

Admin SPA does not read these. It only stores the token it got from `/login`.

## Rotation procedure

| What you change | How to apply | Effect on existing sessions |
|---|---|---|
| `ADMIN_PASSWORD` in `.env` | `docker compose up -d backend` (restart) | Seed upsert re-hashes. **Old JWTs keep working** until they expire — no revocation list. The new password is required on the next login. |
| `ADMIN_EMAIL` in `.env` | Restart backend | Upsert creates/updates the **new** email row. The old email row remains. Tokens for the old `sub` still validate if that row exists (`Unknown user` only if you delete it). |
| `JWT_SECRET` | Restart backend | All outstanding tokens fail `decode_token` → SPA 401 → login screen. |
| `ACCESS_TOKEN_TTL_MINUTES` | Restart backend | Affects **newly issued** tokens only. |

```bash
# 1. edit .env
# 2. recreate the backend container so it re-reads env
docker compose up -d backend

# 3. confirm login (replace the password)
curl -s -X POST localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@hint.local","password":"NEW_PASSWORD"}'
```

## Admin client contract

| Key | Value |
|---|---|
| Storage | `localStorage` keys `hint.admin.token` and `hint.admin.email` (`shared/lib/auth-storage.ts`) |
| Header | `Authorization: Bearer <token>` on every `request()` except when no session |
| Boot | `restoreSession` → `GET /auth/me`; failure → `logout()` |
| 401 | `clearSession()` + registered handler (`logout` in `app.tsx`) — login screen, not an error wall |
| Sign out | Client-only; the JWT is still valid on the server until `exp` |

`localStorage` throws in some private-mode browsers. Writes/reads are try/catch:
the session then lives only in memory and a reload returns to login.

Two tabs: sign-out in one does **not** notify the other (no `storage` listener).
The second tab keeps its in-memory `isAuthenticated` until its next 401.

## Accepted POC trade-offs

- **`localStorage` instead of an httpOnly cookie.** Readable by XSS on the admin
  origin. Accepted: the SPA renders no third-party content, and a cookie flow
  would need CSRF plus same-site coordination with `:8000`.
- **No refresh token.** One access token (12 h default) instead of the 30 min +
  7 day pair in the workspace security rule. A refresh endpoint is unjustified
  for a one-operator panel.
- **Public `/retrieve`, `/chat`, `/hint`, `GET …/widget-config`.** See the
  route table. Admin auth does not protect knowledge-base reads, LLM spend,
  or the starter-question list by `company_id`.
- **No rate limit** on `/login`. Brute-force is in scope for Phase 6.
- **CORS `*`** still applies, including to `/auth/login`. Fine for the POC;
  tighten with the widget origin list later if the admin is ever exposed.

## Failure modes (auth-specific)

| Symptom | Cause | Fix |
|---|---|---|
| Every login 401, empty `users` | `ADMIN_PASSWORD` unset at boot | Set it in `.env`, restart backend |
| Login 401 after a password change in `.env` without restart | Seed has not re-hashed | `docker compose up -d backend` |
| Panel bounce to login after a backend rebuild | `JWT_SECRET` changed (or default used then overridden) | Sign in again |
| `Missing bearer token` in curl | Forgot `-H "Authorization: Bearer …"` | Login first; see [`02-backend.md`](02-backend.md#end-to-end-curl-walkthrough) |
| `Unknown user` | Token `sub` not in `users` (email rotated and old row deleted) | Login with the current `ADMIN_EMAIL` |
