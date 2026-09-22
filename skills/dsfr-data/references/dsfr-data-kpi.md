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
| color-token | String | `""` | non | Forcer la couleur. Quatre tokens SÉMANTIQUES (un ÉTAT) : vert, orange, rouge, bleu — ou l'une des 17 couleurs ILLUSTRATIVES DSFR (une CATÉGORIE : thème, ministère, famille de données) : `green-emeraude`, `blue-cumulus`, `purple-glycine`, `orange-terre-battue`… (section « Habillage »). Alias deprecies : `color`, `couleur` |
| threshold-green | Number | - | non | Seuil au-dessus duquel couleur = vert. Alias deprecie : `seuil-vert` |
| threshold-orange | Number | - | non | Seuil au-dessus duquel couleur = orange (en-dessous = rouge). Alias deprecie : `seuil-orange` |
| span | String | - | non | Largeur en colonnes DSFR (1-12), actif uniquement dans un `<dsfr-data-kpi-group>` (#790) |
| col | Number | - | non | Ancien nom de `span`, même sens — toujours accepté, ne plus le générer |
| icon-position | String | `"label"` | non | Place de l'icône ou du picto : `label` (défaut, entre le surtitre et la valeur, en gris), `top` (en tête, couleur de l'accent), `right` (à droite, alignée en haut) |
| icon-size | String | - | non | `sm` (1,5 rem, défaut d'une icône) ou `md` (2 rem) — l'échelle s'arrête à la taille maximale d'une icône DSFR ; au-delà, poser `picto`. Pour un picto : `sm` = 3,5 rem, `md` = 5 rem (défaut) |
| picto | String | `""` | non | Pictogramme DSFR par son nom, `environment/leaf` (catégorie/fichier, sans .svg, motif `[a-z0-9-]` et `/`). Requiert `picto-base`. Prime sur `icon` |
| picto-field | String | `""` | non | Comme `picto`, mais le nom est lu dans un champ de la première ligne (répéteur) |
| picto-base | String | `""` | non | Préfixe d'adresse des SVG, MÊME ORIGINE que la page : `picto-base="/dsfr/artwork/pictograms/"`. Un CDN ne marche pas (`<use>` sans CORS) |
| image | String | `""` | non | URL d'image (liste blanche de schémas de `{{champ:url}}` ; refusée = rien + avertissement). `image-alt` pour le texte alternatif (vide = décorative) |
| image-position | String | `"top"` | non | `top` (bandeau 16:9), `left` (colonne 10 rem pleine hauteur), `right` (vignette 7,5 rem) |
| orientation | String | `"horizontal"` | non | `vertical` : tuile à liseré haut, centrée si elle porte une icône, un picto ou une image |
| border | String | `"left"` | non | Tracé du liseré : `left`, `top`, `bottom` (filet 2 px), `outline` (contour 1 px), `left-short` (à hauteur de la valeur), `none`. La couleur reste celle du token ou des seuils |
| tint | String | - | non | Fond teinté dans la couleur du token : `tint` = fond 950, `tint="975"` plus clair, `tint="925"` plus soutenu (illustratives seulement). La VALEUR reste en gris titre |

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
  Depuis #953, le `where` du KPI et le filtre entre accolades (`count{tags:eq:urgent}`) font
  PAREIL : sur le même jeu, `value="count:tags:urgent"` et `value="count{tags:eq:urgent}"`
  rendent le MÊME chiffre. L'asymétrie de #842 — deux chiffres, « et c'est voulu » — a disparu :
  l'égalité client est alignée sur celle du portail, qui lit déjà `=` sur un champ multivalué
  comme un « contient ». Le KPI ne délègue jamais, mais c'est désormais sans conséquence : un KPI
  et un graphique portant le MÊME `where` sur le même jeu affichent le même chiffre.
- **Seul `count` accepte une valeur de filtre** : `sum:montant:ouvert` est une erreur de
  configuration (il rendait autrefois le total non filtré).
- **Part de SOMMES : filtre entre accolades sur un côté** (`expr{champ:op:valeur}`, dialecte du
  `where`). Sur une source pré-agrégée (une ligne par école et par sexe avec un effectif) :
  `value="effectif:sum{sexe:eq:F} / effectif:sum" format="pourcentage"`. Le filtre ne vaut que pour
  son côté ; le `where` du KPI, lui, filtre les deux. Plusieurs clauses : `{sexe:eq:F, secteur:eq:public}`.
  Marche aussi pour `count{…}`, `avg`, `min`, `max`. Pas sur `meta:total` ni sur un accès direct.
- Un ratio marche aussi dans `trend` (rendu en %) et dans `lines` (format pourcentage par défaut).
- Pas de `count-if` sur dsfr-data-query : filtrer avec `where` puis compter.
- **Les deux côtés viennent de LA MÊME source** : `source` est un identifiant unique. Un indicateur
  « par habitant », qui croise des faits et une population venus de deux jeux, passe par le pattern
  `dsfr-data-query group-by` → `dsfr-data-join` → ratio (skill dsfr-data-join, « Pattern : ratio
  entre DEUX sources »). Ne jamais générer `value="src_a:count / src_b:sum:population"` : cette
  grammaire multi-sources n'existe pas.

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
avant `limit` derrière un query, nombre de lignes sur une source non paginée. Total INCONNU de
l'amont (page serveur sans total, comme une page agrégée Tabular, ou lot tronqué sans total) :
« — », jamais le nombre de lignes reçues (#1046).
```html
<dsfr-data-query id="top12" source="src" order-by="date:desc" limit="12"></dsfr-data-query>
<dsfr-data-kpi source="top12" value="meta:total" label="Activités"></dsfr-data-kpi>
```

### Grouper des KPIs : `<dsfr-data-kpi-group>`
Utiliser `<dsfr-data-kpi-group>` pour disposer plusieurs KPIs en grille responsive :
```html
<dsfr-data-kpi-group per-row="3">
  <dsfr-data-kpi source="data" valeur="sum:population" label="Population totale" span="6"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="avg:score" label="Score moyen" span="3"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="count" label="Nombre" span="3"></dsfr-data-kpi>
</dsfr-data-kpi-group>
```
- `per-row` : nombre de KPI par ligne (chaque KPI occupe 12/per-row colonnes) ; `span` sur un KPI fixe sa largeur. `cols` / `col` : anciens noms, même sens, toujours acceptés (#790)
- `col` sur chaque dsfr-data-kpi : override individuel (1-12)
- `gap` : espacement entre KPIs (sm, md, lg)
- Responsive automatique : empile en mobile

### Habillage : icône, pictogramme, image, liseré, teinte
Rien de tout cela ne touche à la donnée. Sans ces attributs, le rendu est celui d'avant.
```html
<!-- Icône en tête, dans la couleur du liseré (fr-icon-* ou ri-*, une classe, jamais du balisage) -->
<dsfr-data-kpi source="baro" value="immat" heading="Immatriculations" label="dans le mois"
  icon="fr-icon-car-line" icon-position="top"></dsfr-data-kpi>

<!-- Pictogramme DSFR : nom + base écrite par l'intégrateur, SVG copiés sur la même origine -->
<dsfr-data-kpi source="baro" value="pac" heading="Pompes à chaleur" label="vendues par mois"
  picto="environment/leaf" picto-base="/dsfr/artwork/pictograms/" icon-position="right"></dsfr-data-kpi>

<!-- Tuile verticale, image en bandeau, liseré haut -->
<dsfr-data-kpi source="baro" value="pdm" format="pourcentage" heading="Part de marché" label="des ventes"
  orientation="vertical" image="/img/ve.jpg" image-alt="Voiture électrique en charge"></dsfr-data-kpi>

<!-- Groupe thématique : couleurs ILLUSTRATIVES (catégories), fond teinté, sans liseré -->
<dsfr-data-kpi source="env" value="count" heading="Environnement" label="jeux de données"
  color-token="green-emeraude" tint border="none" icon="fr-icon-leaf-line" icon-position="top"></dsfr-data-kpi>
<dsfr-data-kpi source="edu" value="count" heading="Éducation" label="jeux de données"
  color-token="purple-glycine" tint border="none" icon="fr-icon-book-2-line" icon-position="top"></dsfr-data-kpi>
```
- **Catégorie ≠ état.** Une couleur illustrative (`green-emeraude`, `pink-tuile`…) dit un
  thème, un ministère, une famille de données. Bon / attention / critique restent aux quatre
  tokens sémantiques et aux seuils : un KPI en rouge illustratif qui ne veut pas dire « mauvais »
  se lit comme une alerte. Les couleurs viennent des tokens DSFR (`--border-plain-<nom>`,
  `--background-contrast-<nom>`) : ne jamais générer d'hexadécimal, le mode sombre suit.
- **Sous `tint`, la valeur reste en gris titre**, jamais dans la couleur de l'accent : les
  teintes pleines claires (tournesol, café-crème, galet) ne tiennent pas le contraste pour du texte.
- **`icon-size` s'arrête à `md` (2 rem)** : c'est la plus grande icône que le DSFR documente
  (`fr-icon--lg`). Pour une illustration de 3,5 ou 5 rem, générer `picto`, pas `icon-size="lg"`
  (ignoré, avec un avertissement).
- **`picto-base` est obligatoire et doit servir les SVG depuis l'origine de la page** : un
  `<use href>` vers un CDN n'est pas rendu par les navigateurs. Prévoir une copie locale de
  `dist/artwork/pictograms/` du DSFR.
- `icon` et `picto` sont validés (classe `fr-icon-*`/`ri-*` ; nom `[a-z0-9-]` et `/`) ;
  `image` passe par la liste blanche de schémas. Une valeur refusée n'affiche rien et le dit
  en console — une fois par valeur, quel que soit le nombre de KPI.
- `<dsfr-data-kpi-group orientation="vertical">` empile les KPI dans un seul cadre à liseré
  continu, filet entre les items (barre latérale, encart) ; `per-row` et `span` n'y jouent plus.

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
| `border` | `BorderMode \| string` | `'left'` | Tracé du liseré ; sa couleur reste celle de `color-token` ou des seuils. `left` (défaut, 4 px, rendu historique), `top` (4 px), `bottom` (filet de 2 px, comme les champs DSFR), `outline` (contour de 1 px), `left-short` (4 px à hauteur de la valeur), `none`. Autre valeur : ignorée, avertissement. |
| `col` | `number \| undefined` | — | Largeur en colonnes DSFR (1-12). Significatif uniquement dans un <dsfr-data-kpi-group>. Même rôle que `span`, qui est préféré (#790) ; toujours accepté. |
| `color` | `KpiColor \| ''` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias de `color-token` (#367) — le nom `color` évoque l'attribut de présentation HTML déprécié (faux positif d'audit RGAA 10.1.2) |
| `color-token` | `KpiColor \| ''` | `""` (vide) | Couleur forcée. Deux familles, deux SENS : - les 4 tokens sémantiques `vert`, `orange`, `rouge`, `bleu` disent un ÉTAT (bon, attention, critique, neutre) — c'est aussi ce que posent les seuils, et ce que le libellé accessible annonce (« etat bon ») ; - les 17 couleurs illustratives DSFR (`green-emeraude`, `blue-cumulus`, `purple-glycine`, `orange-terre-battue`… liste : `ILLUSTRATIVE_COLOR_TOKENS`) disent une CATÉGORIE — thème, ministère, famille de données — et n'annoncent aucun état. Un KPI en rouge illustratif (`pink-tuile`) qui ne veut pas dire « mauvais » est un contresens de lecture : l'état reste aux tokens sémantiques. Une couleur illustrative pose le liseré et l'icône en teinte pleine via `var(--border-plain-<nom>)` et, avec `tint`, le fond via `var(--background-contrast-<nom>)` — tokens DSFR existants, aucun hexadécimal : le mode sombre suit. Nom inconnu : ignoré avec avertissement, repli sur les seuils puis bleu. |
| `couleur` | `KpiColor \| ''` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `color-token` (#300) |
| `decimals` | `number \| undefined` | — | Nombre de décimales affichées (entier 0 à 20), ex. `format="euro" decimals="3"` → « 1,749 € ». Fixe pour nombre, pourcentage, euro et decimal ; plafond pour compact ; sans effet sur date. Absent : défaut historique du format (#665). |
| `description` | `string` | `""` (vide) | Description détaillée pour l'accessibilité |
| `format` | `FormatType` | `'nombre'` | Format d'affichage : nombre (défaut), pourcentage, euro, decimal, compact (14 785 684 → « 14,8 M »), date (chaîne ISO → « 09/09/2026 », #667). Les décimales passent par `decimals`, jamais par le format (`euro:3` est refusé et affiché comme erreur de configuration, #665). |
| `heading` | `string` | `""` (vide) | Titre affiché AU-DESSUS de la valeur (surtitre, style majuscules grises). Nommé `heading` et non `title` : ce dernier entrerait en collision avec la propriété DOM native HTMLElement.title (infobulle). |
| `icon` | `string` | `""` (vide) | Classe d'icône DSFR (`fr-icon-leaf-line`) ou Remix (`ri-global-line`). Une CLASSE, jamais du balisage : la valeur doit suivre `^(fr-icon\|ri)-[a-z0-9-]+$`, sinon elle est ignorée avec un avertissement console qui la nomme (une fois par valeur). Placement et taille : `icon-position`, `icon-size`. Remplacée par `picto` si les deux sont posés. |
| `icon-position` | `IconPosition \| string` | `'label'` | Où se place l'icône (ou le pictogramme) : `label` (défaut, rendu historique : entre le surtitre et la valeur, en gris), `top` (en tête de la carte, dans la couleur de l'accent — vignette 1a), `right` (à droite, alignée en haut, le texte garde sa marge — vignette 1b). Sans effet sans `icon` ni `picto`. |
| `icon-size` | `IconSize \| string` | `""` (vide) | Taille de l'icône : `sm` = 1,5 rem (24 px — sans attribut, c'est le rendu historique, inchangé) ou `md` = 2 rem (32 px). L'échelle s'arrête là : l'échelle documentée du DSFR s'arrête à `fr-icon--lg` = 2 rem, et au-delà le DSFR ne parle plus d'icône mais de PICTOGRAMME — pour une illustration de 48 ou 80 px, poser `picto`, pas une icône agrandie. Ni `lg`, ni valeur en pixels : une autre valeur est ignorée avec un avertissement. Vaut aussi pour `picto`, sur l'échelle des tuiles DSFR : `sm` = 3,5 rem, `md` = 5 rem (sans attribut : `md`, la tuile DSFR standard). Pour une icône `fr-icon-*`, la taille passe par `--icon-size` (le glyphe est un `::before` masqué, indifférent à `font-size`). |
| `icone` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `icon` (#300) |
| `idle-message` | `string` | `IDLE_MESSAGE_DEFAULT` | Message rendu quand l'amont attend un filtre (`require-where`, #690). Distinct de « aucune donnée » : aucune requête n'a été faite. Vide, le libellé par défaut est utilisé. |
| `image` | `string` | `""` (vide) | Image libre (photo, logo) par son URL. Passée par la même liste blanche de schémas que le format `{{champ:url}}` des gabarits (`http:`, `https:`, `mailto:`, `tel:` ou relative) : une URL refusée (`javascript:`, `data:`…) n'affiche rien et avertit. Placement : `image-position`. Texte alternatif : `image-alt` (vide = décorative). Rendue seulement quand la donnée est là. |
| `image-alt` | `string` | `""` (vide) | Texte alternatif de `image`. Vide (défaut) : image décorative (`alt=""`). |
| `image-position` | `ImagePosition \| string` | `'top'` | Placement de `image` : `top` (défaut, bandeau 16:9 bord à bord au-dessus du contenu — vignette 1d), `left` (colonne de 10 rem pleine hauteur, le liseré reste à gauche de l'image — 2a), `right` (vignette carrée de 7,5 rem dans la marge, à droite du texte — 2b). |
| `label` | `string` | `""` (vide) | Libellé affiché sous le chiffre (et sous les `lines`) |
| `lines` | `string` | `""` (vide) | Lignes secondaires declaratives (JSON), rendues ENTRE la valeur et le `label`. Chaque item est soit data-driven (`value` = expression "champ:fn"), soit texte statique (`text`), avec couleur declarative. Ex. `[{"value":"evol:avg","sign":true,"suffix":"vs mai 2025","color":"auto"}]`. Schema complet : packages/core/src/utils/kpi-lines.ts (KpiLineSpec). |
| `orientation` | `'horizontal' \| 'vertical' \| string` | `'horizontal'` | `horizontal` (défaut, carte à liseré gauche) ou `vertical` : tuile à liseré HAUT (sauf `border` explicite). Avec une icône, un pictogramme ou une image, tout passe au-dessus du surtitre et le texte est centré (vignette 1f) ; sans média, le KPI reste aligné à gauche — la version sobre des chiffres-clés éditoriaux (1g). Sur `dsfr-data-kpi-group`, le même attribut empile les KPI (voir le groupe). |
| `picto` | `string` | `""` (vide) | Pictogramme DSFR illustratif (`fr-artwork`), par son NOM : `environment/leaf`, `buildings/city-hall`… (dossier de catégorie + fichier, sans `.svg`). Contraint à `^[a-z0-9-]+(/[a-z0-9-]+)*$` — ce motif exclut `../` et tout schéma sans assainisseur. Le composant rend le SVG canonique à trois `<use>` (`#artwork-decorative`, `#artwork-minor`, `#artwork-major`) dont l'adresse est `picto-base` + nom + `.svg` : `picto-base` est OBLIGATOIRE (sans lui, rien n'est rendu, avec un avertissement). Les couleurs viennent des classes `fr-artwork-*` du DSFR — le mode sombre suit sans travail — et une couleur illustrative (`color-token`) est reportée en `fr-artwork--<nom>`. ⚠️ `<use href>` vers un AUTRE domaine n'est pas rendu par les navigateurs (pas de CORS sur `use`) : `picto-base` doit servir les SVG depuis l'origine de la page (copie locale de `dist/artwork/pictograms/`), pas depuis un CDN. Prime sur `icon`. Mêmes `icon-position` et `icon-size` que l'icône. |
| `picto-base` | `string` | `""` (vide) | Préfixe d'adresse des pictogrammes, écrit par l'intégrateur : `picto-base="/dsfr/artwork/pictograms/"`. Le nom (`picto`) y est concaténé (barre finale ajoutée si absente). C'est ce découpage nom / base qui rend `picto` sûr par construction. Même origine que la page, voir `picto`. |
| `picto-field` | `string` | `""` (vide) | Même chose que `picto`, mais le nom est lu dans un CHAMP de la première ligne reçue (`picto-field="theme_picto"`) — utile dans un répéteur. Même motif, même refus. `picto` prime s'il est posé. |
| `seuil-orange` | `number \| undefined` | — | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `threshold-orange` (#300) |
| `seuil-vert` | `number \| undefined` | — | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `threshold-green` (#300) |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont ce KPI consomme les données. Facultatif si `value` est un littéral (`value="=667"`). |
| `span` | `string \| undefined` | — | Largeur sur la grille de 12 colonnes (1-12), dans un <dsfr-data-kpi-group> : `span="6"` occupe la moitié de la ligne. Remplace `col`, même sens (#790) ; prime sur `col` s'ils sont posés ensemble. Sans valeur par défaut, et pour la même raison que `col` : la propriété est reflétée, donc une valeur initiale `''` poserait `span=""` sur CHAQUE KPI. La largeur par défaut du groupe est portée par une règle `::slotted(*:not([col]):not([span]))` — un attribut vide, mais présent, la désactive et tous les KPI retombent en `grid-column: auto` (#822). |
| `tendance` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `trend` (#300) |
| `threshold-green` | `number \| undefined` | — | Seuil au-dessus duquel la valeur est verte |
| `threshold-orange` | `number \| undefined` | — | Seuil au-dessus duquel la valeur est orange |
| `tint` | `string \| null` | `null` | Fond teinté dans la couleur du token : `tint` (ou `tint="true"`) prend le fond 950 (`--background-contrast-<nom>`) ; `tint="975"` le fond le plus clair (`--background-alt-<nom>`) ; `tint="925"` le plus soutenu (`--<nom>-925-125`). Les 4 tokens sémantiques n'ont pas de 925 dans le DSFR : replié sur 950 avec un avertissement. La VALEUR reste en gris titre (`--text-title-grey`) : les teintes pleines claires (tournesol, café-crème, galet) ne tiennent pas le contraste pour du texte — planche 3b. Le surtitre et le libellé passent en `--text-default-grey` pour la même raison. Se combine avec `border` (souvent `border="none"`). |
| `trend` | `string` | `""` (vide) | RACCOURCI HERITE — pour une ligne d'evolution riche (signe, suffixe, couleur, repli n.d.), preferez `lines`. Conserve pour compatibilite. Expression d'agrégation pour la tendance, évaluée sur les données de la source (grammaire commune "champ:fn", ex. "evolution:avg") — PAS un litteral : l'ancienne doc ("+3.2") laissait croire qu'on passait une valeur, la chaîne etait interpretee comme nom de champ (#303). Rendue avec une fleche (↑/↓) en pourcentage fr-FR ("↑ 5,2 %"). `trend="recettes:evolution"` (#675) : taux d'évolution entre la première et la dernière ligne, rendu en pourcentage. |
| `unit` | `string` | `""` (vide) | Unité accolée après la valeur (espace insécable), ex. `format="compact" unit="€"` → « 44,9 Md € ». Surtout utile avec nombre, decimal et compact — euro et pourcentage portent déjà leur symbole (#665). |
| `valeur` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `value` (#300) |
| `value` | `string` | `""` (vide) | Expression de valeur — convention cible anglaise (#300). Grammaire commune "champ:fn" (#303), ex. value="population:sum". `champ:distinct` (alias `count-distinct`, #672) : nombre de valeurs distinctes, null et chaîne vide exclus, calculé sur les lignes reçues. `meta:total` (#659) : total publié par l'amont (total serveur en server-side, lignes avant `limit` derrière un query) — `count` ne compte que les lignes reçues. Total inconnu de l'amont (page serveur ou lot tronqué sans total, #1046) : « — ». Ratio (#673) : `value="count:statut:ouvert / count"`, chaque côté dans la grammaire ci-dessus (`meta:total` compris). Résultat = fraction (0,35) ; `format="pourcentage"` la rend en pourcentage (35 %) — les seuils s'expriment alors en pourcentage aussi. Division par zéro : « — ». `count:champ:valeur` accepte un champ tableau (un élément égal suffit). Depuis #953, le `where` ci-dessous et le filtre entre accolades `count{tags:eq:urgent}` font PAREIL : `value="count:tags:urgent"` et `value="count{tags:eq:urgent}"` rendent le MÊME chiffre. L'asymétrie de #842 — deux chiffres sur le même jeu, et c'était « voulu » — a disparu : l'égalité client est alignée sur celle du portail, qui lit déjà `=` sur un champ multivalué comme un « contient » (mesuré le 2026-09-19). Seul `count` accepte une valeur de filtre : `sum:champ:valeur` est une erreur de configuration (#764). Filtre propre à une expression (#776), dialecte du `where` entre accolades : `value="effectif:sum{sexe:eq:F} / effectif:sum"` rend une part de SOMMES — le filtre ne vaut que pour son côté du ratio, là où `where` filtre les deux. Marche aussi pour `count{…}` et les autres fonctions ; un filtre non reconnu est une erreur de configuration. Le contenu des accolades est lu d'un bloc : une valeur qui contient ` / ` ne coupe pas le ratio (#839). `champ:first` / `champ:last` : valeur du champ sur la première / la dernière ligne, DANS L'ORDRE COURANT — poser un `order-by` en amont (ex. dernière valeur d'une série datée). Propres au KPI : absentes de l'`aggregate` de `dsfr-data-query`. `champ:evolution` (#675) : (dernière − première) / première sur les lignes DANS LEUR ORDRE COURANT — poser un `order-by` chronologique en amont. Fraction, rendue en pourcentage par `format="pourcentage"`, `trend` et `lines` ; « — » si moins de deux valeurs ou première = 0. |
| `where` | `string` | `""` (vide) | Filtre des lignes AVANT le calcul (#674), dialecte colon de dsfr-data-query : `where="categorie:eq:Actif, montant:gte:1000"` — mêmes 12 opérateurs (eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin, isnull, isnotnull), même égalité lâche, chemins imbriqués acceptés. Appliqué à `value`, `trend` et `lines`. CÔTÉ CLIENT SEULEMENT : le KPI ne délègue rien au serveur, le filtre porte sur les lignes reçues (derrière un `limit` ou une page, poser le `where` sur la source ou une query amont). `meta:total` n'en tient pas compte. Une clause non reconnue est une erreur de configuration. CHAMP TABLEAU (#953, ex-#842) : `eq` / `in` regardent DANS le tableau. `where="tags:eq:urgent"` retient une ligne dont `tags` vaut `['urgent','social']`, exactement comme `value="count:tags:urgent"` la compte, et comme le portail la retiendrait sur une clause déléguée. Le repli textuel est gardé en OU : `['a','b']` matche encore `'a,b'` côté client, là où le portail rend 0 — le client ne peut donc que gagner des lignes, jamais en perdre. `neq` / `notin`, étant la négation, en perdent (le portail aussi : son `!=` est la négation stricte de son `=`). ⚠️ Le KPI ne délègue jamais : son `where` évalue toujours la voie client. Depuis l'alignement, c'est sans conséquence sur un champ tableau — un KPI et un graphique portant le même `where` rendent le même chiffre, au repli textuel près. Le booléen dérivé en amont (`dsfr-data-normalize` `compute="a_urgent = when contains(tags,'urgent') then 1 else 0"`, puis `where="a_urgent:eq:1"`) reste valide et garde un intérêt — le filtre final porte sur un scalaire, donc regroupable et délégable — mais il n'est plus NÉCESSAIRE. |



**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
