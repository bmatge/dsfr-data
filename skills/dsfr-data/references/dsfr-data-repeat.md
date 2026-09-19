# dsfr-data-repeat

> Repeter des instances vivantes : un graphique, un KPI ou un pipeline par ligne, avec identite par cle et imbrication
>
> Déclencheurs : repeat, repeter, repetition, boucle, ng-repeat, un graphique par ligne, un graphique par question, un kpi par ligne, un kpi par service, n graphiques, composant par ligne, instances, key-field, petits multiples, small multiples, attribut conditionnel, data-if, scopes, scoper une source, partitionner une source, un id par ligne, lazy, chargement paresseux, a l approche du viewport

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
| scopes | String | `""` | non | Partitionne une ou plusieurs sources par champ et emet UN id par ligne repetee : `source:champ:alias`, entrees separees par `\|`, alias facultatif (defaut : l'id de la source). Exige `key-field`. Lu par `{{$scope.alias}}` |
| lazy | Boolean | `false` | non | N'estampe les composants `dsfr-data-*` d'une ligne qu'a son approche du viewport (200 px). Les titres et textes du gabarit sont rendus d'emblee |

Variables du gabarit : `{{$index}}` (rang, 0-based), `{{$key}}` (valeur de `key-field`, ou le
rang), `{{$uid}}` (id DOM unique derive de la cle : sur pour `id=` et `aria-labelledby`),
`{{$scope.alias}}` (l'id scope de la ligne, avec `scopes`) — `{{$scope}}` quand une seule
entree est declaree.

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

### Pattern — le meme, avec `scopes` : aucune query dans le gabarit

`scopes` partitionne la source scopee UNE fois (une passe, une `Map`) et emet un id par
ligne, la ou N `dsfr-data-query` refiltraient chacune la source entiere. Le gabarit n'a plus
d'id a fabriquer, et le volet Diagnostic sait d'ou vient `q-001`.

```html
<dsfr-data-repeat source="questions" key-field="code_unifie" per-row="1 md:2"
  scopes="scores:code_unifie:q" lazy>
  <template>
    <h3 id="{{$uid}}">{{libelle_unifie}}</h3>
    <dsfr-data-chart source="{{$scope.q}}" type="{{type_graphique}}"
      label-field="annee" value-field="score" name="{{libelle_unifie}}"></dsfr-data-chart>
  </template>
</dsfr-data-repeat>
```

Mesure sur 119 lignes : le refiltre d'une re-emission de la source scopee passe de 13,8 ms
(119 queries) a **2,3 ms** (une partition), et les ecouteurs `document` de 2,03 a **1,03 par
ligne**. Avec `lazy`, 4 graphiques dessines sur 119 au chargement au lieu de 119.

- **Une cle sans lignes emet un TABLEAU VIDE**, jamais rien : la ligne existe, son graphique
  est vide, pas absent.
- **Les etats sont relayes** : `loading`, `error` et `idle` (`require-where`) de la
  source scopee portent sur chaque id scope — la ligne affiche le bon message.
- **La re-emission de la source scopee re-partitionne sans toucher aux lignes** : les instances
  sont les memes objets (0 recreee sur 119, mesure).
- **Purge** : un id scope disparait du cache avec sa ligne et a la deconnexion du repeteur.
- **Erreurs nommees** : nombre de termes, terme vide, alias en double, source introuvable,
  champ absent des lignes — rien de silencieux.
- `lazy` ne reserve pas de hauteur a votre place : donner au gabarit (ou a
  `.dsfr-data-repeat__row`) la hauteur qu'il aura une fois rendu, sinon les 119 conteneurs
  tiennent dans le viewport et s'estampent d'un coup.

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
- Une query par ligne coute N filtres et N renegociations a chaque inscription (#900) :
  preferer `scopes`, qui partitionne la source UNE fois. La query par ligne reste la voie
  quand la ligne a besoin d'un regroupement ou d'un agregat propre.
- `scopes` ne delegue rien au serveur non plus : c'est la meme regle #765, la partition est
  faite dans le navigateur sur une source chargee en entier.
- Ne pas poser `display:block` sur la balise depuis la page : les lignes sont des `<div>`
  enfants directs, la grille `per-row` porte ses classes DSFR.


### Référence `<dsfr-data-repeat>` (générée depuis le code)

**Rôle pipeline** : affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’émet pas de données.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `empty` | `string` | `""` (vide) | Texte rendu quand la source émet zéro ligne — dans un `<p>` sans `role="status"` : la balise n'annonce rien, c'est l'auteur qui décide de l'annonce. Vide : rien. |
| `key-field` | `string` | `""` (vide) | Champ dont la valeur identifie une ligne entre deux émissions (chemin `a.b` accepté). Une clé qui subsiste garde ses nœuds et ses instances ; vide, la clé est le rang. Clé nulle ou vide sur une ligne : le rang, sans erreur. Clé en double : erreur de configuration nommant la clé, et le rang pour les doublons. |
| `lazy` | `boolean` | `false` | N'estampe les composants d'une ligne qu'à son approche du viewport (`IntersectionObserver`, marge 200 px — la même que `dsfr-data-map`). Les conteneurs et le contenu ORDINAIRE du gabarit (titres, textes, liens) sont rendus d'emblée : la page garde sa structure de titres, sa hauteur et son plan d'accessibilité. Seuls les éléments `dsfr-data-*` sont retenus hors du document, attributs déjà interpolés, et insérés à l'entrée de la ligne dans la marge — ils ne s'abonnent donc à rien et ne dessinent rien avant. Les ids scopés, eux, sont émis pour **toutes** les lignes dès le départ : le cache est là quand la ligne s'estampe. Sans `lazy`, comportement du lot 1 (tout est estampé d'emblée). Sans `IntersectionObserver` (environnement de test), `lazy` est sans effet. |
| `per-row` | `string` | `""` (vide) | Nombre de lignes par rangée à partir de 768 px (en dessous : une par rangée) — diviseur de 12 (1, 2, 3, 4, 6, 12), ou une échelle par point de rupture `"1 md:2 lg:3"`. Vide : pas de grille, un bloc par ligne. Grille `fr-grid-row` avec gouttières. |
| `scopes` | `string` | `""` (vide) | Partitionne une ou plusieurs sources par champ et émet **un id scopé par ligne répétée** — la voie native pour « un graphique par question » sans écrire une `dsfr-data-query` par ligne dans le gabarit (#891). Grammaire (#888, proposition A, celle de `champ:fonction:alias`) : `source:champ:alias`, entrées séparées par `\|`, termes par `:`. L'alias est facultatif — à défaut, c'est l'id de la source. `scopes="scores:code_unifie:q \| effectifs:code_unifie:e"` émet, pour chaque ligne de clé `001`, les ids `q-001` et `e-001` ; le gabarit les lit par `{{$scope.q}}` et `{{$scope.e}}` (`{{$scope}}` quand une seule entrée est déclarée). Les composants du gabarit les consomment par leur attribut `source` habituel : rien ne change pour eux. La clé d'appariement est celle de la ligne répétée (`key-field`, requis) : une clé sans lignes dans la source scopée émet un **tableau vide** — le graphique de la ligne est vide, pas absent. Les états `loading`, `error` et `idle` (`require-where`) de la source scopée sont relayés sur chaque id scopé, pour que la ligne affiche le bon message. Une ré-émission de la source scopée re-partitionne et ré-émet **sans toucher aux lignes**. La partition est faite **une fois** par émission (une `Map` par champ), là où N `dsfr-data-query` refiltraient chacune la source entière. Les ids scopés sont purgés du cache quand leur ligne disparaît et à la déconnexion du répéteur. Entrée fausse (nombre de termes, terme vide, alias en double, source introuvable, champ absent des lignes) : `reportConfigError` nommant l'entrée — rien de silencieux. |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont chaque ligne devient une instance du gabarit. Requis. |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getScopedIds()` | `string[]` | Les ids que ce répéteur ÉMET — lu par la reconstruction du graphe (`snapshotGraph`), qui n'a aucun autre moyen de savoir d'où sort `q-001` : aucun élément de la page ne porte cet id. Même doctrine que `getSkippedCount()` : une méthode publique du composant, pas un événement. |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
