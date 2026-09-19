---
'dsfr-data': patch
---

**Le bouton d'accordéon de `dsfr-data-a11y` ne déborde plus de 16 px sur téléphone (#898).** La classe DSFR `fr-accordion__btn` est écrite pour un `<button>`, dont le `box-sizing` par défaut est `border-box` ; le `<summary>` qui la porte est `content-box`. Il recevait donc `width: 100 %` **et** 16 px de padding de chaque côté : 390 px dans un conteneur de 358, et un `scrollWidth` de 406 px sur un viewport de 390 — **toute** page portant un `dsfr-data-a11y` défilait horizontalement sur téléphone (51 des 66 pages du banc d'essai, mesurées). Le composant pose désormais `box-sizing: border-box` sur son propre `summary`, règle bornée à son accordéon : elle ne touche pas ceux de la page hôte. Le contournement en CSS de page (`dsfr-data-a11y summary { box-sizing: border-box }`), qui visait le DOM interne d'un composant, n'a plus lieu d'être.
