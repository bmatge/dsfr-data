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

## Domaine `transformations`

| Fichier | Lignes | Taillé pour |
|---|---|---|
| `transformations-territoires.json` | 12 | `statut` porte les trois états qu'un filtre confond : renseigné, chaîne VIDE, `null`. `taux` en décimale française. `code` à zéro de tête (`0042`). `nom` avec accents, apostrophe et esperluette. `mesure` mêle nombres et « NC » — la paire mixte que les comparaisons d'ordre rangent en texte. `tags` multivalué. |
| `transformations-brutes.json` | 8 | Normalisation : chaînes à convertir (`'1 234,5'`, `''`), valeurs à arrondir, colonnes à renommer, libellés à remplacer (`N/A`, `n.d.`), champs multivalués à découper (`eau\|air`), colonnes Oui/Non parallèles à replier. |
| `transformations-calculs.json` | 6 | Colonnes calculées : un dénominateur NUL, un opérande ABSENT (`null`), une cellule VIDE face à un zéro, une date ISO, un champ TABLEAU (dont un vide), des libellés à capitaliser, rogner, remplacer. |
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

## Le canari (#882)

Un jeu taillé pour **chaque piège que le banc a payé** — une valeur qui a l'air d'une
autre — et un contrôle par piège dans `tests/verif-donnees/canari.ts`, chacun citant le
registre du banc. C'est la première chose qu'un contributeur rejoue.

| Fichier | Lignes | Taillé pour |
|---|---|---|
| `canari.json` | 40 | Neuf colonnes, chaque ligne décrite ci-dessous. |
| `canari-ref.json` | 7 | La table de droite d'une jointure sur `code` : `01`, `02` **deux fois** (le doublon volontaire, PG-001), `1` (sans zéro de tête), `2A`, `''` (une clé vide qui ne doit rien apparier) et `99` (sans ligne à gauche). |
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
