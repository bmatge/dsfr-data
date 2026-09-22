# Trouver l'histoire — explorer avant de dessiner

> Un jeu de données ne raconte rien tant qu'on n'a pas cherché ce qui surprend : l'écart, le changement, l'exception, la concentration, la rupture, le paradoxe, le vide. Comment explorer avec trois requêtes, reconnaître ces sept figures, passer du « quoi » au « et alors ? », choisir un angle et écrire ceux qu'on écarte, hiérarchiser les messages.
>
> Déclencheurs : trouver l'histoire, quelle histoire, angle éditorial, quel angle, angles écartés, explorer avant, exploration, ce qui surprend, écart, exception, concentration, 80/20, rupture de série, paradoxe de Simpson, et alors, hiérarchie des messages, message principal, message secondaire, exploration ou explication
>
> Niveaux : intermédiaire (§ figures, § angle), avancé (tout)

## Explorer avec trois requêtes avant la première balise

On ne dessine pas ce qu'on n'a pas regardé. Le banc reproduisait des pages **avant** d'avoir lu
la donnée, et a payé : un KPI moyennant des choses non moyennables, 1 000 lignes sur 3 080, un
jeu vide pris pour une recherche trop restrictive (LIM-005). Trois passes, à l'API ou dans une
page de brouillon :

| Passe | Ce qu'on cherche | Geste |
|---|---|---|
| **Le volume et les bords** | combien de lignes, quelle période, quels territoires, combien de nulls par colonne candidate | `/records?limit=0` → `total_count` ; `dsfr-data-facets` avec compteurs sur trois ou quatre champs ; `dsfr-data-kpi value="date:min"` / `date:max` ; `value="count" where="champ:isnull"` |
| **Les distributions** | ce qui domine, ce qui est rare, ce qui est concentré | `dsfr-data-query group-by="x" aggregate="v:sum, v__sum:share_percent:part" order-by="part:desc"` ; `dsfr-data-list sort` sur chaque colonne numérique |
| **Le mouvement** | ce qui a changé, ce qui a cassé | `group-by="annee" order-by="annee:asc"`, puis `aggregate="cumul:diff"` si la série est cumulée ; `dsfr-data-kpi value="v:evolution"` |

Ce qu'on note en explorant : les trois chiffres qui ont surpris, les deux colonnes dont on ne
comprend pas la règle de calcul, la ligne de dictionnaire de données qui la donne (le champ
`valeurs_dans_calcul` du Baromètre France Num, le `sens_de_l_augmentation`). Une colonne qu'on ne
comprend pas ne se dessine pas.

## Les sept figures qui font une histoire

| Figure | La question qu'elle pose | Comment on la trouve | Cas du banc |
|---|---|---|---|
| **L'écart** | pourquoi ici plus qu'ailleurs, plus que le groupe, plus que la France ? | une ligne de référence jointe depuis le jeu (`dsfr-data-join` sur les lignes `TOT`), l'écart calculé : `compute="ecart = v_prof - v_nat"` | Baromètre : 75,8 % en Bretagne contre 71,2 % en France à la question 501 |
| **Le changement** | qu'est-ce qui a bougé, et depuis quand ? | `order-by="annee:asc"`, `v:evolution`, base 100 quand le producteur la publie (`lics_100_2016`) | portrait de fédération 2016-2024 |
| **L'exception** | qui ne suit pas la règle ? | trier, regarder les deux bouts ; un territoire loin de sa strate | un département où la fédération pèse deux fois son poids national |
| **La concentration** | combien font l'essentiel ? (80/20) | `share_percent` trié, cumul des parts (`running_sum` sur la colonne de part, `order-by` posé) | cinq départements pour la moitié des licences |
| **La rupture** | où la série casse-t-elle, et pourquoi ? | le flux dérivé d'un cumul (`cumul:diff`) ; une `reference-lines axis:"x"` à la date de l'événement | TNE : deux baisses d'un cumul de visiteurs uniques, invisibles sur la courbe cumulée (LIM-016) |
| **Le paradoxe** | l'agrégé dit-il le contraire du détail ? (Simpson) | comparer le taux global et les taux par strate : un taux qui monte dans chaque académie peut baisser en France si la composition change | 62 % de PME au lieu de 34 % selon que les vides sont au dénominateur (PG-020) |
| **Le vide** | qu'est-ce qui manque, et est-ce l'information ? | compter les nulls, les codes hors référentiel, les territoires absents | 95 309 signalements sans département, 5,5 % du total (AM-027) |

Une page en raconte **une**, deux au plus. Sept figures sur une page, c'est un catalogue.

## Du « quoi » au « et alors ? »

Le test : écrire le message sous la forme « **X**, parce que **Y**, donc **Z** ».

- « Les licences féminines ont progressé de 18 % depuis 2016 » — c'est un « quoi ».
- « … parce que les moins de 15 ans ont doublé » — un « pourquoi » que le jeu porte (âge × sexe).
- « … donc la fédération rattrape son groupe chez les jeunes, pas chez les adultes » — le « et
  alors », qui décide du graphique : pas une courbe du total, une comparaison par tranche d'âge.

Un « quoi » sans « et alors » donne un graphique descriptif que le lecteur regarde sans savoir
quoi en faire. Quand le « et alors » n'est pas dans le jeu (pas de colonne d'âge), on le dit :
le titre reste un « quoi » honnête, et la note dit ce qu'il faudrait pour aller plus loin.

## Exploration et explication ne sont pas la même page

| | Exploration | Explication |
|---|---|---|
| Qui | l'auteur, ou un lecteur qui cherche *sa* valeur | un lecteur qui veut *le* message |
| Forme | filtres, tableau triable, facettes à compteurs, carte cliquable | trois ou quatre repères, un graphique par message, une phrase par graphique |
| Gestes | `dsfr-data-facets`, `dsfr-data-list sort search`, `refine-on-click` | `dsfr-data-kpi-group`, `databox-title`, `dsfr-data-a11y description` |
| Erreur classique | livrer l'explorateur comme s'il racontait quelque chose | figer dans le récit ce qui devait rester ouvert |

Les deux coexistent souvent : la refonte du Baromètre met la synthèse d'abord, le parcours
ensuite, l'explorateur en dernier ([structure-narrative](structure-narrative.md)). L'ordre est
la décision.

## Choisir l'angle, et écrire ceux qu'on écarte

Trois critères, et il en faut les trois :

1. **Le lecteur y tient** — l'angle répond à la question de la ligne « Question ».
2. **Le jeu le porte** — pas un échantillon de trente répondants, pas une colonne recopiée
   (AV-030 : un âge médian à « 15 ans » puis « 22 ans » pour 16), pas une clé hors référentiel.
3. **On sait le montrer** — une forme existe pour cette relation ([choisir-la-forme](choisir-la-forme.md)).

Un angle qui n'a que deux critères sur trois est **écarté et écrit** : « Nous n'avons pas
retenu la comparaison des financements, faute de série dans le temps » ; « le classement des
fédérations “les plus féminines” a été écarté : sans normalisation par la discipline, il
classe des sports, pas des politiques ». La section « Notes — les hypothèses éditoriales » de
la refonte du Baromètre en liste sept. Un angle écarté visible protège de la question « pourquoi
n'avez-vous pas montré… » et rend le choix contestable — c'est le but.

## Hiérarchiser : un message principal, deux secondaires, le reste en exploration

- **Principal** : celui du titre de la page et du premier graphique. Un seul.
- **Secondaires** : ce qui nuance ou prolonge (« mais pas partout », « surtout chez les
  jeunes »). Un bloc chacun, après la preuve.
- **Exploration** : tout ce qui est vrai, utile à quelqu'un, et ne sert pas l'argument — tableau
  triable, filtres, export. Après, jamais avant.

Douze KPI de même taille disent que personne n'a choisi. Trois repères et un chiffre d'accroche
plus grand (`span="6"` dans un `dsfr-data-kpi-group`) disent qu'on a lu la donnée.

## Pièges : les histoires que le jeu ne porte pas

- **L'effet de filtre pris pour un écart.** Filtrer sur la Bretagne met « Bretagne » à 100 %
  contre 5,1 % à la question « Région » : +94,9 points qui ne disent rien (questions 201-203
  exclues par `where="not (code_unifie in (201, 202, 203))"` dans la refonte du Baromètre).
- **L'artefact de collecte.** Un mois publié deux fois dont l'exemplaire est vide, une révision
  du producteur non signalée (TNE) : une rupture se **vérifie** avant de se raconter.
- **L'échantillon qui fond.** Région × secteur × taille sur une enquête : quelques dizaines de
  répondants ; un écart de 8 points n'y signifie rien. Afficher l'effectif de la sélection
  (`dsfr-data-kpi value="count"`), et renoncer à l'angle quand il est trop petit.
- **Le changement de nomenclature.** Une série qui saute l'année où le code change raconte la
  réforme, pas le phénomène. Lire la documentation du jeu avant de titrer sur une rupture.
- **La corrélation promue en cause.** Deux courbes qui montent ensemble ne s'expliquent pas ;
  [titres-et-mots](titres-et-mots.md) donne les formulations qui restent justes.
