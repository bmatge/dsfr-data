# Le sens des variations

> Au-dessus de la moyenne n'est pas toujours une bonne nouvelle : lire le sens dans le jeu quand il le porte, le déclarer sinon, et ne jamais laisser une couleur automatique juger à la place du lecteur.
>
> Déclencheurs : sens de la variation, bonne nouvelle, favorable, défavorable, sens_de_l_augmentation, seuil, threshold, tendance, flèche, vert rouge, couleur du signe, palette divergente, écart à la moyenne, cumul qui décroît, légende qui ment
>
> Niveaux : intermédiaire, avancé

## Le jeu peut porter le sens : le lire

La table de correspondance du Baromètre France Num (`bfn-table-de-correspondance`, 119
questions) porte un champ `sens_de_l_augmentation` : **97 questions où monter est favorable, 5
où c'est défavorable, 17 neutres**. Colorer « au-dessus de la France = vert » aurait félicité un
territoire de trouver que « le numérique me fait perdre du temps » plus que la moyenne. Les 17
neutres (type d'activité, ancienneté…) restent **grises** : leur écart est un fait, pas une
performance.

Geste (refonte du Baromètre, `viz/barometre-france-num-v2.html`) — le ton se calcule dans la
donnée, sans script, en croisant le signe et le sens :

```html
<dsfr-data-source id="corr" … select="code_unifie, libelle_unifie, sens_de_l_augmentation, …">
<dsfr-data-join id="apparie-lib" left="apparie" right="corr" on="code_unifie" type="left">
<dsfr-data-normalize id="ecarts" source="apparie-lib" numeric="score_nat, score_prof"
  compute="ecart = score_prof - score_nat;
           ecart_txt = replace(concat(when score_prof >= score_nat then '+' else '−', abs(round(score_prof - score_nat, 1))), '.', ',')">
```

Puis le sens sert **le texte** (libellé signé, phrase de lecture, tableau équivalent) — et pas
la couleur des barres : DSFR Chart colore des **séries**, pas des barres individuelles. La page
l'écrit dans ses hypothèses (« on perd une nuance pour gagner un composant conforme, accessible,
exportable et infobullé — c'est un arbitrage assumé, pas un oubli »). Chercher d'abord si le jeu
porte un champ de sens ; sinon, le déclarer dans un `compute` ou une source inline, et le dire.

## Une couleur automatique juge le signe, pas le sens

- `lines='[{"value":"evol:avg","sign":true,"color":"auto"}]'` sur un KPI : `auto` = **vert si
  ≥ 0, rouge si < 0**. Vérifié au navigateur le 2026-09-19 (dsfr-data 0.30.0) : « +210 % depuis
  janvier » de *temps perdu déclaré* rendu en vert DSFR (`rgb(24,117,60)`). Sur un indicateur où
  monter est défavorable, poser la couleur explicitement (`"color":"error"` ou un token DSFR), ou
  pas de couleur.
- `threshold-green` / `threshold-orange` d'un KPI : « au-dessus = vert » suppose que plus est
  mieux. Ne les poser que sur un indicateur dont le sens est établi (taux de conformité, oui ;
  délai, non — inverser les seuils n'est pas possible, donc pas de seuils).
- `trend="champ:evolution"` rend ↑ / ↓ : une flèche n'est pas un jugement, mais elle est colorée
  (succès / erreur). Même règle.
- Un **écart à une référence** se colore avec une palette **divergente** (`selected-palette=
  "divergentAscending"`, deux pôles + neutre), jamais avec la catégorielle ; et le sens de la
  divergence (quel pôle est « bien ») se dit en légende ou en titre.

## Une variation qui ne devrait pas exister est une information

Le tableau de bord TNE (`fr-en-tne_suivi_audiences`) publie des compteurs **cumulés** depuis
2020 : toutes les courbes montent par construction, et rien ne se voit. Le flux mensuel dérivé
(`dsfr-data-query aggregate="cumul:diff" order-by="mois:asc"`, 0.29) a montré **deux baisses
d'un cumul de visiteurs uniques** (80 549 en 07/2024 puis 79 166 en 09/2024) — des révisions du
producteur non signalées — et un mois publié deux fois dont l'exemplaire est vide (LIM-016).

Vérifié le 2026-09-19 : `diff` rend la première ligne **vide** (`null`, « jamais 0 — un
incrément inconnu n'est pas un incrément nul », JSDoc), et une barre négative de −50 en avril
sur un cumul qui recule. Règle : à côté d'un cumul, toujours la vue dérivée ; et un mouvement
impossible (cumul qui baisse, part > 100 %, dénominateur nul) se **montre et se commente**, il ne
se lisse pas.

## La légende doit dire ce que le graphique montre

- `color-map` posait ses couleurs sur les barres mais pas sur les pastilles dès qu'un graphique
  portait `databox` : **15 pastilles fausses** ont vécu des lots entiers, une part saumon
  annoncée « bleu ciel » (BUG-016, corrigé en 0.29.0). La modalité de `color-map` doit être le
  nom de série **exact, accents compris**, sinon elle est ignorée en silence et la légende ment.
- À l'inverse, la légende d'une choroplèthe `dsfr-data-map-legend` dérive des bornes
  **réellement appliquées** (« Jusqu'à 100 000 », « De 100 000 à 300 000 ») : elle ne peut pas
  mentir, là où la légende écrite à la main de l'original contredisait sa propre configuration
  sur trois entrées sur quatre (AV-025).
- Règle de relecture : **comparer chaque pastille à sa barre**, à l'œil ou par script (la recette
  du banc compare `legendesFausses`). Une recette qui ne compare que des nombres ne voit pas une
  légende qui ment.

## Le référentiel « au-dessus de la moyenne »

Comparer un territoire à la France suppose que la valeur France soit **la vraie** : jointe depuis
la ligne nationale du jeu (`dsfr-data-join on="fede_gp"` sur les lignes `TOT`, AV-030) et non
recopiée ni recalculée par une moyenne des territoires (LIM-014). L'original du portrait de
fédération affichait « 15 ans » puis « 22 ans » d'âge médian pour 16, et une part féminine
régionale remplacée par la valeur nationale : trois chiffres faux nés de valeurs recopiées.
