---
'dsfr-data': patch
---

Erreurs de configuration enfin visibles sur `dsfr-data-source` et `dsfr-data-a11y` (#283). Un `api-type` inconnu ne produit plus d'unhandled rejection (le `getAdapter()` du registre retourne `null` au lieu de throw hors try via setTimeout) : la source pose `data-dsfr-config-error` et émet un `dsfr-data-error` — les consommateurs sortent du loading avec un message exploitable. Les erreurs de config de la source (id manquant, validation adapter échouée) passent de `console.warn` muets à `reportConfigError` + `dsfr-data-error`. `dsfr-data-a11y` signale une cible `for` introuvable (avant : silence total) et **l'observe** : un companion posé avant son graphique (rendu par un autre script) s'applique dès que la cible apparaît dans le DOM (MutationObserver léger, coupé au disconnect).
