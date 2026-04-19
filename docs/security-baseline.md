# Security baseline — template réutilisable

Checklist générique pour installer rapidement une baseline sécurité sur n'importe quel projet **Node/TypeScript** (et, pour certaines briques, Rust/Docker). Extraite de la baseline mise en place sur `dsfr-data` ([tracking #65](https://github.com/bmatge/dsfr-data/issues/65)).

> **Comment l'utiliser** : copier ce fichier dans le nouveau projet, adapter les variables marquées `<…>` à la fin, puis créer une issue par brique avec la section correspondante en corps d'issue. L'implémentation se fait vague par vague dans l'ordre donné. Chaque brique est indépendante — pas besoin de tout faire d'un coup.
>
> **Référence implémentation** : ce repo (`bmatge/dsfr-data`) sert de démo complète des 8 briques en place — voir `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/docker-scan.yml`, `SECURITY.md`.

## Principes directeurs

- **Jamais de masquage silencieux** — toute exclusion (`.trivyignore`, `.semgrepignore`, `// nosemgrep`, `// eslint-disable-next-line security/*`) doit porter *quoi / pourquoi / suivi / date de revue*.
- **Dry-run local avant push** — scanner en local, trier les findings, fixer ou justifier, puis pousser le workflow.
- **Politique de sévérité explicite** — décider et documenter le seuil bloquant (HIGH/CRITICAL vs MODERATE). Voir section dédiée.
- **Follow-up plutôt que silence** — si un finding mérite un fix non trivial, ouvrir une issue de follow-up et ignorer temporairement avec référence.

## Hiérarchie des briques

| Catégorie | Quand l'appliquer |
|---|---|
| 🟢 **Obligatoire** | Tout projet Node/TS en production |
| 🟡 **Recommandée** | Tout projet qui publie ou expose quoi que ce soit |
| 🟠 **Conditionnelle** | Dépend de l'architecture (backend / Docker) |

## 🟢 Obligatoires (6 briques)

### 1. SCA — Trivy fs + `npm audit`

**Pourquoi** : détecter les CVE connues dans les dépendances (directes et transitives) avant qu'elles n'atteignent la prod.

**Pré-requis** : aucun.

**Variables à adapter** : liste des `package-lock.json` hors workspace npm (ex. `mcp-server/package-lock.json`), chemins des Dockerfiles.

**GitHub Actions** (dans `.github/workflows/ci.yml`) :

```yaml
  sca:
    name: Security — SCA & config
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      # Pour chaque lockfile hors workspace npm, ajouter un step dédié.
      - name: npm audit — <sub-package>
        working-directory: <sub-package>
        run: npm audit --audit-level=high

      - name: Trivy — filesystem (vulnerabilities)
        uses: aquasecurity/trivy-action@0.35.0
        with:
          scan-type: fs
          scanners: vuln
          severity: HIGH,CRITICAL
          ignore-unfixed: true
          exit-code: '1'
          trivyignores: .trivyignore

      - name: Trivy — config (Dockerfiles)
        uses: aquasecurity/trivy-action@0.35.0
        with:
          scan-type: config
          severity: HIGH,CRITICAL
          exit-code: '1'
          trivyignores: .trivyignore
```

**Local** :
```bash
docker run --rm -v "$PWD:/src" -w /src public.ecr.aws/aquasecurity/trivy:latest \
  fs --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed .
```

---

### 2. SAST — Semgrep

**Pourquoi** : détecter les patterns de vulnérabilités applicatives (XSS, SQLi, prototype pollution, ReDoS) avec des rulesets communautaires curated.

**Pré-requis** : aucun.

**Variables à adapter** : chemins à scanner, rulesets (`p/typescript`, `p/javascript`, `p/python`, etc. selon le langage), exclusions de chemin dans `.semgrepignore`.

**GitHub Actions** :

```yaml
  sast:
    name: Security — SAST
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    container:
      image: semgrep/semgrep
    steps:
      - uses: actions/checkout@v4

      - name: Semgrep scan
        run: |
          semgrep scan \
            --config=p/default \
            --config=p/typescript \
            --config=p/javascript \
            --config=p/xss \
            --config=p/security-audit \
            --severity=ERROR --severity=WARNING \
            --metrics=off \
            --sarif --output=semgrep.sarif \
            --error \
            <chemin1> <chemin2>

      - name: Strip nosemgrep-suppressed findings from SARIF
        if: always()
        run: |
          jq '(.runs[].results) |= map(select((.suppressions // []) | length == 0))' \
            semgrep.sarif > semgrep.filtered.sarif
          mv semgrep.filtered.sarif semgrep.sarif

      - name: Upload Semgrep SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: semgrep.sarif
          category: semgrep
```

**Pourquoi l'étape `Strip nosemgrep-suppressed findings`** : Semgrep OSS honore les `// nosemgrep: <rule-id>` inline et marque les findings correspondants avec `"suppressions": [{"kind": "inSource"}]` dans le SARIF. Mais **GitHub Code Scanning n'interprète pas ce flag** et remonte ces findings comme alertes ouvertes. Le `jq` filtre ces findings côté workflow avant l'upload pour éviter les re-dismissals manuels récurrents. `jq` est déjà présent dans l'image `semgrep/semgrep`.

`.semgrepignore` :
```
dist/
app-dist/
node_modules/
tests/
e2e/
*.test.ts
```

**Attention** : Semgrep peut remonter beaucoup de false positives la première fois. **Triage systématique** :
- Vrai bug → fixer
- Faux positif contextuel → `// nosemgrep: <full-check-id>` inline avec justification
- Règle trop bruyante → `--exclude-rule=<full-check-id>` + issue de follow-up pour revoir

---

### 3. SAST — CodeQL

**Pourquoi** : data-flow / taint analysis plus profond que Semgrep, intégré nativement dans l'onglet Security de GitHub. **Gratuit** pour les repos publics.

**Pré-requis** : aucun.

**Variables à adapter** : `languages` selon le stack.

**Workflow dédié** `.github/workflows/codeql.yml` :

```yaml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # lundi 06:00 UTC

jobs:
  analyze:
    name: Analyze (${{ matrix.language }})
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      security-events: write
      actions: read
      contents: read

    strategy:
      fail-fast: false
      matrix:
        language: [javascript-typescript]

    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
          queries: security-and-quality
          config: |
            paths-ignore:
              - dist
              - node_modules
              - tests
              - '**/*.test.ts'

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: '/language:${{ matrix.language }}'
```

---

### 4. Secrets — Gitleaks

**Pourquoi** : un secret commité et poussé est **compromis pour toujours**, même supprimé après. Détecter avant le push (hook pre-commit) et rattraper en CI sur l'historique complet.

**Pré-requis** : aucun (Husky est un plus pour le hook local).

**Variables à adapter** : allowlist dans `.gitleaks.toml` si le repo contient des fichiers dédiés à la doc qui mentionnent des formats de secrets (ex. `.env.example`, `CHANGELOG.md`).

**GitHub Actions** :

```yaml
  secrets:
    name: Security — Secrets
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # indispensable pour scanner l'historique

      - name: Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`.gitleaks.toml` minimal :
```toml
title = "<project> gitleaks config"

[extend]
useDefault = true

[allowlist]
description = "Chemins autorisés à contenir des patterns de faux positif"
paths = [
  '''\.env\.example$''',
  '''CHANGELOG\.md$''',
]
```

**Hook pre-commit Husky** (soft check — skip si binaire absent) :
```sh
#!/usr/bin/env sh
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact --verbose || exit 1
else
  echo "[gitleaks] non installé — scan ignoré (la CI rattrapera)."
fi
```

**Scan historique initial** : avant de pousser le hook, lancer
```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  detect --source /repo --verbose --redact
```
Si des secrets apparaissent, **les révoquer avant de faire quoi que ce soit d'autre**. Ne pas juste supprimer les commits : le secret est public. Runbook type : révoquer → régénérer → redéployer → puis éventuellement réécrire l'historique (force-push coordonné).

---

### 5. Lint sécurité — `eslint-plugin-security`

**Pourquoi** : complément léger au SAST, s'applique au pre-commit via lint-staged, zéro infra.

**Pré-requis** : ESLint déjà en place.

**Installation** :
```bash
npm install --save-dev eslint-plugin-security
```

**Config** (`eslint.config.js` flat config) :
```js
import securityPlugin from 'eslint-plugin-security';

export default tseslint.config(
  // …
  securityPlugin.configs.recommended,
  {
    rules: {
      // detect-object-injection est très bruyante sur TS (toute indexation
      // arr[i] / obj[key] est flaggée). Désactiver globalement et documenter
      // le pourquoi.
      'security/detect-object-injection': 'off',

      // detect-non-literal-fs-filename : uniquement si le code lit des
      // chemins fournis par l'utilisateur. Sinon, false positive.
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
);
```

**Attention** : `detect-object-injection` est le cas classique de règle qui noie 90 % des vrais findings dans le bruit. Le plugin README lui-même le reconnaît. À désactiver globalement sur TS sauf cas très spécifique.

---

### 6. Documentation — `SECURITY.md` + onglet Security GitHub

**Pourquoi** : canal de signalement officiel, politique publique, agrégation des findings dans un seul endroit.

**Pré-requis** : les autres briques en place (sinon pas grand chose à documenter).

**Livrables** :

1. **`SECURITY.md` à la racine** — GitHub le détecte automatiquement et l'affiche dans l'onglet Security.
   - Politique de reporting (GitHub Security Advisories > email)
   - Versions supportées
   - Pipeline sécurité (table des briques)
   - Politique de sévérité (voir section dédiée plus bas)
   - Faux positifs : politique de documentation

2. **Guide dev local** (`docs/security-dev-guide.md`) — commandes Docker-only pour lancer les scans en local.

3. **Activation GitHub (via API)** :
   ```bash
   # Dependabot security updates (PRs auto pour les advisories)
   gh api --method PUT repos/<owner>/<repo>/automated-security-fixes

   # Vérification
   gh api repos/<owner>/<repo> \
     --jq '.security_and_analysis.dependabot_security_updates'
   ```
   Les alertes Dependabot sont activées par défaut sur les repos publics. Le secret scanning et le push protection sont également activables via l'UI Settings → Code security.

4. **Badges README** :
   ```md
   [![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)](…)
   [![CodeQL](https://github.com/<owner>/<repo>/actions/workflows/codeql.yml/badge.svg)](…)
   [![Security Policy](https://img.shields.io/badge/security-policy-red.svg)](./SECURITY.md)
   ```

---

## 🟠 Conditionnelles (2 briques)

### 7. Docker image scan — Trivy image

**Quand** : si le projet produit des images Docker (Dockerfile à la racine ou dans `docker/`).

**Pourquoi** : les lockfiles ne capturent pas les CVE de l'image de base (OS packages, binaires système). Un scan d'image est complémentaire au scan fs.

**Workflow dédié** `.github/workflows/docker-scan.yml` :

```yaml
name: Docker image scan

on:
  push:
    branches: [main]
    paths:
      - 'docker/**'
      - 'package-lock.json'
      - '.github/workflows/docker-scan.yml'
  pull_request:
    branches: [main]
    paths:
      - 'docker/**'
      - '.github/workflows/docker-scan.yml'
  schedule:
    - cron: '0 7 * * 1'  # CVE arrivent après build
  workflow_dispatch:

jobs:
  scan:
    name: Trivy image (${{ matrix.image.name }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        image:
          - name: <image1>
            dockerfile: docker/Dockerfile
            tag: <image1>:scan
          # - name: <image2> …

    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -f ${{ matrix.image.dockerfile }} -t ${{ matrix.image.tag }} .

      - name: Trivy — scan image
        uses: aquasecurity/trivy-action@0.35.0
        with:
          image-ref: ${{ matrix.image.tag }}
          severity: CRITICAL
          exit-code: '1'
          ignore-unfixed: true
          trivyignores: .trivyignore
          format: table
```

**Note sur la sévérité** : CRITICAL only est pragmatique sur une image — les HIGH OS-level s'accumulent vite et ne sont pas toujours exploitables depuis le code applicatif. À ajuster selon le niveau de risque.

---

### 8. DAST — OWASP ZAP

**Quand** : si le projet expose un backend HTTP (Express, Fastify, Koa, Nest, etc.).

**Pourquoi** : le DAST scanne l'application en cours d'exécution. Complémentaire au SAST parce qu'il voit les couches d'intégration (config runtime, headers, middlewares actifs, auth).

**Coût** : plus lourd à mettre en place (il faut monter la stack complète en CI avec docker compose), plus long à tourner (5-10 min).

**Variables à adapter** : URL du frontend (baseline scan), URL de l'API + OpenAPI spec si dispo (API scan), dépendances à monter (DB, etc.).

**Workflow dédié** `.github/workflows/dast.yml` — à construire case par case selon la stack. Template à rédiger sur un repo réel (cf. ce template sera enrichi quand `dsfr-data` aura complété #61).

---

## Politique de sévérité

Décider et documenter explicitement un seuil bloquant. Les deux options pragmatiques :

**Option A — HIGH/CRITICAL bloquant, MODERATE advisory**
- Gate CI dur sur HIGH/CRITICAL (ne bloque pas sur le bruit)
- MODERATE visible mais non bloquant (Dependabot alerts, logs CI)
- Dependabot security updates ouvre des PRs de remédiation en async
- **Recommandée pour la plupart des projets** — évite la fatigue d'alerte

**Option B — Strict MODERATE+**
- Gate dur sur MODERATE
- Très peu d'accumulation mais CI qui casse sur chaque nouvelle advisory
- Nécessite discipline de remédiation continue
- Pour projets à haut risque / régulés

Notre choix sur `dsfr-data` : **Option A**. Voir [issue #73](https://github.com/bmatge/dsfr-data/issues/73) pour le raisonnement et le plan de remédiation des advisories moderate actuelles.

## Variables à adapter par projet

Lors de l'instanciation dans un nouveau projet, rechercher et remplacer :

| Placeholder | Exemple `dsfr-data` |
|---|---|
| `<owner>` | `bmatge` |
| `<repo>` | `dsfr-data` |
| `<project>` | `dsfr-data` |
| `<sub-package>` (npm audit) | `mcp-server` |
| `<chemin1> <chemin2>` (Semgrep) | `packages/core/src apps server/src scripts` |
| `<image1>`, `<image2>` | `dsfr-data`, `dsfr-data-db` |

## Ordre d'implémentation recommandé

L'ordre qu'on a suivi sur `dsfr-data` (voir [tracking #65](https://github.com/bmatge/dsfr-data/issues/65)) :

1. **Vague 1 — quick wins** : SCA Trivy → Secrets Gitleaks → SAST Semgrep (les 3 à sévérité haute)
2. **Vague 2 — compléments** : CodeQL → eslint-plugin-security → Trivy image
3. **Vague 3 — DAST & doc** : ZAP → SECURITY.md
4. **Méta** : extraction de la baseline (ce document)

Chaque brique doit se faire dans une PR dédiée, avec dry-run local préalable et justification inline de toute exclusion.

## Script d'instanciation (optionnel)

Non fourni dans cette version. Un futur script Node ou shell pourrait :

1. Lire ce fichier
2. Prompter l'utilisateur pour les variables (`<owner>`, `<repo>`, lockfiles, etc.)
3. Créer 8 issues dans le repo cible via `gh issue create` avec les sections correspondantes
4. Créer une tracking issue listant les 8

Non prioritaire tant qu'on ne duplique pas la baseline sur 3+ repos.

## Liens

- **Tracking baseline `dsfr-data`** : [issue #65](https://github.com/bmatge/dsfr-data/issues/65)
- **Politique de sévérité** : [issue #73](https://github.com/bmatge/dsfr-data/issues/73)
- **Runbook incident secret** : [docs/security-incident-response.md](./security-incident-response.md)
- **Guide dev local** : [docs/security-dev-guide.md](./security-dev-guide.md)
- **Politique publique** : [SECURITY.md](../SECURITY.md)
