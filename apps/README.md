# apps/

Applications web du projet dsfr-data. Chaque app est un workspace npm independant avec son propre `package.json` et sa config Vite.

## Applications

| Dossier | Package | Description |
|---------|---------|-------------|
| `builder/` | `@dsfr-data/app-builder` | Generateur visuel de graphiques (assistant etape par etape) |
| `builder-ia/` | `@dsfr-data/app-builder-ia` | Generateur de graphiques par IA (conversation avec Albert) |
| `dashboard/` | `@dsfr-data/app-dashboard` | Editeur visuel de tableaux de bord (grille, preview, save/delete) |
| `sources/` | `@dsfr-data/app-sources` | Gestionnaire de sources de donnees (API, CSV, Grist) |
| `playground/` | `@dsfr-data/app-playground` | Editeur de code interactif avec preview en direct |
| `favorites/` | `@dsfr-data/app-favorites` | Gestion des favoris (sauvegarde et consultation) |
| `monitoring/` | `@dsfr-data/app-monitoring` | Monitoring et statistiques d'usage des widgets |
| `grist-widgets/` | `@dsfr-data/app-grist-widgets` | Widgets personnalises pour l'integration Grist |

## Commandes

```bash
# Dev d'une app individuelle
npm run dev --workspace=@dsfr-data/app-builder

# Build de toutes les apps
npm run build:apps
```

## Structure commune

Chaque app contient :

```
app-name/
  package.json      # Config workspace
  vite.config.ts    # Config Vite (proxy, build)
  index.html        # Point d'entree HTML
  src/              # Code source TypeScript
  dist/             # Build output (genere)
```
