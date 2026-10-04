---
'dsfr-data': patch
---

`dsfr-data-map-inset` : l'encart `territory="polynesie-francaise"` s'affiche désormais avec le fond par défaut — suite du constat AM-102 du banc d'essai ([#1245](https://github.com/bmatge/dsfr-data/issues/1245)).

Le préréglage était au zoom 8, et le Plan IGN (`tiles="ign-plan"`, le fond par défaut) ne répond plus au-delà du zoom 7 sur la Polynésie française : l'encart sortait gris, sans fond. Il passe au **zoom 7**, le plus grand que ce fond sert.

| Préréglage | Avant | Après |
|---|---|---|
| `polynesie-francaise` | `-17.55,-149.55`, zoom 8 | `-17.68,-149.52`, zoom 7 |

Tahiti et Moorea restent au centre, par choix (arbitrage du 2026-10-04) : le nouveau centre est le milieu de l'emprise des deux îles en projection Mercator. Dans l'encart par défaut (152 × 160 px), elles sont entières, à 40 px des bords gauche et droit et 60 px du haut et du bas — à l'ancien centre, la pointe est de la presqu'île de Taiarapu débordait de 2 px.

**Les pages existantes voient cet encart cadré un peu plus large** : un niveau de zoom plus bas, les deux îles deux fois plus petites. Un `center` ou un `zoom` posé sur l'encart prime toujours. Pour retrouver le cadrage resserré, poser `zoom="8"` sur l'encart **et** un fond qui sert ce zoom sur la carte (`tiles="ign-ortho"` ou `tiles="osm"`).

La même limite du Plan IGN vaut pour la Nouvelle-Calédonie et Wallis-et-Futuna ; leurs préréglages (zooms 5 et 6) restent en dessous et ne changent pas.
