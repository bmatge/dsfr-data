---
'dsfr-data': patch
---

Repères d'interface (#997, ADR-143) : `@dsfr-data/shared` exporte le contrat du registre généré, en types seuls et côté app (`Repere`, `RegistreReperes`, `ReperesConfig`, `Prerequis`, `PrerequisParId`). `npm run build:reperes` extrait les marques `data-repere`, `data-zone`, `data-attribut` et `data-prerequis` du balisage d'une app (HTML statique et gabarits TS) et écrit `apps/<app>/src/assistant/reperes.generated.ts`, enrichi des descriptions d'attributs du custom-elements manifest. `npm run check:reperes`, bloquant en CI, refuse un contrôle sans repère dans une zone de réglage, un attribut absent du manifeste, un prérequis sans règle, un registre périmé et un repère cité par un constat mais absent du registre. Premier échantillon réel : le bloc « Au clic sur un élément » du builder carto. Aucun changement pour la bibliothèque publiée.
