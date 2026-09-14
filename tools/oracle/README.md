# Oracle de non-régression numérique

Deux implémentations indépendantes doivent donner le même chiffre **au même instant** :

1. `npm run oracle:expected` — `tools/oracle/run.ts` télécharge les lignes **brutes** de chaque
   contrôle (export JSON Opendatasoft, clause ODSQL écrite à la main dans `manifest.ts`) et
   recalcule en tableaux nus (`compute.ts`). Résultat : `tools/oracle/out/expected.json`.
2. `npx playwright test --config e2e/playwright.config.ts e2e/oracle.spec.ts` — rend le balisage
   de chaque contrôle avec la lib **depuis la source**, contre la vraie API, lit les KPI affichés
   et les lignes des queries, et compare à l'attendu à la précision affichée.

`npm run oracle` enchaîne les deux. Rien n'est figé : un jeu qui vit change les deux côtés.

**Indépendance** : `tools/oracle` n'importe rien de `packages/` ni de `@dsfr-data/*`
(`tests/oracle/guard.test.ts`). Si la lib et l'oracle se trompent, ce n'est pas de la même façon.

**Déclenchement** : `.github/workflows/oracle.yml` — la nuit, à la demande, et sur une PR portant
le label `oracle`. Jamais bloquant sur toutes les PR : il dépend des API tierces.

**Ajouter un contrôle** : une entrée dans `CHECKS` (`manifest.ts`), venue d'une reproduction du banc
open-data-viz — de préférence un cas qui a déjà menti (#765, #810, #763, #792).
