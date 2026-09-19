# dsfr-data-repeat

> Repeter des instances vivantes : un graphique, un KPI ou un pipeline par ligne, avec identite par cle et imbrication
>
> Déclencheurs : repeat, repeter, repetition, boucle, ng-repeat, un graphique par ligne, un graphique par question, un kpi par ligne, un kpi par service, n graphiques, composant par ligne, instances, key-field, petits multiples, small multiples, attribut conditionnel, data-if

## <dsfr-data-repeat> - Repeter des instances vivantes : une ligne, un pipeline

Composant de STRUCTURE (ADR-135). Pour chaque ligne de `source`, le `<template>` enfant est
CLONE en DOM et ses placeholders resolus noeud par noeud — texte, attributs, et donc les
composants `dsfr-data-*` qu'il contient, rehausses avec leurs attributs deja interpoles.
C'est la voie native pour « un graphique par question », « un KPI par service ».

**Regle d'usage : `dsfr-data-display` quand la ligne est du CONTENU ; `dsfr-data-repeat`
quand la ligne est un PIPELINE.** `display` est une liste de resultats (region nommee, compteur
annonce, pagination, selection). `repeat` est transparent : aucun `role`, aucun
`aria-live`, aucun compteur, aucune pagination — la structure vient des titres du gabarit.

### Attributs

| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | `""` | oui | Id de la source (ou du transformateur) : une ligne = une instance du gabarit. Absent : erreur de configuration |
| key-field | String | `""` | non | Champ qui identifie une ligne entre deux emissions (chemin `a.b` accepte). Une cle qui subsiste garde ses noeuds et ses instances. Vide : le rang. Absent des lignes ou en double : erreur nommee, repli sur le rang |
| per-row | String | `""` | non | Lignes par rangee a partir de 768 px : diviseur de 12 (`1 2 3 4 6 12`) ou echelle `"1 md:2 lg:3"` (grille `fr-grid-row` avec gouttieres). Vide : un bloc par ligne. Sans `cols` |
| empty | String | `""` | non | Texte rendu quand la source emet zero ligne, dans un `<p>` SANS `role="status"` (la balise n'annonce rien). Vide : rien |

Variables du gabarit : `{{$index}}` (rang, 0-based), `{{$key}}` (valeur de `key-field`, ou le
rang), `{{$uid}}` (id DOM unique derive de la cle : sur pour `id=` et `aria-labelledby`).

### Pattern — un graphique par question

```html
<!-- La table des questions (une ligne par question) et les scores (UNE requete) -->
<dsfr-data-source id="questions" api-type="opendatasoft" base-url="https://data.economie.gouv.fr"
  dataset-id="bfn-table-de-correspondance" fetch-mode="export" max-records="200"></dsfr-data-source>
<dsfr-data-source id="scores" api-type="opendatasoft" base-url="https://data.economie.gouv.fr"
  dataset-id="questions-reponses" fetch-mode="export" max-records="5000"></dsfr-data-source>

<dsfr-data-repeat source="questions" key-field="code_unifie" per-row="1 md:2">
  <template>
    <h3 id="{{$uid}}">{{libelle_unifie}}</h3>
    <dsfr-data-query id="q-{{code_unifie}}" source="scores" where="code_unifie:eq:{{code_unifie}}"
      group-by="annee" aggregate="score:sum" order-by="annee:asc"></dsfr-data-query>
    <dsfr-data-chart source="q-{{code_unifie}}" type="{{type_graphique}}"
      label-field="annee" value-field="score__sum" name="{{libelle_unifie}}"
      data-if-horizontal="est_long"></dsfr-data-chart>
  </template>
</dsfr-data-repeat>
```

### Ce que repeat promet (et que display ne promet pas)

- **Identite par cle.** A une nouvelle emission de `source`, une ligne dont la cle subsiste
  garde ses noeuds : les instances ne sont ni deconnectees ni recreees, leurs attributs sont
  mis a jour en place ; les cles disparues sont retirees, les nouvelles inserees a leur rang,
  l'ordre du DOM suit les donnees. Mesure : 119 graphiques re-emis en ~110 ms sans un canvas
  detruit (display : ~4,7 s, tout recree).
- **Imbrication.** Un `<template>` interieur n'est pas parcouru : un `dsfr-data-display`
  ou un second `dsfr-data-repeat` dans le gabarit rend SES propres placeholders.
- **Attribut booleen conditionnel.** `data-if-databox="champ"` pose `databox` quand
  `champ` est vrai (ni null, undefined, « », [] ni false) et le retire sinon ;
  `data-unless-champ` inverse. L'attribut de convention est retire du DOM.
- **Transparence.** `grep role=` sur le rendu = 0. C'est l'auteur qui structure (titres) et
  qui annonce (`empty` n'a pas de `role="status"`).

### Grammaire du gabarit : la meme, deux differences de sortie

Meme moteur que `display` et `map-popup` (`{{chemin[:format[:arg]][|défaut]}}`,
`{{#if}}`, `{{#unless}}`, `{{#each}}`), aucune syntaxe nouvelle. Parce que le rendu est
par noeuds :
- `{{{brut}}}` n'a pas de sens sur un noeud texte : rendu comme `{{brut}}` (texte, echappe),
  avec un avertissement une fois par gabarit. Pour injecter du HTML, c'est `display`.
- Un bloc `{{#if}}…{{/if}}` doit tenir dans UN noeud texte ou UNE valeur d'attribut
  (`class="{{#if x}}actif{{/if}}"` marche). Ouvert avant un element et ferme apres
  (« englober deux `<p>` »), il ne peut pas etre un bloc : **erreur de configuration**, et le
  contenu est rendu quelle que soit la condition. Choisir un sous-arbre entier viendra avec la
  conditionnelle structurelle (lot 3) ; d'ici la, un element par branche.

### Limites (vraies, dites d'avance)

- Pas de delegation serveur derriere un id scope : une source lue par N queries reste calculee
  dans le navigateur (regle #765) — la charger EN ENTIER (`fetch-mode="export"`,
  `max-records` au volume reel). Ni `facets` ni `search` ne se repetent.
- Le bus est plat : deux repeteurs qui fabriquent le meme id (`q-001`) se marchent dessus,
  comme deux auteurs qui ecriraient le meme id. Prefixer par repeteur.
- Une query par ligne coute N filtres et N renegociations a chaque inscription (#900) ; le
  lot 2 (`scopes`) partitionnera la source une fois.
- Ne pas poser `display:block` sur la balise depuis la page : les lignes sont des `<div>`
  enfants directs, la grille `per-row` porte ses classes DSFR.


### Référence `<dsfr-data-repeat>` (générée depuis le code)

**Rôle pipeline** : affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’émet pas de données.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `empty` | `string` | `""` (vide) | Texte rendu quand la source émet zéro ligne — dans un `<p>` sans `role="status"` : la balise n'annonce rien, c'est l'auteur qui décide de l'annonce. Vide : rien. |
| `key-field` | `string` | `""` (vide) | Champ dont la valeur identifie une ligne entre deux émissions (chemin `a.b` accepté). Une clé qui subsiste garde ses nœuds et ses instances ; vide, la clé est le rang. Clé nulle ou vide sur une ligne : le rang, sans erreur. Clé en double : erreur de configuration nommant la clé, et le rang pour les doublons. |
| `per-row` | `string` | `""` (vide) | Nombre de lignes par rangée à partir de 768 px (en dessous : une par rangée) — diviseur de 12 (1, 2, 3, 4, 6, 12), ou une échelle par point de rupture `"1 md:2 lg:3"`. Vide : pas de grille, un bloc par ligne. Grille `fr-grid-row` avec gouttières. |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont chaque ligne devient une instance du gabarit. Requis. |



**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
