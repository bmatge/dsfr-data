---
name: dataviz-metier
description: Le regard d'une agence de dataviz et d'un datajournaliste sur une visualisation de données publiques DSFR, avant d'en écrire la syntaxe dsfr-data — trouver l'histoire dans un jeu (l'écart, la rupture, l'exception, la concentration, le paradoxe), choisir l'angle et hiérarchiser les messages, structurer une page comme un récit (synthèse puis détail, accroche, preuve, nuance, exploration, conclusion), choisir la forme qui raconte (contraste, petits multiples, base 100, avant/après, barres triées, taux plutôt que volumes, tableau ou texte quand ils battent le graphique), écrire des titres-messages, et rester honnête (échelles, moyennes de taux, sens des variations, ce qu'on ne montre pas, tableau équivalent). Trois niveaux d'effort — base, intermédiaire, avancé — selon qu'on livre un graphique, un bloc ou une page. À charger dès qu'il faut concevoir, raconter, relire ou critiquer une dataviz d'open data (Opendatasoft, data.gouv, INSEE) et pas seulement la coder.
---

# dataviz-metier — raconter avant de dessiner, le sens avant la syntaxe

> Déclencheurs : quelle question, quel lecteur, quel graphique choisir, bonne forme, forme trahit, part ou évolution, écart ou niveau, trouver l'histoire, quelle histoire, angle éditorial, quel angle, trouver l'angle, storytelling, data storytelling, récit de données, raconter les données, raconter une histoire, narration, hiérarchie des messages, message principal, et alors, ordre des blocs, structure narrative, plan narratif, synthèse puis détail, ce qu'il faut retenir, conclusion de la page, accroche, titre-message, titre affirmatif, titre descriptif, sous-titre de méthode, chapô, formulation prudente, corrélation causalité, mise en évidence, mettre en évidence, en évidence, focus et contexte, contraste, griser le reste, grise, petits multiples, un graphique par question, courbe de pente, slope chart, base 100, indice base 100, avant après, barres triées, taux plutôt que volume, absolu et relatif, échelle humaine, pour 1 000 habitants, KPI ou graphique, tableau plutôt que graphique, texte plutôt que graphique, ne rien montrer, dashboard fourre-tout, camembert par défaut, anti-pattern éditorial, échelle honnête, axe tronqué, double axe, moyenne de pourcentages, moyenne non pondérée, score moyen, indice de synthèse, sens de la variation, bonne nouvelle, phrase de lecture, annotation, ligne de référence, cible, tableau équivalent, lecture accessible, ce qu'on ne montre pas, données manquantes, non renseigné, groupe null, troncature silencieuse, représentativité, échantillon, cumul de filtres, relecture éditoriale, regard éditorial, datajournalisme, critique de dataviz, relire une page, cas d'école, niveau d'effort, quel niveau, niveau base, niveau intermédiaire, niveau avancé, profondeur de la demande, dataviz simple, version rapide, en profondeur

Skill **écrite à la main** (ADR-136 ; sa source est ce dossier). La skill technique
[`dsfr-data`](../dsfr-data/SKILL.md) dit *comment* écrire une balise ; celle-ci dit *quoi*
raconter, *pourquoi*, dans *quel ordre*, et *ce que ça coûte de se tromper*. Chaque règle est
ancrée dans un cas réel du banc d'essai [open-data-viz](https://github.com/bmatge/open-data-viz)
(66 pages reproduites depuis trois portails de l'État, 187 constats — identifiants `AM-0XX`,
`BUG-0XX`, `LIM-0XX`, `PG-0XX`, `AV-0XX`) et traduite en **geste `dsfr-data`** quand un attribut
porte la réponse. Un attribut cité ici se revérifie dans la référence générée avant d'être écrit.
Le gabarit de page (familles A/B/C/D, place des filtres) vit dans
[`pagePatterns`](../dsfr-data/references/page-patterns.md) ; la forme et la couleur en général
(double axe, palettes, validateur daltonien) dans le skill `dataviz` livré avec Claude Code. Ni
l'un ni l'autre ne sont dupliqués ici.

## Choisir le niveau — avant d'ouvrir une référence

Ce fichier est le seul lu d'emblée. Chaque référence est autonome ; on n'ouvre que celles du niveau.

| Niveau | Pour quoi | Références à ouvrir | Ce qu'on livre |
|---|---|---|---|
| **Base** | *une* dataviz : un graphique, une carte, un KPI | **une seule** : [niveau-base](references/niveau-base.md) | la question en une ligne, la forme et pourquoi, un titre-message, source et date, les quatre pièges d'honnêteté les plus coûteux, cinq vérifications |
| **Intermédiaire** | un bloc ou une petite page : trois à six visualisations qui se répondent | **deux à trois** : [trouver-l-histoire](references/trouver-l-histoire.md), [choisir-la-forme](references/choisir-la-forme.md), [grille-de-relecture](references/grille-de-relecture.md) § intermédiaire — et [structure-narrative](references/structure-narrative.md) si les blocs s'enchaînent en page | un angle, un message par bloc dans l'ordre de l'argument, une série mise en évidence, la phrase de lecture de chaque bloc, ce qu'on ne montre pas, dit |
| **Avancé** | une page ou un récit complet : rapport, portrait, tableau de bord éditorial, refonte | les précédentes, puis **au besoin** la table de routage ci-dessous et le [cas d'école](references/cas-d-ecole-portrait-federation.md) | l'exploration qui a trouvé l'histoire, l'angle retenu et les angles écartés, un plan de page narratif, petits multiples ou un graphique par question, les hypothèses éditoriales écrites, la conclusion, la grille complète |

**Signaux** — base : un seul objet (« un graphique de », « un KPI », « une carte des »), un champ,
une dimension, aucun mot de récit. Intermédiaire : « un bloc », « une section », « quelques
graphiques », « comparer », deux à six vues, un public nommé sans mot de récit. Avancé : « page »,
« rapport », « portrait », « tableau de bord », « raconter », « histoire », « récit »,
« expliquer », « convaincre », « pour le grand public / les élus / la presse », plus de six vues,
une refonte, la relecture d'une page entière.

**Règle de déclenchement.** Signaux clairs → choisir le niveau et **l'annoncer en une ligne**
(« Niveau base : un graphique, un message »), sans demander. Signaux absents ou contradictoires →
**poser la question avant de commencer**, dans la réponse elle-même : courte, trois options
nommées, une recommandation déduite du prompt — « Vous voulez (a) un graphique juste et titré,
(b) un bloc de trois ou quatre vues qui comparent, ou (c) une page qui raconte l'évolution ?
D'après votre demande, je recommande (b). » Là où aucune réponse ne peut arriver (builder-IA,
serveur MCP, génération en un tour) : **niveau intermédiaire par défaut, annoncé** en tête de la
réponse, avec la phrase qui permet de monter ou descendre d'un niveau au tour suivant. Une page
avancée relit chaque bloc au niveau base.

## Table de routage — quelle situation, quelle référence

| Situation | Référence |
|---|---|
| Un KPI, un graphique, une carte à livrer vite et juste | [niveau-base](references/niveau-base.md) |
| « Que raconte ce jeu ? » — explorer, repérer l'écart, la rupture, l'exception, la concentration, le paradoxe ; choisir l'angle, hiérarchiser | [trouver-l-histoire](references/trouver-l-histoire.md) |
| Écrire les quatre lignes (question, message, ce que l'usager obtient, hors objet) ; explorateur ou lecteur de rapport ; « Score moyen » et autres indices de synthèse | [question-et-lecteur](references/question-et-lecteur.md) |
| Ordonner une page : synthèse puis détail, accroche → preuve → nuance → exploration → conclusion, transitions | [structure-narrative](references/structure-narrative.md) |
| Quelle forme pour quelle relation ; contraste, petits multiples, base 100, avant/après, pente, barres triées, taux ou volume, tableau ou texte ; ce que `dsfr-data` sait et ne sait pas faire | [choisir-la-forme](references/choisir-la-forme.md) |
| Les cas de forme payés par le banc : 236 lignes, barre d'écart, part qui se calcule, trois points, bar-line, radar | [forme-cas-du-banc](references/forme-cas-du-banc.md) |
| Titre-message, sous-titre de méthode, chapô, formulations prudentes, vocabulaire du lecteur | [titres-et-mots](references/titres-et-mots.md) |
| Phrase de lecture calculée, repère et cible dessinés, titre qui reprend le filtre, source et date lues dans la donnée | [annotation](references/annotation.md) |
| Axe, double axe, moyenne de taux, arrondi avant pondération, compte approximatif | [echelles-honnetes](references/echelles-honnetes.md) |
| Sens de la variation, couleur automatique, cumul qui recule, légende qui ment | [sens-des-variations](references/sens-des-variations.md) |
| Groupe null, troncature, lignes sans code, jeu vide, échantillon qui fond, agrégat sans sens | [ce-qu-on-ne-montre-pas](references/ce-qu-on-ne-montre-pas.md) |
| Tableau équivalent lisible, description, titres, région live | [accessibilite-comme-sens](references/accessibilite-comme-sens.md) |
| Le dashboard fourre-tout, le graphique qui répète le KPI, la carte parce qu'il y a des coordonnées, le camembert par défaut, le titre = nom du jeu, la page sans conclusion, douze KPI de même poids | [anti-patterns](references/anti-patterns.md) |
| Le raisonnement complet sur un jeu réel, de la question au plan de page | [cas-d-ecole-portrait-federation](references/cas-d-ecole-portrait-federation.md) |
| Avant de livrer : cinq, dix ou dix-huit vérifications selon le niveau | [grille-de-relecture](references/grille-de-relecture.md) |

## Règles transverses

- **Un message par bloc, et le bloc le dit en titre.** « Les licences féminines progressent deux
  fois plus vite » et non « Licences par sexe ». Titre dans `databox-title`, mesure dans
  `value-field="champ:Libellé"`, phrase de lecture dans `dsfr-data-a11y description`.
- **L'ordre des blocs est l'ordre de l'argument**, pas l'ordre des colonnes du jeu.
- **Le contraste est le moteur.** Une série mise en évidence, le reste grisé
  (`selected-palette="neutral"` + `highlight-index`, ou `color-map` sur la série nommée).
- **Une moyenne de pourcentages n'existe pas.** Ratio de sommes en KPI
  (`value="n:sum{sexe:eq:F} / n:sum"`), résumé de carte pondéré (`map-summary="weighted"`
  `map-summary-weight="effectif"`). Jamais `champ:avg` sur des taux.
- **La couleur suit le sens déclaré, jamais le signe** (`color:"auto"` est vert dès que ≥ 0).
- **Nommer n'est pas écarter** : `empty-label` rend visible le groupe null, `where isnotnull`
  l'écarte ; les deux sont éditoriaux, le dire en page.
- **Un chiffre sans sa base est une opinion** : source, date, effectif, période lus dans la donnée.
- **Les hypothèses et les angles écartés s'écrivent** en fin de page pour pouvoir être contestés.
- **Vérifier au navigateur, et comparer la légende au graphique.**

## Ce que ce skill ne fait pas

Il ne remplace ni la référence des attributs (skill `dsfr-data`, générée depuis le code — la
grammaire d'un attribut s'y vérifie, jamais de mémoire), ni la méthode de forme et de couleur du
skill `dataviz`. Il ne connaît que ce que le banc a rencontré : une règle absente ici n'est pas
une règle fausse, c'est un cas non rencontré.
