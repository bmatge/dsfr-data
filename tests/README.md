# tests/

Tests unitaires et d'integration (Vitest).

## Structure

```
tests/
  dsfr-data-source.test.ts        # Tests des composants web
  dsfr-data-query.test.ts
  dsfr-data-facets.test.ts
  ...
  aggregations.test.ts        # Tests des utilitaires
  chart-data.test.ts
  data-bridge.test.ts
  json-path.test.ts
  formatters.test.ts
  beacon.test.ts
  integration.test.ts         # Tests multi-composants
  adapters/                   # Tests des adaptateurs (ODS, Tabular, Grist)
  shared/                     # Tests du package @dsfr-data/shared
  apps/                       # Tests des applications (builder, builder-ia, dashboard, etc.)
  server/                     # Tests du serveur Express
  builder-e2e/                # Tests exhaustifs du builder (Playwright, 110 combinaisons)
```

## Commandes

```bash
npm run test            # Watch mode
npm run test:run        # Execution unique
npm run test:coverage   # Avec couverture de code
```

## Convention

- Fichiers nommes `*.test.ts`
- Un fichier de test par composant / module
- Les tests du builder-ia (`apps/builder-ia/skills.test.ts`) verifient l'alignement entre les composants et les skills IA
