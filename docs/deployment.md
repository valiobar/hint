# Production deploy (Compose-on-VPS)

Hint deploys the same way as [vbar-viber-bot](https://github.com/valiobar/vbar-viber-bot): GitHub Actions builds images, pushes them to GHCR, then SSH-runs `deploy.sh` on a DigitalOcean droplet. **The VPS never builds app images.**

| Piece | Path |
|---|---|
| Workflow | `.github/workflows/deploy.yml` |
| Server script | `deploy.sh` (repo root) |
| Production compose | `infrastructure/docker-compose.yml` |
| Env template | `.env.example` |

Local development still uses the root `docker-compose.yml` (`docker compose up --build`). That file builds from source and bind-mounts `./demo`. Production pulls `ghcr.io/valiobar/hint-<service>:${IMAGE_TAG}`.

## Images

| Compose service | GHCR image |
|---|---|
| `backend` | `ghcr.io/valiobar/hint-backend` |
| `admin` | `ghcr.io/valiobar/hint-admin` |
| `widget-cdn` | `ghcr.io/valiobar/hint-widget` |
| `demo` | `ghcr.io/valiobar/hint-demo` |
| `mongo` | public `mongo:7` |
| `chromadb` | public `chromadb/chroma:0.5.23` |

Tags: git SHA and `latest`. CI sets `IMAGE_TAG` to the commit SHA on the droplet `.env`.

Admin and demo **inline** `VITE_API_URL` and `VITE_WIDGET_CDN_URL` at **image build** time. Changing those URLs requires a new CI build (repo secrets), not an edit of the VPS `.env`.

## Host ports

| Service | Host port | Health check |
|---|---|---|
| Backend | `8000` | `GET /health` |
| Admin | `3001` | `GET /` |
| Widget CDN | `1337` | `GET /embed/v1/loader.js` |
| Demo | `3002` | `GET /` |
| Mongo / Chroma | not published | backend `/health` pings both |

Target droplet for this stack: **159.89.26.67**.

---

## Operator checklist (first deploy)

### 1. Droplet bootstrap (one-time)

SSH in with your own key (`~/.ssh/digitalocean`), not a key from this repo.

1. Install Docker Engine and the Compose plugin.
2. Clone this repo to a stable path (must contain `deploy.sh`, `infrastructure/`, and `.env`):

   ```bash
   git clone git@github.com:valiobar/hint.git ~/hint
   cd ~/hint
   ```

3. Create the server env file:

   ```bash
   cp .env.example .env
   # Set at least:
   #   JWT_SECRET          — long random string (not the example value)
   #   ADMIN_PASSWORD      — preset admin login
   #   ADMIN_EMAIL         — default admin@hint.local
   #   OPENAI_API_KEY      — required for upload / retrieve / chat / hint
   #   IMAGE_TAG=latest    — CI overwrites this with the git SHA
   #
   # Optional — forwarded into the backend container. Empty keeps the code defaults.
   #   ADMIN_UI_URL=http://<droplet>:3001
   #   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
   #   GOOGLE_REDIRECT_URI=http://<droplet>:8000/api/v1/auth/google/callback
   #   POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET
   #   POLAR_PRODUCT_ID_BASIC, POLAR_PRODUCT_ID_PRO
   #   POLAR_ENVIRONMENT=sandbox   # set production only after a signed sandbox webhook
   ```

   Production compose interpolates those Google and Polar keys from `.env` into the backend. `deploy.sh` does not require them. Empty values keep the code defaults: Google routes return 503, checkout / portal / `POST /api/v1/webhooks/polar` return 503, `POLAR_ENVIRONMENT` stays `sandbox`, and checkout plus Google send the browser back to `http://localhost:3001`.

   For Google and Polar on this droplet, set `ADMIN_UI_URL` to the public Admin origin (`http://<droplet>:3001`) and `GOOGLE_REDIRECT_URI` to `{public API origin}/api/v1/auth/google/callback` (the API is published on port 8000). Register the Polar webhook at `{public API origin}/api/v1/webhooks/polar`. Restart the backend after editing `.env` (`docker compose --env-file .env -f infrastructure/docker-compose.yml up -d`).

4. Add the **public** half of the deploy key to `~/.ssh/authorized_keys` for `DEPLOY_USER` (often `root`). The matching **private** key is a GitHub secret only — never commit it.

5. Log in to GHCR so `docker compose pull` can fetch private packages:

   ```bash
   echo "$GHCR_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin
   ```

   Use a PAT (or fine-grained token) with `read:packages`. Skip this if the `hint-*` packages are public.

6. Open (or firewall) host ports `8000`, `3001`, `1337`, `3002` if you are not putting a reverse proxy in front yet.

Do **not** run `docker compose up --build` on the droplet. First start happens via GitHub Actions after secrets are set, or manually with `IMAGE_TAG=<sha> bash deploy.sh` after images exist.

### 2. GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Example / notes |
|---|---|
| `DEPLOY_HOST` | `159.89.26.67` |
| `DEPLOY_USER` | `root` (or a user that can run Docker) |
| `DEPLOY_SSH_KEY` | Private key whose public key is on the droplet (e.g. contents of `~/.ssh/digitalocean`) |
| `DEPLOY_PATH` | `~/hint` (optional; defaults to `~/hint`) |
| `VITE_API_URL` | `http://159.89.26.67:8000` — baked into admin + demo images |
| `VITE_WIDGET_CDN_URL` | `http://159.89.26.67:1337` — baked into admin + demo images |

The application `.env` stays on the server. CI only updates `IMAGE_TAG`.

### 3. First deploy

Push to `main` or run the **Deploy** workflow (`workflow_dispatch`).

1. `test` job runs `pytest` in `backend/` and `pnpm test` in `admin/` and `widget/`. Build and deploy do not start if this job is red.
2. Matrix job builds/pushes `hint-backend`, `hint-admin`, `hint-widget`, `hint-demo` (`:sha` and `:latest`).
3. SSH job writes `IMAGE_TAG=<sha>` into the droplet `.env` and runs `bash deploy.sh`.
4. `deploy.sh` validates required env, `compose pull`, `compose up -d` (no build), then curls Hint health URLs. The script exits 1 if backend `/health` (or admin / widget CDN / demo) is not 200, so the GitHub Actions job is red.

After it is up:

| Service | URL |
|---|---|
| Backend | http://159.89.26.67:8000/health |
| Admin | http://159.89.26.67:3001 |
| Widget loader | http://159.89.26.67:1337/embed/v1/loader.js |
| Demo | http://159.89.26.67:3002/?company_id=cmp_… |

Create a company on **that** Admin, then open Demo with that `company_id`. A leftover `cmp_…` from another machine will 404.

### Later deploys

Every push to `main` repeats build → push → SSH → `deploy.sh`. To redeploy the current `main` without a new commit, use **Run workflow**.

CI does not `git pull` on the droplet (same as vbar). After compose or `deploy.sh` changes land on `main`, fast-forward the checkout once:

```bash
cd ~/hint
git pull --ff-only origin main
```

Manual on the droplet (images must already be in GHCR):

```bash
cd ~/hint
IMAGE_TAG=<sha-or-latest> bash deploy.sh
```

---

## Required `.env` on the VPS (`deploy.sh` validates)

| Variable | Why |
|---|---|
| `JWT_SECRET` | Admin JWT signing; must not be an example placeholder |
| `ADMIN_PASSWORD` | Empty disables login entirely |
| `OPENAI_API_KEY` | Upload / retrieve / chat / hint return 503 without it |

See `.env.example` for optional `LLM_*`, `EMBEDDING_MODEL`, cache, and `ADMIN_EMAIL`.

### Optional Google and Polar keys (forwarded; not validated)

`infrastructure/docker-compose.yml` passes these from `.env` into the backend. `deploy.sh` still validates only the three required variables above. Leave them empty to boot; fill them when self-serve signup and checkout should work.

| Variable | Default when unset | Why |
|---|---|---|
| `ADMIN_UI_URL` | `http://localhost:3001` | Google callback and Polar checkout `success_url`. Set to this droplet’s Admin origin (`http://<host>:3001`) or checkout/Google return to localhost |
| `GOOGLE_CLIENT_ID` | `""` | Empty → Google routes return 503 |
| `GOOGLE_CLIENT_SECRET` | `""` | OAuth code exchange |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/v1/auth/google/callback` | Must match the Google Cloud client. On this droplet: `http://<host>:8000/api/v1/auth/google/callback` |
| `POLAR_ACCESS_TOKEN` | `""` | Empty → checkout, portal, and `POST /api/v1/webhooks/polar` return 503 |
| `POLAR_WEBHOOK_SECRET` | `""` | Polar webhook signature. Register the endpoint at `{public API origin}/api/v1/webhooks/polar` |
| `POLAR_ENVIRONMENT` | `sandbox` | `sandbox` or `production`. Stay on sandbox until a signed sandbox webhook is observed |
| `POLAR_PRODUCT_ID_BASIC` | `""` | Checkout product for Basic |
| `POLAR_PRODUCT_ID_PRO` | `""` | Checkout product for Pro |

## Useful commands (on the droplet)

```bash
cd ~/hint
docker compose --env-file .env -f infrastructure/docker-compose.yml ps
docker compose --env-file .env -f infrastructure/docker-compose.yml logs -f backend
docker compose --env-file .env -f infrastructure/docker-compose.yml down
```
