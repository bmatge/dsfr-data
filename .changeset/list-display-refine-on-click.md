---
"dsfr-data": minor
---

`refine-on-click` (et son `context`) arrive sur `dsfr-data-list` et `dsfr-data-display` : cliquer une ligne ou une carte pose un filtre `eq` qui filtre les autres vues du contexte, avec tag et URL — le motif maître-détail ne demande plus de partir d'une carte. Le geste est accessible par construction : un vrai bouton par ligne, atteignable au clavier, dont l'état est annoncé (`aria-pressed`, `aria-current`) et dit par son libellé, jamais par la seule couleur (#734).
