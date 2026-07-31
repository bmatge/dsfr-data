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

# Variable requise au build front (cf. issue #168 PR-3). Generee a partir
# de APP_DOMAIN si .env existe deja sans cette ligne, sinon cree un .env
# minimal pour le mode statique.
if [ ! -f .env ]; then
  : > .env
fi
DEFAULT_DOMAIN=$(grep -E "^APP_DOMAIN=" .env | cut -d= -f2- || echo "chartsbuilder.miweb.run")
DEFAULT_DOMAIN=${DEFAULT_DOMAIN:-chartsbuilder.miweb.run}
if ! grep -q "^VITE_PROXY_URL=" .env; then
  echo "VITE_PROXY_URL=https://${DEFAULT_DOMAIN}" >> .env
  echo -e "${GREEN}VITE_PROXY_URL=https://${DEFAULT_DOMAIN} ajoute${NC}"
fi

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
echo "URL: https://${APP_DOMAIN:-chartsbuilder.miweb.run}"
