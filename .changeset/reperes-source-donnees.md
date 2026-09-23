---
'dsfr-data': patch
---

Repères d'interface : une app peut déclarer une source « données » (`ReperesConfig.donnees`, type `RepereDonnee`) pour les repères posés à l'exécution depuis une définition. Le pipeline s'en sert : chaque contrôle d'étape porte `pipeline.<type>.<attribut>`, calculé depuis `node-configs.ts`, et `check:reperes` le vérifie comme le balisage (#1008).
