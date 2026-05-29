# Deploiement en production

Ce guide couvre le deploiement de la **webapp dsfr-data** (apps Builder, Builder IA, Sources, Playground, Favoris, Dashboard, Monitoring, Pipeline Helper, Admin) sur un serveur Docker. Pour une integration cote consommateur (utilisation des Web Components dans une page tierce), voir le [README](../README.md#installation).

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Choix du mode : statique ou serveur](#choix-du-mode--statique-ou-serveur)
- [Prerequis VPS](#prerequis-vps)
- [Variables d'environnement](#variables-denvironnement)
- [Reverse proxy](#reverse-proxy)
  - [Option A : exposer le port directement](#option-a--exposer-le-port-directement-sans-reverse-proxy)
  - [Option B : Traefik](#option-b--traefik-config-fournie-en-exemple)
  - [Option C : Caddy](#option-c--caddy)
  - [Option D : nginx en frontal](#option-d--nginx-en-frontal)
- [Configuration self-hosted](#configuration-self-hosted)
  - [Scenario A : deploiement de reference](#scenario-a--deploiement-de-reference-traefik-integre)
  - [Scenario B : derriere un proxy d'entreprise](#scenario-b--derriere-un-proxy-dentreprise)
  - [Scenario C : reverse externe gerant les routes de proxying](#scenario-c--reverse-externe-gerant-les-routes-de-proxying)
  - [Scenario D : app interne + widgets publics (separation runtime/embed)](#scenario-d--app-interne--widgets-publics-separation-runtimeembed)
  - [Scenario E : authentification derriere un reverse proxy externe](#scenario-e--authentification-derriere-un-reverse-proxy-externe-mode-serveur)
  - [Contrat des chemins de proxying](#contrat-des-chemins-de-proxying)
- [Premier deploiement](#premier-deploiement)
  - [Mode statique](#mode-statique)
  - [Mode serveur](#mode-serveur)
- [Mise a jour](#mise-a-jour)
- [Migrations de schema MariaDB](#migrations-de-schema-mariadb)
- [Sauvegarde et restauration](#sauvegarde-et-restauration)
- [Diagnostic et logs](#diagnostic-et-logs)
- [Validation post-deploiement](#validation-post-deploiement)
- [Migration SQLite -> MariaDB](#migration-sqlite---mariadb)
- [Checklist securite](#checklist-securite)
- [Pieges connus](#pieges-connus)

## Vue d'ensemble

L'image Docker construit toutes les apps Vite, copie le hub HTML et les bundles `dist/` de la lib, puis sert tout via **nginx** (non-root, port `8080` en interne). En mode serveur, un **Express** (port `3002` en interne) et une **MariaDB 11** sont ajoutes pour persister sources, connexions, favoris, dashboards et auth.

Le conteneur **n'expose pas de port public** : la terminaison TLS et le HTTPS doivent etre faits par un **reverse proxy** en amont (Traefik, Caddy, nginx, HAProxy…) ou en publiant directement le port `8080` derriere un load balancer. Le repo fournit en exemple un `docker-compose.yml` avec des labels Traefik (cf. [Reverse proxy](#reverse-proxy)) — ces labels sont a adapter ou retirer selon ton setup.

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
- **Reverse proxy avec HTTPS** termine en amont du conteneur (Traefik, Caddy, nginx, HAProxy, ALB…). Voir [Reverse proxy](#reverse-proxy) pour les exemples.
- **DNS** : un enregistrement A/AAAA pointant `${APP_DOMAIN}` vers l'IP publique du serveur.
- **Mode serveur uniquement** :
  - Un **SMTP accessible** si tu veux activer les emails de verification / reset (cf. variables `SMTP_*`). Sans SMTP configure, l'inscription reste fonctionnelle mais l'utilisateur doit etre verifie a la main en DB ou via la route admin.
  - Au moins **256 Mo de RAM disponibles** pour MariaDB, plus le runtime Node (~150 Mo).

## Variables d'environnement

Le fichier [`.env.example`](../.env.example) liste toutes les variables. Les principales :

| Variable | Mode | Description | Defaut |
|---|---|---|---|
| `APP_DOMAIN` | les 2 | Domaine public sur lequel l'app sera accessible | `chartsbuilder.matge.com` |
| `COMPOSE_PROJECT_NAME` | les 2 | Prefix Docker (volumes, conteneurs) | nom du dossier git |
| `VITE_PROXY_URL` | les 2 **[REQUISE au build]** | URL du proxy CORS injectee dans les bundles a la compilation. Generee automatiquement par `deploy.sh` / `deploy-server.sh` depuis `APP_DOMAIN`. Contourner avec `DSFR_DATA_DEV_BUILD=1` (la build n'echoue pas si absent). | aucune |
| `VITE_LIB_URL` | les 2 | Source du JS de la lib dans le code genere : `jsdelivr`, `unpkg`, `self`, ou URL custom | `jsdelivr` |
| `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` | les 2 (build + runtime) | Proxy reseau pour `npm ci`/`apk add` au build, ET pour les appels sortants des services Node au runtime (ia-default-server, mcp-server) via undici `EnvHttpProxyAgent`. `NO_PROXY` doit lister les hostnames Docker internes (`mariadb`, `mailserver`). | non configure |
| `JWT_SECRET` | serveur | HMAC pour les tokens JWT, 32 bytes hex | auto-genere |
| `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD` | serveur | Identifiants MariaDB | `dsfr_data` / generes |
| `DB_NAME` | serveur | Nom de la base | `dsfr_data` |
| `ENCRYPTION_KEY` | serveur | AES-256-GCM, 32 bytes hex (chiffrement des `connections.api_key_encrypted`) | auto-genere |
| `CSRF_SECRET` | serveur | HMAC pour les tokens CSRF | fallback `ENCRYPTION_KEY` |
| `APP_URL` | serveur **[REQUISE en mode serveur]** | URL publique de l'app, utilisee dans les emails de verification / reset (ex. `https://mondomaine.gouv.fr`). Sans cette variable, le serveur leve une erreur au demarrage si l'envoi d'email est tente. | throw si absent et SMTP configure |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | serveur | Configuration SMTP pour l'envoi d'emails de verification / reset | non configure |
| `IA_DEFAULT_TOKEN`, `IA_DEFAULT_API_URL`, `IA_DEFAULT_MODEL` | les 2 | Cle Albert partagee cote serveur (Builder IA fonctionne sans config utilisateur) | `albert-large` |

**Securite** : `JWT_SECRET`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `ENCRYPTION_KEY` sont **generes automatiquement** par `deploy-server.sh` s'ils manquent dans `.env`. Une fois generes, ne JAMAIS les changer en place : `JWT_SECRET` invalide les sessions actives, `ENCRYPTION_KEY` rend les cles API stockees illisibles. Les sauvegarder hors du serveur.

**Validation des variables de build** : le script `npm run validate:build-env` verifie que les variables Vite requises (`VITE_PROXY_URL`, etc.) sont presentes avant la compilation. Les scripts `deploy.sh` / `deploy-server.sh` l'executent automatiquement et injectent `VITE_PROXY_URL` depuis `APP_DOMAIN`. Pour un build local de developpement sans `.env` complet, passer `DSFR_DATA_DEV_BUILD=1` pour contourner cette validation :

```bash
DSFR_DATA_DEV_BUILD=1 npm run build:all
```

## Reverse proxy

Le conteneur expose nginx sur le port `8080` (interne). Il faut un reverse proxy en amont qui :

1. Termine le HTTPS sur ton domaine (`${APP_DOMAIN}`).
2. Forwarde vers `chartsbuilder:8080` (resolution DNS Docker) ou `localhost:<port-publie>` selon ta strategie reseau.
3. Idealement : ajoute les **security headers** (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). Le snippet [`docker/security-headers.conf`](../docker/security-headers.conf) liste l'ensemble que la baseline securite du projet attend.

### Option A : exposer le port directement (sans reverse proxy)

Pour un test rapide ou un reverse proxy externe (ALB, CloudFront, Cloudflare Tunnel…), edite [`docker/docker-compose.yml`](../docker/docker-compose.yml) pour publier le port :

```yaml
services:
  chartsbuilder:
    ports:
      - "8080:8080"      # localhost:8080 -> conteneur:8080
    # Supprimer les labels traefik.* et le `networks: [ecosystem-network]`
```

L'app sera accessible sur `http://<ip-vps>:8080` (HTTP en clair, **non recommande en prod**).

### Option B : Traefik (config fournie en exemple)

Le `docker-compose.yml` fourni est pre-cable pour Traefik. Prerequis :

- Reseau Docker externe (le nom est libre, par defaut le compose utilise `ecosystem-network` — adapter si besoin) :
  ```bash
  docker network create ecosystem-network
  ```
- Traefik en cours, attache au meme reseau, avec les EntryPoints `web` (80) et `websecure` (443) et un certResolver (Let's Encrypt par exemple, nomme `letsencrypt` dans les labels). Ajuster les labels `traefik.http.routers.*.tls.certresolver=...` au nom de ton resolver.
- Optionnel : middleware Traefik `chartsbuilder-headers@file` pour les security headers + options TLS `anssi-strict@file`. Si tu n'as pas ces fichiers, retire les deux labels correspondants ou definis-les dans ta conf dynamique Traefik.

### Option C : Caddy

```caddy
chartsbuilder.example.org {
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "interest-cohort=()"
    }
    reverse_proxy chartsbuilder:8080
}
```

Caddy doit etre dans le meme reseau Docker que `chartsbuilder` (ou utiliser `localhost:<published-port>` apres avoir publie le port comme dans l'option A).

### Option D : nginx en frontal

```nginx
server {
    listen 443 ssl http2;
    server_name chartsbuilder.example.org;

    ssl_certificate     /etc/letsencrypt/live/chartsbuilder.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chartsbuilder.example.org/privkey.pem;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:8080;     # si port publie via Option A
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Configuration self-hosted

Cette section couvre les trois scenarios de deploiement supportes, du plus simple (deploiement de reference) au plus contraint (proxy d'entreprise + reverse externe gerant les routes de proxying). L'objectif : un operateur tiers peut deployer sur un domaine arbitraire sans patcher le code source.

Pre-requis communs :

- `APP_DOMAIN`, `VITE_PROXY_URL` (et `APP_URL` en mode serveur) genere automatiquement par `deploy.sh` / `deploy-server.sh` depuis `APP_DOMAIN`. Cf. [Variables d'environnement](#variables-denvironnement).
- Conteneur tourne sous l'utilisateur non-root `nginx` (uid 101).

### Scenario A : deploiement de reference (Traefik integre)

Le scenario par defaut. Aucune configuration particuliere requise au-dela de `APP_DOMAIN` :

1. `cp .env.example .env`
2. Editer `APP_DOMAIN=mon-domaine.example.com`
3. `./docker/deploy.sh` (ou `deploy-server.sh` en mode serveur)

Les scripts generent `VITE_PROXY_URL=https://${APP_DOMAIN}` et (mode serveur) `APP_URL=https://${APP_DOMAIN}`. Tous les chemins de proxying nginx (`/grist-proxy/`, `/tabular-proxy/`, `/albert-proxy/`, etc.) sont actifs cote conteneur. Le `docker-compose.yml` fournit des labels Traefik en exemple — adapter ou retirer selon le reverse proxy choisi (Caddy, nginx frontal, ALB…).

### Scenario B : derriere un proxy d'entreprise

Pour les operateurs dont le VPS n'a pas d'acces direct a Internet (proxy HTTP sortant obligatoire). Configurer les variables POSIX standard dans `.env` :

```bash
HTTP_PROXY=http://corporate.proxy.example.com:8080
HTTPS_PROXY=http://corporate.proxy.example.com:8080
NO_PROXY=localhost,127.0.0.1,mariadb,mailserver,.example.com
```

Ces variables sont propagees a deux niveaux :

- **Build-time** (depuis [#168 PR-2](https://github.com/bmatge/dsfr-data/pull/173)) : `npm ci` et `apk add` dans le stage builder des Dockerfiles passent par le proxy.
- **Runtime** (depuis [#168 PR-4](https://github.com/bmatge/dsfr-data/pull/178)) : les services Node embarques dans le conteneur (`scripts/ia-default-server.js` pour Albert IA, `mcp-server` pour `skills.json`) acheminent leurs appels HTTP sortants via le proxy. Implementation : `undici.EnvHttpProxyAgent` comme dispatcher global, conditionnel.

**Inclure les hostnames Docker internes dans `NO_PROXY`** (`mariadb`, `mailserver`, `localhost`, `127.0.0.1`) pour preserver les communications inter-conteneurs. Sans ces entrees, le serveur Express enverrait son trafic SMTP via le proxy externe, qui ne sait pas atteindre le mailserver interne.

Sans variable proxy definie, aucun dispatcher n'est installe — comportement strictement inchange. Cf. `.env.example` pour les details.

### Scenario C : reverse externe gerant les routes de proxying

Pour les operateurs qui preferent que leur reverse proxy d'entreprise (Traefik, nginx, HAProxy…) gere certaines routes de proxying API en frontal — par exemple parce qu'ils ont deja une politique de filtrage centralisee, du caching mutualise, ou des restrictions d'acces specifiques aux APIs externes.

**Strategie** : commenter les blocs `location /*-proxy/` correspondants dans `docker/nginx.conf` et/ou `docker/nginx-db.conf`, puis declarer le chemin equivalent dans le reverse externe en respectant le [contrat des chemins de proxying](#contrat-des-chemins-de-proxying) ci-dessous.

Exemple — vous voulez router `/tabular-proxy/` via votre reverse Traefik externe :

```nginx
# Dans docker/nginx.conf (et nginx-db.conf si mode serveur), commenter le bloc :

# location /tabular-proxy/ {
#     include /etc/nginx/conf.d/security-headers.conf;
#     ...
#     proxy_pass https://tabular-api.data.gouv.fr/;
#     ...
# }
```

Puis declarer dans votre reverse externe une regle qui :
- Capture `https://${APP_DOMAIN}/tabular-proxy/*` AVANT que la requete n'atteigne le conteneur nginx.
- Reverse-proxy vers `https://tabular-api.data.gouv.fr/*` en preservant le path apres `/tabular-proxy/`.
- Ajoute les headers CORS (`Access-Control-Allow-Origin: *`, methods, headers — cf. tableau ci-dessous).
- Supprime les headers `Origin` et `Referer` du forward (Tabular et certaines APIs gov rejettent les requetes browser).

Les paires `/ia-server-config` + `/ia-proxy-default` doivent etre commentees ensemble — le premier annonce la disponibilite du proxy IA par defaut, le second l'execute. Commenter l'un sans l'autre laisse l'app dans un etat incoherent (UI affiche "IA disponible" mais l'appel echoue).

**Tip** : les overrides specifiques a un site (compose, nginx custom) doivent passer par `docker-compose.override.yml` (gitignored) plutot que par des patches locaux des fichiers livres, sinon `git pull` les ecrasera. Cf. [issue #168](https://github.com/bmatge/dsfr-data/issues/168) pour la motivation.

### Scenario D : app interne + widgets publics (separation runtime/embed)

Pour les operateurs qui veulent decoupler les trois dimensions suivantes :

- **Runtime app** — domaine ou l'app tourne (peut etre interne, prive, intranet).
- **Embed** — domaine inline dans les widgets generes (doit etre stable et accessible aux sites tiers qui embarquent les widgets).
- **Beacon** — domaine de collecte de la telemetrie (peut etre un endpoint d'analytics distinct).

Cas typique : un operateur deploie l'app sur `app.interne.example` pour ses utilisateurs internes, mais veut que les widgets generes pointent vers `cdn.public.example` pour fonctionner sur des sites tiers sans dependre de l'infra interne.

**Trois variables build-time en cascade** (cf. issue [#180](https://github.com/bmatge/dsfr-data/issues/180)) :

```bash
VITE_PROXY_URL=https://app.interne.example         # runtime app -- REQUISE
VITE_PROXY_URL_EMBED=https://cdn.public.example    # optionnelle, fallback sur VITE_PROXY_URL
VITE_BEACON_URL=https://analytics.example.com      # optionnelle, fallback sur VITE_PROXY_URL_EMBED
```

Resolution :

- `PROXY_BASE_URL = VITE_PROXY_URL || 'https://chartsbuilder.matge.com'`
- `PROXY_BASE_URL_EMBED = VITE_PROXY_URL_EMBED || PROXY_BASE_URL`
- `BEACON_BASE_URL = VITE_BEACON_URL || PROXY_BASE_URL_EMBED`

**Aucune regression possible** sans changement explicite : si seul `VITE_PROXY_URL` est defini (cas du deploiement de reference), les trois dimensions pointent vers le meme domaine.

**Repartition par usage** :

| Variable | Utilisee par |
|---|---|
| `PROXY_BASE_URL` (runtime) | `apps/grist-widgets`, `apps/monitoring`, `apps/sources`, `getProxyConfig()` de l'app |
| `PROXY_BASE_URL_EMBED` (embed) | Code genere par `apps/builder`, `apps/builder-ia`, `apps/builder-carto` (attribut `base-url`/`url=` des widgets) |
| `BEACON_BASE_URL` (beacon) | URL de telemetrie bakee dans le bundle lib `packages/core/dist/dsfr-data.*.js` |

**Validation** : pour verifier qu'aucune URL n'a fui dans le mauvais sens apres build, `grep` les bundles produits :

```bash
VITE_PROXY_URL=https://app.test VITE_PROXY_URL_EMBED=https://cdn.test \
  VITE_BEACON_URL=https://analytics.test npm run build:all

# Code embed des builders doit contenir cdn.test, pas app.test
grep -r "app.test\|cdn.test" apps/builder/dist/
# Bundle lib doit contenir analytics.test pour le beacon
grep -r "analytics.test" packages/core/dist/
```

### Scenario E : authentification derriere un reverse proxy externe (mode serveur)

En mode serveur, l'authentification repose sur un cookie httpOnly `gw-auth-token`
(JWT) pose par l'API. Quand un reverse proxy externe (sur une autre machine que
le conteneur) se trouve devant l'app, quatre points doivent etre verifies. Tous
sont pilotes par variables d'environnement, sans patch du code.

> Note de diagnostic : un `401 {"error":"Authentication required"}` sur
> `GET /api/auth/me` quand on n'est **pas** connecte est le comportement
> **normal** — il prouve que l'API repond bien a travers le proxy. Le vrai
> probleme se diagnostique sur la reponse de `POST /api/auth/register` et sur le
> cycle de vie du cookie (onglets Reseau + Application des DevTools, cote client,
> sans acces serveur).

**1. Faire confiance au proxy (`TRUST_PROXY`)**

Sans cela, `req.ip`, `req.secure` et les rate-limiters voient l'IP du proxy pour
tout le monde (quota partage -> 429 premature ; detection HTTPS faussee). Defaut
`loopback` (cas de reference : nginx parle a l'API via 127.0.0.1). Un proxy sur
une autre machine doit declarer le nombre de sauts (hops) ou `true` :

```bash
TRUST_PROXY=true   # ou un entier (nombre de proxys de confiance), ex. 1 ou 2
```

**2. Servir en HTTPS de bout en bout**

Le cookie est `Secure` en production : un navigateur **refuse de le stocker** s'il
est recu sur une page **HTTP**. Le proxy doit donc presenter du HTTPS au
navigateur (et idealement transmettre `X-Forwarded-Proto`, exploite grace au
point 1). Symptome cote DevTools : `Set-Cookie` present a la connexion mais
cookie non stocke, avec la raison « Secure but not received over a secure
connection ».

**3. CORS si l'app et l'API sont sur des origines distinctes**

- **Meme origine** (le proxy sert la page **et** `/api` sous un seul hostname) :
  CORS ne s'applique pas, rien a configurer. C'est la configuration recommandee.
- **Origines distinctes** (sous-domaines, ex. `app.` et `api.` d'un meme parent,
  ou domaines separes) : le cookie `SameSite=Strict` laisse **deja** passer les
  sous-domaines d'un meme domaine enregistrable (notion de « site » = eTLD+1),
  mais **CORS** bloque. Autoriser alors les origines concernees :

```bash
# Liste d'origines exactes (separees par des virgules) :
CORS_ORIGIN=https://app.mon-domaine.fr,https://autre.mon-domaine.fr

# Ou autoriser tout sous-domaine d'un parent (separes par des virgules) :
CORS_ALLOW_SUBDOMAINS_OF=mon-domaine.fr
```

> Securite : `CORS_ALLOW_SUBDOMAINS_OF` autorise le CORS **avec credentials**
> pour tout sous-domaine du parent declare. Ne declarez qu'un domaine que vous
> maitrisez **entierement**. N'utilisez **jamais** un suffixe public partage
> (un domaine gouvernemental commun, `fr`, `com`…) : cela ouvrirait l'API a tout
> site tiers heberge sous ce suffixe.

**4. Inscription sans serveur mail (`REQUIRE_EMAIL_VERIFICATION`)**

Par defaut, seul le **premier** compte (admin) est auto-verifie ; les suivants
recoivent un email de verification a cliquer pour activer le compte. Cela exige
un SMTP joignable (`SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM`) **et** `APP_URL`. Sans
serveur mail, ces comptes ne peuvent pas etre actives. Pour les deploiements sans
SMTP, auto-verifier les comptes a l'inscription et connecter l'utilisateur
immediatement :

```bash
REQUIRE_EMAIL_VERIFICATION=false
```

**Bootstrap admin temporaire (`SEED_ADMIN_*`)**

Pour debloquer un premier acces sans dependre de l'inscription/email, definir un
compte admin cree au demarrage s'il n'existe pas. **A retirer apres usage** (sinon
recree s'il est supprime) et changer le mot de passe ensuite :

```bash
SEED_ADMIN_EMAIL=admin@mon-domaine.fr
SEED_ADMIN_PASSWORD=UnMotDePasseFort1   # >= 8 car., 1 minuscule, 1 majuscule, 1 chiffre
```

Pilote par environnement (jamais code en dur) pour ne pas committer
d'identifiants par defaut. Au demarrage, le serveur loggue
`[seed-admin] Compte admin de bootstrap cree...`.

**Bloc `.env` « ceinture et bretelles »** (deploiement serveur derriere un proxy
externe, app et API sous le meme hostname HTTPS) :

```bash
# Proxy
TRUST_PROXY=true
# Inscription utilisable sans SMTP
REQUIRE_EMAIL_VERIFICATION=false
# Acces admin immediat (a retirer apres connexion + changer le mot de passe)
SEED_ADMIN_EMAIL=admin@mon-domaine.fr
SEED_ADMIN_PASSWORD=UnMotDePasseFort1
# CORS : uniquement si page et API sont sur des origines differentes
# CORS_ALLOW_SUBDOMAINS_OF=mon-domaine.fr
```

Ces variables sont propagees au conteneur via `docker/docker-compose.db.yml`
(toutes vides par defaut -> comportement inchange). Apres edition du `.env`,
relancer `./docker/deploy-server.sh`.

### Contrat des chemins de proxying

Liste exhaustive des routes que les apps et widgets attendent au runtime. Si vous desactivez un bloc cote nginx (scenario C), vous devez fournir une route equivalente dans votre reverse externe respectant la signature ci-dessous.

| Chemin | Cible upstream | Methodes | Cache nginx | Notes |
|---|---|---|---|---|
| `/grist-gouv-proxy/` | `https://grist.numerique.gouv.fr/` | GET, POST, OPTIONS | GET 60s | Strip Origin + Referer (Grist rejette le navigateur direct) |
| `/grist-proxy/` | `https://docs.getgrist.com/` | GET, POST, OPTIONS | GET 60s | Strip Origin + Referer |
| `/albert-proxy/` | `https://albert.api.etalab.gouv.fr/` | GET, POST, PUT, PATCH, DELETE, OPTIONS | non | Token Albert dans `Authorization` cote client |
| `/ia-proxy` | **Dynamique** (`X-Target-URL` du client) | POST, OPTIONS | non | Strip `X-Target-URL` + `Origin` + `Referer` avant forward. Resolver DNS requis (8.8.8.8 par defaut) |
| `/ia-server-config` | `127.0.0.1:3003/ia-server-config` | GET | non | Endpoint local (`scripts/ia-default-server.js`) — disabler implique aussi de couper `/ia-proxy-default` |
| `/ia-proxy-default` | `127.0.0.1:3003/ia-proxy-default` | POST, OPTIONS | non | Token Albert injecte cote serveur depuis `IA_DEFAULT_TOKEN` — disabler implique aussi de couper `/ia-server-config` |
| `/insee-proxy/` | `https://api.insee.fr/` | GET, OPTIONS | GET 60s | Catalogue Melodi — strip Origin + Referer |
| `/tabular-proxy/` | `https://tabular-api.data.gouv.fr/` | GET, POST, OPTIONS | GET 60s | Strip Origin + Referer |
| `/cors-proxy` | **Dynamique** (`X-Target-URL` du client) | GET, POST, PUT, DELETE, PATCH, OPTIONS | non | Strip `X-Target-URL` + `Origin` + `Referer`. Resolver DNS requis. Utilise par `dsfr-data-source use-proxy` |

**Headers communs** attendus en reponse sur tous les chemins :
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: <selon la table>`
- `Access-Control-Allow-Headers: Origin, Content-Type, Accept, Authorization` (a minima ; `X-Target-URL` en plus pour `/ia-proxy` et `/cors-proxy`)
- Pour OPTIONS preflight : `Access-Control-Max-Age: 86400`

**Reference d'implementation** : voir `docker/nginx.conf` (mode statique) et `docker/nginx-db.conf` (mode serveur). Chaque bloc est annote `DESACTIVABLE` avec un renvoi vers cette section.

## Premier deploiement

### Mode statique

```bash
git clone https://github.com/bmatge/dsfr-data.git
cd dsfr-data

# Reseau Docker pour le reverse proxy (uniquement si tu utilises Traefik
# avec un reseau partage — adapter le nom au reseau de ton reverse proxy).
# Pas necessaire avec l'option A "ports publies".
docker network create ecosystem-network 2>/dev/null || true

cp .env.example .env
# Editer APP_DOMAIN. Adapter ou supprimer les labels traefik.* dans
# docker/docker-compose.yml selon ton choix de reverse proxy.

./docker/deploy.sh
```

Un seul conteneur tourne (`chartsbuilder`), nginx ecoute en interne sur le port `8080`.

### Mode serveur

```bash
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

## Validation post-deploiement

Une fois `./docker/deploy.sh` ou `./docker/deploy-server.sh` termine, executer la checklist ci-dessous pour valider que l'instance est saine. Toutes les commandes utilisent `${APP_DOMAIN}` — exporter la variable avant ou substituer.

```bash
export APP_DOMAIN=mon-domaine.example.com
```

### 1. Sante des conteneurs

```bash
docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.db.yml ps
# Attendu : tous les conteneurs en STATUS "Up" / "healthy" (mariadb doit afficher "healthy")
```

### 2. Healthcheck applicatif

```bash
# Mode statique
curl -sf "https://${APP_DOMAIN}/" -o /dev/null && echo OK || echo FAIL

# Mode serveur (en plus du ci-dessus)
curl -sf "https://${APP_DOMAIN}/api/health" | grep -q '"status":"ok"' && echo OK || echo FAIL
```

### 3. Aucune URL ne fuit vers le domaine de reference

Verifier qu'aucun bundle servi n'embarque `chartsbuilder.matge.com` en dur (sauf si c'est legitimement votre domaine). Adapter le pattern de match a votre domaine de reference si besoin :

```bash
# Bundle de la lib (servi sur /dist/)
curl -sf "https://${APP_DOMAIN}/dist/dsfr-data.core.esm.js" | grep -c "chartsbuilder.matge.com" || echo "(0 fuites)"

# Bundles des apps de creation
for app in builder builder-ia builder-carto dashboard playground; do
  echo "=== ${app} ==="
  curl -sf "https://${APP_DOMAIN}/${app}/" \
    | grep -oE 'src="/[^"]+\.js"' | head -1 \
    | sed -E "s@src=\"(/[^\"]+)\"@https://${APP_DOMAIN}\1@" \
    | xargs curl -sf \
    | grep -c "chartsbuilder.matge.com" || echo "(0 fuites)"
done
```

Resultat attendu : `0` partout (ou `(0 fuites)` si grep ne trouve rien). Si une valeur > 0 apparait, c'est probablement un `VITE_PROXY_URL` non propage au build (cf. issue #168 PR-1).

### 4. Routes de proxying actives

Chaque route doit repondre `204` au preflight OPTIONS (sauf si vous avez desactive le bloc en faveur d'un reverse externe — cf. [Scenario C](#scenario-c--reverse-externe-gerant-les-routes-de-proxying)).

```bash
for path in /grist-gouv-proxy/ /grist-proxy/ /albert-proxy/ /insee-proxy/ /tabular-proxy/ /cors-proxy /ia-proxy /ia-proxy-default; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "https://${APP_DOMAIN}${path}")
  printf "%-25s %s\n" "${path}" "${code}"
done
# Attendu : 204 partout (ou code de votre reverse externe si scenario C)
```

### 5. Endpoint IA serveur (si `IA_DEFAULT_TOKEN` configure)

```bash
curl -sf "https://${APP_DOMAIN}/ia-server-config" | python3 -m json.tool
# Attendu : { "available": true, "apiUrl": "...", "model": "..." } (sans le token)
```

### 6. Security headers + CSP

```bash
curl -sI "https://${APP_DOMAIN}/" | grep -iE "strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy"
# Attendu : 6 headers presents
```

Verifier visuellement la CSP dans la console DevTools du navigateur (`F12` → onglet `Console`) en chargeant une page qui consomme des donnees externes. Aucun message `Refused to ... violates Content Security Policy` ne doit apparaitre.

### 7. Proxy d'entreprise active au runtime (si configure)

Si `HTTP_PROXY` / `HTTPS_PROXY` est defini dans le `.env` (Scenario B), confirmer que le conteneur l'a bien charge :

```bash
docker compose --env-file .env -f docker/docker-compose.yml ${COMPOSE_DB:+-f docker/docker-compose.db.yml} \
  logs chartsbuilder | grep -E "Outbound proxy enabled"
# Attendu : "[ia-default-server] Outbound proxy enabled (HTTPS_PROXY=..., NO_PROXY=...)"
#          + "[dsfr-data-mcp] Outbound proxy enabled (...)"
```

### 8. Bundles a jour (cache)

Apres une mise a jour, vider le cache du navigateur (`Ctrl+Shift+R`) et verifier que les bundles sont reservis. Sinon, les bundles `/dist/*.js` (non hashes) doivent passer en revalidation systematique (cf. [ADR-008](https://github.com/bmatge/dsfr-data/blob/main/docs/ADR/ADR-008-politique-de-cache-http-pour-bundles-non-hashes.md)) :

```bash
curl -sI "https://${APP_DOMAIN}/dist/dsfr-data.core.esm.js" | grep -i "cache-control"
# Attendu : "Cache-Control: no-cache, must-revalidate"
```

### 9. Smoke test fonctionnel

Ouvrir `https://${APP_DOMAIN}/playground/` dans un navigateur et charger un exemple embarque. Le rendu doit s'afficher sans erreur dans la console DevTools.

### Si une etape echoue

| Etape | Probleme | Piste |
|---|---|---|
| 1-2 | Conteneur ne demarre pas | `docker compose ... logs --tail=200 chartsbuilder` |
| 3 | URL `chartsbuilder.matge.com` baked dans le bundle | Verifier `VITE_PROXY_URL` dans `.env` ET rebuild avec `--no-cache` |
| 4 | OPTIONS retourne 404 | Bloc nginx commente sans reverse externe configure (cf. [Scenario C](#scenario-c--reverse-externe-gerant-les-routes-de-proxying)) |
| 5 | `available: false` | `IA_DEFAULT_TOKEN` non defini ou conteneur non redemarre apres ajout |
| 6 | Headers manquants | Snippet `security-headers.conf` non charge ou Traefik qui les ecrase |
| 7 | Pas de log "Outbound proxy enabled" | `HTTP_PROXY` non passe au runtime (`environment:` du docker-compose) |
| 8 | Bundle servi en cache long | Conf nginx hors-date (cache 1y au lieu de no-cache, must-revalidate sur `/dist/*`) |
| 9 | Erreur CSP / CORS en DevTools | Cf. CSP point 6 + routes proxy point 4 |

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

- [ ] HTTPS termine par le reverse proxy avec un certificat valide (Let's Encrypt, ACME, ou cert d'entreprise).
- [ ] TLS 1.2+ uniquement, ciphers conformes ANSSI ou Mozilla Modern.
- [ ] Headers de securite presents en reponse (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). Cf. [`docker/security-headers.conf`](../docker/security-headers.conf) pour les valeurs attendues par la baseline du projet.
- [ ] `.env` n'est PAS commite (`.gitignore` le couvre).
- [ ] `JWT_SECRET`, `DB_*_PASSWORD`, `ENCRYPTION_KEY` sauvegardes hors du serveur (perte = perte de l'acces aux comptes ET aux cles API chiffrees).
- [ ] Sauvegarde MariaDB programmee (cron + dump quotidien hors-site).
- [ ] `IA_DEFAULT_TOKEN` (si utilise) jamais commit, jamais affiche dans les logs : c'est une cle Albert.
- [ ] Reverse proxy a jour (CVEs reverse-proxy = critiques).
- [ ] Conteneur nginx tourne **non-root** (uid 101) — verifie via `docker inspect`. C'est le defaut depuis [PR #113](https://github.com/bmatge/dsfr-data/pull/113).
- [ ] CSP testee en pre-production avec un site qui embarque un widget genere (sources publiques).

Voir aussi [docs/SECURITY.md](SECURITY.md) (modele de menace, signalement de vulnerabilites) et [docs/security-baseline.md](security-baseline.md) (DAST ZAP, SCA Trivy, SAST CodeQL/Semgrep).

## Pieges connus

### Volumes orphelins apres renommage de dossier

Docker prefixe les volumes par le nom du projet (par defaut le nom du dossier git). Si tu renommes le dossier ou le projet, Docker creera de nouveaux volumes vides et les donnees existantes resteront orphelines. Pour reutiliser les volumes existants, fixer explicitement :

```bash
echo "COMPOSE_PROJECT_NAME=<ancien-nom-du-projet>" >> .env
```

(Par exemple, l'instance de reference utilise `COMPOSE_PROJECT_NAME=datasource-charts-webcomponents`, nom historique du repo avant son renommage en `dsfr-data`.)

### Cache d'IP Traefik apres recreation de conteneur

Specifique a Traefik : si tu recrees les conteneurs (par exemple apres `docker network rm` + recreation) et que les IPs internes changent, Traefik peut garder en cache l'ancienne IP et renvoyer 502. Solution : `docker restart <traefik-container>` apres le `up -d`.

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

Les bundles servis sur `https://${APP_DOMAIN}/dist/*.js` (lib `dsfr-data` self-hostee) ont des **noms stables** entre versions. Sans cache-busting, un correctif live n'etait pas servi aux visiteurs deja venus. La conf nginx les sert avec `Cache-Control: no-cache, must-revalidate` (revalidation systematique via ETag, pas de re-telechargement si inchange). Voir [`packages/core/CHANGELOG.md` v0.7.0](../packages/core/CHANGELOG.md) et [ADR-008](https://github.com/bmatge/dsfr-data/blob/main/docs/ADR/ADR-008-politique-de-cache-http-pour-bundles-non-hashes.md).
