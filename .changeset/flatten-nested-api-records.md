---
'dsfr-data': minor
---

Aplatissement des enregistrements imbriques des connexions API (#586)

- Les jeux de donnees INSEE Melodi importes par une **connexion API** arrivaient non deplies :
  chaque observation gardait ses blocs `attributes` / `dimensions` / `measures`, affiches
  `[object Object]` dans les tables et inexploitables par les builders. Le chemin composant
  (`<dsfr-data-source adapter="insee">`) aplatissait deja correctement ; les deux routes
  partagent desormais la meme fonction et produisent les memes noms de colonnes.
- `ProviderConfig.response` accepte une strategie d'aplatissement (`flattenRecord`, ou
  `nestedDataKey` pour une simple cle d'enveloppe comme `fields` chez Grist). Les champs
  `requiresFlatten` et `nestedDataKey` etaient declares depuis des mois sans aucun
  consommateur : `flattenProviderRecords()` est le consommateur manquant.
- Effet de bord mesure : une observation INSEE aplatie occupe 277 octets contre 337 bruts,
  soit **18 % de stockage local en moins**.
- Depassement de quota `localStorage` : les ecritures de la source selectionnee contournaient
  le helper garde-fou et echouaient sans rien signaler. Elles passent par `saveToStorageQuiet`,
  qui remonte desormais l'evenement `dsfr-data:storage-quota` avec la taille refusee, et le
  message indique le volume en cause au lieu d'un « espace plein » muet.
