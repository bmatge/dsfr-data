---
'dsfr-data': patch
---

Studio IA et Tableau de bord : une couche de carte peut regrouper ses lignes par entité (`groupField`, écrit en `group-field` : un marqueur par ville, le clic liste toutes les lignes du groupe ; couches marker, circle et geoshape, refusé sur heatmap). Le gabarit de popup rédigé par l'assistant (`popupTemplate`) est désormais filtré à l'export : éléments script, iframe, object, embed, style et template, attributs `on*` et URL `javascript:`, `vbscript:` ou `data:` retirés, le reste inchangé (#1109).
