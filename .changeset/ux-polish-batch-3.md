---
'dsfr-data': patch
---

fix(ux): polish batch 3 — m-B-6 + T-5 + T-6 (salve 2 de l'audit UX 2026-05-26).

3 quick wins indépendants centrés sur le Builder, prolongeant les patches polish déjà livrés (#217 batch 2). Pas d'issues GitHub dédiées (salve 2 reportée sans décomposition dans le plan `~/.claude/plans/je-veux-que-tu-vectorized-raven.md`).

**§m-B-6 — Warning carte départementale quand la source ne contient pas de codes INSEE**

Quand l'utilisateur choisit le type « Carte départementale » sur une source qui contient des noms (« Île-de-France »…) mais pas de codes département, le select Code département reste vide silencieusement et la carte ne s'affiche pas. Nouvelle détection : `findDeptCodeField()` parcourt les 50 premières lignes des champs string/number et valide via `isValidDeptCode()` (existant dans `@dsfr-data/shared`) ; si au moins 80% des valeurs non-vides d'une colonne sont des codes valides, on la considère candidate. Sinon, affichage d'un encadré jaune « Aucun code département détecté — Convertissez vos noms en codes ou choisissez un autre type de graphique ». Re-évalué quand : (1) le type de graphique change vers/depuis « map », (2) une source est chargée et `populateFieldSelects()` est appelée.

**§T-5 — Aperçus visuels des palettes de couleurs**

Sous le select `#chart-palette`, nouveau strip de swatches qui affiche les 5 couleurs de la palette sélectionnée. Mis à jour à l'ouverture du Builder + à chaque changement de palette + à l'auto-swap vers `sequentialAscending` quand le type passe en `map`. Utilise `PALETTE_COLORS` déjà exporté depuis `@dsfr-data/shared`. CSS minimal (~10 lignes : flex row de spans avec background-color).

**§T-6 — Valeurs par défaut intelligentes : pré-sélection auto du seul candidat**

`populateFieldSelects()` faisait déjà la pré-sélection par mot-clé (« nom » / « region » / « departement » / « label » pour les étiquettes ; « prix » / « score » / « valeur » / « value » pour les valeurs numériques). Nouveau fallback : si aucun mot-clé ne matche, mais qu'il n'y a **qu'un seul candidat** du bon type (string pour étiquettes, number pour valeurs), on le pré-sélectionne quand même. Économise un clic sur les datasets simples sans ambiguïté (ex : `{region, population}` → les 2 champs auto-remplis même si « population » ne contient pas de mot-clé). Test ajouté : `tests/apps/builder/sources-fields.test.ts:auto-selection T-6`. Test existant adapté pour refléter le nouveau contrat (« no auto-select » nécessite désormais 2+ candidats non-matchants).

**Nouveaux exports dans `apps/builder/src/ui/ui-helpers.ts`** : `renderPaletteSwatches(paletteKey?)`, `findDeptCodeField()`, `updateMapCodeFieldWarning()`.
