#!/usr/bin/env bash
# Déploiement agnostique — mode SERVEUR/DB (nginx + Express + MariaDB, auth JWT,
# données chiffrées). C'est le mode de CE projet (équivalent agnostique de
# docker/deploy-server.sh, mais sans réseau/domaine/hébergeur codé en dur, et
# sans réutilisation des volumes de l'ancien nom de projet).
#
# Lancé par l'orchestrateur `spawn`, qui exporte avant l'appel :
#   APP_NAME, DOMAIN        → routage Traefik (labels du compose.yml)
#   MAIL_HOST, MAIL_PORT    → SMTP (si déployé avec --mail dev|real)
#   COMPOSE_FILE            → compose.yml [+ .spawn-override.yml réseau mail]
#
# Idempotent : les secrets persistants ne sont générés qu'une seule fois.
#
# Pour le déploiement legacy local (ancien `ecosystem-network`, dual-mode
# statique/serveur, réutilisation des volumes historiques via
# COMPOSE_PROJECT_NAME), utiliser docker/deploy.sh ou docker/deploy-server.sh.
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

APP_NAME="${APP_NAME:-chartsbuilder}"
DOMAIN="${DOMAIN:-chartsbuilder.localhost}"
# Domaine parent (chartsbuilder.miweb.run → miweb.run) pour l'adresse From
# d'envoi, alignée sur la signature DKIM du smarthost (cf. ADR-039).
PARENT_DOMAIN="${DOMAIN#*.}"
export COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"

# --- .env : secrets persistants + variables dérivées du domaine ------------
# Générés une seule fois. NE JAMAIS les régénérer en place : JWT_SECRET
# invalide les sessions, ENCRYPTION_KEY rend les clés API stockées illisibles.
[ -f .env ] || : > .env
ensure() { # $1=clé $2=valeur — n'écrit que si la clé est absente
  if ! grep -qE "^$1=" .env; then
    printf '%s=%s\n' "$1" "$2" >> .env
    echo -e "  ${GREEN}+ $1${NC}"
  fi
}
echo -e "${YELLOW}Secrets & config (.env)${NC}"
ensure JWT_SECRET       "$(openssl rand -hex 32)"
ensure DB_PASSWORD      "$(openssl rand -hex 16)"
ensure DB_ROOT_PASSWORD "$(openssl rand -hex 16)"
ensure ENCRYPTION_KEY   "$(openssl rand -hex 32)"
# Dérivées du domaine fourni par le contrat (build-time + runtime).
ensure VITE_PROXY_URL   "https://${DOMAIN}"
ensure APP_URL          "https://${DOMAIN}"
ensure SMTP_FROM        "noreply@${PARENT_DOMAIN}"
ensure TRUST_PROXY      "2"   # Traefik puis nginx du conteneur

# Hash du commit déployé (footer). .git exclu du contexte Docker → passé en
# build-arg via le compose.
export DSFR_DATA_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo '')"

COMPOSE="docker compose -p ${APP_NAME} --env-file .env"

echo -e "${YELLOW}Build${NC} — app=${APP_NAME} domain=${DOMAIN} (${COMPOSE_FILE})"
$COMPOSE build

echo -e "${YELLOW}Up${NC}"
$COMPOSE up -d

echo ""
$COMPOSE ps
echo ""
echo -e "${GREEN}Déploiement serveur terminé : https://${DOMAIN}${NC}"
echo "Le premier compte inscrit reçoit le rôle admin."
