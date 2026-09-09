---
'dsfr-data': minor
---

Diagnostic hors des apps : bundle autonome et outil MCP (#608).

- `dsfr-data.debug.js` (15 Ko) — une balise `<script>` ou un marque-page
  suffit a diagnostiquer n'importe quelle page utilisant dsfr-data, y compris
  en production, sans rebuild. Entree de build SEPAREE, jamais fusionnee aux
  bundles publies : un test-garde grepe les six bundles et verifie qu'aucun
  composant du coeur n'importe le collecteur.
- Outil MCP `diagnose_widget_code` — analyse statique du balisage sans
  execution : attribut inconnu ou deprecie, balise inexistante, id manquant
  sur un composant qui reemet, amont declare mais absent, id duplique.
  L'autorite est `custom-elements.json`, genere depuis le code.

Les bundles publies sont inchanges (memes tailles).
