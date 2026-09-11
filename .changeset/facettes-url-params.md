---
'dsfr-data': patch
---

fix(facets) : `url-params` ne lit plus que les facettes effectives, et signale un paramètre partagé avec un contexte

Sans `url-param-map`, une facette autonome acceptait comme paramètre d'URL **toute colonne de ses
données**. Sur une page qui portait aussi un `dsfr-data-context` à `url-sync`, `?annee=2023` était
capté par la facette, même sans facette « année », et posait une sélection fantôme : KPI à 0,
carte vide.

- Seules les facettes **effectives** lisent l'URL : les champs de `fields`, sinon les facettes que
  le composant détecte lui-même. Le cas `fields` vide continue de fonctionner.
- Un paramètre lu à la fois par une facette autonome et par un contexte à `url-sync` est une
  erreur de configuration, qui nomme le paramètre et le contexte, et propose `context="id"` ou
  `url-param-map`.
- La documentation de `url-params` recommande `context="id"` dès qu'un contexte est présent, et
  celle de `context` précise que le mode contexte suppose des champs portés par la source visée :
  une colonne calculée en aval ne peut pas y passer.

Le contexte expose `getUrlParamNames()`, la liste des paramètres qu'il porte.

Résout le constat BUG-013 du banc d'essai (#773).
