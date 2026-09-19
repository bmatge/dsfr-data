# Annotation : la phrase de lecture

> Un graphique sans phrase laisse le lecteur seul. Titre qui dit le message, repère et cible dessinés, valeur du filtre reprise dans le titre, source et date lues dans la donnée, description pour les lecteurs d'écran.
>
> Déclencheurs : phrase de lecture, annotation, titre du graphique, repère, ligne de référence, seuil, cible, objectif, résultats pour, titre dynamique, source de la donnée, date de la donnée, à jour au, mise à jour, description, légende

## Le titre porte le message, le libellé porte la mesure

| Élément | Geste | Piège |
|---|---|---|
| Titre du bloc | `databox-title="Part des femmes parmi les licenciés, 2024"` ; `heading-level="2"` pour le rang RGAA 9.1 (#670) | un titre = nom du jeu |
| Nom de série | `value-field="lics_f:Licenciées"` (alias inline `champ:Libellé`, #668) ; vérifié le 2026-09-19 : la légende affiche l'alias | `name='["…"]'` sur une carte s'affiche littéralement (AM-023) |
| Modalité vide | `empty-label="Non renseigné"` (0.21.1) — vérifié : l'axe affiche « Non renseigné » | le tableau `a11y` du même graphique rend la cellule **vide** (vérifié 2026-09-19) : nommer aussi dans la donnée si le tableau compte |
| Unité | `unit-tooltip="%"`, `unit="€"` sur un KPI | l'unité dans `label` quand la valeur n'en est pas une |

## Calculer la phrase dans la donnée

La refonte du Baromètre n'écrit pas « voir le graphique » : elle calcule la phrase par ligne,
sans script, dans un `dsfr-data-normalize compute` :

```
valeurs_txt = concat(p_txt, ' % contre ', n_txt, ' %')        → « 75,8 % contre 71,2 % »
ecart_txt   = replace(concat(when score_prof >= score_nat then '+' else '−', abs(round(…, 1))), '.', ',')
```

puis les rend dans un gabarit `dsfr-data-display` à côté du graphique. Le lecteur lit l'écart
**et** les deux niveaux ; le lecteur d'écran aussi. Ce que ça coûte : les formats de nombre dans
`compute` sont ceux de JavaScript (point décimal), d'où le `replace('.', ',')` — le dire en page.

## Dessiner le repère plutôt que le décrire

- **Ligne de référence** : `reference-lines='[{"axis":"y","value":2000,"label":"Objectif
  intermédiaire : 2 000"}]'` (cartésiens : line, bar, bar-line, scatter). `axis:"x"` à une date
  marque un événement (« Lancement »).
- **Cible** : `targets='[{"x":"2024-09","value":4000,"label":"Cible septembre : 4 000"}]'`
  (line et bar-line) : l'axe s'étend jusqu'à l'échéance, trajectoire pointillée, losange, zone
  future grisée, légende « Données historiques / Trajectoire, cible extrapolée ».
- **Vérifié au navigateur le 2026-09-19** (dsfr-data 0.30.0 CDN, DSFR Chart 2.1.1) : sans
  `databox`, ligne rouge à 2 000, étiquette, trajectoire, losange et zone grisée sont dessinés.
  **Avec `databox`**, l'axe est bien étendu à l'échéance et la légende des cibles est rendue,
  mais **ni la ligne de référence ni la trajectoire ne sont visibles** — même famille de défaut
  que BUG-016 (la DataBox rend le canvas dans son propre composant). Tant que ce n'est pas
  corrigé : un repère ou une cible se pose sur un graphique **sans** `databox`, et le titre / la
  source se posent alors à la main (`<h3>` + `<p class="fr-text--xs">`).
- Le repère annoncé aux lecteurs d'écran : `reference-lines` ajoute un résumé à l'`aria-label`
  du graphique (`referenceLinesAriaSummary`, source `dsfr-data-chart.ts`).

## Le titre reprend le choix du lecteur

« Équipements sportifs à **Rennes** » : `dsfr-data-context-value for="ctx" template="Résultats
pour {{departement}}" fallback="Résultats pour toute la France" live` (0.27.0, AM-057). `live`
sur **un seul** élément de la page ; `fallback` obligatoire, sinon « Résultats pour » suivi de
rien tant qu'aucun filtre n'est posé. Vérifié en page sur `education/patronymes-des-ecoles`
(`aria-live="polite"`, le titre suit l'année).

## Source et fraîcheur, lues dans la donnée

- `databox-source="DGCCRF — flux instantané, via data.economie.gouv.fr"` : le producteur, le
  jeu, le portail. L'original ne mentionnait sa source sous aucun graphique (AV-004).
- `databox-date-field="date_maj"` (0.22.0) : la plus récente des dates ISO de la colonne,
  formatée JJ/MM/AAAA. Avant : `databox-date` affichait la date **de rendu** comme date des
  données (AM-021, corrigé) — une date écrite à la main est fausse le lendemain.
- Un KPI de fraîcheur : `value="date_maj:max" format="date"` (0.22.0).

## La description est une lecture, pas une légende

`dsfr-data-a11y for="g" source="q" description="Les écoles concentrent le plus d'effectifs ;
3 595 lignes n'ont pas de catégorie renseignée."` — la phrase que verrait un lecteur pressé,
lue par les lecteurs d'écran (`aria-describedby`). Elle dit le **message** et ce qu'on **ne
montre pas** ; elle ne répète pas le titre. Avec `databox`, garder seulement `for` + `source` +
`description` (la DataBox fournit déjà tableau et export).

## Les compteurs sont des phrases aussi

- `dsfr-data-search count count-label="question"` → « 119 questions » (0.29.0, AM-044) : le
  mot est celui de la question posée, pas « résultats ».
- `require-where` + `idle-message="Choisissez une case de la déclaration"` (0.25.0) : tant
  qu'aucun filtre n'est posé, les afficheurs disent quoi faire au lieu d'une courbe absurde
  (page impôt sur le revenu, AM-035). Le compteur de recherche suit (0.26.0, AM-065).
