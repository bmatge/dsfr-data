# Plan de remédiation — Revue de la bibliothèque de composants (juin 2026)

> Issu d'une revue de code complète de `packages/core/src/` (~18 000 lignes lues).
> Objectif global : **des fonctions partagées et du code mutualisé, une architecture
> cohérente, et une vraie séparation entre la bibliothèque de composants et le code
> applicatif des webapps.**

## Synthèse

Le modèle d'architecture (source unique qui fetch → data-bridge → transformateurs
purs → affichage, adapters stateless pilotés par capabilities) est bien conçu mais
appliqué à moitié. Le motif récurrent : une abstraction a été créée, branchée sur
1 ou 2 composants, puis les composants suivants ont été écrits sans l'utiliser.

Les 4 chantiers structurants :

1. **Contrats inter-composants** — alias d'agrégats, meta de pagination, format
   WHERE, relais des commandes : interprétés différemment selon le composant ou
   l'adapter, le pipeline devient imprévisible selon le provider.
2. **Abstractions fantômes** — `chart-data.ts`, `pagination.ts`,
   `response-parser.ts` sont du code mort ; le mixin et `SourceElement` ne couvrent
   que la moitié des composants ; 3 parseurs d'agrégats, 5 copies du fallback colon,
   3 jeux de palettes.
3. **API publique mensongère** — attributs déclarés mais jamais implémentés
   (`transform`/`server-side`/`page-size` de query, `filter` de map-layer…).
4. **Séparation lib / applicatif** — `layout/` (auth, partage) et les appels
   `/api/cache` vivent dans la lib npm publiée.

## Découpage

| Epic | Thème | Priorité | Issues |
|------|-------|----------|--------|
| A | Contrats du pipeline data | P0 | 7 |
| B | dsfr-data-query : délégation serveur et attributs fantômes | P0 | 5 |
| C | Pattern transformateur unifié et gestion d'erreurs | P1 | 5 |
| D | Adapters : brancher ProviderConfig et harmoniser | P1 | 5 |
| E | Sécurité et exports | P0 | 5 |
| F | Cartes : fuites, races, contrats popup/timeline | P1 | 6 |
| G | Affichage : harmonisation attributs, formatage, palettes | P1/P2 | 7 |
| H | Séparation bibliothèque / code applicatif | P0/P1 | 5 |
| I | dsfr-data-facets : robustesse et accessibilité | P1 | 5 |
| J | @dsfr-data/shared côté app : auth, storage, sync | P1 | 3 |

**Total : 10 epics, 49 issues.**

> Les epics A, E, G, H et le nouvel epic J intègrent les constats de la revue
> complémentaire de `@dsfr-data/shared` (voir l'addendum en fin de document).

Ordre d'attaque recommandé : **E (sécurité) et A (contrats) d'abord**, puis B
(query), puis C+D (fondations factorisation) qui réduisent mécaniquement le coût
de F, G, I. H peut être mené en parallèle. G1 (langue des attributs) est le seul
chantier avec breaking change → à trancher avant la 1.0.

---

## EPIC A — Contrats du pipeline data (P0)

Le même attribut HTML produit des résultats différents selon le provider ou le
chemin (client/serveur) emprunté. Cet epic rend le contrat unique.

### A1. Unifier l'alias d'agrégat par défaut + factoriser `parseAggregates`
- **Gravité** : bug probable.
- **Constat** : Grist génère `sum_population` (`grist-adapter.ts:305`, `:558`),
  query/ODS/Tabular génèrent `population__sum` (`dsfr-data-query.ts:653`,
  `opendatasoft-adapter.ts:331`, `tabular-adapter.ts:218`). Le `value-field` d'un
  chart casse silencieusement quand le provider change ou quand Grist bascule
  SQL ↔ Records.
- **Fix** : une fonction partagée `parseAggregates()` + une convention d'alias
  unique (`field__fn`) utilisée par les 3 implémentations actuelles.
- **AC** : test traversant — `aggregate="population:sum"` produit la même colonne
  sur ODS, Tabular, Grist (SQL et fallback Records) et en client-side.

### A2. Contrat unique pour `PaginationMeta` / `FetchResult`
- **Gravité** : bug probable.
- **Constats** :
  - Grist server-side retourne `totalCount: -1` hors dernière page
    (`grist-adapter.ts:147`) ; `dsfr-data-list.ts:155` exige `total > 0` →
    pagination serveur jamais activée en cas nominal.
  - Mode `fetchAll` : `setDataMeta(..., { pageSize: 0, total })`
    (`dsfr-data-source.ts:560-565`) → `list` active la pagination serveur et
    calcule `Infinity` pages.
  - `needsClientProcessing` contradictoire : fallback Grist « SQL indisponible »
    retourne `false` (`grist-adapter.ts:105-124`) là où le fallback in-flight
    retourne `true` (`:515-528`) ; INSEE retourne `true` en `fetchPage`
    (`insee-adapter.ts:146`) quand les autres retournent `false`.
- **Fix** : documenter le contrat dans `api-adapter.ts` (totalCount inconnu =
  `undefined`, pas `-1` ; meta non publiée ou `serverSide: false` explicite en
  fetchAll), corriger les 3 adapters et le test de `list`.
- **AC** : tests par adapter sur les 3 champs de meta ; `list` paginée
  correctement sur Grist server-side et sur fetchAll.

### A3. Format WHERE piloté par `capabilities.whereFormat` + échappement colon
- **Gravité** : bug probable.
- **Constats** :
  - `facets` joint toujours par `' AND '` (`dsfr-data-facets.ts:623`) → clauses
    croisées invalides pour Grist (format colon, split sur `,`).
  - `search` code l'échappement ODSQL en dur (`dsfr-data-search.ts:371-374`),
    appliqué même aux templates colon.
  - `GenericAdapter` déclare `whereFormat: 'odsql'` mais son `buildFacetWhere`
    émet du colon (`generic-adapter.ts:20` vs `:51-63`) → `getEffectiveWhere`
    joint du colon avec ` AND `.
  - Aucun échappement des valeurs colon : une valeur contenant `,` `:` `|` casse
    la clause (5 copies du même bloc : facets, generic, grist, tabular, insee).
- **Fix** : fonction partagée `buildColonWhere()/joinWhere(format)` +
  échappement/quoting défini par le format ; suppression des 5 copies ;
  l'échappement search délégué à l'adapter.
- **AC** : facette « Provence, Alpes » filtre correctement sur les 5 providers ;
  facets croisées OK sur Grist.

### A4. Relayer les commandes dans `dsfr-data-join` et `dsfr-data-search`
- **Gravité** : bug probable.
- **Constat** : `query`/`normalize`/`unpivot` relaient `page`/`where`/`orderBy`
  vers l'amont via `subscribeToSourceCommands` ; `join` et `search` non → un
  `list` paginé derrière un `search` (cas documenté) ne pagine plus
  (`dsfr-data-list.ts:271` dispatche vers un id que personne n'écoute).
- **Fix** : `search` relaie tel quel ; `join` relaie au minimum vers la source
  gauche (ou les deux pour `where` avec `whereKey`), comportement documenté.
- **AC** : pipeline `source(server-side) → search → list` : pagination
  fonctionnelle ; idem avec `join` intercalé.

### A5. `order-by` multi-champs (ODS, Tabular) + opérateur `in` Tabular
- **Gravité** : bug probable.
- **Constats** :
  - ODS : `params.orderBy.replace(/:(\w+)$/, ...)` ne transforme que le dernier
    segment (`opendatasoft-adapter.ts:175-179`) → `"a:desc, b:asc"` devient de
    l'ODSQL invalide.
  - Tabular : `split(':')` global (`tabular-adapter.ts:225-228`) → malformé en
    multi-champs. Grist fait correctement (split `,` puis `:`).
  - Tabular n'éclate pas le `|` de `in` (`tabular-adapter.ts:281-292`) alors que
    son propre `buildFacetWhere` le génère → facette multi-sélection cassée.
- **Fix** : parseur `parseOrderBy()` partagé (même grammaire `"field:dir, …"`
  partout) ; traduction du `in` côté Tabular.
- **AC** : tests order-by multi-champs sur les 3 adapters ; facette
  multi-sélection Tabular verte.

### A6. Compléter `SourceElement` et l'utiliser dans facets
- **Gravité** : bug probable (401) + incohérence d'architecture.
- **Constats** :
  - `unpivot` et `join` n'exposent pas `getAdapter()`/`getEffectiveWhere()` →
    un `facets` derrière eux ne peut pas atteindre l'adapter (alors qu'`unpivot`
    relaie déjà les commandes — support à moitié fait).
  - `facets` re-parse les attributs DOM de la source
    (`dsfr-data-facets.ts:597-610`) au lieu de demander ses params → ignore
    `api-key-ref` → **les facettes serveur échouent en 401 sur toute source
    authentifiée** alors que le fetch des données passe.
  - `_findUpstreamSource` par duck-typing `'datasetId' in el`
    (`dsfr-data-facets.ts:442-453`).
- **Fix** : étendre `SourceElement` avec `getAdapterParams()` (incluant les
  headers résolus) ; l'implémenter sur source/query/normalize/unpivot/join ;
  facets consomme cette interface.
- **AC** : facettes serveur fonctionnelles sur source `api-key-ref` ; facets
  derrière unpivot/join atteignent l'adapter.

### A7. filter-translator : 3e implémentation divergente des opérateurs (shared)
- **Gravité** : bug probable (code généré par les builders).
- **Constats** (`packages/shared/src/query/filter-translator.ts`) :
  - `filterToOdsql` n'échappe ni `"` ni `\` (`:30-46`) — une valeur avec
    guillemet produit un WHERE ODSQL invalide/injectable dans le code généré
    (8 points d'appel builder-ia, 6 builder) ; `gt/gte/lt/lte` quotent les
    valeurs numériques (comparaison string côté ODS).
  - `applyLocalFilter` ne supporte pas `in`/`notin` (`:97-98`, `default: return
    true`) : le même filtre filtre côté serveur et **retourne tout** en local.
- **Fix** : fusionner avec la couche WHERE factorisée de A3 (échappement par
  dialecte, grammaire unique avec `dsfr-data-query._matchesFilter`).
- **AC** : mêmes résultats serveur/local pour les 12 opérateurs ; valeur avec
  guillemet correctement échappée dans le code généré.

---

## EPIC B — dsfr-data-query : délégation serveur et attributs fantômes (P0)

Le composant central de transformation produit des résultats faux ou gelés hors
du happy path.

### B1. Délégation serveur : transmettre `where` et ne pas filtrer après agrégation
- **Gravité** : bug sémantique majeur.
- **Constat** : en chemin client le filtre s'applique sur les lignes brutes avant
  group-by ; en chemin délégué la commande envoyée à la source ne contient jamais
  `where` (`dsfr-data-query.ts:351-391`), puis le filtre s'applique client-side
  sur les lignes **agrégées** où les champs bruts n'existent plus → tout est
  éliminé. Même HTML, résultats différents selon `serverGroupBy`.
- **Fix** : inclure le where (traduit au format de l'adapter, ou rapatrié en
  pré-filtre client si non traduisible) dans la négociation ; ne jamais
  appliquer un filtre sur champs bruts après agrégation.
- **AC** : `where` + `group-by` + `aggregate` donne le même résultat sur ODS
  (délégué) et Generic (client).

### B2. Délégation : gel des données et overlay orphelin
- **Gravité** : bug probable.
- **Constats** :
  - Changement d'attribut (`limit`, `filter`…) → `_negotiateServerSide` renvoie
    la même commande `groupBy` → dédupliquée par la source
    (`dsfr-data-source.ts:366-369`), pas de refetch ; la query saute le cache
    (`_hasServerDelegation()`) et attend une émission qui ne vient jamais
    (`dsfr-data-query.ts:430-436`).
  - Retirer `group-by` ou changer `source` : `_negotiateServerSide` reset le
    tracking **avant** cleanup (`:333-335`) → la source garde indéfiniment
    l'overlay `groupBy` et sert des données agrégées.
- **Fix** : versionner les commandes ou répondre aux commandes identiques par une
  ré-émission du cache ; envoyer `groupBy: ''` au retrait ; cleanup adressé à
  l'ancienne source au changement de `source`.
- **AC** : changer `limit` sur une query déléguée met à jour l'aval ; retirer
  `group-by` rend les lignes brutes.

### B3. Supprimer ou implémenter `transform`, `server-side`, `page-size`
- **Gravité** : API publique mensongère.
- **Constat** : zéro occurrence de `this.transform`/`this.serverSide`/
  `this.pageSize` hors déclaration (`dsfr-data-query.ts:159-177`), docstrings
  détaillées pour des no-ops. La doc de `where` (`:117-123`) promet l'ODSQL
  alors que le parseur est colon-only → where ODSQL silencieusement ignoré.
- **Fix** : supprimer les 3 attributs (ou les implémenter si un besoin réel
  existe), corriger la docstring `where`, mettre à jour `skills.ts` et les tests
  d'alignement.
- **AC** : plus d'attribut sans effet ; un where non parsable produit un
  `reportConfigError`.

### B4. Filtres et tri : `in` strict, comparateur non transitif, agrégat global
- **Gravité** : bug probable.
- **Constats** (`dsfr-data-query.ts`) :
  - `in`/`notin` en égalité stricte vs `eq` lâche (`:586-608`) →
    `dept:in:75|13` ne matche jamais `"75"` string.
  - Tri : `Number(null) === 0` et comparateur mixte numérique/string non
    transitif (`:716-732`) → ordre arbitraire sur colonnes mixtes.
  - `contains` : `String(undefined) === "undefined"` matche (`:602`).
  - `aggregate` sans `group-by` : no-op silencieux (`:498-501`) alors que la
    grammaire est acceptée côté source (agrégat global).
- **Fix** : normalisation de type unique avant comparaison ; tri à 3 niveaux
  (null/number/string) ; support de l'agrégat global ou `reportConfigError`.
- **AC** : tests unitaires sur chaque opérateur avec données string/number/null.

### B5. `refresh`/`reload()` : sémantique de pur transformateur
- **Gravité** : incohérence d'architecture.
- **Constat** : `_setupRefresh` retraite le même cache périodiquement (no-op
  coûteux) ou tombe sur le gel B2 ; `reload()` relit le cache au lieu de
  demander un refetch — contrat opposé à `dsfr-data-source.reload()`.
- **Fix** : `reload()` délègue à la source amont (commande de refetch) ;
  `refresh` supprimé de query (il appartient à la source) avec dépréciation.
- **AC** : `query.reload()` provoque un refetch amont observable.

---

## EPIC C — Pattern transformateur unifié et gestion d'erreurs (P1)

Quatre transformateurs + facets + search recodent l'abonnement à la main, avec
divergences réelles. Le fix du double-init n'existe que dans join.

### C1. Mixin transformateur partagé
- **Constat** : `SourceSubscriberMixin` n'est utilisé que par l'affichage.
  query (`:426-453`), join (`:196-237`), unpivot (`:170-179`), normalize
  (`:229-244`), facets (`:308-323`), search (`:268-283`) recodent abonnement +
  cache initial + cleanup. Divergences : query ne réinitialise jamais `_error`
  après succès ; normalize/unpivot n'ont ni état erreur ni loading ; fuite
  d'abonnement si `source` est vidé au runtime (facets/search early-return avant
  cleanup).
- **Fix** : étendre le mixin (ou créer `TransformerMixin`) couvrant : abonnement,
  re-souscription sur changement de `source`, états loading/error/reset,
  ré-émission aval (`dispatchDataLoaded(this.id, …)`), pass-through meta,
  forwarding de commandes. Migrer les 6 composants.
- **AC** : plus aucun `subscribeToSource` manuel hors mixin ; contrats
  `isLoading()`/`getError()` identiques partout.

### C2. Double-init : propager le fix de join
- **Constat** : le commentaire `dsfr-data-join.ts:111-116` documente le bug
  (connectedCallback + premier cycle Lit = double subscribe/reset) et le corrige
  **uniquement pour join**. query, normalize, unpivot, facets, search et le
  mixin lui-même (`source-subscriber.ts:55-70`) s'initialisent deux fois
  (double lecture du cache, double dispatch, double négociation serveur).
  Corollaire join : si `left`/`right`/`on` sont vides, `_initialize` n'est
  jamais appelé → `reportConfigError` jamais déclenché.
- **Fix** : pattern d'init unique dans le mixin (init au premier `willUpdate`
  uniquement) ; hooks harmonisés (`willUpdate` partout, pas `updated`).
- **AC** : un seul abonnement/émission au montage (test espionnant le
  data-bridge) ; join sans attributs signale sa config manquante.

### C3. Meta de pagination : ordre de publication et pass-through manquants
- **Constats** :
  - normalize publie la meta **après** `dispatchDataLoaded`
    (`dsfr-data-normalize.ts:287-293`) — `document.dispatchEvent` est synchrone,
    l'aval lit la meta du batch précédent. query et source font l'inverse,
    correctement.
  - unpivot et join ne propagent pas la meta du tout (perte de
    `needsClientProcessing` → un query aval saute son traitement client).
- **Fix** : `setDataMeta` avant dispatch, intégré au mixin C1 ; unpivot/join
  propagent (avec `total` invalidé puisqu'ils changent le nombre de lignes).
- **AC** : test pipeline `source(grist fallback) → normalize → query` : le flag
  est lu au bon cycle.

### C4. Erreurs de configuration : source et a11y alignés sur `reportConfigError`
- **Constats** :
  - `getAdapter()` **throw** pour un api-type inconnu
    (`adapter-registry.ts:27-33`), appelé hors try dans `_fetchViaAdapter`
    (`dsfr-data-source.ts:511`), via `setTimeout` sans catch (`:399-402`) →
    unhandled rejection, aucun `dsfr-data-error`, consommateurs gelés en
    loading. Le check `if (!adapter)` est mort.
  - Toutes les erreurs de config de la source sont des `console.warn` muets pour
    l'aval (id manquant, validate échoué) — seul composant sans
    `reportConfigError`.
  - `dsfr-data-a11y` : `for` introuvable → silence total, pas de retry si la
    cible apparaît après (`dsfr-data-a11y.ts:124-127`).
- **Fix** : `getAdapter` retourne `null` (ou try/catch au call site) +
  `dispatchDataError` ; `reportConfigError` sur source et a11y ; retry/
  MutationObserver léger pour la cible a11y.
- **AC** : `api-type="typo"` → erreur visible aval + attribut
  `data-dsfr-config-error` ; a11y posé avant sa cible fonctionne.

### C5. États loading/error harmonisés sur l'affichage
- **Constat** : 4 comportements pour la même erreur — `list`/`chart` affichent
  `error.message`, `display` affiche un texte générique sans message
  (`dsfr-data-display.ts:445-451`), kpi/podium rien ; `display` n'a pas le
  revert de page sur erreur que `list` implémente (`dsfr-data-list.ts:142-148`) ;
  le mixin ne purge pas `_sourceData`/`_sourceError` quand `source` change vers
  une source sans cache (affichage périmé).
- **Fix** : rendu d'erreur/loading factorisé (template partagé), reset d'état
  dans le mixin au changement de source, `onSourceError` + revert dans display.
- **AC** : même UX d'erreur sur les 6 composants d'affichage.

---

## EPIC D — Adapters : brancher ProviderConfig et harmoniser (P1)

### D1. Brancher ou supprimer `pagination.ts` / `response-parser.ts` ; dédupliquer `operatorMapping`
- **Constat** : zéro import dans la lib (uniquement les tests). Chaque adapter
  re-code pagination/parsing ; `tabular-adapter._mapOperator` (`:297-313`)
  duplique mot pour mot `TABULAR_CONFIG.query.operatorMapping` du shared.
  `extractPaginationMeta` est de plus faux pour les providers sans
  `totalCountPath` (`pagination.ts:57-63`).
- **Fix** : décision explicite — soit brancher les helpers ProviderConfig dans
  les 5 adapters, soit les supprimer avec leurs tests. Dans tous les cas, un
  seul `operatorMapping` (celui du shared).
- **AC** : plus de duplication shared/adapter ; pas de module utilitaire
  non importé dans `packages/core/src/utils/`.

### D2. INSEE : taille de page et plafonds `fetchAll` harmonisés
- **Constat** : INSEE consomme `params.pageSize` (défaut 20 venant de la source)
  au lieu de ses pages de 1000 (`insee-adapter.ts:70`) → plafond réel
  `INSEE_MAX_PAGES × 20 = 2000` records (au lieu des 100 000 commentés) et 50×
  plus de requêtes. Plafonds divergents non documentés : ODS 1 000, Tabular
  25 000 (commentaire dit 50K, faux), INSEE 100 000 théorique.
- **Fix** : `fetchAll` utilise la page size optimale du provider (comme
  ODS/Tabular) ; constantes et commentaires corrigés ; plafonds documentés dans
  le tableau des capacités.
- **AC** : fetchAll INSEE 10 000 lignes = 10 requêtes, pas 500.

### D3. Grist : double merge WHERE, gardes de parsing, cache SQL
- **Constats** :
  - `_mergeWhere(params.where, overlay.effectiveWhere)` avec deux chaînes
    identiques (`grist-adapter.ts:423`, `:568`) → SQL `WHERE X AND X`.
  - `parseAggregates` sans garde (`:299-308`) : `aggregate="a:sum,"` → throw
    `Empty SQL identifier`.
  - Cache de dispo SQL par hostname sans TTL (`:92`) : un 403 sur un document
    désactive le SQL pour tous les documents du host, définitivement ; requête
    sonde avec `AbortSignal.timeout(2000)` non liée au signal du composant.
- **Fix** : merge unique (pattern des autres adapters), gardes de parsing
  alignées sur ODS, cache par host+doc avec TTL et invalidation.
- **AC** : SQL généré sans doublon ; aggregate malformé → erreur de config
  propre ; un 403 ponctuel ne condamne pas le host.

### D4. dsfr-data-source : mode URL vs mode adapter cohérents
- **Constats** :
  - Mode URL : les commandes `where`/`orderBy` sont acceptées, stockées,
    déclenchent un refetch… à URL identique (`_buildUrl` ne lit ni
    `getEffectiveWhere()` ni l'overlay) → filtre silencieusement perdu.
  - Changements d'attributs non câblés au refetch : `page-size`, `server-side`,
    `headers`, `method`, `use-proxy` (`dsfr-data-source.ts:194-209`), alors
    qu'`api-key-ref` (même rôle que headers) refetch.
  - `api-type="generic"` + `base-url` active le mode adapter (`:296-300`) dont
    `fetchAll` **throw** systématiquement ; `GenericAdapter.validate()` retourne
    `null` au lieu de signaler.
  - `isLoading()` ment pendant un abort de fetch concurrent (le `finally` du
    fetch annulé remet `_loading = false`).
- **Fix** : soit le mode URL applique les overlays (querystring), soit il les
  refuse explicitement (warning) ; watch-list complète ; `validate()` de
  Generic signale l'absence d'`url` ; jeton de génération pour `_loading`.
- **AC** : un `search` branché sur une source mode URL produit un comportement
  défini (et documenté) ; changer `page-size` refetch.

### D5. ODS et Tabular : échappement et garde-fous server-side
- **Constats** :
  - ODS : identifiants non échappés dans `_buildSelectFromAggregate`
    (`opendatasoft-adapter.ts:330-343`) et `group_by` → champ avec espace casse
    l'ODSQL (Grist échappe systématiquement).
  - Tabular : `buildUrl` appose `field__groupby`/`field__sum` sans consulter
    `isTabularServerFieldSafe` (`tabular-adapter.ts:149`, `:203-220`) — le
    garde-fou n'est appliqué que par query ; posé directement sur la source
    (mode documenté), un champ à espaces produit le « Malformed query » que la
    fonction prétend éviter.
  - Tabular `_applyColonFilters` : `set()` écrase deux filtres même champ+op
    (`:289`) là où Grist/ODS les AND-ent.
  - Tabular over-fetch (toujours 50 même si `remaining < 50`) ; warnings
    copiés-collés avec le préfixe `dsfr-data-query:` dans ODS/Tabular.
- **Fix** : échappement d'identifiants ODS ; `supportsServerFields` consulté
  dans `buildUrl` (fallback client) ; `append` au lieu de `set` ; messages aux
  bons préfixes.
- **AC** : group-by sur champ à espaces fonctionne sur les 3 providers
  (délégué ou fallback), avec le même résultat.

---

## EPIC E — Sécurité et exports (P0)

### E1. XSS : `_highlight` de search + ré-évaluation en cascade de display
- **Gravité** : sécurité.
- **Constats** :
  - `search._addHighlight` (`dsfr-data-search.ts:458-461`) injecte la donnée
    brute non échappée + balises `<mark>` dans `_highlight`, consommable via
    `{{{_highlight}}}` de display (`.innerHTML`) → exécution de HTML issu des
    données sources.
  - `display._renderTemplate` (`dsfr-data-display.ts:169-180`) : la passe
    `{{ }}` s'exécute sur le **résultat** de la passe `{{{ }}}` → une donnée
    contenant `{{x}}` injectée en brut est ré-interprétée comme placeholder.
- **Fix** : `escapeHtml` la valeur **avant** insertion des `<mark>` ;
  remplacement en une seule passe (tokenisation) dans display ; ne mettre en
  highlight que les champs qui matchent.
- **AC** : test XSS — donnée `<img onerror>` inerte dans highlight et
  templates ; donnée contenant `{{x}}` rendue littéralement.

### E2. Export CSV partagé et robuste (list + a11y)
- **Gravité** : bug probable + sécurité (injection de formules).
- **Constat** : deux implémentations (`dsfr-data-list.ts:352-355`,
  `dsfr-data-a11y.ts:204-216`) avec les mêmes défauts : `\n`/`\r` non quotés
  (fichier corrompu), pas de BOM UTF-8 (accents cassés dans Excel FR), pas de
  neutralisation des préfixes `=`/`+`/`-`/`@`. En plus : a11y exporte toutes les
  colonnes (dont `_highlight` et son HTML) quand son tableau n'en montre que 2 ;
  list n'exporte que la page courante en mode serveur sans le signaler.
- **Fix** : `buildCsv()` dans `@dsfr-data/shared` (quoting RFC 4180, BOM,
  neutralisation formules), colonnes cohérentes tableau/CSV, champs techniques
  `_*` exclus.
- **AC** : CSV avec valeur multi-ligne + accents + `=SUM(...)` ouvert proprement
  dans Excel/LibreOffice.

### E3. Supprimer les fallbacks CDN runtime de map-layer
- **Gravité** : architecture/sécurité (posture souveraine).
- **Constat** : injection de `<script src="https://cdn.jsdelivr.net/...">` à
  l'exécution pour markercluster et leaflet.heat
  (`dsfr-data-map-layer.ts:860-866`, `:1089-1096`) — sans SRI, bloqué par tout
  CSP `script-src` strict, contradictoire avec `sovereign-only`, version pinnée
  en dur.
- **Fix** : chunks `import()` dynamiques comme Leaflet (le mécanisme existe
  déjà), suppression du fallback script.
- **AC** : aucune URL CDN dans `packages/core/src/` ; heatmap/cluster
  fonctionnels sous CSP strict.

### E4. Beacons manquants : map-layer et map-popup
- **Gravité** : incohérence (monitoring aveugle).
- **Constat** : tous les composants publics appellent `sendWidgetBeacon()` sauf
  `dsfr-data-map-layer` (qui a pourtant un `type` équivalent au sous-type de
  chart) et `dsfr-data-map-popup` ; `map-timeline` passe `''` au lieu d'omettre ;
  `map` envoie le preset de tuiles comme sous-type (sémantique douteuse).
- **Fix** : `sendWidgetBeacon('dsfr-data-map-layer', this.type)` etc.,
  conventions de sous-type documentées dans `beacon.ts`.
- **AC** : le monitoring voit les types de couches déployés.

### E5. Export/import localStorage : fuite des clés API Grist + validation superficielle
- **Gravité** : sécurité.
- **Constats** (`packages/shared/src/storage/import-export.ts`) :
  - Seul `apiKey` des **connections** est strippé (`:44-47`) ; les **sources**
    sont exportées brutes (`:38, 52`) alors qu'elles portent aussi `apiKey`
    (`types/source.ts:34`) → un export JSON partagé/commité contient les Bearer
    tokens Grist.
  - Validation d'import superficielle : seuls `id`/`name` sont vérifiés ;
    `data`, `headers`, le `code` HTML des favoris passent tels quels du JSON
    importé vers localStorage puis les previews — le contrat « Imports validate
    each item » est très au-dessus de la réalité.
- **Fix** : strip de `apiKey` sur les sources à l'export (ou export chiffré
  opt-in) ; validation structurelle des champs sensibles à l'import.
- **AC** : un export ne contient aucun secret ; un import forgé ne peut pas
  injecter de code dans les previews.

---

## EPIC F — Cartes : fuites, races, contrats popup/timeline (P1)

### F1. `dsfr-data-map` : `_layerBounds` jamais vidé + mutation par `extend`
- **Constat** : `registerLayerBounds` pushe sans jamais reset
  (`dsfr-data-map.ts:147, 279`) → fit-bounds figé sur l'historique, croissance
  mémoire (timeline = 1 push/frame) ; `combined.extend(...)` (`:472`) **mute**
  `_layerBounds[0]`.
- **Fix** : bounds par layer-id (Map remplacée à chaque rendu), copie avant
  extend.
- **AC** : après réduction des données, fit-bounds suit ; pas de croissance
  mémoire en lecture timeline.

### F2. Races async : `_renderLayer` concurrent et swap `_data` de la timeline
- **Constat** : `_renderLayer` async appelé sans await depuis 3 sites → deux
  exécutions concurrentes franchissent chacune `clearLayers()` puis ajoutent
  tous les items (doublons) ; `setTimelineFrame` (`:379-387`) échange
  temporairement `this._data` autour d'un appel async non awaité — fonctionne
  par accident (lecture synchrone), bombe à retardement.
- **Fix** : jeton de génération dans `_renderLayer` + passage des items en
  paramètre (`_renderLayer(items)`).
- **AC** : pas de doublons au premier rendu cluster/heatmap ; timeline robuste.

### F3. `dsfr-data-map-popup` : fuites et contrat `for`
- **Constats** :
  - Listener `keydown` retiré uniquement via Escape (`:250-256`) → fuite à
    chaque fermeture bouton/overlay.
  - `setTimeout(200)` de `_removePanel` non annulé → contenu frais supprimé si
    réouverture < 200 ms.
  - Contrat contradictoire : la doc du popup dit « enfant de la carte, sans
    `for` » et `matchesLayer()` matche tout si `for` vide, mais le layer exige
    `popup.for` truthy (`dsfr-data-map-layer.ts:946-951`) → l'exemple documenté
    ne fonctionne pas.
  - `aria-modal="true"` sans focus trap, focus non rendu au déclencheur.
- **Fix** : cleanup des listeners/timers dans `close()` et
  `disconnectedCallback` ; aligner le layer sur `matchesLayer()` ; focus trap.
- **AC** : exemple de la docstring fonctionnel ; pas de listener résiduel.

### F4. map-layer : bbox client-side et cleanup au disconnect
- **Constats** :
  - Fallback bbox client filtre via `_extractCoords` (points uniquement) → avec
    `type="geoshape"` + adapter sans `serverGeo`, **tous les polygones
    disparaissent** au premier pan (`:503-506`, `:878-932`).
  - `disconnectedCallback` n'annule pas le filtre `whereKey: 'map-bbox'` poussé
    sur la source → un layer retiré laisse la source filtrée sur le dernier
    viewport.
  - `_findPopupCompanion()` appelé par record (jusqu'à 5000 querySelector par
    rendu) ; banners de troncature superposés ; `radius-unit="m"` +
    `radius-field` → cercles invisibles (échelle px appliquée en mètres).
- **Fix** : bounds des géométries (Leaflet `getBounds`) pour le filtre client ;
  commande `where: ''` au disconnect ; compagnon résolu une fois par rendu.
- **AC** : geoshapes + bbox sur Tabular : les polygones restent ; retirer un
  layer libère le filtre.

### F5. dsfr-data-map : double init et init posthume
- **Constat** : aucune garde dans `_initMap` (`dsfr-data-map.ts:313`) → double
  init possible (reconnexion DOM, IntersectionObserver pendant un
  `await loadLeaflet()`) ; si déconnecté pendant l'await, la carte est créée sur
  un élément détaché et jamais `remove()` (fuite listener `resize` window).
- **Fix** : garde `if (this._leafletMap) return` + check `isConnected` après
  chaque await ; ids ARIA par compteur module (pas `Date.now()`).
- **AC** : déplacement du widget dans le dashboard sans double carte ni fuite.

### F6. world-map : aligner sur la famille carte
- **Constats** : attribut `zoom` de type `'continent'|'none'` quand
  `dsfr-data-map` a un `zoom` numérique Leaflet (même nom, sémantiques
  incompatibles) ; interaction 100 % souris (aucun pays focusable, pas de
  clavier) là où map investit (skip-link, live region) ; pas de garde de
  concurrence sur `loadTopology()` ; branche morte dans `updated` et palettes
  dupliquées (traitées en G3).
- **Fix** : renommer `zoom` → `zoom-mode` (alias déprécié) ; navigation clavier
  + tooltips focusables ; mémoïsation du fetch TopoJSON.
- **AC** : parcours clavier d'un pays à l'autre avec annonce de la valeur.

---

## EPIC G — Affichage : harmonisation attributs, formatage, palettes (P1/P2)

### G1. Convention d'attributs unique (anglais) avec alias de compatibilité — **breaking change encadré**
- **Constat** : trois conventions — kpi en français (`valeur`, `seuil-vert`,
  `seuil-orange`, `icone`, `couleur`, `format="nombre|euro"`), list en français
  + franglais (`colonnes`, `recherche`, `tri`, `server-tri`), tout le reste en
  anglais (`value-field`, `server-side`, `server-search`).
- **Fix** : décider la cible (anglais, aligné sur le reste), ajouter les
  attributs anglais avec lecture des anciens en alias déprécié (warning
  console), changeset minor, retrait des alias à la 1.0. Mise à jour
  skills.ts + builder + guide.
- **AC** : les deux écritures fonctionnent pendant la dépréciation ; le guide
  n'utilise plus que la convention cible.

### G2. Parsing numérique unifié (`toNumber` partout)
- **Constat** : `Number()` (chart/podium/query/kpi), `parseFloat`
  (display/formatters), `toNumber` fr (normalize seul). Un CSV français
  `"1 234,5"` devient `0`, `1` ou `1234.5` selon le composant.
- **Fix** : `toNumber` de `@dsfr-data/shared` dans chart-data, aggregations,
  query, display, formatters ; politique NaN unique (exclu des agrégats, jamais
  converti en 0). Corrige aussi `aggregations.ts` min/max → `Infinity` quand
  aucune valeur n'est numérique (`:102-108`) et `numeric` de normalize qui
  transforme `"N/A"` en `0` (`dsfr-data-normalize.ts:354-365`).
- **AC** : pipeline ODS/Tabular avec décimales françaises agrégé correctement
  sans `normalize` intercalé.

### G3. Palettes uniques via `@dsfr-data/shared`
- **Constat** : podium code en dur une `categorical` différente de
  `PALETTE_COLORS` (mêmes noms d'attribut que chart, couleurs différentes) ;
  `CHOROPLETH_PALETTES` copié-collé entre map-layer et world-map avec
  **bucketing divergent** (`<=` vs `>=` sur les breaks) et fallbacks différents.
- **Fix** : palettes + `getColorForValue()` dans shared, consommées par podium,
  map-layer, world-map.
- **AC** : même `selected-palette` = mêmes couleurs sur chart, podium et les
  deux cartes ; même valeur sur un break = même bucket.

### G4. dsfr-data-kpi : grammaire, chemins, locale
- **Constats** : grammaire d'agrégat inversée (`fn:field` vs `field:fn:alias`
  partout ailleurs) ; pas de `getByPath` (seul composant sans chemins
  imbriqués, `aggregations.ts:76+`) ; tendance `toFixed(1)+'%'` en dur
  (`dsfr-data-kpi.ts:178-188`) → `5.2%` à côté de `5 825` fr-FR ; doc
  `tendance` trompeuse (un littéral `"+3.2"` est interprété comme nom de champ).
- **Fix** : accepter la grammaire commune (l'ancienne en alias déprécié),
  `getByPath`, formatage fr-FR via formatters, doc corrigée. Dépend de G1/G2.
- **AC** : `valeur`/`value` sur champ imbriqué + tendance formatée fr-FR.

### G5. list/display : factoriser pagination/url-sync et corriger les dérives
- **Constats** (~150 lignes dupliquées avec divergences) :
  - `url-sync` : la page restaurée depuis l'URL est écrasée par
    `_currentPage = 1` à l'arrivée des données en mode client
    (`dsfr-data-list.ts:160-163`, `dsfr-data-display.ts:137-140`).
  - Tri serveur sans reset de page (`list.ts:324-328`).
  - Mode serveur : recherche/filtres locaux n'opèrent que sur la page chargée,
    compteur `_serverTotal` faux quand un filtre est actif, options de filtre
    construites sur la page courante (`list.ts:190-238`, `:670-672`).
  - `$index`/`$uid` faux en pagination serveur (`display.ts:319`) ; pagination
    serveur masquée si l'attribut `pagination` n'est pas redondé.
  - ids DOM dupliqués entre instances (`search-${source}`, `item-${index}`).
- **Fix** : contrôleur de pagination partagé (un module, deux consommateurs) ;
  en mode serveur, recherche/filtre délégués via commandes (ou désactivés avec
  warning) ; ids préfixés par instance.
- **AC** : `?page=3` respecté dans les deux modes ; tri serveur revient page 1 ;
  compteurs exacts.

### G6. dsfr-data-chart : cycle de rendu et data extraction
- **Constats** :
  - Remontage complet du composant Vue à chaque update (manipulation DOM
    impérative dans `render()`, `dsfr-data-chart.ts:697-708`) — perte
    d'animations, remount périodique avec `refresh`.
  - `setTimeout(500)` deferred/databox jamais annulés, empilés à chaque
    onSourceData, ciblant des éléments potentiellement remplacés (`:538-544`,
    `:636-673`).
  - `value-fields` sans `value-field` → série fantôme de zéros + nom de série
    vide (`:220-232`, `getByPath(record, '')` retourne l'objet entier).
  - `utils/chart-data.ts` : code mort dont l'en-tête prétend factoriser le
    chart — brancher ou supprimer.
  - Mineurs : double import shared, `deferred['date'] = new Date()` (la date du
    jour présentée comme date de la donnée).
- **Fix** : mise à jour incrémentale des attributs de l'élément chart existant
  (recréation seulement si `type` change) ; timers trackés et annulés ;
  `_getAllValueFields` filtre les champs vides ; décision chart-data.ts.
- **AC** : update de données sans remount Vue ; pas de timer résiduel après
  disconnect ; `value-fields` seul rend N séries propres.

### G7. Formatage : shared vs core divergents (preview ≠ rendu final)
- **Gravité** : incohérence.
- **Constats** :
  - `formatKPIValue` (shared, previews des apps) vs formatters de core
    (composants) : euro 2 décimales vs 0 ; `%` = suffixe texte vs
    `style:'percent'` qui divise par 100. La preview du builder n'affiche pas
    ce que rendra le composant.
  - `looksLikeNumber` et `toNumber` incohérents entre eux (`'1e3'`, `'50%'`,
    `'+123'` rejetés par l'un, parsés par l'autre), non documenté.
- **Fix** : une seule famille de formatters (shared), consommée par les
  composants ET les previews ; politique documentée pour `%`.
- **AC** : preview builder = rendu composant pour les 4 formats KPI.

---

## EPIC H — Séparation bibliothèque / code applicatif (P1)

### H1. Sortir `layout/` des bundles publiés
- **Constat** : `auth-modal`, `password-change-modal`, `share-dialog` (fetch
  `/api/auth`, `/api/shares`), `app-header` (services d'auth) vivent dans
  `packages/core/src/components/layout/` ; `AppHeader`/`AppFooter`/
  `AppLayoutBuilder`/`AppLayoutDemo` sont exportés par `index.ts` et
  `index-core.ts` (bundle npm public). Incohérence interne : `layout/index.ts`
  exporte 6 composants, les entries n'en réexportent que 4.
- **Fix** : nouveau package workspace non publié (`@dsfr-data/app-ui`) ou
  déplacement dans `apps/` ; retrait des exports publics (changeset major ou
  minor selon la politique) ; vérifier l'impact bundle size.
- **AC** : `npm pack` de `dsfr-data` ne contient plus aucun code d'auth ni
  d'appel `/api/*` applicatif.

### H2. Extraire le cache serveur (`/api/cache`) de dsfr-data-source
- **Constat** : `_putCache`/`_getCache` (`dsfr-data-source.ts:713-734`)
  appellent `/api/cache/<id>` en relatif dès que `isAuthenticated()` ; la clé ne
  contient ni URL ni page ni where (le fallback peut resservir la page 3
  filtrée d'hier pour une requête page 1) ; l'attribut documenté `cache-ttl` ne
  fait rien pour un embed anonyme — sémantique divergente de la doc.
- **Fix** : mécanisme de hook/plugin (`window.DSFR_DATA_CACHE_PROVIDER` ou
  callback enregistrable) implémenté côté app, retiré de la lib ; clé de cache
  incluant un hash des params ; doc de `cache-ttl` corrigée.
- **AC** : la lib publiée ne contient plus d'URL `/api/*` ; l'app conserve le
  fallback offline via le hook.

### H3. Clarifier le mode DB du beacon
- **Constat** : `beacon.ts:63-94` contient une branche `window.__gwDbMode` qui
  POST sur `/api/monitoring/beacon` avec `credentials: 'include'` — logique
  applicative dans l'utilitaire de la lib, nommage `__gw*` hérité.
- **Fix** : même approche hook que H2 (le transport par défaut reste le pixel) ;
  renommage cohérent.
- **AC** : `beacon.ts` ne référence plus d'API applicative.

### H4. Packaging : `npm install dsfr-data` cassé (dépendance privée)
- **Gravité** : bug P0 (consommateur npm), vérifié.
- **Constat** : `packages/core/package.json` déclare `"@dsfr-data/shared":
  "^0.1.0"` en `dependencies` ; ce package est `"private": true` et répond E404
  sur le registre → la résolution npm échoue pour tout consommateur. Des
  `@types/*` sont aussi en `dependencies` au lieu de `devDependencies`. Aucun
  champ `sideEffects` dans les deux package.json (tree-shaking dégradé).
- **Fix** : shared en `devDependency` bundlé dans `dist/` (il l'est déjà de
  fait) ou publication de `@dsfr-data/shared` ; nettoyage des deps ;
  `sideEffects: false` (ou liste) sur les deux packages.
- **AC** : `npm install dsfr-data` dans un projet vierge fonctionne ;
  `npm pack` ne déclare aucune dépendance fantôme.

### H5. Proxy par défaut baké + partition officielle lib/app de shared
- **Gravité** : sécurité/souveraineté + architecture (P0/P1), vérifié.
- **Constats** :
  - `PROXY_BASE_URL` retombe sur `https://chartsbuilder.matge.com`
    (`proxy-config.ts:45-46`), présent 2× dans les bundles publiés : sans
    `VITE_*` au build, tout le trafic Tabular/Grist/INSEE/Albert d'un site
    tiers transite par ce domaine personnel (URL cible en `X-Target-URL`).
  - `isViteDevMode()` (`proxy-config.ts:108-117`) : tout `localhost:<port>` est
    traité comme le dev de CE repo → chemins `/tabular-proxy/...` relatifs →
    404 systématiques pour un intégrateur tiers en dev local.
  - Aucune frontière publiable/interne dans shared : le barrel unique exporte
    auth, storage, ui, tours avec les utilitaires purs.
- **Fix** : config proxy injectable au runtime (`window.DSFR_DATA_PROXY` ou
  attribut), défaut = accès direct sans proxy ; partition de shared en deux
  entrées (`/lib` vs `/app`) ou deux packages ; lint interdisant l'import
  `/app` depuis `packages/core/src`.
- **AC** : bundle publié sans domaine personnel ; un site tiers sur
  `localhost:3000` fetch les APIs directement ; les imports app-side sont
  bloqués par lint dans core.

---

## EPIC I — dsfr-data-facets : robustesse et accessibilité (P1)

(1 625 lignes — le plus gros composant. A3/A6/C1 traitent déjà le WHERE, les
params source et l'abonnement.)

### I1. AbortController et jeton de génération sur les fetch de facettes
- **Constat** : `fetchFacets` jamais abortée (la signature accepte pourtant un
  signal) → deux interactions rapides = la réponse la plus lente écrase l'état ;
  erreurs avalées en silence (`dsfr-data-facets.ts:630-647`).
- **Fix** : AbortController par cycle + jeton de génération ; erreurs au moins
  `console.warn` + état d'erreur rendu.
- **AC** : clics rapides → état final = dernière requête ; erreur réseau
  visible.

### I2. États : UI vide en server-facets et sélections fantômes
- **Constats** :
  - `_rawData.length === 0 → render nothing` (`:1111`) : en mode serveur, une
    sélection donnant 0 résultat fait disparaître checkboxes **et** bouton
    Réinitialiser — utilisateur coincé.
  - Après refetch, les valeurs sélectionnées disparues des données restent dans
    `_activeSelections` (filtre actif invisible).
- **Fix** : toujours rendre les groupes + reset en mode serveur ; purge des
  sélections orphelines à la reconstruction des groupes (ou affichage « valeur
  indisponible » désélectionnable).
- **AC** : filtre menant à 0 résultat → UI complète avec Réinitialiser actif.

### I3. RGAA : ids dupliqués et live regions multiples
- **Constats** : ids générés par `value.replace(/[^a-zA-Z0-9]/g, '_')`
  (`:1283` etc.) → « A-B » et « A B » collisionnent (label coche le mauvais
  input) ; une live region par fieldset (`:1265`, `:1408`, `:1534`) → annonces
  répétées N fois ; diacritiques incohérents dans les annonces.
- **Fix** : ids par index + uid d'instance ; une seule live region au niveau
  composant ; textes harmonisés.
- **AC** : audit axe/RGAA sans duplication d'id ; une annonce par action.

### I4. url-sync : params préservés et url-params validés
- **Constats** : `_syncUrl` repart de `new URLSearchParams()` (`:1076`) →
  efface le param du `search` voisin et tout autre param (search préserve,
  lui) ; sans `url-param-map`, tout param d'URL (`?utm_source=...`) devient une
  sélection sur champ inexistant → 0 résultat (`:1049-1051`) ; doc dit
  pushState, le code fait replaceState.
- **Fix** : partir de `location.search` ; sans map, n'accepter que les params
  correspondant aux `fields`/champs des données ; doc alignée.
- **AC** : facets + search en url-sync sur la même page cohabitent ;
  `?utm_source=x` sans effet.

### I5. Factoriser les rendus internes (checkbox/multiselect/radio)
- **Constat** : le bloc « valeur + compteur » copié 3×, la barre de recherche
  2×, ~250-300 lignes factorisables ; `_searchDebounceTimer` non nettoyé au
  disconnect ; `this.closest('dsfr-data-facets') ?? this` (code mort) ;
  `baseWhere` recalculé dans la boucle.
- **Fix** : templates privés partagés entre les 3 modes ; nettoyages.
- **AC** : comportement identique (snapshots), fichier sensiblement réduit.

---

## EPIC J — @dsfr-data/shared côté app : auth, storage, sync (P1)

Constats de la passe shared sur la chaîne applicative (apps + mode DB). Aucun
impact sur les sites tiers, mais des pertes de données utilisateur possibles.

### J1. Double instance des singletons auth/sync-queue (bundle vs apps)
- **Gravité** : bug probable / perte d'écritures.
- **Constat** : les apps chargent les composants via le bundle pré-compilé
  (`dist/dsfr-data.esm.js`) ET importent `@dsfr-data/shared` aliasé sur `src`
  → deux copies de `auth-service` (`_state`, `_csrfToken`, `_checkAuthPromise`)
  et `sync-queue` à l'exécution : double `/api/auth/me` au démarrage,
  indicateur de sync du header (copie bundle) aveugle aux syncs réels (copie
  app), et les deux copies persistent sous la même clé
  `'dsfr-data-sync-queue'` → `persistQueue()` d'une copie peut écraser les
  opérations en attente de l'autre.
- **Fix** : un seul canal (étatpartagé sur `window` comme le data-bridge, ou
  injection du service par l'app dans les composants layout — caduc si H1
  sort layout/ du bundle).
- **AC** : un seul checkAuth au démarrage ; l'indicateur de sync reflète les
  syncs réels ; pas d'écrasement de file.

### J2. Storage/sync : merge destructif, write-back massif, conflits ignorés
- **Gravité** : bug probable / perte de données.
- **Constats** :
  - `mergeServerWithLocal` (`api-storage-adapter.ts:139`) : `return
    serverItems.map(...)` — un item local absent du serveur disparaît, puis
    `load()` écrase le cache local (`:252`). Favorites/dashboards : pas de
    merge du tout. Contradiction avec le « local-first » annoncé.
  - Chaque `load()` re-PUT toute la collection via le save-hook d'`initAuth`
    (GET + un PUT par item) ; `initAuth` préfetch 5 clés → chaque ouverture
    d'app re-téléverse tout. Last-write-wins sans version/etag.
  - sync-queue : `409` traité comme un succès et jeté (`:191`) ; GET initial ni
    queué ni retryé ; URLs persistées absolues avec baseUrl figé.
- **Fix** : merge par timestamp/version (ou tombstones), suppression du
  write-back au load, gestion 409 (rejouer en PUT), file robuste.
- **AC** : un item créé hors-ligne survit à la reconnexion ; ouvrir une app ne
  génère aucun PUT si rien n'a changé.

### J3. Shared app-side : nettoyages et contrats
- **Gravité** : fil de l'eau.
- **Constats** : `setAuthBaseUrl` exporté jamais appelé (doc mensongère) ;
  `_dbMode` figé à `false` sur échec transitoire du premier ping ;
  `window.__gwDbMode` non typé, préfixe legacy `gw` (lié à H3) ;
  `fetchWithTimeout` écrase le `signal` de l'appelant ; `cdn-versions.ts`
  désynchronisé (`dsfrChart: '2.0.4'` vs `^2.0.5` installé) et `getPreviewHTML`
  hardcode `${origin}/dist/...` ; `migration.ts` vestige ;
  `validateAndFilterArray`/`getAllProviders` morts ; `saveToStorage` importe le
  toast (persistance → UI) ; `PaletteType` résolu en `string`.
- **Fix** : suppression du mort, contrats typés, resync des versions CDN
  (idéalement générées depuis package.json).
- **AC** : zéro export sans consommateur dans shared ; versions CDN alignées.

---

## Hors périmètre de ce plan (constats mineurs non bloquants)

Consignés ici pour mémoire, à traiter au fil de l'eau dans les epics
correspondants : garde morte `sortParts.length < 1` (query), `filter` prime sur
`where` malgré la doc « alias » (query), `localeCompare` sans locale explicite,
`replace` de normalize qui est une égalité stricte (doc « pattern » trompeuse),
collisions de `rename`/`lowercase-keys` sans warning, `1.2.3` accepté par le
tokenizer de compute, division par zéro → `Infinity` dans compute, clés de join
`null` qui se joignent entre elles + séparateur `|` non échappé
(`shared/utils/join.ts:133-135` — à corriger avec A1/G2), détection de
collisions join sur la seule première ligne, `aria-sort` posé sur toutes les
colonnes (list), tri lexicographique des options de filtre (list),
`updated()` de map ignorant center/zoom, `attribute: 'for'` vs `htmlFor`,
`données.csv` comme nom de fichier par défaut.

## Addendum — Revue de `@dsfr-data/shared` (passe complémentaire)

Revue dédiée de `packages/shared/src` (~5 600 lignes, 43 fichiers) : providers/,
api/, storage/, auth/, ui/, query/, utils/. Constats intégrés aux epics
ci-dessus (A7, E5, G7, H4, H5, epic J). Synthèse :

### Constats critiques (vérifiés)

1. **`npm install dsfr-data` est cassé** : `packages/core/package.json` déclare
   `"@dsfr-data/shared": "^0.1.0"` en `dependencies`, or ce package est
   `"private": true` et répond E404 sur le registre npm (vérifié via
   `npm view`). Tout consommateur npm échoue à la résolution ; seul l'usage CDN
   fonctionne (bundles `dist/` autonomes). Des `@types/*` traînent aussi en
   `dependencies`. → **H4**
2. **La chaîne auth complète est dans les bundles npm publiés** (vérifié par
   build + grep sur `dist/dsfr-data.core.esm.js`) : 16× `/api/auth`, la modale
   de connexion, `/api/cache`, `/api/monitoring`, toasts. Causes : exports
   `layout/` + import `isAuthenticated` dans `dsfr-data-source` + barrel unique
   de shared sans champ `sideEffects`. → renforce **H1/H2**
3. **`chartsbuilder.matge.com` baké en défaut dans les bundles** (2 occurrences
   vérifiées) : sans variables `VITE_*` au build, `getProxiedUrl()` réécrit tout
   le trafic Tabular/Grist/INSEE/Albert vers ce domaine personnel, avec l'URL
   cible en header `X-Target-URL`. Et `isViteDevMode()` traite tout
   `localhost:<port>` comme le dev de CE repo → 404 systématiques pour un
   intégrateur tiers en dev local. → **H5**
4. **Double instance des singletons module-level** : les apps chargent les
   composants via le bundle pré-compilé ET importent `@dsfr-data/shared` aliasé
   sur `src` → deux copies de `auth-service` (`_state`, `_csrfToken`,
   `_checkAuthPromise`) et de `sync-queue` coexistent. Double `checkAuth` au
   démarrage, indicateur de sync du header aveugle aux syncs réels, et les deux
   copies persistent leur file sous la même clé `'dsfr-data-sync-queue'` →
   **écrasement possible d'opérations en attente (perte d'écritures)**. → **J1**
5. **Perte de données dans la couche storage app** :
   `mergeServerWithLocal` retourne `serverItems.map(...)` — un item local absent
   du serveur (créé hors-ligne, ou POST abandonné après 3 retries) disparaît,
   puis `load()` écrase le cache local. Et chaque `load()` re-PUT toute la
   collection (write-back via le save-hook d'`initAuth`) → à chaque ouverture
   d'app, tout est re-téléversé, last-write-wins sans version/etag, `409` traité
   comme un succès et jeté. → **J2**
6. **Fuite des clés API Grist dans l'export JSON** : `import-export.ts` strippe
   `apiKey` des connections mais exporte les **sources** brutes, qui portent
   aussi `apiKey` (`types/source.ts:34`). Un export partagé contient les Bearer
   tokens. Validation d'import par ailleurs superficielle (le `code` HTML des
   favoris importés passe tel quel). → **E5**
7. **`filter-translator.ts` = 3e implémentation divergente des opérateurs** :
   `filterToOdsql` n'échappe ni `"` ni `\` (ODSQL cassé/injectable dans le code
   généré par les builders), quote les valeurs numériques de gt/lt ;
   `applyLocalFilter` ne supporte pas `in`/`notin` (retourne tout,
   silencieusement) là où le chemin serveur filtre. → **A7**
8. **`toNumber` : séparateurs multiples mal parsés** (vérifié par exécution) :
   `toNumber('1,234,567')` → `1.234` ; `'1.234.567'` → `1.234`. Consommé par
   compute et dsfr-data-normalize. → intégré à **G2**

### ProviderConfig : état des lieux pour l'epic D1

- ~60 % des champs ne sont lus par personne (`capabilities.*`, `query.*`,
  `facets.*`, `codeGen.*` entier) ; les seuls lecteurs de `pagination`/`response`
  sont les modules morts de core. `getProviderConfig()` est implémenté sur les
  5 adapters et jamais appelé.
- **La config ment** : `GENERIC_CONFIG.query.whereFormat: 'colon'` vs adapter
  core `'odsql'` (et c'est l'adapter qui agit). Deux schémas de capacités non
  alignés (shared n'a ni `serverGeo` ni `whereFormat` dans capabilities).
- Ce que la config ne sait pas encore exprimer (à modéliser pour D1) : grammaire
  d'agrégat et règle d'alias, format order-by (template + multi-champs),
  sérialisation des opérateurs (suffixe `__op`, query-params, SQL paramétré),
  bimode Grist Records/SQL, contraintes `supportsServerFields`, échappement par
  dialecte.
- Il manque un **test d'alignement config↔adapter** sur le modèle de
  `skills.test.ts` — c'est son absence qui a permis la divergence.
- → intégré à l'issue **D1 (#285)**.

### Divergences de formatage et de palettes (intégrées à G)

- `formatKPIValue` (shared, utilisé par les previews des apps) et les
  formatters de core (utilisés par les composants) divergent : euro 2 décimales
  vs 0 ; `%` suffixe vs `style:'percent'` (÷100). **Preview ≠ rendu final.**
  `looksLikeNumber` et `toNumber` incohérents entre eux. → **G7**
- Les palettes shared (5 pas, hexes `#9A9AFF`/`#E5E5F4` introuvables ailleurs)
  ne sont **pas** la bonne base : les échelles 9 pas de core (blue-france
  975→main-525), cohérentes entre podium/map-layer/world-map, doivent devenir
  la version shared. → intégré à **G3 (#302)**.

### Partition lib / app proposée pour shared

- **Côté LIB (publiable)** : `utils/` (escape-html, security, number-parser,
  join, unpivot, compute, dept-codes), `constants/dsfr-palettes`,
  `charts/chart-types`, `providers/`, et `api/proxy*` **après** refonte H5
  (config runtime injectable).
- **Côté APP (jamais dans les bundles)** : `auth/`, `storage/`, `ui/`, `tour/`,
  `templates/cdn-versions`, `data/sample-datasets`, `validation/`,
  `types/source`, `query/filter-translator` (à fusionner avec la couche WHERE
  des adapters — A7).
- Matérialiser la frontière : deux entrées (`@dsfr-data/shared/lib` vs `/app`)
  ou deux packages + champ `sideEffects` + interdiction lint d'importer `/app`
  depuis `packages/core/src`. → **H5**

### Constats secondaires (epic J3 / fil de l'eau)

`setAuthBaseUrl` exporté jamais appelé (la doc décrit un usage inexistant) ;
`_dbMode` figé à `false` sur échec transitoire du premier ping ;
`window.__gwDbMode` : contrat inter-packages non typé, préfixe legacy `gw` ;
`fetchWithTimeout` écrase le `signal` de l'appelant (annulation impossible) ;
`cdn-versions.ts` désynchronisé (`dsfrChart: '2.0.4'` vs `^2.0.5` installé,
`getPreviewHTML` hardcode `${origin}/dist/...`) ; `migration.ts` vestige d'une
ligne ; `validateAndFilterArray` et `getAllProviders` morts ;
`storage → import dynamique du toast` (couche persistance qui affiche de l'UI) ;
`PaletteType` résolu en `string` (ne contraint rien) ; `dept-codes` accepte
`'20'` (Corse pré-1976) ; `sample-datasets` : clé accentuée `catégorie`.

Points sains confirmés : `escape-html` et `security/isUnsafeKey` corrects ;
pas de token en localStorage (session cookie + CSRF en mémoire, `checkAuth`
concurrent dédupliqué) ; `resolveSourceUrl`/`normalizeProviderAuthHeaders`/
`datagouv-dataset` bien conçus ; `product-tour` propre.

## Faut-il aller plus en profondeur ?

La revue statique de `packages/core/src` a un bon niveau de couverture ; une
nouvelle passe statique aurait un rendement décroissant. Les approfondissements
utiles sont ailleurs :

1. **Transformer les bugs P0 en tests qui échouent** avant de corriger
   (Vitest + fixtures par adapter) — c'est la validation runtime qui manque à
   cette revue, et le filet anti-régression des epics A, B, E.
2. **`packages/shared/`** : revue partielle ici (join, compute, number-parser,
   palettes) ; une passe dédiée (providers/, api/, storage) vaudrait le coup,
   surtout si H1/H2 en font la frontière officielle lib/app.
3. **Couverture de tests** : mesurer `tests/` contre les composants — les zones
   les plus boguées trouvées (délégation query, meta, facets serveur) sont
   probablement les moins testées.
4. **Le serveur Express et les apps** : exclus de cette revue à dessein ;
   `share-dialog`/`auth` méritent une passe sécurité côté serveur.
