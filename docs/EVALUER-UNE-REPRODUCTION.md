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

### Avant de conclure à un chiffre faux : regarder si un contrôle le couvre déjà

Le dépôt recalcule ses chiffres par un **oracle indépendant** (ADR-122, `tools/oracle/`) : une
seconde implémentation qui repart des lignes brutes et compare à ce que la page **affiche**. Un
chiffre couvert par un contrôle vert n'est pas faux au moment du dernier run — et si vous en tenez
un qui l'est, c'est que le contrôle manque, ce qui est une information bien plus utile qu'un
constat isolé.

1. **Chercher la page dans les contrôles vivants** : `tests/verif-donnees/banc.ts` porte les
   reproductions du banc contre les vraies API, `banc-adaptateurs.ts` un contrôle par adaptateur
   public. Le champ `origin` de chaque `Check` dit d'où vient le cas et quelle issue le motive —
   c'est par là qu'on retrouve une page.
2. **Regarder le dernier run vivant** : le workflow `oracle.yml` tourne la nuit et à la demande, et
   dépose `tools/oracle/out/report.json` en artefact. Il donne, par observation, la valeur lib, la
   valeur oracle et l'écart. Un chiffre qui y figure sans écart a été vérifié contre l'API réelle.
3. **Vérifier qu'il ne s'agit pas d'une attente déclarée** : un contrôle en `skip` porte la raison
   et les **deux chiffres**, en disant s'il s'agit d'un défaut de la bibliothèque ou d'une
   amélioration que la documentation ne promet pas. Redéposer un `skip` déjà écrit coûte ce que
   #746 a mesuré.

**Ajouter un contrôle vivant depuis une reproduction** — c'est le meilleur retour que puisse faire
un banc d'essai, et cela tient en une entrée de manifeste. Dans `tests/verif-donnees/banc.ts` :
`mode: 'live'`, `origin` citant l'identifiant de registre (`AM-0XX`, `BUG-0XX`) ou l'issue, le
`markup` de la page réduit au strict nécessaire, et une alimentation brute qui appelle l'API **à la
main** — clause ODSQL d'une `RawSource` pour un portail Opendatasoft, URL complète et chemins
d'extraction (`rowsPath`, `nextPath`) d'une `RawUrlSource` pour toute autre enveloppe. Les clauses
ne sont jamais traduites par la bibliothèque : c'est précisément ce qui rend le recalcul
indépendant. Puis `npm run verif:live`. La procédure complète est dans
[`tools/oracle/README.md`](../tools/oracle/README.md).

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
