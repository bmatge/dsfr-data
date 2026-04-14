# Runbook — Fuite de secret détectée

Ce document décrit la procédure à suivre quand un secret est détecté dans le repo
(par Gitleaks en local, en CI, ou par un signalement externe).

## Principe directeur

> **Un secret qui a été poussé dans l'historique Git public est compromis, point.**
>
> Réécrire l'historique (`git filter-repo`, BFG…) est **secondaire** : il faut d'abord
> **révoquer et régénérer** le secret, parce qu'il est impossible de garantir qu'il
> n'a pas été lu ou cloné entre le push et la détection.

## Secrets manipulés par le projet

Liste à maintenir à jour. Pour chaque secret, savoir où il est utilisé et comment le régénérer.

| Secret | Où | Comment le régénérer |
|---|---|---|
| `JWT_SECRET` | `server/` (signature JWT) | `openssl rand -hex 64` puis redéploiement ; **invalide toutes les sessions** |
| `ENCRYPTION_KEY` | `server/` (AES-256-GCM sur `connections.api_key_encrypted`) | `openssl rand -hex 32` — ⚠️ **rotation non triviale** : toutes les API keys chiffrées deviennent illisibles, il faut les re-chiffrer ou les re-demander aux utilisateurs |
| `DB_PASSWORD` / `DB_ROOT_PASSWORD` | MariaDB | `openssl rand -base64 32` puis mise à jour dans MariaDB + `.env` + redémarrage conteneur |
| `IA_DEFAULT_TOKEN` (Albert) | `ia-default-server.js` (proxy IA) | Générer un nouveau token sur [albert.api.etalab.gouv.fr](https://albert.api.etalab.gouv.fr) et révoquer l'ancien |
| Tokens SMTP | `server/` (nodemailer) | Dépend du fournisseur SMTP — généralement dashboard du provider |
| Clés API utilisateurs (`connections.api_key_encrypted`) | MariaDB, chiffrées | Aucune rotation côté serveur — c'est la responsabilité de l'utilisateur, via l'UI de `apps/sources/` |

## Procédure d'incident

### Étape 1 — Confinement immédiat (minutes)

1. **Ne pas paniquer et ne pas supprimer le commit.** Supprimer sans révoquer donne une fausse impression de sûreté.
2. **Identifier le secret** exact qui a fuité : fichier, ligne, commit, date, branche.
3. **Évaluer l'exposition** :
   - Repo public ou privé ?
   - Depuis quand le commit est en ligne ?
   - Le secret a-t-il été utilisé en production ?

### Étape 2 — Révocation & rotation (heures)

4. **Révoquer le secret** chez le fournisseur (interface admin, dashboard…). Exemples :
   - Albert : révoquer le token dans le dashboard utilisateur.
   - MariaDB : `ALTER USER 'user'@'%' IDENTIFIED BY 'nouveau_password';` + redéploiement.
   - JWT_SECRET : changer la valeur dans `.env` et redéployer (toutes les sessions sont invalidées).
5. **Générer un nouveau secret** (voir tableau ci-dessus).
6. **Déployer la nouvelle valeur** en production avant de faire quoi que ce soit côté repo.
7. **Auditer les logs** du service correspondant : recherche d'utilisations anormales du secret compromis entre sa fuite et sa révocation.

### Étape 3 — Nettoyage du repo (optionnel)

Une fois le secret révoqué et remplacé, le nettoyage de l'historique Git est **optionnel mais souhaitable** pour éviter les scans automatisés qui signaleraient encore le secret (même compromis) et pour ne pas laisser de trace historique.

**Options** :

- **Option A — accepter** : le secret est révoqué, l'historique reste tel quel, on ajoute une entrée dans `.gitleaks.toml` pour allowlister le commit via son fingerprint. Simple, zéro rewrite, mais le secret reste lisible pour qui consulte l'historique.

- **Option B — réécrire l'historique** : `git filter-repo --replace-text` ou `bfg --replace-text` pour réécrire tous les commits. **Casse tous les fetch/pull existants** — nécessite de coordonner avec tous les clones du repo (dev, CI, déploiement) et force-push.
  ```bash
  # Exemple avec git-filter-repo
  echo "sk-xxx-compromised==>REDACTED" > /tmp/replacements.txt
  git filter-repo --replace-text /tmp/replacements.txt
  git push --force-with-lease origin main
  ```
  ⚠️ **Ne jamais force-push sans autorisation explicite** (cf. CLAUDE.md du projet et règles globales). Coordonner avec toute l'équipe avant.

### Étape 4 — Post-mortem (jours)

8. **Documenter l'incident** : créer une note dans `~/Documents/Obsidian/20-Sessions/YYYY-MM-DD.md` avec timeline, cause racine, mesures prises.
9. **Renforcer la prévention** :
   - Le hook Husky pre-commit a-t-il tourné ? Pourquoi a-t-il laissé passer ?
   - Faut-il ajouter une règle custom dans `.gitleaks.toml` pour ce format de secret ?
   - Y a-t-il une ADR à rédiger sur la rotation régulière ?

## Outils

### Scan local de l'historique

```bash
# Via Docker (zéro install)
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo --verbose --redact

# Via brew (macOS)
brew install gitleaks
gitleaks detect --verbose --redact
```

### Scan d'un commit spécifique

```bash
gitleaks detect --log-opts="<commit-sha>^..<commit-sha>" --verbose --redact
```

### Scan des modifications staged (avant commit)

```bash
gitleaks protect --staged --verbose --redact
```

C'est ce que fait automatiquement le hook `.husky/pre-commit` si gitleaks est installé localement.

## Liens

- [gitleaks — règles par défaut](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml)
- [OWASP — Secret Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [git-filter-repo](https://github.com/newren/git-filter-repo)
- Issue parent : #59
- Milestone : Security baseline
