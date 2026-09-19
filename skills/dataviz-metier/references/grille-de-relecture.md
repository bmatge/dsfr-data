# Grille de relecture — douze vérifications avant de livrer

> À dérouler sur chaque bloc (graphique, carte, KPI) une fois la page rendue au navigateur. Chaque ligne : la question, comment on la vérifie, le geste qui la règle.
>
> Déclencheurs : relecture, relire une page, checklist, avant de livrer, revue éditoriale, critique de dataviz, vérifier un graphique, recette

Compter n'est pas regarder : les huit défauts de la revue du Baromètre (graphique de 236 lignes,
libellés rognés, bouton « Filtrer sur 201 » sous chaque élément) passaient tous les compteurs.
Cette grille se déroule **page ouverte**, thème clair et sombre, avec la console visible.

| # | Question | Comment vérifier | Geste si non |
|---|---|---|---|
| 1 | Le titre dit-il le **message**, et le libellé de série la **mesure** ? | lire le titre sans le graphique : sait-on ce qu'on va voir ? | `databox-title`, `value-field="champ:Libellé"`, `heading-level` |
| 2 | La **forme** répond-elle à la question du lecteur (part / niveau / évolution / écart / classement) ? | grille de [forme](forme.md) ; plus de 15 barres ou 6 courbes → découper | un graphique par question (motif display), tableau, podium |
| 3 | Y a-t-il une **moyenne de taux** ou de pourcentages quelque part ? | chercher `:avg` sur un champ qui est déjà un taux ; lire le résumé « en France » d'une carte | ratio de sommes `a:sum{…} / b:sum`, `map-summary-weight` |
| 4 | Un **arrondi** précède-t-il un calcul ? | `round` dans un `normalize` en amont d'un KPI, d'un résumé pondéré, d'un `compute` | déplacer l'arrondi en aval (`decimals`) |
| 5 | L'**axe** commence-t-il à zéro quand le lecteur le suppose ? Deux échelles Y ? | regarder l'axe ; chercher `bar-line` | `y-min="0"` ; deux graphiques ou base 100 |
| 6 | Le **sens** de la variation est-il le bon ? Une couleur automatique juge-t-elle ? | chercher `color:"auto"`, `threshold-*`, `trend` ; le jeu porte-t-il un champ de sens ? | couleur explicite, seuils retirés, `compute` du ton |
| 7 | La **légende** dit-elle ce que le graphique montre ? | comparer chaque pastille à sa barre ; nom de série exact dans `color-map` | corriger la modalité (accents compris) |
| 8 | Le **total** affiché se recoupe-t-il à l'API et entre blocs voisins ? | `total_count` (`limit=0`) ; KPI vs carte vs tableau ; avertissements console `max-records`, `meta.total` | `max-records`, `meta:total`, `max-items`, une source par indicateur |
| 9 | Le **groupe null** est-il nommé ou écarté — et l'a-t-on dit ? | chercher une barre sans libellé, une part « Série N », une première ligne vide du tableau | `empty-label` ou `where isnotnull` + une phrase |
| 10 | Le **tableau équivalent** se lit-il seul ? Colonnes nommées, ordre, format, une colonne par série, années en texte | ouvrir l'accordéon « Accessibilité » ; avec `databox`, ouvrir la vue tableau | alias dans la donnée, `order-by`, `decimals`, `dsfr-data-pivot` |
| 11 | La **phrase de lecture** existe-t-elle, et dit-elle ce qui manque ? | `description` présente et non tautologique ; source et date lues dans la donnée | `description`, `databox-source`, `databox-date-field`, `context-value` |
| 12 | Les **hypothèses éditoriales** sont-elles écrites pour être contestées ? | une section de notes en fin de page : ce qui a été choisi, écarté, pourquoi | copier le motif « Notes — les hypothèses éditoriales » |

## Trois pièges de relecture qui ont coûté cher au banc

- **Conclure depuis une observation unique.** « `color-map` exige `databox` » a été affirmé
  depuis une paire d'états, puis infirmé par une reproduction isolée en trois configurations.
  Avant d'écrire une règle : isoler la variable (avec / sans `databox`, clair / sombre, depuis un
  gabarit / hors gabarit).
- **Croire un écart de recette sur un rendu différé.** Cartes et graphiques se rendent à la
  visibilité : une mesure prise trop tôt voit du vide. Recharger, faire défiler jusqu'à
  l'élément, attendre la stabilisation du DOM, puis conclure.
- **Imputer à la bibliothèque le coût d'avoir voulu reproduire à l'identique.** Onze
  « manques » sur 54 visaient une capacité qui existait ; trois imputations à DSFR Chart
  étaient chez `dsfr-data`, et une à `dsfr-data` était chez DSFR Chart. Quatre verdicts avant
  d'écrire « impossible » : natif / natif mais postérieur à la version chargée / sur `main` non
  publié / absent du source (ADR-109 du banc).
