# Sécurité

Ce document décrit la politique de sécurité de `dsfr-data`, la manière de signaler une vulnérabilité, et l'ensemble des outils qui contrôlent en permanence l'état de sécurité du projet.

## Signaler une vulnérabilité

**Merci de ne pas ouvrir d'issue publique** pour signaler une vulnérabilité. Utilisez à la place l'un de ces deux canaux privés :

1. **GitHub Security Advisories** (préférence) — [Report a vulnerability](https://github.com/bmatge/dsfr-data/security/advisories/new) depuis l'onglet Security du repo. C'est le canal le plus rapide, il crée automatiquement un espace de discussion privé avec les mainteneurs.
2. **Email** — envoyer un rapport à l'auteur du repo ([bmatge](https://github.com/bmatge)).

Merci d'inclure dans votre signalement :

- Une description du problème et de son impact potentiel
- Les étapes de reproduction ou un proof-of-concept minimal
- La version concernée de `dsfr-data` (tag ou commit SHA)
- Vos coordonnées si vous souhaitez être recontacté

Nous nous engageons à accuser réception sous 72 heures, à évaluer l'impact et proposer un correctif ou un plan de mitigation sous 7 jours pour les vulnérabilités significatives.

## Versions supportées

Ce projet est en développement actif. Seule la branche `main` et la dernière version publiée sur npm reçoivent des correctifs de sécurité.

| Version | Supportée |
|---|---|
| `main` (dev) | ✅ |
| Dernière release npm | ✅ |
| Releases antérieures | ❌ |

## Pipeline de sécurité

La CI exécute **10 jobs de sécurité** sur chaque pull request, et plusieurs workflows périodiques pour rattraper les CVE qui arrivent après un build :

| Brique | Outil | Job / Workflow | Sévérité bloquante |
|---|---|---|---|
| **SCA — dépendances (bloquant)** | `npm audit --omit=dev` (root, ce qui est livré) · `npm audit` (mcp-server) | `quality` (root) + `sca` (mcp-server) | HIGH/CRITICAL |
| **SCA — advisory (non-bloquant)** | `npm audit --audit-level=moderate`, dépendances de développement comprises | `sca-advisory` | aucune (information) |
| **SCA — lockfiles** | `trivy fs` | `sca` (root + mcp-server + Cargo) | HIGH/CRITICAL (fixable) |
| **Misconfig — Dockerfiles** | `trivy config` | `sca` | HIGH/CRITICAL |
| **Secrets** | `gitleaks` | `secrets` + Husky pre-commit | toute détection |
| **SAST** | `semgrep` | `sast` | ERROR/WARNING (rulesets curated) |
| **SAST — data flow** | `CodeQL` | `codeql.yml` | `security-and-quality` |
| **Lint sécurité** | `eslint-plugin-security` | `quality` | toute erreur |
| **SRI — intégrité CDN** | script custom `check:sri` | `quality` | tout tag `<script>`/`<link>` pointant vers un CDN sans `integrity` valide |
| **Images Docker** | `trivy image` | `docker-scan.yml` (matrix sur 2 images) | CRITICAL |
| **DAST — app live** | `OWASP ZAP baseline` | `dast.yml` (stack MariaDB+Express+nginx bootée dans le runner) | non bloquant (advisory) |

Les scans périodiques :
- **CodeQL** : hebdomadaire, lundi 06:00 UTC
- **Trivy image** : hebdomadaire, lundi 07:00 UTC
- **ZAP DAST** : hebdomadaire, lundi 08:00 UTC (+ `workflow_dispatch` manuel)

## Backend — défenses applicatives

Côté Express, trois couches empilées couvrent les surfaces auth + API :

| Couche | Mécanisme | Activé sur | Raison |
|---|---|---|---|
| **Session** | Cookie httpOnly `gw-auth-token` (JWT 7j, SameSite=Strict) | toutes les routes `/api/*` via `authMiddleware` | Authentifie l'utilisateur sans exposer le token au JS côté navigateur |
| **CSRF** | Double-submit cookie (`csrf-csrf` v4) — header `X-CSRF-Token` + cookie `gw-csrf`, liés à `userId` (ou IP si anonyme) | `POST/PUT/PATCH/DELETE` sauf auth-bootstrap (login, register, reset-password, verify-email) | Empêche qu'une form tierce déclenche une mutation via le cookie d'auth de la victime (cf. issue #92) |
| **Rate limiting** | `express-rate-limit` 10/15min sur auth, 300/min safety-net sur `/api/*` | auth + global | Absorbe l'énumération / brute force avant qu'il ne tape l'application |

Chiffrement au repos : les `connections.api_key_encrypted` sont chiffrées en AES-256-GCM (clé `ENCRYPTION_KEY`, 64 hex). Le secret CSRF dérive de la même env var par défaut ou est spécifié séparément via `CSRF_SECRET`.

## Proxy générique — bornage

Deux routes relaient vers une cible que **le client** désigne, dans l'en-tête `X-Target-URL` : `/cors-proxy` (sources `use-proxy`, explorateur d'API de l'app Sources, Studio IA) et `/ia-proxy` (Studio IA, clé de l'usager). Toutes les autres routes de proxy ont une cible fixe, écrite dans la configuration. Une cible choisie par le client doit être bornée : sans cela le serveur relaie vers n'importe quelle adresse, y compris celles qu'il est seul à pouvoir joindre.

### La règle

Elle s'applique **avant tout appel amont**, à l'identique dans les quatre endroits qui portent ces routes : `docker/nginx.conf`, `docker/nginx-db.conf`, `proxy/nginx/nginx.conf` (proxy autonome) et le serveur de développement (`vite.config.ts`). La source de vérité est `scripts/lib/garde-proxy.cjs` ; les `map` nginx (`docker/garde-proxy.conf`) en recopient les motifs.

| Borne | `/cors-proxy` | `/ia-proxy` |
|---|---|---|
| Cible | `https://` + nom DNS public, sans identifiants ni port | idem |
| Méthodes | `GET`, `POST` (+ `OPTIONS` pour le preflight) | `GET`, `POST` |
| Corps de requête | 1 Mo | 1 Mo |
| Débit par client | 10 req/s, rafale de 40 | 5 req/s, rafale de 20 |
| Débit global, partagé par les deux routes | 50 req/s, rafale de 200 | idem |
| CORS | `Access-Control-Allow-Origin: *` | aucun en-tête CORS |
| Certificat de l'amont | vérifié | vérifié |
| Redirection de l'amont | rendue telle quelle, jamais suivie | idem |
| Cookies de l'instance | jamais transmis à l'amont | idem |

Sont refusés (`403`) : `http://` et tout autre schéma ; toute adresse IP littérale, quelle que soit sa notation (pointée, décimale, hexadécimale, octale, IPv6 entre crochets, IPv6 mappée) — donc la boucle locale, les plages privées, le lien local, le CGNAT ; `localhost` et tout nom sans point, ce qui couvre les noms de services Docker ; les suffixes réservés aux réseaux locaux (`.localhost`, `.local`, `.internal`, `.lan`, `.home`, `.corp`, `.arpa`, `.test`…) ; une URL portant `user:pass@` ; un port, même `:443` ; le domaine par lequel l'instance est appelée. Une méthode hors liste reçoit `405`, un en-tête absent `400`, un corps trop volumineux `413`, un dépassement de débit `429`.

La forme admise est une liste positive : ce qui n'est pas `https://nom.public[/chemin]` est refusé, sans qu'il faille énumérer les notations d'adresse.

### Ce que la règle ne couvre pas

- **Un nom public qui résout vers une adresse interne.** nginx filtre le nom qu'il lit, pas l'adresse que le résolveur lui rend. Trois verrous réduisent ce reste sans le fermer : seul le port 443 est joignable ; l'échange est en TLS et le **certificat de l'amont est vérifié** contre les autorités publiques, pour le nom demandé — un service interne ne présente pas de certificat valide à ce nom ; le résolveur configuré est public, donc les noms internes (services Docker compris) ne résolvent pas. Reste qu'une tentative de connexion vers le port 443 d'une adresse interne a bien lieu, et que le relais atteint tout service qui présente un certificat publiquement valide — y compris les autres sites servis par le même hôte, vus alors depuis une adresse du serveur. **Ne jamais accorder de confiance à une adresse source interne.**
- **Le relais reste ouvert à tout hôte public en `https`.** C'est son usage : l'explorateur d'API interroge des API quelconques, une liste blanche d'hôtes le rendrait inutilisable. Le débit est plafonné, pas la destination.
- **`Access-Control-Allow-Origin: *` sur `/cors-proxy`.** Un widget embarqué sur un site tiers (`use-proxy` avec `proxy-url`, ou `VITE_PROXY_URL_EMBED`) appelle cette route depuis une autre origine : la restreindre à l'origine de l'instance casserait ces widgets.
- **La taille de la réponse** de l'amont n'est pas plafonnée.
- **La clé de débit par client** est `X-Forwarded-For` quand il existe. Sans reverse proxy devant nginx, un client peut forger cet en-tête ; le plafond global tient dans tous les cas.
- **Le serveur de développement** applique la règle de cible, les méthodes et la taille, pas la limite de débit.

### Mesure complémentaire recommandée

Le filtrage par nom ne remplace pas une isolation réseau. Selon le déploiement, par ordre d'effet :

1. **Sortir le relais générique du conteneur applicatif** : `proxy/nginx/` est un proxy autonome, à déployer sur un réseau qui ne voit ni la base ni les autres services, puis à router sur `/cors-proxy` par le reverse proxy ([Scénario C](DEPLOYMENT.md#scenario-c--reverse-externe-gerant-les-routes-de-proxying)).
2. **Règles de sortie** sur l'hôte : interdire au conteneur web les destinations privées (RFC 1918, lien local `169.254.0.0/16`, CGNAT `100.64.0.0/10`) en dehors de sa base de données.
3. **Résolveur dédié** qui écarte les réponses privées (`private-address` d'unbound, `stop-dns-rebind` de dnsmasq), désigné par la directive `resolver` des deux blocs.

Aucune n'est imposée par le dépôt : elles dépassent la configuration nginx. La procédure de vérification pour un auto-hébergeur est dans [DEPLOYMENT.md](DEPLOYMENT.md#proxy-generique--ce-quil-accepte-ce-quil-refuse).

### Comment c'est tenu

- `tests/proxy/garde-proxy.test.ts` — le module et son middleware, sur un serveur local, émetteur amont injecté.
- `tests/proxy/garde-proxy-coherence.test.ts` — test-garde : les motifs des `map` nginx sont ceux du module, les blocs `location` sont identiques d'un fichier à l'autre, et la table de cas (`tests/proxy/cas-garde-proxy.ts`) est évaluée sur les `map` relues.
- `tests/proxy/garde-proxy-nginx.test.ts` — job CI `proxy-nginx` : `nginx -t` sur les trois configurations, puis la même table rejouée par un vrai nginx dans un conteneur sans réseau.

## Relais cachable — ce qu'il rend public

Le relais cachable (ADR-155) est une route qu'un **site intégrateur** fournit pour que les données de ses dataviz passent par son domaine : `<relais>/<hôte>/<chemin>?<requête>`. Il n'est pas déployé sur l'instance publique, et ce n'est pas le proxy générique ci-dessus. Son contrat, règle par règle, est dans [`RELAY.md`](RELAY.md) ; cette section dit ce qui le distingue et ce qu'il expose.

### En quoi il diffère du proxy générique

| | Proxy générique (`/cors-proxy`) | Relais cachable |
|---|---|---|
| Qui choisit la destination | le client, dans `X-Target-URL` — tout hôte public en `https` | l'opérateur du relais : **liste blanche exacte** d'hôtes, et de préfixes de chemin par hôte |
| Ce qui borne | la forme de la cible (pas d'adresse, pas de port, pas de nom local) et le débit | l'appartenance à la liste ; un hôte hors liste est refusé sans contacter personne |
| Méthodes | `GET`, `POST` | `GET`, `HEAD`, `OPTIONS` : **lecture seule**, aucun corps transmis |
| En-têtes du visiteur | transmis à l'amont, `Authorization` compris (cookies de l'instance exceptés) | **aucun** n'est transmis |
| Clé d'API | celle de l'usager, envoyée par son navigateur, pour lui seul | celle de l'opérateur, **détenue par le relais**, la même pour tout le monde |
| Réponse | propre à l'appelant, jamais mise en cache | **publique et mise en cache**, sous l'URL seule |
| Redirection de l'amont | rendue telle quelle | jamais rendue au navigateur |

La conséquence va dans les deux sens. Le relais n'est pas un relais ouvert : la question du proxy générique — « vers où le serveur peut-il être envoyé ? » — y est fermée par la liste blanche. Mais il pose une question que le proxy générique ne pose pas : **qu'est-ce que la clé du relais donne à lire à n'importe qui ?**

### La clé détenue par le relais

Le relais répond sans authentification, à toute origine (`Access-Control-Allow-Origin: *`), et met ses réponses en cache. Il ne distingue pas la dataviz de la page d'un inconnu qui écrit l'URL à la main.

> **Une clé confiée au relais rend public tout ce qu'elle sait lire sur l'hôte autorisé, dans les préfixes de chemin autorisés.** Y compris ce que l'amont dit privé : une réponse portant `Set-Cookie`, `Cache-Control: private` ou `no-store` est servie `public` comme les autres.

Trois obligations en découlent, pour l'opérateur du relais :

1. **Clé en lecture seule**, dédiée au relais, au périmètre le plus étroit que le portail délivre. Le relais ne transmet aucune écriture, mais une clé qui en a le droit reste une clé qui fuit plus cher.
2. **Préfixes de chemin** pour tout hôte à clé : seuls les jeux destinés à être publics. Le relais Node refuse de démarrer sans ; avec l'extrait nginx, c'est une ligne de la `location` de l'hôte, qu'il faut écrire.
3. **La clé hors du dépôt et hors des pages** : variable d'environnement pour le relais Node, fichier de configuration lisible par root seul pour nginx. Elle n'apparaît dans aucune réponse ni aucun journal du relais.

Si une donnée ne doit pas être publique, elle ne passe pas par un relais.

### Ce que le relais ne doit jamais faire sur l'origine du site

Monté sur l'origine du site (le cas recommandé), le relais sert des réponses venues d'un tiers sous le domaine du site. D'où : jamais de `Set-Cookie` de l'amont ; types de contenu en liste fermée (JSON, GeoJSON, CSV), jamais de HTML, de SVG ni de script ; `X-Content-Type-Options: nosniff` et `Content-Security-Policy: default-src 'none'; sandbox` sur toute réponse ; aucune redirection de l'amont rendue au navigateur.

### Ce que les deux relais livrés ne couvrent pas de la même façon

Le relais Node de référence tient le contrat en entier, dont deux défenses que nginx seul n'a pas : il **vérifie l'adresse** vers laquelle résout un hôte autorisé (jamais une adresse privée, et il se connecte à l'adresse qu'il a vérifiée), et il **plafonne la taille** d'une réponse. L'extrait nginx a quatre limites face à la suite de conformance, et quelques autres que la suite ne voit pas (liste noire d'en-têtes de réponse, pas de délai global, journal d'erreurs de nginx) : elles sont écrites dans [`proxy/relay/nginx/README.md`](../proxy/relay/nginx/README.md) et dans [`RELAY.md` §10](RELAY.md#10-lextrait-nginx-et-ce-que-garantit-chaque-relais). Aucun des deux ne remplace l'isolation réseau : comme pour le proxy générique, ne jamais accorder de confiance à une adresse source interne.

Deux règles viennent de la relecture de sécurité du relais (#1254) et concernent tout opérateur :

- **C-DOS-5** — derrière un mandataire, l'adresse du visiteur se lit dans un en-tête que le mandataire **pose**, jamais dans un en-tête qu'il transmet. Avec nginx : `proxy_set_header X-Forwarded-For $remote_addr;`. Un `proxy_pass` nu laisse chaque requête forger son adresse, donc son quota.
- **C-CACHE-6** — une 401, 403, 404 ou 410 de l'amont **purge** l'entrée du cache : sans cela, la panne suivante resservirait en « périmé » la donnée que le portail vient de dépublier.

Les journaux du relais contiennent les URL, donc ce que l'usager a tapé dans une recherche déléguée : le relais Node ne journalise pas la requête par défaut ; la **durée de conservation est à fixer par l'opérateur**.

### Comment c'est tenu

- `tests/relay/conformance.test.mjs` — la suite de conformance du contrat (140 tests), jouée contre le relais Node par `npm run test:run`, et contre un vrai nginx chargé de l'extrait par le job CI `relais-nginx`.
- `tests/relay/reference/` — ce qui ne s'observe pas de l'extérieur, sur le relais Node : adresse privée après résolution, rebond DNS, connecteur TLS, cache borné, purge, journaux, mandataire.
- `tests/relay/nginx/` — le banc de l'extrait nginx ne diffère de la production que par l'adresse de l'amont ; la liste des tests rouges contre nginx doit être exactement celle des limites documentées.

## Frontend — défenses navigateur

Côté client, quatre couches protègent contre l'injection et le détournement de scripts :

| Couche | Mécanisme | Portée |
|---|---|---|
| **SRI** | Attribut `integrity="sha384-…"` sur **tous** les `<script>`/`<link>` pointant vers un CDN (jsDelivr, unpkg, etc.) | 330 tags sur 49 fichiers, généré par `scripts/generate-sri.ts`, vérifié en CI par `check:sri` |
| **CSP** | `Content-Security-Policy` par `helmet()` Express + header `add_header` nginx avec `default-src 'self'`, allowlist serrée de CDN et endpoints IA | toutes les réponses servies par nginx et `/api/*` |
| **Headers hardening** | `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (caméra/micro/géo/etc. désactivés) | snippet `docker/security-headers.conf` inclus dans chaque `location` nginx |
| **Server fingerprinting** | `server_tokens off` + bannière nginx masquée | toutes les réponses nginx |

La CSP et les headers sont validés sur chaque URL crawlée par le job ZAP DAST. Le snippet d'en-têtes est inclus dans **chaque `location`** nginx (pas au niveau server) car nginx n'hérite pas les `add_header` dès qu'une location en déclare un — cette architecture est documentée dans [`docker/security-headers.conf`](../docker/security-headers.conf).

## Hardening runtime

- **nginx non-root** : l'image prod utilise [`nginxinc/nginx-unprivileged:alpine`](https://hub.docker.com/r/nginxinc/nginx-unprivileged) et écoute sur `8080` (pas 80). Finding Trivy `DS-0002` (container running as root) éliminé.
- **MariaDB healthcheck** : le conteneur DB expose un healthcheck `mysqladmin ping` attendu par le conteneur app avant de démarrer — évite qu'Express attaque une DB non prête (et ne pollue les logs de démarrage).
- **Volumes nommés + chown idempotent** : `deploy-server.sh` applique un chown one-shot root sur les volumes persistants (`html/public`, `beacon-logs`) avant le `docker compose up` pour éviter les crashloop après un switch root → non-root (les permissions d'un volume nommé pré-existant priment sur celles du Dockerfile).

## Dépendances — Dependabot

- **Alertes Dependabot** : activées, visibles dans [l'onglet Security → Dependabot](https://github.com/bmatge/dsfr-data/security/dependabot).
- **Correctifs automatiques** : Dependabot ouvre automatiquement des PRs quand une advisory impacte nos dépendances (setting `dependabot_security_updates` activé).
- **Secret scanning** : activé avec push protection — un push contenant un secret connu d'un provider est bloqué avant même d'atteindre le serveur.

## Politique de sévérité

Tous nos gates SCA actuels bloquent sur **HIGH/CRITICAL**. Les advisories MODERATE sont **visibles** (via Dependabot + le job non-bloquant `sca-advisory` + les rapports Trivy) mais **non bloquantes** — la remédiation passe par Dependabot et la revue humaine des alertes, pas par un blocage du pipeline. Le rationale complet (double seuil, défense en profondeur, patterns CodeQL réutilisables) est formalisé dans **ADR-004 — Politique de sévérité SCA et défense en profondeur** (accepted, 2026-04-15) et tracé dans [l'issue #73](https://github.com/bmatge/dsfr-data/issues/73).

## Faux positifs et exclusions

Aucun masquage silencieux. Toute exclusion de règle ou CVE est documentée avec :

- **Quoi** : règle ou CVE ignorée
- **Pourquoi** : justification technique
- **Suivi** : issue de follow-up si un fix est prévu
- **Revue** : date après laquelle l'entrée doit être réévaluée

Les fichiers d'exclusion à jour :

- [`.trivyignore`](../.trivyignore)
- [`.semgrepignore`](../.semgrepignore)
- [`.gitleaks.toml`](../.gitleaks.toml)
- [`.zap/rules.tsv`](../.zap/rules.tsv) — faux positifs DAST (ZAP baseline)
- Exclusions inline (`// nosemgrep:`, `// eslint-disable-next-line security/…`) toujours avec un commentaire en ligne adjacente

## Procédures

- **Fuite de secret détectée** → [security-incident-response.md](./security-incident-response.md) — runbook avec priorité révocation/rotation, options de réécriture d'historique, tableau des secrets manipulés.
- **Lancer les scans en local** → [security-dev-guide.md](./security-dev-guide.md) — commandes Docker-only pour Trivy, Semgrep, Gitleaks.
- **Réutiliser cette baseline sur un autre projet** → [security-baseline.md](./security-baseline.md) — template générique avec snippets prêts à copier-coller pour les 8 briques.

## Baseline sécurité — statut

La baseline définie dans [l'issue #65](https://github.com/bmatge/dsfr-data/issues/65) a été **complétée à 100%**. Chaque brique est traçable à une PR mergée :

| Brique | PR |
|---|---|
| Trivy SCA (lockfiles) | [#67](https://github.com/bmatge/dsfr-data/pull/67) |
| Gitleaks secrets | [#68](https://github.com/bmatge/dsfr-data/pull/68) |
| Semgrep SAST + fix prototype pollution | [#70](https://github.com/bmatge/dsfr-data/pull/70) |
| CodeQL | [#71](https://github.com/bmatge/dsfr-data/pull/71) |
| `eslint-plugin-security` | [#72](https://github.com/bmatge/dsfr-data/pull/72) |
| Trivy image Docker | [#74](https://github.com/bmatge/dsfr-data/pull/74) |
| `SECURITY.md` + consolidation | [#75](https://github.com/bmatge/dsfr-data/pull/75) |
| Baseline réutilisable (template) | [#79](https://github.com/bmatge/dsfr-data/pull/79) |
| ADR-004 + job `sca-advisory` non-bloquant | [#99](https://github.com/bmatge/dsfr-data/pull/99) |
| DAST OWASP ZAP | [#107](https://github.com/bmatge/dsfr-data/pull/107) |
| SRI sur tous les tags CDN | [#108](https://github.com/bmatge/dsfr-data/pull/108) |
| Security headers nginx (include snippet) | [#109](https://github.com/bmatge/dsfr-data/pull/109) |
| CSRF double-submit cookie | [#110](https://github.com/bmatge/dsfr-data/pull/110) |
| Express 4 → 5 | [#112](https://github.com/bmatge/dsfr-data/pull/112) |
| nginx non-root | [#113](https://github.com/bmatge/dsfr-data/pull/113) |
| `no-explicit-any` (109 → 0 warnings) | [#114](https://github.com/bmatge/dsfr-data/pull/114)–[#120](https://github.com/bmatge/dsfr-data/pull/120) |
| Rate limiting `/logout` + global `/api/*` safety net | [#96](https://github.com/bmatge/dsfr-data/pull/96) |
| Dette `// nosemgrep` SARIF upload | [#121](https://github.com/bmatge/dsfr-data/pull/121) |

## Liens utiles

- [Security Advisories](https://github.com/bmatge/dsfr-data/security/advisories)
- [Dependabot alerts](https://github.com/bmatge/dsfr-data/security/dependabot)
- [Code scanning alerts](https://github.com/bmatge/dsfr-data/security/code-scanning)
- [Tracking de la baseline sécurité — issue #65](https://github.com/bmatge/dsfr-data/issues/65)
