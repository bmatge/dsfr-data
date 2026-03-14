# scripts/

Scripts utilitaires pour le build, le deploiement et la maintenance.

## Contenu

| Script | Description |
|--------|-------------|
| `build-app.js` | Assemble le dossier `app-dist/` pour Tauri a partir des builds individuels |
| `build-skills-json.ts` | Genere `skills.json` par introspection des composants |
| `parse-beacon-logs.sh` | Agrege les logs de beacon nginx en `monitoring-data.json` (shell) |
| `parse-beacon-logs.js` | Idem en JavaScript (Node.js) |
| `docker-entrypoint.sh` | Script de demarrage pour le conteneur Docker |
| `setup-database.sh` | Initialisation de la base de donnees SQLite pour le mode serveur |
