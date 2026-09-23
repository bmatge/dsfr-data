---
'dsfr-data': patch
---

Refactor interne (#1004) : la boucle agentique du Studio passe dans `@dsfr-data/shared` (`runAgentLoop`), pour que les autres assistants s'en servent aussi (ADR-143). La boucle garde l'anti-doublon des lookups, les outils répétables, le plafond de tours et un dernier tour sans outils, où le modèle conclut en texte au lieu d'être coupé. Le Studio ne fait plus que composer ses outils (document, diagnostic, code) et ses budgets (8 tours, 12 en diagnostic). Rien ne change dans la bibliothèque publiée.
