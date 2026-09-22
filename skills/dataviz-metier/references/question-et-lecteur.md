# Quelle question, pour quel lecteur

> Avant la première balise : à quoi ce bloc répond-il, qui le lit, et que doit-il retenir ?
>
> Déclencheurs : quelle question, quel lecteur, message, objectif de la page, à quoi sert ce graphique, hors objet, indice de synthèse, score moyen
>
> Niveaux : base (§ quatre lignes, via niveau-base), intermédiaire (§ lecteur), avancé (§ Score moyen, § hypothèses)

## Les quatre lignes à écrire avant de coder

Chaque fiche d'audit du banc commence par le même bloc, écrit **avant** la reproduction
(`docs/portail-sports/portrait-federation.md` § 1, et les 55 autres) :

| Ligne | Exemple (portrait de fédération, data.sports.gouv.fr) |
|---|---|
| **Question** | « Que pèse ma fédération, qui y joue, où, et comment se situe-t-elle dans son groupe ? » |
| **Message** | « Une fiche par fédération, toujours mise en regard de son groupe — c'est le fil conducteur » |
| **Ce que l'usager obtient** | volume et évolution des licences, géographie, profil, établissements, financements, comparaison |
| **Hors objet** | aucune donnée à la commune, aucune série de financements dans le temps |

Un bloc qui ne tient pas dans ces quatre lignes n'a pas encore de raison d'exister. « Hors
objet » est la ligne la plus utile : elle empêche d'ajouter une carte parce que le jeu a des
coordonnées.

## Le lecteur décide de la forme, pas la donnée

- **Un explorateur** (lecteur qui cherche *sa* valeur : sa commune, sa fédération) veut des
  filtres, un titre qui répète son choix, un tableau triable. Gestes : `dsfr-data-context` +
  `dsfr-data-context-value template="Résultats pour {{departement}}" fallback="…toute la
  France"` (0.27.0) ; `dsfr-data-list sort search`.
- **Un lecteur de rapport** (qui veut *le* message) veut quatre repères nommés et une phrase,
  pas 119 graphiques. Gestes : `dsfr-data-kpi-group` de trois ou quatre KPI titrés, un graphique
  par message, `dsfr-data-a11y description`.
- Les deux coexistent souvent sur une page : la refonte du Baromètre France Num
  (`viz/barometre-france-num-v2.html`) met la synthèse d'abord (quatre repères), le parcours par
  chapitre ensuite (menu latéral + accordéons), l'explorateur comparatif en dernier. Les trois
  directions d'une maquette de refonte n'étaient pas un choix à faire mais trois pièces d'un même
  dispositif.

## Le cas d'école : un « Score moyen » qui ne mesurait rien

La première reproduction du Baromètre France Num (`viz/barometre-france-num.html`) affichait :

```html
<dsfr-data-kpi source="bfn-f" value="score:avg" format="decimal"
  heading="Score moyen" label="% des répondants"></dsfr-data-kpi>
```

Le jeu `questions-reponses` porte **un score par question × réponse × année × région × secteur
× taille** : la part des répondants ayant choisi *cette* réponse à *cette* question. Le KPI
moyennait 1 065 couples question-réponse — la part de « Tout à fait d'accord » à « le numérique
me fait gagner du temps » avec la part de « Non » à « avez-vous un site web ». Une moyenne de
parts de répondants à des questions différentes n'a **aucun sens statistique**, et l'étiquette
« % des répondants » suggérait qu'elle en avait un. La balise était correcte ; le chiffre était
faux depuis le premier jour. Relevé par la revue critique du lot Bercy
(`docs/revue-critique/constats.json`, « redactionnel / moyenne »).

Ce que la refonte a fait à la place, et qu'il faut refaire chaque fois qu'un « indice de
synthèse » tente :

1. **Quatre repères nommés** (questions 501, 801, 923, 1006 : perception, IA, cybersécurité,
   connectivité), choisis pour leur lisibilité — un choix éditorial **assumé et écrit**.
2. **Chaque repère a sa propre règle de calcul, tirée du jeu.** Le champ `valeurs_dans_calcul`
   de l'enquête dit quelles modalités s'additionnent : la 501 somme « Tout à fait d'accord » et
   « Plutôt d'accord » (75,8 % en Bretagne) ; la 1006 ne retient que « Très satisfaisant »
   (22,9 %) — additionner les deux niveaux de satisfaction aurait donné 75,2 % et dit tout autre
   chose. Geste : `dsfr-data-query where="code_unifie:eq:501, libelle_reponse:in:…"
   aggregate="score:sum"` par repère, pas un `avg` global.
3. **L'alternative écartée est écrite** : un « indice de maturité numérique » supposerait de
   pondérer des questions hétérogènes selon une échelle que personne n'a définie.

Règle : **avant tout `champ:avg`, demander ce qu'est une ligne.** Si une ligne est un objet
(une entreprise, un établissement), la moyenne d'un attribut numérique a un sens. Si une ligne
est déjà une part, un taux, un score par modalité, la moyenne n'en a pas — voir
[echelles-honnetes](echelles-honnetes.md).

## Le même réflexe sur un compteur

Sur un jeu où une ligne est une **mesure datée** (un établissement × une semaine), le compteur
d'une facette « Lille 326 879 » classe Lille devant Versailles alors que Versailles a plus de
visites : il compte des lignes d'observation, pas des usages (AM-051, DNMA). Geste :
`dsfr-data-facets weight-field="visites"` (0.27.0, client seulement) — le compteur affiche la
somme d'une mesure et le tri suit. Ou ne pas afficher de compte du tout (`hide-counts`) quand il
ne répond à aucune question.

## Quand la question n'a pas de réponse dans le jeu

- **Les balances comptables des collectivités** (OFGL, LIM-007) : des millions de lignes, un
  compte par ligne. « Dépenses de fonctionnement » est une combinaison de comptes M57 que seul
  l'OFGL connaît et publie déjà calculée. Une carte bâtie sur les balances aurait l'apparence
  d'un chiffre officiel et serait fausse. La page du banc l'explique au lieu de dessiner.
- **Le même indicateur sur trois jeux** (LIM-015, portrait de territoire Sports) : 333 629,
  331 677 et 333 635 équipements « en France » selon le jeu lu. Choisir **un** jeu par indicateur
  et l'écrire ; un ratio dont le numérateur et le dénominateur viennent de deux jeux différents
  (49,0 affiché, 48,8 sur le jeu du territoire) n'est pas un ratio.
- **La liste codée en dur contredite par la donnée** (FP-005, annuaire DGFiP) : le portail
  affichait cinq services pour les professionnels ; 16 173 lignes en proposent un sixième. Les
  facettes calculées sur la donnée avaient raison contre le texte. Quand la page et la donnée se
  contredisent, c'est la page qu'on corrige.

## Écrire ses hypothèses pour qu'on puisse les contester

La refonte du Baromètre se termine par une section `<section id="hypotheses">` « Notes — les
hypothèses éditoriales » : sept choix numérotés, chacun avec ce qui a été écarté et pourquoi
(« Ce qui bouge le plus » est calculé par `order-by`, pas choisi à la main — conséquence
assumée : le classement peut remonter une réponse peu parlante). C'est le contraire d'un
graphique qui prétend être la donnée : c'est une lecture, signée. Copier le motif.
