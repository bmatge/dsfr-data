# La forme : les cas payés par le banc

> Ce que la reproduction de pages publiques avec `dsfr-data` a appris sur la forme : le graphique de 236 lignes, la barre d'écart qui cache les niveaux, la part qui se calcule, les trois points qui ne font pas une courbe, le combiné barres + courbe, le radar sans bornes, le rapport figé. La grille éditoriale (quelle relation, quelle forme, contraste, petits multiples, base 100) est dans [choisir-la-forme](choisir-la-forme.md) ; ce fichier en est la jurisprudence.
>
> Déclencheurs : forme trahit, trop de lignes, illisible, barre d'écart, part se calcule, trois points, bar-line, radar sans bornes, rapport figé, cas du banc
>
> Niveaux : intermédiaire (à la relecture d'un bloc), avancé

Pour la grille générale question → forme (magnitude, identité, polarité, part-au-tout, avant/
après) et la règle absolue du **double axe**, lire `references/choosing-a-form.md` du skill
`dataviz` ; pour la grille éditoriale ancrée `dsfr-data` (relation → forme → geste → ce qui
trahit), [choisir-la-forme](choisir-la-forme.md). Ici, les cas.

## Cas d'usage : 236 lignes, puis 103 graphiques

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

## Cas d'usage : deux barres plutôt qu'une barre d'écart

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

## Piège : une part se calcule, elle ne se dessine pas depuis n'importe quoi

- Une **répartition** (part des licences par type de commune) divise chaque groupe par le total
  de tous les groupes. Le geste (#926, AM-078) :
  `aggregate="lics:sum, lics__sum:share_percent:part"` sur la `dsfr-data-query` déjà posée —
  `share` rend la fraction, `share_percent` la part en points de pourcentage, la forme qu'attend
  un axe. Avant, il fallait une seconde source `limit="1"`, `compute="k = 1"` des deux côtés,
  `dsfr-data-join on="k"` et une division : quatre composants par répartition.
  **Le dénominateur est le total des lignes de sortie, avant `limit`** — donc une part est
  toujours une part de l'ensemble **filtré** (33,4 % sans filtre, 16,3 % en Bretagne : les deux
  sont justes, le dire en page), et un top N ne somme pas à 100 %. Sur une source tronquée
  (`max-records`), le total est faux sans que rien ne le montre : les parts somment quand même
  à 100 %. Et une part suppose une **partition** : après `explode`, une ligne multivaluée compte
  dans N groupes et le total dépasse 100 % — écrire « part des licences portant ce label »,
  pas « répartition ».
- Une part **en KPI** est un ratio de sommes filtré d'un seul côté :
  `value="lics:sum{sexe:eq:F} / lics:sum"` (0.29.0). Vérifié au navigateur le 2026-09-19
  (dsfr-data 0.30.0) : 9 597 / 30 056 → « 31,9 % ». Le `where` du KPI filtre les **deux** côtés
  et rend mécaniquement 100 % (AM-070) — ne pas l'employer pour une part.

## Piège : trois points ne font pas une courbe

Un `type="line"` dont les étiquettes ressemblent à des nombres (`2022`, `2023`, `2024`, même
passées en texte) est rendu par DSFR Chart sur un axe **linéaire** : graduations 2022,2, 2022,4…
entre deux années. Observé le 2026-09-19 (dsfr-data 0.30.0, DSFR Chart 2.1.1, trois points).
Avec des étiquettes `2024-01`… l'axe est catégoriel. Pour trois ou quatre millésimes : des
barres groupées (`type="bar"` + `series-field`), ou une courbe sur assez de points pour que
les graduations tombent sur des entiers (le portrait de fédération trace 2016-2024). C'est un
comportement de DSFR Chart (`line-chart`), à remonter chez `GouvernementFR/dsfr-chart`, pas
chez `dsfr-data`.

## Règle : le combiné barres + courbe est un cas, pas une habitude

`type="bar-line"` (`value-field` en barres, `value-field-2` en courbe, `unit-tooltip` et
`unit-tooltip-bar`) a servi au banc à mettre les signalements déposés face aux réponses
obtenues, par année (AV-017, Signal Conso). Le skill `dataviz` classe le double axe premier des
anti-patterns : deux mesures d'échelles différentes → deux graphiques, petits multiples, ou
**base 100**. Le portrait de fédération suit cette règle sans effort parce que le producteur
publie déjà l'indice (`lics_100_2016`) : trois courbes sur la même échelle, `series-field`.
Réserver `bar-line` au cas volume + taux **sur le même axe temporel**, avec les deux unités
nommées dans les infobulles, et préférer l'indice dès qu'il existe dans le jeu.

## Piège : le centre du radar ment sans bornes

« Sans bornes, le centre du radar = minimum des données, ce qui est trompeur » (JSDoc de
`y-min` / `y-max`, skill `dsfr-data`, `chartTypes`). Un radar de scores sur 100 se pose avec
`y-min="0" y-max="100"`. Même règle pour une courbe de taux : `y-min="0"` fixe la base.

## Règle : rapport figé ou explorateur

La page d'origine du Baromètre codait en dur les millésimes qu'elle illustrait — d'où trois
jeux « [Old] » de 2020, 2021, 2022. L'explorateur du banc lit la table de calcul, qui couvre
2020-2025 : il ne vieillit pas (AV-016). Quand la question est « où en est-on ? », préférer
la forme qui se met à jour seule (`order-by` sur la date, `databox-date-field`) à celle qui
recopie une valeur.
