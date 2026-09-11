# dsfr-data-map

> Carte interactive Leaflet multi-couches avec POI, geoshape, cercles, clustering et chargement par viewport
>
> Déclencheurs : carte, map, leaflet, poi, marker, geoshape, geojson, clustering, bbox, viewport, tuiles, ign, geoplateforme, cercles proportionnels, heatmap, carte interactive, geo_point, geo_shape, choropleth carte, map layer, timeline, animation temporelle, carte animee, evolution temporelle, color-map, couleur catégorielle, couleur par valeur, souverainete, sovereign-only, osm-fr, tiles-attribution, fond de carte, clé api tuiles, légende, legende carte, map-legend, classes, bornes, fond atténué, tiles-style, tiles-switcher, changer de fond, selecteur de fond, vue aérienne, fit-zone, contours, fonds administratifs, geo/regions, geo/departements, refine-on-click, map-select, clic sur la carte, carte comme filtre, annuaire

## dsfr-data-map + dsfr-data-map-layer — Carte interactive multi-couches

Deux composants complementaires :
- `dsfr-data-map` : conteneur carte (init Leaflet, tuiles, viewport). **Ne consomme pas de données.**
- `dsfr-data-map-layer` : couche de données (markers, geoshape, circle, heatmap). Utilise `SourceSubscriberMixin`.

Cela permet le **multi-source** naturellement : chaque layer a sa propre source.

### Chargement du bundle

```html
<script src="${'https://VOTRE_INSTANCE/dist'}/dsfr-data.map.umd.js"></script>
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
| tiles | String | `"ign-plan"` | Fond de carte : `ign-plan`, `ign-ortho`, `ign-cadastre`, `osm-fr` (alias : `osm`), `osm-standard`, `opentopomap`, ou URL template. Deprecies (redirigent vers `ign-plan` avec warning) : `ign-topo`, `carto-positron`, `carto-dark` |
| tiles-attribution | String | `""` | Mention d'attribution quand `tiles` est une URL custom. Obligatoire (ODbL + CGU du fournisseur) ; ignore sur un preset connu |
| tiles-style | String | `""` | Fond attenue pour une carte thematique : `muted` (gris + 55 % d'opacite) ou `grey` (niveaux de gris). Fond « neutre » = `ign-plan` + `tiles-style="muted"`. Les encarts heritent du reglage |
| tiles-switcher | String | `""` | Fonds proposes au LECTEUR, separes par des virgules (`"ign-plan,ign-ortho"`). Rend un menu deroulant « Fond de carte » en haut a droite, utilisable au clavier ; les encarts suivent. Au moins deux presets connus, sinon rien ne s'affiche. Sans effet avec `locked` ou `no-controls` |
| sovereign-only | Boolean | `false` | Restreint `tiles` aux presets IGN souverains. Tout autre preset (`osm-fr`, `osm-standard`, `opentopomap`...) ou URL custom est refuse avec `console.warn` et remplace par `ign-plan`. |
| no-controls | Boolean | `false` | Masque les controles de zoom |
| locked | Boolean | `false` | Carte verrouillee : aucune interaction (pan/zoom/clavier) — encarts, vignettes |
| insets | String | `""` | Raccourci encarts territoriaux : groupe et/ou territoires nommes (`"drom"`, `"drom,corse"`) |
| fit-bounds | Boolean | `false` | Ajuste le viewport aux données a chaque mise a jour (combine a max-bounds : emprise clippee a la zone — les DROM ne dezooment pas la vue, un filtre regional zoome dessus) |
| max-bounds | String | `""` | Limites du deplacement `"latSW,lonSW,latNE,lonNE"` (clippe aussi le fit si fit-zone est vide) |
| fit-zone | String | `""` | Zone de clip du fit `"latSW,lonSW,latNE,lonNE"`, pan libre. Défaut : max-bounds, sinon la metropole (`41,-5.5,51.5,10`) des qu'un encart ultramarin est present (`insets="drom"`), sinon rien. `none` desactive |
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
| label | String | `""` | Libellé de la couche — libellé du tag du contexte en `refine-on-click` (défaut : le nom du champ) |
| refine-on-click | String | `""` | Champ dont la valeur de l'objet clique devient un filtre `eq` (#681) : premier clic = filtre, second clic sur le même objet = retrait, autre objet = remplacement. Avec `context` (recommandé) : filtre du dsfr-data-context (tag, URL, dialecte de chaque cible). Sans `context` : commande directe a `source` (whereKey `map-select-ID`, sans tag ni URL) |
| context | String | `""` | Id du dsfr-data-context auquel s'enregistrer en `refine-on-click` (#681, ADR-104). Peut etre declare apres la couche |
| popup-template | String | `""` | Template : `"{nom} — {val} kW"` |
| popup-fields | String | `""` | Champs pour tableau auto : `"nom,adresse"` |
| tooltip-field | String | `""` | Champ affiche au survol |
| color | String | `"#000091"` | Couleur (DSFR blue-france). Fallback si color-map ne matche pas |
| color-field | String | `""` | Champ dont la valeur determine la couleur (mapping catégoriel) |
| color-map | String | `""` | Paires `valeur:#couleur` separees par virgule. Ex: `"1:#00A95F,2:#FF9940,3:#E1000F"`. Virgule ou deux-points dans une valeur : `%2C` / `%3A` (`"Commerce%2C transport:#000091"`). Meme grammaire sur dsfr-data-chart |
| fill-field | String | `""` | Champ numérique pour choropleth (geoshape) |
| fill-opacity | Number | `0.6` | Opacite remplissage |
| selected-palette | String | `""` | Palette choropleth : `sequentialAscending` (défaut), `sequentialDescending`, `divergentAscending`, `divergentDescending`, `neutral`, `categorical` |
| classes | Number | `0` | Nombre de classes de la choropleth ; `0` = autant que de couleurs dans l'echelle (9) |
| method | String | `"quantile"` | Discretisation : `quantile` (effectifs egaux), `equal` (intervalles egaux), `manual` (bornes de breaks) |
| breaks | String | `""` | Bornes superieures manuelles `"10,50,100"` (= 4 classes) ; implique `method="manual"` |
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
- `osm` / `osm-fr` : OpenStreetMap France — best effort ; la politique d'usage OSM France exige un site public sans login ni intranet, sans but lucratif et a trafic modere
- `osm-standard` : OpenStreetMap (tuiles osm.org) — best effort, sans SLA
- `opentopomap` : OpenTopoMap (carte topographique communautaire) — best effort

Presets deprecies (resolvent vers `ign-plan` avec un `console.warn`) :

- `ign-topo` : couche BDUNI quasi vide, couches SCAN topo soumises a clé API
- `carto-positron`, `carto-dark` : CARTO exige desormais une clé API et filigrane les tuiles anonymes ("API KEY REQUIRED") en HTTP 200

**Il n'y a pas de fond sombre souverain.** Ne pas proposer `carto-dark` : il ne fonctionne plus.

### Laisser le lecteur choisir son fond (tiles-switcher)

`tiles` fixe le fond pour toute la page ; `tiles-switcher` ouvre le choix au lecteur.

```html
<dsfr-data-map center="46.6,2.3" zoom="6" tiles="ign-plan" tiles-switcher="ign-plan,ign-ortho">
  <dsfr-data-map-layer source="sites" type="marker" geo-field="geo"></dsfr-data-map-layer>
</dsfr-data-map>
```

- Menu deroulant natif etiquete « Fond de carte », en haut a droite de la carte : atteint au clavier
  avant la carte (juste apres le lien d'evitement), valeur annoncee par les lecteurs d'ecran.
- Les entrees sont des **presets** (`ign-plan`, `ign-ortho`, `ign-cadastre`, `osm-fr`, `osm-standard`,
  `opentopomap`, alias compris) ; une URL custom ou un nom inconnu est ecarte avec un `console.warn`.
- Il faut au moins deux fonds differents apres resolution, sinon aucun selecteur n'est rendu.
  Avec `sovereign-only`, ne declarer que des presets IGN — les autres retombent tous sur `ign-plan`.
- Le fond courant est ajoute en tete s'il manque a la liste. Les encarts (`insets`) suivent le choix.
- Evenement `dsfr-data-map-tiles-change` `{ tiles }` (bubbles, composed) a chaque bascule du lecteur.
- Sans effet avec `locked` ou `no-controls`.

### Fond de carte custom (URL + clé API)

Toute valeur de `tiles` qui n'est pas un preset est traitee comme une URL template `{z}/{x}/{y}`.
Dans ce cas `tiles-attribution` est **obligatoire** (sans elle la carte s'affiche sans mention,
ce qui n'est conforme ni a l'ODbL ni aux CGU du fournisseur) :

```html
<dsfr-data-map
  tiles="https://exemple.tld/tiles/{z}/{x}/{y}.png?key=VOTRE_CLE"
  tiles-attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; Fournisseur'>
</dsfr-data-map>
```

La clé appartient a l'integrateur (domaine et quota nominatifs) : la bibliotheque n'en porte aucune.

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

### Exemple : choroplethe a 5 classes avec legende et fond attenue

```html
<dsfr-data-map center="46.6,2.3" zoom="6" tiles="ign-plan" tiles-style="muted">
  <dsfr-data-map-layer id="couche-pop" source="departements" type="geoshape"
    geo-field="geo_shape" fill-field="population"
    selected-palette="sequentialAscending" classes="5" method="quantile"
    tooltip-field="nom">
  </dsfr-data-map-layer>
  <dsfr-data-map-legend for="couche-pop" label="Population"></dsfr-data-map-legend>
</dsfr-data-map>
```

Bornes imposees : `breaks="1000,5000,20000"` (4 classes, method manual implicite).

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
| width | String | `"350px"` | Largeur du panneau latéral, bornée à la largeur de la carte |
| for | String | `""` | ID du layer cible (vide = tous) |

Template avec `<template>` et interpolation `{{champ}}` (même moteur que dsfr-data-display,
toujours échappé, `{{{champ}}}` traité comme `{{champ}}`) : `{{champ.sous.clé}}`,
`{{champ:number}}`, `{{champ:date}}`, `{{tags:join: / }}`, `{{lien:url}}` (à utiliser
dans tout `href`), `{{champ|défaut}}`, blocs `{{#if champ}}…{{/if}}` / `{{#unless}}` et
`{{#each champ}}…{{/each}}` (répétition sur un champ tableau, `{{.}}` = l'élément, `{{$index}}`
= son rang). Sans template, tableau auto.

Le panneau latéral est ancré dans la carte, pas dans la fenêtre : sa largeur est bornée à
celle de la carte. Sur téléphone (viewport 375-393 px, gouttières DSFR : carte ~340 px) un
`width` de 350 à 400 px donne donc un panneau pleine largeur, sans rognage — inutile de
prévoir une largeur responsive.

```html
<dsfr-data-map-popup mode="panel-right" title-field="nom" width="380px">
  <template>
    <h4>{{nom}}</h4>
    <p>{{adresse}}, {{code_postal}} {{commune}}</p>
    <p class="fr-text--bold">{{prix:number}} EUR</p>
    <p>Mis à jour le {{date_maj:date}}</p>
    {{#if site_web}}<a class="fr-link" href="{{site_web:url}}">Site web</a>{{/if}}
  </template>
</dsfr-data-map-popup>
```

### La carte comme filtre — dsfr-data-map-select et refine-on-click (#681, ADR-104)

Au clic sur un marqueur, un cercle ou une forme (jamais en `no-interactive`), la couche emet
`dsfr-data-map-select` `{ record, layerId, selected }` (bubbles, composed) en plus de la popup :
tout JS de page peut reagir. `selected` vaut `true` a la selection, `false` au retrait
(second clic sur le même objet).

Avec `refine-on-click="champ"` + `context="ctx"` (recommande), la couche s'enregistre comme
filtre `eq` du dsfr-data-context : premier clic = filtre diffuse a toutes les sources du contexte
(au dialecte de chacune), tag dans dsfr-data-context-tags (libelle = `label` de la couche ou le
champ), URL portee par le contexte (`url-sync`) ; second clic sur le même objet = retrait ; autre
objet = remplacement. Sans `context`, la clause part directement a `source` (whereKey
`map-select-ID`) : pas de tag, pas d'URL, pas de traduction de dialecte — chemin degrade.

Recette annuaire (la carte filtre la liste) :

```html
<dsfr-data-source id="etablissements" api-type="opendatasoft" base-url="…" dataset-id="…"></dsfr-data-source>
<dsfr-data-source id="etablissements-carte" api-type="opendatasoft" base-url="…" dataset-id="…"></dsfr-data-source>

<!-- Le contexte ne cible que la liste : la carte garde tous ses points -->
<dsfr-data-context id="ctx" sources="etablissements" url-sync></dsfr-data-context>
<dsfr-data-context-tags for="ctx"></dsfr-data-context-tags>

<dsfr-data-map center="46.6,2.3" zoom="6" fit-bounds>
  <dsfr-data-map-layer source="etablissements-carte" type="marker" geo-field="geo_point_2d"
    tooltip-field="commune" refine-on-click="commune" context="ctx" label="Commune">
  </dsfr-data-map-layer>
</dsfr-data-map>
<dsfr-data-list source="etablissements" fields="nom,adresse,commune"></dsfr-data-list>
```

Piege : si la source de la carte est AUSSI dans `sources` du contexte, la carte se filtre
elle-même au clic (seul l'objet clique reste, jusqu'au second clic). Pour garder tous les points,
donner a la carte sa propre source (deux dsfr-data-source sur le même jeu) et ne lister que la
liste dans `sources` — c'est `sources` du contexte qui regle les cibles, pas la couche.

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

### dsfr-data-map-legend — Legende d'une couche

Composant compagnon place comme enfant de `dsfr-data-map` (ou n'importe ou dans la page avec `for`).
Rend sous la carte une liste DSFR « pastille + texte » (pastille `aria-hidden`, le texte porte le sens — RGAA) :
- choroplethe (`fill-field`) : une entree par classe, bornes chiffrees fr-FR (« De 1 000 à 5 000 ») ;
- couche categorielle (`color-field` + `color-map`) : une entree par paire, plus « Autres valeurs » (repli `color`) si des valeurs n'ont pas matche ;
- couche monochrome : une entree, libellee par `label`.
Se rafraichit a chaque rendu de la couche (filtre amont, timeline, bbox) : la couche expose `getLegendEntries()` et emet `dsfr-data-map-layer-render`.
Hors perimetre : `dsfr-data-chart type="map"` (echelle continue DSFR Chart, pas de classes).

| Attribut | Type | Défaut | Description |
|----------|------|--------|-------------|
| for | String | `""` | Id (ou `source`) de la couche decrite. Vide = toutes les couches directes de la carte |
| label | String | `""` | Titre au-dessus de la liste ; libelle de l'entree unique d'une couche monochrome |

```html
<dsfr-data-map-layer id="statuts" source="sites" type="marker" geo-field="geo_point_2d"
  color-field="statut" color-map="ouvert:#18753C,ferme:#C9191E" color="#929292">
</dsfr-data-map-layer>
<dsfr-data-map-legend for="statuts" label="Statut du site"></dsfr-data-map-legend>
```

### Fonds administratifs livres dans le paquet (sans API)

Le paquet npm livre deux GeoJSON simplifies, hors bundle : `dsfr-data/geo/regions.json` (18 regions)
et `dsfr-data/geo/departements.json` (101 departements), proprietes `code` et `nom`
(Contours administratifs Etalab, Licence Ouverte 2.0). Servir par la page ou un CDN npm ; joindre
sur `code` (`dsfr-data-join`) pour une choroplethe sans referentiel geographique distant.

```html
<dsfr-data-source id="contours" url="https://cdn.jsdelivr.net/npm/dsfr-data@0/geo/regions.json"
  transform="features"></dsfr-data-source>
<dsfr-data-map center="46.6,2.9" zoom="6" insets="drom" fit-bounds>
  <!-- Habillage decoratif : no-interactive, exclu du fit -->
  <dsfr-data-map-layer source="contours" type="geoshape" geo-field="geometry"
    no-interactive color="#666" fill-opacity="0"></dsfr-data-map-layer>
</dsfr-data-map>
```

Avec `insets="drom"` et sans `max-bounds`, le fit se cale par défaut sur la metropole (`fit-zone`).

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
| `fit-bounds` | `boolean` | `false` | Ajuste le viewport aux données à chaque mise à jour. Combiné à `max-bounds`, l'emprise est clippée à la zone : les DROM ne dézooment pas la vue, un filtre régional zoome dessus. |
| `fit-max-zoom` | `number` | `0` | Zoom maximal atteint par `fit-bounds` (ex. `12`) : évite le zoom 18 sur un point isolé quand les données se réduisent à un marqueur. `0` (défaut) = pas de plafond, `max-zoom` s'applique. |
| `fit-zone` | `string` | `""` (vide) | Zone sur laquelle `fit-bounds` est clippé, au format `"latSW,lonSW,latNE,lonNE"` — le pan reste libre. Défaut : `max-bounds` s'il est renseigné ; sinon la métropole (`41,-5.5,51.5,10`) dès que la carte porte un encart ultramarin (`insets="drom"`…), pour que les DROM ne dézooment pas la vue ; sinon aucune zone. `fit-zone="none"` désactive le clip (#687). |
| `height` | `string` | `'500px'` | Hauteur CSS (px, vh, rem). Un `%` est un ratio de la LARGEUR (ex: `"60%"` = 60 % de la largeur). |
| `insets` | `string` | `""` (vide) | Raccourci encarts territoriaux : groupe ("drom") et/ou territoires nommés séparés par des virgules ("drom,corse", "guadeloupe,saint-pierre-et-miquelon") |
| `locked` | `boolean` | `false` | Carte verrouillee : aucune interaction (pan/zoom/clavier) — encarts, vignettes |
| `max-bounds` | `string` | `""` (vide) | Limites du déplacement, au format `"latSW,lonSW,latNE,lonNE"`. Clippe aussi le fit de `fit-bounds` quand `fit-zone` est vide. |
| `max-zoom` | `number` | `18` | Zoom maximum autorise. |
| `min-zoom` | `number` | `2` | Zoom minimum autorise. |
| `name` | `string` | `""` (vide) | Titre de la carte, utilise comme nom accessible (aria-label). |
| `no-controls` | `boolean` | `false` | Masque les controles de zoom. |
| `sovereign-only` | `boolean` | `false` | Restreint `tiles` aux presets IGN souverains : tout autre preset ou URL custom est refuse (console.warn) et remplace par `ign-plan`. |
| `tiles` | `string` | `'ign-plan'` | Fond de carte : `ign-plan`, `ign-ortho`, `ign-cadastre`, `osm-fr` (alias `osm`), `osm-standard`, `opentopomap`, ou une URL template. Presets deprecies (redirigent vers `ign-plan` avec un warning) : `ign-topo`, `carto-positron`, `carto-dark`. |
| `tiles-attribution` | `string` | `""` (vide) | Mention d'attribution affichée sur la carte quand `tiles` est une URL custom (obligatoire pour respecter l'ODbL et les CGU du fournisseur). Ignoré sur un preset connu, qui porte déjà son attribution. Accepte du HTML (liens). |
| `tiles-style` | `'' \| 'muted' \| 'grey'` | `""` (vide) | Atténuation du fond de carte pour les cartes thématiques : `muted` (gris + 55 % d'opacité), `grey` (niveaux de gris). Vide (défaut) : fond tel quel. Filtre CSS sur le volet des tuiles de cette carte seulement ; les encarts héritent du réglage. Un fond « neutre » = `ign-plan` + `tiles-style="muted"` (#686). |
| `tiles-switcher` | `string` | `""` (vide) | Fonds proposés au LECTEUR, séparés par des virgules (ex. `"ign-plan,ign-ortho"`). Vide (défaut) : aucun sélecteur, seul `tiles` décide. Rend un menu déroulant étiqueté « Fond de carte » en haut à droite de la carte, utilisable au clavier ; changer de fond met à jour la carte et ses encarts. Les entrées hors presets connus sont écartées avec un avertissement, et il en faut au moins deux pour que le sélecteur apparaisse. Sans effet avec `locked` ou `no-controls` (#744). |
| `zoom` | `number` | `6` | Niveau de zoom initial (1-18). |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `announceToScreenReader(message: string)` | `void` | Annonce un message aux screen readers via la live region |
| `getLeafletLib()` | `typeof import('leaflet') \| null` | Retourne le module Leaflet charge (pour les layers) |
| `getLeafletMap()` | `LeafletMap \| null` | Retourne l'instance Leaflet L.Map (ou null si pas encore prête) |
| `registerLayerBounds(layerKey: string, bounds: import('leaflet').LatLngBounds)` | `void` | Notifie la carte qu'un layer a ses bounds prets (pour fit-bounds). Stockes PAR layer avec remplacement a chaque rendu (#294) : l'ancien push cumulait les bounds HISTORIQUES — la carte ne pouvait jamais retrecir sa vue quand les données diminuaient, et le tableau grossissait a chaque refresh / frame de timeline / pan en bbox client. |
| `resolveFitZone()` | `string` | Zone de clip du fit (#687) : `fit-zone` explicite (`none` = aucune), sinon `max-bounds`, sinon la metropole des qu'un encart ultramarin est present (raccourci `insets` ou enfant dsfr-data-map-inset explicite) — le clip ne touche que le fit, jamais le pan. Expose pour les tests. |
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
| `bbox` | `boolean` | `false` | Chargement par viewport : re-interroge la source a chaque déplacement de la carte, et une première fois des que la carte est prête (#652). Le tout premier fetch de la source reste NON filtre (elle charge des sa connexion, avant que la carte — différée a la visibilité — ait un viewport) : sur un gros jeu, poser un `limit` ou un `where` initial sur la source. |
| `bbox-debounce` | `number` | `300` | Délai d'anti-rebond avant le re-fetch bbox, en millisecondes. |
| `bbox-field` | `string` | `""` (vide) | Champ géographique utilisé pour la requête bbox (auto-détecté si vide). |
| `breaks` | `string` | `""` (vide) | Bornes supérieures manuelles des classes, séparées par des virgules : `"10,50,100"` donne 4 classes (jusqu'à 10, 10 à 50, 50 à 100, plus de 100). Implique `method="manual"`. |
| `classes` | `number` | `0` | Nombre de classes de la choroplèthe (`fill-field`). `0` (défaut) = autant de classes que de couleurs dans l'échelle (9). Plafonné à la taille de l'échelle (#685). |
| `cluster` | `boolean` | `false` | Regroupe les marqueurs proches en clusters. |
| `cluster-radius` | `number` | `80` | Rayon de regroupement des clusters, en pixels. |
| `color` | `string` | `'#000091'` | Couleur de la couche (défaut : blue-france DSFR). Sert aussi de repli quand `color-map` ne matche pas. |
| `color-field` | `string` | `""` (vide) | Champ dont la valeur détermine la couleur (mapping catégoriel via `color-map`). |
| `color-map` | `string` | `""` (vide) | Paires `valeur:#couleur` séparées par des virgules. Ex: `"1:#00A95F,2:#FF9940,3:#E1000F"`. Une virgule ou un deux-points dans une valeur s'écrit `%2C` ou `%3A`. |
| `context` | `string` | `""` (vide) | Id du dsfr-data-context auquel s'enregistrer en `refine-on-click` (#681, ADR-104). Le contexte peut être déclaré après la couche dans la page. Vide = commande directe à `source` (chemin dégradé). |
| `fill-field` | `string` | `""` (vide) | Champ numérique utilisé pour le remplissage en choroplèthe. |
| `fill-opacity` | `number` | `0.6` | Opacite du remplissage (0-1). |
| `geo-field` | `string` | `""` (vide) | Champ geometrie : objet GeoJSON, {lat, lon}, [lat, lon] ou chaîne JSON serialisee (#426) |
| `heat-blur` | `number` | `15` | Flou applique a la heatmap, en pixels. |
| `heat-field` | `string` | `""` (vide) | Champ de ponderation des points de la heatmap. |
| `heat-radius` | `number` | `25` | Rayon d'influence de chaque point de la heatmap, en pixels. |
| `label` | `string` | `""` (vide) | Libellé de la couche — sert de libellé au tag du contexte en `refine-on-click` (#681). Vide = le nom du champ. |
| `lat-field` | `string` | `""` (vide) | Chemin vers le champ latitude (mode coordonnées séparées). |
| `lon-field` | `string` | `""` (vide) | Chemin vers le champ longitude (mode coordonnées séparées). |
| `max-items` | `number` | `5000` | Plafond du nombre d'éléments rendus sur la carte (défaut 5000). Il protège les marqueurs DOM (`divIcon`), le fit et les popups ; au-delà, un bandeau indique combien d'éléments sont affichés sur le total. Avec `cluster`, `max-items="20000"` est sans risque : les marqueurs regroupés ne pèsent pas sur le DOM. En mode `bbox`, zoomer recharge la zone visible ; hors `bbox`, seul un `max-items` plus haut (ou un filtre amont) affiche le reste. |
| `max-zoom` | `number` | `18` | Niveau de zoom au-delà duquel la couche est masquee. |
| `method` | `'quantile' \| 'equal' \| 'manual'` | `'quantile'` | Méthode de discrétisation de la choroplèthe : `quantile` (défaut, effectifs égaux par classe), `equal` (intervalles de même largeur), `manual` (bornes de `breaks`). |
| `min-zoom` | `number` | `0` | Niveau de zoom en deca duquel la couche est masquee. |
| `no-interactive` | `boolean` | `false` | Couche decorative : aucune interaction (pas de clic, tooltip ni popup) — contours administratifs, habillage |
| `popup-fields` | `string` | `""` (vide) | Champs a presenter en tableau automatique dans la popup. Ex: `"nom,adresse"`. |
| `popup-template` | `string` | `""` (vide) | Template du contenu de la popup, avec substitution de champs. Ex: `"{nom} — {val} kW"`. |
| `radius` | `number` | `8` | Rayon fixe des cercles (`type="circle"`). |
| `radius-field` | `string` | `""` (vide) | Champ numérique pilotant un rayon variable (auto-scaling entre `radius-min` et `radius-max`). |
| `radius-max` | `number` | `30` | Rayon maximum de l'auto-scaling, en pixels. |
| `radius-min` | `number` | `4` | Rayon minimum de l'auto-scaling, en pixels. |
| `radius-unit` | `'px' \| 'm'` | `'px'` | Unité du rayon : `px` (constant à l'écran) ou `m` (mètres, suit le zoom). |
| `refine-on-click` | `string` | `""` (vide) | Champ dont la valeur de l'objet cliqué devient un filtre `eq` (#681). Premier clic = filtre, second clic sur le même objet = retrait, clic sur un autre objet = remplacement. Avec `context="id"` (recommandé), la couche s'enregistre comme filtre du dsfr-data-context : diffusion à toutes ses sources cibles au dialecte de chacune, tag dans dsfr-data-context-tags, URL portée par le contexte. Sans `context`, la clause part directement à `source` (whereKey `map-select-ID`) — sans tag ni URL. Attention : si `source` est aussi une cible du contexte, la carte se filtre elle-même (seul l'objet cliqué reste, jusqu'au second clic) ; pour garder tous les points, ne pas lister cette source dans `sources` du contexte (ou donner à la carte sa propre source). |
| `selected-palette` | `string` | `""` (vide) | Palette DSFR utilisée pour le dégradé choroplèthe (`fill-field`) : `sequentialAscending` (défaut), `sequentialDescending`, `divergentAscending`, `divergentDescending`, `neutral`, `categorical`. |
| `shape-class` | `string` | `""` (vide) | Classe CSS appliquee aux traces SVG de la couche (geoshape/circle) — permet un style page (motif hachure, pointilles...) via CSS/SVG <pattern> |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont cette couche consomme les données. |
| `time-bucket` | `'none' \| 'hour' \| 'day' \| 'month' \| 'year'` | `'none'` | Granularite des pas de temps : `none`, `hour`, `day`, `month`, `year`. |
| `time-field` | `string` | `""` (vide) | Champ date/heure activant l'animation temporelle (pilotee par `<dsfr-data-map-timeline>`). |
| `time-mode` | `'snapshot' \| 'cumulative'` | `'snapshot'` | Rendu temporel : `snapshot` (seulement le pas courant) ou `cumulative` (tout jusqu'au pas courant). |
| `tooltip-field` | `string` | `""` (vide) | Champ affiché au survol de l'élément. |
| `type` | `'marker' \| 'geoshape' \| 'circle' \| 'heatmap'` | `'marker'` | Rendu de la couche : `marker` (epingles), `geoshape` (polygones/lignes GeoJSON), `circle` (cercles proportionnels), `heatmap` (carte de chaleur). |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getLegendEntries()` | `LegendEntry[]` | Entrées de légende du dernier rendu (#685) : les classes de `fill-field` avec leurs bornes (choroplèthe), sinon les paires de `color-map` plus le repli `color` s'il a servi, sinon la seule couleur de la couche (libellé vide, à fournir par la légende). Consommé par dsfr-data-map-legend, qui se rafraîchit sur `dsfr-data-map-layer-render`. |
| `getRenderedCount()` | `number` | Nombre d'éléments effectivement dessines au dernier rendu (marqueurs, formes, cercles ou points de chaleur). Contrairement au comptage DOM, ce compte n'inclut pas les bulles de cluster et couvre la heatmap (un seul canvas pour N points) — expose pour les diagnostics (#482). |
| `getSkippedCount()` | `number` | Nombre de lignes ignorees au dernier rendu faute de position exploitable (coordonnées ou geometrie absentes ou invalides). Journalise une fois par rendu et remonte dans la trace du volet Diagnostic (#648, #604). |
| `getTimeSteps()` | `string[]` | Returns sorted time step labels |
| `resetTimeline()` | `void` | Called by dsfr-data-map-timeline to reset (show all data) |
| `setTimelineFrame(index: number)` | `void` | Called by dsfr-data-map-timeline to set current frame |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |
| `dsfr-data-map-layer-time-ready` | — | émis | `{ steps }` sur `document` — les pas de temps de la couche sont calcules ; dsfr-data-map-timeline s'en sert pour construire son curseur. |
| `dsfr-data-map-layer-render` | — | émis | `{ rendered, skipped, total, legend }` sur la couche (bubbles) après chaque rendu : éléments dessinés, lignes ignorées, total avant plafond, entrées de légende (`getLegendEntries()`). dsfr-data-map-legend s'en sert pour se rafraîchir (#685). |
| `dsfr-data-map-select` | — | émis | `{ record, layerId, selected }` sur la couche (bubbles, composed) — au clic sur un marqueur, un cercle ou une forme (#681), en plus de la popup ; jamais en `no-interactive`. `selected` vaut `true` à la sélection, `false` quand le clic retire la sélection courante (second clic sur le même objet, ou `clear()` du filtre de contexte). |
| `dsfr-data-source-command` | — | émis | `{ sourceId, where, whereKey, origin }` sur `document` — en `refine-on-click` SANS `context` (chemin dégradé) : clause `eq` poussée directement à `source` sous le whereKey `map-select-ID`. Avec `context`, c'est le contexte qui diffuse. |


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
| `width` | `string` | `'350px'` | Largeur du panneau lateral (modes `panel-*`). Bornée à la largeur de la carte : sur un écran étroit le panneau l'occupe entièrement au lieu de déborder. |


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
| `height` | `string` | `'160px'` | Hauteur de la mini-carte (px, rem, vh). Un `%` est un ratio de la LARGEUR de l'encart, comme sur `dsfr-data-map`. |
| `label` | `string` | `""` (vide) | Libellé affiché au-dessus de l'encart (et nom accessible de la mini-carte) |
| `territory` | `string` | `""` (vide) | Territoire predefini (guadeloupe, martinique, guyane, la-reunion, mayotte, saint-pierre-et-miquelon, saint-martin, saint-barthelemy, nouvelle-caledonie, polynesie-française, wallis-et-futuna, corse) — fournit center/zoom/label |
| `width` | `string` | `""` (vide) | Largeur de l'encart (px, rem, %). Un `%` est relatif a la largeur de la carte hote : `width="20%"` repartit cinq encarts sur une ligne. Sans attribut, la feuille injectee par la carte pose `10rem` — une regle de page `dsfr-data-map-inset { width: … }` prime toujours dessus (#643). |
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


### Référence `<dsfr-data-map-legend>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `for` | `string` | `""` (vide) | Id (ou `source`) de la couche dsfr-data-map-layer décrite. Vide = toutes les couches directes de la carte hôte, entrées concaténées. |
| `label` | `string` | `""` (vide) | Titre de la légende, affiché au-dessus de la liste (ex. « Densité (hab./km²) »). Sert aussi de libellé à l'entrée unique d'une couche monochrome. |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getEntries()` | `LegendEntry[]` | Entrées actuellement affichées (lecture, pour les tests et les diagnostics). |
| `refresh()` | `void` | Relit les couches et redessine la liste. |


**Événements** — aucun.


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
