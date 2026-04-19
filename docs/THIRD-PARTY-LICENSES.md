# Third-party licenses

Ce fichier liste les licences des dépendances tierces redistribuées ou chargées dynamiquement par la bibliothèque `dsfr-data` et ses apps. Il ne vise pas à être exhaustif pour l'arbre complet des dépendances transitives — un `npm ls` ou un scan SBOM (voir `docs/security-baseline.md`) reste la source de vérité exhaustive.

Le projet `dsfr-data` lui-même est distribué sous licence **MIT** (voir [`LICENSE`](./LICENSE)).

## Bibliothèque `dsfr-data` (`packages/core/`)

| Paquet | Version | Licence | Usage |
|---|---|---|---|
| [`lit`](https://lit.dev/) | ^3.1.0 | BSD-3-Clause | Framework des Web Components |
| [`@gouvfr/dsfr-chart`](https://www.npmjs.com/package/@gouvfr/dsfr-chart) | ^2.0.4 | MIT | Composants Vue DSFR (bar/line/pie chart, map-chart) |
| [`leaflet`](https://leafletjs.com/) | ^1.9.4 | BSD-2-Clause | Moteur de carte (chargé dynamiquement) |
| [`leaflet.markercluster`](https://github.com/Leaflet/Leaflet.markercluster) | ^1.5.3 | MIT | Plugin clustering de markers (chargé dynamiquement) |
| [`leaflet.heat`](https://github.com/Leaflet/Leaflet.heat) | ^0.2.0 | BSD-2-Clause | Plugin heatmap (chargé dynamiquement) |
| [`d3-geo`](https://github.com/d3/d3-geo) | ^3.1.1 | ISC | Projection géographique pour `dsfr-data-world-map` |
| [`topojson-client`](https://github.com/topojson/topojson-client) | ^3.1.0 | ISC | Décodage TopoJSON pour `dsfr-data-world-map` |
| [`world-atlas`](https://github.com/topojson/world-atlas) | ^2.0.2 | ISC | Contours monde TopoJSON |

Les plugins Leaflet (`leaflet.markercluster`, `leaflet.heat`) sont chargés **dynamiquement via `import()`** uniquement quand un composant `dsfr-data-map-layer` les active (attributs `cluster` ou `type="heatmap"`). Ils ne sont donc pas inclus dans le bundle `dsfr-data` distribué sur npm — leur redistribution dans vos applications dépend de votre outil de build.

## Fonds de carte (runtime, non redistribués)

Les presets de tuiles fournis par `dsfr-data-map` ne redistribuent aucun contenu : ils ne font que pointer vers des services publics accessibles au runtime.

| Preset | Service | Souverainete | Conditions d'usage |
|---|---|---|---|
| `ign-plan`, `ign-ortho`, `ign-topo`, `ign-cadastre` | [Géoplateforme nationale IGN](https://geoservices.ign.fr/services-geoplateforme) | Oui (IGN, hébergée en France) | Accès sans clé API, mention de la source IGN requise (gérée automatiquement par l'attribution Leaflet) |
| `osm-fr` (alias : `osm`) | [OpenStreetMap France](https://www.openstreetmap.fr/) (association) | Non (associatif hors État) | Accès sans clé API, respect de la [Tile Usage Policy OSM France](https://www.openstreetmap.fr/). Distinct de l'OpenStreetMap Foundation. |

L'attribut `sovereign-only` du composant `<dsfr-data-map>` restreint les presets acceptés aux seules tuiles IGN.

## Serveur (`server/`)

Les licences des dépendances du backend Express (MariaDB, JWT, nodemailer, etc.) sont consultables via :

```bash
npm ls --workspace=dsfr-data-server --long 2>/dev/null \
  | grep -E "^[│├└]|license"
# ou plus lisiblement :
npx license-checker --workspace=server
```

Toutes les dépendances directes du serveur utilisent des licences permissives (MIT, Apache-2.0, BSD, ISC).

## Audits & rapports

- `npm audit` (root + `mcp-server/`) est exécuté en CI via le workflow `Security — SCA & config` (voir `.github/workflows/ci.yml`).
- Trivy scanne le système de fichiers sur chaque PR et génère un rapport SBOM-like.
- Un rapport SCA non-bloquant (seuil `MODERATE`) est publié dans le Step Summary GitHub Actions.

Pour régénérer un rapport complet de licences, utiliser :

```bash
npx license-checker --production --json > licenses-report.json
```
