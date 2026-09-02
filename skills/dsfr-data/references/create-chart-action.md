# Action createChart

> Specification de l'action JSON pour créer un graphique dans le builder-IA
>
> Déclencheurs : createchart, créer un graphique, aperçu, preview

## Action createChart (builder-IA uniquement)

Cette action généré un graphique interactif dans l'aperçu du builder-IA.
Elle est distincte du code embarquable HTML (voir skills composants dsfr-data).

### Format
```json
{
  "action": "createChart",
  "config": {
    "type": "bar",
    "labelField": "nom_region",
    "valueField": "population",
    "aggregation": "sum",
    "where": "status:eq:active",
    "limit": 10,
    "sortOrder": "desc",
    "title": "Titre du graphique",
    "subtitle": "Sous-titre",
    "color": "#000091",
    "palette": "categorical"
  }
}
```

### Proprietes de config
| Propriete | Type | Requis | Description |
|-----------|------|--------|-------------|
| type | String | oui | Type de visualisation (voir ci-dessous) |
| labelField | String | selon type | Champ pour les labels / axe X |
| valueField | String | oui | Champ pour les valeurs / axe Y |
| valueField2 | String | non | 2e série (bar-line, comparaisons) |
| codeField | String | non | Champ code : departement/region (map, map-reg), nom d'academie (map-aca), code pays ISO (map-monde) |
| aggregation | String | non | Fonction : sum, avg, count, min, max |
| where | String | non | Filtre pre-agrégation (voir syntaxe ci-dessous) |
| limit | Number | non | Nombre max de resultats |
| sortOrder | String | non | Tri : "asc", "desc" ou "none" (preserve l'ordre source — utile pour mois/jours/séries temporelles déjà ordonnees en amont) |
| sortField | String | non | Champ de tri. Vide = trie par valeur agregee (défaut). Mettre labelField pour tri alphabetique sur les catégories. |
| title | String | non | Titre affiche |
| subtitle | String | non | Sous-titre affiche |
| color | String | non | Couleur primaire hex (défaut: #000091) |
| color2 | String | non | Couleur secondaire hex (bar-line) |
| variant | String | non | Style KPI : info, success, warning, error |
| unit | String | non | Unite affichee : EUR, %, ou texte libre |
| palette | String | non | Palette DSFR : categorical, sequentialAscending, sequentialDescending, divergentAscending, divergentDescending, neutral. Fonctionne pour tous les types de graphiques. |
| colonnes | String | non | Colonnes datalist : "champ:Label, champ2:Label2" |
| pagination | Number | non | Lignes par page (datalist) |

### Types valides et champs requis
| Type | labelField | valueField | Cas d'usage |
|------|-----------|------------|-------------|
| bar | oui | oui | Comparer des catégories (5-15) |
| line | oui | oui | Evolution temporelle, tendances |
| pie | oui | oui | Parts d'un tout (max 5-7 segments) |
| radar | oui | oui | Profils multicriteres |
| scatter | oui | oui | Correlation entre 2 variables numériques |
| bar-line | oui | oui (+valueField2) | 2 metriques : barres + ligne |
| gauge | non | oui | Progression 0-100% |
| kpi | non | oui | Indicateur chiffre clé unique |
| map | non (codeField) | oui | Données par departement francais |
| map-reg | non (codeField) | oui | Données par region francaise |
| map-aca | non (codeField) | oui | Données par academie (noms en majuscules : PARIS, LYON...) |
| map-monde | non (codeField) | oui | Données par pays (ISO 3166-1 : FR, US... — a3/num convertis) |
| datalist | non | non (colonnes) | Tableau de données filtrable |

IMPORTANT :
- `doughnut` = `pie` (le composant pie est un anneau par défaut)
- `horizontalBar` = `bar` (le renderer le convertit automatiquement)
- Pour KPI et gauge : PAS de labelField
- Pour map/map-reg/map-aca/map-monde : utiliser codeField (pas labelField)

### Syntaxe du filtre (config.where)
Format : `"champ:operateur:valeur"`
Multiples filtres : virgule = ET logique `"champ1:op:val, champ2:op:val"`
Operateurs : eq, neq, gt, gte, lt, lte, contains, in (separateur |)
Le filtre s'applique AVANT l'agrégation. Utiliser les noms de champs bruts de la source.

### Exemples
```json
{"action":"createChart","config":{"type":"kpi","valueField":"prix","aggregation":"avg","where":"code_departement:eq:48","title":"Prix moyen dept 48","unit":"EUR"}}
```
```json
{"action":"createChart","config":{"type":"bar","labelField":"region","valueField":"population","aggregation":"sum","limit":5,"sortOrder":"desc","title":"Top 5 regions"}}
```
```json
{"action":"createChart","config":{"type":"map","codeField":"code_dept","valueField":"score","palette":"sequentialAscending","title":"Score par departement"}}
```
```json
{"action":"createChart","config":{"type":"datalist","colonnes":"nom:Nom, email:Email, ville:Ville","pagination":20,"title":"Liste des contacts"}}
```
```json
{"action":"createChart","config":{"type":"pie","labelField":"region","valueField":"population","aggregation":"sum","palette":"divergentAscending","title":"Population par region"}}
```

Généré TOUJOURS UN SEUL bloc JSON par reponse. Pour changer la couleur ou palette d'un graphique existant, regenere le même createChart avec la palette souhaitee.
