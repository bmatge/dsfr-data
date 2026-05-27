---
'dsfr-data': patch
---

feat(sources): édition des sources manuelles (closes #186, EPIC #186 complet, audit UX 2026-05-26 §M-S-3).

Avant : une fois une source manuelle créée (via Tableau / Coller JSON / Importer CSV), impossible de l'éditer. Une typo dans une cellule obligeait à supprimer la source et tout recommencer. Le CSS `.edit-source-btn` existait déjà dans `apps/sources/src/styles/sources.css` mais aucun code TypeScript ne le créait.

Après : bouton crayon à gauche du bouton poubelle sur chaque source manuelle (sources API/Grist/jointures ne sont pas éditables ici car dérivées d'un état externe). Au clic, la modale « Nouvelle source manuelle » s'ouvre en mode édition :
- Titre : « Modifier la source » (au lieu de « Nouvelle source manuelle »)
- Bouton : « Enregistrer les modifications » (au lieu de « Sauvegarder »)
- Champ Nom pré-rempli
- Mode Tableau forcé + grille pré-remplie avec les données existantes (la vue tableau est la plus générale, l'utilisateur peut switch vers JSON/CSV s'il veut tout remplacer en collant un nouveau payload)
- À la validation : **mise à jour en place** (même `id`), ce qui préserve les références existantes depuis les favoris, dashboards et l'état builder
- À l'annulation : aucune modification

Nouveaux exports :
- `loadTableData(data)` dans `apps/sources/src/editors/table-editor.ts` — pré-remplit le table editor avec un tableau de records (union des clés pour les colonnes, lignes ordonnées comme à la sauvegarde). Réutilisable pour de futurs flows d'édition.
- `editSource(id)` dans `apps/sources/src/connections/connection-manager.ts` — ouvre la modale en mode édition (no-op si la source n'est pas de type `manual`).

`state.editingSourceId: string | null` ajouté au state pour le suivi du mode édition (pattern identique à `editingConnectionId` déjà en place).

Toasts : `« Source X mise à jour. »` après update, `« Source X ajoutée. »` après création (avant, aucun feedback explicite, cf. T-3 audit UX).
