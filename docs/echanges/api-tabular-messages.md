# API tabulaire data.gouv.fr — plan de publication et textes prêts

> Document **interne** : où poster quoi, dans quel ordre, et les textes à copier.
> Le dossier technique qu'ils pointent est `api-tabular-capacites-serveur.md`.
> Rédigé le 2026-09-20 — à relire après la vérification préalable ci-dessous.

## Vérification préalable (à faire avant d'envoyer)

Le dossier a été écrit depuis un environnement **sans accès réseau à `tabular-api.data.gouv.fr`** :
les mesures qu'il contient sont datées du 2026-09-04 (issue #596) ou viennent des contrôles
quotidiens. Trois commandes à rejouer avant envoi, parce qu'elles peuvent **supprimer une question**
(et une question qu'on n'avait qu'à taper soi-même coûte du crédit) :

- [ ] `curl -s https://tabular-api.data.gouv.fr/api/aggregation-exceptions/` → si l'agrégation est
      ouverte à toutes les ressources, **Q1** devient une confirmation d'une ligne au lieu d'une
      question ouverte.
- [ ] Le test CORS sur une réponse 400 (annexe B, commande 2) → si le correctif 0.3.2 a réglé le
      sujet, **retirer Q13** et le paragraphe §1.2, et le dire : « c'est corrigé chez vous, merci ».
- [ ] `"Nom avec espaces"__groupby` (annexe B, commande 5) → si les guillemets fonctionnent,
      **Q4 devient une correction à faire chez nous**, pas une question. Ouvrir alors une issue
      `dsfr-data` plutôt que de le leur demander.
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' "$B/data/?colonne__distinct"` → nous n'avons **jamais**
      émis cette forme : l'adaptateur refuse de la déléguer par précaution. Si elle répond `200`,
      c'est une capacité qu'on avait ratée, **Q3 disparaît** et c'est une correction chez nous.
- [ ] Vérifier le dernier verdict du banc de nuit (workflow « Oracle numérique ») pour pouvoir
      écrire « nos contrôles quotidiens voient cette requête aboutir » avec une date.

## Où poster quoi

Trois de nos quatre demandes ont **déjà un foyer chez eux**. On commente leurs issues, on n'en ouvre
pas de doublons — c'est la règle qu'on applique à notre propre dépôt
(`docs/EVALUER-UNE-REPRODUCTION.md` §2), et c'est ce qui montre qu'on a lu avant d'écrire.

| Ordre | Où | Quoi | Texte |
|---|---|---|---|
| 1 | [`datagouv/api-tabular#119`](https://github.com/datagouv/api-tabular/issues/119) | Notre besoin de valeurs distinctes + effectifs (facettes) | §A |
| 2 | [`datagouv/api-tabular#40`](https://github.com/datagouv/api-tabular/issues/40) | La conséquence mesurée d'un total faux sur un résultat agrégé | §B |
| 3 | [`datagouv/api-tabular#120`](https://github.com/datagouv/api-tabular/issues/120) | Notre cas d'usage de recherche, et le minimum qui nous suffirait | §C |
| 4 | Nouvelle issue sur `datagouv/api-tabular` | Ce qui n'a pas de foyer : doctrine d'usage, Q1/Q4/Q5/Q11–Q16 | §D |
| 5 | Courriel / message direct aux personnes qu'on connaît | Couverture : trois liens, trois phrases | §E |

Poster les commentaires **avant** le courriel : le message de couverture pointe des fils déjà
lisibles, et personne n'a à attendre une pièce jointe.

---

## §A — Commentaire sur `#119` (valeurs distinctes)

> Bonjour,
>
> Nous croisons ce sujet depuis l'autre bout : nous consommons l'API tabulaire depuis
> [`dsfr-data`](https://github.com/bmatge/dsfr-data), une bibliothèque de composants web DSFR de
> dataviz, et les « valeurs distinctes d'une colonne avec leur effectif » sont exactement ce qu'il
> nous faut pour afficher des **facettes** (les cases à cocher « Région (12) » d'un portail open
> data).
>
> Ce que nous faisons aujourd'hui, faute de mieux : nous rapatrions les lignes page par page
> (50 par 50) et nous comptons dans le navigateur. Au-delà de notre plafond de sécurité de
> 25 000 lignes, les effectifs affichés deviennent partiels — et c'est 500 requêtes chez vous pour
> un comptage que votre base fait en une.
>
> Deux questions, si ce fil est le bon endroit :
>
> 1. En attendant que `__groupby` seul distingue, est-ce que **`?colonne__groupby&colonne__count`**
>    est la forme que vous recommandez ? C'est celle que nous nous apprêtons à câbler.
> 2. Si vous traitez ce ticket, la forme retenue sera-t-elle un `__distinct` ou un `__groupby` seul ?
>    Nous préférons attendre votre choix plutôt que de figer une syntaxe qui deviendra fausse.
>
> (La pagination de ce résultat est notre autre inconnue — nous l'avons posée sur #40.)
>
> Contexte complet, si utile : <lien vers le dossier>

---

## §B — Commentaire sur `#40` (pagination des agrégats)

> Bonjour,
>
> Un retour de terrain sur ce ticket, depuis un consommateur navigateur de l'API
> ([`dsfr-data`](https://github.com/bmatge/dsfr-data), composants web DSFR de dataviz).
>
> Le total renvoyé sur une requête agrégée **remonte tel quel dans nos interfaces** : notre
> pagination serveur lit `meta.total` pour afficher « N résultats » et calculer le nombre de pages.
> Sur une requête `?colonne__groupby&autre__sum`, l'utilisateur voit donc « 35 000 résultats » et des
> centaines de pages là où il n'y a que 13 groupes.
>
> De notre point de vue d'appelant, **l'absence de total serait préférable à un total faux** : un
> champ absent, nous savons le traiter (nous le faisons déjà pour un autre fournisseur qui ne le
> connaît pas hors dernière page) ; un chiffre plausible mais faux, nous le propageons de bonne foi
> jusqu'à l'écran. C'est la direction que propose le ticket, et elle nous va.
>
> Et une question, qui nous bloque plus encore que le total : **comment paginer un résultat agrégé
> de plus de 50 modalités ?** Si `links.next` est calculé sur les lignes de la table, nous ne savons
> pas quand nous arrêter. C'est la condition pour que nous puissions déléguer les facettes au
> serveur — et donc pour que nous cessions de télécharger des jeux entiers pour compter des
> modalités.
>
> Contexte complet : <lien vers le dossier>

---

## §C — Commentaire sur `#120` (recherche globale)

> Bonjour,
>
> Un cas d'usage à l'appui de cette demande. Nous consommons l'API tabulaire depuis
> [`dsfr-data`](https://github.com/bmatge/dsfr-data) (composants web DSFR de dataviz) : notre
> composant de recherche est un champ unique qui doit filtrer sur **plusieurs colonnes à la fois**
> (chercher « hôpital » dans le nom, la commune et le type d'établissement). Aujourd'hui, sur cette
> API, nous ne savons le faire que côté client, sur les lignes déjà chargées — donc faux dès que le
> jeu dépasse ce que nous avons rapatrié.
>
> Trois questions, dont deux ne dépendent pas de cette évolution :
>
> 1. **Aujourd'hui** : `?or=(nom__contains.hopital,commune__contains.hopital)` est-il la bonne façon
>    d'émuler une recherche multi-colonnes avec les conditions complexes de la 0.3.2 ?
> 2. `contains` est-il **insensible à la casse et aux accents** ? C'est le point qui décide de
>    l'utilisabilité : un champ où « ecole » ne trouve pas « École » n'est pas proposable au grand
>    public. Et ces colonnes sont-elles indexées, ou est-ce un balayage séquentiel — y a-t-il une
>    taille de ressource au-delà de laquelle vous nous demandez de ne pas le faire ?
> 3. Si la recherche globale se fait, **quelle forme d'URL** ? Nous calerons notre composant dessus
>    plutôt que de figer un gabarit maison.
>
> Ce qui nous suffirait : un paramètre unique, sur toutes les colonnes texte, insensible à la casse
> et aux accents, avec un total juste dans `meta`.
>
> *(Short version in English, for the original requester: same need from a French web-components
> library consuming the API — a single search box across several text columns. Our three questions:
> is `or=(a__contains.x,b__contains.x)` the way to do it today, is `contains`
> case/accent-insensitive and indexed, and what URL shape would a global search take?)*
>
> Contexte complet : <lien vers le dossier>

---

## §D — Nouvelle issue sur `datagouv/api-tabular`

**Titre** : `Retour d'intégration (bibliothèque de composants DSFR) : doctrine d'usage et questions`

**Corps** :

> Bonjour,
>
> Nous maintenons [`dsfr-data`](https://github.com/bmatge/dsfr-data), une bibliothèque de composants
> web conformes au DSFR qui permet de poser un graphique ou un tableau dans une page à partir d'une
> ressource data.gouv.fr. L'API tabulaire est l'un de ses cinq connecteurs, et le chemin par défaut
> que nous proposons pour une ressource de la plateforme.
>
> Nous avons relu votre README, votre swagger et vos issues avant d'écrire : les demandes
> proprement dites sont posées sur #119, #40 et #120, où elles ont déjà un foyer. Restent des
> questions de **doctrine d'usage**, pour lesquelles nous n'avons pas trouvé de réponse dans la
> documentation, et un **retour sur ce que nous faisons peut-être mal**.
>
> Dossier complet (ce que nous avons compris de vos capacités serveur, ce que nous pensons avoir
> raté, ce que l'absence coûte en requêtes chez vous) : <lien vers le dossier>
>
> Les questions, une ligne de réponse suffit pour chacune :
>
> 1. **Agrégation en production.** Votre README indique que l'agrégation est désactivée par défaut,
>    avec une liste d'exceptions. Sur l'instance publique, est-elle ouverte à **toutes** les
>    ressources ? Faut-il interroger `/api/aggregation-exceptions/` avant de déléguer un
>    regroupement ? Nous la déclarons aujourd'hui disponible sans condition, et nos contrôles la
>    voient aboutir — mais si la politique est une liste, nos pages casseront sur les ressources qui
>    n'y sont pas.
> 2. **Colonnes à noms « non sûrs ».** La syntaxe suffixée ne parse pas un nom à espaces ou
>    ponctuation (`Date - Journée gazière`) : nous refusons alors de déléguer et rapatrions toutes
>    les lignes pour agréger dans le navigateur. Votre README mentionne l'encadrement par guillemets
>    doubles pour `or=()` et `columns` : **`"Date - Journée gazière"__groupby` fonctionne-t-il ?**
>    Si oui, nous supprimons ce repli, et vous économisez ces téléchargements complets.
> 3. **Chargement en masse.** Nous paginons `data/` 50 lignes à la fois, jusqu'à 500 requêtes pour
>    25 000 lignes. `data/csv/` et `data/json/` sont-ils prévus pour un appel depuis un navigateur
>    (CORS, poids, quota) ? Quelle taille maximale conseillez-vous avant de renvoyer l'utilisateur
>    vers le fichier source ?
> 4. **`profile/`.** Nous ne l'appelons pas. Expose-t-il des types, des cardinalités ou des valeurs
>    par colonne que nous pourrions lire au lieu de les inférer des données ?
> 5. **`columns=`.** Nous demandons toujours toutes les colonnes alors que nous savons lesquelles
>    sont affichées. Est-ce que le restreindre réduit votre charge, ou seulement la taille de la
>    réponse ?
> 6. **CORS sur les réponses d'erreur.** Mesuré le 2026-09-04 : une réponse `400` ne portait pas
>    `Access-Control-Allow-Origin`, là où une `200` le porte. Conséquence côté navigateur : `fetch`
>    rejette en `TypeError: NetworkError` et **votre message d'erreur, qui était juste, n'atteint
>    jamais le développeur** — nous avons d'abord cru à un problème de CORS. Votre changelog 0.3.2
>    mentionne « static `*` wildcard CORS headers in all responses » : ce cas est-il couvert ?
> 7. **Débit et identification.** Y a-t-il une limite de débit ? Un en-tête par lequel vous
>    souhaiteriez reconnaître les appels émis par une bibliothèque tierce depuis des pages
>    publiques ?
> 8. **`__id`.** Il remonte dans la liste des colonnes que nous proposons à l'utilisateur.
>    Préférez-vous que nous le masquions dès maintenant (cf. #11) ?
> 9. **Versions.** `api/doc/swagger.json` annonce `0.3.3.dev0` quand le dépôt est en `0.4.1` :
>    l'instance publique est-elle réellement en retard, ou le numéro n'est-il pas à jour ?
>
> Enfin, si vous avez dix minutes pour **regarder comment nous vous appelons**, notre adaptateur
> tient en un fichier :
> [`tabular-adapter.ts`](https://github.com/bmatge/dsfr-data/blob/main/packages/core/src/adapters/tabular-adapter.ts).
> Tout ce que nous y faisons mal vous coûte du trafic, et nous préférons le savoir de vous.
>
> En retour : nous faisons tourner chaque nuit des contrôles qui rejouent des requêtes réelles
> contre votre instance publique et recalculent les résultats avec un oracle indépendant de notre
> bibliothèque. C'est ce banc qui a vu, le 2026-09-04, que votre parseur refusait désormais
> `?colonne__groupby=` (forme valuée) — nous avions émis cette forme pendant des mois. Si cela vous
> est utile, nous pouvons vous signaler ce qu'il voit changer chez vous.

---

## §E — Courriel de couverture

**Objet** : `dsfr-data et l'API tabulaire : ce qu'on en a compris, et quatre questions`

> Bonjour <prénom>,
>
> On consomme l'API tabulaire depuis `dsfr-data` (les composants web DSFR de dataviz), et on a pris
> le temps d'écrire ce qu'on avait compris de ses capacités serveur — pour vérifier qu'on ne vous
> demande pas quelque chose qui existe déjà.
>
> Trois de nos quatre sujets avaient déjà un fil chez vous, on a commenté plutôt qu'ouvert des
> doublons : valeurs distinctes (#119), pagination des agrégats (#40), recherche globale (#120). Le
> reste — surtout : **l'agrégation est-elle ouverte à toutes les ressources en production ?** — est
> dans une issue à part : <lien>.
>
> Le dossier complet est ici : <lien>. Il dit aussi ce qu'on fait probablement mal en vous appelant
> (on pagine 50 par 50 jusqu'à 500 requêtes là où un `columns=` et un export feraient mieux), et ce
> qu'on peut vous rendre : un banc de contrôle qui rejoue chaque nuit des requêtes réelles contre
> votre instance et recalcule les chiffres — c'est lui qui nous a signalé le durcissement de votre
> parseur en septembre.
>
> Une ligne de réponse par question nous suffit ; les trois premières décident de nos prochains
> développements. Et si vous préférez un point de vive voix, on prend.
>
> Bien à vous,
> Bertrand


---

## Retombées internes (à traiter chez nous, indépendamment de leur réponse)

Écrire ce dossier a mis au jour cinq points qui sont de **notre** côté. Ils ne partent pas dans le
courriel ; ils méritent une issue chacun.

| Constat | Où | Gravité |
|---|---|---|
| Un `group-by` **sans agrégat** est délégué (`?col__groupby` seul) et la query saute son regroupement client. Si leur `#119` décrit bien le comportement de l'API, nous affichons des lignes répétées comme des groupes — même famille que #852. | `dsfr-data-query.ts:844-890`, `tabular-adapter.ts` `_groupByFlags` | à mesurer d'abord (un contrôle de `tests/verif-donnees/`), puis corriger |
| `columns=` n'est **jamais** émis alors que l'API le supporte et que le pipeline connaît les colonnes utiles. | `tabular-adapter.ts` `buildUrl` / `buildServerSideUrl` | optimisation, sans risque de chiffre faux |
| `meta.total` est consommé tel quel sur une requête **agrégée** en pagination serveur : leur `#40` dit qu'il porte le total de la table. Une page groupée annonce donc un nombre de résultats et de pages faux. | `tabular-adapter.ts` `fetchPage`, `dsfr-data-source.ts` | chiffre faux à l'écran — relève d'ADR-122 |
| L'agrégation est annoncée disponible sans condition, alors que l'API la conditionne à une politique (`ALLOW_AGGREGATION`). | `providers/tabular.ts`, `tabular-adapter.ts` | dépend de leur réponse à Q1 |
| Notre grammaire de `where` en format colon ne sait pas exprimer un **OU**, alors que l'API le permet depuis la 0.3.2 — c'est ce qui bloque `dsfr-data-search` en mode serveur sur ce fournisseur. | `utils/where.ts`, `dsfr-data-search.ts` | fonctionnalité |

Chacun touche `packages/core/src` : changeset requis, et pour les deux premiers un contrôle dans
`tests/verif-donnees/` **avant** correction (preuve de mutation, ADR-122).
