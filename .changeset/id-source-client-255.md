---
'dsfr-data': patch
---

Mode serveur : les sources Grist atteignent enfin le serveur. La colonne `id` des tables `sources`, `connections`, `favorites` et `dashboards` était un `VARCHAR(36)` taillé pour un UUID, alors que le client choisit ses identifiants (`grist_<doc>_<table>` fait 46 caractères) : l'insertion échouait, la file de synchronisation abandonnait après trois essais, la source restait dans le navigateur seulement, et l'aperçu d'une table à clé non publiée (ADR-165) répondait 403 « Access denied » — la publication était impossible aussi. Migration v9 : ces colonnes, `shares.resource_id` et `data_cache.source_id` passent à 255 caractères. Une création sur un identifiant déjà pris répond 409 au lieu de 500, ce que la file sait rejouer en PUT. Les sources restées locales sont poussées à la prochaine sauvegarde dans Sources.
