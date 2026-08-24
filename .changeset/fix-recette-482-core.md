---
'dsfr-data': patch
---

Fixes recette carto #482 (côté lib) :

- `dsfr-data-source` (mode URL) : l'enveloppe Grist `{ id, fields }` est
  désormais aplatie comme en mode adapter — les colonnes réelles redeviennent
  visibles pour l'aval (cartes, datalists, compagnons) [bug 1].
- `dsfr-data-map-layer` : une géométrie invalide n'interrompt plus le rendu de
  la couche (« Invalid GeoJSON object ») — ligne ignorée, comptée et résumée en
  console [bug 3].
- `dsfr-data-map-layer` (heatmap) : intensité normalisée (`max` = intensité
  maximale réelle, `maxZoom` = zoom courant) — la couche Chaleur était rendue
  quasi invisible (alpha ≈ 5 %) [bug 4].
- `dsfr-data-map-layer` : le groupe de clusters est retiré de la carte quand le
  clustering est désactivé (plus de bulles résiduelles après un changement de
  représentation), et les changements d'attributs visuels (type, couleur,
  rayon…) redessinent la couche en place [bug 6].
- `dsfr-data-map-layer` : nouvelle méthode `getRenderedCount()` — compte réel
  d'éléments dessinés (clusters et heatmap compris) pour les diagnostics
  [bug 7].
- `dsfr-data-map` : la carte observe désormais toute variation de taille de son
  conteneur et recale Leaflet (`invalidateSize`) — plus de bande de tuiles non
  chargées après un redimensionnement [bug 14].
