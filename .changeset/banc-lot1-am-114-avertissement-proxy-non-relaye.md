---
'dsfr-data': patch
---

`dsfr-data-source` : `proxy-url` (ou `use-proxy`) posé sur un hôte que le proxy ne relaie pas est désormais signalé — le constat AM-114 du banc d'essai est **seulement signalé par un avertissement, pas résolu** (#1232).

La réécriture de `proxy-url` ne connaît qu'une liste fixe d'hôtes (Tabular, Grist gouv et SaaS, Albert, INSEE Melodi). Sur un portail Opendatasoft en mode adaptateur (`api-type="opendatasoft"`), ou sur une URL quelconque sans `use-proxy`, l'attribut était sans effet et la requête partait en direct, sans un mot. La source écrit maintenant un avertissement console, une fois par source, qui nomme l'attribut, l'hôte et les hôtes relayés :

`dsfr-data-source[id]: proxy-url="https://relais.fr" est sans effet — l'hôte "data.economie.gouv.fr" n'est pas relayé par le proxy. …`

Le volet Diagnostic le reprend par son journal console. Le comportement des requêtes ne change pas. Le relais cachable par le site hôte demandé par AM-114 (cible portée par l'URL, applicable à tout hôte) n'est pas livré : il fera d'abord l'objet d'une ADR.
