---
"dsfr-data": patch
---

Couche carte en mode `bbox` : la commande `in_bbox` du viewport initial est émise dès que la carte est prête, sans attendre un déplacement de l'utilisateur ; le premier fetch de la source reste non filtré (poser `limit`/`where` sur la source pour un gros jeu) (#652).
