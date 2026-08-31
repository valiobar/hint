#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load server .env if present (PUBLIC_HOST, VITE_*, secrets for compose)
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "==> Deploying $(git rev-parse --short HEAD) on $(hostname)"
git fetch origin main
git reset --hard origin/main

if [[ -n "${PUBLIC_HOST:-}" ]]; then
  echo "==> Rewriting demo embed hosts → ${PUBLIC_HOST}"
  # Linux VPS (GNU sed); -i without backup
  sed -i \
    -e "s#http://localhost:1337#http://${PUBLIC_HOST}:1337#g" \
    -e "s#http://localhost:8000#http://${PUBLIC_HOST}:8000#g" \
    demo/index.html
fi

docker compose up -d --build
docker compose ps
curl -sf "http://127.0.0.1:8000/health" | tee /dev/stderr
echo "==> Deploy OK"
