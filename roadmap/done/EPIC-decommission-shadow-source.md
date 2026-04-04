# EPIC : Decommissionnement du shadow source (dsfr-data-query backward-compat)

## Contexte

Le composant `dsfr-data-query` supporte un mode backward-compatible ou `<dsfr-data-query api-type="opendatasoft" ...>` sans `<dsfr-data-source>` explicite cree dynamiquement un `<dsfr-data-source>` invisible ("shadow source") dans le DOM. Ce mecanisme :

- Complexifie le code (~100 lignes dediees)
- Cree un couplage implicite entre dsfr-data-query et dsfr-data-source
- Rend le debugging difficile (element invisible dans le DOM)
- Masque le flux de donnees reel a l'utilisateur
- N'est plus genere par aucun builder depuis le fix `94459c0`

**Decision** : l'app n'etant pas encore en production, aucune retrocompatibilite n'est necessaire. Le shadow source peut etre supprime completement.

---

## Inventaire du code a supprimer/modifier

### 1. `src/components/dsfr-data-query.ts` — Coeur du shadow source

| Lignes | Element | Action |
|--------|---------|--------|
| 17-18 | Type `ApiType` (deprecated) | **Supprimer** |
| 59-99 | JSDoc classe : exemple backward compat (lignes 88-98) | **Supprimer** l'exemple deprecated, garder les 2 autres |
| 105-106 | Propriete `apiType` (`api-type`) | **Supprimer** |
| 117-118 | Propriete `baseUrl` (`base-url`) | **Supprimer** |
| 123-124 | Propriete `datasetId` (`dataset-id`) | **Supprimer** |
| 129-130 | Propriete `resource` | **Supprimer** |
| 136-137 | Propriete `select` | **Supprimer** |
| 206-207 | Propriete `headers` (utilisee uniquement par shadow source) | **Supprimer** |
| 232-233 | Champs prives `_shadowSource`, `_shadowSourceId` | **Supprimer** |
| 286 | Appel `_destroyShadowSource()` dans `_cleanup()` | **Supprimer** l'appel |
| 302-337 | Bloc backward-compat dans `_initialize()` | **Simplifier** : ne garder que le chemin `this.source` (mode normal) |
| 341-372 | Methode `_createShadowSource()` | **Supprimer** entierement |
| 374-384 | Methode `_destroyShadowSource()` | **Supprimer** entierement |
| 413-442 | `_handleSourceData()` : check `_shadowSource` pour eviter double-processing | **Simplifier** : supprimer le branchement shadow |
| 448-452 | `_serverHandlesGroupBy()` | **Supprimer** (n'existe que pour le shadow source) |
| 695-709 | `_setupCommandForwarding()` : fallback `_shadowSourceId \|\| this.source` | **Simplifier** : utiliser `this.source` directement |
| 717-727 | `getEffectiveWhere()` : fallback shadow source | **Simplifier** |
| 732-741 | `getAdapter()` : fallback shadow source | **Simplifier** |
| 746-756 | `reload()` : branche shadow source | **Simplifier** |

**Estimation** : ~100 lignes supprimees, ~20 lignes simplifiees.

### 2. `tests/dsfr-data-query.test.ts` — Tests du shadow source

| Lignes | Test | Action |
|--------|------|--------|
| 33 | `clearDataCache('__gq_test-query_src')` dans setup | **Supprimer** |
| 45-46 | Cleanup des elements `__gq_*` dans teardown | **Supprimer** |
| 358-376 | "creates shadow source when api-type is set without source" | **Supprimer** |
| 378-409 | "shadow source gets all relevant attributes" | **Supprimer** |
| 411-427 | "destroys shadow source when switching to source mode" | **Supprimer** |
| 429-436 | "does not create shadow source in generic mode" | **Supprimer** |
| 438-462 | "processes data from shadow source via data-bridge events" | **Supprimer** |
| 464-479 | "cleanup removes shadow source" | **Supprimer** |
| 516-537 | "forwards to shadow source in compat mode" | **Supprimer** |
| 967-982 | "appends to document.body when no parent element" | **Supprimer** |
| 984-1000 | "uses filter attribute as where fallback" | **Adapter** si filter existe encore hors compat |

**A ajouter** :
- Test verifiant que `<dsfr-data-query>` sans `source` emet un warning et ne fait rien
- Test verifiant que `api-type` sur `<dsfr-data-query>` est ignore

### 3. `specs/components/dsfr-data-query.html` — Specifications

| Lignes | Contenu | Action |
|--------|---------|--------|
| 17-21 | Exemple deprecated en en-tete | **Remplacer** par le pattern dsfr-data-source + dsfr-data-query |
| 55-73 | Table des modes (generic/opendatasoft/tabular) | **Simplifier** : supprimer les modes adapter, garder uniquement la mention de `source` |
| 80 | Attribut `api-type` dans la table des attributs | **Supprimer** |
| 82-93 | Attributs `base-url`, `dataset-id`, `resource`, `select`, `headers` | **Supprimer** |
| 226-250 | Exemple "Mode OpenDataSoft : requete serveur" | **Remplacer** par un exemple avec `<dsfr-data-source>` explicite |
| 258-266 | Exemple "Mode Tabular API" (si deprecated) | **Remplacer** |
| 299-308 | Exemple "Dataset prive avec headers" | **Remplacer** par un pattern utilisant `headers` sur `<dsfr-data-source>` |
| 330-337 | Exemple "Rafraichissement automatique" | **Remplacer** par `refresh` sur `<dsfr-data-source>` |

### 4. `apps/builder-ia/src/skills.ts` — Skills IA

| Lignes | Contenu | Action |
|--------|---------|--------|
| 344-347 | Note sur le mode deprecated et backward compat | **Supprimer** la mention du mode deprecated |

### 5. `CLAUDE.md` — Documentation projet

| Lignes | Contenu | Action |
|--------|---------|--------|
| ~167 | Section "Retrocompatibilite" mentionnant le shadow source | **Supprimer** la section entierement |

### 6. `guide/guide-exemples-facets.html`

| Lignes | Contenu | Action |
|--------|---------|--------|
| ~328 | Reference au pattern deprecated pour server-facets | **Mettre a jour** vers le nouveau pattern |

---

## Taches

### T1 — Supprimer le shadow source de `dsfr-data-query.ts`

**Fichier** : `src/components/dsfr-data-query.ts`

1. Supprimer le type `ApiType`
2. Supprimer les 6 proprietes deprecated : `apiType`, `baseUrl`, `datasetId`, `resource`, `select`, `headers`
3. Supprimer les champs prives `_shadowSource` et `_shadowSourceId`
4. Supprimer les methodes `_createShadowSource()` et `_destroyShadowSource()`
5. Supprimer `_serverHandlesGroupBy()`
6. Simplifier `_initialize()` :
   - Si `this.source` est defini : `_subscribeToSourceData(this.source)` (comportement actuel)
   - Si `this.source` est vide : log un warning et return (pas de fallback shadow)
7. Simplifier `_handleSourceData()` : retirer le branchement `if (this._shadowSource)`
8. Simplifier `_setupCommandForwarding()` : remplacer `this._shadowSourceId || this.source` par `this.source`
9. Simplifier `getEffectiveWhere()`, `getAdapter()`, `reload()` : retirer les fallback shadow

**Critere de validation** : `npm run build` passe sans erreur TypeScript.

### T2 — Mettre a jour les tests unitaires

**Fichier** : `tests/dsfr-data-query.test.ts`

1. Supprimer le describe "Shadow source (backward compat mode)" entier (~120 lignes)
2. Supprimer le test "forwards to shadow source in compat mode"
3. Supprimer le describe "Shadow source edge cases" entier
4. Nettoyer setup/teardown : retirer `clearDataCache('__gq_*')` et cleanup `__gq_*`
5. Ajouter :
   - Test : `<dsfr-data-query>` sans `source` emet un warning et n'initialise pas
   - Test : les anciennes proprietes (`apiType`, `baseUrl`...) n'existent plus sur l'element
6. Verifier que `filter` (alias de `where`) fonctionne toujours via `this.source`

**Critere de validation** : `npm run test:run` passe, couverture de dsfr-data-query >= 90%.

### T3 — Mettre a jour les specifications

**Fichier** : `specs/components/dsfr-data-query.html`

1. Remplacer l'exemple en en-tete par un pattern `<dsfr-data-source> + <dsfr-data-query source="...">`
2. Supprimer la table des modes (ou la simplifier : dsfr-data-query = pur transformateur)
3. Retirer les attributs adapter de la table des attributs (`api-type`, `base-url`, `dataset-id`, `resource`, `select`, `headers`)
4. Remplacer tous les exemples deprecated par le nouveau pattern :
   - ODS serveur : `<dsfr-data-source api-type="opendatasoft" ...>` + `<dsfr-data-query source="...">`
   - Tabular : idem avec `api-type="tabular"`
   - Dataset prive : `headers` sur `<dsfr-data-source>`
   - Rafraichissement : `refresh` sur `<dsfr-data-source>`

**Critere de validation** : aucun `<dsfr-data-query` avec `api-type=` dans le fichier.

### T4 — Mettre a jour les skills et la documentation

**Fichiers** : `apps/builder-ia/src/skills.ts`, `CLAUDE.md`, `guide/guide-exemples-facets.html`

1. `skills.ts` : supprimer les mentions du mode deprecated (lignes 344-347)
2. `CLAUDE.md` : supprimer la section "Retrocompatibilite" qui mentionne le shadow source
3. `guide/guide-exemples-facets.html` : mettre a jour la reference au pattern deprecated

**Critere de validation** : `npm run test:run` passe (les tests d'alignement skills verifient la coherence).

### T5 — Verification finale

1. `npm run build` : build sans erreur
2. `npm run test:run` : tous les tests passent
3. `grep -r 'shadowSource\|_shadowSource\|__gq_' src/ tests/` : aucun resultat
4. `grep -r 'api-type' specs/components/dsfr-data-query.html` : aucun resultat
5. Verifier manuellement dans le navigateur :
   - ODS chart dynamique fonctionne (builder)
   - Tabular datalist fonctionne (builder)
   - Map ODS fonctionne (builder-IA)
   - Facettes fonctionnent

---

## Risques

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Code externe utilisant `<dsfr-data-query api-type="...">` | L'ancien pattern ne marchera plus | App pas en prod, aucun utilisateur externe connu |
| Tests E2E (Playwright) utilisant l'ancien pattern | Echec des tests | Verifier `tests/builder-e2e/` apres les changements |
| Skill dsfrDataQuery dans builder-IA pas a jour | L'IA pourrait generer l'ancien pattern | T4 met a jour les skills, les tests d'alignement le verifient |

## Estimation

- **T1** : ~1h (suppression et simplification de code)
- **T2** : ~30min (suppression de tests, ajout de 2 nouveaux)
- **T3** : ~30min (remplacement d'exemples HTML)
- **T4** : ~15min (3 fichiers, changements mineurs)
- **T5** : ~15min (verification)

**Total** : ~2h30
