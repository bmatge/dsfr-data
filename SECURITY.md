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

La CI exécute **8 jobs de sécurité** sur chaque pull request, et plusieurs workflows périodiques pour rattraper les CVE qui arrivent après un build :

| Brique | Outil | Job / Workflow | Sévérité bloquante |
|---|---|---|---|
| **SCA — dépendances** | `npm audit` | `quality` (root) + `sca` (mcp-server) | HIGH/CRITICAL |
| **SCA — lockfiles** | `trivy fs` | `sca` (root + mcp-server + Cargo) | HIGH/CRITICAL (fixable) |
| **Misconfig — Dockerfiles** | `trivy config` | `sca` | HIGH/CRITICAL |
| **Secrets** | `gitleaks` | `secrets` + Husky pre-commit | toute détection |
| **SAST** | `semgrep` | `sast` | ERROR/WARNING (rulesets curated) |
| **SAST — data flow** | `CodeQL` | `codeql.yml` | `security-and-quality` |
| **Lint sécurité** | `eslint-plugin-security` | `quality` | toute erreur |
| **Images Docker** | `trivy image` | `docker-scan.yml` (matrix sur 2 images) | CRITICAL |

Les scans périodiques :
- **CodeQL** : hebdomadaire, lundi 06:00 UTC
- **Trivy image** : hebdomadaire, lundi 07:00 UTC

## Dépendances — Dependabot

- **Alertes Dependabot** : activées, visibles dans [l'onglet Security → Dependabot](https://github.com/bmatge/dsfr-data/security/dependabot).
- **Correctifs automatiques** : Dependabot ouvre automatiquement des PRs quand une advisory impacte nos dépendances (setting `dependabot_security_updates` activé).
- **Secret scanning** : activé avec push protection — un push contenant un secret connu d'un provider est bloqué avant même d'atteindre le serveur.

## Politique de sévérité

Tous nos gates SCA actuels bloquent sur **HIGH/CRITICAL**. Les advisories MODERATE sont **visibles** (via Dependabot et les rapports Trivy) mais **non bloquantes**. Cette politique est tracée dans **[issue #73](https://github.com/bmatge/dsfr-data/issues/73)** qui documente le rationale et les options de calibration.

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
- Exclusions inline (`// nosemgrep:`, `// eslint-disable-next-line security/…`) toujours avec un commentaire en ligne adjacente

## Procédures

- **Fuite de secret détectée** → [docs/security-incident-response.md](./docs/security-incident-response.md) — runbook avec priorité révocation/rotation, options de réécriture d'historique, tableau des secrets manipulés.
- **Lancer les scans en local** → [docs/security-dev-guide.md](./docs/security-dev-guide.md) — commandes Docker-only pour Trivy, Semgrep, Gitleaks.
- **Réutiliser cette baseline sur un autre projet** → [docs/security-baseline.md](./docs/security-baseline.md) — template générique avec snippets prêts à copier-coller pour les 8 briques.

## Liens utiles

- [Security Advisories](https://github.com/bmatge/dsfr-data/security/advisories)
- [Dependabot alerts](https://github.com/bmatge/dsfr-data/security/dependabot)
- [Code scanning alerts](https://github.com/bmatge/dsfr-data/security/code-scanning)
- [Tracking de la baseline sécurité — issue #65](https://github.com/bmatge/dsfr-data/issues/65)
