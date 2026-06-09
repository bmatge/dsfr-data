---
'dsfr-data': patch
---

Cycle de vie de la délégation server-side de `dsfr-data-query` réparé (#276) : changer un attribut purement client (`limit`, `filter`…) sur une query déléguée ne gèle plus les données — la re-négociation identique est dédupliquée côté query et relit le cache (valide) au lieu d'attendre une émission qui ne venait jamais. Retirer `group-by` libère désormais l'overlay sur la source (commande `groupBy: ''`) qui re-sert les lignes brutes ; au changement de `source`, les clears partent vers l'ancienne source (plus d'overlay orphelin servant des données agrégées). Filet de sécurité côté `dsfr-data-source` : une commande entièrement dédupliquée ré-émet le cache en asynchrone — contrat « une commande produit toujours une émission ».
