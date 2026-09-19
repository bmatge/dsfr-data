# La forme sert la question — ou la trahit

> Une part n'est pas une évolution, un écart n'est pas un niveau, un classement n'est pas une distribution : quel type `dsfr-data-chart` (ou pas de graphique) pour quelle question, avec les cas du banc.
>
> Déclencheurs : quel graphique choisir, quelle forme, forme trahit, part ou évolution, écart ou niveau, camembert, courbe, barres, carte ou tableau, petits multiples, un graphique par question, trop de lignes, illisible, podium, KPI ou graphique

Pour la grille générale question → forme (magnitude, identité, polarité, part-au-tout, avant/
après) et la règle absolue du **double axe** (« jamais deux échelles Y sur un même graphique »),
lire `references/choosing-a-form.md` du skill `dataviz`. Ce fichier ne garde que ce que le banc
a appris en reproduisant des pages publiques avec `dsfr-data`.

## La question d'abord, le type ensuite

| Le lecteur doit… | Forme | Geste `dsfr-data` | Ce qui la trahit |
|---|---|---|---|
| lire **un** chiffre | KPI, pas un graphique à une barre | `dsfr-data-kpi value= format= label=` | un `type="bar"` sur une ligne |
| comparer des **niveaux** entre catégories | barres (horizontales si libellés longs) | `type="bar" horizontal` | un camembert (les angles ne se comparent pas) |
| lire une **part d'un tout** | camembert ≤ 5-7 parts, ou barres empilées | `type="pie"`, `type="bar" stacked` | des parts qui ne somment pas à 100 (groupe null écarté sans le dire) |
| suivre une **évolution** | courbe | `type="line"` | des barres par année quand il y a 30 ans ; une courbe sur 3 points (voir « Trois points ») |
| lire un **écart** à une référence | deux barres côte à côte, ou barre divergente **avec** les niveaux à portée | `type="bar"` deux séries ; `reference-lines` | une barre d'écart seule : −8,8 pt se lit pareil qu'on parte de 37 % ou de 8 % |
| situer **son** territoire | carte choroplèthe d'un **taux** | `type="map"` + `map-summary-weight` | une choroplèthe de volumes (Paris gagne toujours ; résumé sans sens, AM-079) |
| lire un **classement** | podium / barres triées | `dsfr-data-podium`, `order-by="x:desc" limit` | un camembert à 15 parts |
| lire **plus de ~7 classes** qui comptent toutes | tableau | `dsfr-data-list columns= sort=` | un graphique à 19 séries |
| comparer **N questions** | un graphique par question | motif « un composant par ligne » (`dsfr-data-display` + gabarit) | un graphique de 236 lignes |

## Le cas d'école : 236 lignes, puis 103 graphiques

La reproduction du Baromètre France Num a d'abord tenté un graphique par chapitre : **236
lignes** dans un seul `dsfr-data-chart`, illisible, avec des libellés rognés par la gauche par
DSFR Chart (revue au navigateur, PR #32 du banc). Le diagnostic « limite de DSFR Chart » était
faux : c'était un **mauvais découpage**. L'original obtient ~119 graphiques par `ng-repeat` ; le
banc l'avait classé impossible (LIM-004) sans chercher la voie native. La voie native existe : le
gabarit d'un `dsfr-data-display` peut contenir des composants `dsfr-data-*`, une
`dsfr-data-query id="q-{{code}}" where="code:eq:{{code}}"` par ligne scope une source chargée
une fois, `type="{{champ}}"` choisit le type (skill `dsfr-data`, `attributeGrammars` § « Un
graphique par ligne »). Résultat : **103 graphiques, toujours 9 requêtes**, et le libellé de
l'axe devient la réponse seule — le rognage disparaît avec le découpage (PR #34).

Règle : quand un graphique dépasse ~15 barres ou ~6 courbes, ce n'est pas la bibliothèque qu'il
faut forcer, c'est la question qu'il faut découper. Limites du motif, écrites au JSDoc :
pas d'imbrication, recréation des instances à chaque émission de la source répétée (ADR-135).

## Deux barres plutôt qu'une barre d'écart

La refonte du Baromètre compare un profil (région × secteur × taille) à la France sur chaque
question. Une barre divergente centrée sur l'écart met en avant la différence et **cache les
niveaux**. Le graphique montre les deux valeurs :

```html
<dsfr-data-chart type="bar" horizontal source="apparie"
  label-field="libelle_reponse" value-field="score_nat:France entière" value-field-2="score_prof:Profil filtré"
  color-map="France entière:#413592,Profil filtré:#e1000f" unit-tooltip="%"></dsfr-data-chart>
```

On voit l'écart *et* ce sur quoi il porte. Prix payé et écrit en page : DSFR Chart colore des
*séries*, pas des barres individuelles — le sens de chaque question ne pilote plus la couleur
(voir [sens-des-variations](sens-des-variations.md)).

## Une part se calcule, elle ne se dessine pas depuis n'importe quoi

- Une **répartition** (part des licences par type de commune) divise chaque groupe par le total
  de tous les groupes. Aucun agrégat ne produit ce total à côté des lignes groupées (AM-078,
  ouvert en 0.30) : la voie qui marche coûte une seconde source `limit="1"`, `compute="k = 1"`
  des deux côtés, `dsfr-data-join on="k"`, puis `compute="part = l / lt * 100"`. Quatre
  composants par répartition — le dire plutôt que remplacer la part par un `avg`.
- Une part **en KPI** est un ratio de sommes filtré d'un seul côté :
  `value="lics:sum{sexe:eq:F} / lics:sum"` (0.29.0). Vérifié au navigateur le 2026-09-19
  (dsfr-data 0.30.0) : 9 597 / 30 056 → « 31,9 % ». Le `where` du KPI filtre les **deux** côtés
  et rend mécaniquement 100 % (AM-070) — ne pas l'employer pour une part.

## Trois points ne font pas une courbe

Un `type="line"` dont les étiquettes ressemblent à des nombres (`2022`, `2023`, `2024`, même
passées en texte) est rendu par DSFR Chart sur un axe **linéaire** : graduations 2022,2, 2022,4…
entre deux années. Observé le 2026-09-19 (dsfr-data 0.30.0, DSFR Chart 2.1.1, trois points).
Avec des étiquettes `2024-01`… l'axe est catégoriel. Pour trois ou quatre millésimes : des
barres groupées (`type="bar"` + `series-field`), ou une courbe sur assez de points pour que
les graduations tombent sur des entiers (le portrait de fédération trace 2016-2024). C'est un
comportement de DSFR Chart (`line-chart`), à remonter chez `GouvernementFR/dsfr-chart`, pas
chez `dsfr-data`.

## Le combiné barres + courbe : un cas, pas une habitude

`type="bar-line"` (`value-field` en barres, `value-field-2` en courbe, `unit-tooltip` et
`unit-tooltip-bar`) a servi au banc à mettre les signalements déposés face aux réponses
obtenues, par année (AV-017, Signal Conso). Le skill `dataviz` classe le double axe premier des
anti-patterns : deux mesures d'échelles différentes → deux graphiques, petits multiples, ou
**base 100**. Le portrait de fédération suit cette règle sans effort parce que le producteur
publie déjà l'indice (`lics_100_2016`) : trois courbes sur la même échelle, `series-field`.
Réserver `bar-line` au cas volume + taux **sur le même axe temporel**, avec les deux unités
nommées dans les infobulles, et préférer l'indice dès qu'il existe dans le jeu.

## Radar : le centre ment sans bornes

« Sans bornes, le centre du radar = minimum des données, ce qui est trompeur » (JSDoc de
`y-min` / `y-max`, skill `dsfr-data`, `chartTypes`). Un radar de scores sur 100 se pose avec
`y-min="0" y-max="100"`. Même règle pour une courbe de taux : `y-min="0"` fixe la base.

## Rapport figé ou explorateur

La page d'origine du Baromètre codait en dur les millésimes qu'elle illustrait — d'où trois
jeux « [Old] » de 2020, 2021, 2022. L'explorateur du banc lit la table de calcul, qui couvre
2020-2025 : il ne vieillit pas (AV-016). Quand la question est « où en est-on ? », préférer
la forme qui se met à jour seule (`order-by` sur la date, `databox-date-field`) à celle qui
recopie une valeur.
