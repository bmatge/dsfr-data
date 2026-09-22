# Anti-patterns éditoriaux

> Les façons de remplir une page sans rien raconter, reconnues au banc : le dashboard fourre-tout, le graphique qui répète le KPI, la carte parce qu'il y a des coordonnées, le camembert par défaut, le titre qui est le nom du jeu, la page sans conclusion, les douze KPI de même poids, le graphique cliquable promis, la carte sans liste. Pour chacun : pourquoi ça échoue, ce qu'on fait à la place, le geste.
>
> Déclencheurs : anti-pattern éditorial, dashboard fourre-tout, un graphique par colonne, graphique qui répète, carte parce que, camembert par défaut, titre nom du jeu, page sans conclusion, douze kpi, trop de kpi, kpi de même poids, catalogue de graphiques
>
> Niveaux : intermédiaire, avancé — à relire avant de livrer

## Les neuf, en table

| Anti-pattern | Pourquoi ça échoue | À la place | Geste |
|---|---|---|---|
| **Le dashboard fourre-tout** — un graphique par colonne du jeu | l'ordre du CSV n'est pas un argument ; le lecteur cherche le message et ne le trouve nulle part | un message principal, deux secondaires, le reste en tableau ([trouver-l-histoire](trouver-l-histoire.md)) | `dsfr-data-list columns sort export` pour tout ce qui ne sert pas l'argument |
| **Le graphique qui répète le KPI** — « 31,9 % » en tuile, puis un anneau 31,9 / 68,1 | deux formes pour un seul chiffre ; l'anneau n'ajoute que de la surface | le KPI seul, ou le graphique qui apporte la **nuance** (par âge, par territoire) | `dsfr-data-kpi` + `type="bar" series-field` sur la dimension qui nuance |
| **La carte parce qu'il y a des coordonnées** | une carte de volumes dessine la population ; une carte de points dessine la densité urbaine | la ligne « Hors objet » des quatre lignes ; une carte seulement si le message est géographique **et** en taux | `type="map" map-summary="weighted"`, ou rien |
| **Le camembert par défaut** | les angles ne se comparent pas ; au-delà de cinq parts, la légende fait le travail | barres triées ; anneau seulement pour une part d'un tout à ≤ 5 parts | `order-by="v:desc"` + `type="bar" horizontal` |
| **Le titre = nom du jeu** — « Licences sportives par fédération, département et sexe » | le lecteur apprend ce qu'il y a dans le fichier, pas ce qu'il doit retenir | un titre-message ([titres-et-mots](titres-et-mots.md)) | `databox-title="Un licencié sur trois est une femme"` |
| **La page sans conclusion** | le lecteur retient le dernier graphique, qui est le moins important | trois phrases dans un `fr-callout`, ce qui manque, la porte de sortie ([structure-narrative](structure-narrative.md)) | `<div class="fr-callout">` |
| **Les douze KPI de même poids** | personne n'a choisi ; douze chiffres se lisent comme zéro | trois ou quatre, le principal plus large, chacun avec sa référence ou sa tendance | `dsfr-data-kpi-group per-row="4"` + `span="6"` + `lines` |
| **Le graphique cliquable promis** — « cliquez une barre pour filtrer » | `dsfr-data-chart` n'émet aucun clic : la promesse n'est pas tenue | filtres nommés, ou le clic là où il existe | `dsfr-data-facets` ; `refine-on-click` sur une couche de carte ou une ligne de `dsfr-data-list` |
| **La carte sans liste** | inutilisable au clavier et au lecteur d'écran ; le lecteur ne trouve pas *sa* commune | la liste est la transcription de la carte, même sélection (`pagePatterns`, famille A) | `dsfr-data-map` + `dsfr-data-list source=` identique |

## Trois signes qu'on est en train d'en produire un

- On ne sait pas **quoi écrire en titre** sans regarder le graphique : c'est un descriptif.
- On ajoute un bloc **parce qu'une colonne n'est pas encore montrée** : c'est le fourre-tout.
- On dit « le lecteur pourra explorer » pour un bloc **qui ne répond à aucune question** :
  c'est l'exploration avant la synthèse. L'exploration existe, en bas de page, après le récit.

## Règle

Un bloc qui ne peut pas répondre à « quel est ton message ? » en une phrase est retiré, ou
descendu dans l'exploration. Ce qui est retiré est écrit dans les notes : « nous n'avons pas
montré X parce que Y ». Le résidu est le livrable, pas l'échec.
