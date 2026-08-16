# Acme Invoicing Demo — User Manual

Fake SaaS host page for the Hint widget (`http://localhost:3002`).  
Nothing is persisted to a real backend; every control updates the **Activity** sidebar and/or a toast so you can exercise hover hints, chat, and element location against a busy DOM.

---

## 1. Purpose

| Goal | How this page helps |
|---|---|
| Embed smoke test | Loads `loader.js` from `localhost:1337` with `data-hint-company-id` |
| Hover hints | Many labeled `button`, `a`, `input`, `select`, `textarea`, and ARIA roles |
| Chat + locate | Distinct labels (“Export report”, “Create invoice”, tabs, menus) |
| Shadow DOM isolation | Aggressive host CSS (Georgia, navy chrome) that must not leak into the widget |

Related docs in the repo: `README.md`, `docs/01-architecture-overview.md`.

---

## 2. Prerequisites

1. Start the stack: `docker compose up --build` from the Hint repo root.
2. Open **Demo**: http://localhost:3002  
3. Optional: open **Admin** http://localhost:3001, create a company, upload docs, then override the embed company. Full operator guide: [`ADMIN_USER_MANUAL.md`](ADMIN_USER_MANUAL.md).

   ```
   http://localhost:3002/?company_id=cmp_YOUR_ID
   ```

4. Widget CDN must be up: http://localhost:1337/embed/v1/loader.js  
5. Backend API: http://localhost:8000  

A second `<script>` tag on the page is intentional — the singleton guard should no-op it (check the browser console).

---

## 3. Page layout

```
┌─────────────────────────────────────────────────────────┐
│  App bar: brand · clock · workspace name                │
├─────────────────────────────────────────────────────────┤
│  Tabs: Invoices | Customers | Reports | Settings | …    │
├──────────────────────────────┬──────────────────────────┤
│  Main panel (one section)    │  Activity log (sticky)   │
│  + howto blurb               │  Clear button            │
└──────────────────────────────┴──────────────────────────┘
│  Footer                                                     │
└─ Hint widget (bottom area, Shadow DOM) ─ toast (bottom-left)
```

- **Primary tabs** switch which main panel is visible (Invoices / Customers / Reports / Settings).
- **Activity** (right) is a live feed of actions (newest first, capped at 40).
- **Toast** (bottom-left) confirms short-lived actions.
- **Global banner** (yellow) appears for exports / report runs / wipe.
- **User manual** link in the nav opens this file (`USER_MANUAL.md`).

---

## 4. Hint widget (quick)

1. Wait for the Hint bar / lightbulb to appear (bottom of the viewport).
2. Toggle hints on, then hover a control for ~0.5s (e.g. **Export report**).
3. Open chat and ask how to create an invoice, export a report, or change settings — answers depend on KB docs you uploaded for the company.
4. If chat returns element chips, clicking them should highlight / act on matching labeled controls on this page. Chips work for buttons, links, **and form inputs** — inputs are matched by their visible `<label>` text (e.g. "Customer name", "Amount"), aria-label, or placeholder.

---

## 5. Invoices tab

Default landing panel. Seed data: three invoices (`INV-1001` … `INV-1003`).

### 5.1 Summary stats

| Stat | Meaning |
|---|---|
| Total invoices | `invoices.length` |
| Open balance | Count where status ≠ `paid` |
| Paid | Count where status = `paid` |

Stats refresh after create / mark / delete / wipe.

### 5.2 Toolbar

| Control | Type | What it does |
|---|---|---|
| **Search** | `input[type=search]` | Filters rows by invoice id or customer (case-insensitive) |
| **Status** | `select` | Filter: All / Draft / Sent / Paid / Overdue |
| **Refresh list** | `button` | Re-renders the table; toast + activity entry |
| **Export report** | `button` | Animates a progress bar 0→100%, then toast + banner |

While export runs, **Export report** is disabled.

### 5.3 Invoice table

Each row has:

| Action | Effect |
|---|---|
| **Mark sent** | Sets status to `sent` |
| **Mark paid** | Sets status to `paid` |
| **Delete** | Removes the row from in-memory data |

Empty filter result shows a single “No invoices match…” row.

### 5.4 Create invoice form

| Field | Element | Notes |
|---|---|---|
| Customer name | `text` | Required on submit |
| Billing email | `email` | Optional |
| Amount | `number` | Required, `min=0`, step `0.01` |
| Currency | `select` | USD / EUR / GBP / BGN |
| Due date | `date` | Optional |
| Priority | `select` | Normal / High / Low |
| Notes | `textarea` | Free text |
| Email customer | `checkbox` | Default on |
| SMS reminder | `checkbox` | Default off |
| Attach PDF | `checkbox` | Default on |
| Payment terms | `radio` | Net 15 / Net 30 / Due on receipt |

| Button | Behavior |
|---|---|
| **Create invoice** | Validates customer + amount; inserts `INV-####` as `draft`; resets form (keeps email+PDF checked) |
| **Clear form** | Native reset + log/toast |
| **Save as draft** | Creates a draft even with empty/zero amount (customer falls back to “Untitled”) |

New ids start at `INV-1004` and increment for the session.

---

## 6. Customers tab

| Control | Type | What it does |
|---|---|---|
| Company | `text` | Required |
| Phone | `tel` | Optional |
| Country | `select` | US / BG / DE / GB / Other |
| Website | `url` | Optional |
| Tier | `select[multiple]` | Starter / Growth / Enterprise (multi) |
| **Add customer** | submit | Appends to list; logs selected tiers |
| **Import CSV (fake)** | `button` | Pushes one synthetic “Imported Co N” row |
| **Remove** (per row) | `button` | Deletes that customer |

List is in-memory only.

---

## 7. Reports tab

### 7.1 Report type tabs (`role="tab"`)

| Tab | Pane copy (demo) |
|---|---|
| Revenue | Last 30 days · $4,280 collected |
| Aging | 1 overdue · $1,280.50 outstanding |
| Tax summary | Estimated tax $312.40 (not advice) |

### 7.2 Schedule

| Control | Type | Action |
|---|---|---|
| Frequency | `select` | Daily / Weekly / Monthly |
| Send at | `time` | Default `09:00` |
| **Save schedule** | `button` | Logs frequency + time |
| **Run now** | `button` | Toast + yellow banner |

### 7.3 Quick actions menu (`role="menu"` / `menuitem`)

| Item | Effect |
|---|---|
| Download PDF | Simulated toast |
| Download CSV | Simulated toast |
| Copy share link | Writes `…#shared-report` to clipboard when available |
| Email to me | Fake queue toast |

---

## 8. Settings tab

| Control | Type | What it does |
|---|---|---|
| Workspace name | `text` | Saved into the app-bar label |
| Locale | `select` | Logged on save (UI strings stay English) |
| Accent color | `color` | Live swatch; **Apply accent** retints primary buttons + `--navy` |
| UI density | `range` 0–100 | Label: Compact / Comfortable / Spacious |
| Email digests | `checkbox` | Preference flag |
| Browser push | `checkbox` | Fake |
| Slack webhook | `checkbox` | Fake |
| Company logo | `file` `accept=image/*` | Shows filename + size in KB |
| **Save settings** | `button` | Writes workspace label + logs notify flags |
| **Reset defaults** | `button` | Restores Sandbox / en-US / blue / Comfortable / email-only |
| **Wipe demo data** | `button.danger` | `confirm()` then clears invoices + customers |

Expand **About this demo** (`details`/`summary`) for a short reminder that nothing is persisted.

---

## 9. Navigation & chrome

| Control | Role / type | Behavior |
|---|---|---|
| Invoices / Customers / Reports / Settings | `button` + `role="tab"` | Shows one main panel; logs switch |
| Activity | `a[href="#activity-log"]` | Jumps to the sidebar list |
| User manual | `a[href="USER_MANUAL.md"]` | Opens this manual (new tab) |
| Clock | text | Updates every second |
| **Clear** (Activity) | `button` | Empties the log |

---

## 10. Element inventory (for Hint testing)

Hint’s interactive selector covers roughly:

`button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="tab"]`

This page intentionally includes:

- Text-like: text, email, number, search, tel, url, date, time, password-free
- Binary / multi: checkbox, radio, multi-select
- Other inputs: range, color, file
- Selects: single + multiple
- Textarea
- Buttons: primary, secondary, danger, disabled-during-export
- Links: Activity, User manual
- ARIA: top nav tabs, report tabs, menu items

Good hover targets with clear labels:

- Export report  
- Create invoice / Save as draft  
- Mark sent / Mark paid / Delete  
- Save schedule / Run now  
- Download PDF / CSV / Copy share link  
- Save settings / Wipe demo data  

---

## 11. Suggested test scripts

### A. Smoke (no KB)

1. Load http://localhost:3002 — Hint badge appears; duplicate script warns once.
2. Click through all four main tabs; Activity shows switches.
3. Create an invoice; filter by status `draft`; mark paid; delete another row.
4. Export report — progress hits 100%.
5. Settings → change accent → Apply; wipe data → confirm empty table.

### B. Hover hints (with KB)

1. Upload a short markdown doc in Admin describing “Export report” and “Create invoice”.
2. Enable Hint lightbulb; hover **Export report** ≥ 500ms.
3. Hover a quieter control (e.g. **UI density**) and confirm clamp/length behavior.

### C. Chat + locate

1. Ask: “How do I export a report?”
2. Ask: “Where do I change the workspace name?”
3. Click any returned element chip and confirm highlight / flash on the matching control.

### D. Company override

1. Create company in Admin; copy id.
2. Open `http://localhost:3002/?company_id=cmp_…`
3. Confirm hints/chat use that company’s collection (not `cmp_demo0001`).

---

## 12. Limitations (by design)

- No real API, auth, PDF, CSV, email, SMS, Slack, or push.
- Refreshing the browser resets invoices, customers, settings, and Activity.
- Locale select does not translate the UI.
- File upload never leaves the browser.
- “Import CSV” adds one fake row only.
- Aggressive host typography/colors are intentional stress for Shadow DOM.

---

## 13. Files

| Path | Role |
|---|---|
| `demo/index.html` | Host page + all demo behavior (inline CSS/JS) |
| `demo/USER_MANUAL.md` | This manual |
| `docker-compose.yml` → service `demo` | Serves `./demo` on port **3002** |

---

## 14. Troubleshooting

| Symptom | Check |
|---|---|
| No Hint UI | Widget CDN on :1337; console errors; ad blockers |
| Hints empty / wrong company | Admin docs `ready`; `company_id` query vs `data-hint-company-id` |
| Chat 503 | `OPENAI_API_KEY` in `.env`; backend healthy |
| Manual link 404 | File must be `demo/USER_MANUAL.md` (compose mounts whole `demo/`) |
| Styles look broken | Expected for Georgia/serif host — widget should stay isolated |

---

*Last updated for the expanded Acme Invoicing demo host.*
