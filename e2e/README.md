# e2e/

Tests end-to-end (E2E) avec Playwright.

## Contenu

| Fichier | Description | Tests |
|---------|-------------|-------|
| `smoke.spec.ts` | Tests de fonctionnement de base (chargement des apps) | 7 |
| `accessibility.spec.ts` | Tests d'accessibilite WCAG (Axe) | var. |
| `specs-live.spec.ts` | Pages specs : widgets live + pages doc-only | 11 |
| `guide-examples.spec.ts` | Pages guide : lazy-loaded + direct | 11 |
| `playground-examples.spec.ts` | Playground : 25 exemples + structure | 27 |
| `industrie-du-futur.spec.ts` | Test avec donnees reelles (16 graphiques) | 21 |
| `auth.db.spec.ts` | Tests d'authentification (mode base de donnees) | var. |
| `sharing.db.spec.ts` | Tests de partage entre utilisateurs | var. |
| `migration.db.spec.ts` | Tests de migration localStorage vers BDD | var. |
| `grist-widgets.spec.ts` | Tests d'integration Grist | var. |
| `screenshots/` | Captures d'ecran generees par les tests | — |

## Pre-requis

- Le serveur de dev doit tourner sur le port 5173 (`npm run dev`)
- Playwright doit etre installe (`npx playwright install`)

## Lancer les tests

```bash
npm run dev                                    # Dans un terminal separe
npx playwright test                            # Tous les tests E2E
npx playwright test e2e/smoke.spec.ts          # Un test specifique
```

Voir aussi `tests/builder-e2e/` pour les tests exhaustifs du builder (110 combinaisons).

---

## Tests specs, guide et playground

Ces 3 fichiers de test verifient que toutes les pages de documentation (specs, guide)
et le playground affichent correctement leurs exemples de widgets apres la normalisation
des appels API (`server-*` attributes).

### specs-live.spec.ts — Pages specs (11 tests)

Verifie que chaque page de specification affiche les bons composants :

| Page | Type | Verification |
|------|------|-------------|
| `dsfr-data-chart.html` | Donnees locales | 5 `dsfr-data-chart`, inner `bar-chart`/`line-chart`/`pie-chart`/`radar-chart` |
| `dsfr-data-kpi.html` | Donnees locales | >=8 `dsfr-data-kpi`, >=3 `dsfr-data-kpi-group` |
| `dsfr-data-list.html` | Donnees locales | >=4 `dsfr-data-list` |
| `dsfr-data-display.html` | Donnees locales | >=3 `dsfr-data-display` |
| `dsfr-data-a11y.html` | Donnees locales | >=2 `dsfr-data-a11y`, >=1 `dsfr-data-chart` |
| `dsfr-data-facets.html` | API ODS | >=4 `dsfr-data-facets`, >=3 `dsfr-data-list`, >=1 `dsfr-data-chart`, >=2 `dsfr-data-kpi` |
| `dsfr-data-search.html` | API ODS | >=3 `dsfr-data-search`, >=1 `dsfr-data-list` |
| `dsfr-data-world-map.html` | API + topojson | >=1 `dsfr-data-world-map`, SVG rendu |
| `dsfr-data-source.html` | Doc-only | Page charge, layout present, pas d'erreurs console |
| `dsfr-data-query.html` | Doc-only | Idem |
| `dsfr-data-normalize.html` | Doc-only | Idem |

Timeouts : 60s (donnees locales), 120s (API externes). Screenshots dans `screenshots/specs/`.

### guide-examples.spec.ts — Pages guide (11 tests)

**Pages lazy-loaded (6 tests)** — utilisent `IntersectionObserver` pour charger les exemples au scroll :

| Page | Exemples attendus |
|------|------------------|
| `guide-exemples-source.html` | >=11 |
| `guide-exemples-query.html` | >=15 |
| `guide-exemples-normalize.html` | >=3 |
| `guide-exemples-search.html` | >=4 |
| `guide-exemples-facets.html` | >=5 |
| `guide-exemples-display.html` | >=4 |

Strategie : scroll incremental (400px par pas, 3 passes) pour declencher tous les observers,
puis verification que les `.example-container` ont ete crees avec un `dsfr-data-source` chacun.

**Pages directes (5 tests)** — widgets directement dans le HTML :

| Page | Widgets verifies |
|------|-----------------|
| `guide-exemples-chart-a11y.html` | `dsfr-data-a11y`, `dsfr-data-chart` |
| `guide-exemples-ghibli.html` | `dsfr-data-kpi`, `dsfr-data-chart` |
| `guide-exemples-maires.html` | `dsfr-data-kpi`, `dsfr-data-chart` |
| `guide-exemples-world-map.html` | `dsfr-data-world-map`, `dsfr-data-chart` |
| `guide-exemples-insee-erfs.html` | `dsfr-data-chart`, `dsfr-data-kpi` |

Timeout : 120s. Screenshots dans `screenshots/guide/`.

### playground-examples.spec.ts — Playground (27 tests)

**Tests structurels (2 tests)** :
- Le `<select id="example-select">` contient 25 options
- Les boutons run/reset/deps/copy/save sont presents

**Tests des 25 exemples** — pour chaque cle, charge `?example=<key>` puis :
1. Verifie que CodeMirror contient du code
2. Clique "Executer"
3. Accede a l'iframe `#preview-frame` via `page.frameLocator()`
4. Verifie que `dsfr-data-source` est present dans l'iframe
5. Verifie que le widget visuel principal est present
6. Screenshot viewport

Les exemples API soft-fail avec warning (reseau), l'exemple inline (`direct-worldmap`) hard-fail.

Timeout : 120s. Screenshots dans `screenshots/playground/`.

### Lancer les 3 fichiers

```bash
# Pre-requis : serveur de dev sur port 5173
npm run dev

# Lancer les 3 fichiers de test
npx playwright test e2e/specs-live.spec.ts e2e/guide-examples.spec.ts e2e/playground-examples.spec.ts

# Verifier les screenshots
ls e2e/screenshots/specs/ e2e/screenshots/guide/ e2e/screenshots/playground/
```

Resultats attendus : 49 tests, 47 screenshots.
