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
