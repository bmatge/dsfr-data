---
'dsfr-data': minor
---

Nouvel attribut `max-records` sur `dsfr-data-source` en mode adapter (#233) : le plafond fetchAll de l'adapter OpenDataSoft (1 000 records) était codé en dur — ce n'est **pas** une limite de l'API. Il est désormais configurable (`max-records="5000"`), avec le défaut conservé à 1 000 en garde-fou anti-surcharge ; à relever explicitement pour les dashboards « un seul fetch server-side, puis N agrégations côté client » (attention au nombre de requêtes en boucle et au poids mémoire — documenté dans la spec). Au passage, le warn « pagination incomplete » se déclenche enfin quand le plafond tronque un fetch-all (l'ancienne condition ne couvrait que les short-reads sous un `limit` explicite).
