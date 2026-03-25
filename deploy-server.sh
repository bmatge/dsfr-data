#!/bin/bash

# Deploiement en mode SERVEUR (nginx + Express + MariaDB, auth JWT)
# Usage: ./deploy-server.sh
#
# Utilise Dockerfile.db + nginx-db.conf + docker-compose.db.yml
# Les donnees MariaDB sont persistees dans le volume Docker "mariadb-data"

set -e

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

echo -e "${YELLOW}1/4${NC} Arret des conteneurs..."
docker compose -f docker-compose.yml -f docker-compose.db.yml down

echo -e "${YELLOW}2/4${NC} Mise a jour du code..."
git pull

echo -e "${YELLOW}3/4${NC} Build de l'image (sans cache)..."
docker compose -f docker-compose.yml -f docker-compose.db.yml build --no-cache

echo -e "${YELLOW}4/4${NC} Demarrage des conteneurs..."
docker compose -f docker-compose.yml -f docker-compose.db.yml up -d

echo ""
echo -e "${GREEN}Deploiement serveur termine !${NC}"
echo ""
echo "Status:"
docker compose -f docker-compose.yml -f docker-compose.db.yml ps
echo ""
echo "URL: https://${APP_DOMAIN:-chartsbuilder.matge.com}"
echo ""
echo "Le premier utilisateur enregistre recevra le role admin."
echo "Inscription: cliquer sur 'Connexion' dans le header de l'app."
