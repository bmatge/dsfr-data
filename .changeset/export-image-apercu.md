---
'dsfr-data': minor
---

Export d'image PNG/JPG depuis les aperçus : bouton « Image » (menu PNG/JPG) dans le panneau d'aperçu des builders IA et classique, boutons dédiés dans le playground et le panneau des favoris. Capture du canvas de l'aperçu (direct ou dans l'iframe same-origin), composition sur fond blanc, nom de fichier dérivé du titre. Erreurs typées et expliquées : aperçu sans canvas (KPI/tableaux), canvas non capturable (tuiles de carte cross-origin). Pas d'export SVG : la chaîne de rendu (Chart.js) est raster — décision documentée dans le module.
