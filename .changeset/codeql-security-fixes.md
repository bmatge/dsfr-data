---
'dsfr-data': patch
---

Sécurité (CodeQL) : corrige une regex à backtracking polynomial (ReDoS) dans la
détection des permaliens Tabular — le préfixe libre `[^?#]*` est remplacé par un
préfixe de locale optionnel `(?:[a-z]{2}/)?`. Au passage, les permaliens
data.gouv.fr modernes sans locale (`data.gouv.fr/datasets/r/{uuid}`) sont
désormais reconnus.
