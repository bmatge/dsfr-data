---
'dsfr-data': minor
---

dsfr-data-chart : lignes de référence (verticale/horizontale) avec libellé (#341).

- Nouvel attribut `reference-lines` (JSON) : superpose des repères sur les
  graphiques **cartésiens** (line, bar, bar-line, scatter). Chaque item :
  `{ axis: "x"|"y", value, label?, color?, dash?, position? }`. `axis:"x"` trace
  une ligne **verticale** à une catégorie/date ; `axis:"y"` une ligne
  **horizontale** à un seuil. Couleur par défaut rouge DSFR, pointillé par
  défaut, libellé en pastille.
- Rendu via un **overlay SVG** dans le wrapper du chart (`pointer-events:none`,
  `aria-hidden`), positionné depuis l'instance Chart.js de `@gouvfr/dsfr-chart`
  (récupérée en interne, sans fork de la lib tierce). Repositionnement au resize
  (`ResizeObserver`), nettoyage au démontage.
- Accessibilité : les repères sont relayés dans l'`aria-label` du graphique.
- Types non cartésiens (pie, gauge, radar, map…) ou JSON invalide : signalés via
  `data-dsfr-config-error`, le rendu du graphique reste intact (dégradation
  gracieuse si l'instance Chart.js est introuvable).
