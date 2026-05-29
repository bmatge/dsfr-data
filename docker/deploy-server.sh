#!/bin/bash

# Deploiement en mode SERVEUR (nginx + Express + MariaDB, auth JWT)
# Usage: ./docker/deploy-server.sh (depuis la racine du repo)
#
# Utilise docker/Dockerfile.db + docker/nginx-db.conf + docker/docker-compose.db.yml
# Les donnees MariaDB sont persistees dans le volume Docker "mariadb-data"

set -e

# Toujours executer depuis la racine du repo
cd "$(dirname "$0")/.."

COMPOSE="docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.db.yml"

# Auto-merge des fichiers override locaux. Avec des `-f` explicites, Docker
# Compose desactive l'auto-load de docker-compose.override.yml ; on le
# remet manuellement pour que les surcharges d'un operateur (ports, env,
# labels Traefik supplementaires...) soient prises en compte.
for OVERRIDE in docker-compose.override.yml docker/docker-compose.override.yml; do
  if [ -f "$OVERRIDE" ]; then
    COMPOSE="$COMPOSE -f $OVERRIDE"
    echo -e "${GREEN}Override detecte: $OVERRIDE${NC}"
  fi
done

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Mode: SERVEUR (nginx + Express + MariaDB)${NC}"
echo ""

# Generer .env avec les secrets si absents
if [ ! -f .env ]; then
  echo -e "${YELLOW}Generation du fichier .env avec les secrets...${NC}"
  echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
  echo "DB_PASSWORD=$(openssl rand -hex 16)" >> .env
  echo "DB_ROOT_PASSWORD=$(openssl rand -hex 16)" >> .env
  echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
  echo -e "${GREEN}.env cree avec JWT_SECRET, DB_PASSWORD, DB_ROOT_PASSWORD, ENCRYPTION_KEY${NC}"
else
  # Ajouter les secrets manquants au .env existant
  if ! grep -q "JWT_SECRET" .env; then
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
    echo -e "${GREEN}JWT_SECRET ajoute${NC}"
  fi
  if ! grep -q "DB_PASSWORD" .env; then
    echo "DB_PASSWORD=$(openssl rand -hex 16)" >> .env
    echo -e "${GREEN}DB_PASSWORD ajoute${NC}"
  fi
  if ! grep -q "DB_ROOT_PASSWORD" .env; then
    echo "DB_ROOT_PASSWORD=$(openssl rand -hex 16)" >> .env
    echo -e "${GREEN}DB_ROOT_PASSWORD ajoute${NC}"
  fi
  if ! grep -q "ENCRYPTION_KEY" .env; then
    echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
    echo -e "${GREEN}ENCRYPTION_KEY ajoute${NC}"
  fi
fi

# Variables requises au build front (cf. issue #168 PR-3). Generees a partir
# de APP_DOMAIN pour preserver le deploiement de reference. Un opérateur tiers
# qui veut un domaine arbitraire les fixe lui-meme avant de lancer ce script.
DEFAULT_DOMAIN=$(grep -E "^APP_DOMAIN=" .env | cut -d= -f2- || echo "chartsbuilder.matge.com")
DEFAULT_DOMAIN=${DEFAULT_DOMAIN:-chartsbuilder.matge.com}
if ! grep -q "^VITE_PROXY_URL=" .env; then
  echo "VITE_PROXY_URL=https://${DEFAULT_DOMAIN}" >> .env
  echo -e "${GREEN}VITE_PROXY_URL=https://${DEFAULT_DOMAIN} ajoute${NC}"
fi
if ! grep -q "^APP_URL=" .env; then
  echo "APP_URL=https://${DEFAULT_DOMAIN}" >> .env
  echo -e "${GREEN}APP_URL=https://${DEFAULT_DOMAIN} ajoute${NC}"
fi

echo -e "${YELLOW}1/5${NC} Mise a jour du code..."
git pull

# Hash du commit deploye, injecte dans le footer (app-footer). Calcule ici
# car .git est exclu du contexte Docker (.dockerignore) ; passe au build via
# le build-arg DSFR_DATA_COMMIT (cf. docker-compose*.yml + Dockerfile*).
export DSFR_DATA_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "")

echo -e "${YELLOW}2/5${NC} Build de l'image (sans cache)..."
$COMPOSE build --no-cache

echo -e "${YELLOW}3/5${NC} Arret des conteneurs..."
$COMPOSE down

# Depuis PR #113, nginx tourne en non-root (uid 101). Les volumes nommes
# crees avant ce changement ont un ownership root:root qui masque le chown
# fait dans le Dockerfile. Idempotent : chown -R 101:101 le volume beacon-logs
# avant `up`. Safe aussi sur un volume fresh ou un deploiement from scratch.
echo -e "${YELLOW}4/5${NC} Fix permissions volumes nginx non-root..."
BEACON_VOL=$(docker volume ls --format '{{.Name}}' | grep -E '(^|_)beacon-logs$' | head -1 || true)
if [ -n "$BEACON_VOL" ]; then
  echo "  chown -R 101:101 sur $BEACON_VOL"
  docker run --rm -v "${BEACON_VOL}:/data" --user root alpine:3 \
    chown -R 101:101 /data
else
  echo -e "  ${YELLOW}(aucun volume beacon-logs existant — sera cree au up)${NC}"
fi

echo -e "${YELLOW}5/5${NC} Demarrage des conteneurs..."
$COMPOSE up -d

echo ""
echo -e "${GREEN}Deploiement serveur termine !${NC}"
echo ""
echo "Status:"
$COMPOSE ps
echo ""
echo "URL: https://${APP_DOMAIN:-chartsbuilder.matge.com}"
echo ""
echo "Le premier utilisateur enregistre recevra le role admin."
echo "Inscription: cliquer sur 'Connexion' dans le header de l'app."
