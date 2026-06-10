---
'dsfr-data': patch
---

`dsfr-data-facets` factorisé (#313) : le bloc « valeur + compteur » (copié 3× entre checkbox, multiselect et radio) et la barre de recherche des panels (copiée 2×) deviennent des templates partagés — comportement identique, gardé par tests. Les valeurs orphelines (#310) affichent « (indisponible) ». Nettoyages : le debounce de recherche est annulé au disconnect, le `closest('dsfr-data-facets') ?? this` mort supprimé, `baseWhere` calculé une fois (il était recalculé à chaque itération de la boucle des champs), et en `server-facets` sans capability adapter le fallback client n'émet plus **deux** jeux de données différents (brut puis filtré) — un seul dispatch, filtré.
