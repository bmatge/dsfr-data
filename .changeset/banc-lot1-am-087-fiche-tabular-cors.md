---
'dsfr-data': patch
---

Fiche `apiProviders` : Tabular n'exige pas de proxy CORS — résout le constat AM-087 du banc d'essai (#1232).

La fiche rangeait Tabular parmi les API qui « ne supportent pas le CORS navigateur ». C'est inexact : `tabular-api.data.gouv.fr` répond `access-control-allow-origin: *` à la requête (200) comme à la préflight `OPTIONS` (204), vérifié le 2026-10-03. Une IA ou un intégrateur en concluait qu'il fallait déployer un proxy pour lire data.gouv.fr depuis une page statique.

Tabular est retiré de la phrase sur les API sans CORS et ajouté à la liste « APIs avec CORS natif », aux côtés d'Opendatasoft et d'INSEE Melodi. L'endpoint `/tabular-proxy` reste mentionné pour ce qu'il sert — un cache ou un quota tenus par l'opérateur du proxy —, pas comme une nécessité. Aucun exemple Tabular de la fiche ne porte `proxy-url`.
