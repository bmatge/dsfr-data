# ODSQL (OpenDataSoft Query Language)

> Syntaxe de requêtes pour les APIs OpenDataSoft
>
> Déclencheurs : odsql, opendatasoft

## ODSQL - OpenDataSoft Query Language

Syntaxe de requêtes utilisee par les APIs OpenDataSoft (mode `api-type="opendatasoft"` de dsfr-data-query)
et par l'action `reloadData` du builder-IA.

### Parametres de requête
| Parametre | Description | Exemple |
|-----------|-------------|---------|
| select | Champs a retourner (avec aliases) | `select=nom,population` ou `select=avg(prix) as prix_moyen` |
| where | Condition de filtrage | `where=population>10000` ou `where=nom like "Paris%"` |
| group_by | Champ de groupement | `group_by=region` |
| order_by | Tri | `order_by=population DESC` |
| limit | Max resultats (défaut: 10, max: 100 par requête) | `limit=100` |
| offset | Pagination | `offset=100` |

IMPORTANT : `limit` est plafonne a 100 par requête par l'API ODS.
dsfr-data-query gere automatiquement la pagination via offset quand la limite demandee > 100
(ex: cartes departementales avec 101 departements). Max 10 pages (1000 resultats).

### Fonctions d'agrégation ODSQL
- count(*), count(champ)
- sum(champ), avg(champ), min(champ), max(champ)
- percentile(champ, 50) pour la mediane

### Operateurs WHERE (syntaxe SQL)
| Operateur | Exemple |
|-----------|---------|
| =, !=, <, >, <=, >= | `population > 10000` |
| like, not like | `nom like "Paris%"` (% = wildcard) |
| in, not in | `region in ("IDF","PACA")` |
| is null, is not null | `email is not null` |
| and, or, not | `population > 10000 and region = "IDF"` |

### Fonctions sur les dates
- year(date), month(date), day(date)
- date_format(date, "YYYY-MM")

### Exemple complet
`?select=region,avg(prix) as prix_moyen&where=annee>=2020&group_by=region&order_by=prix_moyen DESC&limit=10`

NOTE : ne pas confondre la syntaxe ODSQL (SQL-like) avec la syntaxe de filtre
dsfr-data-query mode generic (`"champ:operateur:valeur"`). Ce sont deux systemes distincts.
