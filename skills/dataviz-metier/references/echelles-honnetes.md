# Échelles honnêtes

> Axe tronqué, double axe, moyenne de pourcentages, moyenne non pondérée des territoires, arrondi avant pondération, base 100, compte distinct approximatif, total d'entité répété sur chaque ligne : les façons dont un chiffre exact devient un chiffre faux.
>
> Déclencheurs : échelle honnête, axe tronqué, y-min, double axe, moyenne de pourcentages, moyenne de taux, moyenne non pondérée, pondération, en France, résumé de carte, arrondi, décimales, base 100, indice, échelle logarithmique, count distinct, total_count, total répété, données longues, nombre total par entité
>
> Niveaux : base (les pièges résumés dans niveau-base), avancé (tout)

## La moyenne d'un taux est un taux pondéré, jamais une moyenne

**Le cas** (LIM-014, portail Éducation, trois pages « personnels ») : une carte `type="map"`
affiche sous son titre une valeur « en France ». C'était la **moyenne arithmétique non
pondérée** des valeurs départementales — la Lozère y pèse autant que le Nord. Mesuré le
2026-09-10 : collèges **4,27 % affiché contre 5,6 % réel**, lycées 14,96 contre 19,3, écoles
85,53 contre 86,9. Le chiffre faux était au même niveau visuel que le titre, donc lu en premier.
Sur le portail Sports : 4,61 licences pour 1 000 habitants affichées pour 4,54 réelles.

**Le geste** (0.29.0, #795) : `map-summary-weight="ens"` — Σ(valeur × effectif) / Σ(effectif)
sur les lignes dessinées. Vérifié : 5,6 / 19,28 / 86,91, valeurs de l'API au centième près. Sans
champ d'effectif dans le jeu, `map-summary-value="…"` pose une valeur fournie — mais c'est un
**littéral**, juste pour une fédération et faux dès qu'on change de filtre (AM-079) : ne l'employer
que sur une carte sans filtre.

**Le geste, pour un volume** : `map-summary="sum"` (#927, AM-079). Le résumé d'une carte de
volumes était une moyenne de volumes — « 3 074,06 en France » pour 310 480 licences, un chiffre
sans signification — et la valeur littérale `map-summary-value` restait juste pour une seule
fédération. `sum` calcule le total depuis la donnée, donc **il suit les filtres**. Quatre modes :
`sum` pour un volume, `weighted` pour un taux, `avg` pour un indicateur dont les territoires
pèsent pareil, `none` pour ne rien résumer (ce qui disparaît est le chiffre ; l'en-tête « en
France » appartient à DSFR Chart et reste). Une somme n'a de sens que si les lignes forment une
**partition** : deux lignes du même code sont additionnées toutes les deux alors que la carte
n'en dessine qu'une — un avertissement console le dit, agréger en amont. Une choroplèthe de
volumes reste une forme douteuse (voir [choisir-la-forme](choisir-la-forme.md)) ; si elle s'impose, le dire en page à
côté du résumé.

## Arrondir pour l'affichage, jamais avant un calcul

`map-summary-weight` pondère la colonne **affichée**. Un `dsfr-data-normalize round="taux:1"`
posé en amont pour une infobulle lisible suffit à décaler le résultat : 4,5331 au lieu de 4,5368
(PG-031, mesuré sur 101 départements). Les arrondis d'affichage se posent en aval : `decimals`
sur `dsfr-data-kpi` (0.22.0) et sur `dsfr-data-a11y` ; le tableau `a11y` rend déjà fr-FR au
plus deux décimales (AM-033). Réserver `round` aux valeurs qui ne nourrissent aucun calcul
ultérieur, et vérifier qu'aucune pondération ne les lit.

## Une moyenne sur 0/100 exclut les vides

« % de PME » calculé par `value="pme:avg"` sur un champ recodé 0/100 par `replace-fields` :
**62 % au lieu de 34 %**, parce que `replace-fields` ignore les nulls et que 564 lignes vides
sortent du dénominateur (PG-020, EPV). Une part est un ratio de comptes avec le dénominateur
explicite : `value="count:categorie:PME / count"` — et décider, en le disant, si « non
renseigné » est dans le dénominateur (434 / 1 267 = 34 %) ou hors (434 / 703 = 62 %).

## Le « Score moyen » et les autres moyennes de pourcentages

Voir [question-et-lecteur](question-et-lecteur.md) : une moyenne de parts de répondants à des
questions différentes ne mesure rien. La règle de calcul se lit dans le jeu
(`valeurs_dans_calcul`) et s'écrit par repère.

## L'axe commence où le lecteur croit qu'il commence

- **`y-min="0"`** sur une courbe ou un radar de taux, sinon Chart.js cadre sur les données et
  une variation de 2 points remplit l'écran. Capytale (portail Éducation) : « 19 colonnes
  d'intensité, échelle tronquée » sur l'original → `type="bar" y-min="0"` : « l'écart visuel
  devient l'écart réel ».
- **Pas de double axe** : deux mesures d'échelles différentes → deux graphiques, ou base 100
  (`lics_100_2016`, publié par le producteur, trois courbes sur une échelle). Règle du skill
  `dataviz`, reprise ici parce que `type="bar-line"` la rend facile à violer.
- **Pas d'échelle logarithmique** dans DSFR Chart (AM-063, ouvert) : une distribution de un à
  plusieurs milliers (commune rurale vs France) s'écrase. Répondre par un tableau trié, un
  podium, ou une normalisation (« pour 10 000 habitants ») — pas en attendant l'attribut.

## Le compte exact n'est pas toujours celui de l'API

- `select=count(distinct champ)` d'Opendatasoft est **approximatif** dès quelques centaines de
  valeurs, et dans les deux sens : 959 pour 981 villes réelles, 927 pour 924 (PG-026). Le compte
  exact : compter les lignes d'un `group_by` exporté (`fetch-mode="export"`), ou côté client sur
  données complètes (`aggregate="ville:distinct"` de `dsfr-data-query` compte les lignes reçues).
- `total_count` d'un `group_by` vaut la taille de page (LIM-002) : 100 groupes annoncés pour 235.
  Le vrai nombre de groupes : `value="meta:total"` sur la query client (0.22.0), vérifié le
  2026-09-19 (« 4 » pour quatre groupes, groupe null compris).
- Un KPI `count` sur une query `limit="12"` affiche 12 (PG-017 : « 12 activités » pour 28, 22 et
  29 réelles pendant sept lots ; « 18 métiers » pour 358 cinq lots plus tard). `value="meta:total"`
  lit le nombre de lignes **avant** `limit`.

## Le total répété : un attribut de l'entité, pas une valeur de ligne

**Le cas** (Studio IA, jeu « Aides nationales », 2026-09-24) : données longues, une ligne par
couple ville × aide. La colonne « Nombre total d'actions » vaut 4 sur les 4 lignes de Lille :
c'est le nombre d'aides **de Lille**, recopié sur chaque ligne. Posée dans le volet ou le tableau
à côté de chaque aide, elle se lit « Chèque énergie : 4 » — faux, le chèque énergie ne compte
pas pour 4. Sommée (KPI « total des actions » en `:sum` sur les lignes), elle compte Lille
**quatre fois** : 16 au lieu de 4.

- **Vérifier avant d'afficher** : une colonne dont la valeur est **constante pour toutes les lignes
  d'une même entité** (une seule valeur distincte par ville) est un attribut de l'entité. Le test,
  la colonne renommée `nb_actions` (`dsfr-data-normalize rename`) : `group-by="Ville"` +
  `aggregate="nb_actions:min, nb_actions:max"` — si min = max pour chaque ville, c'est un total
  répété.
- **L'afficher une fois par entité** : titre ou en-tête du volet (`title-field`, gabarit du
  compagnon), carte ou KPI par entité (`aggregate="…:first"` après `group-by="Ville"`), jamais
  dans les `popup-fields` d'une ligne.
- **Ne jamais le sommer sur les lignes.** Le total général se recalcule : `count` des lignes, ou
  somme de l'attribut après un `group-by` sur l'entité (`first`, puis `sum`).
- **Le dire** à l'usager : « Nombre total d'actions est un total par ville, répété sur chaque ligne :
  il est affiché une fois par ville. »

## Les décimales et l'unité sont de l'échelle aussi

« 2 € » pour un prix au litre, « 2,1 » à côté de « 2,29 » (AM-031) : `format="euro" decimals="3"`,
`format="compact" unit="€"` → « 44,9 Md € » (0.22.0). Les décimales passent par `decimals`,
jamais par le format (`euro:3` est une erreur de configuration nommée). Une unité dans `label`
(« % des répondants ») quand la valeur n'en est pas une est un mensonge d'échelle.
