---
'dsfr-data': patch
---

`SourceElement` complété et consommé par les facettes (#274) : nouvelle méthode `getAdapterParams()` exposant les paramètres adapter résolus de la source — headers effectifs avec `api-key-ref` inclus — déléguée à travers query, normalize, search, unpivot et join (vers la source gauche). `dsfr-data-facets` consomme cette interface au lieu de re-parser les attributs DOM : les facettes serveur ne répondent plus 401 sur les sources authentifiées par `api-key-ref`, et fonctionnent derrière unpivot/join. `unpivot` et `join` exposent aussi `getAdapter()`/`getEffectiveWhere()`.
