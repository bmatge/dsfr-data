# dsfr-data-normalize

> Nettoyage et normalisation des données avant traitement
>
> Déclencheurs : normaliser, nettoyer, renommer, convertir, normalize, clean, nettoyage, normalisation, grist, airtable, flatten, aplatir, nested, ods v1, records.fields, replace-fields, dimension codee, code insee, arrondir, round, decimales, split, multivalue, multi-valeurs, decouper, group_concat

## <dsfr-data-normalize> - Normalisation de données

Composant invisible intermediaire qui nettoie et normalise les données avant traitement.
Se place entre <dsfr-data-source> et <dsfr-data-query> (ou directement avant une visualisation).

### Position recommandee
```
dsfr-data-source -> dsfr-data-normalize -> dsfr-data-query -> dsfr-data-chart
```
Normaliser AVANT dsfr-data-query permet aux filtres et agrégations de travailler sur des données propres
(evite les comparaisons string vs number).

### Format des données
Entree : tableau d'objets (fourni par dsfr-data-source ou un autre composant).
Sortie : même tableau avec valeurs nettoyees/renommees.

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| id | String | - | oui | Identifiant unique. Sans cet attribut, dsfr-data-normalize ne se monte pas (log `console.error` + attribut `data-dsfr-config-error` sur l'element). |
| source | String | `""` | oui | ID de la source a ecouter |
| flatten | String | `""` | non | Clé du sous-objet a extraire au premier niveau. Utilise pour les APIs Grist, ODS v1, Airtable qui wrappent les données sous `fields`. Supporte la dot notation (`data.attributes`). |
| numeric | String | `""` | non | Champs a forcer en nombre (virgule-separes) : `"population, surface"` |
| numeric-auto | Boolean | `false` | non | Detection et conversion auto des champs numériques |
| rename | String | `""` | non | Renommage : `"ancien:nouveau | ancien2:nouveau2"` (pipe-separe) |
| trim | Boolean | `false` | non | Supprime les espaces en debut/fin des clés ET valeurs string |
| strip-html | Boolean | `false` | non | Supprime les balises HTML des valeurs string |
| replace | String | `""` | non | Remplace des valeurs globalement : `"N/A: | n.d.: | -:0"` (pipe-separe) |
| replace-fields | String | `""` | non | Remplacement cible par champ : `"CHAMP:ancien:nouveau | CHAMP2:a:n"` (pipe-separe). Ne remplace que dans le champ specifie. |
| split | String | `""` | non | Decoupe des champs multivalues (chaine avec separateur) en vrais tableaux : `"Axes:|, Cibles:;"` (entrees separees par virgule, `champ:sep`, separateur par defaut = virgule). Elements trimes, vides ecartes, chaine vide = tableau vide. Les facettes affichent alors une valeur par element au lieu d'un bouton combine « a|b ». |
| round | String | `""` | non | Arrondit des champs numériques : `"montant, prix"` (0 decimales) ou `"taux:2, score:1"` (decimales explicites) |
| lowercase-keys | Boolean | `false` | non | Met toutes les clés en minuscules |
| compute | String | `""` | non | Colonnes calculees (ligne a ligne). Format `"cible = expression; cible2 = expr2"`. Supporte l'arithmetique `+ - * /`, la concatenation texte (`+` avec litteraux 'entre quotes') et les parentheses. Ex: `"pct = valeur * 100; groupe = Indicateurs + ' / ' + Sous_theme"`. Hors perimetre : conditions, fonctions, calculs sur valeurs agregees. |

### Ordre d'execution des transformations
1. **flatten** — aplatit le sous-objet designe
2. trim — nettoie les espaces (clés et valeurs)
3. strip-html — supprime le HTML
4a. **replace-fields** — remplace les valeurs dans les champs specifies
4b. replace — remplace les valeurs globalement (tous les champs)
4c. **split** — decoupe les champs multivalues en tableaux (apres replace : un placeholder remplace par vide donne un tableau vide)
5. numeric / numeric-auto — conversion en nombres
6. **round** — arrondit les valeurs numériques
7. rename — renomme les clés
8. lowercase-keys — clés en minuscules
9. **compute** — colonnes calculees (en dernier, sur valeurs déjà typees : `valeur * 100` voit un nombre, `a + ' / ' + b` concatene)

### Separateurs
- `numeric` : champs separes par virgule
- `rename` et `replace` : paires separees par `|`, clé et valeur separees par `:`
  Le `:` separe le pattern de sa valeur de remplacement (valeur vide = suppression).
- `replace-fields` : paires separees par `|`, format `CHAMP:pattern:remplacement` (les 2 premiers `:` sont des delimiteurs, le remplacement peut contenir des `:`).
- `split` : entrees separees par virgule, format `champ:separateur` (le separateur peut etre `|`, `;`, ` / `… ; absent = virgule). Ne pas utiliser `|` entre les entrees : c'est le separateur le plus courant a decouper.

### Aplatir des données imbriquees (Grist, ODS v1, Airtable)

Certaines APIs renvoient chaque enregistrement sous la forme `{id, fields: {…}}`.
L'attribut `flatten` extrait les clés du sous-objet et les remonte au premier niveau,
rendant les données compatibles avec tous les composants (facettes, datalist, graphiques, KPI).

```html
<!-- Grist -->
<dsfr-data-source id="raw"
  url="https://grist.example.com/api/docs/XXX/tables/MaTable/records"
  transform="records">
</dsfr-data-source>
<dsfr-data-normalize id="clean" source="raw" flatten="fields" trim numeric-auto></dsfr-data-normalize>

<!-- ODS v1 (legacy) -->
<dsfr-data-source id="raw-v1"
  url="https://data.gouv.fr/api/records/1.0/search/?dataset=mon-dataset&rows=100"
  transform="records">
</dsfr-data-source>
<dsfr-data-normalize id="clean-v1" source="raw-v1" flatten="fields" trim></dsfr-data-normalize>

<!-- Airtable -->
<dsfr-data-source id="airtable"
  url="https://api.airtable.com/v0/appXXX/Table"
  headers='{"Authorization": "Bearer pat..."}'
  transform="records">
</dsfr-data-source>
<dsfr-data-normalize id="clean-at" source="airtable" flatten="fields" trim></dsfr-data-normalize>
```

### Exemples
```html
<!-- Conversion numérique + renommage -->
<dsfr-data-source id="raw" url="https://api.fr/data" transform="results"></dsfr-data-source>
<dsfr-data-normalize id="clean" source="raw"
  numeric="population, budget"
  rename="pop_tot:Population totale | lib_dep:Departement"
  trim>
</dsfr-data-normalize>
<dsfr-data-query id="stats" source="clean" group-by="Departement" aggregate="population:sum"></dsfr-data-query>
<dsfr-data-chart source="stats" type="bar" label-field="Departement" value-field="population__sum"></dsfr-data-chart>

<!-- Grist : aplatir + nettoyer + forcer les types numériques -->
<dsfr-data-normalize id="clean" source="raw"
  flatten="fields"
  trim
  numeric="Montant_de_la_sanction_"
  rename="Montant_de_la_sanction_:Montant | Nom_de_l_entreprise:Entreprise">
</dsfr-data-normalize>

<!-- Nettoyage complet : trim + strip HTML + remplacement de valeurs vides -->
<dsfr-data-normalize id="propre" source="raw"
  trim
  strip-html
  replace="N/A: | n.d.: | -:0"
  numeric-auto>
</dsfr-data-normalize>

<!-- Arrondir des montants (supprimer les decimales) -->
<dsfr-data-normalize id="clean" source="raw"
  round="montant_investissement, montant_participation_etat">
</dsfr-data-normalize>

<!-- Arrondir a 2 decimales (taux) -->
<dsfr-data-normalize id="clean" source="raw" round="taux:2"></dsfr-data-normalize>

<!-- Normalisation des clés en minuscules -->
<dsfr-data-normalize id="lower" source="raw" lowercase-keys></dsfr-data-normalize>

<!-- Champs multivalues (group_concat SQL, CSV « a|b|c ») -> tableaux pour les facettes -->
<dsfr-data-normalize id="data" source="flat" split="Axes:|, Operateurs:|, Cibles:|"></dsfr-data-normalize>
<dsfr-data-facets id="filtres" source="data" fields="Axes, Operateurs" disjunctive="Axes"></dsfr-data-facets>

<!-- INSEE Melodi : decoder les dimensions codees par champ -->
<dsfr-data-source id="raw" api-type="insee" base-url="https://api.insee.fr/melodi"
  dataset-id="DS_POPULATIONS_REFERENCE"
  where="POPREF_MEASURE:eq:PMUN, TIME_PERIOD:eq:2023"></dsfr-data-source>
<dsfr-data-normalize id="decoded" source="raw"
  replace-fields="AGE:Y30T39:30-39 ans | AGE:Y_LT30:Moins de 30 ans | PCS:3:Cadres | PCS:5:Employes"
  replace="N/A:">
</dsfr-data-normalize>
```

### Référence `<dsfr-data-normalize>` (générée depuis le code)

**Rôle pipeline** : transformateur (`TransformerMixin`) — consomme `source`, ré-émet sous son propre `id`, relaie les commandes vers l’amont.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `compute` | `string` | `""` (vide) | Colonnes calculées (ligne à ligne, sur valeurs brutes). Format : "cible = expression; cible2 = expression2". Supporte l'arithmétique (+ - * /), la concaténation texte (+ avec littéraux 'entre quotes') et les parenthèses. Ex : "pct = valeur * 100; groupe = Indicateurs + ' / ' + Sous_theme". Hors périmètre : conditions, fonctions, calculs sur valeurs agrégées. |
| `flatten` | `string` | `""` (vide) | Clé du sous-objet a aplatir au premier niveau. Supporte la dot notation (ex: "data.attributes"). |
| `lowercase-keys` | `boolean` | `false` | Met toutes les clés en minuscules |
| `numeric` | `string` | `""` (vide) | Champs a convertir en nombre (virgule-separes). Ex: "population, surface" |
| `numeric-auto` | `boolean` | `false` | Detection automatique des champs numériques via looksLikeNumber() |
| `rename` | `string` | `""` (vide) | Renommage de clés. Format: "ancien:nouveau \| ancien2:nouveau2" |
| `replace` | `string` | `""` (vide) | Remplacement de valeurs. Format: "pattern:remplacement \| pattern2:remplacement2" |
| `replace-fields` | `string` | `""` (vide) | Remplacement cible par champ. Format: "CHAMP:pattern:remplacement \| CHAMP2:p:r" |
| `round` | `string` | `""` (vide) | Arrondit les champs numériques a l'entier (ou a N decimales). Format: "champ1, champ2" ou "champ1:2, champ2:0" |
| `source` | `string` | `""` (vide) | ID de la source de données a ecouter |
| `split` | `string` | `""` (vide) | Decoupe des champs multivalues (chaine avec separateur) en vrais tableaux, comme une ChoiceList Grist. Format : "champ:sep, champ2:sep2" ; separateur par defaut : la virgule ("champ" seul). Ex : "Axes:\|, Cibles:;". Chaque element est trime, les elements vides sont ecartes, une chaine vide donne un tableau vide. Les valeurs non-string (tableau deja forme, null, nombre) sont laissees telles quelles. Les composants aval traitent ces tableaux comme des champs multi-valeurs (facettes : une valeur par element). |
| `strip-html` | `boolean` | `false` | Supprime les balises HTML des valeurs string |
| `trim` | `boolean` | `false` | Supprime les espaces en debut/fin de toutes les clés et valeurs string |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getAdapter()` | `import('../adapters/api-adapter.js').ApiAdapter \| null` | Retourne l'adapter de la source amont (delegation transparente). Permet aux composants en aval (dsfr-data-facets, dsfr-data-search) d'acceder a l'adapter sans connaitre la structure du pipeline. |
| `getAdapterParams()` | `import('../adapters/api-adapter.js').AdapterParams \| null` | Retourne les parametres adapter resolus de la source amont (delegation transparente, headers api-key-ref inclus — #274). |
| `getEffectiveWhere(excludeKey?: string)` | `string` | Retourne le where effectif de la source amont (delegation transparente). |
| `transformsSchema()` | `boolean` | True si la normalisation crée/renomme des colonnes (#394) : rename, compute, flatten et lowercase-keys changent les clés — les opérations serveur d'une query aval porteraient sur des noms inconnus de l'API. Sinon (transformations de valeurs uniquement : numeric, trim…), le statut est délégué à l'amont — un unpivot peut précéder ce normalize. |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |
| `dsfr-data-loaded` | `{ sourceId, data }` | émis | Données transformées, ré-émises sous l’`id` de CE composant (c’est cet `id` que l’aval met dans son `source`). |
| `dsfr-data-error` | `{ sourceId, error }` | émis | Erreur amont ou de transformation, sous l’`id` de ce composant. |
| `dsfr-data-loading` | `{ sourceId }` | émis | Chargement amont relayé vers l’aval. |
| `dsfr-data-source-command` | `{ sourceId, page?, where?, whereKey?, orderBy?, groupBy?, aggregate? }` | émis | Commande de pagination / filtre / tri envoyée à la source AMONT — soit originée par ce composant, soit relayée depuis l’aval. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
