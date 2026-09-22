# Grille de relecture — cinq, dix ou dix-huit vérifications selon le niveau

> À dérouler sur la page rendue au navigateur, thème clair et sombre, console visible. Cinq points au niveau base (un graphique), dix au niveau intermédiaire (un bloc), dix-huit au niveau avancé (une page) : chaque ligne donne la question, comment on vérifie, et le geste qui la règle. Les points éditoriaux (angle, message par bloc, ordre, contraste, titre-message, conclusion) s'ajoutent aux vérifications d'honnêteté, ils ne les remplacent pas.
>
> Déclencheurs : relecture, relire une page, checklist, avant de livrer, revue éditoriale, critique de dataviz, vérifier un graphique, recette, grille de relecture, relecture par niveau
>
> Niveaux : base (§ cinq), intermédiaire (§ dix), avancé (§ dix-huit)

Compter n'est pas regarder : les huit défauts de la revue du Baromètre (graphique de 236 lignes,
libellés rognés, bouton « Filtrer sur 201 » sous chaque élément) passaient tous les compteurs.

## Base : cinq vérifications pour un graphique

| # | Question | Comment vérifier | Geste si non |
|---|---|---|---|
| B1 | Le **titre** dit-il le message, et le libellé de série la mesure ? | lire le titre sans le graphique | `databox-title`, `value-field="champ:Libellé"`, `heading-level` |
| B2 | La **forme** affirme-t-elle la relation (niveau, évolution, part, écart, classement) ? | table de [niveau-base](niveau-base.md) ; plus de 15 barres ou 6 courbes → découper | barres triées, un graphique par question, tableau, podium |
| B3 | Une **moyenne de taux** quelque part ? | chercher `:avg` sur un champ déjà en taux ; lire le résumé « en France » d'une carte | ratio de sommes, `map-summary="weighted"` |
| B4 | Le **total** se recoupe-t-il à l'API et avec le bloc voisin ? | `total_count` (`limit=0`) ; avertissements console `max-records`, `meta.truncated` | `max-records`, `meta:total`, `max-items` |
| B5 | **Source, date, phrase de lecture** sont-elles là, lues dans la donnée, et la légende dit-elle ce que le graphique montre ? | `databox-source`, `databox-date-field`, `description` non tautologique ; chaque pastille comparée à sa barre | les poser ; corriger la modalité de `color-map` (accents compris) |

## Intermédiaire : dix vérifications pour un bloc

Les cinq de base, puis :

| # | Question | Comment vérifier | Geste si non |
|---|---|---|---|
| I6 | Y a-t-il **un angle**, et chaque graphique a-t-il **un message** qui le sert ? | écrire le message de chaque bloc en une phrase ; un bloc sans message est un catalogue | retirer, ou descendre en exploration ([anti-patterns](anti-patterns.md)) |
| I7 | L'**ordre** des blocs est-il celui de l'argument ? | le test des titres seuls : forment-ils un résumé ? | réordonner ([structure-narrative](structure-narrative.md)) |
| I8 | Une série est-elle **mise en évidence**, le reste grisé ? | compter les couleurs de même poids | `selected-palette="neutral"` + `highlight-index`, `color-map` |
| I9 | L'**axe** commence-t-il où le lecteur le croit ? Deux échelles Y ? | regarder l'axe ; chercher `bar-line` | `y-min="0"` ; deux graphiques ou base 100 |
| I10 | Le **groupe null** est-il nommé ou écarté — et l'a-t-on dit ? Ce qu'on ne montre pas est-il écrit ? | barre sans libellé, part « Série N », première ligne vide du tableau ; phrase de résidu | `empty-label` ou `where isnotnull` + une phrase ([ce-qu-on-ne-montre-pas](ce-qu-on-ne-montre-pas.md)) |

## Avancé : dix-huit vérifications pour une page

Les dix précédentes, puis :

| # | Question | Comment vérifier | Geste si non |
|---|---|---|---|
| A11 | Les **angles écartés** et les **hypothèses** sont-ils écrits ? | une section de notes en fin de page : choisi, écarté, pourquoi | copier le motif « Notes — les hypothèses éditoriales » |
| A12 | La page a-t-elle une **accroche** (3-4 KPI de poids différents) et une **conclusion** ? | compter les KPI ; chercher le « ce qu'il faut retenir » | `span`, `lines` ; `fr-callout` |
| A13 | Le **sens** de chaque variation est-il le bon ? Une couleur automatique juge-t-elle ? | `color:"auto"`, `threshold-*`, `trend` ; le jeu porte-t-il un champ de sens ? | couleur explicite, seuils retirés, `compute` du ton ([sens-des-variations](sens-des-variations.md)) |
| A14 | Un **arrondi** précède-t-il un calcul ? | `round` en amont d'un KPI, d'un résumé pondéré, d'un `compute` | arrondir en aval (`decimals`, `map-summary-field`) |
| A15 | Les **petits multiples** partagent-ils la même échelle et le même ordre ? | comparer les axes de deux instances | `y-min` / `y-max` explicites ; ordre source |
| A16 | Le **tableau équivalent** se lit-il seul ? Colonnes nommées, ordre, format, une colonne par série, années en texte | ouvrir l'accordéon « Accessibilité » ou la vue tableau de la DataBox | alias dans la donnée, `order-by`, `decimals`, `series-field` sur `dsfr-data-a11y` ([accessibilite-comme-sens](accessibilite-comme-sens.md)) |
| A17 | Les **formulations** sont-elles prudentes ? Corrélation, enquête, déclaratif, révision, marge | relire les titres et le chapô avec la table de [titres-et-mots](titres-et-mots.md) | reformuler ; l'effectif de la sélection à côté |
| A18 | Le titre de chaque graphique filtré **reprend-il le choix** du lecteur, et une seule région live parle-t-elle ? | changer un filtre, lire le titre ; compter les `live` et les `role="status"` | `dsfr-data-context-value template fallback live` sur un seul élément |

## Pièges de relecture qui ont coûté cher au banc

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
- **Relire l'honnêteté et oublier le récit.** Une page dont chaque chiffre est juste et qui ne
  dit rien a passé la grille de la version précédente de ce skill. Les points I6 à I8 et A11 à
  A12 existent pour cela.
