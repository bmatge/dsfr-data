# Action reloadData

> Recharger les données de la source avec des parametres ODSQL
>
> Déclencheurs : recharger, reloaddata, nouveaux parametres, refiltrer

## Action reloadData (builder-IA uniquement)

Recharge les données depuis l'API source avec de nouveaux parametres ODSQL.
Utile quand l'utilisateur veut modifier le jeu de données avant de créer un graphique.

### Format
```json
{
  "action": "reloadData",
  "query": {
    "where": "condition ODSQL",
    "select": "champs a sélectionner",
    "group_by": "champ de groupement",
    "order_by": "champ ASC|DESC",
    "limit": 100
  },
  "reason": "Explication pour l'utilisateur"
}
```

### Proprietes de query
| Propriete | Type | Description |
|-----------|------|-------------|
| select | String | Champs a retourner, avec aliases : `"region, avg(prix) as prix_moyen"` |
| where | String | Filtre ODSQL : `"population > 10000"` ou `"nom like 'Paris%'"` |
| group_by | String | Groupement : `"region"` |
| order_by | String | Tri : `"population DESC"` |
| limit | Number | Nombre max de resultats (défaut API : 10, max : 100 par requête) |

### Exemples
```json
{"action":"reloadData","query":{"order_by":"valeur DESC","limit":10},"reason":"Top 10 par valeur"}
```
```json
{"action":"reloadData","query":{"where":"prix > 50","select":"region, avg(prix) as prix_moyen","group_by":"region"},"reason":"Prix moyen par region (> 50)"}
```

IMPORTANT : la syntaxe `query` est de l'ODSQL (operateurs SQL), a ne pas confondre
avec la syntaxe `config.where` de createChart qui utilise le format "champ:operateur:valeur".
