# scripts/

Scripts utilitaires pour le build, le deploiement et la maintenance.

## Contenu

| Script | Description |
|--------|-------------|
| `build-app.js` | Assemble le dossier `app-dist/` (racine servie par nginx en deploiement web) a partir des builds individuels |
| `build-skills-json.ts` | Genere `skills.json` par introspection des composants |
| `build-reperes.ts` | Genere le registre des reperes d'interface de chaque app (`apps/<app>/src/assistant/reperes.generated.ts`) depuis `data-repere` / `data-zone` / `data-attribut` / `data-prerequis` ; `--check` bloquant en CI (`npm run check:reperes`, #997). Remplace l'ancien `list-builder-parameters.ts`, jamais branche. Extraction pure dans `lib/reperes-extract.ts` et `lib/reperes-lexer.ts` |
| `parse-beacon-logs.sh` | Agrege les logs de beacon nginx en `monitoring-data.json` (shell) |
| `parse-beacon-logs.js` | Idem en JavaScript (Node.js) |
| `docker-entrypoint.sh` | Script de demarrage pour le conteneur Docker |
| `setup-database.sh` | Initialisation de la base de donnees SQLite pour le mode serveur |
