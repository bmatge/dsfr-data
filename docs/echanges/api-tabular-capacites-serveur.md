# API tabulaire data.gouv.fr — ce que nous en avons compris, et ce que nous vous demandons

> **Objet** : retour d'un consommateur navigateur de `tabular-api.data.gouv.fr`, et questions sur
> les facettes (valeurs distinctes + comptages) et la recherche serveur.
> **Date de rédaction** : 2026-09-20 · **Auteur** : équipe `dsfr-data` (Bertrand Matge)
> **Versions au moment de l'écriture** :
> - `dsfr-data` **0.35.1** — bibliothèque de composants web DSFR de dataviz
>   ([dépôt](https://github.com/bmatge/dsfr-data), [npm](https://www.npmjs.com/package/dsfr-data))
> - API tabulaire : **0.3.3.dev0** annoncé par `https://tabular-api.data.gouv.fr/api/doc/swagger.json`,
>   alors que le dépôt [`datagouv/api-tabular`](https://github.com/datagouv/api-tabular) est à
>   **0.4.1** (2026-06-18). Une partie de nos questions vient peut-être de cet écart : si l'instance
>   publique est en retard sur le dépôt, dites-le nous, nous relirons (Q11).

## Méthode et régimes de vérité

Chaque affirmation de ce dossier porte sa provenance. Nous ne mélangeons pas ce que nous avons vu
passer sur le réseau et ce que nous avons déduit d'une lecture :

| Marque | Signification |
|---|---|
| `[M]` | **Mesuré** : requête réellement émise, date et code de retour donnés, commande rejouable en annexe B |
| `[L]` | **Lu** : dans votre `README.md`, votre swagger ou votre suivi d'issues — lien donné |
| `[H]` | **Hypothèse** de notre part, à confirmer ou infirmer d'un mot |

Si une ligne `[M]` vous paraît fausse, c'est peut-être qu'elle a vieilli : elle porte sa date, et la
commande qui la produit est en annexe B. Dites-le, nous la rejouons.

---

## 0. Qui vous écrit, et pour quel usage

`dsfr-data` est une bibliothèque de composants web (Lit) conformes au Design System de l'État, qui
permet de poser un graphique, un tableau, un indicateur ou une carte dans une page en écrivant du
HTML :

```html
<dsfr-data-source id="src" api-type="tabular"
  resource="2876a346-d50c-4911-934e-19ee07b0e503"></dsfr-data-source>
<dsfr-data-query id="stats" source="src" group-by="region" aggregate="population:sum"></dsfr-data-query>
<dsfr-data-chart source="stats" type="bar" label-field="region" value-field="population__sum"></dsfr-data-chart>
```

Elle parle à cinq familles d'API : OpenDataSoft, Grist, INSEE Melodi, une API générique, et **la
vôtre**. Votre API est la voie par laquelle une administration peut faire une page de visualisation
**à partir d'une ressource déjà publiée sur data.gouv.fr**, sans rien republier ailleurs — c'est le
chemin par défaut que propose notre générateur pour une ressource data.gouv.

Ce qui nous intéresse chez vous n'est donc pas seulement de lire des lignes : c'est de **déléguer au
serveur** ce qu'une page de dataviz fait en permanence (filtrer, regrouper, compter, chercher), pour
ne pas rapatrier un fichier entier dans le navigateur d'un visiteur.

---

## 1. Ce que nous avons compris de vos capacités serveur

Notre connecteur déclare, pour chaque API, ce qu'elle sait faire côté serveur. Voici l'état de cette
déclaration pour la vôtre (`packages/shared/src/providers/tabular.ts`,
`packages/core/src/adapters/tabular-adapter.ts`) :

| Capacité | Ce que nous en avons conclu | Comment nous le savons |
|---|---|---|
| Lecture paginée | Oui — `page` + `page_size`, **50 lignes maximum** par page, suite annoncée par `links.next` | `[M]` (nos contrôles quotidiens) et `[L]` (README) |
| Total | `meta.total` | `[M]` |
| Filtres | Oui, suffixés : `exact`, `differs`, `contains`, `notcontains`, `in`, `notin`, `less`, `greater`, `strictly_less`, `strictly_greater`, `isnull`, `isnotnull` | `[M]` + `[L]` |
| Tri | Oui — `colonne__sort=asc` ou `desc`, multi-colonnes | `[M]` |
| Regroupement + agrégats | Oui — `colonne__groupby` et `colonne__sum`, `__avg`, `__count`, `__min`, `__max` | `[M]` |
| Comptage de valeurs distinctes | **Non** en tant qu'opérateur : `colonne__distinct` n'est pas dans la liste documentée | `[L]` — et `[H]` pour le code de retour : **nous ne l'avons jamais émis**, notre adaptateur refuse de déléguer par précaution (voir Q3) |
| Facettes (valeurs + effectifs) | **Pas d'endpoint dédié** | `[L]` swagger + README |
| Recherche plein texte globale | **Pas de paramètre dédié** | `[L]` swagger + README |
| Filtrage géographique (bbox) | Non | `[L]` |
| Authentification | Aucune, API publique | `[L]` |

Deux pièges nous ont coûté du temps, et ils intéressent peut-être votre documentation :

1. **Les drapeaux d'agrégation doivent être nus.** `?colonne__groupby=` (forme valuée, produite
   naturellement par `URLSearchParams` en JavaScript, qui émet toujours le `=`) est rejeté en
   `400 Malformed query` ; `?colonne__groupby` passe. `[M]` le 2026-09-04, tableau complet en
   annexe A. Côté navigateur, il faut donc **assembler la chaîne de requête à la main** : c'est
   contre-intuitif, et aucun exemple de la documentation ne le signale. Une phrase dans le README
   (« ces paramètres n'acceptent pas de valeur, pas même vide ») épargnerait la même enquête au
   prochain intégrateur.
2. **Sur ce même 400, la réponse ne portait pas `Access-Control-Allow-Origin`** `[M]` 2026-09-04 —
   là où une 200 le porte. Conséquence dans un navigateur : le corps de la réponse est illisible,
   `fetch` rejette en `TypeError: NetworkError`, et **votre message d'erreur, qui était juste et
   précis, n'atteint jamais le développeur**. Nous avons d'abord cru à un problème de CORS. Votre
   changelog 0.3.2 mentionne « static `*` wildcard CORS headers in all responses » : couvre-t-il ce
   cas (voir Q13) ? Si oui, tant mieux — l'instance publique était encore en 0.3.3.dev0 au moment de
   nos mesures, et nous n'avons pas pu revérifier depuis le réseau où ce dossier a été écrit.

---

## 2. Ce que nous pensons avoir raté

Avant de demander quoi que ce soit, nous avons relu votre swagger, votre README et vos issues. Nous
y avons trouvé **six choses que notre connecteur n'exploite pas**, et sur lesquelles nous aimerions
votre avis avant de nous en servir :

| Ce que vous offrez | Ce que nous en faisons aujourd'hui | Ce que nous voudrions en faire |
|---|---|---|
| `GET /api/resources/{rid}/profile/` `[L]` | Rien — nous ne l'appelons jamais | Typer les colonnes (dates, colonnes JSON) sans deviner, et peut-être en lire des cardinalités (Q5) |
| `GET /api/resources/{rid}/swagger/` (spec par ressource, avec les filtres disponibles) `[L]` | Rien | Découvrir les colonnes filtrables au lieu de les inférer de la première page de données |
| `columns=col1,col2` `[L]` | **Rien** : nous demandons toujours toutes les colonnes | Ne demander que les colonnes affichées — moins d'octets pour vous comme pour nous (Q14) |
| `or=(col1__contains.x,col2__contains.x)` (conditions complexes, 0.3.2) `[L]` | Rien — notre grammaire de filtre interne ne sait pas exprimer un OU | C'est peut-être **la** brique qui manque à notre champ de recherche (§4) |
| `GET /api/resources/{rid}/data/csv/` et `/data/json/` `[L]` | Rien — nous paginons `data/` 50 lignes à la fois | Charger un jeu entier en **une** requête au lieu de 500 (§5, Q12) |
| `GET /api/aggregation-exceptions/` `[L]` | Rien — nous supposons l'agrégation toujours disponible | Savoir **avant de déléguer** si la ressource y a droit (Q1) |

Nous avons aussi lu, dans votre README, que l'agrégation est **désactivée par défaut**
(`ALLOW_AGGREGATION`, avec une liste d'exceptions `ALLOW_AGGREGATION_EXCEPTIONS`) `[L]`. Or notre
connecteur annonce le regroupement serveur comme disponible **pour toute ressource**, et notre
contrôle quotidien `tabular-cog-communes-vivant` rejoue une requête déléguée
(`?ARR__groupby&COM__count&DEP__exact=09`) contre l'instance publique `[M]`. Nous en
déduisons que l'agrégation est ouverte en production `[H]` — mais c'est exactement le genre de
déduction qui se retourne contre l'utilisateur le jour où elle devient fausse : si la politique est
une liste d'exceptions, nos pages afficheront des erreurs sur les ressources qui n'y sont pas.
D'où Q1, qui est pour nous la question la plus importante du dossier.

---

## 3. Facettes : ce qu'il nous manque

**Ce qu'est une facette pour nous** : la liste des valeurs distinctes d'une colonne, avec l'effectif
de chacune, recalculée en tenant compte des filtres déjà posés sur les autres colonnes. C'est le
composant `dsfr-data-facets` — les cases à cocher « Région (12) / Département (101) » d'un portail
open data.

**Ce que nous faisons aujourd'hui sur votre API** : nous les calculons **dans le navigateur**, sur
les lignes déjà chargées. C'est honnête mais faux dès que le jeu dépasse ce que nous avons chargé :
une facette calculée sur 25 000 lignes d'un jeu qui en compte 200 000 affiche des effectifs
partiels. Nous le signalons — avertissement en console, bandeau de troncature — mais un effectif
faux reste un effectif faux, et l'utilisateur d'une page publique ne lit pas la console.

**Ce que nous croyons possible chez vous dès aujourd'hui** `[H]` : une facette, c'est un
`GROUP BY` plus un `COUNT`. Donc :

```
GET /api/resources/{rid}/data/?departement__groupby&departement__count&page_size=50
```

Si c'est bien la forme attendue, trois choses nous bloquent encore, et **deux d'entre elles sont
déjà chez vous** :

1. **Le nombre de groupes dépasse souvent 50.** Il faut paginer un résultat agrégé — mais votre
   `#40` (« Pagination for aggregation queries ») dit que `Content-Range`, et donc notre
   `meta.total` et `links.next`, portent le nombre de lignes de **la table**, pas du résultat
   agrégé. Nous ne savons donc pas quand nous arrêter, ni combien de modalités existent. → **Q2**
2. **`groupby` seul ne distingue pas.** Votre `#119` dit que sans opérateur d'agrégation, la
   réponse répète les valeurs ligne à ligne au lieu de les regrouper. Si c'est bien le comportement
   actuel, alors **nous avons le défaut en miroir** : quand une requête demande un regroupement sans
   agrégat (`<dsfr-data-query group-by="departement">`, cas fréquent pour obtenir une liste de
   modalités), notre adaptateur émet `?departement__groupby` seul, considère que le serveur a
   regroupé, et **saute son propre regroupement** — il afficherait donc des lignes répétées comme
   s'il s'agissait de groupes. C'est à nous de le corriger, et nous le ferons ; nous le signalons
   ici parce que c'est précisément le coût, pour un appelant, d'un écart entre une syntaxe et sa
   sémantique. → **Q3**
3. **L'agrégation est-elle autorisée sur la ressource ?** → **Q1**

Autrement dit : nous ne vous demandons pas une fonctionnalité nouvelle. Nous vous demandons si
**`__groupby` + `__count` est la voie que vous recommandez pour des facettes**, et comment paginer
son résultat. Si oui, nous câblons `dsfr-data-facets` dessus et nous cessons de télécharger des
jeux entiers pour compter des modalités.

---

## 4. Recherche serveur : ce qu'il nous manque

**Ce qu'est une recherche pour nous** : un champ de saisie unique, qui filtre les lignes sur
**plusieurs colonnes à la fois** (« hôpital » cherché dans le nom, la commune et le type
d'établissement), avec un compteur de résultats juste.

**Ce que nous faisons aujourd'hui sur votre API** : côté client, sur les lignes chargées — même
limite que les facettes. Notre composant `dsfr-data-search` a bien un mode serveur, mais il exige
un gabarit de clause pour le fournisseur, et le nôtre pour vous est vide.

**Ce que nous croyons possible chez vous dès aujourd'hui** `[H]` : depuis la 0.3.2, les conditions
complexes permettent un OU :

```
GET /api/resources/{rid}/data/?or=(nom__contains.hopital,commune__contains.hopital)
```

Est-ce bien la forme que vous recommandez pour cela ? → **Q9**

Ce qui nous manque pour l'utiliser n'est pas la syntaxe, c'est **la sémantique et le coût** :

- `contains` est-il sensible à la **casse** et aux **accents** ? Un champ de recherche public où
  « ecole » ne trouve pas « École » est inutilisable — et c'est le genre de détail qui ne se
  documente nulle part mais décide de la faisabilité. → **Q6**
- Ces recherches s'appuient-elles sur un **index**, ou sont-ce des balayages séquentiels ? À partir
  de quelle taille de ressource nous demandez-vous de ne pas le faire ? → **Q7**
- Votre `#120` (« Feature - Search data globally ») demande une recherche globale sur toutes les
  colonnes. Est-elle au programme, et sous quelle forme d'URL ? Nous calerions notre composant
  dessus plutôt que d'inventer un gabarit qui deviendra faux. → **Q8**

---

## 5. Ce que l'absence coûte aujourd'hui — en requêtes chez vous

Ce n'est pas un argument de confort : déléguer au serveur **réduit** la charge, il ne la déplace pas.

Avec `page_size` plafonné à 50, une page qui veut compter, chercher ou facetter sur un jeu entier
doit d'abord le rapatrier :

| Taille du jeu | Requêtes émises chez vous aujourd'hui | Avec un comptage délégué |
|---|---|---|
| 1 000 lignes | 20 | 1 |
| 25 000 lignes (notre plafond de sécurité) | **500** | 1 |
| au-delà | 500, **et le chiffre affiché est faux** (tronqué) | 1 |

Notre bibliothèque plafonne volontairement à 500 pages / 25 000 lignes (garde-fou maison, pas une
limite de votre API), justement pour ne pas marteler l'API depuis le navigateur d'un visiteur. Mais
la conséquence est directe : **au-delà, les chiffres affichés sont partiels**, et nous ne pouvons
que les signaler dans la console.

Un `__groupby&__count` paginable, ou un endpoint d'export utilisable depuis un navigateur, supprime
ces 500 requêtes. C'est l'intérêt commun qui motive ce dossier.

---

## 6. Vos conseils sur notre connecteur

Au-delà des deux fonctionnalités, nous aimerions votre lecture critique de la façon dont nous vous
appelons. Le code tient en un fichier :
[`packages/core/src/adapters/tabular-adapter.ts`](https://github.com/bmatge/dsfr-data/blob/main/packages/core/src/adapters/tabular-adapter.ts)
(471 lignes), et la fiche que nous publions sur votre API est
[`specs/apis/tabular.html`](https://github.com/bmatge/dsfr-data/blob/main/specs/apis/tabular.html).

Ce qui nous inquiète, par ordre décroissant :

- **La doctrine de chargement.** 50 par 50 jusqu'à 25 000 lignes, ou `data/csv/` / `data/json/` en
  une fois ? Ces endpoints sont-ils prévus pour un appel navigateur (CORS, poids, quota) ? → Q12
- **Les colonnes à noms « non sûrs ».** La syntaxe suffixée ne supporte pas un nom de colonne avec
  espaces ou ponctuation (`Date - Journée gazière`) : nous **refusons alors de déléguer** et
  rapatrions toutes les lignes brutes pour agréger dans le navigateur. Or votre README parle
  d'encadrer par des guillemets doubles les noms à caractères spéciaux dans `or=()` et `columns`.
  **Est-ce que `"Date - Journée gazière"__groupby` fonctionne ?** Si oui, nous supprimons ce repli
  et vous économisons ces téléchargements complets. → **Q4**
- **`meta.total` sur une requête agrégée.** Votre `#40` a une conséquence visible chez nous : en
  pagination serveur, une page groupée affiche « 35 000 résultats » et des centaines de pages, là où
  il n'y a que 13 groupes. Nous préférerions **pas de total** à un total faux. → Q2
- **Le débit.** Y a-t-il une limite, et un en-tête par lequel vous souhaiteriez identifier les
  appels émis par une bibliothèque tierce depuis des pages publiques ? → Q15
- **`__id`.** Il remonte dans la liste des colonnes proposées à l'utilisateur de notre générateur.
  Votre `#11` propose de le retirer des réponses : préférez-vous que nous le masquions dès
  maintenant ? → Q16

---

## 7. Récapitulatif des questions

Une ligne de réponse par question nous suffit. Les trois premières décident de nos développements.

| # | Question | Ce que nous en ferons |
|---|---|---|
| **Q1** | L'agrégation est-elle ouverte à **toutes** les ressources sur l'instance publique, ou par liste d'exceptions ? Faut-il interroger `/api/aggregation-exceptions/` avant de déléguer ? | Soit nous gardons la délégation inconditionnelle, soit nous lisons la liste au chargement et retombons proprement côté client sinon |
| **Q2** | Comment paginer un résultat agrégé de plus de 50 modalités, et connaître le nombre de groupes, sachant que `meta.total` porte le total de la table (votre `#40`) ? | C'est la condition des facettes serveur ; sinon nous les laissons côté client avec un avertissement |
| **Q3** | `colonne__groupby&colonne__count` est-elle la forme que vous recommandez pour des valeurs distinctes avec effectifs, en attendant votre `#119` ? | Nous câblons `dsfr-data-facets` dessus |
| **Q4** | Un nom de colonne à espaces/ponctuation peut-il être regroupé en l'encadrant de guillemets doubles (`"Date - Journée gazière"__groupby`) ? | Nous supprimons notre repli client, donc des téléchargements complets chez vous |
| **Q5** | `profile/` expose-t-il des cardinalités ou des valeurs par colonne qu'on pourrait lire pour bâtir des facettes ou typer les colonnes ? | Nous l'appelons au lieu de deviner les types à partir des données |
| **Q6** | `contains` est-il insensible à la casse et aux accents ? | Décide si un champ de recherche serveur est utilisable pour du grand public |
| **Q7** | Ces filtres sont-ils indexés ? À partir de quelle taille nous demandez-vous de ne pas y recourir ? | Nous fixons un seuil dans la bibliothèque, et le documentons |
| **Q8** | Votre `#120` (recherche globale) est-il au programme ? Sous quelle forme d'URL ? | Nous attendons votre forme plutôt que d'en figer une qui deviendra fausse |
| **Q9** | `or=(a__contains.x,b__contains.x)` est-elle la bonne façon d'émuler aujourd'hui une recherche multi-colonnes ? | Nous ajoutons le OU à notre grammaire de filtres |
| **Q10** | Avons-nous raté un endpoint de facettes ou de valeurs distinctes ? | Nous l'utilisons, et nous corrigeons notre fiche publique |
| **Q11** | Le retard de l'instance publique (0.3.3.dev0) sur le dépôt (0.4.1) est-il réel, ou le numéro de version du swagger n'est-il pas à jour ? | Nous saurons quelles capacités tester avant de les annoncer |
| **Q12** | `data/csv/` et `data/json/` sont-ils prévus pour un appel depuis un navigateur ? Quelle taille maximale conseillez-vous avant de renvoyer vers le fichier source ? | Nous remplaçons jusqu'à 500 requêtes par une seule |
| **Q13** | Les réponses d'erreur portent-elles désormais les en-têtes CORS (correctif 0.3.2) ? | Nous rendons de nouveau vos messages d'erreur visibles aux intégrateurs |
| **Q14** | `columns=` réduit-il réellement votre charge, ou seulement la taille de la réponse ? | Nous l'émettons systématiquement depuis les colonnes réellement affichées |
| **Q15** | Limite de débit ? En-tête d'identification souhaité pour une bibliothèque tierce ? | Nous le posons par défaut et le documentons pour nos intégrateurs |
| **Q16** | Faut-il masquer `__id` côté client (votre `#11`) ? | Une ligne dans notre générateur |

---

## 8. Ce que nous pouvons faire en retour

- **Un banc de contrôle quotidien sur votre API.** Nous faisons tourner chaque nuit des contrôles
  qui rejouent des requêtes réelles contre l'instance publique et **recalculent les chiffres avec un
  oracle indépendant** de notre bibliothèque (`tests/verif-donnees/`, ADR-122). C'est ce banc qui a
  détecté le durcissement de votre parseur de chaîne de requête. Si cela vous est utile, nous
  pouvons vous signaler ce qu'il voit changer chez vous — avant que vos utilisateurs ne le
  découvrent.
- **Des contributions.** Les trois sujets ci-dessus (pagination des agrégats, distinct, recherche)
  sont des choses que nous savons écrire. Si une contribution extérieure vous arrange, dites-nous
  sous quelle forme vous la souhaitez.
- **Des retours de terrain.** Nous publions un générateur de visualisations qui met votre API entre
  les mains d'agents publics non développeurs. Ce qu'ils butent à faire, nous le voyons.

---

## Annexe A — Formes d'URL acceptées et rejetées

Mesuré `[M]` le **2026-09-04** sur la ressource `90e0d717-deda-4bdc-9987-f82faac5bc93`
(instruction de notre issue [#596](https://github.com/bmatge/dsfr-data/issues/596)) :

| Requête | Réponse |
|---|---|
| `?NB_VP_RECHARGEABLES_EL__groupby=` | `400` — `Malformed query: argument '…__groupby=' could not be parsed` |
| `?NB_VP_RECHARGEABLES_EL__groupby=yes` | `400` |
| `?NB_VP_RECHARGEABLES_EL__groupby` | **`200`** |
| `?…__groupby&NB_VP__sum&NB_VP__avg&NB_VP__count&NB_VP__min&NB_VP__max` | **`200`** |
| `?colonne__exact=actif`, `?colonne__greater=80` (filtres valués) | `200` — non concernés |

Sur les réponses `400` ci-dessus, pas d'en-tête `Access-Control-Allow-Origin` `[M]` (voir §1.2 et Q13).

**Ce qui n'est pas dans ce tableau, parce que nous ne l'avons jamais émis** : `?colonne__distinct`.
Notre adaptateur refuse de le déléguer et calcule le comptage distinct dans le navigateur, sur les
seules lignes reçues — une précaution prise en lisant votre liste d'opérateurs, jamais une mesure.
C'est l'objet de Q3.

## Annexe B — Commandes rejouables

```bash
B=https://tabular-api.data.gouv.fr/api/resources/90e0d717-deda-4bdc-9987-f82faac5bc93

# 1. Drapeau nu contre drapeau valué
curl -s -o /dev/null -w '%{http_code}\n' "$B/data/?NB_VP_RECHARGEABLES_EL__groupby=&page_size=50"  # attendu 400
curl -s -o /dev/null -w '%{http_code}\n' "$B/data/?NB_VP_RECHARGEABLES_EL__groupby&page_size=50"   # attendu 200

# 2. En-têtes CORS sur une réponse d'erreur (Q13)
curl -s -D - -o /dev/null -H 'Origin: https://exemple.gouv.fr' \
  "$B/data/?NB_VP_RECHARGEABLES_EL__groupby=" | grep -i 'access-control\|HTTP/'

# 3. Politique d'agrégation en production (Q1)
curl -s https://tabular-api.data.gouv.fr/api/aggregation-exceptions/

# 4. Facette émulée : valeurs distinctes + effectifs (Q3), et ce que dit meta.total (Q2)
curl -s "$B/data/?NB_VP_RECHARGEABLES_EL__groupby&NB_VP__count&page_size=50" | head -c 800

# 5. L'opérateur distinct existe-t-il malgré tout ? (Q3 — jamais essayé de notre côté)
curl -s -o /dev/null -w '%{http_code}\n' "$B/data/?NB_VP__distinct"

# 6. Colonne à nom non sûr, avec et sans guillemets (Q4)
curl -s -o /dev/null -w '%{http_code}\n' "$B/data/?%22Date%20-%20Journee%20gaziere%22__groupby"

# 7. Recherche multi-colonnes par OU (Q9) et sensibilité casse/accents (Q6)
curl -s "$B/data/?or=(colonne_a__contains.ecole,colonne_b__contains.ecole)&page_size=5" | head -c 400

# 8. Version servie par l'instance publique (Q11)
curl -s https://tabular-api.data.gouv.fr/api/doc/swagger.json | head -c 300
```

## Annexe C — Où regarder dans notre code

| Fichier | Rôle |
|---|---|
| [`packages/core/src/adapters/tabular-adapter.ts`](https://github.com/bmatge/dsfr-data/blob/main/packages/core/src/adapters/tabular-adapter.ts) | Construction d'URL, pagination, délégation du regroupement, garde-fous |
| [`packages/shared/src/providers/tabular.ts`](https://github.com/bmatge/dsfr-data/blob/main/packages/shared/src/providers/tabular.ts) | Déclaration des capacités et correspondance des opérateurs |
| [`specs/apis/tabular.html`](https://github.com/bmatge/dsfr-data/blob/main/specs/apis/tabular.html) | La fiche que nous publions sur votre API — à corriger si ce dossier se trompe |
| [`tests/verif-donnees/banc-adaptateurs.ts`](https://github.com/bmatge/dsfr-data/blob/main/tests/verif-donnees/banc-adaptateurs.ts) | Les contrôles quotidiens joués contre votre instance publique |

## Annexe D — Vos issues auxquelles ce dossier se rattache

Nous n'ouvrons pas de doublon : chacune de nos demandes a un foyer chez vous, sauf les questions de
doctrine.

| Votre issue | Notre besoin |
|---|---|
| [`#40`](https://github.com/datagouv/api-tabular/issues/40) — Pagination for aggregation queries | Q2 — condition des facettes serveur |
| [`#119`](https://github.com/datagouv/api-tabular/issues/119) — Getting distinct values with `groupby` only | Q3 — la primitive d'une facette |
| [`#120`](https://github.com/datagouv/api-tabular/issues/120) — Feature - Search data globally | Q8 — notre champ de recherche |
| [`#11`](https://github.com/datagouv/api-tabular/issues/11) — Remove `__id` from every response | Q16 |
| [`#83`](https://github.com/datagouv/api-tabular/issues/83) — Handling of `null` values | Nous traduisons `isnull`/`isnotnull` ; nous suivrons ce que vous trancherez |
