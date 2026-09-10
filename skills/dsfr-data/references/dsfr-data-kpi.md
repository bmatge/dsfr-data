# dsfr-data-kpi

> Composant KPI avec agrégation, seuils et tendances
>
> Déclencheurs : kpi, indicateur, chiffre, valeur, tendance, seuil, pourcentage, euro, metrique, grouper, grille

## <dsfr-data-kpi> - Indicateur chiffre clé

Affiche une valeur numérique mise en avant avec formatage, couleur conditionnelle, icone et tendance.
Se connecte a une dsfr-data-source ou dsfr-data-query via l'attribut `source`.

### Format des données
Attend un tableau d'objets. L'attribut `valeur` determine comment extraire/agréger la donnee :
- Valeur directe d'un champ : `valeur="score"` (prend le 1er enregistrement)
- Agrégation sur tout le tableau : `valeur="avg:score"`, `valeur="sum:montant"`

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | `""` | oui | ID de la dsfr-data-source ou dsfr-data-query |
| value | String | `""` | oui | Expression : `"champ"`, `"champ:avg"`, `"champ:sum"`, `"champ:min"`, `"champ:max"`, `"champ:distinct"`, `"count:champ:valeur"` (grammaire commune champ:fn, #303), ou un ratio `"expr / expr"` (`"count:statut:ouvert / count"`). Alias deprecie : `valeur` · litteral avec `=` : `value="=667"`, `value="=87 %"` (sans source) |
| where | String | `""` | non | Filtre des lignes AVANT le calcul, dialecte colon de dsfr-data-query : `where="categorie:eq:Actif, montant:gte:1000"` (mêmes 12 opérateurs). Appliqué à `value`, `trend` et `lines`. **Client seulement** : porte sur les lignes reçues, jamais délégué au serveur |
| heading | String | `""` | non | Titre affiche AU-DESSUS de la valeur (surtitre, majuscules grises). Nomme `heading` (pas `title`, qui collisionne avec la propriete DOM native) |
| label | String | `""` | non | Libelle sous la valeur (et sous les `lines`) |
| description | String | `""` | non | Description pour accessibilité (sr-only) |
| icon | String | `""` | non | Classe Remix Icon : `ri-global-line`, `ri-money-euro-circle-line`, etc. Alias deprecie : `icone` |
| format | String | `"nombre"` | non | Format : nombre, pourcentage, euro, decimal, compact (14,8 M), date (chaine ISO -> 09/09/2026). Les decimales passent par `decimals`, jamais par le format (`euro:3` est refuse : erreur de configuration) |
| decimals | Number | - | non | Nombre de decimales affichees (0-20), ex. `format="euro" decimals="3"` -> « 1,749 € ». Fixe pour nombre/pourcentage/euro/decimal, plafond pour compact, sans effet sur date |
| unit | String | `""` | non | Unite accolee apres la valeur (espace insecable), ex. `format="compact" unit="€"` -> « 44,9 Md € ». Inutile avec euro et pourcentage (symbole deja present) |
| trend | String | `""` | non | RACCOURCI HERITE (preferez `lines`). Expression d'agregation `"champ:fn"` (`"evolution:avg"`) — PAS un litteral. Rendue avec une fleche en pourcentage fr-FR (`↑ 5,2 %`). Alias deprecie : `tendance` |
| lines | String | `""` | non | Lignes secondaires declaratives (JSON), rendues ENTRE la valeur et le `label`. Chaque item : `value` (expression `champ:fn`) OU `text` (statique), + `format` (dont `"date"`), `decimals`, `unit`, `sign`, `prefix`, `suffix`, `color` (`"auto"`=vert si >=0/rouge si <0, token DSFR, ou couleur CSS), `na` (repli si non fini). Ex. `[{"value":"evol:avg","sign":true,"suffix":"vs mai 2025","color":"auto"}]` |
| color-token | String | `""` | non | Forcer la couleur (token semantique DSFR) : vert, orange, rouge, bleu. Alias deprecies : `color`, `couleur` |
| threshold-green | Number | - | non | Seuil au-dessus duquel couleur = vert. Alias deprecie : `seuil-vert` |
| threshold-orange | Number | - | non | Seuil au-dessus duquel couleur = orange (en-dessous = rouge). Alias deprecie : `seuil-orange` |
| col | Number | - | non | Largeur en colonnes DSFR (1-12), actif uniquement dans un `<dsfr-data-kpi-group>` |

Fonctions acceptées dans `value`, `trend` et `lines` : avg, sum, count, min, max, first, last,
distinct (alias `count-distinct`), evolution.
Toute autre fonction (ex. `"x:somme"`) affiche une erreur de configuration à la place du KPI
(console + `data-dsfr-config-error`) — jamais une valeur vide.

`value="nom_departement:distinct"` compte les valeurs distinctes (« 101 départements ») sur les
lignes reçues — null et chaîne vide exclus, un champ tableau compte ses éléments. Sur des lignes
tronquées (limit, page, max-records), un warn console signale le chiffre partiel, comme `count`.

Dates : `min`/`max` acceptent une colonne de dates ISO (`AAAA-MM-JJ` ou datetime) et renvoient
la date la plus ancienne/récente ; `first`/`last` renvoient la chaîne brute. Avec `format="date"`,
la valeur est rendue JJ/MM/AAAA : `value="maj:max" format="date"` -> « 09/09/2026 ».

### Taux d'évolution N / N-1 : `champ:evolution`
`value="recettes:evolution" format="pourcentage"` = (dernière − première) / première, calculé sur
les lignes **dans leur ordre courant** : poser un `order-by` chronologique sur la query ou la
source amont (`order-by="annee:asc"`), sinon le sens du taux dépend de l'ordre de livraison.
Fraction (0,25) rendue en pourcentage (« 25 % ») par `format="pourcentage"`, par `trend`
(« ↑ 25 % ») et par `lines` (format pourcentage par défaut). « — » si moins de deux valeurs
numériques ou si la première vaut 0. Réservé au KPI (pas sur `aggregate` de dsfr-data-query).
```html
<dsfr-data-query id="chrono" source="budget" order-by="annee:asc"></dsfr-data-query>
<dsfr-data-kpi source="chrono" value="recettes:last" format="euro" trend="recettes:evolution" label="Recettes"></dsfr-data-kpi>
```
Différence entre deux **séries** (par ligne) : ce n'est pas un agrégat — passer par un pivot
long → large (`dsfr-data-pivot`) puis `compute`.

### Part, taux, ratio : `value="expr / expr"`
Deux expressions séparées par ` / ` (barre oblique ENTOURÉE d'espaces), chacune dans la
grammaire ci-dessus (`count`, `champ:sum`, `count:champ:valeur`, `champ:distinct`,
`meta:total`…). Le résultat est une fraction (0,35) ; `format="pourcentage"` l'affiche en
pourcentage (« 35 % ») et les seuils s'expriment alors en pourcentage ; `format="decimal"` garde
la fraction. Division par zéro ou côté non numérique : « — » (jamais Infinity).
```html
<dsfr-data-kpi source="dossiers" value="count:statut:ouvert / count" format="pourcentage" label="Dossiers ouverts"></dsfr-data-kpi>
<dsfr-data-kpi source="budget" value="montant:sum / count" format="euro" label="Montant moyen"></dsfr-data-kpi>
```
- `count:champ:valeur` accepte un champ **tableau** (tags) : la ligne compte si l'un des
  éléments est égal. Le `where` s'applique aux deux côtés (sauf `meta:total`).
- Un ratio marche aussi dans `trend` (rendu en %) et dans `lines` (format pourcentage par défaut).
- Pas de `count-if` sur dsfr-data-query : filtrer avec `where` puis compter.

### Filtrer sans query intermédiaire : `where`
`where="champ:op:valeur[, …]"` filtre les lignes AVANT `value`, `trend` et `lines`, avec la
grammaire colon de dsfr-data-query (eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin,
isnull, isnotnull ; égalité lâche, `in` avec `|`). Une somme filtrée ne coûte plus une query :
```html
<dsfr-data-kpi source="budget" value="montant:sum" where="categorie:eq:Actif" label="Actif" format="euro"></dsfr-data-kpi>
<dsfr-data-kpi source="budget" value="montant:sum" where="categorie:eq:Passif, exercice:gte:2024" label="Passif 2024+"></dsfr-data-kpi>
```
- **Côté client seulement** : le KPI ne délègue rien au serveur, le filtre porte sur les lignes
  reçues. Derrière un `limit`, une page serveur ou un `max-records`, poser le `where` sur la
  source ou une query amont. `meta:total` n'est pas filtré.
- La forme `montant:sum:categorie=Actif` n'existe pas (elle entrerait en collision avec
  `count:champ:valeur`) : le filtre est un attribut, pas un segment de `value`.
- Clause non reconnue (opérateur inconnu, valeur manquante) : erreur de configuration à la
  place du KPI.

### Compter le total, pas les lignes reçues : `value="meta:total"`
`value="count"` compte les lignes REÇUES. Derrière un `dsfr-data-query limit="12"`, une source
`server-side` (une page) ou un plafond `max-records`, c'est un chiffre partiel — un warn console
le signale quand la meta annonce davantage. Pour le total, `value="meta:total"` lit la meta de
l'amont : `total_count` serveur en `server-side` (suit recherche et facettes), nombre de lignes
avant `limit` derrière un query, nombre de lignes sur une source non paginée.
```html
<dsfr-data-query id="top12" source="src" order-by="date:desc" limit="12"></dsfr-data-query>
<dsfr-data-kpi source="top12" value="meta:total" label="Activités"></dsfr-data-kpi>
```

### Grouper des KPIs : `<dsfr-data-kpi-group>`
Utiliser `<dsfr-data-kpi-group>` pour disposer plusieurs KPIs en grille responsive :
```html
<dsfr-data-kpi-group cols="3">
  <dsfr-data-kpi source="data" valeur="sum:population" label="Population totale" col="6"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="avg:score" label="Score moyen" col="3"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="count" label="Nombre" col="3"></dsfr-data-kpi>
</dsfr-data-kpi-group>
```
- `cols` : nombre de colonnes par défaut (chaque KPI occupe 12/cols colonnes)
- `col` sur chaque dsfr-data-kpi : override individuel (1-12)
- `gap` : espacement entre KPIs (sm, md, lg)
- Responsive automatique : empile en mobile

### Logique des couleurs
1. Si `color-token` est défini : applique cette couleur directement
2. Si `seuil-vert` et `seuil-orange` sont définis : couleur automatique selon la valeur
   - valeur >= seuil-vert -> vert (success)
   - valeur >= seuil-orange -> orange (warning)
   - valeur < seuil-orange -> rouge (error)
3. Sinon : bleu par défaut (info)

### Expressions d'agrégation (attribut valeur)
| Expression | Description | Exemple |
|-----------|-------------|---------|
| `"champ"` | Valeur directe du 1er enregistrement | `valeur="score_rgaa"` |
| `"avg:champ"` | Moyenne de tous les enregistrements | `valeur="avg:score"` |
| `"sum:champ"` | Somme | `valeur="sum:montant"` |
| `"min:champ"` | Minimum | `valeur="min:prix"` |
| `"max:champ"` | Maximum | `valeur="max:prix"` |
| `"champ:distinct"` | Nombre de valeurs distinctes | `value="commune:distinct"` |
| `"champ:evolution"` | (dernière − première) / première, source ordonnée | `value="recettes:evolution" format="pourcentage"` |
| `"expr / expr"` | Ratio de deux expressions | `value="count:statut:ouvert / count" format="pourcentage"` |
| `"count:champ:valeur"` | Nombre d'items ou champ = valeur | `valeur="count:status:active"` |

### Exemples
```html
<!-- KPI simple avec somme et unite -->
<dsfr-data-kpi source="stats"
  valeur="sum:montant"
  label="CA total"
  format="euro"
  icone="ri-money-euro-circle-line">
</dsfr-data-kpi>

<!-- KPI avec seuils de couleur automatiques -->
<dsfr-data-kpi source="audit"
  valeur="avg:score_rgaa"
  label="Score RGAA moyen"
  format="pourcentage"
  seuil-vert="80"
  seuil-orange="50">
</dsfr-data-kpi>

<!-- KPI avec couleur forcee et tendance -->
<!-- trend est une EXPRESSION champ:fn evaluee sur la source (pas un litteral) -->
<dsfr-data-kpi source="data"
  valeur="count:status:active"
  label="Sites actifs"
  color-token="bleu"
  trend="evolution:avg">
</dsfr-data-kpi>

<!-- Carte barometre : titre en haut, ligne d'evolution coloree, legende en bas -->
<!-- value/lines acceptent une source mono-objet (un seul enregistrement courant) -->
<dsfr-data-kpi source="barometre"
  heading="Immat. VE — vehicules particuliers"
  value="immat:sum"
  lines='[{"value":"evol:avg","sign":true,"suffix":"vs mai 2025","color":"auto"}]'
  label="Donnee mai 2026">
</dsfr-data-kpi>
```

### Référence `<dsfr-data-kpi>` (générée depuis le code)

**Rôle pipeline** : affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’émet pas de données.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `col` | `number \| undefined` | — | Largeur en colonnes DSFR (1-12). Significatif uniquement dans un <dsfr-data-kpi-group>. |
| `color` | `KpiColor \| ''` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias de `color-token` (#367) — le nom `color` évoque l'attribut de présentation HTML déprécié (faux positif d'audit RGAA 10.1.2) |
| `color-token` | `KpiColor \| ''` | `""` (vide) | Couleur forcée (token sémantique DSFR) : vert, orange, rouge, bleu |
| `couleur` | `KpiColor \| ''` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `color-token` (#300) |
| `decimals` | `number \| undefined` | — | Nombre de décimales affichées (entier 0 à 20), ex. `format="euro" decimals="3"` → « 1,749 € ». Fixe pour nombre, pourcentage, euro et decimal ; plafond pour compact ; sans effet sur date. Absent : défaut historique du format (#665). |
| `description` | `string` | `""` (vide) | Description détaillée pour l'accessibilité |
| `format` | `FormatType` | `'nombre'` | Format d'affichage : nombre (défaut), pourcentage, euro, decimal, compact (14 785 684 → « 14,8 M »), date (chaîne ISO → « 09/09/2026 », #667). Les décimales passent par `decimals`, jamais par le format (`euro:3` est refusé et affiché comme erreur de configuration, #665). |
| `heading` | `string` | `""` (vide) | Titre affiché AU-DESSUS de la valeur (surtitre, style majuscules grises). Nommé `heading` et non `title` : ce dernier entrerait en collision avec la propriété DOM native HTMLElement.title (infobulle). |
| `icon` | `string` | `""` (vide) | Classe d'icône (ex: ri-global-line) |
| `icone` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `icon` (#300) |
| `label` | `string` | `""` (vide) | Libellé affiché sous le chiffre (et sous les `lines`) |
| `lines` | `string` | `""` (vide) | Lignes secondaires declaratives (JSON), rendues ENTRE la valeur et le `label`. Chaque item est soit data-driven (`value` = expression "champ:fn"), soit texte statique (`text`), avec couleur declarative. Ex. `[{"value":"evol:avg","sign":true,"suffix":"vs mai 2025","color":"auto"}]`. Schema complet : packages/core/src/utils/kpi-lines.ts (KpiLineSpec). |
| `seuil-orange` | `number \| undefined` | — | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `threshold-orange` (#300) |
| `seuil-vert` | `number \| undefined` | — | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `threshold-green` (#300) |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont ce KPI consomme les données. Facultatif si `value` est un littéral (`value="=667"`). |
| `tendance` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `trend` (#300) |
| `threshold-green` | `number \| undefined` | — | Seuil au-dessus duquel la valeur est verte |
| `threshold-orange` | `number \| undefined` | — | Seuil au-dessus duquel la valeur est orange |
| `trend` | `string` | `""` (vide) | RACCOURCI HERITE — pour une ligne d'evolution riche (signe, suffixe, couleur, repli n.d.), preferez `lines`. Conserve pour compatibilite. Expression d'agrégation pour la tendance, évaluée sur les données de la source (grammaire commune "champ:fn", ex. "evolution:avg") — PAS un litteral : l'ancienne doc ("+3.2") laissait croire qu'on passait une valeur, la chaine etait interpretee comme nom de champ (#303). Rendue avec une fleche (↑/↓) en pourcentage fr-FR ("↑ 5,2 %"). `trend="recettes:evolution"` (#675) : taux d'évolution entre la première et la dernière ligne, rendu en pourcentage. |
| `unit` | `string` | `""` (vide) | Unité accolée après la valeur (espace insécable), ex. `format="compact" unit="€"` → « 44,9 Md € ». Surtout utile avec nombre, decimal et compact — euro et pourcentage portent déjà leur symbole (#665). |
| `valeur` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `value` (#300) |
| `value` | `string` | `""` (vide) | Expression de valeur — convention cible anglaise (#300). Grammaire commune "champ:fn" (#303), ex. value="population:sum". `champ:distinct` (alias `count-distinct`, #672) : nombre de valeurs distinctes, null et chaîne vide exclus, calculé sur les lignes reçues. `meta:total` (#659) : total publié par l'amont (total serveur en server-side, lignes avant `limit` derrière un query) — `count` ne compte que les lignes reçues. Ratio (#673) : `value="count:statut:ouvert / count"`, chaque côté dans la grammaire ci-dessus (`meta:total` compris). Résultat = fraction (0,35) ; `format="pourcentage"` la rend en pourcentage (35 %) — les seuils s'expriment alors en pourcentage aussi. Division par zéro : « — ». `count:champ:valeur` accepte un champ tableau (un élément égal suffit). `champ:evolution` (#675) : (dernière − première) / première sur les lignes DANS LEUR ORDRE COURANT — poser un `order-by` chronologique en amont. Fraction, rendue en pourcentage par `format="pourcentage"`, `trend` et `lines` ; « — » si moins de deux valeurs ou première = 0. |
| `where` | `string` | `""` (vide) | Filtre des lignes AVANT le calcul (#674), dialecte colon de dsfr-data-query : `where="categorie:eq:Actif, montant:gte:1000"` — mêmes 12 opérateurs (eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin, isnull, isnotnull), même égalité lâche, chemins imbriqués acceptés. Appliqué à `value`, `trend` et `lines`. CÔTÉ CLIENT SEULEMENT : le KPI ne délègue rien au serveur, le filtre porte sur les lignes reçues (derrière un `limit` ou une page, poser le `where` sur la source ou une query amont). `meta:total` n'en tient pas compte. Une clause non reconnue est une erreur de configuration. |



**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
