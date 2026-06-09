---
'dsfr-data': patch
---

Sécurité (#290) : le champ `_highlight` de `dsfr-data-search` échappe désormais le HTML des données sources avant d'insérer les balises `<mark>` (XSS via `{{{_highlight}}}` dans `dsfr-data-display`), et n'inclut plus que les champs qui matchent réellement le terme. Le rendu de template de `dsfr-data-display` se fait en une seule passe : une donnée contenant `{{x}}` est rendue littéralement au lieu d'être ré-interprétée comme placeholder.
