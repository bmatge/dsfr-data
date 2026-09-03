# Third-party licenses

Ce fichier liste les licences des dépendances tierces redistribuées ou chargées dynamiquement par la bibliothèque `dsfr-data` et ses apps. Il ne vise pas à être exhaustif pour l'arbre complet des dépendances transitives — un `npm ls` ou un scan SBOM (voir `docs/security-baseline.md`) reste la source de vérité exhaustive.

Le projet `dsfr-data` lui-même est distribué sous licence **MIT** (voir [`LICENSE`](./LICENSE)).

## Bibliothèque `dsfr-data` (`packages/core/`)

| Paquet | Version | Licence | Usage |
|---|---|---|---|
| [`lit`](https://lit.dev/) | ^3.1.0 | BSD-3-Clause | Framework des Web Components |
| [`@gouvfr/dsfr-chart`](https://github.com/GouvernementFR/dsfr-chart) | ^2.1.1 | MIT | Composants Vue DSFR (bar/line/pie chart, map-chart avec API cartes unifiee `level`) |
| [`leaflet`](https://leafletjs.com/) | ^1.9.4 | BSD-2-Clause | Moteur de carte (chargé dynamiquement) |
| [`leaflet.markercluster`](https://github.com/Leaflet/Leaflet.markercluster) | ^1.5.3 | MIT | Plugin clustering de markers (chargé dynamiquement) |
| [`leaflet.heat`](https://github.com/Leaflet/Leaflet.heat) | ^0.2.0 | BSD-2-Clause | Plugin heatmap (chargé dynamiquement) |

Les plugins Leaflet (`leaflet.markercluster`, `leaflet.heat`) sont chargés **dynamiquement via `import()`** uniquement quand un composant `dsfr-data-map-layer` les active (attributs `cluster` ou `type="heatmap"`). Ils ne sont donc pas inclus dans le bundle `dsfr-data` distribué sur npm — leur redistribution dans vos applications dépend de votre outil de build.

## Fonds de carte (runtime, non redistribués)

Les presets de tuiles fournis par `dsfr-data-map` ne redistribuent aucun contenu : ils ne font que pointer vers des services publics accessibles au runtime.

| Preset | Service | Souverainete | Conditions d'usage |
|---|---|---|---|
| `ign-plan`, `ign-ortho`, `ign-cadastre` | [Géoplateforme nationale IGN](https://geoservices.ign.fr/services-geoplateforme) | Oui (IGN, hébergée en France) | Accès sans clé API, mention de la source IGN requise (gérée automatiquement par l'attribution Leaflet) |
| `ign-topo` (déprécié) | — | — | Redirigé vers `ign-plan` avec avertissement console : la couche BDUNI.J1 rendait un fond quasi vide et les couches topographiques SCAN de la Géoplateforme exigent une clé API |
| `osm-fr` (alias : `osm`) | [OpenStreetMap France](https://www.openstreetmap.fr/) (association) | Non (associatif hors État) | Accès sans clé API, conditions **cumulatives** de la [politique d'usage OSM France](https://www.openstreetmap.fr/usage/) : attribution visible, **site public sans login ni intranet**, site sans but lucratif, trafic modéré. Aucune garantie de disponibilité, suspension possible sans préavis. Distinct de l'OpenStreetMap Foundation. |
| `osm-standard` | [OpenStreetMap Foundation](https://www.openstreetmap.org/) | Non | Accès sans clé API, respect de la [Tile Usage Policy OSMF](https://operations.osmfoundation.org/policies/tiles/) : attribution visible, `Referer` non supprimé (le composant fixe la `referrerPolicy`), pas de pré-chargement ni d'usage hors ligne. Disponibilité best effort, sans SLA. Données © contributeurs OpenStreetMap (ODbL). |
| `carto-positron`, `carto-dark` (dépréciés) | — | — | Redirigés vers `ign-plan` avec avertissement console (#576) : [CARTO exige désormais une clé API](https://carto.com/basemaps/apikey) et filigrane les tuiles anonymes. La clé est nominative (« do not share it ») et le service raster est en cours de retrait — voir « Utiliser un fond de carte à clé » ci-dessous. |
| `opentopomap` | [OpenTopoMap](https://opentopomap.org/) (communautaire) | Non | Accès sans clé API, rendu sous licence CC-BY-SA, données © contributeurs OpenStreetMap + SRTM. |

L'attribut `sovereign-only` du composant `<dsfr-data-map>` restreint les presets acceptés aux seules tuiles IGN.

### Utiliser un fond de carte à clé

Aucun preset n'exige de clé, et la bibliothèque n'en portera pas : une clé de tuiles transite
forcément en clair dans le navigateur du visiteur, et les fournisseurs la rattachent à un
domaine et à un quota nominatifs. **C'est le déployeur qui porte le quota et la responsabilité
d'usage**, pas `dsfr-data`.

Pour utiliser un fond à clé, passer l'URL complète et sa mention d'attribution :

```html
<dsfr-data-map
  tiles="https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=VOTRE_CLE"
  tiles-attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'>
</dsfr-data-map>
```

`tiles-attribution` est **obligatoire** sur une URL custom : sans elle la carte s'affiche sans
mention, ce qui n'est conforme ni à l'ODbL ni aux CGU des fournisseurs. Le composant émet un
`console.warn` si l'attribut manque.

Quatre façons de protéger la clé, de la plus simple à la plus engageante :

1. **Restriction par domaine** chez le fournisseur, quand il la propose — l'exposition de la clé
   dans le HTML devient alors le fonctionnement prévu, pas une faille.
2. **Proxy local**, hébergé par l'intégrateur pour son seul site — léger à cette échelle. Pour
   les tuiles OSM, ne pas supprimer le `Referer` ni masquer le `User-Agent` : la policy OSMF
   l'interdit.
3. **Jeton éphémère**, si le fournisseur le supporte.
4. **Fond sans clé** — les presets IGN, qui ne demandent rien.

Limites du souverain, énoncées franchement : la Géoplateforme ne propose **pas de fond sombre**
et couvre la **France seulement**. Un preset tiers qui comblerait ce manque fait illusion jusqu'au
jour où il casse — c'est exactement ce qui vient d'arriver à CARTO.

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
