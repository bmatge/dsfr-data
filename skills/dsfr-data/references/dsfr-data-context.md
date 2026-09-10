# dsfr-data-context

> Filtres transverses multi-sources (dashboard a filtre commun)
>
> Déclencheurs : context, contexte, filtre commun, filtre partage, filtre transverse, dashboard filtre, multi-vues, fan-out, orchestration

## <dsfr-data-context> - Filtres transverses multi-sources

Chef d'orchestre OPT-IN (#229, ADR-031) : tient les filtres communs d'un dashboard
multi-vues et les diffuse a N sources nommees. Ne fait aucun fetch HTTP, ne transforme
aucune donnee — il emet des commandes where (un whereKey stable par filtre, combinaison
en AND par le merge multi-emetteurs des sources ; jamais « le dernier gagne »).
Sans contexte, chaque source reste autonome (defaut inchange).

### Attributs

| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| sources | String | `""` | oui | Ids des sources cibles, separes par des espaces |
| url-sync | Boolean | `false` | non | Serialisation URL des filtres (#231, opt-in) : lecture au chargement (pre-remplit les UI), ecriture replaceState, parametres voisins preserves |
| url-param-map | String | `""` | non | Renommage des parametres URL : `"param:field \| param2:field2"` |

### Pattern

```html
<select id="ui-categorie" multiple>...</select>

<dsfr-data-context sources="src-a src-b src-c">
  <dsfr-data-context-filter field="categorie" operator="in" ui="ui-categorie">
  </dsfr-data-context-filter>
</dsfr-data-context>
```

Les enfants <dsfr-data-context-filter> declarent chacun UN filtre. La clause est
construite en colon (dialecte pivot) puis traduite au whereFormat de chaque adapter
(ODSQL pour OpenDataSoft). Le disconnect du contexte libere tous ses filtres.

### Un seul bus de diffusion (#678, ADR-104)

Tout composant qui filtre peut etre un filtre du contexte via `context="id"` :
<dsfr-data-context-filter context="ctx"> (place n'importe ou, plus seulement enfant),
<dsfr-data-facets context="ctx"> (un filtre par champ, select peuple + cascade sans option
en dur), <dsfr-data-search context="ctx"> (filtre contains sur un champ) et
<dsfr-data-map-layer refine-on-click="champ" context="ctx"> (filtre eq au clic sur la carte, #681). Le contexte
diffuse, porte l'URL (un parametre par champ, url-sync unique) et alimente context-tags.
Le contexte peut etre declare APRES ces composants dans la page : ils s'enregistrent a sa
connexion. whereKey stable indexe sur `uid + champ` (insertion tardive sans decalage).


### Référence `<dsfr-data-context>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `sources` | `string` | `""` (vide) | Ids des sources cibles, séparés par des espaces |
| `url-param-map` | `string` | `""` (vide) | Renommage des paramètres : "param:field \| param2:field2" (#231) |
| `url-sync` | `boolean` | `false` | Sérialisation URL des filtres (#231, ADR-031) — OPT-IN, défaut OFF (collision possible avec le routing query-string du site hôte). Lecture au chargement (pré-remplit les UI, qui repassent par le même chemin qu'un clic — aucune injection directe dans un where) ; écriture en history.replaceState à chaque changement. Un paramètre par champ, pour les filtres classiques comme pour les facettes et la recherche enregistrées par `context="id"` (#678) : l'URL-sync est unique. |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `activeFilters()` | `ContextFilterLike[]` | Filtres actifs du contexte (#232) — pour les composants d'affichage (tags). Un filtre est actif si sa clause courante est non vide. Tout type de filtre confondu (#678) : filter, facettes, recherche. |
| `clearAll()` | `number` | Retire tous les filtres actifs d'un coup (#679, « Tout effacer » de dsfr-data-context-tags). Chaque filtre est vidé par son propre `clear()` (même chemin qu'un geste utilisateur : son UI se vide), mais l'URL n'est écrite et `dsfr-data-context-change` émis qu'UNE fois. Retourne le nombre de filtres retirés. |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-context-change` | — | émis | sur l'élément — l'etat des filtres du contexte a change (utile pour <dsfr-data-context-tags> et la synchro d'URL). |
| `dsfr-data-context-connected` | — | émis | `{ id }` sur `document` — le contexte vient d'être connecte (#678) : les filtres declares avant lui dans le DOM (`context="id"`) s'enregistrent a ce moment. |
| `dsfr-data-source-command` | — | émis | `{ sourceId, where, whereKey, origin? }` sur `document` — clause `where` diffusee vers chaque source de `sources`, avec un whereKey stable par filtre (merge en AND cote source, ADR-031). `origin` (#603) nomme le composant emetteur : le bus etant plat, une trace ne pourrait sinon pas dire qui demande quoi. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
