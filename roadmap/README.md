# roadmap/

Plans d'evolution, audits techniques et feature requests du projet dsfr-data.

## Epics (plans de refactoring)

| Fichier | Description | Statut |
|---------|-------------|--------|
| `EPIC_PROVIDER_CONFIG.md` | Centraliser la configuration des providers API (ProviderConfig) | En cours |
| `EPIC_SEPARATION_OF_CONCERNS.md` | Clarifier les responsabilites dsfr-data-source vs dsfr-data-query | En cours |
| `EPIC_GRIST_API_FULL.md` | Exploiter pleinement l'API Grist (SQL, group-by, aggregation) | En cours |
| `EPIC-decommission-shadow-source.md` | Supprimer la retrocompatibilite shadow source dans dsfr-data-query | En cours |

## Feature requests

| Fichier | Description | Statut |
|---------|-------------|--------|
| `ISSUE-rename-gouv-to-dsfr-data.md` | Renommer gouv-* en dsfr-data-* (alignement DSFR) | Fait |
| `ISSUE-dsfr-data-join.md` | Nouveau composant dsfr-data-join (jointure de sources) | A faire |

## Audits techniques

| Fichier | Description |
|---------|-------------|
| `SOURCE_API_MANAGEMENT_AUDIT.md` | Audit de la gestion des APIs dispersee dans le code |
| `AUDIT-STORAGE.md` | Audit du systeme de stockage (localStorage + SQLite) |
| [`DATASHEET.md`](../DATASHEET.md) | Fiche produit : positionnement, comparatif, composants (racine du repo) |

## Bug reports

| Fichier | Description |
|---------|-------------|
| `BUG-REPORT-spec-pages.md` | Exemples casses dans les specs/guide apres decommission shadow source |
