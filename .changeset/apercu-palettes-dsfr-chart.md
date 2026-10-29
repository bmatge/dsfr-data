---
'dsfr-data': patch
---

Les palettes décrites dans le Builder, le Studio et la documentation sont celles que DSFR Chart applique vraiment (retour usager sur les palettes).

- L'aperçu des palettes du Builder (pastilles sous le sélecteur) montre les couleurs de `@gouvfr/dsfr-chart` 2.1.1 au lieu de teintes inventées : « distinctes par série » en compte huit, surtout bleues et violettes, et non dix couleurs contrastées. Un test relit le paquet installé et échoue si ses couleurs changent. Pour un podium, les pastilles montrent la rampe que le podium dessine lui-même.
- Les libellés disent ce que fait DSFR Chart : « Couleur unique (bleu) » remplace « Bleu France » (la couleur est `#5C68E5`, pas `#000091`) ; « Couleurs distinctes par série » remplace « par catégorie » (une série seule reste d'une seule couleur) ; « Vert → rouge (4 tons) » remplace « Bicolore (centre clair) », qui n'existait pas ; « Gris neutre (mise en avant) » remplace « Tons neutres ».
- L'aide du Builder, la fiche skill « Couleurs DSFR » lue par le Studio, la référence de `dsfr-data-chart` et la page de specs précisent le sens des dégradés (avec clair → foncé, la plus grande valeur est la plus claire) et que `highlight-index` n'agit qu'avec `selected-palette="neutral"`.
- Dashboard : la palette « Divergente » émettait `selected-palette="divergent"`, nom inconnu de DSFR Chart qui retombait sur les couleurs catégorielles. Elle émet `divergentAscending` ; les dashboards enregistrés avec l'ancien nom sont relus avec le nouveau.
- `PALETTE_PRIMARY_COLOR` est dérivée de la première couleur de chaque palette.
- `CHOROPLETH_SCALES.categorical` (podium, cartes Leaflet) garde ses dix couleurs contrastées, distinctes de celles de DSFR Chart.

Pour plus de contraste entre les séries d'un graphique (courbes multiples notamment), fixer les couleurs avec `color-map`.
