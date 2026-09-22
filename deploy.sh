#!/bin/bash

# Server-side deploy script for Hint (Compose-on-VPS)
# Expects prebuilt images in GHCR; never builds on the server.
# Usage: IMAGE_TAG=<sha> bash deploy.sh   (or rely on IMAGE_TAG in .env)

set -e

echo "Starting deployment..."

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

COMPOSE_FILE="infrastructure/docker-compose.yml"
COMPOSE=(docker compose --env-file .env -f "$COMPOSE_FILE")

# Required variables in root .env (must be set; no insecure defaults)
REQUIRED_VARS=(
  JWT_SECRET
  ADMIN_PASSWORD
  OPENAI_API_KEY
)

if [ ! -f .env ]; then
  echo -e "${RED}.env file not found!${NC}"
  echo "Copy the template and fill in values: cp .env.example .env"
  exit 1
fi

# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
source .env
set +a

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo -e "${RED}.env is missing required variables:${NC}"
  for var in "${MISSING[@]}"; do
    echo "  - $var"
  done
  echo "See .env.example for the full contract."
  exit 1
fi

if [ "$JWT_SECRET" = "dev-insecure-secret-change-me" ] || [ "$JWT_SECRET" = "change-me-to-a-long-random-string" ]; then
  echo -e "${RED}JWT_SECRET is still an insecure example value. Set a long random secret.${NC}"
  exit 1
fi

if ! command -v docker &> /dev/null; then
  echo -e "${RED}Docker is not installed!${NC}"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo -e "${RED}Docker Compose plugin is not installed!${NC}"
  exit 1
fi

echo -e "${GREEN}Docker and Docker Compose are installed${NC}"
echo "IMAGE_TAG=${IMAGE_TAG:-latest}"

check_service_health() {
  local service=$1
  local url=$2
  local max_attempts=30
  local attempt=1

  echo -n "Waiting for $service to be healthy..."
  while [ $attempt -le $max_attempts ]; do
    if curl -f -s "$url" > /dev/null 2>&1; then
      echo -e " ${GREEN}ok${NC}"
      return 0
    fi
    echo -n "."
    sleep 2
    attempt=$((attempt + 1))
  done

  echo -e " ${RED}failed${NC}"
  echo -e "${RED}Service $service failed to become healthy${NC}"
  return 1
}

echo ""
echo -e "${YELLOW}Pulling images...${NC}"
"${COMPOSE[@]}" pull

echo ""
echo -e "${YELLOW}Starting services (no build)...${NC}"
"${COMPOSE[@]}" up -d

echo ""
echo -e "${GREEN}Services started${NC}"
echo "Waiting for services to be ready..."
sleep 10

echo ""
echo -e "${YELLOW}Checking service health...${NC}"
failed=0
check_service_health "Backend" "http://localhost:8000/health" || failed=1
check_service_health "Admin" "http://localhost:3001/" || failed=1
check_service_health "Widget CDN" "http://localhost:1337/embed/v1/loader.js" || failed=1
check_service_health "Demo" "http://localhost:3002/" || failed=1

echo ""
echo -e "${GREEN}Running containers:${NC}"
"${COMPOSE[@]}" ps

if [ "$failed" -ne 0 ]; then
  echo ""
  echo -e "${RED}Deployment failed: one or more health checks did not pass.${NC}"
  echo "Backend /health must return 200. Check: docker compose --env-file .env -f $COMPOSE_FILE logs"
  exit 1
fi

echo ""
echo -e "${GREEN}Deployment complete${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:     docker compose --env-file .env -f $COMPOSE_FILE logs -f"
echo "  Stop services: docker compose --env-file .env -f $COMPOSE_FILE down"
echo "  Restart:       docker compose --env-file .env -f $COMPOSE_FILE restart"
echo ""
echo "Service URLs:"
echo "  Backend:    http://localhost:8000/health"
echo "  Admin:      http://localhost:3001"
echo "  Widget CDN: http://localhost:1337/embed/v1/loader.js"
echo "  Demo:       http://localhost:3002"
