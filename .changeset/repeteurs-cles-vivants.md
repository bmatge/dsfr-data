---
'dsfr-data': minor
---

**Nouveau composant de structure `dsfr-data-repeat`** (ADR-135, #887, lot 1) : répéter des instances vivantes — une ligne de données, un pipeline. Pour chaque ligne de `source`, le `<template>` enfant est **cloné en DOM** et ses placeholders résolus nœud par nœud avec le moteur de gabarit partagé (`{{}}`, formats, `{{#if}}`, `{{#unless}}`, `{{#each}}` — aucune syntaxe nouvelle) ; les composants `dsfr-data-*` du gabarit sont rehaussés avec leurs attributs **déjà interpolés**.

Ce que `repeat` promet, et que le motif « composants dans un gabarit de `display` » ne promet pas : **l'identité par clé** (`key-field` — une ligne dont la clé subsiste garde ses nœuds et ses instances, attributs mis à jour en place, jamais de déconnexion-recréation sous le même id : 119 graphiques ré-émis en ~110 ms sans un canvas détruit, contre ~4,7 s de recréation avec `display`), **l'imbrication** (un `<template>` intérieur n'est pas parcouru : un `display` ou un `repeat` dans le gabarit rend ses propres placeholders), **les attributs booléens conditionnels** (`data-if-horizontal="champ"` / `data-unless-…`), et un **rendu transparent** : aucun `role`, aucun `aria-live`, aucun compteur, aucune pagination. Attributs : `source`, `key-field`, `per-row` (échelle ADR-112), `empty` ; variables `{{$index}}`, `{{$key}}`, `{{$uid}}`. Règle d'usage : `display` quand la ligne est du contenu, `repeat` quand la ligne est un pipeline.

Rien de silencieux : `source` absent, gabarit absent, `key-field` absent des lignes ou en double, `per-row` invalide, bloc `{{#if}}` coupé entre deux éléments frères → erreur de configuration nommée. `{{{brut}}}` n'a pas de sens dans un rendu par nœuds : rendu échappé, avec avertissement.

`renderTemplate` gagne une option additive `escape: false` (sortie texte) ; le contrat de `display` et `map-popup` est inchangé.
