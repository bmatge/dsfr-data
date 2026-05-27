---
'dsfr-data': patch
---

fix(ux): wording naturel des modales Sources (closes #193 + #194, EPIC #183 complet, audit UX 2026-05-26 §M-S-1 + §M-S-4).

Dernier batch de l'EPIC #183 « wording, jargon & accents ». Couvre les 2 modales de l'app Sources qui restaient les plus chargées en jargon technique.

**#193 — Modale Nouvelle connexion API**

Renommages des 4 labels + hints :
- `URL de l'API` (hint « endpoint JSON ») → **`URL des données`** (hint « Adresse complète d'une page qui renvoie des données au format JSON »)
- `Méthode HTTP` + ajout d'un hint pédagogique (« Choisir GET sauf cas spécifique »)
- `En-têtes (optionnel)` + hint avec JSON brut `Bearer xxx` → **`Authentification (optionnel)`** + hint accessible (« Si l'API demande un jeton ou une clé pour autoriser l'accès, ajoutez-le ici »)
- `Chemin vers les données (optionnel)` (hint « Chemin JSON ») → **`Emplacement des données (optionnel)`** (hint « Si les données ne sont pas à la racine, indiquer où aller les chercher »)

**Remplacement du textarea JSON brut par un éditeur clé/valeur** pour l'authentification : 2 inputs côte-à-côte (nom + valeur) + bouton « + Ajouter un en-tête » + bouton supprimer par ligne. Le textarea `#api-headers` est conservé en hidden pour rester la source de vérité JSON consommée par `saveApiConnection()` — synchronisé automatiquement à chaque modification de l'éditeur. Édition d'une connexion existante : les en-têtes JSON sont parsés et pré-remplis dans l'éditeur via `populateApiHeadersFromJson()`.

Nouveaux exports dans `connection-manager.ts` : `addApiHeaderRow(name?, value?)`, `populateApiHeadersFromJson(jsonStr)`, `clearApiHeadersEditor()`.

**#194 — Modale Joindre deux sources**

Renommages des 5 labels + descriptions :
- `Source gauche (principale)` → **`Source A (principale)`** + hint plus naturel
- `Source droite` → **`Source B (complémentaire)`**
- `Clé de jointure` (hint cryptique « champ_gauche=champ_droite ») → **`Colonne commune aux deux sources`** + hint accessible (« Le champ qui permet de relier les deux sources. Si les noms diffèrent : champ_A=champ_B »)
- Les 4 types de jointure (`Left/Inner/Right/Full` avec parenthèses techniques) → descriptions en langage naturel :
  - Left → « Garder toutes les lignes de A, compléter avec B si possible (recommandé) »
  - Inner → « Garder uniquement les lignes présentes dans A et dans B »
  - Right → « Garder toutes les lignes de B, compléter avec A si possible »
  - Full → « Garder toutes les lignes des deux sources (union) »
- `Préfixe des champs droite (en cas de collision)` → **`Préfixe pour les champs de B en cas de doublon`** + hint avec exemple concret

Les `value` des options du select restent `left`/`inner`/`right`/`full` (aucun changement de logique côté `performJoin` dans `@dsfr-data/shared`).

L'affichage « Champs gauche » / « Champs droite » dans le bloc d'info devient « Champs source A » / « Champs source B » pour rester cohérent.

**EPIC #183 entièrement livré** après cette PR (6/6 sous-issues : #192 accents, #193 API wording, #194 jointures, #195 DataBox, #196 palettes, #197 axes).
