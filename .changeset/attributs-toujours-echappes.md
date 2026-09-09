---
'dsfr-data': patch
---

Un filtre `where` à valeur textuelle produisait une requête tronquée, en silence.

`filterToOdsql` entoure de guillemets **doubles** toute valeur non numérique — et
les valeurs numériques aussi, pour `eq`, `neq`, `contains` et `in`. L'attribut étant
lui-même à guillemets doubles, il n'était pas échappé :

```html
where="region = "Bretagne""
```

Le composant recevait `region = `. Requête invalide, aucun message. La forme
concernée est celle que la documentation de l'assistant enseigne
(« status:eq:active », « code_departement:eq:48 »).

Le correctif est plus large que le symptôme : **toute** valeur d'attribut du
générateur de l'Assistant IA et des widgets Grist est désormais échappée, comme le
faisait déjà le générateur de la Carto sur chacun des siens. Cela corrige au passage
une classe de défaut latente sur les URLs : les entités nommées historiques sont
tolérées sans `;` dans une valeur d'attribut, si bien qu'une source
`…?a=1&copy&b=2` était appelée avec un `©` à la place de `&copy`. (HTML5 exempte le
cas où un `=` suit immédiatement, ce qui rend `&copy=2` inoffensif — la nuance
importe pour tester la bonne forme.)

`escapeHtml` accepte maintenant les nombres et les booléens : les gabarits posent des
`pagination`, `max-items`, `zoom`, et forcer l'appelant à convertir d'abord, c'est
l'inviter à oublier d'échapper. Son test de vacuité porte désormais sur `null`,
`undefined` et la chaîne vide, plus sur la fausseté — `escapeHtml(0)` rendait `""`.
