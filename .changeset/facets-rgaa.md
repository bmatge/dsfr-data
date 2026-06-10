---
'dsfr-data': patch
---

`dsfr-data-facets` RGAA (#311) : les ids d'inputs sont générés **par index + uid d'instance** — l'ancienne normalisation `value.replace(/[^a-zA-Z0-9]/g, '_')` faisait collisionner « A-B » et « A B » (même id, le `label for` pointait vers le premier : cliquer le second label cochait le **mauvais filtre**), et deux instances sur les mêmes champs partageaient leurs ids. **Une seule live region** au niveau composant (chaque annonce était répétée par autant de régions que de fieldsets/panels ouverts). Textes harmonisés (« désélectionnée », « Réinitialiser » accentués partout).
