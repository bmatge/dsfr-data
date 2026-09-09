---
"dsfr-data": patch
---

`dsfr-data-chart` : sur les cartes (`map`, `map-reg`, `map-aca`, `map-monde`), un `name` écrit en JSON (`name='["Taux"]'`) affiche « Taux » au lieu du tableau littéral. La chaîne simple (`name="Taux"`) est la forme recommandée partout ; le JSON reste réservé au multi-séries (#653).
