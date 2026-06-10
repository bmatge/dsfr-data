---
'dsfr-data': patch
---

Storage/sync réellement local-first (#321) : un item présent en local mais **absent du serveur** (créé hors-ligne, ou POST abandonné après les retries) n'est plus supprimé par le merge — il est conservé pour **toutes** les collections (favorites/dashboards n'avaient aucun merge : le serveur remplaçait le local). La **boucle de write-back disparaît** : le cache mis à jour par `load()` n'active plus le save-hook (`saveToStorageQuiet`) — chaque ouverture d'app re-téléchargeait puis re-téléversait l'intégralité des 5 collections préfetchées (GET + un PUT par item). Un `409` sur POST est **rejoué en PUT** au lieu d'être défilé comme un succès (la modification était perdue).
