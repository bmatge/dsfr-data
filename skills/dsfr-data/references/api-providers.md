# Providers API

> Fournisseurs de données supportes et leurs capacites
>
> Déclencheurs : provider, fournisseur, opendatasoft, tabular, data.gouv, grist, insee, melodi, api-type, source de données, quel api, quelle source

## Providers API supportes

dsfr-data détecté automatiquement le provider a partir de l'URL de l'API.
Chaque provider a des capacites differentes pour la pagination, l'agrégation et les facettes.

### Matrice des capacites
| Capacite | OpenDataSoft | Tabular (data.gouv.fr) | Grist | INSEE (Melodi) | Generique |
|----------|:---:|:---:|:---:|:---:|:---:|
| Fetch serveur | oui | oui | oui | oui | non (dsfr-data-source) |
| Pagination auto | oui (offset, 10 pages) | oui (page, 500 pages, max 50/page) | oui (offset, 100/page) | oui (page, 1000/page, 100k max) | non |
| Facettes serveur | oui | non | oui (SQL) | non | non |
| Recherche serveur | oui (full-text) | non | non | non | non |
| Group-by serveur | oui | oui (column__groupby) | oui (SQL) | non | non |
| Agrégation serveur | oui (ODSQL) | oui (column__sum, __avg, __count, __min, __max) | oui (SQL) | non | non |
| Tri serveur | oui | oui | oui | non | non |
| Pagination serveur | oui (offset) | oui (page) | oui (offset) | oui (page) | non |
| Format filtre | ODSQL (SQL-like) | colon (champ:op:valeur) | colon | colon (dimension:eq:valeur) | colon |

### Detection automatique du provider
| Provider | Pattern URL |
|----------|------------|
| OpenDataSoft | `/api/explore/v2.1/catalog/datasets/{datasetId}` |
| Tabular | `tabular-api.data.gouv.fr/api/resources/{resourceId}` |
| Grist | `/api/docs/{documentId}/tables/{tableId}` |
| INSEE (Melodi) | `melodi/data/{datasetId}` |
| Generique | Tout autre URL (fallback) |

### Usage dans dsfr-data-source (attribut api-type)
| api-type | Provider | Attributs requis |
|----------|---------|-----------------|
| `"opendatasoft"` | OpenDataSoft | `base-url` + `dataset-id` |
| `"tabular"` | Tabular | `base-url` + `resource` |
| `"grist"` | Grist | `base-url` (URL complete avec proxy) |
| `"insee"` | INSEE (Melodi) | `base-url` + `dataset-id` |
| `"generic"` (défaut) | Generique | `url` + `transform` |

### Pipeline par provider

**OpenDataSoft** (tout serveur, le plus puissant) :
```html
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr"
  dataset-id="rappelconso">
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  select="categorie_de_produit, count(*) as total"
  group-by="categorie_de_produit"
  order-by="total:desc" limit="10">
</dsfr-data-query>
```

**Tabular** (fetch serveur + agrégation serveur) :
```html
<dsfr-data-source id="src" api-type="tabular"
  base-url="https://tabular-api.data.gouv.fr"
  resource="RESOURCE_ID">
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  group-by="departement"
  aggregate="population:sum"
  order-by="population__sum:desc">
</dsfr-data-query>
```

**Grist** (fetch serveur + auto-flatten, aggregation via SQL) :
```html
<dsfr-data-source id="src" api-type="grist"
  base-url="https://chartsbuilder.matge.com/grist-gouv-proxy/api/docs/DOC_ID/tables/TABLE/records"
  headers='{"Authorization":"Bearer API_KEY"}'>
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  group-by="region"
  aggregate="population:sum">
</dsfr-data-query>
```
L'adapter Grist aplatit automatiquement `records[].fields` — pas besoin de dsfr-data-normalize.
L'adapter choisit automatiquement entre mode Records (filter/sort/pagination) et mode SQL (group-by, aggregation, facettes).

**INSEE Melodi** (fetch serveur + filtrage par dimensions, tout le reste client-side) :
```html
<dsfr-data-source id="src" api-type="insee"
  base-url="https://api.insee.fr/melodi"
  dataset-id="DS_POPULATIONS_REFERENCE"
  where="POPREF_MEASURE:eq:PMUN, TIME_PERIOD:eq:2023">
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  filter="GEO:contains:DEP"
  order-by="OBS_VALUE:desc" limit="20">
</dsfr-data-query>
```
L'adapter INSEE aplatit automatiquement les observations (dimensions + measures + attributes) en objets plats.
`OBS_VALUE_NIVEAU.value` devient `OBS_VALUE`. Pas de proxy necessaire (CORS actif). 30 req/min max.

**Generique** (dsfr-data-source obligatoire) :
```html
<dsfr-data-source id="raw" url="https://api.exemple.fr/data" transform="results"></dsfr-data-source>
<dsfr-data-query id="data" source="raw"
  group-by="region"
  aggregate="montant:sum">
</dsfr-data-query>
```

### Authentification par provider
| Provider | Méthode | Header/Param |
|----------|---------|-------------|
| OpenDataSoft | API Key | `headers='{"apikey":"KEY"}'` |
| Tabular | Aucune | Acces public uniquement |
| Grist | Bearer token | `headers='{"Authorization":"Bearer KEY"}'` |
| INSEE (Melodi) | Aucune | Acces anonyme (30 req/min) |
| Generique | Variable | Via `headers` sur dsfr-data-source |

### Proxy CORS
Certaines APIs externes (Grist gouv/SaaS, Tabular) ne supportent pas le CORS
navigateur : il faut un proxy CORS. La voie recommandee est l'attribut
**`proxy-url` par source** : on declare l'URL reelle de l'API + le domaine du
proxy, l'integrateur peut remplacer ce domaine par le sien.

```html
<!-- Grist gouv via proxy declaratif : URL reelle + proxy-url -->
<dsfr-data-source id="src"
  url="https://grist.numerique.gouv.fr/api/docs/DOC_ID/tables/TABLE/records"
  proxy-url="https://mon-proxy.fr"
  transform="records">
</dsfr-data-source>
```

`proxy-url` reecrit automatiquement les hotes connus vers leur endpoint dedie
(`/grist-gouv-proxy`, `/grist-proxy`, `/tabular-proxy`, `/insee-proxy`). Il est
prioritaire sur le global `window.DSFR_DATA_PROXY` et la config build. Sans
`proxy-url` ni global, l'URL est fetchee en direct (echec CORS attendu sur les
instances gouv).

APIs avec CORS natif (pas de proxy necessaire) :
- OpenDataSoft (`*.opendatasoft.com` et portails publics)
- INSEE Melodi (`api.insee.fr`)
