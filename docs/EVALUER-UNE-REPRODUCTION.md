# Évaluer une reproduction faite avec dsfr-data

> Cette page ne parle pas des composants : elle parle de **la façon de les juger**. Elle s'adresse à
> qui reproduit une page existante avec `dsfr-data` — un portail Opendatasoft, un tableau de bord
> interne — et doit ensuite dire ce qui manque à la bibliothèque. C'est aussi la page à lire avant
> de déposer une issue, humain ou agent.
>
> Les six règles qui suivent viennent d'un banc d'essai réel
> ([open-data-viz](https://github.com/bmatge/open-data-viz), deux portails Opendatasoft, treize lots,
> 144 constats). Elles ont toutes été apprises en se trompant, et le coût de l'erreur est mesuré :
> à la relecture, sur 16 constats contestés, **11 visaient une capacité qui existait déjà**, et la
> première règle a fait retirer **douze critiques** au banc lui-même.

## 1. Est-ce la bibliothèque, ou d'avoir voulu transposer un autre modèle ?

**C'est la règle la plus rentable.** Avant de classer quoi que ce soit en limite, se demander si le
problème vient de `dsfr-data` ou de la décision d'avoir transposé à l'identique le modèle du produit
d'origine.

Opendatasoft impose un contexte unique : une page, un jeu, un état de filtrage global.
`dsfr-data` ne l'impose pas — plusieurs architectures sont possibles, et certaines n'ont pas
d'équivalent en face (plusieurs sources indépendantes sur une page, un `dsfr-data-context` par
famille de filtres, un pipeline de transformation entre la source et l'afficheur). Transposer le
modèle d'origine puis imputer à la bibliothèque le coût de cette transposition produit des critiques
fausses, et elles sont nombreuses.

La question opérationnelle : *si je repartais du besoin de la page plutôt que de sa réalisation
actuelle, l'obstacle existerait-il encore ?* Si la réponse est non, ce n'est pas un constat.

## 2. Quatre verdicts, à ne jamais confondre

Une même observation — « ça ne marche pas » — recouvre quatre situations qui n'appellent pas les
mêmes suites. Les confondre est ce qui remplit un rapport de faux manques.

| Verdict | Ce que c'est | Ce qu'on en fait |
|---|---|---|
| **Natif** | La capacité existe dans la version chargée | Faux problème. Rien à déposer. |
| **Natif, mais postérieur à la version chargée** | Elle existe dans le code, pas dans le paquet installé | Une montée de version chez l'appelant, pas une demande |
| **Prévu à un jalon** | Une issue ouverte le couvre | Citer l'issue, ne pas en ouvrir une deuxième |
| **Absent du source** | Rien dans le code, rien d'ouvert | Demande légitime |

Le deuxième cas est le plus piégeux : un dépôt peut vivre **quatre versions mineures de retard** sans
s'en apercevoir. Pour trancher, vérifier dans quelle **version publiée** un attribut apparaît, plutôt
que de se fier à la documentation en ligne :

```bash
npm pack dsfr-data@0.27.0 && tar tf dsfr-data-0.27.0.tgz | head
tar xf dsfr-data-0.27.0.tgz && grep -r "require-where" package/dist/ | head
```

Même chose côté **instance servie**. Le guide, les specs et les fiches de skills que vous lisez
peuvent venir d'une instance déployée en retard sur le dépôt : rien ne déploie automatiquement, et
une instance peut avoir plusieurs versions de retard. Le tampon de fraîcheur le dit :

```bash
curl -s https://chartsbuilder.miweb.run/dist/skills-meta.json
# { "generatedAt": …, "libVersion": "0.27.0", "commit": …, "skills": 32 }
```

Trois agents s'y sont trompés le même jour, dont un jusqu'à la rédaction d'un faux manque
([#733](https://github.com/bmatge/dsfr-data/issues/733)).

## 3. Lire le JSDoc de l'attribut, pas la fiche du composant

Les grammaires diffèrent **d'un attribut à l'autre** au sein d'un même composant : le séparateur
d'entrées est `|` sur `labels` et `display`, `,` sur `split`, `round` et `fields`, `;` sur `compute`.
Une fiche de composant résume ; le JSDoc de l'attribut fait foi, et il est la source de la référence
générée.

- Dans le dépôt : `packages/core/src/components/<composant>.ts`, au-dessus de la propriété.
- Sans le dépôt : la section « Référence » de la skill du composant
  (`skills/dsfr-data/references/<composant>.md`), qui en est le rendu exact.

Un attribut dont la grammaire est fausse est **ignoré sans un mot** dans la plupart des cas : la
lecture du JSDoc n'est pas une précaution, c'est le seul contrôle disponible avant l'exécution.

## 4. Chronométrer avant de conclure sur la performance

Le **poids transféré** et le **nombre d'allers-retours** sont deux choses différentes, et c'est
presque toujours le second qui coûte. Un jugement de performance sans chronomètre est une intuition.

Corollaire contre-intuitif, mesuré deux fois sur le banc : **un `select` étroit peut être plus lent
que l'export complet**, parce qu'il force le portail à projeter. Le réflexe « demander moins de
colonnes va plus vite » est faux sur certains portails.

Chronométrer le chargement complet de la page, pas la requête isolée : c'est la somme des
allers-retours qui se voit à l'écran.

## 5. Vérifier au navigateur, et faire défiler

Une carte s'initialise **à la visibilité** (`IntersectionObserver`, marge 200 px) : une page avec dix
cartes sous la ligne de flottaison ne charge rien tant qu'on ne défile pas. Un graphique DSFR Chart
met environ une seconde à apparaître (Web Components Vue montés en différé, valeurs réinjectées
après coup). Une mesure prise trop tôt, ou sans défilement, voit du vide et conclut à un composant
cassé.

Trois faux positifs en une journée sont venus de là sur le banc, dont un qui a failli faire annuler
une montée de version saine. Un compte d'éléments relevé dans le DOM n'est fiable qu'après
défilement et stabilisation.

Le **volet Diagnostic** — le tiroir bas présent à l'identique dans toutes les applications du dépôt —
donne l'état réel du pipeline :
lignes reçues par étape, troncature (`TRONQUÉ`), taux d'appariement d'une jointure, erreurs de
configuration, champs nommés qui n'existent pas dans les données. C'est l'outil à ouvrir avant de
conclure qu'un chiffre est faux — et avant d'en publier un.

## 6. Une recette qui crie au loup cesse d'être crue

Un harnais de non-régression doit distinguer ce qui est fiable de ce qui ne l'est pas :

- **Fiable** : valeurs de KPI, erreurs de configuration (`data-dsfr-config-error`), erreurs console,
  présence d'un message d'attente.
- **Non fiable en l'état** : comptes d'éléments rendus, tant que le rendu différé n'est pas stabilisé.

Mélanger les deux produit des alertes que personne ne lit au bout d'une semaine. Implémentation de
référence côté banc d'essai : `scripts/recette-pages.mjs` — il charge chaque page, attend la
stabilisation du DOM, relève erreurs console, erreurs de configuration, valeurs de KPI et comptes de
rendu, puis compare deux états.

## Déposer un constat

Une fois les cinq premières règles passées, ce qui reste mérite une issue. Deux conventions font
gagner du temps des deux côtés :

- **Citer l'identifiant de registre** du banc (`AM-0XX`, `BUG-0XX`) dans l'issue. Le projet le
  reporte en retour dans les notes de version — « résout le constat AM-0XX du banc d'essai » — ce qui
  permet au banc de savoir qu'une demande a été satisfaite plutôt que de la redéposer
  ([#746](https://github.com/bmatge/dsfr-data/issues/746)).
- **Nommer la version testée et l'origine du code lu** : paquet npm, dépôt à un commit, ou instance
  déployée avec sa `libVersion`. C'est ce qui distingue un manque d'un retard.

## Voir aussi

- [Guide utilisateur](USER-GUIDE.md) — parcours et exemples de pipelines.
- [Skills IA](AI-SKILLS.md) — les fiches par composant, leur section « Référence » générée depuis le
  code, et le tampon de fraîcheur `skills-meta.json`.
- [Architecture](ARCHITECTURE.md) — pipeline, adaptateurs, volet Diagnostic, couplages non évidents.
- Skill `troubleshooting`, section « Quand il n'y a pas de symptôme » — la liste des échecs qui ne
  produisent aucun signal, et comment s'en apercevoir.
