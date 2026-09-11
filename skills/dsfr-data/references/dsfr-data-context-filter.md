# dsfr-data-context-filter

> Un filtre d'un dsfr-data-context (ecoute un element d'UI)
>
> Déclencheurs : context-filter, filtre contexte, filtre ui, apply-to

## <dsfr-data-context-filter> - Un filtre du contexte

Enfant de <dsfr-data-context>. Ecoute les change/input de l'element d'UI reference
par `ui` (select, input, select multiple) et confie sa clause au contexte parent.
La valeur vide RETIRE le filtre. Les valeurs sont percent-encodees (#271).

### Attributs

| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| field | String | `""` | oui | Colonne filtree |
| ui | String | `""` | oui | Id de l'element d'UI ecoute — DEUX ids (min max) pour between |
| operator | String | `"eq"` | non | eq, in, lt, gte, between (between -> gte + lt), contains (sous-chaine, #678), et dates (#230) : month-of, year-of, lt-day-after, last-n-days, current-year, current-month (bornes dynamiques recalculees a chaque diffusion) |
| apply-to | String | `"*"` | non | `*` = toutes les sources du contexte, ou liste d'ids cibles separes par des espaces |
| label | String | `""` | non | Libelle naturel pour l'affichage (tags #232) — defaut : field |
| default | String | `""` | non | Valeur initiale (#682), appliquee APRES l'URL (l'URL gagne) : `today`, `first-of-month`, `first-of-year` (resolus dans le fuseau local, adaptes au controle) ou un litteral ; pour between/in, valeurs separees par une virgule |
| context | String | `""` | non | Id du dsfr-data-context cible (#678) — permet de placer le filtre hors du contexte, meme declare avant lui. Vide = contexte parent le plus proche |
| year-start-month | Number | `1` | non | Mois de debut de l'annee pour `year-of` et `current-year` (#735) : 1 = annee civile, 9 = annee scolaire, 4 = exercice comptable britannique, 10 = saison. La clause reste une plage `gte` + `lt` : elle se delegue au serveur, aucun adaptateur n'est concerne. Le tag affiche « 2024-2025 ». Sans effet sur les autres opérateurs (console.warn) |

### Operateurs

- `eq` : egalite — `in` : multi-valeurs (select multiple, valeurs jointes par | ou ,)
- `contains` : sous-chaine (input texte ; `like "%v%"` en ODSQL) — #678
- `lt` / `gte` : comparaisons — `between` : deux UI (min puis max) -> gte + lt
- Dates (#230) : `month-of` (input type=month -> plage du mois), `year-of` (plage annuelle),
  `lt-day-after` (inclusif jusqu'au jour choisi), `last-n-days` (N derniers jours, borne
  dynamique), `current-year` (checkbox -> annee en cours), `current-month` (checkbox -> mois
  en cours, #682). Plages [debut, fin) en ISO, recalculees a chaque diffusion — l'URL serialise
  l'intention (« 30 », « on »), pas les dates resolues.
- Valeur initiale (#682) : `default="today"` sur un `lt-day-after` filtre « jusqu'a aujourd'hui »
  sans script ; `default="first-of-year,today"` sur un `between` donne « depuis le 1er janvier ».
  Un parametre d'URL present prime toujours sur `default`.
- Troncature (#646) : `year-of` et `month-of` acceptent une date plus precise et la tronquent
  ("2026-09-09" -> annee 2026 / mois 2026-09) : un input type=date peut nourrir les deux (il n'existe
  pas de type=year). Une valeur qui reste inexploitable retire le filtre et l'annonce par un
  console.warn (une fois par filtre).
- Annee non civile (#735) : `year-start-month="9"` sur `year-of` ou `current-year` donne une
  plage septembre -> aout (annee scolaire) ; `4` l'exercice comptable, `10` une saison. Le
  desucrage reste `gte` + `lt`, donc la plage se DELEGUE au serveur comme n'importe quelle
  autre — c'est la difference avec la voie client. Une annee nue ("2024") nomme l'annee qui
  COMMENCE en 2024 ; une date ("2025-03-10") designe l'annee qui la CONTIENT. Tag « 2024-2025 ».

```html
<dsfr-data-context-filter field="date_rentree" label="Année scolaire" operator="year-of"
  year-start-month="9" ui="ui-annee"></dsfr-data-context-filter>
```

  Cote CLIENT seul, une colonne d'annee scolaire se derive aussi sans nouvel attribut, avec
  `compute` sur dsfr-data-normalize (#671) — pratique pour un `group-by`, mais le
  transformateur est client : sur un gros jeu il faut tout rapatrier.

```html
<dsfr-data-normalize source="src"
  compute="annee_scolaire = when month(d) >= 9 then concat(year(d),'-',year(d)+1) else concat(year(d)-1,'-',year(d))">
</dsfr-data-normalize>
```


### Référence `<dsfr-data-context-filter>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `apply-to` | `string` | `'*'` | Cibles : "*" (défaut, toutes les sources du contexte) ou ids ciblés |
| `context` | `string` | `""` (vide) | Id du dsfr-data-context cible (#678). Vide = le contexte parent le plus proche (`closest`), comportement historique. Le contexte peut être déclaré après ce filtre dans le DOM : l'enregistrement se fait alors à sa connexion. |
| `default` | `string` | `""` (vide) | Valeur initiale du filtre (#682), appliquée au montage APRÈS l'URL — un paramètre d'URL présent gagne toujours (ADR-031). Mots-clés dynamiques résolus dans le fuseau local : `today` (date du jour), `first-of-month` (1er du mois en cours), `first-of-year` (1er janvier de l'année en cours) ; toute autre valeur est un littéral. La date est adaptée au contrôle (input type="month" → AAAA-MM, `year-of` → AAAA) puis écrite dans l'UI et émise par le chemin normal, jamais injectée dans un where. Pour `between` et `in`, plusieurs valeurs séparées par une virgule (ex. `first-of-year,today`). |
| `field` | `string` | `""` (vide) | Colonne filtrée — une colonne des SOURCES ciblées, telle que l'API la connaît. Le filtre y est délégué et s'applique avant tout regroupement (ordre ODSQL : `where` puis `group_by`) : ni un alias d'agrégat (`montant__sum`), ni une colonne calculée en aval (`compute` d'un `dsfr-data-normalize`) n'existent à ce stade — l'API répond 400. |
| `label` | `string` | `""` (vide) | Libellé naturel pour l'affichage (tags #232) — défaut : field |
| `operator` | `ContextOperator` | `'eq'` | Opérateur : eq, in, lt, gte, between, contains (sous-chaîne, #678) — et dates (#230, clauses en plages [debut, fin)) : month-of, year-of, lt-day-after, last-n-days, current-year, current-month (#682 — case à cocher, mois en cours, borne dynamique). `year-of` et `month-of` acceptent une date plus precise que l'opérateur et la tronquent (#646) : "2026-09-09" -> annee 2026 / mois 2026-09, ce qui permet de les nourrir d'un <input type="date"> (il n'existe pas de type="year"). Une valeur qui reste inexploitable (ni date, ni mois, ni annee) retire le filtre et le signale par un avertissement console, emis une seule fois par filtre. |
| `ui` | `string` | `""` (vide) | Id(s) de l'élément d'UI écouté — deux ids (min max) pour between |
| `year-start-month` | `number` | `1` | Mois de début de l'année pour `year-of` et `current-year` (#735) — 1 (défaut) = année civile, 9 = année scolaire, 4 = exercice comptable britannique, 7 = exercice australien, 10 = saison. La clause reste une plage `gte` + `lt` : elle se délègue au serveur comme n'importe quelle autre, aucun adaptateur n'est concerné. `year-of` avec `year-start-month="9"` et la valeur « 2024 » filtre `[2024-09-01, 2025-09-01)` et s'affiche « 2024-2025 » dans les tags. Une valeur plus précise (« 2025-03-10 ») désigne l'année qui la CONTIENT — soit 2024-2025 ici — ce qui permet de nourrir l'opérateur d'un contrôle de type date. Côté client seul, une colonne d'année scolaire se dérive aussi avec `compute` sur dsfr-data-normalize ; l'attribut existe pour les jeux qu'on ne veut pas rapatrier. |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `buildColonWhere()` | `string` | Clause colon du filtre — chaîne vide si l'UI est vide (= retrait). Les valeurs sont percent-encodées (#271) : une virgule ou un pipe dans une valeur ne casse pas la grammaire. |
| `clear()` | `void` | Réinitialise le filtre en VIDANT ses contrôles d'UI puis ré-émet — exactement le chemin d'un utilisateur qui efface le champ (#232) : sources, URL et tags se mettent à jour ensemble. |
| `displayLabel()` | `string` | Libellé d'affichage (tags #232) |
| `displayValue()` | `string` | Valeur d'affichage humaine du filtre (tags #232) |
| `urlValue()` | `string` | Valeur de ce filtre pour l'URL (#231) — encodage lisible ADR-031 : valeurs jointes par virgule ('' = filtre inactif, paramètre retiré). |


**Événements** — aucun.


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
