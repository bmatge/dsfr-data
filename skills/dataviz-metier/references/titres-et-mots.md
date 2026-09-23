# Titres et mots — le titre affirme, le sous-titre mesure

> Un titre descriptif nomme un champ ; un titre-message affirme ce que le lecteur doit retenir. Les trois étages (titre-message, sous-titre de méthode, source et date), le chapô de page, les formulations prudentes (corrélation, enquête, révision, déclaratif), le passage du vocabulaire administratif aux mots du lecteur, et les pièges d'un titre qui promet plus que la donnée.
>
> Déclencheurs : titre-message, titre affirmatif, titre descriptif, titre du graphique, sous-titre de méthode, chapô, formulation prudente, corrélation causalité, marge d'enquête, déclaratif, vocabulaire administratif, mots du lecteur, jargon, reformuler, verbe du titre
>
> Niveaux : base (§ titre-message), intermédiaire, avancé (tout)

## Titre descriptif, titre-message

| Descriptif | Message | Ce qui a changé |
|---|---|---|
| « Licences par sexe » | « Un licencié sur trois est une femme » | un sujet, un verbe, un chiffre à échelle humaine |
| « Évolution des licences 2016-2024 » | « Les licences féminines progressent deux fois plus vite que les masculines » | la comparaison qui fait l'histoire |
| « Répartition par département » | « Dix départements concentrent la moitié des licences » | la concentration, pas la liste |
| « Taux de réponse par région » | « En Bretagne, trois entreprises sur quatre jugent que le numérique leur fait gagner du temps — quatre points de plus qu'en France » | la valeur, la référence, l'écart |
| « Signalements et réponses » | « Un signalement sur deux obtient une réponse de l'entreprise » | le ratio, pas les deux volumes |

Le test : le titre se lit **sans le graphique**, et on sait déjà ce qu'on va voir. Un titre qui
commence par « Répartition », « Évolution », « Nombre de » ou un nom de champ (`lics_dep_sexe`)
est un libellé, pas un titre. Le libellé a sa place : dans l'alias de série
(`value-field="lics_f:Licenciées"`), dans le nom de colonne du tableau.

## Les trois étages

| Étage | Contenu | Geste `dsfr-data` |
|---|---|---|
| **Titre-message** | l'affirmation, avec le chiffre qui la porte | `databox-title="…"`, `heading-level="2"` s'il ouvre une section ; sans `databox` : un `<h2>` / `<h3>` posé à la main |
| **Sous-titre de méthode** | la mesure, l'unité, le périmètre, la période : « Part des femmes parmi les licences, en %, par département, saison 2023-2024 » | pas d'attribut de sous-titre sur la DataBox : un `<p class="fr-text--sm">` sous le titre, ou `databox-tooltip-title` / `databox-tooltip-content` pour la note de méthode dépliable |
| **Source et date** | producteur, jeu, portail ; date de la donnée | `databox-source`, `databox-date-field` |

Le titre affirme, le sous-titre permet de vérifier l'affirmation : sans lui, « deux fois plus
vite » ne dit ni sur quelle période ni en quoi c'est mesuré.

## Le chapô de page

Deux phrases en tête, `fr-text--lead` : la question, la réponse. « Que pèse la natation dans
chaque département, et où progresse-t-elle ? Partout au sud d'une ligne Nantes-Lyon, la pratique
est deux fois plus dense qu'au nord — et c'est chez les moins de 15 ans que l'écart se creuse. »
Le chapô est le message principal ([trouver-l-histoire](trouver-l-histoire.md)) ; s'il ne
s'écrit pas, la page n'a pas encore d'angle.

## Formulations prudentes

| Situation | À ne pas écrire | À écrire |
|---|---|---|
| deux séries qui montent ensemble | « le haut débit fait progresser le chiffre d'affaires » | « les entreprises connectées en fibre déclarent aussi un chiffre d'affaires plus élevé ; la donnée ne dit pas lequel explique l'autre » |
| une enquête (Baromètre France Num : `poids_reponse`, `poids_question`) | « 75,8 % des entreprises bretonnes » | « 75,8 % des entreprises bretonnes interrogées » ; l'effectif de la sélection à côté |
| une donnée déclarative (Signal Conso, formulaires) | « les commerces en ligne sont les plus fautifs » | « les commerces en ligne sont les plus signalés » |
| une série révisée par le producteur (TNE) | « la fréquentation a chuté en juillet » | « le cumul publié recule en juillet, ce qui traduit une révision, pas une baisse » |
| un écart dans la marge | « la région fait mieux que la France » | « la région est au niveau de la France (écart de 0,4 point) » |
| une part de l'ensemble filtré | « 16,3 % des licences » | « 16,3 % des licences bretonnes » (le dénominateur suit le filtre) |
| un top N | « les cinq départements représentent 40 % » | « les cinq premiers départements représentent 40 % du total national » — et non du top |

Les verbes de presse (« explose », « s'effondre », « bondit ») attendent un ordre de grandeur :
+2 points ne bondissent pas. Un chiffre déclaré s'écrit « déclaré » ; un chiffre estimé,
« estimé » ; une valeur nationale recopiée n'existe pas — elle est jointe depuis le jeu
([sens-des-variations](sens-des-variations.md), AV-030).

## Du vocabulaire administratif aux mots du lecteur

| Dans le jeu | Pour le lecteur | Note |
|---|---|---|
| `lics`, `nb_lic` | licences, licenciés | l'unité du portail |
| `EPCI` | intercommunalité | garder le sigle entre parenthèses la première fois |
| `strate démographique` | communes de 2 000 à 10 000 habitants | la borne, pas le nom de la strate |
| `taux de couverture FTTH` | part des locaux raccordables à la fibre | dire ce qui est compté |
| `personnels non enseignants` | agents administratifs, techniques et de santé | ce que le sigle contient |
| `code_unifie 501` | « Le numérique me fait gagner du temps » (accord) | le libellé de la question, pas son code |
| `dep_code = null` | sans département renseigné | jamais « null » en page |

Le vocabulaire du **producteur** reste dans le sous-titre de méthode et le tableau équivalent
(c'est celui qu'on retrouvera dans le jeu) ; celui du **lecteur** va dans le titre et la phrase.
Les deux coexistent, à leur étage.

## Pièges

- **Le titre promet plus que la donnée** : « en France » sur une moyenne non pondérée de
  départements (LIM-014) ; « les entreprises » pour un échantillon ; « la fédération la plus
  féminine » pour un classement non normalisé.
- **Le titre statique sur un graphique filtré** : « Équipements sportifs en France » quand le
  lecteur a choisi Rennes — `dsfr-data-context-value template fallback` (AM-057).
- **Le chiffre du titre écrit à la main** : il diverge du graphique au premier rafraîchissement.
  Le titre-message porte un chiffre seulement s'il est calculé et rendu dans un gabarit
  (`dsfr-data-display`), ou si la page est un rapport figé, daté, et le dit.
- **L'unité dans le libellé quand la valeur n'en est pas une** : « % des répondants » sous une
  moyenne de scores (revue du Baromètre).
- **Le mot « respectivement »**, les doubles négations, les parenthèses en cascade : un titre
  se lit en une seconde.
