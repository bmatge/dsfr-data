---
'dsfr-data': patch
---

fix(ux): wording naturel du Builder (EPIC #183, batch 1) — couvre les 3 issues Majeur ciblant les libellés du panneau de configuration.

- **#195** — Section « Habillage DataBox » → **« Cadre officiel DSFR »** (et toggle « Activer la DataBox DSFR » → **« Encadrer le graphique (titre, source, téléchargement) »**). Le nom interne `DataBox` ne fuite plus dans le label. L'aide tooltip explique déjà la chose, label maintenant cohérent.
- **#196** — Libellés de palettes plus parlants pour P1 : `Categorielle` → **« Couleurs distinctes par catégorie »**, `Sequentielle ↑` → **« Dégradé clair → foncé »**, `Divergente ↑` → **« Bicolore (centre clair) »**, etc. **Fix d'un leak** : le résumé de la section Apparence (visible quand collapsée) affichait la clé interne brute (`sequentialAscending`) — désormais passé par le nouveau `PALETTE_DISPLAY_NAMES[key]`. Tooltip d'aide `chart-palette` réécrit pour expliquer chaque famille de palettes en termes d'usage (« comparer des catégories indépendantes », « valeurs ordonnées », « écarts par rapport à une référence »).
- **#197** — Labels d'axes harmonisés sur le ton naturel déjà utilisé ailleurs dans la même section (« Si plusieurs lignes par catégorie, agréger par » est exemplaire) : `Axe X / Categories` → **« Étiquettes (axe horizontal) »**, `Axe Y / Valeurs (Serie 1)` → **« Valeur à mesurer (Série 1) »**. Messages de validation `getCompleteness()` alignés (« le champ Étiquettes », « le champ Valeur à mesurer ») pour qu'un user qui voit « Il manque : le champ X » retrouve le même libellé à l'écran.

**Nouveau export public dans `@dsfr-data/shared`** : `PALETTE_DISPLAY_NAMES: Record<string, string>` — mapping clé interne → libellé utilisateur (cf. `packages/shared/src/constants/dsfr-palettes.ts`). À utiliser partout où le nom de palette apparaît dans l'UI rendue.
