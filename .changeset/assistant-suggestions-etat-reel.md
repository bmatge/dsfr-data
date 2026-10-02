---
'dsfr-data': patch
---

Assistant contextuel (`mountAssistant`, apps de travail) : les suggestions de l'état vide sont relues à l'ouverture du panneau et avec les constats, au lieu d'être figées au montage — une source chargée après coup laissait « Choisir la source » à l'écran ([#1177](https://github.com/bmatge/dsfr-data/issues/1177)). Nouvelle méthode `rafraichirSuggestions()` sur l'assistant monté.
