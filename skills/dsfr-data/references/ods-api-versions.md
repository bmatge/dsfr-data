# Versions API OpenDataSoft

> Differences entre v1, v2 et v2.1
>
> Déclencheurs : version, v1, v2, v2.1, migration

## Versions des APIs OpenDataSoft

### API v2.1 (recommandee)
- URL: `/api/explore/v2.1/catalog/datasets/{dataset_id}/records`
- Reponse: `{ results: [...], total_count: N }`
- `transform="results"` pour dsfr-data-source
- ODSQL complet supporte
- Pagination: limit + offset

### API v2.0
- URL: `/api/v2/catalog/datasets/{dataset_id}/records`
- Similaire a v2.1, quelques fonctions ODSQL manquantes
- Deprecie, preferer v2.1

### API v1 (legacy)
- URL: `/api/records/1.0/search/?dataset={dataset_id}`
- Reponse: `{ records: [{ fields: {...}, recordid: "..." }] }`
- `transform="records"` puis les données sont dans `record.fields`
- Parametres differents: q (recherche), refine, exclude, rows, start

### Detection automatique
- URL contient `/v2.1/` -> v2.1
- URL contient `/v2/` -> v2
- URL contient `/1.0/` ou `rows=` -> v1
- Par défaut essayer v2.1

### Migration v1 -> v2.1
| v1 | v2.1 |
|---|---|
| rows=N | limit=N |
| start=N | offset=N |
| q=texte | where=search(champ,"texte") |
| refine.champ=val | where=champ="val" |
| record.fields.X | record.X |

### API v1 avec dsfr-data
L'API v1 renvoie `records[].fields`. Utiliser `transform="records"` sur dsfr-data-source
puis `flatten="fields"` sur dsfr-data-normalize :
```html
<dsfr-data-source id="raw" url="…/1.0/search/?dataset=X&rows=100" transform="records"></dsfr-data-source>
<dsfr-data-normalize id="clean" source="raw" flatten="fields" trim></dsfr-data-normalize>
```
