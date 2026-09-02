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
| operator | String | `"eq"` | non | eq, in, lt, gte, between (between -> gte + lt), et dates (#230) : month-of, year-of, lt-day-after, last-n-days, current-year (bornes dynamiques recalculees a chaque diffusion) |
| apply-to | String | `"*"` | non | `*` = toutes les sources du contexte, ou liste d'ids cibles separes par des espaces |
| label | String | `""` | non | Libelle naturel pour l'affichage (tags #232) — defaut : field |

### Operateurs

- `eq` : egalite — `in` : multi-valeurs (select multiple, valeurs jointes par | ou ,)
- `lt` / `gte` : comparaisons — `between` : deux UI (min puis max) -> gte + lt
- Dates (#230) : `month-of` (input type=month -> plage du mois), `year-of` (plage annuelle),
  `lt-day-after` (inclusif jusqu'au jour choisi), `last-n-days` (N derniers jours, borne
  dynamique), `current-year` (checkbox -> annee en cours). Plages [debut, fin) en ISO,
  recalculees a chaque diffusion — l'URL serialise l'intention (« 30 »), pas les dates resolues.


### Référence `<dsfr-data-context-filter>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `apply-to` | `string` | `'*'` | Cibles : "*" (défaut, toutes les sources du contexte) ou ids ciblés |
| `field` | `string` | `""` (vide) | Colonne filtrée |
| `label` | `string` | `""` (vide) | Libellé naturel pour l'affichage (tags #232) — défaut : field |
| `operator` | `ContextOperator` | `'eq'` | Opérateur : eq, in, lt, gte, between — et dates (#230, clauses en plages [debut, fin)) : month-of, year-of, lt-day-after, last-n-days, current-year |
| `ui` | `string` | `""` (vide) | Id(s) de l'élément d'UI écouté — deux ids (min max) pour between |


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
