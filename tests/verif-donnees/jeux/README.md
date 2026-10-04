# Les jeux de la vérification des données

Un jeu = un fichier JSON, un **tableau d'objets**, une ligne par enregistrement, les
clés dans l'ordre des colonnes, `null` explicite là où la fixture porte `null` — jamais
confondu avec `''` ni avec `0`, c'est le piège que plusieurs de ces jeux ont été taillés
pour tenir.

Ces fichiers sont **la** source des lignes du régime déterministe (#879) : les modules
`tests/verif-donnees/fixtures*.ts` les importent (`with { type: 'json' }`) et ne portent
plus aucun littéral ; le faux serveur les ré-emballe dans la forme de chaque API, et
l'oracle repart des mêmes lignes. Ils sont lisibles hors TypeScript — `python3 -c
"import json; json.load(open('mesures.json'))"` — et par le banc d'essai open-data-viz,
qui les lit par chemin.

Ils ne sont **pas** reformatés par prettier (`.prettierignore`) : un jeu se lit comme un
tableau, une ligne par enregistrement. `tests/oracle/jeux.test.ts` vérifie que chaque jeu
est lu par au moins un contrôle et que chaque `feed.datasets` déterministe vient d'ici.

## Les jeux partagés

| Fichier | Lignes | Taillé pour |
|---|---|---|
| `territoires.json` | 137 | Le jeu du harnais de recette du Builder (`tests/builder-e2e/api-fixtures.ts`, `JEU`), **matérialisé** : plus de 100 lignes pour que la pagination ODS soit réellement exercée, libellés piégeux (apostrophes, esperluette), colonne au nom à espaces, sept pays. Le harnais reste le générateur ; `jeux.test.ts` vérifie que le fichier et `JEU` ne divergent pas. |
| `mesures.json` | 12 | `quota` porte des zéros NUMÉRIQUES et des chaînes VIDES — la distinction que `'' == 0` efface. `code` porte deux clés vides (une chaîne vide, un `null`) — la distinction qu'une clé de jointure trop accueillante efface. `indice` et `poids` donnent une moyenne pondérée qui diffère franchement de la moyenne simple. Coordonnées et série mensuelle cumulable. |
| `regions.json` | 10 | Table d'appariement des mesures : deux lignes sans correspondance à gauche (`20`, `21`), une ligne à clé VIDE qui ne doit apparier aucune des deux mesures à clé vide. |
| `delegation-tabular-ex-aequo.json` | 450 | Servi par une ressource Tabular à part (#1202) : 450 lignes, donc trois pages de 200 ; `nombre` ne prend que cinq valeurs (des ex-æquo partout), `categorie` porte des libellés À PARENTHÈSE (« Usage de stupéfiants (AFD) »). ENGENDRÉ : `id = i + 1`, `categorie = [Homicides, Usage de stupéfiants (AFD), Vols (avec violence), Cambriolages][i mod 4]`, `nombre = 7i mod 5`. Le faux serveur Tabular y ment comme l'API : un tri paginé ordonne les ex-æquo autrement d'une page à l'autre (PG-033), et `__in` écarte une valeur à parenthèse (PG-034). Depuis #1233, il ne lit qu'UN `__sort` (les suivants sont ignorés, mesuré le 2026-10-03), accepte un ordre total composé dans sa valeur (`asc,"__id".asc`, `__id` = rang de la ligne), et `__notin` écarte la parenthèse comme `__in`. Sert aussi les chargements GROUPÉS (`categorie` × `id`, 450 groupes) et TRONQUÉS (`max-records="400"`) du même constat, et le canari `canari-tabular-*`. |

## Domaine `contexte`

| Fichier | Lignes | Taillé pour |
|---|---|---|
| `contexte-etablissements.json` | 25 | `date` couvre mars 2025 → octobre 2026 avec les voisinages qui font échouer une borne fausse (15 et 16 mars 2026 ; 24 et 25 mai, J-7 d'une horloge posée au 1er juin ; 31 mai et 1er juin, bascule de mois en jour civil LOCAL). `region` et `categorie` ont des effectifs tous différents (8/7/6/4 et 10/8/7) : un tri par compteur n'a qu'un ordre juste. `libelle` porte des accents (« École », « Sète », « Béziers »). `effectif` sert de `weight-field`. |
| `contexte-budgets.json` | 4 | Pas de colonne `categorie` (#805) : la source cible dont un filtre de contexte doit s'exclure — et le dire — plutôt que partir chercher un HTTP 400. |
| `contexte-heterogenes.json` | 250 | Le REVERS du précédent (#841) : les 25 établissements répétés dix fois (`id` suffixé par le tour), et une SEULE ligne — la 250ᵉ — qui porte la colonne `zone`. L'heuristique d'absence jugeait sur les 200 premières lignes reçues : au-delà, elle écartait le filtre sans un mot. Il faut donc plus de 200 lignes, et le porteur à la fin. |

## Domaine `adaptateurs`

| Fichier | Lignes | Taillé pour |
|---|---|---|
| `adaptateurs-melodi.json` | 7 | Les lignes PLATES attendues après aplatissement INSEE Melodi (#586) : la mesure `OBS_VALUE_NIVEAU` perd son suffixe, une dimension traduite garde son nom et prend le libellé (le code part dans `<DIM>_CODE`), la dernière ligne porte un code géographique ABSENT de `/range` et n'ouvre pas de `GEO_CODE`. Les observations portent l'`id` géographique (`2025-DEP-01`), pas le code court. |
| `adaptateurs-grist.json` | 5 | Champs imbriqués sous `fields` ; noms de colonnes piégeux (espaces, apostrophe, accents) — ce qui casse quand l'aplatissement passe par une clé construite plutôt que recopiée. |
| `adaptateurs-tabular-long.json` | 411 | Les 137 territoires posés TROIS fois, chaque copie marquée par `copie` (1, 2, 3), en même ordre de colonnes. Tabular sert 200 lignes par page (#1019) : `territoires` y tient en une seule et `links.next` ne serait plus suivi. Trois pages (200, 200, 11) : une page oubliée, ou la première relue au lieu de la suivante, change le compte et la somme. |
| `adaptateurs-tabular-long.parquet` | 411 | **Pas un jeu JSON** : l'export Parquet des MÊMES lignes que `adaptateurs-tabular-long.json` (#1055), servi par plages au lieu de la pagination. Écrit par `tests/adapters/parquet/generer.py` (pyarrow, ZSTD, entiers INT64, cinq groupes de 100 lignes). L'oracle ne le lit jamais : il relit le JSON, et un groupe sauté ou un entier resté `BigInt` côté bibliothèque se voit comme un écart. À régénérer si le JSON change. |
| `adaptateurs-json.json` | 5 | Colonnes numériques servies EN CHAÎNES à la française (espace de milliers, virgule décimale) ; `effectif` mêle nombres et chaînes dans la même colonne. |

Les modalités de `/range` (Melodi) restent dans `fixtures-adaptateurs.ts` : ce sont des
tables de correspondance du faux serveur, pas des lignes que l'oracle recalcule.

## Domaine `affichages`

| Fichier | Lignes | Taillé pour |
|---|---|---|
| `affichages-communes.json` | 48 | Assez pour une page 2 (21-40) et des classes de choroplèthe qui ne dégénèrent pas ; ordres de grandeur écartés (population, budget, taux) pour que chaque format se distingue ; `eleves` éloigne franchement la moyenne pondérée de la moyenne simple (#763) ; code département valide, coordonnées. Engendré par des formules (aucune colonne constante ni proportionnelle à une autre) puis matérialisé. Libellés accentués : « Écully » se range entre « Douai » et « Épernay », pas après « Zutkerque ». |
| `affichages-serie.json` | 12 | Douze mois croissants ; la dernière valeur vaut exactement 1,4 fois la première — l'évolution attendue est un taux rond (40 %). |
| `affichages-libelles.json` | 8 | Huit libellés dont l'ordre alphabétique français diffère de l'ordre des codes de caractères (« É », U+00C9, passerait après « Z »). |
| `affichages-long.json` | 6 | Format long mois × groupe pour `series-field` ; le groupe B n'a pas l'allure du groupe A. |
| `affichages-absences.json` | 7 | Trois absences au format long (#1198, BUG-028/029) : une cellule (mois, groupe) manquante, une valeur `null`, et un groupe dont TOUTES les valeurs manquent (`null`, puis chaîne vide). Une absence n'est pas un zéro : `sum`, `avg`, `min`, `max` d'un groupe vide et la cellule absente d'un graphique valent `null`. |
| `affichages-hors-decoupage.json` | 8 | Huit départements dont trois HORS du découpage de la carte départementale (#1201, PG-083) : un code vide, 99 (étranger) et 988. Le résumé `map-summary` ne porte que sur les cinq dessinés ; la carte doit dire ce qu'elle écarte (3 lignes, 316 habitants). |
| `affichages-contours-departements.json` | 101 | Fond des départements de la composition par échelle (#1021), servi à l'URL que la Carto génère (`dsfr-data@0/geo/departements.json`) en `FeatureCollection` — une ligne par entité, `code` et `nom` de `packages/core/geo/departements.json` (les 101 mêmes codes, zéros de tête et `2A`/`2B` compris : la jointure compare la clé brute), géométrie remplacée par un carré sur une grille. Ce sont les codes qui comptent, pas les tracés. |
| `affichages-aides.json` | 17 | « Aides nationales » au format LONG (#1108) : une ligne par couple ville × aide, `Latitude` / `Longitude` RÉPÉTÉES. Six villes aux effectifs inégaux (Lille 4, Amiens 4, Rouen 3, Metz 3, Caen 2, Brest 1), lignes entrelacées : une couche `group-field="Ville"` trace six marqueurs, et le volet de Lille liste ses quatre aides dans l'ordre du fichier. Libellés à accent, apostrophe et esperluette. |
| `affichages-zones.json` | 10 | Dix polygones à la manière d'un jeu Opendatasoft (#1053) : chaque ligne porte `geo_point_2d` ET `geo_shape`. Une couche `geoshape` sans `geo-field` doit tracer la forme ; le calcul d'emprise devine le point en premier, et reprendre sa détection telle quelle ne tracerait rien. |
| `affichages-symboles.json` | 9 | Symboles proportionnels d'une couche `circle` (AM-107, #1229) : neuf villes et un nombre d'`entrees`. Un zéro (l'ancrage de l'échelle en aire), 1, 4 et 100 (rapports de rayon 2 et 10 attendus en `radius-scale="sqrt"`), des carrés parfaits, et trois valeurs qui n'en sont pas (2, 7, 50) où l'arrondi au pixel se voit. Aucune valeur ne tombe sur un demi-pixel, dans aucune des deux échelles contrôlées. L'ordre du fichier n'est pas celui des valeurs. |
| `affichages-encarts.json` | 10 | Carte à encarts (BUG-034, #1229) : quatre lieux en métropole, trois à La Réunion, deux en Guadeloupe, un en Guyane, aucun à Mayotte. Chaque lieu est à plus de 30 px du bord de son encart, ou sur un autre continent : l'appartenance à une emprise ne dépend ni d'un pixel ni de la marge des symboles. `type` (quatre « Musée », six « Théâtre ») est le filtre : après lui, un encart doit porter exactement ses entités filtrées — pas les anciennes en plus. Lignes entrelacées. |

## Domaine `transformations`

| Fichier | Lignes | Taillé pour |
|---|---|---|
| `transformations-territoires.json` | 12 | `statut` porte les trois états qu'un filtre confond : renseigné, chaîne VIDE, `null`. `taux` en décimale française. `code` à zéro de tête (`0042`). `nom` avec accents, apostrophe et esperluette. `mesure` mêle nombres et « NC » — la paire mixte que les comparaisons d'ordre rangent en texte. `tags` multivalué. |
| `transformations-brutes.json` | 8 | Normalisation : chaînes à convertir (`'1 234,5'`, `''`), valeurs à arrondir, colonnes à renommer, libellés à remplacer (`N/A`, `n.d.`), champs multivalués à découper (`eau\|air`), colonnes Oui/Non parallèles à replier. |
| `transformations-prefixes.json` | 4 | Valeurs qui COMMENCENT par un nombre sans en être un (#1200, BUG-023/032) : codes `75A` et `2B`, périodes `1922-1930`, `vers 1880` et vide. La lecture stricte (`numeric`, agrégats de query) les rend absentes ; `numeric-prefix` lit le nombre de tête, `null` quand il n'y en a pas. |
| `transformations-calculs.json` | 6 | Colonnes calculées : un dénominateur NUL, un opérande ABSENT (`null`), une cellule VIDE face à un zéro, une date ISO, un champ TABLEAU (dont un vide), des libellés à capitaliser, rogner, remplacer. |
| `transformations-codes.json` | 8 | Sous-chaînes, apostrophe et racine de `compute` (AM-103, AM-090). `siret` : trois établissements d'UNE même entreprise (un même SIREN en tête, dont un SIRET stocké en NOMBRE), un SIRET trop court (4 caractères), un vide, un `null` — compter au SIRET donne 6, au SIREN 4. `code_insee` : un zéro de tête (`01004`), la Corse (`2A004`), un DROM stocké en nombre (`97105`), un code d'un seul caractère. `libelle` : l'apostrophe ASCII (« J'en ai », deux fois), un libellé qui porte DEUX apostrophes de suite (« J''en ai ») et ne doit pas être pris pour le premier, un accent. `surface` : un carré parfait, un décimal, zéro, un NÉGATIF (pas de racine), `null`, vide, une décimale française (`6,25`) et un texte (« NC »). |
| `transformations-enquete.json` | 14 | Part PAR GROUPE (`share-by`, AM-110) : deux éditions d'une enquête (2014, 2021) aux effectifs inégaux, pour qu'une part rapportée au total général (460) ne ressemble à aucune part par (année, question) — « Souvent » en 2014 vaut 30 % de sa question et 6,5 % du tout. Une réponse saisie sur DEUX lignes (à regrouper avant de diviser), une question posée en 2021 seulement dont le total est NUL (part absente, jamais l'infini), un effectif non numérique (« NC » : hors dénominateur, part absente). |
| `transformations-tableaux.json` | 8 | Élément d'un tableau et plus petit / plus grand élément de `compute` (#1237, suite de AM-103). `denominations` : un VRAI tableau (trois, un, quatre éléments), un tableau vide, un `null`, un SCALAIRE (« chapelle » : pas un tableau d'un élément), un premier élément `null`, un élément répété. `datation` : la cellule « COLLÉE » du banc (`1972 ; 1965 ; 1980`), à découper par `split` ; `1050;950` où l'ordre du texte et celui des nombres se contredisent ; un élément non numérique (« vers 1970 ») qui fait basculer la comparaison en texte ; une égalité numérique (`1880` et `1880,0`) ; un NOMBRE, que `split` laisse tel quel ; vide et `null`. `prises_de_poste` : dates ISO dont le premier poste listé n'est PAS le plus ancien (cas Préfets), un élément vide au milieu, deux dates à cheval sur un changement d'année. |
| `transformations-long.json` | 9 | Pivot : communes × années avec des cellules absentes, une cellule à deux observations (pour `first` / `last`), une décimale française, une année VIDE (ligne ignorée par le pivot). |
| `transformations-editions.json` | 10 | Deux éditions d'un baromètre (#878, cas 2) : `teletravail` posée en 2024 seulement, `cybersecurite` en 2025 seulement. Une soustraction qui prendrait la cellule manquante pour un zéro fabriquerait −85,2 points et la mettrait en tête du classement — les valeurs sont choisies pour que ce faux dépasse la plus forte variation réelle (+12,5). |
| `transformations-large.json` | 3 | Dépliage : trois mois en colonnes, une cellule vide (qui disparaît avec `drop-empty`), une décimale française, un négatif. |
| `transformations-gauche.json` | 6 | Jointure, côté gauche : deux lignes sans clé (chaîne vide, `null`), une clé sans correspondance à droite. |
| `transformations-droite.json` | 5 | Côté droit : une clé sans correspondance à gauche, une clé VIDE. |
| `transformations-gauche-graphie.json` | 4 | Même référentiel que la droite, à la graphie près (#792) : zéros de tête d'un seul côté. Deux clés seulement s'apparient — le 1,5 % d'écart plausible et faux du banc. |
| `transformations-composite-gauche.json` | 4 | Clé composite : l'année ET le code, aucun des deux ne suffit. |
| `transformations-composite-droite.json` | 3 | Idem, avec une année sans correspondance (`2023`). |
| `transformations-pile-2024.json` | 3 | Deux millésimes de même schéma à empiler. |
| `transformations-pile-2025.json` | 2 | Le second, plus court : l'ordre d'empilement doit être tenu. |
| `transformations-barometre-questions.json` | 5 | Les lignes RÉPÉTÉES par `dsfr-data-repeat` (#891) : une question, une instance. Libellés à accent, esperluette et apostrophe — ceux qui cassent l'attribut `data` s'ils ne sont pas entités. `pres` choisit le type de graphique par ligne. |
| `transformations-barometre-scores.json` | 11 | Les lignes PARTITIONNÉES par `scopes` : cinq clés d'effectifs inégaux (1 à 3 lignes), et `Q05` dont les deux observations (+5, −5) somment à ZÉRO — un scope qui déborderait sur ses voisines ne se verrait pas par un total non nul. |

## Le canari (#882)

Un jeu taillé pour **chaque piège que le banc a payé** — une valeur qui a l'air d'une
autre — et un contrôle par piège dans `tests/verif-donnees/canari.ts`, chacun citant le
registre du banc. C'est la première chose qu'un contributeur rejoue.

| Fichier | Lignes | Taillé pour |
|---|---|---|
| `canari.json` | 40 | Neuf colonnes, chaque ligne décrite ci-dessous. |
| `canari-ref.json` | 7 | La table de droite d'une jointure sur `code` : `01`, `02` **deux fois** (le doublon volontaire, PG-001), `1` (sans zéro de tête), `2A`, `''` (une clé vide qui ne doit rien apparier) et `99` (sans ligne à gauche). |
| `canari-facettes.json` | 10 | Les deux pièges d'une facette (#1227). `note` porte « 1,5 » (×3) à côté de « 1 » (×3) et de « 5 » (×3) — une valeur à virgule dont les DEUX morceaux sont aussi des valeurs, si bien qu'un lien relu sur la virgule rend six lignes au lieu de trois (BUG-031) ; `intensite` porte « 1,5 à 2 parcours » (×4), la valeur du banc, dont aucun morceau n'existe seul. `domaines` est un tableau qui RÉPÈTE des éléments (`["Patrimoine","Patrimoine"]`, `["Musée","Patrimoine","Musée"]`, trois fois « Spectacle vivant »), avec un tableau vide et un `null` : par ligne, Patrimoine 4, Musée 3, Archives 2, Spectacle vivant 1 ; par élément, 5, 5, 2 et 3 (BUG-037). `lieu` (#1243) porte « Paris, France » (×3) à côté de « Paris,France » (×1, sans le blanc) et de « Paris » : un terme de recherche relu sur la virgule puis recollé sans son blanc trouve UNE ligne au lieu de trois, et une liste simple ne retrouve plus son option. Le jeu est aussi servi en source Opendatasoft (`canari-facettes`), la seule qu’un contexte filtre. |
| `canari-volume.json` | 1 001 | Une ligne de plus qu'un plafond de 1 000 (AM-002). ENGENDRÉ par un générateur congruentiel linéaire de graine 42 — `x ← (1103515245 · x + 12345) mod 2³¹`, `groupe = [A,B,C,D][x mod 4]`, `valeur = x mod 1000` — et matérialisé ; `tests/oracle/jeux.test.ts` le régénère et refuse toute divergence. Somme des valeurs : 501 367. |

### Les colonnes de `canari.json`

| Colonne | Ce qu'elle mêle | Piège |
|---|---|---|
| `code` | `'01'` (×4), `'1'` (×2), `1` nombre (×2), `'2A'` (×3), `'02'` (×2), `'010'`, `''` (×2), `null` (×2), et des codes ordinaires | zéro de tête (PG-030, BUG-014), clé numérique contre clé texte (FP-012), clé vide |
| `libelle` | « Élancourt » en **NFC**, « Élancourt » en **NFD** (E + accent combinant), « élancourt » en minuscules, « L'Haÿ-les-Roses », « Recherche & Essais », « Sète » et « Sete », `''`, `null` | accents et formes Unicode dans le regroupement et la recherche (AM-033) |
| `montant` | `0` (×2), `null` (×3), `''` (×3), `'1 234,5'`, `'3,75'`, `-2.5`, et des nombres | absence ≠ zéro (PG-020, #301), décimale française (AM-033) |
| `poids` | des entiers dont deux `0` | division par zéro dans un quotient |
| `tags` | `['eau','air']`, `['air']`, `[]` (×8), `null` (×4), … | champ multivalué : la facette éclate, le regroupement compte les combinaisons (BUG-006) |
| `date` | ISO complet, `AAAA-MM` (×14), `AAAA` (×5), `''` (×2), `null` | dates partielles dans un filtre d'ordre (AM-029, BUG-005) |
| `region` | Nord, Sud, Corse, Centre, Est, Ouest, et **six `null`** | le groupe null, client et serveur (PG-015), `distinct` (AM-004) |
| `part` | fractions (`0.25`) ET pourcentages (`25`), `0`, `1`, `100`, `null` | une part dans `[0 ; 1]` ou dans `[0 ; 100]` — la borne dépend de l'unité |

### Les lignes, une par une

| id | Ce qu'elle piège |
|---|---|
| c01 | la référence : `01`, « Élancourt » NFC, un montant, deux tags, une date complète |
| c02 | même code, même mot en **NFD** : un autre libellé pour un regroupement, le même pour une recherche |
| c03 | même mot en minuscules ; montant `0` (un zéro, pas une absence) ; `tags` vide ; date `2024` seule |
| c04 | code `'1'` (sans zéro) ; montant `null` ; `tags` `null` ; date vide ; région `null` |
| c05 | code `'1'` ; montant `''` (vide ≠ null ≠ 0) ; `poids` **0** (division par zéro) ; date 2023 |
| c06 | code `1` **nombre** ; montant `'1 234,5'` en français ; date 2025 |
| c07 | code `1` nombre ; montant **négatif** ; « Sete » sans accent face à « Sète » |
| c08 | `2A` (un code alphanumérique, jamais un nombre) ; 29 février |
| c09 | `2A` ; montant `'3,75'` |
| c10 | code `''` : n'apparie rien, pas même la ligne « Vide » de droite ; région `null` |
| c11 | code `null` ; date `null` ; région `null` |
| c12, c13 | code `02`, présent DEUX fois à droite : la jointure les duplique, la somme gonfle de 12 + 8 |
| c14 | date 2023 complète : hors 2024 |
| c15 | `2B`, date `2025-03` : hors 2024 |
| c16 | `poids` 0 (division par zéro) |
| c17 | `'010'` : ni `10` ni `1` |
| c18–c20 | des lignes ordinaires ; c19 un zéro ; c20 le plus gros montant |
| c21 | montant `null`, `tags` `null`, date vide, région `null` — une ligne presque vide |
| c22 | montant `''` ; date `2024` seule |
| c23–c30 | des lignes ordinaires, dates partielles ou complètes, tags variés |
| c31 | montant `null` ; part `null` |
| c32 | montant `''` ; région `null` |
| c33, c34 | apostrophes dans le libellé (« Côte-d'Or », « Côtes-d'Armor ») |
| c35 | troisième `2A` |
| c36 | quatrième `01` |
| c37 | code `''` ET libellé `''` |
| c38 | code `null` ET libellé `null` |
| c39, c40 | des lignes ordinaires ; c40 daté `2025` seul |

## Ajouter un jeu

1. Écrire le fichier ici, tableau d'objets, une ligne par enregistrement.
2. L'importer dans le `fixtures*.ts` de son domaine (`import x from './jeux/<nom>.json'
   with { type: 'json' }`) et l'exposer sous le nom que le manifeste lui donne.
3. Dire ici pour quoi il est taillé. Un jeu que personne ne lit fait tomber
   `tests/oracle/jeux.test.ts`.
