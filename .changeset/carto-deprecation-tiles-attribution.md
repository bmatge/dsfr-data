---
'dsfr-data': minor
---

Carte : dépréciation des fonds CARTO, attribution des fonds personnalisés et politique de referrer explicite (#576)

- Les presets `carto-positron` et `carto-dark` sont **dépréciés** et résolvent vers `ign-plan`
  avec un avertissement console. CARTO exige désormais une clé API sur ses basemaps et incruste
  un filigrane « API KEY REQUIRED » dans les tuiles servies sans clé — en HTTP 200, donc sans
  erreur détectable au runtime. La clé étant nominative et le service raster en cours de retrait
  chez CARTO, aucun mécanisme de clé côté bibliothèque n'aurait de sens. Les cartes déjà publiées
  qui chargent une version flottante du CDN sont réparées automatiquement.
- Nouvel attribut **`tiles-attribution`** sur `<dsfr-data-map>` : une URL de tuiles personnalisée
  recevait jusqu'ici une attribution vide, ce qui rendait la carte non conforme à l'ODbL et aux
  CGU des fournisseurs. Un `console.warn` signale désormais son absence.
- La **`referrerPolicy`** des tuiles est fixée explicitement à `strict-origin-when-cross-origin`.
  Leaflet n'en pose aucune par défaut : c'était la politique de la page hôte qui s'appliquait, et
  une page en `Referrer-Policy: no-referrer` supprimait l'en-tête `Referer` — ce que la Tile Usage
  Policy de l'OSMF interdit nommément, et ce dont les fournisseurs à quota se servent pour
  identifier le domaine appelant.
