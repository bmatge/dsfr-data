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
| **SCA — dépendances (bloquant)** | `npm audit` | `quality` (root) + `sca` (mcp-server) | HIGH/CRITICAL |
| **SCA — advisory (non-bloquant)** | `npm audit --audit-level=moderate` | `sca-advisory` | aucune (information) |
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

## Frontend — défenses navigateur

Côté client, quatre couches protègent contre l'injection et le détournement de scripts :

| Couche | Mécanisme | Portée |
|---|---|---|
| **SRI** | Attribut `integrity="sha384-…"` sur **tous** les `<script>`/`<link>` pointant vers un CDN (jsDelivr, unpkg, etc.) | 330 tags sur 49 fichiers, généré par `scripts/generate-sri.ts`, vérifié en CI par `check:sri` |
| **CSP** | `Content-Security-Policy` par `helmet()` Express + header `add_header` nginx avec `default-src 'self'`, allowlist serrée de CDN et endpoints IA | toutes les réponses servies par nginx et `/api/*` |
| **Headers hardening** | `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (caméra/micro/géo/etc. désactivés) | snippet `docker/security-headers.conf` inclus dans chaque `location` nginx |
| **Server fingerprinting** | `server_tokens off` + bannière nginx masquée | toutes les réponses nginx |

La CSP et les headers sont validés sur chaque URL crawlée par le job ZAP DAST. Le snippet d'en-têtes est inclus dans **chaque `location`** nginx (pas au niveau server) car nginx n'hérite pas les `add_header` dès qu'une location en déclare un — cette architecture est documentée dans [`docker/security-headers.conf`](./docker/security-headers.conf).

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

- [`.trivyignore`](./.trivyignore)
- [`.semgrepignore`](./.semgrepignore)
- [`.gitleaks.toml`](./.gitleaks.toml)
- [`.zap/rules.tsv`](./.zap/rules.tsv) — faux positifs DAST (ZAP baseline)
- Exclusions inline (`// nosemgrep:`, `// eslint-disable-next-line security/…`) toujours avec un commentaire en ligne adjacente

## Procédures

- **Fuite de secret détectée** → [docs/security-incident-response.md](./docs/security-incident-response.md) — runbook avec priorité révocation/rotation, options de réécriture d'historique, tableau des secrets manipulés.
- **Lancer les scans en local** → [docs/security-dev-guide.md](./docs/security-dev-guide.md) — commandes Docker-only pour Trivy, Semgrep, Gitleaks.
- **Réutiliser cette baseline sur un autre projet** → [docs/security-baseline.md](./docs/security-baseline.md) — template générique avec snippets prêts à copier-coller pour les 8 briques.

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
