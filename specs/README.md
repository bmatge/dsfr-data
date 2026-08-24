# specs/

Spécifications et pages de démonstration des composants `dsfr-data`. C'est la référence
du comportement, des attributs (types, valeurs, défauts), des événements et des API JS
de chaque composant.

## Contenu

- `index.html` — page d'accueil : architecture, tuiles vers toutes les pages.
- `components/` — 21 pages de spécification :
  - **Pipeline de données** : `dsfr-data-source`, `dsfr-data-normalize`, `dsfr-data-query`,
    `dsfr-data-join`, `dsfr-data-unpivot`
  - **Filtres et recherche** : `dsfr-data-facets`, `dsfr-data-search`, `dsfr-data-context`
    (+ `context-filter` et `context-tags` documentés sur la même page)
  - **Affichage** : `dsfr-data-list`, `dsfr-data-display`, `dsfr-data-kpi` (+ `kpi-group`),
    `dsfr-data-podium`, `dsfr-data-chart`
  - **Cartographie** (famille de 5 composants, bundle dédié `dsfr-data.map.esm.js`) :
    `dsfr-data-map` (conteneur + vue d'ensemble), `dsfr-data-map-layer`, `dsfr-data-map-popup`,
    `dsfr-data-map-inset`, `dsfr-data-map-timeline`
  - **Transverses** : `dsfr-data-a11y`, `dsfr-data-beacon`
- `charts/` — 8 pages sur les composants DSFR Chart natifs : `index.html` (vue d'ensemble
  avec démos), `bar`, `line`, `pie`, `radar`, `gauge`, `scatter`, `map`.
- `apis/` — 5 pages sur les providers du mode adapter (`api-type`) : `opendatasoft`,
  `tabular` (data.gouv.fr), `grist`, `insee` (Melodi), `generic` (REST fallback).
- `roadmap.html` — feuille de route publique (grille de maturité, jalons), qui dogfoode
  les composants (`kpi-group`, `chart`, `a11y`).
- `FR-002-auth-rbac-proconnect.md` — spécification fonctionnelle auth/RBAC/ProConnect
  (document de travail, hors pages HTML).

## Consultation

- **En dev** : `npm run dev` puis <http://localhost:5173/specs/index.html>. Les pages chargent
  les bundles locaux `/dist/dsfr-data.esm.js` et `/dist/app-ui.esm.js` (construits par
  `npm run build` / `npm run build:all`).
- **En prod** : les pages sont servies par l'application déployée (hub) sous `/specs/`,
  par exemple <https://chartsbuilder.miweb.run/specs/index.html>.

La navigation (sidemenu, fil d'Ariane) est rendue par le composant `app-layout-demo` de
`packages/app-ui/src/app-layout-demo.ts` : toute nouvelle page doit y être déclarée.
