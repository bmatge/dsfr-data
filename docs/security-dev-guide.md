# Guide développeur — scans de sécurité en local

Ce document rassemble les commandes pour lancer en local les mêmes scans que la CI, avant de pousser. Toutes les commandes utilisent **Docker uniquement**, zéro install requise (sauf Docker Desktop). Les images sont pinnées à `:latest` ici pour la simplicité ; en CI on pinne une version stable.

> 💡 **Pas obligatoire** : les hooks Husky et la CI rattrapent tout, mais un scan local avant un push coûteux t'évite d'attendre 2 minutes que GitHub te dise ce que tu aurais pu voir tout de suite.

## Secrets — Gitleaks

Scanner l'historique Git complet (ce que fait le job CI `secrets`) :

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  detect --source /repo --verbose --redact
```

Scanner uniquement les modifications staged (ce que fait le hook Husky pre-commit si `gitleaks` est installé en local) :

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  protect --source /repo --staged --verbose --redact
```

La config `.gitleaks.toml` est appliquée automatiquement (elle est à la racine du repo).

## SCA — dépendances et config Docker — Trivy

Scanner les lockfiles (root + mcp-server + Cargo) pour des CVE HIGH/CRITICAL :

```bash
docker run --rm -v "$PWD:/src" -v /tmp/trivy-cache:/root/.cache/trivy \
  -w /src public.ecr.aws/aquasecurity/trivy:latest \
  fs --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed \
  --no-progress .
```

Scanner les Dockerfiles (misconfig) :

```bash
docker run --rm -v "$PWD:/src" -v /tmp/trivy-cache:/root/.cache/trivy \
  -w /src public.ecr.aws/aquasecurity/trivy:latest \
  config --severity HIGH,CRITICAL --ignorefile .trivyignore -q .
```

Scanner une image Docker construite localement (CRITICAL only, comme la CI) :

```bash
# Build
docker build -f docker/Dockerfile -t dsfr-data:scan .

# Scan
docker run --rm \
  -v /tmp/trivy-cache:/root/.cache/trivy \
  -v /var/run/docker.sock:/var/run/docker.sock \
  public.ecr.aws/aquasecurity/trivy:latest \
  image --severity CRITICAL --ignore-unfixed -q dsfr-data:scan
```

Pour `dsfr-data-db`, remplacer `docker/Dockerfile` par `docker/Dockerfile.db`.

## SAST — Semgrep

Scanner avec les mêmes rulesets que la CI :

```bash
docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep:latest \
  semgrep scan \
  --config=p/default \
  --config=p/typescript \
  --config=p/javascript \
  --config=p/xss \
  --config=p/security-audit \
  --exclude-rule=html.security.audit.missing-integrity.missing-integrity \
  --severity=ERROR \
  --severity=WARNING \
  --metrics=off \
  packages/core/src apps server/src scripts
```

Les exclusions de chemin sont lues depuis `.semgrepignore`. Pour forcer l'échec (comme en CI), ajouter `--error`.

## npm audit

```bash
# Workspace root
npm audit --audit-level=high

# mcp-server (hors workspace)
cd mcp-server && npm audit --audit-level=high
```

## Lint security

Inclus dans `npm run lint` (eslint-plugin-security est déjà dans la config). Pour ne regarder que les findings sécurité :

```bash
npm run lint 2>&1 | grep 'security/'
```

## SRI — Subresource Integrity des assets CDN

Toutes les balises `<script src="…">` et `<link href="…">` qui pointent vers un CDN (jsdelivr, unpkg) portent un attribut `integrity="sha384-…"` + `crossorigin="anonymous"`. Sans SRI, un CDN compromis (ou un MITM via CA compromis) permettrait l'exécution de code arbitraire côté navigateur.

Le script [`scripts/generate-sri.ts`](../scripts/generate-sri.ts) automatise la génération et la mise à jour des hashes :

```bash
# Régénère / met à jour tous les integrity=
npm run generate-sri

# Dry-run (CI : exit 1 si un tag CDN est sans SRI)
npm run check:sri
```

Le script est idempotent : une 2e passe ne modifie rien. Il fetch uniquement les URLs pointant vers un CDN whitelisté (`cdn.jsdelivr.net`, `unpkg.com`) et ignore les fichiers dans `**/dist/**`.

**Quand relancer `npm run generate-sri`** : à chaque bump de version CDN — le hash est lié à un contenu précis, donc tout `@1.14.4 → @1.14.5` invalide le hash et casse la prod. Le job `quality` de la CI lance `check:sri` à chaque PR ; une divergence remonte en erreur.

## DAST — OWASP ZAP baseline

Le scan DAST tourne en CI sur `workflow_dispatch` + chaque lundi 08:00 UTC (workflow [`.github/workflows/dast.yml`](../.github/workflows/dast.yml)). Pour le rejouer en local :

```bash
# 1. Démarrer la stack (MariaDB + Express + nginx) avec l'override CI
cd docker
cat > .env <<EOF
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n=/+' | head -c 64)
DB_PASSWORD=$(openssl rand -base64 24 | tr -d '\n=/+' | head -c 24)
DB_ROOT_PASSWORD=$(openssl rand -base64 24 | tr -d '\n=/+' | head -c 24)
ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF
docker compose -f docker-compose.yml -f docker-compose.db.yml -f docker-compose.ci.yml up -d --build

# 2. Attendre que l'API soit prête
until curl -sf http://localhost:8080/api/health; do sleep 3; done

# 3. Lancer ZAP baseline (même commande que la CI, artifacts locaux dans ./zap-report)
mkdir -p zap-report
docker run --rm \
  --network host \
  -v "$PWD/zap-report:/zap/wrk:rw" \
  -v "$PWD/../.zap/rules.tsv:/zap/wrk/rules.tsv:ro" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://localhost:8080/ -a -j -m 3 -T 15 \
    -r report.html -w report.md -J report.json -c /zap/wrk/rules.tsv

# 4. Lire le rapport
open zap-report/report.html   # (Linux : xdg-open)

# 5. Tear down
docker compose -f docker-compose.yml -f docker-compose.db.yml -f docker-compose.ci.yml down -v
```

Les scans sont **non bloquants** (cf. [ADR-004](https://github.com/bmatge/dsfr-data/blob/main/CHANGELOG.md) — politique de sévérité SCA et défense en profondeur). Les findings sont traités asynchroniquement via les artifacts GitHub Actions.

Pour ajouter un faux positif, éditer [`.zap/rules.tsv`](../.zap/rules.tsv) en suivant le format documenté en en-tête du fichier (RULE_ID, ACTION, URL_REGEX optionnel, note obligatoire avec date).

## Workflow suggéré avant un push coûteux

1. `npm run lint` — catch les warnings security/* locaux
2. Trivy fs + config — catch les CVE HIGH/CRITICAL et les misconfig Docker
3. Semgrep — catch les XSS / SQLi / patterns à risque
4. Gitleaks `protect --staged` — catch les secrets avant commit

Si les 4 passent, la CI passera aussi (sauf régression transverse).

## Liens

- Politique globale : [SECURITY.md](../SECURITY.md)
- Runbook d'incident : [security-incident-response.md](./security-incident-response.md)
- Tracking baseline : [issue #65](https://github.com/bmatge/dsfr-data/issues/65)
- Policy calibration : [issue #73](https://github.com/bmatge/dsfr-data/issues/73)
