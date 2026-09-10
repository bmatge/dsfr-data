# dsfr-data-normalize

> Nettoyage et normalisation des données avant traitement
>
> Déclencheurs : normaliser, nettoyer, renommer, convertir, normalize, clean, nettoyage, normalisation, grist, airtable, flatten, aplatir, nested, ods v1, records.fields, replace-fields, dimension codee, code insee, arrondir, round, decimales, split, multivalue, multi-valeurs, decouper, group_concat, fold, replier, colonnes oui/non, colonnes booleennes, compute, colonne calculee, colonnes calculees, calculer une colonne, recoder, recodage, tranche, seuil, when, coalesce, non renseigne, annee d une date, extraire l annee, solde

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
| rename | String | `""` | non | Renommage : `"ancien:nouveau \| ancien2:nouveau2"` (pipe-separe) |
| trim | Boolean | `false` | non | Supprime les espaces en debut/fin des clés ET valeurs string |
| strip-html | Boolean | `false` | non | Supprime les balises HTML des valeurs string |
| replace | String | `""` | non | Remplace des valeurs globalement : `"N/A: \| n.d.: \| -:0"` (pipe-separe). Egalite stricte sur la FORME CHAINE de la valeur entiere, pas de regex : une colonne numerique ou booleenne est concernee aussi (#730). Un `:` littéral dans le pattern s'échappe en `%3A` (`%7C`, `%2C`, `%25` idem) : `"10%3A00:10h"`. |
| replace-fields | String | `""` | non | Remplacement cible par champ : `"CHAMP:ancien:nouveau \| CHAMP2:a:n"` (pipe-separe). Ne remplace que dans le champ specifie. Egalite stricte sur la forme chaine de la valeur : `replace-fields="annee:2024:2024-2025"` fonctionne sur une colonne numerique (#730). Un `:` littéral dans le pattern s'échappe en `%3A` : `"h:10%3A00:10h"`. Pas de regex : pour un recodage plus riche (sous-chaine, annee d'une date), utiliser `compute` avec `replace()` ou `year()`. |
| split | String | `""` | non | Decoupe des champs multivalues (chaine avec separateur) en vrais tableaux : `"Axes:\|, Cibles:;"` (entrees separees par virgule, `champ:sep`, separateur par defaut = virgule). Elements trimes, vides ecartes, chaine vide = tableau vide. Les facettes affichent alors une valeur par element au lieu d'un bouton combine « a\|b ». |
| round | String | `""` | non | Arrondit des champs numériques : `"montant, prix"` (0 decimales) ou `"taux:2, score:1"` (decimales explicites) |
| lowercase-keys | Boolean | `false` | non | Met toutes les clés en minuscules |
| fold | String | `""` | non | Replie des colonnes booléennes parallèles (une colonne Oui/Non par modalité) en UN champ tableau : `"handicap_*:handicaps"` (entrees separees par virgule, `motif:cible`, joker `*` en debut ou en fin de motif seulement, ou nom exact ; plusieurs motifs peuvent viser la meme cible). Le tableau contient les noms des colonnes vraies (Oui/Non, 1/0, true/false, X/vide via `toBoolean`), etiquetees par la partie variable du motif (`handicap_moteur` → « moteur ») ou le nom complet pour un motif exact. Colonnes sources conservees. |
| fold-drop | Boolean | `false` | non | Avec `fold` : retire les colonnes sources repliees du resultat. |
| compute | String | `""` | non | Colonnes calculees (ligne a ligne, en dernier). Format `"cible = expression; cible2 = expr2"`. Arithmetique `+ - * /`, concatenation texte (`+` avec litteraux 'entre quotes'), parentheses, fonctions en liste blanche (`year month day round abs floor ceil lower upper trim len concat replace coalesce is_null is_empty join contains`), conditions `when COND then EXPR … else EXPR` (`else` obligatoire), comparaisons `= != < <= > >=`, `and or not`, litteraux `null true false`. Ex: `"solde = actif - passif; tranche = when montant >= 1000000 then 'Grand' else 'Petit'; type = coalesce(type_entreprise, 'Non renseigné'); annee = year(date_notification)"`. Fonction inconnue ou `when` sans `else` = erreur de configuration (console + `data-dsfr-config-error`). Grammaire complete : section « Colonnes calculees » ci-dessous. Hors perimetre : valeurs agregees (query / kpi), ligne precedente, cumul. |

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
9. **fold** — replie les colonnes booléennes en un tableau (apres rename et lowercase-keys : les motifs se lisent sur les noms finaux, qui servent d'etiquettes — `rename="handicap_moteur:handicap_Moteur"` donne « Moteur »)
10. **compute** — colonnes calculees (en dernier, sur valeurs déjà typees : `valeur * 100` voit un nombre, `a + ' / ' + b` concatene ; un tableau issu de `fold` y est disponible)

### Separateurs
- `numeric` : champs separes par virgule
- `rename` et `replace` : paires separees par `|`, clé et valeur separees par `:`
  Le `:` separe le pattern de sa valeur de remplacement (valeur vide = suppression).
- `replace-fields` : paires separees par `|`, format `CHAMP:pattern:remplacement` (les 2 premiers `:` sont des delimiteurs, le remplacement peut contenir des `:`).
- Echappement percent (`rename`, `replace`, `replace-fields`, meme convention que `where`) : un `:` littéral s'ecrit `%3A`, `|` → `%7C`, `,` → `%2C`, `%` → `%25`. Decode APRES le decoupage sur les separateurs : `replace-fields="h:10%3A00:10h"` recrit « 10:00 » en « 10h ». Aucune regex n'est acceptee (surface ReDoS) : au-dela de l'egalite stricte, passer par `compute` (`replace(s, 'a', 'b')` littéral, `year(date)`).
- `split` : entrees separees par virgule, format `champ:separateur` (le separateur peut etre `|`, `;`, ` / `… ; absent = virgule). Ne pas utiliser `|` entre les entrees : c'est le separateur le plus courant a decouper.
- `fold` : entrees separees par virgule, format `motif:cible` (`*` en debut ou en fin du motif seulement ; un motif au joker mal place est signale en console + `data-dsfr-config-error` et ignore, les autres s'appliquent).

### Colonnes calculees : compute (fonctions, when / then / else)

`compute` s'execute en dernier, sur les valeurs deja typees par `numeric` / `round` /
`rename`. Une assignation suivante peut relire une colonne calculee avant elle. Tout
est **par ligne** : pour un agregat (somme, moyenne, distinct), passer par `dsfr-data-query`
ou `dsfr-data-kpi` ; pour l'affichage conditionnel d'un fragment, par les templates
(`{{#if}}`), pas par `compute`.

**Fonctions (liste blanche, appel `f(a, b)`)** — toute autre fonction est une erreur de
configuration, jamais une colonne vide :

| Famille | Fonctions | Notes |
|---------|-----------|-------|
| Dates | `year(d)`, `month(d)`, `day(d)` | Date ISO (`2024-03-15`, `2024-03-15T10:00:00Z`, `2024-03`) ou objet Date → nombre ; sinon `null` (une date `15/03/2024` n'est pas reconnue) |
| Nombres | `round(x, n)`, `abs(x)`, `floor(x)`, `ceil(x)` | `n` facultatif (0 par defaut) ; chaine numerique FR acceptee (`"12,5"`) ; non numerique → `null` |
| Texte | `lower(s)`, `upper(s)`, `trim(s)`, `len(s)`, `concat(a, b, …)`, `replace(s, 'de', 'vers')` | `replace` est litteral (toutes les occurrences, pas de regex) ; `null` reste `null` sauf `len` (0) et `concat` (vide) |
| Absence | `coalesce(a, b, …)`, `is_null(x)`, `is_empty(x)` | `coalesce` = premiere valeur non nulle (`''` compte comme une valeur) ; `is_empty` = null, `''` ou tableau vide |
| Tableaux | `join(arr, ', ')`, `contains(arr_ou_texte, v)` | `contains` sur tableau = egalite lache par element (comme `in`) ; sur texte = sous-chaine insensible a la casse (comme `where contains`) |

**Conditions** : `when COND then EXPR [when COND then EXPR]… else EXPR`. La premiere
condition vraie gagne ; le `else` est **obligatoire**. Une condition combine des
comparaisons `= != < <= > >=` avec `and`, `or`, `not` (priorite : `not` > `and` > `or` ;
parentheses possibles). Un `when` peut s'imbriquer dans une arithmetique ou dans une
branche — le mettre entre parentheses quand il est suivi d'un operateur.

**Meme semantique que `where`, syntaxe infixe** : l'egalite est lache (nombre ↔ chaine
numerique : `dept = 75` matche `"75"`), `< <= > >=` comparent en nombre quand les deux
cotes sont numeriques et en texte sinon (dates ISO comprises), null / absent / vide ne
matchent jamais une comparaison d'ordre. Correspondance :

| `where` (dialecte colon, attribut) | `when` (infixe, dans compute) |
|------|------|
| `champ:eq:v` | `champ = 'v'` ou `champ = 75` |
| `champ:neq:v` | `champ != 'v'` |
| `champ:gt:n` / `gte` / `lt` / `lte` | `champ > n` / `>=` / `<` / `<=` |
| `champ:isnull` / `champ:isnotnull` | `is_null(champ)` / `not is_null(champ)` (ou `champ = null` / `champ != null`) |
| `champ:contains:v` / `notcontains` | `contains(champ, 'v')` / `not contains(champ, 'v')` |
| `champ:in:a\|b` / `notin` | `champ = 'a' or champ = 'b'` / `not (…)` |
| `a:eq:1, b:eq:2` (virgule = ET) | `a = 1 and b = 2` |

Garde-fous : aucun `eval`, seuls les champs de la ligne sont lisibles, expression bornee
en longueur (2000 caracteres) et en profondeur (32 niveaux). Les colonnes produites
apparaissent dans la trace du volet Diagnostic (« calculees (compute) : … » avec un exemple
de valeur).

```html
<!-- Solde, tranche par seuils, valeur par defaut, annee d'une date -->
<dsfr-data-normalize id="calc" source="raw" numeric="actif, passif, montant"
  compute="solde = actif - passif;
           tranche = when montant >= 1000000 then 'Grand' when montant >= 100000 then 'Moyen' else 'Petit';
           type = coalesce(type_entreprise, 'Non renseigné');
           annee = year(date_notification)">
</dsfr-data-normalize>
<dsfr-data-query id="par-tranche" source="calc" group-by="tranche" aggregate="solde:sum"></dsfr-data-query>

<!-- Part en % arrondie, libelle compose, indicateur booleen -->
<dsfr-data-normalize id="calc" source="raw"
  compute="part_pct = round(part * 100, 1);
           libelle = concat(upper(code), ' - ', trim(nom));
           actif = when statut = 'A' and not is_empty(siret) then true else false">
</dsfr-data-normalize>

<!-- Recodage d'une liste (split) puis reconstitution -->
<dsfr-data-normalize id="calc" source="raw" split="risques:|"
  compute="nb_risques = len(risques); inondable = contains(risques, 'inondation'); risques_txt = join(risques, ', ')">
</dsfr-data-normalize>
```

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

<!-- Colonnes booléennes paralleles (handicap_moteur, handicap_visuel, handicap_auditif,
     handicap_mental : Oui/Non) -> UN champ tableau « handicaps » filtrable par UNE facette.
     Sans fold, il faudrait une facette par colonne. fold-drop retire les colonnes d'origine. -->
<dsfr-data-normalize id="acces" source="raw" fold="handicap_*:handicaps" fold-drop></dsfr-data-normalize>
<dsfr-data-facets id="filtres" source="acces" fields="handicaps"></dsfr-data-facets>

<!-- INSEE Melodi : les libelles sont resolus automatiquement (#592).
     Les observations n'arrivent plus en codes SDMX : AGE vaut « De 25 a 49 ans »
     et non « Y25T49 », GEO vaut « Ain » et non « 2025-DEP-01 ». Le code d'origine
     reste disponible dans une colonne <DIMENSION>_CODE (AGE_CODE, GEO_CODE),
     a utiliser pour les filtres, les jointures et la synchronisation d'URL, qui
     veulent une valeur stable. Inutile donc de decoder a la main. -->
<dsfr-data-source id="raw" api-type="insee" base-url="https://api.insee.fr/melodi"
  dataset-id="DS_POPULATIONS_REFERENCE"
  where="POPREF_MEASURE:eq:PMUN, TIME_PERIOD:eq:2023"></dsfr-data-source>
<dsfr-data-chart source="raw" type="bar" x-field="AGE" y-field="OBS_VALUE"></dsfr-data-chart>

<!-- replace-fields ne sert plus qu'a un renommage sur mesure, par-dessus les
     libelles officiels (raccourcir un intitule pour un axe, par exemple) -->
<dsfr-data-normalize id="court" source="raw"
  replace-fields="AGE:De 25 a 49 ans:25-49"></dsfr-data-normalize>
```

### Référence `<dsfr-data-normalize>` (générée depuis le code)

**Rôle pipeline** : transformateur (`TransformerMixin`) — consomme `source`, ré-émet sous son propre `id`, relaie les commandes vers l’amont.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `compute` | `string` | `""` (vide) | Colonnes calculées, ligne à ligne, en dernier (sur les valeurs déjà typées par numeric / round / rename). Format : `cible = expression; cible2 = expression2` (une assignation suivante peut relire une colonne calculée avant elle). Grammaire (ADR-105, #671) : - arithmétique `+ - * /`, parenthèses, moins unaire ; `+` concatène dès qu'un côté n'est pas numérique ; littéraux texte 'entre quotes simples', nombres à point ; - littéraux `null`, `true`, `false` ; - fonctions en liste blanche, appel `f(a, b)` : dates `year(d)`, `month(d)`, `day(d)` (ISO ou Date, sinon null) ; nombres `round(x, n)`, `abs(x)`, `floor(x)`, `ceil(x)` (non numérique → null) ; texte `lower(s)`, `upper(s)`, `trim(s)`, `len(s)`, `concat(a, b, …)`, `replace(s, 'de', 'vers')` (littéral, toutes les occurrences, pas de regex) ; absence `coalesce(a, b, …)` (première valeur non nulle), `is_null(x)`, `is_empty(x)` (null, '' ou tableau vide) ; tableaux `join(arr, ', ')`, `contains(arr_ou_texte, v)` ; - conditions `when COND then EXPR [when … then …]… else EXPR` — le `else` est obligatoire (erreur de configuration sinon) ; comparaisons d'égalité `=` et `!=` et d'ordre (inférieur, inférieur ou égal, supérieur, supérieur ou égal, avec les signes usuels — grammaire complète dans le guide « Colonnes calculées » de la skill), `and`, `or`, `not`. L'égalité est lâche comme celle de `where` (nombre ↔ chaîne numérique) : `when cat = 'A'` et `where="cat:eq:A"` gardent les mêmes lignes. Les comparaisons d'ordre se font en nombre quand les deux côtés sont numériques, en texte sinon (dates ISO comprises) ; null, undefined et '' ne matchent jamais. Exemples : `solde = actif - passif`, `tranche = when montant = 0 then 'Nul' when is_null(montant) then 'Inconnu' else 'Renseigné'`, `type = coalesce(type_entreprise, 'Non renseigné')`, `annee = year(date_notification)`, `pct = round(part * 100, 1)`, `serie = Indicateurs + ' / ' + Sous_theme` ; une tranche par seuils s'écrit avec les opérateurs d'ordre (voir le guide). Fonction hors liste, arité fausse, `when` sans `else`, expression trop longue ou trop imbriquée : erreur de configuration (console + `data-dsfr-config-error`), état d'erreur en aval — jamais une colonne silencieusement vide. Aucun `eval` : tokenizer, parseur, AST ; seuls les champs de la ligne sont accessibles. Hors périmètre : valeurs agrégées (query / kpi), ligne précédente, cumul. |
| `flatten` | `string` | `""` (vide) | Clé du sous-objet a aplatir au premier niveau. Supporte la dot notation (ex: "data.attributes"). |
| `fold` | `string` | `""` (vide) | Repli de colonnes booléennes parallèles en un champ multi-valeurs (#677) — le motif open data « une colonne Oui/Non par modalité » (`handicap_moteur`, `handicap_visuel`…). Format : "motif:cible, motif2:cible2". Le joker `*` n'est accepté qu'en début ou en fin de motif (`handicap_*`, `*_ok`) ; un motif sans joker désigne une colonne exacte ; plusieurs motifs peuvent viser la même cible. Chaque ligne reçoit dans `cible` le tableau des colonnes dont la valeur est vraie au sens de `toBoolean` (Oui/Non, 1/0, true/false, X/vide…), étiquetées par la partie variable du motif (`handicap_moteur` donne « moteur ») ou par le nom complet de la colonne pour un motif sans joker. Les colonnes sources sont conservées (voir `fold-drop`). S'exécute après `rename` et `lowercase-keys`, avant `compute` : les motifs se lisent sur les noms renommés, qui servent donc d'étiquettes (`rename="handicap_moteur:handicap_Moteur"` donne « Moteur »). Le tableau obtenu se filtre avec `dsfr-data-facets` comme un champ `split` (une valeur par élément). Ex : `fold="handicap_*:handicaps"`. |
| `fold-drop` | `boolean` | `false` | Avec `fold` : retire du résultat les colonnes sources repliées. |
| `lowercase-keys` | `boolean` | `false` | Met toutes les clés en minuscules |
| `numeric` | `string` | `""` (vide) | Champs a convertir en nombre (virgule-séparés). Ex: "population, surface" |
| `numeric-auto` | `boolean` | `false` | Detection automatique des champs numériques via looksLikeNumber() |
| `rename` | `string` | `""` (vide) | Renommage de clés. Format : "ancien:nouveau \| ancien2:nouveau2". Un `:` ou `\|` littéral dans un nom s'échappe en percent (`%3A`, `%7C`), comme dans `where`. |
| `replace` | `string` | `""` (vide) | Remplacement de valeurs, sur tous les champs. Format : "pattern:remplacement \| pattern2:remplacement2". Le pattern est comparé à la valeur entière (égalité stricte, pas de regex) ; un remplacement vide supprime la valeur. Un `:`, `\|`, `,` ou `%` littéral dans le pattern ou le remplacement s'échappe en percent (`%3A`, `%7C`, `%2C`, `%25`), comme dans `where` (#676) : `replace="10%3A00:10h"` récrit « 10:00 » en « 10h ». La comparaison porte sur la forme chaîne de la valeur : une colonne numérique est concernée aussi (#730). Pour un recodage plus riche (sous-chaîne, année d'une date ISO), utiliser `compute` avec `replace()` ou `year()`. |
| `replace-fields` | `string` | `""` (vide) | Remplacement ciblé par champ. Format : "CHAMP:pattern:remplacement \| CHAMP2:p:r". Les deux premiers `:` sont des délimiteurs, le remplacement peut contenir des `:` bruts. Un `:` littéral dans le nom du champ ou dans le pattern s'échappe en `%3A` (`%7C`, `%2C` et `%25` sont aussi décodés), comme dans `where` (#676) : `replace-fields="h:10%3A00:10h"`. La comparaison porte sur la forme chaîne de la valeur : une colonne numérique est concernée aussi, `replace-fields="annee:2024:2024-2025"` fonctionne (#730). Pas de regex : pour un recodage plus riche, voir `compute` (`replace()`, `year()`). |
| `round` | `string` | `""` (vide) | Arrondit les champs numériques à l'entier (ou à N décimales). Format: "champ1, champ2" ou "champ1:2, champ2:0" |
| `source` | `string` | `""` (vide) | ID de la source de données a ecouter |
| `split` | `string` | `""` (vide) | Découpe des champs multivalués (chaîne avec séparateur) en vrais tableaux, comme une ChoiceList Grist. Format : "champ:sep, champ2:sep2" ; séparateur par défaut : la virgule ("champ" seul). Ex : "Axes:\|, Cibles:;". Chaque élément est trimé, les éléments vides sont écartés, une chaîne vide donne un tableau vide. Les valeurs non-string (tableau déjà forme, null, nombre) sont laissées telles quelles. Les composants aval traitent ces tableaux comme des champs multi-valeurs (facettes : une valeur par élément). |
| `strip-html` | `boolean` | `false` | Supprime les balises HTML des valeurs string |
| `trim` | `boolean` | `false` | Supprime les espaces en debut/fin de toutes les clés et valeurs string |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getAdapter()` | `import('../adapters/api-adapter.js').ApiAdapter \| null` | Retourne l'adapter de la source amont (délégation transparente). Permet aux composants en aval (dsfr-data-facets, dsfr-data-search) d'acceder a l'adapter sans connaitre la structure du pipeline. |
| `getAdapterParams()` | `import('../adapters/api-adapter.js').AdapterParams \| null` | Retourne les paramètres adapter resolus de la source amont (délégation transparente, headers api-key-ref inclus — #274). |
| `getComputedColumns()` | `ComputedColumn[]` | Colonnes ajoutées par `compute` au dernier traitement (vide sans compute). |
| `getEffectiveWhere(excludeKey?: string)` | `string` | Retourne le where effectif de la source amont (délégation transparente). |
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
