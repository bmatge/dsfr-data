---
'dsfr-data': minor
---

Assistant contextuel (#1011) : `mountAssistant()` monte le panneau `app-assistant` dans une app. La correspondance sans modèle passe toujours en premier (`trouverRepere` puis `montrer()`). Le modèle, injecté par l'app via `repondre()`, ne sert qu'en secours quand rien ne correspond : le guidage fonctionne donc sans clé. Le panneau affiche aussi le résumé des constats avec « Me montrer » et la bascule « Dire » / « Guider », mémorisée dans `TourState`. Le bouton « Assistant » s'ajoute dans `app-action-bar`.
