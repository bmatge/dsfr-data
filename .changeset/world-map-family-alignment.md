---
'dsfr-data': patch
---

`dsfr-data-world-map` alignée sur la famille carte (#299) : l'attribut `zoom` ('continent'|'none') devient `zoom-mode` — il collisionnait avec le `zoom` **numérique** Leaflet de `dsfr-data-map` (même nom, types opposés, même famille) ; l'ancien nom reste lu avec un warn de dépréciation. **Accessibilité clavier** : chaque pays est focusable (`tabindex`, `role`, `aria-label` nom + valeur annoncés au focus), Entrée/Espace déclenche le zoom continent — l'interaction était 100 % souris. Le TopoJSON (~140 Ko) n'est fetché qu'une fois par page (mémoïsation de la promesse — deux cartes simultanées le téléchargeaient deux fois). `code-field`/`value-field` manquants avec une `source` → `reportConfigError` (la carte restait grise en silence). Branche morte du render supprimée.
