---
'dsfr-data': minor
---

Négociation de délégation : un registre d'instances, une contestation par tout lecteur, un relais franchi et un `where` seul délégué.

- **#836** — `readersOf()` faisait un `document.querySelectorAll('*')` par saut de chaîne, à chaque négociation et à chaque contestation : sur un tableau de bord de vingt requêtes et quelques milliers de nœuds, autant de balayages complets du DOM à l'initialisation. Un **registre d'instances** (`utils/instance-registry.ts`) le remplace : chaque composant qui s'abonne à une chaîne s'y inscrit à `connectedCallback` et s'en retire à `disconnectedCallback`, la lecture est en O(composants). Un élément `dsfr-data-*` qu'aucune définition ne rehausse n'est plus compté comme lecteur — il n'affiche rien et ne lit rien.

- **#853** — un KPI, une liste ou un graphique ajouté APRÈS l'initialisation ne contestait pas la délégation : `dsfr-data-delegation-contested` n'avait qu'un seul émetteur, une autre `dsfr-data-query` pendant sa propre négociation. L'overlay `group_by` restait posé et le nouveau venu comptait les GROUPES (mesuré : 8 au lieu de 137). Tout abonné qui s'inscrit sur une chaîne déjà déléguée la fait désormais renégocier. **Résout le constat BUG-009 (forme tardive) du banc d'essai open-data-viz.**

- **#855** — la délégation ne franchissait pas un `dsfr-data-normalize` : 0 URL sur 2 portaient `group_by`, le jeu entier était rapatrié puis regroupé dans le navigateur. La cause était l'ordre des `customElements.define` (`dsfr-data-query` est définie avant `dsfr-data-normalize`) : au moment où la query négociait, son amont était un `HTMLElement` nu, sans `getAdapter()`. Le signal du registre refait la négociation au rehaussement du maillon, avant le premier fetch : une seule requête part, déjà groupée.

- **#856 / #854** — une requête à `where` seul (sans `group-by`) délègue désormais sa clause quand elle est seule lectrice de sa chaîne : l'overlay est clé par émetteur (ADR-031) et se fusionne avec ceux des facettes, de la recherche et du contexte. C'est ce qui libère `require-where` comme sa documentation le promettait — une source `require-where` derrière une telle requête restait en attente pour toujours, page vide et sans message. JSDoc de `where` (plus de conditionnel) et de `require-where` mis à jour.

Limite connue, hors périmètre de ces issues : la délégation ne revient pas quand la chaîne redevient exclusive (lecteur retiré de la page) — la requête reste côté client jusqu'à la prochaine renégociation.

Les quatre contrôles de vérification correspondants (`lecteur-tardif-renegociation`, `relais-normalize-devrait-deleguer`, `where-seul-devrait-etre-delegue`, `require-where-filtre-par-delegation`) passent de `skip` à vert, avec leurs attendus inchangés.
