---
'dsfr-data': patch
---

Init unique au montage pour tous les composants du pipeline (#281) : le double-init connectedCallback + premier cycle Lit (double abonnement, double lecture du cache, double émission, double négociation serveur) n'était corrigé que dans `dsfr-data-join` — le fix est généralisé dans `TransformerMixin` et `SourceSubscriberMixin` (le premier `willUpdate` est consommé sans ré-init). Corollaire join corrigé : un `dsfr-data-join` sans attributs signale enfin sa config manquante via `reportConfigError` (l'init n'était jamais appelée → échec 100 % silencieux). Hooks harmonisés (`willUpdate` partout — normalize/unpivot utilisaient `updated`) avec reinit/retraitement déclarés via `transformerReinitProps()`/`transformerReprocessProps()`. Bonus : un transformateur re-attaché au DOM se re-branche (Lit ne re-déclenche pas willUpdate à la reconnexion — un composant déplacé restait mort).
