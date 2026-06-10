---
'dsfr-data': patch
---

Échappement d'identifiants ODS et garde-fous server-side Tabular (#289) : un group-by/agrégat sur champ à espaces ou ponctuation ("Date - Journée gazière") fonctionne désormais sur les 3 providers — ODS échappe les identifiants en backquotes ODSQL (group_by, champ ET alias du select), Grist échappait déjà, et Tabular consulte enfin `isTabularServerFieldSafe` dans `buildUrl` : champs non délégables → lignes brutes + `needsClientProcessing` + warning explicite, au lieu du « Malformed query » que le garde-fou prétendait éviter (il n'était appliqué que par la délégation query #275, pas par un group-by posé directement sur la source). Aussi : deux filtres Tabular sur le même champ+opérateur sont AND-és (`append` au lieu de `set` qui écrasait, comme Grist/ODS) ; plus d'over-fetch sur la dernière page (`page_size` borné au restant) ; warnings des adapters aux bons préfixes (fini le `dsfr-data-query:` copié-collé dans ODS/Tabular).
