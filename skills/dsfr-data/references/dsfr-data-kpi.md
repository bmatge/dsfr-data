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
| value | String | `""` | oui | Expression : `"champ"`, `"champ:avg"`, `"champ:sum"`, `"champ:min"`, `"champ:max"`, `"count:champ:valeur"` (grammaire commune champ:fn, #303). Alias deprecie : `valeur` · litteral avec `=` : `value="=667"`, `value="=87 %"` (sans source) |
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

Fonctions acceptées dans `value`, `trend` et `lines` : avg, sum, count, min, max, first, last.
Toute autre fonction (ex. `"x:somme"`) affiche une erreur de configuration à la place du KPI
(console + `data-dsfr-config-error`) — jamais une valeur vide.

Dates : `min`/`max` acceptent une colonne de dates ISO (`AAAA-MM-JJ` ou datetime) et renvoient
la date la plus ancienne/récente ; `first`/`last` renvoient la chaîne brute. Avec `format="date"`,
la valeur est rendue JJ/MM/AAAA : `value="maj:max" format="date"` -> « 09/09/2026 ».

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
| `trend` | `string` | `""` (vide) | RACCOURCI HERITE — pour une ligne d'evolution riche (signe, suffixe, couleur, repli n.d.), preferez `lines`. Conserve pour compatibilite. Expression d'agrégation pour la tendance, évaluée sur les données de la source (grammaire commune "champ:fn", ex. "evolution:avg") — PAS un litteral : l'ancienne doc ("+3.2") laissait croire qu'on passait une valeur, la chaine etait interpretee comme nom de champ (#303). Rendue avec une fleche (↑/↓) en pourcentage fr-FR ("↑ 5,2 %"). |
| `unit` | `string` | `""` (vide) | Unité accolée après la valeur (espace insécable), ex. `format="compact" unit="€"` → « 44,9 Md € ». Surtout utile avec nombre, decimal et compact — euro et pourcentage portent déjà leur symbole (#665). |
| `valeur` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `value` (#300) |
| `value` | `string` | `""` (vide) | Expression de valeur — convention cible anglaise (#300). Grammaire commune "champ:fn" (#303), ex. value="population:sum". `meta:total` (#659) : total publié par l'amont (total serveur en server-side, lignes avant `limit` derrière un query) — `count` ne compte que les lignes reçues. |



**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
