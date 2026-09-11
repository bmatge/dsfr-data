# dsfr-data-concat

> Empile les lignes de plusieurs sources de même schéma (union)
>
> Déclencheurs : concat, empiler, union, concatener, concaténer, plusieurs series, plusieurs séries, plusieurs annees, plusieurs années, meme schema, même schéma

## <dsfr-data-concat> - Empiler des sources de même schéma

L'opération inverse de `dsfr-data-join` : le join juxtapose des COLONNES (même clé, deux
tables), concat met des LIGNES bout à bout (mêmes colonnes, plusieurs tables). Cas type : une
source par millésime, par région ou par série, à rassembler dans un seul graphique.

```html
<dsfr-data-source id="v2023" api-type="opendatasoft" base-url="…" dataset-id="ventes-2023"></dsfr-data-source>
<dsfr-data-source id="v2024" api-type="opendatasoft" base-url="…" dataset-id="ventes-2024"></dsfr-data-source>

<dsfr-data-concat id="ventes" sources="v2023, v2024"
  origin-field="millesime" origin-labels="v2023:2023 | v2024:2024">
</dsfr-data-concat>

<!-- Format long : une courbe par millésime, sans pivot ni jointure -->
<dsfr-data-chart source="ventes" type="line"
  label-field="mois" value-field="montant" series-field="millesime">
</dsfr-data-chart>
```

### Règles
- **`sources`** : ids séparés par des virgules, au moins deux, dans l'ordre d'empilement.
  Émission quand TOUTES ont répondu.
- **`origin-field`** (facultatif) : colonne ajoutée à chaque ligne, qui dit de quelle source elle
  vient — l'id, ou le libellé d'`origin-labels` (`"id:libellé | id2:libellé2"`). C'est ce qui
  remplace les empilements par pivots et jointures : le résultat se branche tel quel sur
  `series-field`. Un nom de colonne déjà présent dans les données est refusé.
- **Schéma divergent = erreur de configuration** nommant, par source, les colonnes en trop et en
  moins, et RIEN n'est émis. Aligner en amont (`dsfr-data-normalize rename`, `select` de la
  source). Une source vide n'impose rien.
- **Aucune commande n'est relayée** (page, where, tri) : on ne saurait à quelle source l'adresser.
  Filtrer ou regrouper DERRIÈRE un concat se fait côté client (une `dsfr-data-query` aval ne
  délègue pas) ; pour filtrer côté serveur, poser le filtre sur CHAQUE source.
- Meta : `total` invalidé ; si UNE source est tronquée (`max-records`), le résultat est marqué
  tronqué au volet Diagnostic.
- Pas de `type="union"` sur `dsfr-data-join` : c'est ce composant.

### Référence `<dsfr-data-concat>` (générée depuis le code)

**Rôle pipeline** : transformateur (`TransformerMixin`) — consomme `source`, ré-émet sous son propre `id`, relaie les commandes vers l’amont.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `origin-field` | `string` | `""` (vide) | Colonne ajoutée à chaque ligne, qui dit de quelle source elle vient (facultatif). Sa valeur est l'id de la source, ou le libellé que lui donne `origin-labels`. Un nom de colonne déjà présent dans les données est une erreur de configuration : on écraserait une donnée. |
| `origin-labels` | `string` | `""` (vide) | Valeur écrite dans `origin-field` pour chaque source : `"id:libellé \| id2:libellé2"`. Une source non citée garde son id. Un `:` ou un `\|` littéral dans un libellé s'échappe en `%3A` / `%7C`. |
| `sources` | `string` | `""` (vide) | Ids des sources (ou transformateurs) à empiler, séparés par des virgules, dans l'ordre d'empilement. Au moins deux. |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getData()` | `Row[]` | — |


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
