---
'dsfr-data': minor
---

**`dsfr-data-chart` : `map-summary-field` calcule le résumé d'une carte sur une colonne, pendant que la carte en affiche une autre** ([#929](https://github.com/bmatge/dsfr-data/issues/929), PG-031).

Le constat d'origine disait que le résumé pondéré « porte sur la colonne AFFICHÉE ». **La vérification l'a requalifié** : le composant arrondit bien au centième pour *dessiner* la carte, mais le résumé, lui, repart des **lignes source** — cet arrondi-là ne compte pas. Ce qui fausse le chiffre est en amont : `dsfr-data-normalize round="champ:1"`, le réflexe pour une infobulle lisible, **réécrit la colonne dans la donnée**. Le composant ne voit jamais la valeur brute, et Σ(valeur × effectif) / Σ(effectif) pondère des valeurs arrondies. Mesuré au navigateur sur les 101 départements d'une fédération de `data.sports.gouv.fr` : taux national exact **4,5368**, pondéré sur la valeur brute **4,5368**, pondéré sur `round(x, 1)` **4,5331**. L'écart reste plausible, donc invisible. Les deux attributs sont corrects séparément ; c'est leur composition qui ment.

`map-summary-field` désigne la colonne **de calcul**. La page dérive une colonne d'affichage et laisse la brute intacte :

```html
<dsfr-data-normalize id="n" source="licences"
  compute="lics_pop_aff = round(lics_pop, 1)"></dsfr-data-normalize>
<dsfr-data-chart source="n" type="map" code-field="dep"
  value-field="lics_pop_aff" map-summary-weight="pop"
  map-summary-field="lics_pop"></dsfr-data-chart>
```

Vaut pour les trois calculs (`sum`, `avg`, `weighted`) ; sans effet sous `map-summary-value` ou `map-summary="none"`. Un champ qu'aucune ligne dessinée ne porte en numérique est une **erreur de configuration nommée** : aucun résumé n'est affiché, jamais un repli silencieux sur la colonne affichée — qui serait exactement le chiffre faux que l'attribut existe pour éviter.

**Strictement additif** : sans l'attribut, rien ne change, et aucun chiffre déjà publié ne bouge. Le JSDoc de `map-summary-weight` et de `map-summary` dit désormais sur quoi porte le calcul, arrondis amont compris — un piège de composition qui n'est écrit nulle part se repaie.
