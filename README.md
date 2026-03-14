# dsfr-data

dsfr-data est un module complementaire au [Systeme de design de l'Etat](https://www.systeme-de-design.gouv.fr/) (DSFR) pour l'integration de donnees dynamiques. Il s'agit d'une bibliotheque de [Web Components](https://developer.mozilla.org/fr/docs/Web/API/Web_components) (Lit), sous la forme de balises HTML `<dsfr-data-*>`, a destination des developpeurs et integrateurs ayant besoin d'afficher des donnees issues d'APIs ouvertes dans leurs pages web.

dsfr-data s'appuie sur [DSFR Chart](https://github.com/GouvernementFR/dsfr-chart) pour le rendu des graphiques.

## Demo

L'ensemble des composants et leurs options sont documentes sur la page de [specifications](https://bmatge.github.io/dsfr-data/specs/).

## Installation

### Fichiers statiques (CDN)

**Prerequis** : le projet doit utiliser le [DSFR](https://www.systeme-de-design.gouv.fr/comment-utiliser-le-dsfr/developpeurs/prise-en-main-du-dsfr/) et [DSFR Chart](https://github.com/GouvernementFR/dsfr-chart).

```html
<!-- DSFR -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.11.2/dist/dsfr.min.css">

<!-- DSFR Chart -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.0.4/dist/DSFRChart/DSFRChart.css">
<script type="module" src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.0.4/dist/DSFRChart/DSFRChart.js"></script>

<!-- dsfr-data -->
<script src="https://unpkg.com/dsfr-data/dist/dsfr-data.core.umd.js"></script>
```

### NPM

```bash
npm install dsfr-data
```

```js
import 'dsfr-data';
```

### Structure des bundles

Trois bundles sont disponibles selon les besoins :

| Bundle | Contenu | Taille (gzip) |
|--------|---------|---------------|
| `dsfr-data.core.{esm,umd}.js` | Tous les composants sauf carte du monde | ~52 Ko |
| `dsfr-data.world-map.{esm,umd}.js` | Composant `dsfr-data-world-map` (d3-geo) | ~30 Ko |
| `dsfr-data.{esm,umd}.js` | Tout-en-un (core + world-map) | ~70 Ko |

---

# Composants disponibles

Les composants se chainent de facon declarative pour former un pipeline :

```
dsfr-data-source → dsfr-data-normalize → dsfr-data-query → dsfr-data-chart / dsfr-data-kpi / dsfr-data-list
                                                          → dsfr-data-facets / dsfr-data-search
                                                          → dsfr-data-a11y
```

## Source de donnees (`dsfr-data-source`)

Composant invisible de connexion aux donnees. Recupere des donnees depuis une API REST ou des donnees inline et les distribue aux autres composants.

### Parametres

#### Obligatoires (mode URL) :

- **url** : _(String)_ URL de l'API a interroger.

#### Obligatoires (mode adapter) :

- **api-type** : _(String)_ Type de provider. Valeurs possibles : `opendatasoft`, `tabular`, `grist`, `generic`.
- **base-url** : _(String)_ URL de base du portail de donnees.
- **dataset-id** : _(String)_ Identifiant du jeu de donnees (ODS) ou document (Grist).

#### Optionnels :

- **transform** : _(String)_ Chemin JSON vers les donnees dans la reponse (ex: `results`, `records`).
- **resource** : _(String)_ Identifiant de la ressource (Tabular) ou table (Grist).
- **server-side** : _(Boolean)_ Active la pagination server-side.
- **page-size** : _(Number)_ Nombre d'enregistrements par page (defaut: 100).
- **where** : _(String)_ Filtre server-side (syntaxe ODSQL ou colon selon le provider).
- **select** : _(String)_ Colonnes a selectionner.
- **group-by** : _(String)_ Regroupement server-side.
- **order-by** : _(String)_ Tri server-side.
- **limit** : _(Number)_ Nombre maximum d'enregistrements.
- **refresh** : _(Number)_ Intervalle de rafraichissement en secondes.
- **data** : _(String)_ Donnees JSON inline (alternative a `url`).
- **headers** : _(String)_ En-tetes HTTP (JSON).
- **cache-ttl** : _(Number)_ Duree du cache en secondes.

### Exemple

```html
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr"
  dataset-id="industrie-du-futur"
  limit="100">
</dsfr-data-source>
```

---

## Requetage (`dsfr-data-query`)

Transformateur client-side : filtre, regroupe, agrege et trie les donnees recues d'une source.

### Parametres

#### Obligatoires :

- **source** : _(String)_ ID du composant source a ecouter.

#### Optionnels :

- **filter** : _(String)_ Expression de filtre (ex: `population > 5000`).
- **group-by** : _(String)_ Champ(s) de regroupement.
- **aggregate** : _(String)_ Agregation au format `champ:fonction:alias` (ex: `population:sum:total`). Fonctions : `sum`, `avg`, `count`, `min`, `max`, `first`, `last`, `distinct`.
- **order-by** : _(String)_ Tri au format `champ:asc|desc`.
- **limit** : _(Number)_ Nombre maximum de resultats.

### Exemple

```html
<dsfr-data-query id="q" source="src"
  group-by="nom_region"
  aggregate="nombre_beneficiaires:sum:total"
  order-by="total:desc" limit="10">
</dsfr-data-query>
```

---

## Normalisation (`dsfr-data-normalize`)

Nettoie et transforme les donnees avant traitement.

### Parametres

- **source** : _(String)_ ID du composant source.
- **to-number** : _(String)_ Champs a convertir en nombre (separes par des virgules).
- **rename** : _(String)_ Renommage de colonnes au format `ancien:nouveau`.
- **trim** : _(Boolean)_ Supprime les espaces en debut/fin des valeurs texte.
- **replace** : _(String)_ Remplacement de valeurs au format `champ:ancien:nouveau`.

---

## Graphique DSFR (`dsfr-data-chart`)

Connecte les donnees a un graphique [DSFR Chart](https://github.com/GouvernementFR/dsfr-chart).

### Parametres

#### Obligatoires :

- **source** : _(String)_ ID du composant source.
- **type** : _(String)_ Type de graphique. Valeurs possibles : `bar`, `line`, `pie`, `radar`, `scatter`, `gauge`, `bar-line`, `map`, `map-reg`.
- **label-field** : _(String)_ Champ pour les etiquettes.
- **value-field** : _(String)_ Champ pour les valeurs.

#### Optionnels :

- **value-field-2** : _(String)_ Champ pour une seconde serie (bar-line).
- **titre** : _(String)_ Titre du graphique.
- **selected-palette** : _(String)_ Palette de couleurs : `default`, `neutral`, `categorical`, `sequentialAscending`, `sequentialDescending`, `divergentAscending`, `divergentDescending`.
- **unit-tooltip** : _(String)_ Unite affichee dans l'infobulle (ex: `%`, `EUR`).
- **horizontal** : _(Boolean)_ Barres horizontales (types bar, bar-line).
- **stacked** : _(Boolean)_ Barres empilees (types bar, bar-line).

### Exemple

```html
<dsfr-data-chart source="q" type="bar"
  label-field="nom_region" value-field="total"
  titre="Beneficiaires par region"
  selected-palette="categorical">
</dsfr-data-chart>
```

---

## Indicateur cle (`dsfr-data-kpi`)

Affiche un indicateur chiffre (KPI) avec formatage, couleur conditionnelle et icone.

### Parametres

- **source** : _(String)_ ID du composant source.
- **value-field** : _(String)_ Champ de la valeur.
- **aggregate** : _(String)_ Fonction d'agregation : `sum`, `avg`, `count`, `min`, `max`.
- **format** : _(String)_ Format d'affichage : `number`, `percent`, `euro`, `decimal`.
- **label** : _(String)_ Libelle affiche sous la valeur.
- **icon** : _(String)_ Classe Remix Icon (ex: `ri-line-chart-line`).
- **color** : _(String)_ Couleur : `blue`, `green`, `orange`, `red`, ou `auto` (seuils automatiques).

---

## Tableau (`dsfr-data-list`)

Affiche les donnees sous forme de tableau avec recherche, tri, pagination et export CSV.

### Parametres

- **source** : _(String)_ ID du composant source.
- **colonnes** : _(String)_ Colonnes a afficher (separes par des virgules, vide = toutes).
- **pagination** : _(Number)_ Nombre de lignes par page (0 = tout afficher).
- **search** : _(Boolean)_ Active la barre de recherche.
- **export-csv** : _(Boolean)_ Active l'export CSV.

---

## Filtres a facettes (`dsfr-data-facets`)

Ajoute des filtres interactifs (checkbox, radio, select) sur les donnees.

### Parametres

- **source** : _(String)_ ID du composant source.
- **fields** : _(String)_ Champs filtrables (separes par des virgules).
- **type** : _(String)_ Type de rendu : `checkbox`, `radio`, `select`.

---

## Recherche (`dsfr-data-search`)

Barre de recherche textuelle avec filtrage client ou server-side.

### Parametres

- **source** : _(String)_ ID du composant source.
- **fields** : _(String)_ Champs dans lesquels chercher.
- **placeholder** : _(String)_ Texte d'indication.
- **server-side** : _(Boolean)_ Delegue la recherche au serveur.

---

## Affichage libre (`dsfr-data-display`)

Template HTML libre pour afficher les donnees sous forme de cartes, fiches ou grilles.

### Parametres

- **source** : _(String)_ ID du composant source.
- **template** : _(String)_ Template HTML avec placeholders `{{champ}}`.
- **empty-message** : _(String)_ Message quand aucune donnee.

---

## Carte du monde (`dsfr-data-world-map`)

Carte choropleth du monde coloree par valeurs.

### Parametres

- **source** : _(String)_ ID du composant source.
- **code-field** : _(String)_ Champ contenant le code pays ISO.
- **value-field** : _(String)_ Champ contenant la valeur.
- **label-field** : _(String)_ Champ contenant le nom du pays.

> Necessite le bundle `dsfr-data.world-map.umd.js` en complement du bundle core.

---

## Accessibilite (`dsfr-data-a11y`)

Companion d'accessibilite : tableau de donnees alternatif, export CSV, description textuelle.

### Parametres

- **for** : _(String)_ ID du composant graphique associe.
- **source** : _(String)_ ID du composant source de donnees.
- **table** : _(Boolean)_ Affiche un tableau alternatif.
- **download** : _(Boolean)_ Ajoute un lien d'export CSV.
- **description** : _(String)_ Description textuelle du graphique.

### Exemple

```html
<dsfr-data-a11y for="mon-graph" source="q" table download></dsfr-data-a11y>
```

---

# Exemple complet

```html
<!-- Charger DSFR + DSFR Chart + dsfr-data (voir section Installation) -->

<!-- Source de donnees -->
<dsfr-data-source id="data"
  url="https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records?limit=100"
  transform="results">
</dsfr-data-source>

<!-- Agregation par region -->
<dsfr-data-query id="q" source="data"
  group-by="nom_region"
  aggregate="nombre_beneficiaires:sum:beneficiaires"
  order-by="beneficiaires:desc" limit="10">
</dsfr-data-query>

<!-- Graphique en barres -->
<dsfr-data-chart id="mon-graph" source="q" type="bar"
  label-field="nom_region" value-field="beneficiaires"
  titre="Beneficiaires par region">
</dsfr-data-chart>

<!-- Accessibilite -->
<dsfr-data-a11y for="mon-graph" source="q" table download></dsfr-data-a11y>
```

---

# Applications de creation

Le projet inclut des applications web permettant de generer le code HTML des composants sans ecrire de code :

| Application | Description |
|-------------|-------------|
| **Builder** | Generateur visuel de graphiques pas-a-pas |
| **Builder IA** | Generateur par conversation avec l'IA Albert |
| **Playground** | Editeur de code interactif avec apercu temps reel |
| **Dashboard** | Editeur visuel de tableaux de bord multi-widgets |
| **Sources** | Gestionnaire de connexions aux APIs |
| **Favoris** | Sauvegarde et reutilisation des creations |
| **Monitoring** | Suivi des widgets deployes en production |

---

# Developpement

## Prerequis

- Node.js >= 20
- npm >= 9

## Installation

```bash
git clone https://github.com/bmatge/dsfr-data.git
cd dsfr-data
npm install
```

## Commandes

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de dev Vite (port 5173) |
| `npm run build` | Build bibliotheque (ESM + UMD) |
| `npm run build:shared` | Build du package `@dsfr-data/shared` |
| `npm run build:apps` | Build de toutes les applications |
| `npm run build:all` | Build complet (shared + lib + apps) |
| `npm run test` | Tests Vitest en watch mode |
| `npm run test:run` | Tests une seule fois |
| `npm run test:e2e` | Tests E2E Playwright |

## Documentation

- [Specifications des composants](https://bmatge.github.io/dsfr-data/specs/) -- Demo interactive et reference des parametres
- [Guide utilisateur](guide/USER-GUIDE.md) -- Parcours pas-a-pas
- [Architecture](ARCHITECTURE.md) -- Architecture technique detaillee
- [Fiche produit](DATASHEET.md) -- Positionnement, comparatif, cibles
- [Contribuer](guide/CONTRIBUTING.md) -- Guide de contribution
- [Proxy CORS](proxy/README.md) -- Deploiement du proxy

## Licence

MIT
