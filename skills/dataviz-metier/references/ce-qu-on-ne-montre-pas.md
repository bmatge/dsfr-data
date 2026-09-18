# Ce qu'on ne montre pas — et pourquoi il faut le dire

> Groupe null, troncature silencieuse, lignes sans code géographique, clé hors référentiel, jeu vide, échantillon réduit par le cumul des filtres, données manquantes qui ne sont pas des zéros, agrégat sans sens : le graphique montre ce qui reste, la page doit dire ce qui manque.
>
> Déclencheurs : ce qu'on ne montre pas, données manquantes, non renseigné, groupe null, valeurs nulles, troncature, max-records, tronqué en silence, lignes ignorées, carte muette, hors référentiel, jeu vide, aucun résultat, échantillon, représentativité, cumul de filtres, données manquantes zéro, agrégat sans sens, attendre un filtre

## Le groupe null : nommer ou écarter, mais décider

Chaque `count(*) … group_by champ` remonte une ligne à clé vide : 399 sources, 3 724 natures,
27 451 procédures sur les marchés publics ; 21 projets sur 3 080 en « Série 4 » dans un camembert
du plan de relance (PG-015, AM-005). L'`ods-chart` de l'original **écarte** ce groupe en silence,
d'où des écarts de chiffres avec le portail.

Deux gestes, deux lectures — vérifiés au navigateur le 2026-09-19 (dsfr-data 0.30.0) :

| Geste | Effet | Quand |
|---|---|---|
| `empty-label="Non renseigné"` sur `dsfr-data-chart` (0.21.1) | une quatrième barre nommée « Non renseigné » ; le total du graphique = le total du KPI | quand la part de non-réponse **est** une information (5,5 % de signalements sans département) |
| `where="champ:isnotnull"` sur la query, `where="champ is not null"` sur la source ODS | trois barres ; parité avec l'original | quand on compare aux chiffres du portail, ou que le null est un défaut de saisie sans sens |

Dans les deux cas, **le dire** : dans `description`, ou en légende (« 21 projets sans type
d'entreprise, non représentés »). Côté client la clé vide ressort en `''`, pas en `null` : un
`isnull` posé en aval ne l'attrape pas (PG-015). Le tableau `a11y` rend la cellule vide même
avec `empty-label` (vérifié) — voir [accessibilite-comme-sens](accessibilite-comme-sens.md).

## La troncature silencieuse : trois plafonds

| Plafond | Symptôme | Cas | Geste |
|---|---|---|---|
| `max-records` (1 000 par défaut, adaptateur ODS) | 1 000 lignes sur 3 080 : KPI et carte faux « avec l'aplomb de chiffres justes » (AM-002) ; un plafond **explicite** trop bas (400 pour 435 groupes) jette 35 groupes | plan de relance, patronymes des écoles | relever le volume réel à l'API **avant** de poser la source ; `max-records` explicite ; la 0.29 avertit en console et `meta.truncated` — invisible dans la page |
| `limit` d'une query lue par un KPI `count` | « 12 activités » pour 28 (PG-017) | trois annuaires, sept lots | `value="meta:total"` (0.22.0), ou une query jumelle sans `limit` |
| `max-items` d'une couche carte (5 000) | 5 000 stations dessinées sur 9 805, bandeau « zoomez » qui ne charge rien (PG-013) | carburants, DGFiP (77 % manquants) | `max-items="20000"` avec `cluster` |

Règle : **un compte affiché se recoupe à l'API** (`/records?limit=0` → `total_count` ; sur un
`group_by`, compter les lignes de l'export). Une page qui charge sans erreur n'a rien prouvé.

## Les lignes que la carte ne dessine pas

- Signal Conso : le groupe `dep_code = null` porte **95 309 signalements, 5,5 % du total**. La
  carte les écarte ; le KPI au-dessus compte 1 733 022. Deux chiffres qui ne se recoupent pas sur
  la même page, sans mention (AM-027, corrigé : `getSkippedCount()` et avertissement).
- Une clé **hors référentiel** (code INSEE `44` là où `map-reg` attend `PDL`, académie
  accentuée « Orléans-Tours » là où la clé est `ORLEANS-TOURS`) rend une carte **grise ou
  partiellement muette avec zéro écart signalé** (BUG-008, ouvert en 0.30). Sur DNMA, 9
  académies sur 35 tomberaient. Relever la clé attendue par le type de carte (skill `dsfr-data`,
  `chartTypes`) et compter à l'API les lignes qui n'y sont pas.
- 43 479 lignes, 11 113 établissements, **une seule coordonnée** : une carte qui se comporte
  normalement et ne dit rien (AM-069, signalé en console depuis 0.29.0).

Geste : à côté d'une carte, un KPI du total **et** la phrase « N lignes sans localisation, non
représentées » — calculée (`value="count" where="dep_code:isnull"`), pas écrite.

## Données manquantes ≠ zéro

- `diff` rend `null` pour la première ligne et pour toute ligne non numérique, « jamais 0 — un
  incrément inconnu n'est pas un incrément nul » (JSDoc, vérifié : première cellule vide). Sur
  TNE, le mois publié deux fois dont l'exemplaire est vide donne **deux barres absentes**, pas
  deux zéros (LIM-016). Ne pas combler.
- Un jeu peut être **vide** : `donnees-sessions-formations-france-num` a 22 colonnes, 8
  facettes déclarées, zéro enregistrement. La page affiche « aucun résultat », le même message
  qu'une recherche trop restrictive (LIM-005). Vérifier `total_count` à l'API avant de bâtir, et
  écrire en page « ce jeu ne contient aucune donnée » plutôt que laisser l'usager filtrer.
- Deux colonnes pour la même information : `reg_name` vide 30 fois sur 225, `nom_officiel_region`
  3 fois (PG-006). Compter les nulls de chaque candidate avant de choisir ; une facette sur la
  mauvaise écarte 13 % des lignes en silence.
- Doublons de casse et d'encodage (« Appel d offres ouvert » / « Appel d'offres ouvert »,
  « Loisirs et Transports » / « Loisirs et transports ») : la qualité du jeu n'est réparable par
  aucun des deux outils (LIM-003). Soit les fusionner en amont et le dire, soit les montrer tels
  quels et le dire — jamais l'un sans l'autre.

## L'échantillon fond quand les filtres se cumulent

Le Baromètre France Num est une **enquête** : le jeu porte `poids_reponse` et `poids_question`,
qu'aucune des deux pages du banc n'affiche — c'est une lacune connue, pas une règle. Un profil
région × secteur × taille repose sur quelques dizaines de répondants ; un écart de 8 points n'y
signifie pas la même chose qu'au niveau national. Gestes disponibles : afficher l'effectif de
la sélection à côté des repères (`dsfr-data-kpi value="count"`, ou la somme d'un champ
d'effectif quand il existe), `dsfr-data-search count count-label`, et **exclure du classement
les questions qui décrivent l'échantillon** : filtrer sur la Bretagne met « Bretagne » à 100 %
contre 5,1 % à la question « Région » — un écart de +94,9 points qui n'est que le reflet du
filtre (questions 201, 202, 203 exclues par `where="not (code_unifie in (201, 202, 203))"`).

## L'agrégat global qui n'a pas de sens

Additionner toutes les cases d'une déclaration de revenus donne une courbe sur 19 388 lignes
hétérogènes et un « pic de déclarants » qui ne désigne rien (AM-035). `require-where` sur la
source ou la query (0.25.0) : aucune requête tant que l'usager n'a pas choisi, les afficheurs
rendent `idle-message` — un comportement à la place d'un texte d'aide. Même logique pour les
balances comptables (LIM-007) : sans règle d'agrégation métier publiée, pas de carte.

## Le résidu se publie

Le banc tient une page `viz/non-reproduites.html` et un statut par dataviz dans son registre :
ce qui n'a pas pu être montré (jeu supprimé, visibilité restreinte, règle métier absente) y est
écrit avec la raison. Sur une page publique, la même honnêteté tient en une ligne sous le
graphique. Le résidu est le livrable, pas l'échec.
