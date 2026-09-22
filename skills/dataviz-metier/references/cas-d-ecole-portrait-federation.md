# Cas d'école — le portrait d'une fédération sportive, de la question au plan de page

> Le raisonnement complet sur un jeu réel (licences sportives, data.sports.gouv.fr, reproduit au banc) : la question et le lecteur, l'exploration, les figures trouvées, l'angle retenu et les angles écartés, le plan de page, la forme de chaque bloc et pourquoi, les titres-messages, ce qu'on ne montre pas, les hypothèses écrites. Les chiffres cités sont ceux vérifiés au banc ; là où le chiffre dépend de la fédération choisie, le titre est un gabarit rempli par la donnée.
>
> Déclencheurs : cas d'école, exemple complet, de bout en bout, portrait de fédération, licences sportives, data.sports.gouv.fr, raisonnement complet, plan de page complet
>
> Niveaux : avancé (à lire une fois ; sert de gabarit de raisonnement)

## 1. La question et le lecteur

| Ligne | |
|---|---|
| **Question** | « Que pèse ma fédération, qui y joue, où, et comment se situe-t-elle dans son groupe ? » |
| **Lecteur** | un dirigeant fédéral ou de ligue, un journaliste régional, un service de l'État qui instruit une subvention — des lecteurs de rapport, qui veulent *le* message, avec un besoin d'explorer *leur* département ensuite |
| **Message** | « Une fédération toujours mise en regard de son groupe » — c'est le fil ; le message chiffré dépend de la fédération choisie |
| **Hors objet** | aucune donnée à la commune ; aucune série de financements dans le temps ; pas de comparaison entre disciplines (un classement « la plus féminine » classe des sports, pas des politiques) |

Famille de page : **D** (portrait), variante D2 (sommaire ancré, sections empilées) — la fiche
doit s'imprimer et le lecteur veut tout voir. Un seul sélecteur pilote la page.

## 2. L'exploration : ce que les jeux portent

Trois jeux du portail, lus à l'API avant de dessiner (`/records?limit=0`, facettes, tri) :

- **Licences par fédération × département × sexe × tranche d'âge**, une saison — la matière du
  portrait. Un groupe null sur le sexe et sur l'âge, à compter avant de calculer une part.
- **Séries 2016-2024 par fédération**, avec un indice **publié** `lics_100_2016` et des lignes
  `TOT` pour la France et pour chaque groupe de fédérations (`fede_gp`) : la référence n'a pas à
  être recalculée, elle se **joint** (`dsfr-data-join on="fede_gp"`, AV-030).
- **Population par département** — pour rapporter les licences aux habitants. Trois jeux
  donnaient trois totaux d'équipements « en France » (LIM-015) : **un jeu par indicateur**, écrit.

Ce que l'exploration a montré, et qui décide de la page :

| Figure | Constat | Geste d'exploration |
|---|---|---|
| **l'écart** | la part des femmes de la fédération (31,9 % — 9 597 sur 30 056, vérifié 0.30.0) diffère de celle de son groupe | `value="lics:sum{sexe:eq:F} / lics:sum"` sur la fédération, la même sur la ligne `TOT` du groupe |
| **le changement** | l'indice base 100 de la fédération et celui du groupe divergent après 2020 | `type="line" series-field` sur `lics_100_2016`, trois séries |
| **la nuance** | l'écart de part féminine n'est pas le même par tranche d'âge | `group-by="age, sexe"` puis `share_percent` par tranche |
| **la géographie** | la densité (licences pour 1 000 habitants, 4,54 en France pour la fédération du banc) varie du simple au double entre départements | agréger → joindre → `compute="pour_mille = round(lics / pop * 1000, 2)"` |
| **la concentration** | quelques départements font l'essentiel des licences | `share_percent` trié, cumul |
| **le vide** | des départements sans ligne : zéro licence ou absence de données ? | `value="count" where="lics:isnull"` ; la carte compte ses lignes ignorées (`getSkippedCount()`) |

## 3. L'angle retenu, les angles écartés

**Retenu** : « une fédération qui se compare à son groupe — en volume, en évolution, en
féminisation, en densité territoriale — et là où elle s'en écarte ». Le « et alors » : les
écarts au groupe disent où agir (une ligue, une tranche d'âge), ce qu'un total ne dit pas.

**Écartés, et pourquoi (écrit dans les notes de la page)** :

1. « La fédération la plus dynamique de France » — un classement toutes disciplines confondues
   compare des sports de masse à des sports de niche ; sans normalisation, il ne classe rien.
2. « L'âge médian des licenciés » — l'original affichait 15 puis 22 ans pour 16 : valeur
   recopiée d'une autre ligne (AV-030). Repris seulement joint depuis le jeu, sinon retiré.
3. « Les financements » — pas de série dans le temps, un seul millésime : un chiffre, pas une
   histoire ; en exploration, pas en preuve.
4. « La carte des clubs » — des coordonnées existent, mais le message n'est pas géographique à
   cette maille : hors objet.

## 4. Le plan de page, bloc par bloc

| # | Étage | Titre-message (gabarit rempli par la donnée) | Forme et pourquoi | Geste |
|---|---|---|---|---|
| 0 | bandeau | « {{fede}} : le portrait 2024 » | le sélecteur d'entité, et le titre qui le reprend | `dsfr-data-context-value template fallback live` |
| 1 | accroche | quatre repères : licences 2024 (+ évolution depuis 2016), part des femmes (+ groupe), licences pour 1 000 habitants (+ France), nombre de départements couverts | le premier plus large ; chacun porte sa référence | `dsfr-data-kpi-group per-row="4"`, `span="6"`, `lines` avec `evolution` et un `text` de référence |
| 2 | preuve | « Depuis 2016, {{fede}} progresse plus vite que son groupe » (ou « moins vite » : le sens vient de la donnée) | trois courbes base 100 sur une seule échelle, la fédération en couleur, le groupe et l'ensemble en gris | `type="line" series-field="serie" value-field="lics_100_2016" color-map="Fédération:#000091,Groupe:#929292,Toutes:#cecece" y-min="80"`, `y-min` justifié en sous-titre |
| 3 | nuance | « Le rattrapage féminin se joue chez les moins de 15 ans » | barres groupées par tranche d'âge, deux séries (fédération, groupe) : l'écart **et** les niveaux | `type="bar" series-field="serie"` sur la part féminine par tranche ; `reference-lines` seulement sans `databox` |
| 4 | géographie | « La pratique est deux fois plus dense au sud qu'au nord » | choroplèthe d'un **taux**, résumé pondéré ; à côté, un podium des cinq départements les plus denses | `type="map" code-field="dep" value-field="pour_mille" map-summary="weighted" map-summary-weight="pop"` ; `dsfr-data-podium max-items="5" value-unit="‰"` |
| 5 | exploration | « Tous les départements » | tableau triable : effectif, part féminine, densité — trois unités, donc un tableau, pas un graphique | `dsfr-data-list columns="dep_nom:Département, lics:Licences, part_f:Part des femmes, pour_mille:Pour 1 000 hab." sort="pour_mille:desc" count-label="département" export="csv"` |
| 6 | conclusion | « Ce qu'il faut retenir » | trois phrases calculées dans la donnée et rendues dans un gabarit | `dsfr-data-display` sur la ligne jointe fédération / groupe, `compute` des phrases |
| 7 | notes | « Notes — les hypothèses éditoriales » | les quatre angles écartés, le jeu de chaque indicateur, le traitement du groupe null | `<section id="hypotheses">` |

Le test des titres seuls : « {{fede}} : le portrait 2024 · progresse plus vite que son groupe ·
le rattrapage se joue chez les moins de 15 ans · deux fois plus dense au sud · ce qu'il faut
retenir ». C'est un résumé ; la structure tient.

## 5. Exemple : le bloc de preuve et son accroche

```html
<!-- Les trois séries, format long : la fédération, son groupe, toutes -->
<dsfr-data-query id="serie" source="evol" where="serie:in:Fédération|Groupe|Toutes"
  order-by="annee:asc"></dsfr-data-query>

<!-- Le KPI lit la série ordonnée : `last` = 2024, `evolution` = (2024 − 2016) / 2016 -->
<dsfr-data-kpi source="serie" where="serie:eq:Fédération" value="lics:last" format="compact"
  heading="Licences en 2024"
  lines='[{"value":"lics:evolution","sign":true,"suffix":"depuis 2016"}]'></dsfr-data-kpi>

<dsfr-data-chart id="g-evol" source="serie" type="line"
  label-field="annee" value-field="lics_100_2016" series-field="serie"
  color-map="Fédération:#000091,Groupe:#929292,Toutes:#cecece" y-min="80"
  databox databox-title="Depuis 2016, la fédération progresse plus vite que son groupe"
  heading-level="2" databox-source="Ministère des Sports — recensement des licences, via data.sports.gouv.fr"
  databox-date-field="date_maj"></dsfr-data-chart>
<dsfr-data-a11y for="g-evol" source="serie" series-field="serie"
  description="Indice base 100 en 2016 : la fédération dépasse son groupe à partir de 2021 ; l'axe commence à 80 pour lire l'écart, ce qui l'amplifie."></dsfr-data-a11y>
```

Le KPI d'évolution suppose une source **ordonnée** (`order-by="annee:asc"`). Le `y-min="80"`
est un choix assumé — une base 100 ne part pas de zéro — et la `description` le dit. Le
`series-field` posé aussi sur `dsfr-data-a11y` pivote le tableau équivalent : une colonne par
série (0.33.0, AM-082).

## 6. Ce qu'on ne montre pas, et où on le dit

- **Le groupe null** du sexe et de l'âge : nommé sur l'axe (`empty-label`) et dans le tableau
  (`empty-label` sur `dsfr-data-a11y`, 0.33.0), inclus au dénominateur des parts — écrit en note.
- **Les départements sans ligne** : la carte les laisse gris ; le KPI « départements couverts »
  et la phrase « N départements sans donnée » (calculée) l'annoncent.
- **La commune, les clubs, les financements dans le temps** : hors objet, dit dans le chapô.
- **Le classement toutes disciplines** : écarté, dit dans les notes.
- **L'âge médian** : retiré tant qu'il n'est pas joint depuis le jeu.

## Règle : ce que ce cas enseigne

Le portrait n'a pas un graphique par colonne : il a **un écart au groupe par étage**, et chaque
bloc en tire son titre. Ce qui n'est pas un écart va dans le tableau ; ce qui n'est pas dans le
jeu va dans les notes. Refaire le même raisonnement, dans le même ordre, sur n'importe quel jeu.
