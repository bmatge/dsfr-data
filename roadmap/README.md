# roadmap/ — archives de planification

Le **backlog vivant est sur GitHub** (issues et epics du repo, cf. ADR-051 du vault) : ce
dossier ne contient plus que des documents **clos**, conservés pour l'historique des décisions.

## `done/` — epics, feature requests et bugs traités

| Fichier | Description | Clôture |
|---|---|---|
| `EPIC_PROVIDER_CONFIG.md` | Centraliser la configuration des providers API (ProviderConfig) | fait |
| `EPIC_SEPARATION_OF_CONCERNS.md` | Clarifier les responsabilités dsfr-data-source vs dsfr-data-query | fait |
| `EPIC_GRIST_API_FULL.md` | Exploiter pleinement l'API Grist (SQL, group-by, agrégation) | fait |
| `EPIC-decommission-shadow-source.md` | Supprimer la rétrocompatibilité shadow source dans dsfr-data-query | fait |
| `ISSUE-rename-gouv-to-dsfr-data.md` | Renommer gouv-* en dsfr-data-* (alignement DSFR) | fait |
| `ISSUE-dsfr-data-join.md` | Composant dsfr-data-join (jointure de sources) | fait |
| `BUG-REPORT-spec-pages.md` | Exemples cassés dans les specs/guide après décommission shadow source | fait |
| `SOURCE_API_MANAGEMENT_AUDIT.md` | Audit de la gestion des APIs dispersée dans le code | traité |
| `AUDIT-STORAGE.md` | Audit du système de stockage (localStorage + SQLite) | traité |

## Audits conservés à la racine du dossier

| Fichier | Description |
|---|---|
| `AUDIT-CODE-QUALITY.md` | Audit qualité code complet du 2026-04-04 (composants, apps, server, MCP, CI/CD) |
| [`DATASHEET.md`](../docs/DATASHEET.md) | Fiche produit : positionnement, comparatif, composants |

Les audits UX (2026-05, 2026-09) vivent dans `docs/ux/` et dans le vault Obsidian (`30-Knowledge/UX-Audits/`).
