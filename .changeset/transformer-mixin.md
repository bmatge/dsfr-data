---
'dsfr-data': patch
---

Nouveau `TransformerMixin` partagé par les 6 transformateurs du pipeline — query, join, unpivot, normalize, facets, search (#280) : abonnement aux sources amont (multi-sources pour join), re-souscription, états loading/error avec contrats `isLoading()`/`getError()` identiques partout, ré-émission aval avec meta posée avant le dispatch, relais de commandes vers l'amont, validation de config. Trois divergences réelles corrigées : `dsfr-data-query` ne réinitialisait jamais son erreur après un succès, `dsfr-data-normalize`/`dsfr-data-unpivot` n'avaient ni état erreur ni loading, `dsfr-data-facets`/`dsfr-data-search` fuyaient leur abonnement quand `source` était vidé au runtime. Un test-garde statique interdit tout `subscribeToSource` manuel hors mixins.
