---
'dsfr-data': minor
---

Les lignes d'une source en panne restent en mémoire, **périmées et datées** : plus aucun lecteur ne les reçoit comme des lignes à jour (#1272). Rien ne change à l'écran : les blocs gardent leur message de panne de la 0.48.

**Ce qui était faux.** Quand une source échouait après avoir déjà livré, ses lignes restaient dans le cache comme si de rien n'était. Les afficheurs disaient la panne depuis la 0.48, mais tout le reste lisait l'ancien jeu sans le savoir : `DsfrData.getDataCache(id)` et `element.getData()` le rendaient encore ; une `dsfr-data-query` montée après la panne le relisait et l'émettait ; une jointure ou un empilement dont l'AUTRE entrée se rechargeait recalculait sur l'ancien côté ; un `dsfr-data-normalize` dont un attribut changeait aussi ; une source qui recevait une commande sans effet ré-émettait son ancien jeu. Dans chacun de ces cas, l'aval quittait son état d'erreur et réaffichait le chiffre d'avant la panne.

**La règle, désormais.** À l'échec, les lignes sortent du cache courant et sont rangées à part, avec la date de leur chargement et la cause de la panne. Le marquage tient pendant le nouvel essai et se lève au premier chargement réussi ; une source remise en attente d'un filtre (`require-where`) ou retirée de la page n'en garde aucune. Un transformateur dont une entrée est en panne relaie l'erreur et ne recalcule rien.

**Changements de contrat pour un intégrateur** (à lire si un script de la page lit les données) :

- `element.getData()` rend `null` sur une source en panne (au lieu des lignes d'avant la panne), et `[]` sur une requête, une jointure, un empilement, un pivot, un dépivot ou une recherche dont la source est en panne.
- `DsfrData.getDataCache(id)` rend `undefined` pour une étape en panne. Un bundle d'une version antérieure chargé sur la même page, ou un script qui lit `window.__dsfrDataCache`, ne voit plus ces lignes non plus.
- Pour lire quand même les dernières lignes reçues : **`element.getLastKnownData()`** ou **`DsfrData.getLastKnownData(id)`**, qui rendent `{ data, loadedAt, stale? }`. `loadedAt` est la date du dernier chargement réussi ; `stale` (`{ since, cause, originId }`) est présent pendant la panne, absent sinon. Les lignes et leur date sont rendues ensemble.
- **`element.isStale()`** et **`DsfrData.isDataStale(id)`** : vrai de la panne jusqu'au prochain chargement réussi, nouvel essai en cours compris.
- L'événement `dsfr-data-loaded` gagne `detail.loadedAt` ; `dsfr-data-error` gagne `detail.lastLoadedAt`, présent seulement quand la source avait déjà livré. Rien d'autre ne change dans ces détails.
- Une source en panne ne ré-émet plus son ancien jeu en réponse à une commande sans effet.
- Un afficheur monté pendant un nouvel essai est en chargement, au lieu d'afficher l'ancien chiffre sans indication.

**Corrigé au même endroit.**

- L'`aria-label` d'un `dsfr-data-kpi` en chargement ne porte plus le dernier chiffre reçu : « Population: chargement en cours » au lieu de « Population: 15 909 531 ».
- La source et les adaptateurs abandonnent le corps d'une réponse d'erreur (404, 503…) au lieu de le laisser non lu : la requête n'est plus tenue ouverte par le navigateur. Mesuré : un test qui attend le calme du réseau après une panne passait de 90 s (délai dépassé) à 1 s.
- « Réessayer » sur un bloc alimenté par `scopes` (`dsfr-data-display`, `dsfr-data-repeat`) relance la source qui a échoué, et non un identifiant fabriqué que personne ne sert.
- Volet Diagnostic : une étape en panne dit les lignes qu'elle garde, périmées, avec l'heure de leur chargement ; une étape qui a émis après l'échec de son amont est signalée comme « calculée sur des lignes périmées » (composant tiers, ou page observée avec une version antérieure). Sur une page observée après coup, une étape en panne n'est plus reconstituée « chargée ».

**Non fait, volontairement.** Aucun composant n'affiche les dernières données connues : c'est la proposition 3 de #1203, qui fait l'objet d'une issue à part (#1288). `dsfr-data-map-layer` et `dsfr-data-a11y` (tableau équivalent, export CSV) n'ont pas de rendu de panne : ils gardent à l'écran les dernières lignes reçues, comme avant — leur cas est décrit dans cette même issue.
