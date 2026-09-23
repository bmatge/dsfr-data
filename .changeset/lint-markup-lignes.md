---
'dsfr-data': minor
---

Analyse statique du balisage (`lintMarkup`, outil MCP `lint_markup`) : chaque constat porte désormais la ligne et la colonne de la balise concernée (`ligne`, `colonne`), l'attribut visé quand il y en a un (`attribut`), et un code de règle stable pour toutes les règles génériques (`balisage/attribut-inconnu`, `balisage/amont-absent`, `balisage/id-manquant`…). Le texte rendu au serveur MCP cite la ligne de chaque constat. Le Playground s'en sert pour surligner le code en cause (#1009).
