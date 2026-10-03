# Hint — User Management & Billing

> **Status: shipped.** Multi-user accounts (email/password, Google OAuth, a
> seeded superadmin), Polar subscriptions (Basic / Pro), and **usage metering**
> with time-of-use pricing all run on the API and in the Admin SPA.
>
> This document is the end-to-end reference that ties the pieces together.
> It does not replace the focused contracts — read them for exact payloads:
> **Auth** (JWT, Google flow, route protection): [`05-auth.md`](05-auth.md).
> **Backend API** (checkout/portal/webhook/usage endpoints, env vars):
> [`02-backend.md`](02-backend.md#billing). **Admin SPA** (plan cards, checkout
> polling, usage widget): [`04-admin.md`](04-admin.md). **Stack & env overview**:
> [`01-architecture-overview.md`](01-architecture-overview.md). **LLM cost
> sources** (chat/hint token usage): [`06-ai-layer.md`](06-ai-layer.md).

```
                 ┌──────────── Admin SPA (:3001) ────────────┐
 register/login  │  auth-screen · billing · companies        │
 Google          └───────────────────┬───────────────────────┘
                                      │ Bearer JWT
                                      ▼
 Polar ──webhook──▶  backend (FastAPI)  ──▶  MongoDB
   ▲                   routes → services → repositories
   │                        │
   └── metered usage ───────┘  (hint_usage events)
```

Three independent concerns share the `users` document:

| Concern | Owns | Source of truth |
|---|---|---|
| **Identity** | who you are (email, password hash, Google link, JWT) | Hint `users` collection |
| **Entitlement** | what your plan lets you do (companies, URL ingest, allowance) | Polar subscription → denormalized onto `users` |
| **Usage** | what you actually consumed (LLM tokens → USD) | Hint `usage_events` collection; Polar is the invoice authority |

---

## 1. Data model

### `users` collection

One document per account (`backend/app/models/user.py` → `UserInDB`). The
subscription fields are **denormalized** here so `require_user` is a single read.

| Field | Type | Notes |
|---|---|---|
| `user_id` | `str` | `usr_` + 8 hex chars (`secrets.token_hex(4)`). Stable external id used as Polar `external_customer_id` and as a company `owner_id`. |
| `email` | `str` | Stored `strip().lower()`. Unique index. JWT `sub`. |
| `role` | `"superadmin" \| "user"` | Seeded admin vs self-service user. |
| `password_hash` | `str \| null` | bcrypt (`$2b$…`). `null` for Google-only accounts. |
| `google_sub` | `str \| null` | Google account id once linked. Unique sparse index. |
| `created_at` | `datetime` | |
| `plan` | `"basic" \| "pro" \| null` | Written by the Polar webhook; `null` until a subscription lands or after cancel/revoke. |
| `subscription_status` | `trialing \| active \| canceled \| revoked \| past_due \| null` | Written by the webhook. |
| `polar_customer_id` | `str \| null` | Needed for the customer portal. |
| `polar_subscription_id` | `str \| null` | |
| `current_period_start` / `current_period_end` | `datetime \| null` | Drive the usage billing period. |

`UserInDB.has_active_subscription` is `True` for a superadmin or any user whose
`subscription_status` is `active` or `trialing`.

### `usage_events` collection

One document per metered LLM call (`backend/app/repositories/usage_repo.py`).

| Field | Type | Notes |
|---|---|---|
| `company_id` | `str` | Which company's widget spent the tokens. |
| `owner_id` | `str` | The company owner's `user_id` — this is what usage is summed by. |
| `kind` | `"chat" \| "hint"` | Which endpoint produced it. |
| `model` | `str` | e.g. `deepseek-flash`, `gpt-4o-mini`. |
| `input_tokens` / `output_tokens` | `int` | From the LLM response metadata. |
| `cost_usd` | `float` | Raw model cost for the applied tier. |
| `billable_usd` | `float` | `cost_usd × USAGE_BILLING_MARKUP`, rounded to 6 dp. |
| `price_tier` | `"peak" \| "offpeak" \| "flat"` | Which rate was applied — makes the charge auditable. |
| `created_at` | `datetime` | UTC; also the field the billing period filters on. |

### Indexes (`backend/app/db/mongo.py`)

```python
users.create_index("email", unique=True)
users.create_index("user_id", unique=True, sparse=True)
users.create_index("google_sub", unique=True, sparse=True)
companies.create_index("owner_id")
usage_events.create_index([("owner_id", 1), ("created_at", 1)])  # usage summary
```

---

## 2. User lifecycle

Full payloads and error codes: [`05-auth.md`](05-auth.md). Summary here.

### Roles

| Role | Created by | Capabilities |
|---|---|---|
| `superadmin` | Boot seed from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (idempotent upsert). | Every company (incl. legacy rows backfilled at boot). Ignores plan limits (`max_companies` 10000, `url_ingestion` true). No Polar required. |
| `user` | `POST /auth/register` or the Google callback. | Only companies they own. Creating a company needs an `active`/`trialing` subscription. Limits come from `plan`. |

### Identity paths

- **Register** — `POST /api/v1/auth/register {email, password}` (password ≥ 8).
  Inserts a `role: "user"` row with no plan and returns a JWT.
- **Login** — `POST /api/v1/auth/login {email, password}`. A Google-only account
  (`password_hash is null`) returns the **same** 401 as a bad password (no
  enumeration).
- **Google OAuth** — `GET /auth/google/login` → Google consent →
  `GET /auth/google/callback`. Resolution order: match `google_sub`, else link
  `google_sub` onto the row with that email, else create a Google-only user.
  Success redirects to `{ADMIN_UI_URL}/#token=…&email=…`.
- **Superadmin seed** — on every boot `ensure_admin_user()` upserts the admin
  row (re-hashes the password, re-asserts `role: superadmin`). Empty
  `ADMIN_PASSWORD` → seeding skipped and that login 401s (fail-closed).

### Sessions (JWT)

HS256, `sub` = normalized email, `exp` = `iat + ACCESS_TOKEN_TTL_MINUTES`
(default 720 min). **No refresh token and no server-side revocation** — sign-out
is client-only; a token works until `exp` or a `JWT_SECRET` change. `role` and
`plan` are **not** in the token; they are read from Mongo on every protected
request via `require_user`.

---

## 3. Plans & limits

`PlanLimits` and `resolve_limits` live in `backend/app/models/billing.py`.
`GET /auth/me` returns the resolved `limits` block, and the company/URL gates
enforce it server-side.

| Caller | `max_companies` | `url_ingestion` | `monthly_cost_usd` (allowance) |
|---|---|---|---|
| `superadmin` | 10000 | true | `-1` (unlimited) |
| `user`, `basic`, status `active`/`trialing` | 1 | false | `5.0` |
| `user`, `pro`, status `active`/`trialing` | 10 | true | `50.0` |
| `user`, no plan or status `canceled`/`revoked`/`past_due`/null | 0 | false | `0.0` |

Enforcement (details in [`02-backend.md`](02-backend.md#plan-limits-and-ownership)):

- `POST /companies` → **402** when `max_companies` is 0, **403** at the cap.
- `POST …/documents/from-url` → **403** when `url_ingestion` is false.
- `monthly_cost_usd` is the **included usage allowance** compared against metered
  spend in the usage summary (§5). `-1` means never overages.

Downgrade/cancel never deletes companies already created — only **creation above
the new cap** is blocked.

---

## 4. Subscription lifecycle (Polar)

Polar is the merchant of record. Hint never sees a card. State flows one way:
**Polar → signed webhook → `users` document**.

### Checkout

`POST /api/v1/billing/checkout {plan}` (bearer) → `BillingService.create_checkout`:

```python
checkout = await polar.checkouts.create_async(request={
    "products": [POLAR_PRODUCT_ID_BASIC | POLAR_PRODUCT_ID_PRO],
    "external_customer_id": user.user_id,   # ties Polar's customer to our user
    "customer_email": user.email,
    "success_url": f"{ADMIN_UI_URL}/?checkout=success",
})
return {"checkout_url": checkout.url}
```

Checkout alone does **not** unlock the product — the webhook does. The SPA polls
`GET /auth/me` after redirect until `subscription_status` is `trialing`/`active`.

### Webhook → state write

`POST /api/v1/webhooks/polar` (public, signature-checked). Raw body + headers go
to `polar_sdk.webhooks.validate_event` with `POLAR_WEBHOOK_SECRET`; a bad
signature is **403**. Everything else returns **202**.

Handled event types: `subscription.created`, `.updated`, `.active`,
`.canceled`, `.revoked`. Any other type is a 202 no-op.

```
event → validate signature → extract customer.external_id (= user_id)
      → map product_id → plan   → map status
      → users.update_subscription(user_id, {status, plan?, polar ids, period})
```

- **No `external_id`** → warning log, no write (checkout created outside this flow).
- **Unknown `product_id`** → status + Polar ids are written, but `plan` is left
  unchanged (warning logged).
- **`canceled` / `revoked`** → `plan` is cleared to `null`.
- `update_subscription` only `$set`s a whitelist of fields and is an idempotent
  upsert-free update, so duplicate deliveries are safe.

Status mapping (`billing_service.py`):

| Polar status | Stored `subscription_status` |
|---|---|
| `trialing` / `active` / `canceled` / `revoked` / `past_due` | same |
| `unpaid` / `incomplete_expired` | `revoked` |
| `paused` / `incomplete` | `past_due` |
| event type `subscription.revoked` | `revoked` (wins over payload status) |

Only `active` or `trialing` count as subscribed for plan limits.

### Customer portal

`GET /api/v1/billing/portal` (bearer) → **404** `No subscription on file` when
`polar_customer_id` is still null; otherwise a Polar customer-portal URL built
from `external_customer_id = user_id`.

---

## 5. Usage metering & pricing

Entitlement (§3–4) says *what you may do*. Metering records *what you spent*.

### What is metered

Every `POST /api/v1/chat` and every **cache-miss** `POST /api/v1/hint` records
one usage event after the LLM responds (`routes/assist.py` →
`UsageService.record`). A hint served from the in-process cache spent no
tokens, so it writes nothing. Token counts come from the LLM response metadata
([`06-ai-layer.md`](06-ai-layer.md)).

### `record()` flow

```python
# backend/app/services/usage_service.py
when = datetime.now(timezone.utc)
cost = await self.pricing.cost_usd(model, usage.input_tokens, usage.output_tokens, when)
billable = round(cost * self.markup, 6)          # markup = USAGE_BILLING_MARKUP (1.3)
tier = price_tier(model, when)                    # "peak" | "offpeak" | "flat"
await self.repo.record(company_id, owner_id, kind, model, in, out, cost, billable, tier)
if self.polar is not None:
    await self.polar.report(owner_id, billable, kind)   # metered → Polar
```

An **ownerless** (legacy) company is skipped entirely — no event, no report.

### Cost model (`backend/app/models/pricing.py`)

| Model | Pricing kind | Rate |
|---|---|---|
| `deepseek-flash` | **Time-of-use** (`TIME_OF_USE_PRICES`) | **Peak** `$0.30`/1M in · `$1.20`/1M out; **off-peak = exactly half** (`$0.15` / `$0.60`) |
| `gpt-4o-mini` + others | Flat (`MODEL_PRICES`) | `$0.15`/1M in · `$0.60`/1M out; unknown model → `$0` |

**DeepSeek peak** = Mon–Fri `01:00–04:00` and `06:00–10:00` **UTC**; everything
else (incl. all weekend) is off-peak. DeepSeek exposes no price API and the
response carries only token counts, so the tier is computed from the request's
UTC timestamp (`is_deepseek_peak`) against a local table. This is a pure function
of time, so **it is always on** — no flag, no network. The applied tier is stored
on each event (`price_tier`) for audit.

Only the **peak** rate and an `offpeak_multiplier` (default `0.5`) are stored;
off-peak is derived. To re-price DeepSeek, edit `TIME_OF_USE_PRICES["deepseek-flash"]`.

### Optional live refresh of flat prices

`backend/app/services/pricing_service.py` defines a `PricingProvider` with two
implementations, chosen once as a singleton in `routes/deps.py`:

| Provider | When | Behavior |
|---|---|---|
| `StaticPricing` | default (`PRICING_LIVE_ENABLED=false`) | Prices from the local module tables; always time-of-use aware. No network. |
| `LivePricing` | `PRICING_LIVE_ENABLED=true` | Once-a-day (`PRICING_REFRESH_TTL_SECONDS=86400`) fetch of LiteLLM's price JSON for **flat** models, cached **in-process** (no Redis). DeepSeek + unknown models still use the local schedule. A fetch/parse error logs and falls back to the last cache, then the static table — a pricing failure never breaks a request. |

When live pricing is on, `main.py`'s `lifespan` does a best-effort warm fetch so
the first request doesn't pay the latency. Local flat overrides always win over
fetched values. **Polar remains the invoice authority** — keep the markup and the
Polar meter aligned; this only sharpens Hint's internal estimate.

### Usage summary — `GET /api/v1/billing/usage`

Bearer. Returns `UsageSummary` (`backend/app/models/usage.py`):

```json
{
  "period_start": "2026-10-01T00:00:00Z",
  "period_end":   "2026-10-31T00:00:00Z",
  "allowance_usd": 50.0,       // monthly_cost_usd from the plan; -1 == unlimited
  "used_usd": 12.5,            // Σ billable_usd this period (6 dp)
  "overage_usd": 0.0,          // max(0, used - allowance); 0 when unlimited
  "pricing_tier": "offpeak"    // DeepSeek tier right now (flat models report "offpeak")
}
```

- **Period** comes from `current_period_start/end` on the user, falling back to
  `end − 30d`, then to the calendar month (`billing_period`).
- **`used_usd`** is `UsageRepository.total_billable` — a `$match` on
  `owner_id` + `created_at` range, `$sum` of `billable_usd`.
- **`pricing_tier`** is informational for the UI badge; it reflects the current
  time, not the summed history.

### Metered reporting to Polar

`PolarUsageReporter.report` ingests one `hint_usage` event per metered call:

```python
polar.events.ingest_async(request={"events": [{
    "name": "hint_usage",
    "external_customer_id": owner_id,
    "metadata": {"billable_usd": billable_usd, "kind": kind},
}]})
```

Failures are swallowed (logged) — metered reporting never breaks a chat/hint
request. When `POLAR_ACCESS_TOKEN` is empty the reporter is simply not wired, so
public routes still boot.

### Admin billing screen

The billing screen (`admin/src/widgets/billing`) shows plan cards, a **Manage
subscription** button, and a **Usage this period** section
(`usage-section.tsx`): a used/allowance bar, an overage line when `overage_usd > 0`,
and a **Peak / Off-peak** pricing badge driven by `UsageSummary.pricing_tier`
with a one-line explanation of DeepSeek time-of-use rates. See
[`04-admin.md`](04-admin.md#billing-screen).

---

## 6. End-to-end example

```
1. POST /auth/register {email, password}            → 201 + JWT (plan: null)
2. POST /billing/checkout {"plan":"pro"}  (Bearer)   → {checkout_url}
3. user pays on Polar (trial starts there)
4. Polar → POST /webhooks/polar (signed)             → users.$set {plan:"pro", status:"trialing", period}
5. GET /auth/me (Bearer)  [poll]                     → limits {max_companies:10, url_ingestion:true}
6. POST /companies {name}                            → 201 (within cap)
7. widget → POST /chat / POST /hint                  → usage_events row (cost, billable, tier) + hint_usage → Polar
8. GET /billing/usage (Bearer)                       → {allowance 50, used 0.35, overage 0, pricing_tier}
```

---

## 7. Environment variables

Defined in `backend/app/config.py`; compose passes them from `.env`. Auth vars
(`JWT_*`, `ADMIN_*`, `GOOGLE_*`) are tabulated in
[`05-auth.md`](05-auth.md#environment-variables); billing/usage vars in
[`02-backend.md`](02-backend.md#environment-variables-billing-and-auth).

| Variable | Default | Role |
|---|---|---|
| `POLAR_ACCESS_TOKEN` | `""` | Empty → checkout/portal/webhook/metered-reporting all 503 or disabled. |
| `POLAR_WEBHOOK_SECRET` | `""` | Webhook signature check; mismatch → 403. |
| `POLAR_ENVIRONMENT` | `sandbox` | `sandbox` vs production Polar server. |
| `POLAR_PRODUCT_ID_BASIC` / `_PRO` | `""` | Checkout product; webhook maps the id back to a plan. |
| `USAGE_BILLING_MARKUP` | `1.3` | Multiplier: raw cost → `billable_usd`. |
| `PRICING_LIVE_ENABLED` | `false` | `true` → daily live refresh of **flat** prices. DeepSeek peak/off-peak is unaffected. |
| `PRICING_SOURCE_URL` | LiteLLM raw JSON | Dataset fetched when live pricing is on. |
| `PRICING_REFRESH_TTL_SECONDS` | `86400` | In-process cache TTL (no Redis). |

---

## 8. Failure modes

| Symptom | Cause | Fix / behavior |
|---|---|---|
| Superadmin login 401 | `ADMIN_PASSWORD` empty at boot | Set it, `docker compose up -d backend`. |
| Login 401 for a Google user | `password_hash` is null | Use Google; same 401 as bad password (no enumeration). |
| `409 Email is already registered` | Duplicate `/register` | Login, or Google (which links). |
| Checkout succeeds but panel still shows billing | Webhook hasn't landed | Poll `GET /auth/me`; the webhook, not checkout, writes the plan. |
| `503` on `/billing/*` or `/webhooks/polar` | `POLAR_ACCESS_TOKEN` empty | Set it, restart. Rest of API still boots. |
| `403 Invalid webhook signature` | Wrong `POLAR_WEBHOOK_SECRET` or tampered body | Align the secret; for local use point Polar at an `ngrok` URL. |
| Webhook 202 but plan unchanged | Unknown `product_id`, or missing `external_id` | Set both product ids; checkout via this flow so `external_customer_id` is present. |
| `used_usd` stays 0 after chats | Ownerless legacy company, or Polar/pricing error swallowed | Legacy companies are skipped; metered + pricing errors never block requests (check logs). |
| Same traffic costs different amounts | DeepSeek peak vs off-peak | Expected — `price_tier` on each event explains which rate applied. |

---

## 9. Accepted POC trade-offs

- **Entitlement is denormalized onto `users`** for a single-read `require_user`;
  Polar is reconciled only via webhooks (no periodic pull).
- **Usage is an internal estimate**, not the invoice. Polar's meter is the money
  authority; the markup + meter config must be kept aligned by hand.
- **Chinese public holidays** are not modeled for DeepSeek (treated as peak when
  they are actually off-peak) — a small over-estimate, never an under-charge.
- **DeepSeek cache-hit discounts** are not modeled (cache-miss input rate used).
- **No rate limiting** on `/login`, `/register`, or the public widget routes
  (`/chat`, `/hint`) — anyone with a `company_id` can spend that company's tokens.
  Hardening is a Phase 6 item (public API keys).
