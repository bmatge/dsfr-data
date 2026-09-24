# Niveau base — une dataviz juste, titrée, en une seule référence

> Tout ce qu'il faut pour livrer *un* graphique, *une* carte ou *un* KPI qui dit quelque chose et ne ment pas : les quatre lignes avant la balise, la forme en une table, le titre-message, la source et la date lues dans la donnée, les quatre pièges qui coûtent le plus, cinq vérifications. Lisible seul ; les autres références n'ont pas besoin d'être ouvertes à ce niveau.
>
> Déclencheurs : niveau base, un graphique, un seul graphique, un KPI, une carte des, dataviz simple, version rapide, aller vite, juste et titré, quatre lignes, quatre pièges
>
> Niveaux : base (ce fichier suffit) ; une page avancée relit chaque bloc avec lui

## Les quatre lignes avant la balise

| Ligne | Ce qu'on écrit | Exemple (licences sportives, data.sports.gouv.fr) |
|---|---|---|
| **Question** | ce que le lecteur vient savoir, en une phrase interrogative | « Dans quels départements ce sport est-il le plus pratiqué, rapporté à la population ? » |
| **Message** | la réponse en une phrase affirmative — c'est le futur titre | « La pratique est deux fois plus dense dans le Sud-Ouest que dans le Nord » |
| **Ce que le lecteur obtient** | la mesure, l'unité, le périmètre, la période | licences pour 1 000 habitants, par département, saison 2024 |
| **Hors objet** | ce que ce bloc ne dit pas, pour ne pas y ajouter une carte de plus | ni l'évolution, ni le sexe, ni les clubs |

Un bloc qui ne tient pas dans ces quatre lignes n'a pas encore de raison d'exister. Si le
message ne s'écrit pas, on ne sait pas encore ce qu'on va dessiner : ouvrir
[trouver-l-histoire](trouver-l-histoire.md) — c'est déjà le niveau intermédiaire.

## La forme, en une table

La forme suit la **relation** que le message affirme, pas le type de colonne.

| Le message affirme… | Forme | Geste `dsfr-data` | Ce qui trahit |
|---|---|---|---|
| **un** chiffre (« 31,9 % des licenciés sont des femmes ») | KPI | `dsfr-data-kpi value="lics:sum{sexe:eq:F} / lics:sum" format="pourcentage"` | un `type="bar"` à une barre |
| A est plus grand que B (niveaux entre catégories) | barres **triées**, horizontales si libellés longs | `dsfr-data-query order-by="v:desc"` puis `type="bar" horizontal` | un camembert ; des barres dans l'ordre alphabétique |
| X a monté / baissé depuis… (évolution) | courbe, `y-min="0"` sur un taux | `type="line" label-field="annee" value-field="v"` | trois points sur un axe linéaire ([forme-cas-du-banc](forme-cas-du-banc.md)) ; barres par année sur 30 ans |
| X pèse tant du total (part) | anneau ≤ 5-7 parts, sinon barres | `aggregate="v:sum, v__sum:share_percent:part"` puis `type="pie"` ou `type="bar"` | des parts qui ne somment pas à 100 (groupe null écarté sans le dire) |
| chez nous c'est plus / moins qu'ailleurs (géographie d'un **taux**) | choroplèthe | `type="map" code-field="dep" value-field="taux" map-summary="weighted" map-summary-weight="pop"` | une choroplèthe de **volumes** : Paris gagne toujours |
| les premiers sont… (classement) | podium ou barres triées | `dsfr-data-podium max-items="5"` | un camembert à quinze parts |
| plus de sept classes qui comptent toutes | tableau | `dsfr-data-list columns= sort= count-label=` | un graphique à dix-neuf séries |

Deux mesures d'échelles différentes → deux graphiques, jamais un double axe. Pour aller plus loin
(contraste, petits multiples, base 100, avant/après) : [choisir-la-forme](choisir-la-forme.md).

## Le titre est le message, pas le nom du champ

| Descriptif (à bannir) | Message (à écrire) |
|---|---|
| « Licences par sexe » | « Un licencié sur trois est une femme » |
| « lics_dep_sexe » | « Part des femmes parmi les licenciés, par département, 2024 » |
| « Évolution 2016-2024 » | « Les licences ont retrouvé leur niveau d'avant 2020 » |

Le titre va dans `databox-title` (`heading-level="2"` s'il est une section de la page) ; la
mesure dans l'alias de série `value-field="lics_f:Licenciées"` ; la phrase de lecture, qui dit
le message **et** ce qui manque, dans `dsfr-data-a11y description`. Un graphique filtré par le
lecteur reprend son choix : `dsfr-data-context-value template="Résultats pour {{departement}}"
fallback="Résultats pour toute la France"`. Détail : [titres-et-mots](titres-et-mots.md).

## Source et date, lues dans la donnée

- `databox-source="Ministère des Sports — recensement des licences, via data.sports.gouv.fr"` :
  le producteur, le jeu, le portail. L'original du banc ne mentionnait sa source sous aucun
  graphique (AV-004).
- `databox-date-field="date_maj"` : la plus récente des dates ISO de la colonne. Jamais une date
  écrite à la main (fausse le lendemain), jamais la date de rendu (AM-021).
- Sur un KPI : `value="date_maj:max" format="date"`.

## Pièges : les quatre qui coûtent le plus

| Piège | Ce qui se passe | Cas | Geste |
|---|---|---|---|
| **Moyenne de taux** | `taux:avg` sur des départements : la Lozère pèse autant que le Nord | 4,27 % « en France » pour 5,6 % réels (LIM-014) ; un « Score moyen » de 1 065 parts de répondants à des questions différentes | ratio de sommes `value="a:sum{…} / b:sum"` ; carte `map-summary="weighted" map-summary-weight="effectif"` |
| **Axe qui ne part pas de zéro** | Chart.js cadre sur les données : deux points d'écart remplissent l'écran | Capytale, « 19 colonnes d'intensité, échelle tronquée » | `y-min="0"` sur une courbe ou un radar de taux |
| **Groupe null écarté en silence** | des parts qui somment à 100 % sur un total amputé | 21 projets sur 3 080 en « Série 4 » (PG-015) ; 95 309 signalements sans département hors carte (AM-027) | `empty-label="Non renseigné"` pour nommer, `where="champ:isnotnull"` pour écarter — et une phrase qui le dit |
| **Total tronqué** | 1 000 lignes chargées sur 3 080, KPI et carte faux « avec l'aplomb de chiffres justes » | AM-002 ; « 12 activités » pour 28 derrière un `limit` (PG-017) | relever `total_count` à l'API avant de poser la source ; `max-records` explicite ; `value="meta:total"` derrière un `limit` |

En données longues (une ligne par entité × élément), un cinquième : le **total répété** — une
colonne constante sur toutes les lignes d'une même entité (« Nombre total d'actions » = 4 sur les
4 lignes de Lille) est un attribut de l'entité ; l'afficher par ligne (« Chèque énergie : 4 ») est
faux, la sommer compte l'entité N fois. Vérifier qu'elle n'a qu'une valeur par entité, l'afficher
une fois par entité, le dire ([échelles honnêtes](echelles-honnetes.md)).

## Règles de relecture : cinq vérifications

1. Le titre se lit sans le graphique et dit ce qu'on va voir.
2. La forme affirme la relation du message (niveau, évolution, part, écart, classement) — pas le
   type de colonne.
3. Aucun `:avg` sur un champ qui est déjà un taux ; le résumé « en France » d'une carte est pondéré.
4. Le total affiché se recoupe à l'API (`/records?limit=0` → `total_count`) et avec le bloc voisin.
5. Source, date et phrase de lecture sont là, lues dans la donnée, et la légende dit ce que le
   graphique montre (chaque pastille comparée à sa barre).

## Exemple : un graphique complet au niveau base

```html
<dsfr-data-source id="lics" api-type="opendatasoft" base-url="https://data.sports.gouv.fr"
  dataset-id="licences-par-departement" where="fede = 'FFN' and saison = '2024'"
  max-records="200"></dsfr-data-source>
<dsfr-data-query id="tries" source="lics" order-by="lics_pop:desc" limit="15"></dsfr-data-query>

<dsfr-data-chart id="g" source="tries" type="bar" horizontal
  label-field="dep_nom" value-field="lics_pop:Licences pour 1 000 habitants"
  databox databox-title="La natation est deux fois plus dense dans quinze départements du Sud"
  heading-level="2" databox-source="Ministère des Sports, via data.sports.gouv.fr"
  databox-date-field="date_maj" unit-tooltip="‰"></dsfr-data-chart>
<dsfr-data-a11y for="g" source="tries"
  description="Quinze départements les plus denses sur cent une ; les 86 autres ne sont pas représentés."></dsfr-data-a11y>
```

Le `limit="15"` est un choix éditorial : la `description` le dit. Les noms de jeu et de champs
sont ceux du portail au moment de bâtir — les relever, jamais les deviner.
