# Bug Report : Exemples casses sur les pages specs et guides

**Date** : 2026-02-18
**Severite** : Haute - Multiples exemples live non fonctionnels sur les pages de documentation

---

## Resume

Suite au commit `988e875` ("feat: decommission shadow source from dsfr-data-query"), de nombreux exemples live dans les pages de specifications et du guide utilisateur ne fonctionnent plus. La cause principale est l'utilisation de l'ancien pattern `<dsfr-data-query api-type="..." resource="...">` qui a ete supprime lors de la decommission de la "shadow source" de `dsfr-data-query`.

Un second probleme potentiel concerne `dsfr-data-world-map` avec des donnees inline (`data` attribute) qui pourrait etre lie a un probleme de timing dans le cycle de vie Lit.

---

## Cause racine principale : Pattern `<dsfr-data-query api-type>` deprecie

### Contexte

Le commit `988e875` a supprime de `dsfr-data-query` les attributs suivants :
- `api-type`
- `base-url`
- `dataset-id`
- `resource`
- `select`
- `headers`

Ainsi que le mecanisme interne de "shadow source" qui permettait a `dsfr-data-query` de creer implicitement un `<dsfr-data-source>` cache pour effectuer des requetes HTTP.

**Avant** (ancien pattern, maintenant casse) :
```html
<dsfr-data-query id="data"
  api-type="tabular"
  resource="2876a346-...">
</dsfr-data-query>
```

**Apres** (pattern correct) :
```html
<dsfr-data-source id="data"
  api-type="tabular"
  resource="2876a346-...">
</dsfr-data-source>
```

Le commit `91657db` a corrige les references textuelles (commentaires, docs, prompts IA) mais n'a pas corrige les exemples HTML live dans les pages specs et guides.

---

## Inventaire complet des fichiers impactes

### A. Pages de specification (specs/) - Elements HTML live casses

#### 1. `specs/components/dsfr-data-normalize.html` (lignes 24-28)

**Symptome** : Exemple "conversion numerique + renommage" - les donnees brutes et normalisees ne s'affichent pas.

**Code casse** :
```html
<dsfr-data-query
  id="demo-raw"
  api-type="tabular"
  resource="2876a346-d50c-4911-934e-19ee07b0e503">
</dsfr-data-query>
```

**Correctif** : Remplacer `dsfr-data-query` par `dsfr-data-source` (meme attributs).

**Impact en cascade** : `dsfr-data-normalize id="demo-clean"` et les deux `dsfr-data-list` en aval ne recoivent jamais de donnees.

---

#### 2. `specs/components/dsfr-data-facets.html` (lignes 28-31)

**Symptome** : Exemples 1, 4, 5, 6 - les donnees ne s'affichent pas. (Exemples 2 et 3 fonctionnent car ils utilisent `dsfr-data-source` avec `url=`.)

**Code casse** :
```html
<dsfr-data-query id="elus-raw"
  api-type="tabular"
  resource="2876a346-d50c-4911-934e-19ee07b0e503">
</dsfr-data-query>
```

**Correctif** : Remplacer `dsfr-data-query` par `dsfr-data-source`.

**Impact en cascade** : `dsfr-data-normalize id="elus-clean"` ne recoit rien, donc tous les `dsfr-data-facets` qui s'y branchent (`elus-filtered`, `elus-display-demo`, `elus-hide-counts-demo`, `elus-cols-demo`) restent vides, ainsi que les `dsfr-data-list` en aval.

**Egalement** : Le code block de l'exemple 1 (lignes 159-161) montre aussi l'ancien pattern `<dsfr-data-query>` au lieu de `<dsfr-data-source>` - a mettre a jour pour la coherence documentaire.

---

#### 3. `specs/components/dsfr-data-search.html` (lignes 28-31)

**Symptome** : Exemples 1 et 2 - les donnees ne s'affichent pas.

**Code casse** :
```html
<dsfr-data-query id="elus-raw"
  api-type="tabular"
  resource="2876a346-d50c-4911-934e-19ee07b0e503">
</dsfr-data-query>
```

**Correctif** : Remplacer `dsfr-data-query` par `dsfr-data-source`.

**Impact en cascade** : `dsfr-data-normalize id="elus-clean"` ne recoit rien, donc `dsfr-data-search`, `dsfr-data-facets`, `dsfr-data-list`, `dsfr-data-display` en aval restent vides. L'exemple 3 (Industrie du futur) fonctionne car il utilise deja `dsfr-data-source url="..."`.

---

#### 4. `specs/components/dsfr-data-world-map.html` (lignes 120-145)

**Symptome** : Exemple "Carte simple avec donnees embarquees" - la carte ne s'affiche pas.

**Code** :
```html
<dsfr-data-source id="demo-pib" data='[{"code":"US","pib":25462}, ...]'></dsfr-data-source>
<dsfr-data-world-map source="demo-pib" code-field="code" value-field="pib" ...></dsfr-data-world-map>
```

**Cause possible** : Race condition potentielle dans le cycle de vie Lit. `dsfr-data-world-map` s'abonne dans `connectedCallback()` et verifie le cache, mais `dsfr-data-source` ne dispatche les donnees inline que dans `updated()` (microtask). En principe, l'event listener devrait capter l'evenement, mais il est possible qu'un probleme specifique a `dsfr-data-world-map` (rendu SVG asynchrone, chargement lazy de d3-geo/topojson) interfere.

**Investigation necessaire** : Verifier dans la console du navigateur si `dsfr-data-world-map` recoit bien les donnees ou s'il y a une erreur JavaScript. Le probleme pourrait etre un bug propre au composant worldmap (non lie au decommissionnement de la shadow source).

---

### B. Pages du guide (guide/) - Code blocks injectes comme HTML live

Les pages du guide utilisent un mecanisme de lazy-loading : un `IntersectionObserver` extrait le contenu des blocs `<pre class="example-code">` et l'injecte comme HTML live via `container.innerHTML`. Par consequent, les code blocks contenant l'ancien pattern deviennent des elements HTML fonctionnels casses.

#### 5. `guide/guide-exemples-source.html` (lignes 294-296)

**Exemple impacte** : "Tableau — Maires de France" (dernier exemple de la section dsfr-data-source directe)

**Code casse dans le bloc** :
```html
<dsfr-data-query id="data"
  api-type="tabular"
  resource="2876a346-d50c-4911-934e-19ee07b0e503"></dsfr-data-query>
```

**Correctif** : Remplacer `dsfr-data-query` par `dsfr-data-source` dans le code block.

---

#### 6. `guide/guide-exemples-normalize.html` (lignes 169-171)

**Exemple impacte** : "Tableau — Renommage de champs accentes"

**Code casse dans le bloc** :
```html
<dsfr-data-query id="data"
  api-type="tabular"
  resource="2876a346-d50c-4911-934e-19ee07b0e503"></dsfr-data-query>
```

**Correctif** : Remplacer `dsfr-data-query` par `dsfr-data-source` dans le code block.

---

#### 7. `guide/guide-exemples-search.html` (lignes 179-181)

**Exemple impacte** : "Recherche + facettes + cartes"

**Code casse dans le bloc** :
```html
<dsfr-data-query id="raw"
  api-type="tabular"
  resource="2876a346-d50c-4911-934e-19ee07b0e503"></dsfr-data-query>
```

**Correctif** : Remplacer `dsfr-data-query` par `dsfr-data-source` dans le code block.

---

### C. Pages non impactees (verification effectuee)

Les fichiers suivants ont ete verifies et utilisent correctement `dsfr-data-source` :

- `guide/guide-exemples-query.html` - Tous les exemples utilisent `<dsfr-data-source>` correctement
- `guide/guide-exemples-facets.html` - Tous les exemples utilisent `<dsfr-data-source>` correctement
- `guide/guide-exemples-avances.html` - Elements live avec `<dsfr-data-source>` correct
- `guide/guide-exemples-display.html` - OK
- `guide/guide-exemples-raw-data.html` - OK
- `guide/guide-exemples-maires.html` - OK
- `guide/guide-exemples-ghibli.html` - OK
- `guide/guide-exemples-insee-erfs.html` - OK
- `specs/components/dsfr-data-source.html` - OK
- `specs/components/dsfr-data-query.html` - OK
- `specs/components/dsfr-data-chart.html` - OK
- `specs/apis/*.html` - OK (pas d'exemples live avec l'ancien pattern)
- `specs/charts/*.html` - OK

---

## Synthese des correctifs

### Correctifs rapides (remplacement `dsfr-data-query` -> `dsfr-data-source`)

| # | Fichier | Lignes | Type | Correction |
|---|---------|--------|------|------------|
| 1 | `specs/components/dsfr-data-normalize.html` | 24-28 | HTML live | `<dsfr-data-query>` -> `<dsfr-data-source>` |
| 2 | `specs/components/dsfr-data-facets.html` | 28-31 | HTML live | `<dsfr-data-query>` -> `<dsfr-data-source>` |
| 3 | `specs/components/dsfr-data-facets.html` | 159-162 | Code block | `<dsfr-data-query>` -> `<dsfr-data-source>` (doc) |
| 4 | `specs/components/dsfr-data-search.html` | 28-31 | HTML live | `<dsfr-data-query>` -> `<dsfr-data-source>` |
| 5 | `guide/guide-exemples-source.html` | 294-296 | Code block (live) | `<dsfr-data-query>` -> `<dsfr-data-source>` |
| 6 | `guide/guide-exemples-normalize.html` | 169-171 | Code block (live) | `<dsfr-data-query>` -> `<dsfr-data-source>` |
| 7 | `guide/guide-exemples-search.html` | 179-181 | Code block (live) | `<dsfr-data-query>` -> `<dsfr-data-source>` |

### Investigation supplementaire requise

| # | Fichier | Probleme |
|---|---------|----------|
| 8 | `specs/components/dsfr-data-world-map.html` | Carte avec `data` inline ne s'affiche pas - verifier timing Lit ou bug propre au composant |

---

## Impact utilisateur

- **7 exemples live casses** sur les pages de specification (dsfr-data-normalize, dsfr-data-facets x5, dsfr-data-search x2)
- **3 exemples live casses** dans le guide (dsfr-data-source datalist, dsfr-data-normalize datalist, dsfr-data-search facets)
- **1 exemple a investiguer** (dsfr-data-world-map)
- Les exemples non impactes fonctionnent correctement (dsfr-data-query guide, facets guide, avances, display, raw-data, maires, ghibli, INSEE)

---

## Proposition de resolution

1. **Correction immediate** : Remplacer `<dsfr-data-query>` par `<dsfr-data-source>` dans les 7 occurrences identifiees (3 elements HTML live + 1 code block doc + 3 code blocks live)
2. **Investigation worldmap** : Tester l'exemple worldmap en local pour identifier la cause exacte
3. **Prevention** : Ajouter un test de regression (grep dans les fichiers HTML) pour detecter toute utilisation de `<dsfr-data-query api-type=` (hors blocs de texte informatif) avant chaque release
