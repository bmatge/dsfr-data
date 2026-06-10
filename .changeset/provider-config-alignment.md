---
'dsfr-data': patch
---

La couche déclarative ProviderConfig est enfin branchée et honnête (#285) : `capabilities` devient le miroir exact de `AdapterCapabilities` du core (ajout `serverGeo`/`whereFormat`, suppression de `serverAggregation` jamais lu), garanti par un test d'alignement — toute déviation config/adapter (comme le mensonge historique de Generic sur `whereFormat`) fait désormais échouer la CI. `operatorMapping` (Tabular) et `searchTemplate` (ODS/Tabular) ne sont plus dupliqués : les adapters consomment la config. Code mort supprimé : `utils/pagination.ts`, `utils/response-parser.ts` (zéro import hors tests, `extractPaginationMeta` était de plus faux sans `totalCountPath`) et le bloc `codeGen` entier de ProviderConfig (jamais lu — les générateurs des apps ont leur propre logique). Un test-garde interdit tout futur module utilitaire non importé. Le design `datagouv-dataset` (aiguillage vers des ressources Tabular, pas de ProviderId dédié) est documenté.
