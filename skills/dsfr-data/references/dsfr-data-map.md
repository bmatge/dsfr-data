# dsfr-data-map

> Carte interactive Leaflet multi-couches avec POI, geoshape, cercles, clustering et chargement par viewport
>
> Déclencheurs : carte, map, leaflet, poi, marker, geoshape, geojson, clustering, bbox, viewport, tuiles, ign, geoplateforme, cercles proportionnels, heatmap, carte interactive, geo_point, geo_shape, choropleth carte, map layer, timeline, animation temporelle, carte animee, evolution temporelle, color-map, couleur catégorielle, couleur par valeur, souverainete, sovereign-only, osm-fr

## dsfr-data-map + dsfr-data-map-layer — Carte interactive multi-couches

Deux composants complementaires :
- `dsfr-data-map` : conteneur carte (init Leaflet, tuiles, viewport). **Ne consomme pas de données.**
- `dsfr-data-map-layer` : couche de données (markers, geoshape, circle, heatmap). Utilise `SourceSubscriberMixin`.

Cela permet le **multi-source** naturellement : chaque layer a sa propre source.

### Chargement du bundle

```html
<script src="${'https://cdn.jsdelivr.net/npm/dsfr-data@0/dist'}/dsfr-data.map.umd.js"></script>
```

Ou via le bundle complet `dsfr-data.esm.js` / `dsfr-data.umd.js`.
Leaflet est charge dynamiquement (pas inclus dans le bundle).

### Attributs dsfr-data-map (conteneur)

| Attribut | Type | Défaut | Description |
|----------|------|--------|-------------|
| center | String | `"46.603,2.888"` | Centre initial `"lat,lon"` |
| zoom | Number | `6` | Zoom initial (1-18) |
| min-zoom | Number | `2` | Zoom minimum |
| max-zoom | Number | `18` | Zoom maximum |
| height | String | `"500px"` | Hauteur CSS (px, vh, rem). Un `%` est un ratio de la largeur (ex: `"60%"` = 60% de la largeur) |
| tiles | String | `"ign-plan"` | Fond de carte : `ign-plan`, `ign-ortho`, `ign-cadastre`, `osm-fr` (alias : `osm`), `osm-standard`, `carto-positron`, `carto-dark`, `opentopomap`, ou URL template. `ign-topo` est deprecie (redirige vers `ign-plan` avec warning) |
| sovereign-only | Boolean | `false` | Restreint `tiles` aux presets IGN souverains. Tout autre preset (`osm-fr`, `carto-*`, `opentopomap`...) ou URL custom est refuse avec `console.warn` et remplace par `ign-plan`. |
| no-controls | Boolean | `false` | Masque les controles de zoom |
| locked | Boolean | `false` | Carte verrouillee : aucune interaction (pan/zoom/clavier) — encarts, vignettes |
| insets | String | `""` | Raccourci encarts territoriaux : groupe et/ou territoires nommes (`"drom"`, `"drom,corse"`) |
| fit-bounds | Boolean | `false` | Ajuste le viewport aux données a chaque mise a jour (combine a max-bounds : emprise clippee a la zone — les DROM ne dezooment pas la vue, un filtre regional zoome dessus) |
| max-bounds | String | `""` | Limites `"latSW,lonSW,latNE,lonNE"` |
| name | String | `""` | Titre (aria-label) |

### Attributs dsfr-data-map-layer (couche)

| Attribut | Type | Défaut | Description |
|----------|------|--------|-------------|
| source | String | `""` | ID de la source (requis) |
| type | String | `"marker"` | `marker`, `geoshape`, `circle`, `heatmap` |
| lat-field | String | `""` | Chemin vers latitude |
| lon-field | String | `""` | Chemin vers longitude |
| geo-field | String | `""` | Chemin vers GeoJSON (Point, Polygon) — objet ou chaine JSON serialisee (colonnes Text Grist/CSV) |
| shape-class | String | `""` | Classe CSS appliquee aux traces SVG (geoshape/circle) — motifs hachures via <pattern> defini par la page |
| no-interactive | Boolean | `false` | Couche decorative : aucun clic/tooltip/popup (contours administratifs, habillage) |
| popup-template | String | `""` | Template : `"{nom} — {val} kW"` |
| popup-fields | String | `""` | Champs pour tableau auto : `"nom,adresse"` |
| tooltip-field | String | `""` | Champ affiche au survol |
| color | String | `"#000091"` | Couleur (DSFR blue-france). Fallback si color-map ne matche pas |
| color-field | String | `""` | Champ dont la valeur determine la couleur (mapping catégoriel) |
| color-map | String | `""` | Paires `valeur:#couleur` separees par virgule. Ex: `"1:#00A95F,2:#FF9940,3:#E1000F"` |
| fill-field | String | `""` | Champ numérique pour choropleth |
| fill-opacity | Number | `0.6` | Opacite remplissage |
| selected-palette | String | `""` | Palette choropleth |
| radius | Number | `8` | Rayon fixe (circle) |
| radius-field | String | `""` | Champ rayon variable |
| radius-unit | String | `"px"` | `px` ou `m` |
| radius-min | Number | `4` | Rayon min auto-scaling (px) |
| radius-max | Number | `30` | Rayon max auto-scaling (px) |
| heat-radius | Number | `25` | Rayon heatmap (px) |
| heat-blur | Number | `15` | Flou heatmap (px) |
| heat-field | String | `""` | Champ ponderation heatmap |
| cluster | Boolean | `false` | Active le clustering |
| cluster-radius | Number | `80` | Rayon clustering pixels |
| min-zoom | Number | `0` | Zoom min pour cette couche |
| max-zoom | Number | `18` | Zoom max pour cette couche |
| bbox | Boolean | `false` | Chargement par viewport |
| bbox-debounce | Number | `300` | Delai re-fetch (ms) |
| bbox-field | String | `""` | Champ geo pour bbox (auto-détecté si vide) |
| max-items | Number | `5000` | Limite elements rendus |
| time-field | String | `""` | Champ date/heure pour animation temporelle |
| time-bucket | String | `"none"` | Granularite : `none`, `hour`, `day`, `month`, `year` |
| time-mode | String | `"snapshot"` | `snapshot` (pas courant) ou `cumulative` (tout jusqu'au pas courant) |

### Resolution des coordonnees (3 modes)

1. `lat-field` + `lon-field` : coordonnees separees
2. `geo-field` vers GeoJSON Point : `{ type: "Point", coordinates: [lon, lat] }`
3. `geo-field` vers ODS : `{ lat: N, lon: N }`
4. Auto-detection : cherche `geo_point_2d`, `geo_shape`, `geometry`

### Fonds de carte predefinis (sans clé API)

- `ign-plan` : Plan IGN (Geoplateforme) — defaut
- `ign-ortho` : Vue aerienne IGN
- `ign-cadastre` : Parcelles cadastrales IGN
- `osm` / `osm-fr` : OpenStreetMap France
- `osm-standard` : OpenStreetMap (tuiles osm.org)
- `carto-positron` : CARTO Positron (fond clair sobre, ideal dataviz)
- `carto-dark` : CARTO Dark Matter (fond sombre)
- `opentopomap` : OpenTopoMap (carte topographique communautaire)
- `ign-topo` : deprecie — redirige vers `ign-plan` (couche BDUNI quasi vide, couches SCAN topo soumises a clé API)

### Exemple : POI avec clustering

```html
<dsfr-data-source id="bornes" api-type="opendatasoft"
  base-url="https://odre.opendatasoft.com" dataset-id="bornes-irve"
  select="geo_point_2d,nom_station,puissance_nominale"
  limit="5000">
</dsfr-data-source>

<dsfr-data-map center="46.6,2.3" zoom="6" tiles="ign-plan" fit-bounds>
  <dsfr-data-map-layer source="bornes" type="marker"
    geo-field="geo_point_2d"
    popup-fields="nom_station,puissance_nominale"
    tooltip-field="nom_station"
    cluster cluster-radius="60">
  </dsfr-data-map-layer>
</dsfr-data-map>
```

### Exemple : cercles proportionnels

```html
<dsfr-data-map center="46.6,2.3" zoom="6">
  <dsfr-data-map-layer source="villes" type="circle"
    lat-field="latitude" lon-field="longitude"
    radius-field="population" radius-unit="px"
    color="#000091" fill-opacity="0.4"
    popup-fields="nom,population"
    tooltip-field="nom">
  </dsfr-data-map-layer>
</dsfr-data-map>
```

### Exemple : couleurs catégorielles (color-map)

```html
<dsfr-data-map center="46.6,2.3" zoom="6">
  <dsfr-data-map-layer source="depts" type="geoshape"
    geo-field="geo_shape"
    color-field="statut"
    color-map="1:#00A95F,2:#FF9940,3:#E1000F,4:#000091"
    fill-opacity="0.6"
    popup-template="<b>{nom}</b><br>Statut : {statut_label}">
  </dsfr-data-map-layer>
</dsfr-data-map>
```

### Exemple : multi-couches geoshape + POI

```html
<dsfr-data-map center="46.6,2.3" zoom="6" tiles="ign-plan">
  <dsfr-data-map-layer source="departements" type="geoshape"
    geo-field="geo_shape" fill-field="population"
    selected-palette="sequentialAscending" fill-opacity="0.5"
    popup-template="<b>{nom}</b><br>Population : {population}">
  </dsfr-data-map-layer>
  <dsfr-data-map-layer source="prefectures" type="marker"
    geo-field="geo_point_2d"
    tooltip-field="nom" color="#C9191E">
  </dsfr-data-map-layer>
</dsfr-data-map>
```

### dsfr-data-map-popup — Affichage au clic

Composant compagnon optionnel qui definit un template et un mode d'affichage pour le clic sur un element.

| Attribut | Type | Défaut | Description |
|----------|------|--------|-------------|
| mode | String | `"popup"` | `popup`, `modal`, `panel-right`, `panel-left` |
| title-field | String | `""` | Champ pour le titre panneau/modale |
| width | String | `"350px"` | Largeur du panneau lateral |
| for | String | `""` | ID du layer cible (vide = tous) |

Template avec `<template>` et interpolation `{{champ}}` (memes expressions que dsfr-data-display,
toujours echappees) : `{{champ.sous.clé}}`, `{{champ:number}}` (format fr-FR), `{{champ|défaut}}`.
Sans template, tableau auto.

```html
<dsfr-data-map-popup mode="panel-right" title-field="nom" width="380px">
  <template>
    <h4>{{nom}}</h4>
    <p>{{adresse}}, {{code_postal}} {{commune}}</p>
    <p class="fr-text--bold">{{prix:number}} EUR</p>
  </template>
</dsfr-data-map-popup>
```

### Exemple : zoom ranges (multi-resolution)

```html
<dsfr-data-map center="46.6,2.3" zoom="6" height="600px">
  <!-- Zoom 1-9 : regions -->
  <dsfr-data-map-layer source="regions" type="geoshape"
    geo-field="geo_shape" fill-field="population"
    min-zoom="1" max-zoom="9">
  </dsfr-data-map-layer>
  <!-- Zoom 10+ : communes viewport -->
  <dsfr-data-map-layer source="communes" type="geoshape"
    geo-field="geo_shape" fill-field="population"
    min-zoom="10" bbox>
  </dsfr-data-map-layer>
</dsfr-data-map>
```

### dsfr-data-map-inset — Encarts territoriaux (DROM, Corse...)

Composant compagnon place comme enfant de `dsfr-data-map`. Rend une mini-carte verrouillee centree
sur un territoire, qui reutilise automatiquement les couches ET le popup de la carte hote : un clic
sur un element de l'encart ouvre le volet/la modale de la carte principale (un seul template).

| Attribut | Type | Défaut | Description |
|----------|------|--------|-------------|
| territory | String | `""` | Territoire predefini : `guadeloupe`, `martinique`, `guyane`, `la-reunion`, `mayotte`, `saint-pierre-et-miquelon`, `saint-martin`, `saint-barthelemy`, `nouvelle-caledonie`, `polynesie-francaise`, `wallis-et-futuna`, `corse` |
| center | String | `""` | Centre `"lat,lon"` (requis sans territory ; prioritaire sur le preset) |
| zoom | Number | `8` | Zoom fixe (prioritaire sur le preset) |
| label | String | `""` | Libelle affiche au-dessus (et nom accessible) |
| height | String | `"160px"` | Hauteur de la mini-carte |

```html
<dsfr-data-map center="46.5,2.6" zoom="6" tiles="ign-plan">
  <dsfr-data-map-layer source="territoires" type="geoshape" geo-field="geojson"></dsfr-data-map-layer>
  <dsfr-data-map-popup mode="panel-right" title-field="nom"><template>...</template></dsfr-data-map-popup>
  <dsfr-data-map-inset territory="guadeloupe"></dsfr-data-map-inset>
  <dsfr-data-map-inset territory="nouvelle-caledonie"></dsfr-data-map-inset>
  <dsfr-data-map-inset center="4.63,-52.45" zoom="8" label="CA du Centre Littoral"></dsfr-data-map-inset>
</dsfr-data-map>
<!-- Raccourci equivalent pour les 5 DROM : <dsfr-data-map insets="drom"> -->
```

### dsfr-data-map-timeline — Animation temporelle

Composant compagnon place comme enfant de `dsfr-data-map`. Decouvre automatiquement les layers ayant `time-field` et pilote leur affichage frame par frame.

| Attribut | Type | Défaut | Description |
|----------|------|--------|-------------|
| for | String | `""` | IDs des layers cibles (virgules). Vide = tous les layers avec time-field |
| speed | Number | `1` | Multiplicateur vitesse (0.5, 1, 2, 4) |
| interval | Number | `1000` | Intervalle de base entre frames (ms) |
| label | String | `"auto"` | Format du libelle du pas courant (`auto` = valeur brute du pas) |

Controles : play/pause, stop, pas-a-pas, slider, vitesse.
Clavier : Espace (play/pause), fleches (pas-a-pas), Home/End (debut/fin).
Accessibilité : pas d'auto-play, prefers-reduced-motion respecte, ARIA labels, aria-live.

```html
<dsfr-data-source id="source-temps" data='[
  {"region":"Paris","lat":48.85,"lon":2.35,"valeur":120,"date":"2025-T1"},
  {"region":"Paris","lat":48.85,"lon":2.35,"valeur":250,"date":"2025-T2"},
  {"region":"Lyon","lat":45.76,"lon":4.83,"valeur":80,"date":"2025-T1"},
  {"region":"Lyon","lat":45.76,"lon":4.83,"valeur":160,"date":"2025-T2"}
]'></dsfr-data-source>

<dsfr-data-map center="46.6,2.3" zoom="6" height="550px">
  <dsfr-data-map-layer source="source-temps" type="circle"
    lat-field="lat" lon-field="lon"
    radius-field="valeur" radius-min="6" radius-max="35"
    color="#000091" fill-opacity="0.5"
    tooltip-field="region"
    time-field="date" time-mode="snapshot">
  </dsfr-data-map-layer>
  <dsfr-data-map-timeline speed="1" interval="1500">
  </dsfr-data-map-timeline>
</dsfr-data-map>
```


### Référence `<dsfr-data-map>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `center` | `string` | `'46.603,2.888'` | Centre initial de la carte, au format `"lat,lon"`. |
| `fit-bounds` | `boolean` | `false` | Ajuste le viewport aux donnees a chaque mise a jour. Combine a `max-bounds`, l'emprise est clippee a la zone : les DROM ne dezooment pas la vue, un filtre regional zoome dessus. |
| `height` | `string` | `'500px'` | Hauteur CSS (px, vh, rem). Un `%` est un ratio de la LARGEUR (ex: `"60%"` = 60 % de la largeur). |
| `insets` | `string` | `""` (vide) | Raccourci encarts territoriaux : groupe ("drom") et/ou territoires nommes separes par des virgules ("drom,corse", "guadeloupe,saint-pierre-et-miquelon") |
| `locked` | `boolean` | `false` | Carte verrouillee : aucune interaction (pan/zoom/clavier) — encarts, vignettes |
| `max-bounds` | `string` | `""` (vide) | Limites du deplacement, au format `"latSW,lonSW,latNE,lonNE"`. |
| `max-zoom` | `number` | `18` | Zoom maximum autorise. |
| `min-zoom` | `number` | `2` | Zoom minimum autorise. |
| `name` | `string` | `""` (vide) | Titre de la carte, utilise comme nom accessible (aria-label). |
| `no-controls` | `boolean` | `false` | Masque les controles de zoom. |
| `sovereign-only` | `boolean` | `false` | Restreint `tiles` aux presets IGN souverains : tout autre preset ou URL custom est refuse (console.warn) et remplace par `ign-plan`. |
| `tiles` | `string` | `'ign-plan'` | Fond de carte : `ign-plan`, `ign-ortho`, `ign-cadastre`, `osm-fr` (alias `osm`), `osm-standard`, `carto-positron`, `carto-dark`, `opentopomap`, ou une URL template. `ign-topo` est deprecie (redirige vers `ign-plan` avec un warning). |
| `zoom` | `number` | `6` | Niveau de zoom initial (1-18). |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `announceToScreenReader(message: string)` | `void` | Annonce un message aux screen readers via la live region |
| `getLeafletLib()` | `typeof import('leaflet') \| null` | Retourne le module Leaflet charge (pour les layers) |
| `getLeafletMap()` | `LeafletMap \| null` | Retourne l'instance Leaflet L.Map (ou null si pas encore prete) |
| `registerLayerBounds(layerKey: string, bounds: import('leaflet').LatLngBounds)` | `void` | Notifie la carte qu'un layer a ses bounds prets (pour fit-bounds). Stockes PAR layer avec remplacement a chaque rendu (#294) : l'ancien push cumulait les bounds HISTORIQUES — la carte ne pouvait jamais retrecir sa vue quand les donnees diminuaient, et le tableau grossissait a chaque refresh / frame de timeline / pan en bbox client. |
| `unregisterLayerBounds(layerKey: string)` | `void` | Libere les bounds d'un layer retire (#294) |
| `updateDescription(layerSummaries: string[])` | `void` | Met a jour la description de la carte (appele par les layers quand les données changent) |


**Événements** — aucun.


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).


### Référence `<dsfr-data-map-layer>` (générée depuis le code)

**Rôle pipeline** : affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’émet pas de données.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `bbox` | `boolean` | `false` | Chargement par viewport : re-interroge la source a chaque deplacement de la carte. |
| `bbox-debounce` | `number` | `300` | Delai d'anti-rebond avant le re-fetch bbox, en millisecondes. |
| `bbox-field` | `string` | `""` (vide) | Champ géographique utilisé pour la requête bbox (auto-détecté si vide). |
| `cluster` | `boolean` | `false` | Regroupe les marqueurs proches en clusters. |
| `cluster-radius` | `number` | `80` | Rayon de regroupement des clusters, en pixels. |
| `color` | `string` | `'#000091'` | Couleur de la couche (défaut : blue-france DSFR). Sert aussi de repli quand `color-map` ne matche pas. |
| `color-field` | `string` | `""` (vide) | Champ dont la valeur détermine la couleur (mapping catégoriel via `color-map`). |
| `color-map` | `string` | `""` (vide) | Paires `valeur:#couleur` separees par des virgules. Ex: `"1:#00A95F,2:#FF9940,3:#E1000F"`. |
| `fill-field` | `string` | `""` (vide) | Champ numérique utilisé pour le remplissage en choroplèthe. |
| `fill-opacity` | `number` | `0.6` | Opacite du remplissage (0-1). |
| `geo-field` | `string` | `""` (vide) | Champ geometrie : objet GeoJSON, {lat, lon}, [lat, lon] ou chaine JSON serialisee (#426) |
| `heat-blur` | `number` | `15` | Flou applique a la heatmap, en pixels. |
| `heat-field` | `string` | `""` (vide) | Champ de ponderation des points de la heatmap. |
| `heat-radius` | `number` | `25` | Rayon d'influence de chaque point de la heatmap, en pixels. |
| `lat-field` | `string` | `""` (vide) | Chemin vers le champ latitude (mode coordonnees separees). |
| `lon-field` | `string` | `""` (vide) | Chemin vers le champ longitude (mode coordonnees separees). |
| `max-items` | `number` | `5000` | Plafond du nombre d'elements rendus sur la carte. |
| `max-zoom` | `number` | `18` | Niveau de zoom au-dela duquel la couche est masquee. |
| `min-zoom` | `number` | `0` | Niveau de zoom en deca duquel la couche est masquee. |
| `no-interactive` | `boolean` | `false` | Couche decorative : aucune interaction (pas de clic, tooltip ni popup) — contours administratifs, habillage |
| `popup-fields` | `string` | `""` (vide) | Champs a presenter en tableau automatique dans la popup. Ex: `"nom,adresse"`. |
| `popup-template` | `string` | `""` (vide) | Template du contenu de la popup, avec substitution de champs. Ex: `"{nom} — {val} kW"`. |
| `radius` | `number` | `8` | Rayon fixe des cercles (`type="circle"`). |
| `radius-field` | `string` | `""` (vide) | Champ numérique pilotant un rayon variable (auto-scaling entre `radius-min` et `radius-max`). |
| `radius-max` | `number` | `30` | Rayon maximum de l'auto-scaling, en pixels. |
| `radius-min` | `number` | `4` | Rayon minimum de l'auto-scaling, en pixels. |
| `radius-unit` | `'px' \| 'm'` | `'px'` | Unité du rayon : `px` (constant à l'écran) ou `m` (mètres, suit le zoom). |
| `selected-palette` | `string` | `""` (vide) | Palette DSFR utilisée pour le dégradé choroplèthe (`fill-field`). |
| `shape-class` | `string` | `""` (vide) | Classe CSS appliquee aux traces SVG de la couche (geoshape/circle) — permet un style page (motif hachure, pointilles...) via CSS/SVG <pattern> |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont cette couche consomme les données. |
| `time-bucket` | `'none' \| 'hour' \| 'day' \| 'month' \| 'year'` | `'none'` | Granularite des pas de temps : `none`, `hour`, `day`, `month`, `year`. |
| `time-field` | `string` | `""` (vide) | Champ date/heure activant l'animation temporelle (pilotee par `<dsfr-data-map-timeline>`). |
| `time-mode` | `'snapshot' \| 'cumulative'` | `'snapshot'` | Rendu temporel : `snapshot` (seulement le pas courant) ou `cumulative` (tout jusqu'au pas courant). |
| `tooltip-field` | `string` | `""` (vide) | Champ affiche au survol de l'element. |
| `type` | `'marker' \| 'geoshape' \| 'circle' \| 'heatmap'` | `'marker'` | Rendu de la couche : `marker` (epingles), `geoshape` (polygones/lignes GeoJSON), `circle` (cercles proportionnels), `heatmap` (carte de chaleur). |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getRenderedCount()` | `number` | Nombre d'elements effectivement dessines au dernier rendu (marqueurs, formes, cercles ou points de chaleur). Contrairement au comptage DOM, ce compte n'inclut pas les bulles de cluster et couvre la heatmap (un seul canvas pour N points) — expose pour les diagnostics (#482). |
| `getTimeSteps()` | `string[]` | Returns sorted time step labels |
| `resetTimeline()` | `void` | Called by dsfr-data-map-timeline to reset (show all data) |
| `setTimelineFrame(index: number)` | `void` | Called by dsfr-data-map-timeline to set current frame |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |
| `dsfr-data-map-layer-time-ready` | — | émis | — |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).


### Référence `<dsfr-data-map-popup>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `for` | `string` | `""` (vide) | Id du layer cible. Vide = tous les layers de la carte. |
| `mode` | `PopupMode` | `'popup'` | Mode d'affichage : `popup` (bulle sur la carte), `modal`, `panel-right`, `panel-left`. |
| `title-field` | `string` | `""` (vide) | Champ utilise comme titre du panneau ou de la modale. |
| `width` | `string` | `'350px'` | Largeur du panneau lateral (modes `panel-*`). |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `close()` | `void` | Close any open panel/modal |
| `getPopupHtml(record: Record<string, unknown>)` | `string` | Returns the popup HTML for Leaflet bindPopup (popup mode only) |
| `hasTemplate()` | `boolean` | Returns true if a custom template is defined |
| `matchesLayer(layerId: string)` | `boolean` | Returns whether this popup targets the given layer |
| `showForRecord(record: Record<string, unknown>)` | `void` | Show content for a record. Called by the layer on feature click. |


**Événements** — aucun.


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).


### Référence `<dsfr-data-map-inset>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `center` | `string` | `""` (vide) | Centre "lat,lon" de l'encart (requis sans territory ; prioritaire sur le preset) |
| `height` | `string` | `'160px'` | Hauteur de la mini-carte |
| `label` | `string` | `""` (vide) | Libelle affiche au-dessus de l'encart (et nom accessible de la mini-carte) |
| `territory` | `string` | `""` (vide) | Territoire predefini (guadeloupe, martinique, guyane, la-reunion, mayotte, saint-pierre-et-miquelon, saint-martin, saint-barthelemy, nouvelle-caledonie, polynesie-francaise, wallis-et-futuna, corse) — fournit center/zoom/label |
| `zoom` | `number` | `0` | Zoom fixe de l'encart (prioritaire sur le preset) |



**Événements** — aucun.


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).


### Référence `<dsfr-data-map-timeline>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `for` | `string` | `""` (vide) | Target specific layer IDs (comma-separated). If empty, targets all layers with time-field. |
| `interval` | `number` | `1000` | Base interval in ms between frames |
| `label` | `string` | `'auto'` | Label format for display. 'auto' uses the raw step value. |
| `speed` | `number` | `1` | Playback speed multiplier |



**Événements** — aucun.


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
