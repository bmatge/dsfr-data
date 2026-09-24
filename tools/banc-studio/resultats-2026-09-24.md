# Mesure de base — 2026-09-24 (avant #1111)

Première mesure du banc : `npm run banc:studio -- --repetitions 2`, tous les scénarios, sur
`https://chartsbuilder.miweb.run`, qui sert `main` (lib 0.39.0, `47665f54`), modèle
`openweight-large` imposé par le proxy. C'est la référence pour juger #1111.

## Constats à la relecture des réponses

- **`aides-nationales`** : la carte est juste les deux fois (`groupField:"Ville"`, volet
  latéral, ni filtre ni tableau), mais le total par ville répété sur chaque ligne n'est **jamais**
  signalé (0/2), alors que le prompt le demande.
- **Réponses en JSON brut** : 3 réponses finales sur 16 sont l'argument de `finish` écrit en texte
  (`{"message": "…"}`) au lieu d'un appel d'outil (`aides-nationales` #1, `kpi-total` #1,
  `modification` #2, second message). L'usager voit ce JSON. Aucun critère ne le mesure encore :
  candidat pour « Fin propre ».
- **`tableau-pagine`** : un `add_blocks` émis sans `valueField`, requis par le schéma, dans les
  deux essais. Le bloc final est juste ; l'appel hors schéma a coûté un tour.

## Rapport

Instance `https://chartsbuilder.miweb.run` · modèle `openweight-large` · lib 0.39.0 (`47665f54`) ·
2 répétitions · jeu complet · 2026-09-24T16:42:45Z

### Par scénario

| Scénario | Complet | Blocs attendus | Hors schéma | Bloc non demandé | Avertissements | Impossible d'emblée | Code valide | Fin propre | Tours | Tours moy. | Jetons moy. | Latence moy. | Erreurs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `aides-nationales` | 0 % (0/2) | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | 0 % (0/2) | — | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | 3.0 | 7918 | 3.3 s | 0 |
| `barres-triees` | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | — | — | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | 2.0 | 4899 | 2.1 s | 0 |
| `kpi-total` | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | — | — | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | 3.0 | 7506 | 1.8 s | 0 |
| `tableau-pagine` | 0 % (0/2) | 100 % (2/2) | 0 % (0/2) | 100 % (2/2) | — | — | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | 3.0 | 7445 | 3.1 s | 0 |
| `carte-points` | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | — | — | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | 2.5 | 6389 | 2.1 s | 0 |
| `demande-impossible` | 100 % (2/2) | — | 100 % (2/2) | 100 % (2/2) | — | 100 % (2/2) | — | 100 % (2/2) | 100 % (2/2) | 1.0 | 2602 | 1.3 s | 0 |
| `modification` | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | — | — | 100 % (2/2) | 100 % (2/2) | 100 % (2/2) | 4.0 | 9884 | 2.8 s | 0 |

### Par critère (tous scénarios)

| Critère | Taux |
| --- | --- |
| Blocs attendus (types, options clés) | 100 % (12/12) |
| Aucune option hors schéma | 86 % (12/14) |
| Pas de bloc non demandé | 100 % (14/14) |
| Avertissements attendus | 0 % (0/2) |
| Impossible dit d'emblée | 100 % (2/2) |
| Code généré valide (lint de balisage) | 100 % (12/12) |
| Fin propre (finish ou réponse, sans plafond) | 100 % (14/14) |
| Tours dans le budget | 100 % (14/14) |

### Coût

37 appels au modèle · 93 282 jetons (92 791 en entrée, 491 en sortie) · 33 s de latence
cumulée · 6 min au total, pauses de 10 s comprises. Aucun 429, aucune erreur.
