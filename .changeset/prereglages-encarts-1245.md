---
'dsfr-data': patch
---

`dsfr-data-map-inset` : neuf préréglages `territory` ne coupent plus leur territoire dans l'encart par défaut — suite du constat AM-102 du banc d'essai, qui avait recalé `la-reunion` et `wallis-et-futuna` en 0.45.0 ([#1245](https://github.com/bmatge/dsfr-data/issues/1245)).

Même méthode : emprise des communes (geo.api.gouv.fr) contre la carte réelle de l'encart par défaut (152 × 160 px), centre au milieu de l'emprise en projection Mercator, plus grand zoom entier où elle tient. Chacun débordait d'un niveau de zoom.

| Préréglage | Avant | Après |
|---|---|---|
| `guadeloupe` | `16.20,-61.45`, zoom 9 | `16.17,-61.41`, zoom 8 |
| `martinique` | `14.63,-61.00`, zoom 9 | `14.63,-61.02`, zoom 8 |
| `guyane` | `4.00,-53.10`, zoom 6 | `3.93,-53.11`, zoom 5 |
| `mayotte` | `-12.83,45.15`, zoom 10 | `-12.82,45.16`, zoom 9 |
| `saint-pierre-et-miquelon` | `46.95,-56.33`, zoom 9 | `46.95,-56.32`, zoom 8 |
| `saint-martin` | `18.08,-63.06`, zoom 11 | `18.086,-63.062`, zoom 10 |
| `saint-barthelemy` | `17.90,-62.83`, zoom 11 | `17.922,-62.858`, zoom 10 |
| `nouvelle-caledonie` | `-21.30,165.50`, zoom 6 | `-21.21,165.85`, zoom 5 |
| `corse` | `42.15,9.10`, zoom 7 | `42.19,9.05`, zoom 6 |

**Les encarts de pages existantes changent de cadrage** : un encart posé par `territory="…"` (ou par `insets="drom"`) sans `zoom` montre désormais le territoire entier, un niveau de zoom plus bas. Un `center` ou un `zoom` posé sur l'encart prime toujours : ces encarts-là ne bougent pas, et un `zoom="8"` posé pour contourner l'ancien cadrage de la Guadeloupe ou de la Martinique est devenu inutile.

`polynesie-francaise` garde son cadrage sur Tahiti et Moorea, par choix (arbitrage du 2026-10-04) : l'essentiel de la population, des îles lisibles dans 160 px — le territoire entier demanderait le zoom 3. C'est désormais écrit dans la documentation de `territory`.
