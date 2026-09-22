# Choisir la forme qui raconte

> La forme suit la relation que le message affirme — comparaison, classement, évolution, distribution, part, écart, corrélation, géographie, flux — et le contraste est son moteur : une série mise en évidence, le reste grisé. Petits multiples, base 100, avant/après, pente, barres triées, taux plutôt que volume, absolu et relatif, échelle humaine, KPI seul ou accompagné, et les cas où un tableau, un texte ou rien du tout battent le graphique. Pour chaque forme : ce que `dsfr-data` sait faire, et ce qu'il ne sait pas.
>
> Déclencheurs : choisir la forme, quelle forme, quel graphique choisir, relation à montrer, comparaison, classement, distribution, corrélation, flux, mise en évidence, mettre en évidence, focus et contexte, contraste, griser le reste, petits multiples, base 100, indice base 100, avant après, courbe de pente, slope chart, barres triées, taux plutôt que volume, absolu et relatif, échelle humaine, pour 1 000 habitants, KPI ou graphique, tableau plutôt que graphique, texte plutôt que graphique, ne rien montrer, ce que dsfr-data ne sait pas faire
>
> Niveaux : base (§ table des relations, via niveau-base), intermédiaire (§ contraste, § petits multiples, § KPI), avancé (tout)

## La relation d'abord, le type ensuite

| Le message affirme… | Forme qui raconte | Geste `dsfr-data` vérifié | Ce qui trahit |
|---|---|---|---|
| **un** chiffre | KPI | `dsfr-data-kpi value= format= heading= label=` | une barre seule |
| une **comparaison** de niveaux | barres triées, horizontales si libellés longs | `order-by="v:desc"` + `type="bar" horizontal` | ordre alphabétique ; camembert |
| un **classement** | podium (≤ 10) ou barres triées | `dsfr-data-podium max-items="5" rank="medal"` ; `layout="podium"` pour l'estrade | un camembert à quinze parts |
| une **évolution** | courbe (≥ 5 points), barres si 3-4 millésimes | `type="line" y-min="0"` ; `type="bar" series-field="annee"` | trois points sur un axe linéaire ; barres par année sur 30 ans |
| une **distribution** (combien sont petits, moyens, grands) | barres par tranche | `dsfr-data-normalize compute="tranche = when v < 10 then 'Moins de 10' when v < 100 then '10 à 99' else '100 et plus'"` puis `group-by="tranche"` ; pas d'histogramme natif | une moyenne seule ; une courbe |
| une **part** d'un tout | anneau ≤ 5-7 parts, barres empilées, ou une phrase | `aggregate="v:sum, v__sum:share_percent:part"` ; `type="pie"` / `type="bar" stacked` | parts hors partition (après `explode`) ; groupe null écarté |
| un **écart** à une référence | deux barres côte à côte + ligne de référence, ou l'écart calculé **avec** les niveaux à portée | `value-field="v_nat:France" value-field-2="v_prof:Profil"` ; `reference-lines='[{"axis":"y","value":71.2,"label":"France : 71,2 %"}]'` | une barre d'écart seule ([forme-cas-du-banc](forme-cas-du-banc.md)) |
| une **corrélation** | nuage de points | `type="scatter" label-field="x" value-field="y"` | deux courbes sur deux axes |
| une **géographie** d'un taux | choroplèthe | `type="map" code-field value-field map-summary="weighted"` ; Leaflet : `dsfr-data-map-layer type="geoshape" fill-field classes="5" method="quantile"` | choroplèthe d'un volume |
| une **géographie** d'un volume | cercles proportionnels | `dsfr-data-map-layer type="circle" radius-field="v" radius-min="4" radius-max="30"` | choroplèthe (Paris gagne toujours) |
| un **flux** (d'où vers où) | tableau croisé, barres empilées par origine | `dsfr-data-pivot row="origine" column="destination" value="n"` ; pas de sankey | rien de natif : le dire |
| **N questions** de même forme | un graphique par question | motif « un composant par ligne » (`dsfr-data-display` + gabarit) | un graphique de 236 lignes |

Double axe : jamais (skill `dataviz`). `bar-line` se réserve au volume + taux sur le même axe
temporel, unités nommées.

## Le contraste : une série mise en évidence, le reste grisé

Sept couleurs de même poids demandent au lecteur de lire la légende sept fois. Le graphique
raconte quand **une** série porte la couleur et les autres le contexte.

| Situation | Geste | Attention |
|---|---|---|
| **une barre** parmi N (le territoire du lecteur, la valeur record) | `selected-palette="neutral" highlight-index="[0]"` | l'index est **positionnel** : trier (`order-by`) avant, et poser l'index sur la position triée ; un filtre qui change l'ordre déplace la mise en évidence |
| **une série** nommée parmi plusieurs courbes ou groupes de barres | `color-map="Fédération:#000091,Groupe:#929292,Toutes:#cecece"` (nom de série **exact**, accents compris) | vérifié sur les noms de série ; la légende suit depuis 0.29.0 (BUG-016) |
| la référence (France, objectif) | `reference-lines` (ligne, sans couleur de série) | invisible sous `databox` en 0.30.0 ([annotation](annotation.md)) |
| l'entité choisie par le lecteur | le titre la reprend (`dsfr-data-context-value`), la série porte son nom | pas de mise en évidence dynamique par la couleur : `color-map` est statique |

Le gris est une couleur DSFR (`#929292`, `#cecece`) et le contraste ne dispense pas de la légende.

## Petits multiples : un graphique par question, même échelle

Quand la nuance est « pas partout » ou « pas pour tous », un graphique par territoire, par
question, par catégorie — petits, identiques, alignés — bat un graphique à douze séries. Le
motif est natif (`dsfr-data-display` répète un `dsfr-data-chart` par ligne, une
`dsfr-data-query id="q-{{code}}" where="code:eq:{{code}}"` par instance) : 103 graphiques pour
9 requêtes sur le Baromètre.

Trois règles : **même échelle** sur tous (`y-min="0" y-max="100"` posés explicitement — rien ne
synchronise les axes entre instances), **même ordre** de catégories (l'ordre source est conservé
sans `order-by`), **douze au plus** par écran. Le `<p role="status">N résultats</p>` que le
display ajoute est un contresens sur un rapport (ADR-135) : le dire en page.

## Base 100, avant/après, pente

- **Base 100** : quand deux séries d'échelles différentes doivent se comparer dans le temps.
  Préférer l'indice **publié** par le producteur (`lics_100_2016`, trois courbes sur une
  échelle). Sinon, la composition à trois balises : une query sur l'année de base
  (`where="annee:eq:2016" group-by="serie"`), une jointure sur la clé de série
  (`dsfr-data-join on="serie"`), puis `compute="indice = round(v / v_base * 100, 1)"`. Chaque
  brique est vérifiée séparément ; la chaîne complète ne l'a pas été au banc — la tester au
  navigateur. Le titre dit la base : « Indice, 2016 = 100 ».
- **Avant/après** (deux dates) : barres groupées `type="bar" series-field="annee"`, ou un KPI
  avec sa tendance `lines='[{"value":"v:evolution","sign":true,"suffix":"entre 2016 et 2024"}]'`
  (source ordonnée par `order-by="annee:asc"`).
- **Pente** (slope chart, deux dates × N catégories) : pas de type natif. Approcher par barres
  groupées triées sur l'écart (`compute="ecart = v_2024 - v_2016"` après `dsfr-data-pivot
  row="categorie" column="annee" column-format="v_{value}" value="v"`, puis `order-by="ecart:desc"`) — ou par un tableau
  de trois colonnes, qui dit la même chose.

## Taux plutôt que volume, absolu et relatif, échelle humaine

- **Comparer des territoires** se fait en taux : licences pour 1 000 habitants, pas licences.
  Le motif agréger → joindre → diviser (skill `dsfr-data`, fiche `dsfr-data-join`) :
  `compute="pour_mille = round(n / pop * 1000, 1)"`. Une choroplèthe de volumes dessine la
  carte de la population.
- **Absolu ET relatif quand l'enjeu l'exige** : « 31,9 % » et « 9 597 femmes sur 30 056 » ne
  disent pas la même chose à un dirigeant de club. Le KPI de la part porte le total en ligne
  secondaire (`value="lics:sum{sexe:eq:F} / lics:sum" format="pourcentage"
  lines='[{"value":"lics:sum","suffix":"licences au total"}]'`), et l'effectif féminin est un
  second KPI filtré (`value="lics:sum" where="sexe:eq:F"`).
- **Échelle humaine** : « une licenciée sur trois » se lit mieux que 31,9 % ; « 4,5 pour 1 000
  habitants » mieux que 0,45 %. Le calcul est un `compute` (`un_sur = round(1 / part)`), le rendu
  un gabarit (`{{un_sur}}`), jamais un littéral.

## KPI seul, KPI + tendance, KPI + comparaison

| Le lecteur doit… | Forme | Geste |
|---|---|---|
| lire le niveau | KPI seul | `value="lics:sum" format="compact" heading="Licences 2024"` |
| savoir si ça monte | KPI + tendance | `lines='[{"value":"lics:evolution","sign":true,"suffix":"depuis 2016"}]'` — couleur explicite si monter est défavorable ([sens-des-variations](sens-des-variations.md)) |
| se situer | KPI + référence | `lines='[{"text":"France : 22,1 %"}]'` quand la référence vient d'un autre jeu ; `description` est lu par les lecteurs d'écran seulement |
| trois de ces choses à la fois | un graphique | le KPI qui porte trois lignes est un graphique qui s'ignore |

## Quand un tableau, un texte ou rien battent le graphique

- **Le tableau** gagne quand le lecteur cherche *sa* ligne, quand plus de sept catégories
  comptent toutes, quand deux unités cohabitent (effectif et taux), quand la précision compte
  (un prix au litre à trois décimales). `dsfr-data-list columns="dep:Département,
  n:Licences, taux:Pour 1 000 hab." sort="taux:desc" count-label="département" caption="…"`.
- **Le texte** gagne quand le message tient en une phrase et que le graphique la répéterait
  (« 31,9 % de femmes ») ; quand il y a deux chiffres (« 75,8 % contre 71,2 % ») ; quand le
  chiffre exige sa nuance dans la même ligne. La phrase se **calcule** dans la donnée
  ([annotation](annotation.md)).
- **Rien** gagne quand le jeu ne porte pas la règle de calcul (balances comptables, LIM-007),
  quand l'échantillon fond sous les filtres, quand le jeu est vide (LIM-005), quand la
  différence est dans la marge. Un `require-where` + `idle-message`, ou un paragraphe qui dit
  pourquoi, valent mieux qu'une courbe qui a l'air d'un chiffre officiel.

## Pièges : ce que `dsfr-data` ne sait pas faire, et comment approcher

| Souhait | État | Approche |
|---|---|---|
| courbe de pente (slope) | pas de type | barres groupées triées sur l'écart, ou tableau |
| histogramme | pas de type | `compute` par tranches puis `type="bar"` |
| échelle logarithmique | absente de DSFR Chart (AM-063) | tableau trié, podium, ou normalisation « pour 10 000 » |
| sankey, chord, flux | absents | tableau croisé (`dsfr-data-pivot`), barres empilées |
| annoter un point précis | seulement `reference-lines` (`axis:"x"` à une date) et `targets` | la phrase de lecture porte l'annotation |
| axes synchronisés entre petits multiples | rien d'automatique | `y-min` / `y-max` explicites |
| sparkline dans un KPI | absente | un KPI + un petit `type="line"` à côté, ou `lines` |
| filtrer en cliquant sur un graphique | aucun événement de clic sur `dsfr-data-chart` | `dsfr-data-facets`, `refine-on-click` sur une couche de carte ou une ligne de tableau |
| hauteur d'un graphique | pas d'attribut | largeur de colonne, ou CSS sur `.dsfr-data-chart__wrapper` |
| couleur par barre selon le signe | DSFR Chart colore des séries | deux séries (positif / négatif) ou le sens dans le texte |
| heatmap de tableau | pas de composant | `dsfr-data-list cell-class` piloté par une colonne `compute` de tranche — à vérifier au navigateur avant de promettre |

Avant d'écrire « impossible » : natif / natif mais postérieur à la version chargée / sur `main`
non publié / absent du source — quatre verdicts, jamais un seul (ADR-109 du banc).
