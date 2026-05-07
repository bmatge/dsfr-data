# Deploiement en production

Ce guide couvre le deploiement de la **webapp dsfr-data** (apps Builder, Builder IA, Sources, Playground, Favoris, Dashboard, Monitoring, Pipeline Helper, Admin) sur un serveur Docker. Pour une integration cote consommateur (utilisation des Web Components dans une page tierce), voir le [README](../README.md#installation).

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Choix du mode : statique ou serveur](#choix-du-mode--statique-ou-serveur)
- [Prerequis VPS](#prerequis-vps)
- [Variables d'environnement](#variables-denvironnement)
- [Premier deploiement](#premier-deploiement)
  - [Mode statique](#mode-statique)
  - [Mode serveur](#mode-serveur)
- [Mise a jour](#mise-a-jour)
- [Migrations de schema MariaDB](#migrations-de-schema-mariadb)
- [Sauvegarde et restauration](#sauvegarde-et-restauration)
- [Diagnostic et logs](#diagnostic-et-logs)
- [Migration SQLite -> MariaDB](#migration-sqlite---mariadb)
- [Checklist securite](#checklist-securite)
- [Pieges connus](#pieges-connus)

## Vue d'ensemble

L'image Docker construit toutes les apps Vite, copie le hub HTML et les bundles `dist/` de la lib, puis sert tout via **nginx** (non-root, port 8080). En mode serveur, un **Express** (port 3002) et une **MariaDB 11** sont ajoutes pour persister sources, connexions, favoris, dashboards et auth.

Le HTTPS et la terminaison TLS sont **delegues a Traefik** : l'image n'expose pas de port public, elle s'attache au reseau Docker externe `ecosystem-network` ou Traefik gere les certificats Let's Encrypt et la redirection HTTP -> HTTPS via les labels du `docker-compose.yml`.

## Choix du mode : statique ou serveur

| Critere | Mode statique | Mode serveur |
|---|---|---|
| Persistance | localStorage (par navigateur) | MariaDB (multi-utilisateurs, multi-appareils) |
| Authentification | Aucune | JWT + bcrypt + sessions revocables |
| Partage de favoris/sources | Non | Oui (utilisateurs, groupes, lien public anonyme) |
| Cle API stockage | localStorage chiffre par cle pinned | AES-256-GCM cote serveur |
| Builder IA | Token client | Token serveur partage (`IA_DEFAULT_TOKEN`) |
| Conteneurs | 1 (nginx + MCP) | 3 (nginx, Express, MariaDB) |
| Script | `docker/deploy.sh` | `docker/deploy-server.sh` |

**Recommendation** : pour une demo individuelle ou un usage interne par 1 utilisateur, le mode statique suffit. Pour un environnement multi-utilisateurs, partages, audit, choisir le mode serveur.

## Prerequis VPS

- **Docker** 25+ et **Docker Compose** v2 (le `docker compose ...` plugin, pas le binaire `docker-compose` legacy).
- **Traefik** deja en place sur le serveur, configure avec :
  - Reseau Docker externe `ecosystem-network` (a creer si absent : `docker network create ecosystem-network`).
  - EntryPoints `web` (80) et `websecure` (443) avec `redirect-to-https`.
  - Resolver Let's Encrypt nomme `letsencrypt` (ou adapter le label dans [`docker-compose.yml`](../docker/docker-compose.yml)).
  - Middleware nomme `chartsbuilder-headers@file` (security headers) et options TLS `anssi-strict@file`. Si tu n'as pas ces fichiers, retire les labels correspondants ou copie [`docker/security-headers.conf`](../docker/security-headers.conf) dans la conf Traefik dynamique.
- **DNS** : un enregistrement A/AAAA pointant `${APP_DOMAIN}` vers l'IP publique du VPS.
- **Mode serveur uniquement** : un MX/SMTP accessible si tu veux les emails de verification (par defaut le compose tente de joindre un container `mailserver` sur `ecosystem-network`).

## Variables d'environnement

Le fichier [`.env.example`](../.env.example) liste toutes les variables. Les principales :

| Variable | Mode | Description | Defaut |
|---|---|---|---|
| `APP_DOMAIN` | les 2 | Domaine public (Traefik) | `chartsbuilder.matge.com` |
| `COMPOSE_PROJECT_NAME` | les 2 | Prefix Docker (volumes, conteneurs) | nom du dossier git |
| `VITE_PROXY_URL` | les 2 | URL du proxy CORS injectee dans les bundles a la build | `https://${APP_DOMAIN}` |
| `VITE_LIB_URL` | les 2 | Source des bundles dans le code genere : `jsdelivr`, `unpkg`, `self`, ou URL custom | `jsdelivr` |
| `JWT_SECRET` | serveur | HMAC pour les tokens JWT, 32 bytes hex | auto-genere |
| `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD` | serveur | Identifiants MariaDB | `dsfr_data` / generes |
| `DB_NAME` | serveur | Nom de la base | `dsfr_data` |
| `ENCRYPTION_KEY` | serveur | AES-256-GCM, 32 bytes hex (chiffrement des `connections.api_key_encrypted`) | auto-genere |
| `CSRF_SECRET` | serveur | HMAC pour les tokens CSRF | fallback `ENCRYPTION_KEY` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `APP_URL` | serveur | Envoi d'emails de verification / reset | mailserver interne |
| `IA_DEFAULT_TOKEN`, `IA_DEFAULT_API_URL`, `IA_DEFAULT_MODEL` | les 2 | Cle Albert partagee cote serveur (Builder IA fonctionne sans config utilisateur) | `albert-large` |

**Securite** : `JWT_SECRET`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `ENCRYPTION_KEY` sont **generes automatiquement** par `deploy-server.sh` s'ils manquent dans `.env`. Une fois generes, ne JAMAIS les changer en place : `JWT_SECRET` invalide les sessions actives, `ENCRYPTION_KEY` rend les cles API stockees illisibles. Les sauvegarder hors du serveur.

## Premier deploiement

### Mode statique

```bash
# Sur le VPS
git clone https://github.com/bmatge/dsfr-data.git
cd dsfr-data

# Reseau Traefik (si pas deja en place)
docker network create ecosystem-network 2>/dev/null || true

# Configuration minimale
cp .env.example .env
# Editer APP_DOMAIN au besoin, puis :

./docker/deploy.sh
```

Un seul conteneur tourne (`chartsbuilder`), nginx ecoute en interne sur le port 8080, Traefik route le trafic public.

### Mode serveur

```bash
# Sur le VPS
git clone https://github.com/bmatge/dsfr-data.git
cd dsfr-data

docker network create ecosystem-network 2>/dev/null || true

# Configuration : seul APP_DOMAIN doit etre mis a jour, les secrets sont generes
cp .env.example .env
# Editer APP_DOMAIN

./docker/deploy-server.sh
```

Le script :

1. Genere les secrets manquants (`JWT_SECRET`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `ENCRYPTION_KEY`).
2. `git pull` pour rester a jour si le repo etait deja clone.
3. Build de l'image avec `--no-cache`.
4. Down + up des conteneurs (`mariadb`, `chartsbuilder`).
5. Fixe les permissions du volume `beacon-logs` pour nginx non-root (uid 101).

Le **premier utilisateur enregistre** recoit automatiquement le role `admin`. Cliquer sur "Connexion" dans le header de l'app pour creer le compte.

Les migrations de schema MariaDB tournent automatiquement au demarrage du serveur Express (cf. section ci-dessous).

## Mise a jour

Pour deployer une nouvelle version :

```bash
cd dsfr-data
./docker/deploy-server.sh   # ou ./docker/deploy.sh en mode statique
```

Le script `git pull`, rebuild l'image et redemarre les conteneurs. Les volumes (`mariadb-data`, `beacon-logs`) sont preserves.

## Migrations de schema MariaDB

Le serveur Express applique automatiquement les migrations `v2 -> v7` au demarrage (idempotent : check de l'existence des colonnes / index avant chaque ALTER). Voir [`server/src/db/database.ts`](../server/src/db/database.ts) pour le detail des migrations.

Verifier les versions appliquees :

```bash
docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.db.yml \
  exec -T mariadb sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MYSQL_DATABASE" \
    -e "SELECT * FROM schema_version ORDER BY version;"'
```

Si une migration echoue (rare — les migrations sont en transaction quand le SGBD le permet), les logs du conteneur server contiennent le message d'erreur :

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.db.yml \
  logs --tail=300 chartsbuilder | grep -E "\[db\]|migration|Migration"
```

## Sauvegarde et restauration

### Sauvegarde

```bash
# Dump SQL
docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.db.yml \
  exec -T mariadb sh -c 'mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --quick "$MYSQL_DATABASE"' \
  > backup-$(date +%Y%m%d).sql

# Volume complet (incluant data + index binaires)
docker run --rm -v dsfr-data_mariadb-data:/data -v "$(pwd):/backup" alpine \
  tar czf "/backup/mariadb-data-$(date +%Y%m%d).tar.gz" -C /data .
```

Adapter le nom du volume si `COMPOSE_PROJECT_NAME` est defini.

### Restauration

```bash
# Depuis un dump SQL
docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.db.yml \
  exec -T mariadb sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MYSQL_DATABASE"' < backup-20260420.sql
```

A faire sur une base **vide** (les migrations creent les tables et le dump les remplit).

## Diagnostic et logs

```bash
# Statut des conteneurs
docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.db.yml ps

# Logs en suivi (tous services)
docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.db.yml logs -f

# Logs nginx + Express
docker compose ... logs --tail=200 chartsbuilder

# Logs MariaDB
docker compose ... logs --tail=200 mariadb

# Healthcheck MariaDB
docker compose ... ps mariadb   # colonne STATUS doit afficher "healthy"
```

L'app expose un endpoint sante sur `/api/health` (mode serveur) :

```bash
curl https://${APP_DOMAIN}/api/health
# {"status":"ok","mode":"database"}
```

## Migration SQLite -> MariaDB

Pour migrer une installation pre-MariaDB (ancien backend SQLite, < v0.4.0) :

```bash
# 1. Recuperer le fichier SQLite depuis l'ancien conteneur
docker cp <old-container>:/app/server/data/dsfr-data.db ./dsfr-data.db

# 2. Lancer le script de migration (le serveur cible doit etre demarre)
DB_PASSWORD=xxx ENCRYPTION_KEY=xxx \
  npx tsx scripts/migrate-sqlite-to-mariadb.ts --sqlite ./dsfr-data.db
```

Voir [`scripts/migrate-sqlite-to-mariadb.ts`](../scripts/migrate-sqlite-to-mariadb.ts) pour les options. Le script preserve les UUIDs, les owners, les shares et les chiffrements de cle API (re-chiffrement avec la nouvelle `ENCRYPTION_KEY`).

## Checklist securite

- [ ] HTTPS termine par Traefik avec un cert valide (`tls.certresolver=letsencrypt`).
- [ ] Options TLS `anssi-strict@file` actives (TLS 1.2+ uniquement, ciphers ANSSI).
- [ ] Headers de securite ajoutes par le middleware Traefik `chartsbuilder-headers@file` ou via [`docker/security-headers.conf`](../docker/security-headers.conf) (HSTS, CSP, X-Frame-Options, Permissions-Policy).
- [ ] `.env` n'est PAS commite (`.gitignore` le couvre).
- [ ] `JWT_SECRET`, `DB_*_PASSWORD`, `ENCRYPTION_KEY` sauvegardes hors du serveur (perte = perte de l'acces aux comptes ET aux cles API chiffrees).
- [ ] Sauvegarde MariaDB programmee (cron + dump quotidien hors-site).
- [ ] `IA_DEFAULT_TOKEN` (si utilise) jamais commit, jamais affiche dans les logs : c'est une cle Albert.
- [ ] Reverse proxy Traefik a jour (CVEs reverse-proxy = critiques).
- [ ] Conteneur nginx tourne **non-root** (uid 101) — verifie via `docker inspect`. C'est le defaut depuis [PR #113](https://github.com/bmatge/dsfr-data/pull/113).
- [ ] CSP testee en pre-production avec un site qui embarque un widget genere (sources publiques).

Voir aussi [docs/SECURITY.md](SECURITY.md) (modele de menace, signalement de vulnerabilites) et [docs/security-baseline.md](security-baseline.md) (DAST ZAP, SCA Trivy, SAST CodeQL/Semgrep).

## Pieges connus

### Le projet Docker s'appelait `datasource-charts-webcomponents`

Le repo a ete renomme `dsfr-data` mais le projet Docker en prod s'appelle encore `datasource-charts-webcomponents`. Pour reutiliser les volumes existants apres migration de repo :

```bash
echo "COMPOSE_PROJECT_NAME=datasource-charts-webcomponents" >> .env
```

Sinon Docker creera de nouveaux volumes vides et les donnees existantes resteront orphelines.

### Cache d'IP Traefik apres recreation de conteneur

Si tu recrees les conteneurs (par exemple apres `docker network rm` + recreation) et que les IPs internes changent, Traefik peut garder en cache l'ancienne IP et renvoyer 502. Solution : `docker restart <traefik-container>` apres le `up -d`.

### Volume `beacon-logs` pre-PR #113

Avant la migration vers nginx non-root (PR #113), le volume `beacon-logs` etait detenu par root. Apres la mise a jour, nginx-unprivileged (uid 101) ne peut plus y ecrire. Le script `deploy-server.sh` corrige automatiquement les permissions :

```bash
docker run --rm -v "${BEACON_VOL}:/data" --user root alpine:3 chown -R 101:101 /data
```

Si tu deploies manuellement (sans le script), execute cette commande une fois.

### `mysql` n'existe pas dans l'image MariaDB recente

Les images `mariadb:11` n'incluent que le binaire `mariadb`, pas `mysql`. Toutes les commandes `mysql -u... -p...` doivent etre `mariadb -u... -p...`. Et les variables shell `${DB_USER}` ne sont **pas** disponibles dans l'environnement de la session SSH par defaut — utilise `${MARIADB_ROOT_PASSWORD}` qui est defini DANS le conteneur :

```bash
docker compose ... exec -T mariadb sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e "..."'
```

### Bundles `/dist/*` non-hashes : politique de cache

Les bundles servis sur `https://${APP_DOMAIN}/dist/*.js` (lib `dsfr-data` self-hostee) ont des **noms stables** entre versions. Sans cache-busting, un correctif live n'etait pas servi aux visiteurs deja venus. La conf nginx les sert avec `Cache-Control: no-cache, must-revalidate` (revalidation systematique via ETag, pas de re-telechargement si inchange). Voir [`packages/core/CHANGELOG.md` v0.7.0](../packages/core/CHANGELOG.md) et [ADR-008](https://github.com/bmatge/dsfr-data/blob/main/docs/ADR/ADR-008-politique-de-cache-http-pour-bundles-non-hashes.md) (si l'ADR a ete migree dans le repo).
