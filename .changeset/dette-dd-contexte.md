---
'dsfr-data': patch
---

Un seul tronc de liaison à un contexte, et un seul appel `/facets` par clic (#837, #840).

La résolution d'un `dsfr-data-context` par id — écouter sa connexion, différer la
première liaison d'un tick, poser puis lever l'erreur de configuration, libérer à la
déconnexion, refaire la liaison quand l'attribut change à chaud — était écrite trois
fois (`dsfr-data-facets`, `dsfr-data-search`, le mixin de sélection des afficheurs),
avec une variante dans `dsfr-data-context-value`. Elle vit désormais dans un seul
mixin (`ContextBindingMixin`) ; chaque composant ne garde que ce qui lui est propre :
un filtre unique pour la recherche et la sélection, un filtre par champ pour les
facettes, aucun pour `context-value`. Effet visible : une facette dont le `context`
est introuvable pose maintenant le même marqueur de configuration que la recherche,
au lieu de rester muette. Même mouvement pour la construction de l'URL de page
(`currentUrl` / `replaceUrl`, la leçon #683 en un seul endroit) et pour la délégation
`getAdapter` / `getEffectiveWhere` / `getAdapterParams` vers l'amont, remontée dans
`TransformerMixin`. Aucun attribut, aucun événement, aucun comportement de filtrage
ne change.

Facettes en mode `context` avec `server-facets` : chaque sélection déclenchait deux
requêtes de facettes — une relance directe, puis celle du refetch provoqué par le
contexte. La première était annulée en vol, donc invisible, mais payée à chaque clic.
La relance directe n'a plus lieu que lorsque la source de la facette n'est pas une
cible du contexte, c'est-à-dire quand rien d'autre ne la rafraîchirait.
