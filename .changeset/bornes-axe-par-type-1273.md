---
'dsfr-data': patch
---

Bornes d'axe de `dsfr-data-chart` (#1273) : pour chaque couple attribut × type, `x-min`, `x-max`, `y-min` et `y-max` agissent ou sont signalés — plus jamais ignorés en silence, plus jamais posés à contresens. Aucun attribut nouveau.

**Ce qui était faux.** Les quatre attributs étaient relayés tels quels à DSFR Chart, qui les pose en bornes « suggérées » sur l'échelle du même nom. Mesuré dans un navigateur : sur un axe d'étiquettes, la borne devenait une **catégorie fantôme** (« 5 » et « 40 » ajoutés aux étiquettes) ; un `bar-line` ne lisait ni `y-min` ni `y-max` ; et une borne suggérée était arrondie à la graduation voisine (`y-min="5"` rendait un axe partant de 0).

**La règle, désormais.**

- `y-min` / `y-max` bornent l'axe des **valeurs**, où qu'il soit dessiné : axe vertical de `line`, `scatter` et `bar`, axe horizontal de barres horizontales (`type="bar" horizontal`), axe des barres (à gauche) d'un `bar-line`, échelle radiale d'un `radar` (inchangée).
- `x-min` / `x-max` bornent l'axe **horizontal** quand il porte des nombres : `scatter` et `line` à étiquettes numériques (années, mesures), et barres horizontales, où c'est l'axe des valeurs (`x-*` y l'emporte sur `y-*` si les deux sont écrits).
- Une borne retenue est posée **exactement** : `y-min="5"` sur une courbe donne un axe qui part de 5, `y-max="37"` un axe qui s'arrête à 37.
- Une borne **ne masque jamais une donnée** (hors radar) : un minimum au-dessus de la plus petite valeur, un maximum en dessous de la plus grande (du plus grand cumul pour des barres empilées) sont ignorés, avec un avertissement console qui nomme la valeur.
- **Des barres partent de zéro** (`bar`, `bar-line`) : un minimum positif y est ignoré et signalé — tronquer l'axe fausserait la comparaison des longueurs. Seul un minimum négatif ou nul agit.
- Sur un axe d'étiquettes (`x-*` sur `bar` vertical, `bar-line`, `line` ou `scatter` à étiquettes texte), sur `radar` (`x-*`) et sur les types sans axe (`pie`, `gauge`, cartes), l'attribut est sans effet : il n'est plus relayé, et un avertissement console unique le dit en nommant l'attribut, le type et, quand il existe, l'attribut qui agit à sa place.

**Ce qui change pour une page existante.**

- Barres horizontales avec `y-min` / `y-max` : les deux catégories fantômes disparaissent de l'axe des étiquettes, et la borne s'applique à l'axe des valeurs (un `y-max="100"` y donne enfin un axe de 0 à 100). C'est une correction.
- `bar-line` avec `y-min` / `y-max` : la borne, jusqu'ici sans effet, s'applique à l'axe des barres. L'axe de la ligne suit toujours ses cibles (`targets`), y compris quand `y-max` est posé.
- `bar`, `bar-line`, `line` ou `scatter` à étiquettes texte avec `x-min` / `x-max` : les catégories fantômes disparaissent ; un avertissement console apparaît.
- Courbe, nuage ou barres dont la borne tombait hors graduation : l'axe passe de la graduation arrondie à la borne écrite (`y-min="5"` : de 0 à 5 ; `y-min="-7"` : de -20 ou -10 à -7 ; `y-max="37"` : de 40 à 37). Une borne déjà ronde (`y-min="0" y-max="100"`) ne bouge pas.
- Une borne qui était ignorée parce qu'elle aurait masqué une donnée (`y-min="20"` sous une série qui descend à 12, `y-max="25"` sous une série qui monte à 33), ou parce que des barres partent de zéro (`y-min="5"` sur `bar`), reste ignorée : le graphique ne change pas, un avertissement console apparaît.
- `pie`, `gauge`, cartes et `radar` (`x-*`) portant une de ces bornes : rien ne change à l'écran, un avertissement console apparaît.

Aussi : un repère (`reference-lines`) ou une cible (`targets`) se place sur l'échelle bornée ; une borne non numérique (`y-min="abc"`) est signalée ; le guide des skills corrige l'attribution inversée de `unit-tooltip` (ligne) et `unit-tooltip-bar` (barres) sur un `bar-line`.
