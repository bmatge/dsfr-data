---
'dsfr-data': minor
---

**`dsfr-data-repeat` devient un émetteur : `scopes`** (ADR-135, #887, lot 2, #891). `scopes="scores:code_unifie:q | effectifs:code_unifie:e"` partitionne une ou plusieurs sources **par champ** — une passe, une `Map` par champ — et émet **un id par ligne répétée** (`q-001`, `e-001`…), que le gabarit lit par `{{$scope.q}}` (ou `{{$scope}}` quand une seule entrée est déclarée). Plus une seule `dsfr-data-query` interpolée dans le gabarit, plus un seul id fabriqué à la main. Grammaire : `source:champ:alias`, entrées séparées par `|`, alias facultatif (à défaut, l'id de la source) ; `key-field` est requis, la clé de partition est celle de la ligne.

Mesures sur la page témoin (Chromium, 119 lignes × un graphique) : le **refiltre** d'une ré-émission de la source scopée passe de **13,8 ms** (119 queries qui refiltrent chacune la source entière) à **2,3 ms** (une partition), les écouteurs `document` par type d'événement de **2,03** à **1,03 par ligne**, et **aucune instance n'est recréée**.

Ce que `scopes` garantit : une clé sans lignes émet un **tableau vide** (la ligne existe, son graphique est vide, pas absent) ; les états `loading`, `error` et `idle` (`require-where`) de la source scopée sont **relayés** sur chaque id scopé, y compris pour une ligne qui vient de naître ; une ré-émission de la source scopée re-partitionne **sans toucher aux lignes** ; les ids scopés sont **purgés** du cache avec leur ligne et à la déconnexion. Meta relayée réduite au `total` du scope — `truncated` et `serverSide` ne se propagent pas derrière un id fabriqué. Aucune délégation serveur : la partition est cliente, même règle que N queries sur une source partagée.

**`lazy`** (booléen) n'insère les composants `dsfr-data-*` d'une ligne qu'à son entrée dans une marge de 200 px autour du viewport (`IntersectionObserver`, la même que `dsfr-data-map`) : retenus hors du document, attributs déjà interpolés, ils ne s'abonnent à rien et ne dessinent rien avant. Les titres et les textes du gabarit, eux, sont rendus d'emblée — le plan de la page et sa hauteur ne dépendent pas du défilement. Mesure : **4 graphiques dessinés sur 119** au chargement, 119 après défilement complet. `lazy` ne réserve pas la hauteur à la place de l'auteur : donner une `min-height` au gabarit.

**Volet Diagnostic** : un `StageNode` porte désormais `emits` (les ids qu'un nœud fabrique, lus sur `getScopedIds()`). Les ids scopés ne sont donc plus comptés « amonts introuvables » — une fausse panne par ligne — et `formatTrace()` rend une section « Ids scopés » qui les attribue à leur répéteur (`q-001 ← dsfr-data-repeat#questions`).

Rien de silencieux : nombre de termes, terme vide, alias en double, source introuvable dans la page, champ absent des lignes de la source scopée — chaque cas pose une erreur de configuration qui **nomme l'entrée**.
