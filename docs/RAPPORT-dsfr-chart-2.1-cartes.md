# Rapport — Évolutions DSFR Chart 2.1.x : intégration des nouveautés & avenir de `dsfr-data-world-map`

> Analyse demandée le 2026-07-16. Sources : dépôt local `dsfr-data` (branche
> `claude/dsfr-charts-updates-wlju9n`) + upstream [`GouvernementFR/dsfr-chart`](https://github.com/GouvernementFR/dsfr-chart)
> vérifié **au tag publié `v2.1.1`** (README + CHANGELOG + registre npm).

## Synthèse (TL;DR)

1. **Version upstream courante : `2.1.1`.** C'est **déjà** la version déclarée dans
   `packages/core/package.json` (`@gouvfr/dsfr-chart: ^2.1.1`) **et** dans la source
   unique `packages/shared/src/templates/cdn-versions.ts` (`dsfrChart: '2.1.1'`).
   Le runtime des apps (previews builder/playground/favorites, embeds générés) tourne
   donc **déjà** sur 2.1.1.

2. **Nouveauté phare (v2.1.0) : API cartes unifiée.** Un seul tag `<map-chart>` avec un
   attribut `level` ∈ `{dep, reg, aca, monde}`. Les cartes **académiques** (`aca`) et
   **mondiale** (`monde`) sont **nouvelles**. La carte régionale nationale (`reg`) via
   `<map-chart level="reg">` **corrige la limitation connue** de `<map-chart-reg>`.

3. **BREAKING v2.1.0 : DataBox `title` → `name`** (conflit avec l'attribut HTML `title`).
   ⚠️ **Notre code pose toujours `title`** (`dsfr-data-chart.ts:1121` + embed
   `apps/builder/src/ui/code-generator.ts:119`). Comme le runtime est déjà en 2.1.1,
   **le titre de DataBox est déjà cassé en preview/prod** → correctif P0.

4. **Décalage documentaire.** La doc statique HTML (`guide/`, `specs/`, `README.md`,
   quelques `apps/*/index.html`) référence encore le CDN **`2.0.4` en dur (96 occurrences)**,
   avec des hash SRI figés sur 2.0.4. À bumper vers 2.1.1.

5. **World map.** DSFR Chart fournit maintenant `<map-chart level="monde">`. On **peut**
   décommissionner le composant natif `dsfr-data-world-map` (d3-geo + topojson, bundle
   séparé ~31 Ko + asset 140 Ko), **au prix de deux fonctionnalités** : le **zoom
   continent interactif** et le support **iso-a3 / iso-num** (upstream = iso-a2 seul).
   Recommandation détaillée §4.

---

## 1. Comment DSFR Chart est intégré aujourd'hui

### 1.1 Modèle d'intégration (pas de bundling)

`@gouvfr/dsfr-chart` est une **devDependency** (jamais bundlée dans `dsfr-data`).
La page hôte charge `DSFRChart.js`/`.css` (+ `chart.js`) par CDN ; notre composant
`dsfr-data-chart` **crée les custom elements Vue** (`<bar-chart>`, `<map-chart>`…) par
`document.createElement` et les alimente via le data-bridge. Il n'existe **aucun loader
CDN runtime** dans `packages/core/src` : si l'hôte n'a pas chargé DSFR Chart, les tags
restent inertes.

Conséquence : la version « qui compte » est celle du **CDN chargé par l'hôte**, pas celle
de `node_modules`.

### 1.2 Source unique de version + garde-fou

`packages/shared/src/templates/cdn-versions.ts` centralise versions et URLs CDN
(`CDN_VERSIONS.dsfrChart = '2.1.1'`). Le test `tests/shared/cdn-versions-alignment.test.ts`
**échoue si `cdn-versions.ts` diverge de la dépendance installée**. Les apps
(playground/builder/favorites) génèrent leurs previews/embeds via `getPreviewHTML()` et
consomment donc **toujours 2.1.1**.

> **Deux mondes de version cohabitent :**
> - **Généré par les apps** (previews, embeds copiés par l'utilisateur) → `cdn-versions.ts` → **2.1.1** ✅
> - **Doc statique** (`guide/*.html`, `specs/*.html`, `README.md`, `apps/*/index.html`) → **`2.0.4` en dur** ❌

### 1.3 Mapping des types de graphiques

`packages/core/src/components/dsfr-data-chart.ts` (`CHART_TAG_MAP`) :

| `type` (notre API) | tag DSFR Chart | Notes |
|---|---|---|
| `line` / `bar` / `pie` / `radar` / `scatter` / `gauge` | `line-chart`… | cartésiens + jauge |
| `bar-line` | `bar-line-chart` | `name-bar`/`name-line` |
| `map` | `map-chart` | départements (aucun `level` posé → défaut `dep`) |
| `map-reg` | `map-chart-reg` | ⚠️ voir §2.1 (bug régional + `region` requis) |

Attributs carte posés en `deferred` (setTimeout 500 ms) car les web components Vue de
DSFR Chart écrasent `value`/`date` à leur montage (couplage documenté
`ARCHITECTURE.md:634`).

---

## 2. Les nouveautés 2.1.x en détail (vérifié au tag `v2.1.1`)

### 2.1 API cartes unifiée via `level`

`<map-chart>` accepte désormais `level` ∈ **`dep` | `reg` | `aca` | `monde`** :

| `level` | Découpage | Format des clés de `data` | Exemple |
|---|---|---|---|
| `dep` (défaut) | Départements | code département (`"01"`, `"75"`) | `<map-chart data='{"01":10}' level="dep">` |
| `reg` | **Régions (national)** | code région (`"11"`, `"84"`) | `<map-chart data='{"11":95}' level="reg">` |
| `aca` | **Académies** *(nouveau)* | nom d'académie majuscule (`"PARIS"`, `"LYON"`, `"STRASBOURG"`) | `<map-chart data='{"PARIS":100}' level="aca">` |
| `monde` | **Monde** *(nouveau)* | **ISO 3166-1 alpha-2** (`"FR"`, `"US"`, `"DE"`) | `<map-chart data='{"FR":100,"US":72}' level="monde">` |

`<map-chart-reg region="…">` **subsiste mais change de rôle** : il **zoome sur UNE région**
et attend des clés `data` par **département** de cette région (ex. `region="11"` +
`data='{"75":…,"92":…}'`). Ce n'est **pas** la carte nationale des régions — c'est
`level="reg"` qui la fournit.

> **Ce que ça corrige chez nous :** `specs/charts/map-chart.html:48` documente la
> « limitation connue » de `<map-chart-reg>` en 2.0.4 (« affiche un découpage
> départemental au lieu de régional »). Notre type `map-reg` route vers `<map-chart-reg>`
> **sans** attribut `region` (`dsfr-data-chart.ts` §`_getTypeSpecificAttributes`,
> `builder-ia/.../code-generator.ts:482`). **Passer à `<map-chart level="reg">` résout
> cette limitation** et clarifie la sémantique.

### 2.2 BREAKING — DataBox `title` → `name`

En v2.1.0, `<data-box>` **renomme `title` en `name`** (pour lever le conflit avec
l'attribut HTML natif `title`). Les autres attributs (`source`, `date`, `tooltip-title`,
`modal-title`, `download`, `screenshot`, `fullscreen`, `actions`…) sont inchangés ;
`heading-level` et `description` apparaissent en complément.

⚠️ **Impact immédiat** — nous posons encore `title` :
- `packages/core/src/components/dsfr-data-chart.ts:1121`
  `databoxEl.setAttribute('title', this.databoxTitle || ' ');`
- `apps/builder/src/ui/code-generator.ts:119`
  `dbAttrs.push(\`title="…"\`)` (embed copié par l'utilisateur)

Comme le runtime est **déjà** en 2.1.1, l'en-tête de DataBox **ne s'affiche déjà plus**.

### 2.3 Autres évolutions v2.1.0 / v2.1.1

- Cartes : correction des **pays manquants**, **standardisation des noms de pays en
  français**, correctifs de **zoom DROM** (Outre-mer).
- Radar : options d'échelle **min/max**.
- Jauge : rendu **bleu** par défaut.
- Légende (camembert via `nameParse`) et **tooltip** (header en `innerText`, styles inline
  retirés en 2.1.1) corrigés.
- Dépendances : **`d3-scale` retiré** upstream ; migration Sass ; `process.env` sur imports
  statiques corrigé (2.1.1) ; ajout du champ `engines` (Node ^20.19/^22.12/≥24).

---

## 3. Plan d'intégration des nouveautés (par priorité)

### P0 — Correctif DataBox `title` → `name` *(bug actif)*

- `dsfr-data-chart.ts:1121` : poser **`name`** (option robuste : poser `name` **et** `title`
  pour rester compatible si un hôte charge encore un CDN 2.0.x).
- `apps/builder/src/ui/code-generator.ts:119` : générer `name="…"` (idem, éventuellement
  les deux).
- Vérifier `apps/builder-ia/src/ui/code-generator.ts` / `chart-renderer.ts` (génération/rendu
  DataBox) — aligner s'ils émettent `title`.
- Aucun changement d'API publique de `dsfr-data-chart` : `databox-title` reste **notre**
  attribut ; seule la traduction vers le tag natif change.

### P1 — Migrer `map-reg` vers `level="reg"`

- Dans `_getTypeSpecificAttributes()` : pour `map`/`map-reg`, router vers **`<map-chart>`**
  en posant `level="dep"` / `level="reg"` plutôt que de basculer sur `<map-chart-reg>`.
- Met fin à la limitation connue et retire le besoin de l'attribut `region`.
- Répercuter dans les générateurs d'embed (`builder-ia/.../code-generator.ts:482`,
  `builder-ia/.../chart-renderer.ts:354`) et les specs/guide qui décrivent la limitation.

### P2 — Ajouter les nouveaux types `map-aca` et `map-monde`

Extension de `DSFRChartType` + `CHART_TAG_MAP` (tous → `map-chart` avec le bon `level`) :

| Nouveau `type` | tag / attribut | Clés `data` à construire dans `_processMapData()` |
|---|---|---|
| `map-aca` | `<map-chart level="aca">` | nom d'académie (pas de padding numérique, pas de validation dept) |
| `map-monde` (ou `world`) | `<map-chart level="monde">` | **ISO alpha-2** (convertir depuis a3/num via nos lookups `continent-lookup.ts`) |

À toucher en cascade (couplage `ARCHITECTURE.md:706` — tout attribut/type ajouté **doit**
être reflété dans les skills) :
- `apps/builder-ia/src/skills.ts` (tableau des types + doc) → sinon
  `tests/apps/builder-ia/skills.test.ts` casse.
- UI builder-ia (`chart-renderer.ts`, `code-generator.ts`), `apps/grist-widgets/src/chart.ts`
  (menu déroulant des types), specs `specs/charts/map-chart.html`.
- `_getAriaLabel()` : libellés « carte académies » / « carte monde ».

### P3 — Bumper la doc statique `2.0.4` → `2.1.1` (96 occurrences)

- `README.md`, `guide/*.html` (15), `guide/examples/*` (6), `specs/charts/*` (8),
  `specs/components/*` (5), `specs/*.html` (2), `apps/{playground,favorites,dashboard,builder,builder-ia,grist-widgets}` (index.html/src), `e2e/industrie-du-futur.html`.
- **Retirer les attributs `integrity`/SRI** figés sur 2.0.4 (sinon le navigateur rejette
  2.1.1), ou recalculer les hash 2.1.1.
- `tests/apps/dashboard/dashboards.test.ts:21-23` attend les URLs 2.0.4 → mettre à jour.
- Idéal : faire pointer un maximum de ces pages/tests sur `CDN_URLS` (`cdn-versions.ts`)
  pour supprimer la version en dur (dette récurrente — cf. #322).

### P4 — Validation empirique (obligatoire, `ARCHITECTURE.md:714`)

- `npm run build` puis lancer une preview réelle (playground) de chaque carte
  (`dep`/`reg`/`aca`/`monde`) + une DataBox → vérifier titre visible et cartes correctes.
- `npm run test:run` (dont `skills.test.ts`, `cdn-versions-alignment.test.ts`).

---

## 4. Avenir de `dsfr-data-world-map` (décommission ?)

### 4.1 Ce que fait le composant natif (`packages/core/src/components/dsfr-data-world-map.ts`)

Composant **Lit natif** (SVG, projection Natural Earth, d3-geo + topojson), **bundle séparé**
`dsfr-data.world-map.esm.js` (~31 Ko) chargé en plus du core, + asset topojson
`world-countries-110m.json` (~140 Ko) lazy-loadé.

Fonctionnalités :
- Choropleth par valeur, **3 formats de code** : `iso-a2` / `iso-a3` / `iso-num`.
- **Zoom continent interactif** (clic pays → zoom continent, bouton retour).
- **Noms de pays FR** (`data/country-names.ts`), lookup continent (`data/continent-lookup.ts`).
- Palettes **maison** `CHOROPLETH_SCALES` (`@dsfr-data/shared`, partagées avec `map-layer`).
- **A11y clavier** : chaque pays focusable, `aria-label` nom+valeur, Entrée/Espace = clic.
- Tooltip + légende, connexion directe à `dsfr-data-source` via `SourceSubscriberMixin`.

### 4.2 Ce que fait `<map-chart level="monde">` (upstream 2.1.1)

- Choropleth par valeur, clés **ISO alpha-2** uniquement.
- `name`, `value`, `date`, `selected-palette` ; **noms pays FR** standardisés (v2.1.0).
- Rendu Chart.js/Vue **cohérent** avec les autres `map-chart` ; bénéficie de la DataBox
  native (exploration, téléchargement, plein écran) via `dsfr-data-chart databox`.

### 4.3 Écarts / risques

| | `dsfr-data-world-map` (natif) | `<map-chart level="monde">` |
|---|---|---|
| Formats de code | iso-a2 **+ a3 + num** | **a2 seul** (conversion amont requise) |
| Zoom continent | **oui, interactif** | non (à confirmer empiriquement) |
| A11y clavier par pays | **oui** | à vérifier |
| Palettes | `CHOROPLETH_SCALES` maison | palettes DSFR Chart (noms à mapper) |
| Poids | +31 Ko bundle +140 Ko asset + d3-geo/topojson/world-atlas | 0 (déjà chargé avec DSFR Chart) |
| Maintenance | **à notre charge** | **déléguée à l'État** |
| Intégration data | `source` directe | via `dsfr-data-chart type="map-monde"` |

**Perte fonctionnelle nette** en cas de retrait : le **zoom continent** et le support
**iso-a3 / iso-num** (contournable : convertir en a2 dans `_processMapData()` grâce aux
lookups déjà présents dans `continent-lookup.ts`).

### 4.4 Options

- **Option A — Décommission progressive (recommandée si le zoom continent n'est pas
  critique).** Ajouter `type="map-monde"` à `dsfr-data-chart` (→ `<map-chart level="monde">`,
  P2). Marquer `dsfr-data-world-map` **déprécié** (warn console) pendant un cycle de
  release, puis retirer le composant, le bundle et les dépendances d3-geo/topojson/world-atlas.
- **Option B — Statu quo.** Conserver le natif si le **zoom continent** ou **iso-a3/num**
  sont des exigences produit. On garde alors deux implémentations « monde ».
- **Option C — Wrapper de transition.** Réécrire `dsfr-data-world-map` comme **fin wrapper**
  de `<map-chart level="monde">` : on **conserve l'API publique et le binding `source`**
  (compat ascendante), on **supprime d3-geo/topojson/world-atlas et l'asset 140 Ko**, mais
  on **perd le zoom continent**. Bon compromis si des intégrations tierces utilisent déjà
  la balise `dsfr-data-world-map`.

### 4.5 Checklist de retrait (Options A ou C) — consommateurs à traiter

**Lib / build :**
- `packages/core/package.json` : export `./world-map` (l.24-27) ; devDeps `d3-geo`,
  `topojson-client`, `world-atlas`, `@types/d3-geo`, `@types/topojson-client`,
  `@types/topojson-specification` (retirables — **non utilisés ailleurs** ; Leaflet est
  indépendant).
- `packages/core/src/index.ts:24`, `index-world-map.ts`, `index-core.ts:5` (commentaire),
  `scripts/build-lib.ts:88-100` (bundle world-map).
- Composant `dsfr-data-world-map.ts` + assets `data/country-names.ts`,
  `data/continent-lookup.ts`, `world-countries-110m.json`.
  ⚠️ **Ne pas** retirer `CHOROPLETH_SCALES` (`shared/.../dsfr-palettes.ts`) : **partagé**
  avec `dsfr-data-map-layer`.

**Apps / doc / tests :**
- `apps/builder-ia/src/skills.ts:2247-2318` (skill), `apps/playground/{index.html,
  src/examples/examples-data.ts}`, `apps/pipeline-helper/src/html-parser.ts`,
  `packages/app-ui/src/app-layout-demo.ts`.
- `guide/guide-exemples-world-map.html`, `guide/guide-demo-complete.html`,
  `guide/guide-menu.js`, `specs/components/dsfr-data-world-map.html`, `specs/index.html`,
  `index.html`.
- e2e : `guide-examples.spec.ts`, `playground-examples.spec.ts`, `specs-live.spec.ts`.
- tests : `dsfr-data-world-map.test.ts`, `world-map-a11y.test.ts`,
  `display-states-harmonized.test.ts`, `palettes-unified.test.ts`.
- `docs/THIRD-PARTY-LICENSES.md` (d3-geo/topojson/world-atlas), `docs/ARCHITECTURE.md:428`
  (table des bundles), `packages/core/src/README.md`.
- Nettoyer aussi le fichier parasite `packages/core/package 2.json` (doublon).

---

## 5. Fichiers impactés (récapitulatif)

| Priorité | Fichier | Action |
|---|---|---|
| P0 | `packages/core/src/components/dsfr-data-chart.ts:1121` | `title` → `name` (DataBox) |
| P0 | `apps/builder/src/ui/code-generator.ts:119` | `title` → `name` (embed) |
| P0 | `apps/builder-ia/src/ui/*` | vérifier génération/rendu DataBox |
| P1 | `dsfr-data-chart.ts` (`CHART_TAG_MAP`, `_getTypeSpecificAttributes`) | `map-reg` → `level="reg"` |
| P2 | `dsfr-data-chart.ts`, `skills.ts`, builder-ia UI, `grist-widgets/chart.ts`, specs | types `map-aca`, `map-monde` |
| P3 | `README.md`, `guide/*`, `specs/*`, `apps/*/index.html`, `dashboards.test.ts`, `e2e` | CDN `2.0.4` → `2.1.1` + SRI |
| P4/§4 | (voir checklist §4.5) | décommission world-map (si Option A/C) |

## 6. Tests & garde-fous à mettre à jour

- `tests/apps/builder-ia/skills.test.ts` — introspection Lit : tout nouvel attribut/type
  **doit** être documenté dans `skills.ts`.
- `tests/shared/cdn-versions-alignment.test.ts` — déjà aligné (2.1.1) ; ne pas casser.
- `tests/apps/dashboard/dashboards.test.ts` — URLs CDN 2.0.4 → 2.1.1.
- Tests world-map (si décommission) — supprimer/adapter.
- Après build : **grep des bundles** `packages/core/dist/` + preview réelle des 4 cartes.

## 7. Changeset & release

- P0–P2 touchent `packages/core/src` → **changeset requis** (`npx changeset`).
  - P0 (DataBox) = **patch** (correctif de compat).
  - P1 (`level="reg"`) = **patch/minor** (corrige un comportement).
  - P2 (types `map-aca`/`map-monde`) = **minor** (nouvelles fonctionnalités).
  - Décommission world-map = **major** si retrait de l'export public `./world-map`
    (Option A) ; Option C (wrapper) peut rester **minor** en conservant l'API.
- P3 (doc/CDN) = pas de changeset (hors `core/src`).
