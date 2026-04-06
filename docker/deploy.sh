#!/bin/bash

# Deploiement en mode STATIQUE (nginx seul, localStorage)
# Usage: ./docker/deploy.sh (depuis la racine du repo)

set -e

# Toujours executer depuis la racine du repo
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Mode: STATIQUE (nginx seul, localStorage)${NC}"
echo ""

echo -e "${YELLOW}1/4${NC} Arret des conteneurs..."
docker compose --env-file .env -f docker/docker-compose.yml down

echo -e "${YELLOW}2/4${NC} Mise a jour du code..."
git pull

echo -e "${YELLOW}3/4${NC} Build de l'image (sans cache)..."
docker compose --env-file .env -f docker/docker-compose.yml build --no-cache

echo -e "${YELLOW}4/4${NC} Demarrage des conteneurs..."
docker compose --env-file .env -f docker/docker-compose.yml up -d

echo ""
echo -e "${GREEN}Deploiement statique termine !${NC}"
echo ""
echo "Status:"
docker compose --env-file .env -f docker/docker-compose.yml ps
echo ""
echo "URL: https://${APP_DOMAIN:-chartsbuilder.matge.com}"
