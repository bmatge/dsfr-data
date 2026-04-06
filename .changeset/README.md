# Changesets

Ce dossier est gere par [Changesets](https://github.com/changesets/changesets).

## Utilisation

Apres chaque modification notable de la bibliotheque, creer un changeset :

```bash
npx changeset
```

Suivre les instructions interactives :
1. Selectionner le package `dsfr-data`
2. Choisir le type de bump : `major` (breaking), `minor` (feature), `patch` (fix)
3. Decrire le changement (en francais, 1-2 phrases)

Le fichier genere sera commite avec le code.

## A la release

```bash
npx changeset version   # Bumpe les versions + genere le CHANGELOG
npm run sync-versions   # Synchronise Tauri et Cargo.toml
git add . && git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```
