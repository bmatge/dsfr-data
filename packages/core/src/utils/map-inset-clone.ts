/**
 * Attribut posé par `dsfr-data-map-inset` sur chaque couche qu'il clone dans
 * sa mini-carte : l'id de la couche d'origine. Le clone n'a pas d'id — jamais
 * deux fois le même dans le document — et sans cette trace, un compagnon qui
 * désigne ses couches par id (`for` de `dsfr-data-map-timeline`) ne pouvait
 * pas retrouver leurs clones (BUG-034).
 *
 * Module sans dépendance, lu par l'encart et par la timeline : aucun des deux
 * n'importe l'autre.
 */
export const INSET_CLONE_OF = 'data-inset-clone-of';
