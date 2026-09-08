---
'dsfr-data': patch
---

Une source déjà paramétrée ne perd plus son agrégation.

Les générateurs ajoutaient la chaîne de requête en concaténant `?` sans regarder si
l'URL en avait déjà une. Sur une source OpenDataSoft paramétrée — et elles le sont
couramment — cela produisait une seconde interrogation :

```
…/records?refine=annee:2024?select=sum(pop) as value&group_by=region
```

Le serveur lisait alors `refine` comme valant `annee:2024?select=…` et ignorait
purement et simplement le `select` et le `group_by`. L'utilisateur recevait des
données **brutes non agrégées**, dans un graphique qui s'affichait normalement.

C'est le seul défaut de cette série à produire un résultat faux plutôt qu'un rendu
vide ou un script mort — donc le seul qu'un coup d'œil ne rattrape pas. Quatre sites,
deux Builders. Un helper `appendQuery` remplace la concaténation ; il préserve le
fragment (`#…`) en queue.
