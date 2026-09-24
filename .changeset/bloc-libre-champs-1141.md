---
'dsfr-data': minor
---

Attributs-champs marqués dans le manifeste, et bloc « composant libre » du Studio IA contrôlé sur ses noms de champs (#1141).

- **Marquage `@champ`** : chaque attribut d'un composant qui désigne un champ des données (`label-field`, `value-field`, `group-by`, `sort`, `row`, `fields`…) porte le tag JSDoc `@champ <grammaire>` (`nom`, `liste`, `liste-alias`…). Le manifeste `custom-elements.json` le reporte sur l'attribut (`"champ": "liste"`), le contrat des composants du serveur MCP aussi (`fields`). La table du volet Diagnostic (`FIELD_ATTRS`) en est désormais générée : elle gagne `series-field` et `value-field` (liste) de `dsfr-data-a11y`, `map-summary-field` du graphique, `picto-field`, `image-field`, `icon-field` du podium, `picto-field` du KPI, `group-field` de la couche, `title-field` de la popup, `key-field` du répéteur, `weight-field` des facettes ; et un `value-field` à alias (`champ:Libellé`) n'est plus pris pour un champ inconnu. Test-garde : tout attribut qui ressemble à un champ est marqué ou exclu avec sa raison.
- **Studio IA, bloc libre** : un attribut-champ doit nommer un champ de ce que le composant reçoit — la source chargée, la sortie d'un filtre, ou la sortie d'un pivot / d'une agrégation observée par l'aperçu. Refus explicite au modèle (« `sort="Montant"` : champ absent de la sortie de #croise (champs disponibles : …) ») ; une sortie pas encore calculée n'est jamais une cause de refus, la lecture est signalée « non vérifiée ».
- **Pagination serveur** : une `dsfr-data-list` de bloc libre qui lit directement sa source, paginée et sans recherche, filtres ni export locaux, pagine côté serveur comme la liste guidée (ADR-109) ; derrière un pivot ou une agrégation, c'est impossible par nature, et le Studio le dit au modèle.
