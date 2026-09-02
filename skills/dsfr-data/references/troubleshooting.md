# Troubleshooting

> Pieges courants et erreurs frequentes
>
> Déclencheurs : erreur, bug, marche pas, probleme, vide, affiche pas, ne fonctionne pas

## Pieges courants et troubleshooting

### 1. Le graphique est vide / ne s'affiche pas
- **Vérifier `transform`** : l'API retourne souvent un objet enveloppe (`{results: [...]}`).
  Si `transform` n'est pas défini ou pointe au mauvais endroit, les données seront vides.
  Exemples : `transform="results"` (ODS v2.1), `transform="data"` (Tabular), `transform="records"` (ODS v1)
- **Vérifier les noms de champs** : `label-field` et `value-field` doivent correspondre
  exactement aux clés des objets JSON retournes (sensible a la casse).
- **Vérifier `source`** : l'attribut `source="xxx"` doit correspondre exactement a l'`id="xxx"`
  de la dsfr-data-source ou dsfr-data-query (sensible a la casse).

### 2. La carte ne s'affiche pas correctement
- **Codes departements** : utiliser des codes INSEE (string) : "01" a "95", "2A", "2B", "971" a "976".
  Attention au zero initial ("01" et non 1).
- **Utiliser code-field** (pas label-field) pour les cartes.
- **Patience** : les composants DSFR Chart map sont des Web Components Vue qui ecrasent
  certains attributs au montage. dsfr-data-chart applique un delai de 500ms pour re-injecter
  les valeurs. Le graphique peut mettre ~1s a apparaitre.

### 3. Limite de 100 resultats (API ODS)
L'API OpenDataSoft retourne maximum 100 enregistrements par requête.
dsfr-data-query en mode `opendatasoft` gere automatiquement la pagination (max 10 pages = 1000 resultats).
Pour une dsfr-data-source brute, ajouter `limit=100` dans l'URL ou utiliser dsfr-data-query.

### 4. Nommage des champs agrégé
Apres une agrégation dans dsfr-data-query, les champs sont renommes :
`"champ__fonction"` (double underscore). Exemple : `aggregate="population:sum"` produit
le champ `population__sum`. Utiliser ce nom dans `value-field` et `order-by`.

### 5. Confusion syntaxe filtre generic vs ODSQL
- **Mode generic** (dsfr-data-query avec source) : `where="champ:operateur:valeur"` (ex: `"prix:gt:100"`)
- **Mode opendatasoft** (dsfr-data-query serveur) : `where="prix > 100"` (syntaxe SQL)
- **Action reloadData** (builder-IA) : syntaxe ODSQL (SQL)
- **Action createChart** (builder-IA) : syntaxe generic (`"champ:operateur:valeur"`)
Ne pas melanger les deux !

### 6. Attributs HTML en kebab-case
Les attributs HTML sont en kebab-case : `label-field`, `value-field`, `api-type`, `code-field`, etc.
Ne pas utiliser camelCase dans le HTML (`labelField` ne fonctionnera pas).
En revanche, les proprietes JavaScript sont en camelCase (`element.labelField`).

### 8. La recherche ne filtre rien / cherche dans les mauvais champs
- Vérifier que `fields` liste les bons noms de champs (sensible a la casse)
- Vérifier que `source` pointe vers une source avec des données aplaties
  (si Grist : s'assurer que flatten="fields" est actif sur le normalize)
- Si `fields` est vide, la recherche porte sur TOUS les champs, y compris
  les champs techniques (id, SIRET...). Preciser les champs pour plus de precision.

### 7. Facettes / datalist vides avec Grist ou ODS v1
Les APIs Grist, ODS v1, et Airtable wrappent les données sous `records[].fields`.
Les composants dsfr-data-facets, dsfr-data-list, dsfr-data-query et dsfr-data-kpi attendent des
clés de premier niveau.

**Solution** : ajouter `flatten="fields"` sur dsfr-data-normalize :
```html
<dsfr-data-normalize id="clean" source="raw" flatten="fields" trim></dsfr-data-normalize>
```
