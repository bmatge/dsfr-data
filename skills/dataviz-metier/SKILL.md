---
name: dataviz-metier
description: Le regard d'une agence de dataviz et d'un datajournaliste sur un graphique, une carte ou un KPI DSFR avant d'en écrire la syntaxe dsfr-data — quelle question il pose et pour quel lecteur, quelle forme sert cette question, échelles et moyennes honnêtes, sens des variations, phrase de lecture, tableau équivalent comme lecture, ce qu'on ne montre pas (nulls, troncature, échantillon). À charger dès qu'il faut concevoir, choisir, relire ou critiquer une visualisation de données publiques (open data, Opendatasoft, data.gouv) et pas seulement la coder.
---

# dataviz-metier — le sens avant la syntaxe

> Déclencheurs : quelle question, quel lecteur, quel graphique choisir, bonne forme, forme trahit, part ou évolution, écart ou niveau, échelle honnête, axe tronqué, double axe, moyenne de pourcentages, moyenne non pondérée, score moyen, indice de synthèse, sens de la variation, bonne nouvelle, phrase de lecture, annotation, ligne de référence, cible, tableau équivalent, lecture accessible, ce qu'on ne montre pas, données manquantes, non renseigné, groupe null, troncature silencieuse, représentativité, échantillon, cumul de filtres, relecture éditoriale, datajournalisme, data storytelling, critique de dataviz, relire une page

Skill **écrite à la main** (elle n'est pas générée depuis le code : sa source est ce dossier). Elle
complète la skill technique [`dsfr-data`](../dsfr-data/SKILL.md), qui dit *comment* écrire une
balise ; celle-ci dit *quoi* montrer, *pourquoi*, et *ce que ça coûte de se tromper*. Chaque règle
est ancrée dans un cas réel du banc d'essai [open-data-viz](https://github.com/bmatge/open-data-viz)
(66 pages reproduites depuis trois portails de l'État, 187 constats vérifiés au navigateur ou à
l'API, registre `public/data/retours.json`) et, quand un attribut porte la réponse, traduite en
**geste `dsfr-data`** vérifié dans la version indiquée.

Le **gabarit de la page** — quelle famille de page pour quelle question, où vont les filtres,
dans quel ordre le lecteur descend — est traité par la fiche
[`pagePatterns`](../dsfr-data/references/page-patterns.md) de la skill `dsfr-data` : la question
posée ici (« quelle question, pour quel lecteur ») est ce qui détermine la famille là-bas.

Pour la **forme et la couleur** en général (règle du double axe, palettes séquentielles /
divergentes, marques, validateur daltonien), le skill `dataviz` livré avec Claude Code fait
autorité et n'est pas dupliqué ici : ce skill-ci est le regard **éditorial**, ancré DSFR et dans
les données publiques françaises.

## Méthode : sept questions, dans cet ordre

Les poser **avant** d'ouvrir la référence d'un composant. Une page qui passe tous les compteurs
automatiques peut rester fausse ou illisible ; ces sept questions sont ce que les compteurs ne
voient pas.

| # | Question | Référence | Le cas qui l'a payée |
|---|---|---|---|
| 1 | **Quelle question** ce bloc répond-il, pour **quel lecteur** ? Quel est le message en une phrase ? | [question-et-lecteur](references/question-et-lecteur.md) | Un KPI « Score moyen » qui moyennait 1 065 parts de répondants à des questions différentes |
| 2 | Quelle **forme** sert la question — et laquelle la trahit ? Une part n'est pas une évolution, un écart n'est pas un niveau | [forme](references/forme.md) | Un graphique de 236 lignes illisible, remplacé par 103 graphiques d'une question chacun |
| 3 | L'**échelle** est-elle honnête ? Axe, double axe, moyenne de taux, arrondi avant pondération | [echelles-honnetes](references/echelles-honnetes.md) | Une carte annonçant 4,27 % « en France » pour 5,6 % réels (moyenne non pondérée) |
| 4 | Dans quel **sens** lit-on la variation ? Au-dessus de la moyenne n'est pas toujours une bonne nouvelle | [sens-des-variations](references/sens-des-variations.md) | `sens_de_l_augmentation` : 5 questions où monter est défavorable, 17 neutres |
| 5 | Quelle **phrase de lecture** accompagne le graphique ? Titre, repère, source, date | [annotation](references/annotation.md) | « 75,8 % contre 71,2 % » calculé dans la donnée plutôt que laissé au lecteur |
| 6 | Le **tableau équivalent** est-il une lecture, pas une case à cocher ? | [accessibilite-comme-sens](references/accessibilite-comme-sens.md) | Un tableau à une ligne par (année × série) là où le graphique montre trois courbes |
| 7 | Qu'est-ce qu'on **ne montre pas**, et l'a-t-on dit ? Nulls, troncature, échantillon, données manquantes ≠ zéro | [ce-qu-on-ne-montre-pas](references/ce-qu-on-ne-montre-pas.md) | 1 000 lignes affichées sur 3 080, sans erreur ; 95 309 signalements sans département absents de la carte |

Puis, avant de livrer : la [grille de relecture](references/grille-de-relecture.md) — douze
vérifications, chacune avec le geste qui la règle.

## Règles transverses

- **Le titre est une phrase, pas un nom de champ.** « Part des femmes parmi les licenciés, 2024 »
  et non « lics_dep_sexe ». Le libellé de série se pose dans `value-field="champ:Libellé"`, le
  titre dans `databox-title`, la phrase de lecture dans `dsfr-data-a11y description`.
- **Une moyenne de pourcentages n'existe pas.** Une part est un ratio de sommes :
  `value="n:sum{sexe:eq:F} / n:sum"` (KPI, 0.29.0) ; un résumé de carte de taux est pondéré :
  `map-summary-weight="effectif"` (0.29.0). Jamais `champ:avg` sur des taux.
- **La couleur suit le sens déclaré, jamais le signe.** `color:"auto"` d'une ligne de KPI est
  vert dès que la valeur est ≥ 0 — faux sur « temps perdu ». Lire le sens dans le jeu quand il
  le porte, le poser dans la donnée par `compute` sinon.
- **Nommer n'est pas écarter.** `empty-label="Non renseigné"` rend visible le groupe null ;
  `where="champ:isnotnull"` l'écarte. Les deux sont des choix éditoriaux ; le dire en page.
- **Un chiffre affiché sans sa base est une opinion.** Effectif, période, source, date de la
  donnée : `databox-source`, `databox-date-field`, `dsfr-data-search count count-label`,
  `value="meta:total"`.
- **Ce que le jeu ne sait pas calculer, la page ne l'invente pas.** Une donnée brute sans règle
  d'agrégation métier (balances comptables, cases d'une déclaration) attend un filtre
  (`require-where`) ou une règle publiée — pas une courbe.
- **Chaque hypothèse éditoriale est écrite pour pouvoir être discutée.** Une section « Notes —
  les hypothèses éditoriales » en fin de page : ce qui a été choisi, ce qui a été écarté, pourquoi.
- **Vérifier au navigateur, et comparer la légende au graphique.** Quinze pastilles de légende
  ont contredit leurs barres pendant des lots entiers sans qu'aucun compteur ne le voie.

## Ce que ce skill ne fait pas

Il ne remplace ni la référence des attributs (skill `dsfr-data`, générée depuis le code — la
grammaire d'un attribut s'y vérifie, jamais de mémoire), ni la méthode de forme et de couleur du
skill `dataviz`. Il ne connaît que ce que le banc a rencontré : une règle absente ici n'est pas
une règle fausse, c'est un cas non rencontré.
