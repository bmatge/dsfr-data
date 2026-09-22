---
'dsfr-data': patch
---

Diagnostic : moteur de constats (#996). Une seule sortie pour tout ce que le volet Diagnostic,
l'assistant contextuel et le studio signalent : `evaluerConstats(trace, contexte)` rend des
`Constat` (`id`, `regle`, `gravite`, `titre`, `explication`, `action`, `reperes`, `preuve`,
`etape`) à partir d'un registre de règles pures, composable par app
(`[...REGLES_GENERIQUES, ...REGLES_CARTO]`). Premier lot générique : étape en échec, zéro ligne,
afficheur inerte, données tronquées (en nommant `limit` ou `max-records`), jointure faible, champ
introuvable, attribut inconnu, amont manquant, configuration invalide, lignes ignorées, points
empilés, regroupement calculé dans le navigateur ; et, depuis le journal réseau et console, les
réponses HTTP 4xx/5xx rattachées à leur étape, le blocage CORS déduit (proposition de
`getProxiedUrl()`) et les erreurs de console qu'aucune étape ne revendique. Le compte d'alertes du
rail replié (`summarizeTrace`) est désormais calculé depuis ces constats : il compte des constats,
un par étape et par règle, et non plus des occurrences (plusieurs attributs inconnus sur une même
étape font une alerte, un échec expliqué par le journal réseau une seule), et le regroupement
calculé dans le navigateur y passe en simple information. Les bundles publiés
de la bibliothèque ne changent pas.
