# dsfr-data-chart

> Wrapper DSFR Chart connecte aux sources de données
>
> Déclencheurs : graphique, chart, visualisation, barres, camembert, ligne, radar, nuage, scatter, carte, map, jauge, gauge, departement, region, academie, monde, pays, databox, habillage, encadrer, titre graphique, source données, screenshot, capture écran, plein écran, fullscreen, tendance, trend

## <dsfr-data-chart> - Graphiques DSFR

Wrapper connectant les composants DSFR Chart officiels au systeme dsfr-data-source/dsfr-data-query.
Se connecte a une source via l'attribut `source`. Généré automatiquement le format
JSON imbrique attendu par les composants DSFR Chart natifs.

### Format des données
Attend un tableau d'objets plats depuis la source :
`[{"region": "IDF", "population": 12000000}, {"region": "OCC", "population": 6000000}]`

Les champs `label-field` et `value-field` indiquent quels champs utiliser pour
les labels (axe X) et les valeurs (axe Y). Le composant transforme automatiquement
ce tableau en format DSFR Chart (tableaux imbriques x/y).

### Types supportes
| Type | Composant DSFR | Description |
|------|---------------|-------------|
| bar | bar-chart | Barres verticales (ou horizontales avec `horizontal`) |
| line | line-chart | Courbes / lignes |
| pie | pie-chart | Anneau (défaut) ou camembert plein (avec `fill`) |
| radar | radar-chart | Diagramme radar |
| scatter | scatter-chart | Nuage de points |
| gauge | gauge-chart | Jauge circulaire 0-100% |
| bar-line | bar-chart + line-chart | Combine barres et ligne (2 séries) |
| map | map-chart (level="dep") | Carte par departement francais |
| map-reg | map-chart (level="reg") | Carte par region francaise |
| map-aca | map-chart (level="aca") | Carte par academie |
| map-monde | map-chart (level="monde") | Carte mondiale par pays |

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | `""` | oui | ID de la source ou query |
| type | String | `"bar"` | oui | Type de graphique (voir tableau ci-dessus) |
| label-field | String | `""` | selon type | Chemin vers les labels dans les données. Alias inline `champ:Libellé` accepté, comme sur dsfr-data-a11y : `label-field="dep_nom:Département"` lit `dep_nom` ; le libellé devient l'en-tête de la colonne de libellé du tableau de la DataBox (il ne sert nulle part ailleurs : pas de titre d'axe) |
| value-field | String | `""` | oui (sauf gauge) | Chemin vers les valeurs. Alias inline `champ:Libellé` pour la légende : `value-field="Panier_moyen:Panier moyen"` (un `:` littéral s'échappe en `%3A`) |
| value-field-2 | String | `""` | non | 2e série de valeurs (bar-line). Alias inline `champ:Libellé` accepté |
| value-fields | String | `""` | non | Séries supplementaires separees par virgules — format LARGE, une colonne par série (ex: `"budget,score"`). Alias inline par série : `"budget:Budget, score:Score"` |
| series-field | String | `""` | non | Champ clé de série pour données LONG/tidy : ses valeurs distinctes deviennent autant de séries. Ex: données `{mois, groupe, valeur}` avec `series-field="groupe"`. S'applique a bar/line/radar. Prioritaire sur value-fields. Consommateur naturel de `dsfr-data-unpivot`. |
| name | String | `""` | non | Nom(s) de série. Chaîne simple recommandée : `name="Taux"` (enveloppée automatiquement). JSON pour le multi-séries : `'["Réalisé","Objectif"]'`. Sur les cartes, un seul nom (le premier d'un JSON est retenu). Priorité : `name` explicite, sinon l'alias inline `champ:Libellé` de value-field(s), sinon le nom du champ ou les valeurs de series-field |
| idle-message | String | `"Choisissez un filtre pour afficher les données"` | non | Message rendu quand l'amont attend un filtre (`require-where`, #690). Distinct de « aucune donnée » : aucune requête n'a été faite. Existe aussi sur list, kpi, display, podium, a11y et map (sur la carte, le message se pose sur le fond et la couche se vide). |
| empty-label | String | `"Non renseigné"` | non | Libellé d'une catégorie vide (`null`, `undefined` ou `""` dans label-field) : légende du pie, axe X. Évite le « Série N » de DSFR Chart sur un nom vide. Ex: `empty-label="Sans objet"` |
| selected-palette | String | `"categorical"` | non | Palette : categorical, sequentialAscending, sequentialDescending, divergentAscending, divergentDescending, neutral, default |
| color-map | String | `""` | non | Couleur fixee par modalite : paires `modalite:#couleur` separees par virgule, meme grammaire que dsfr-data-map-layer. Ex: `"Realise:#000091,Objectif:#E1000F"`. La modalite est un nom de serie, sinon un libelle de l'axe (part de camembert, barre, ou point d'une courbe, d'un radar, d'un nuage : le trait garde la couleur de sa serie). Virgule ou deux-points dans une modalite : `%2C` / `%3A`. Sans effet sur les types map* |
| unit-tooltip | String | `""` | non | Unite dans les info-bulles : %, EUR, etc. Rendue comme du HTML simple (`m<sup>2</sup>`) ; script, attribut on*, URL javascript: retires. Jamais une valeur lue dans les donnees sans l'echapper |
| unit-tooltip-bar | String | `""` | non | Unite des barres dans un bar-line (meme regle que unit-tooltip) |
| horizontal | Boolean | `false` | non | Barres horizontales (type bar uniquement) |
| stacked | Boolean | `false` | non | Barres empilees (type bar uniquement) |
| fill | Boolean | `false` | non | Camembert plein au lieu d'anneau (type pie) |
| highlight-index | String | `""` | non | Indices a mettre en avant : `"[0, 2]"` |
| x-min | String | `""` | non | Borne min de l'axe HORIZONTAL quand il porte des nombres : scatter et line a etiquettes numeriques (annees, mesures), barres horizontales (ou c'est l'axe des valeurs). Sans effet, et signale en console, ailleurs. Voir « Bornes d'axe » ci-dessous |
| x-max | String | `""` | non | Borne max de l'axe HORIZONTAL, memes types que x-min |
| y-min | String | `""` | non | Borne min de l'axe des VALEURS, ou qu'il soit dessine : axe vertical (line, scatter, bar), axe horizontal de barres horizontales, axe des barres d'un bar-line, echelle radiale d'un radar (le centre du radar est fixe a y-min au lieu du minimum des donnees). Posee exactement. Ignoree et signalee si elle masquerait une donnee ou, sur des barres, si elle est positive |
| y-max | String | `""` | non | Borne max de l'axe des VALEURS, memes types que y-min. Pour type radar : si y-min et y-max sont entiers avec une amplitude de 1 a 10, anneaux de grille entiers (stepSize 1) |
| gauge-value | Number | `null` | type gauge | Valeur de la jauge (0-100) |
| code-field | String | `""` | types map* | Champ contenant le code : departement (map), region (map-reg : code INSEE, cle DSFR Chart IDF/20R/971 ou nom, traduits), academie (map-aca : nom accentue ou non, prefixe « Academie de » retire), code pays ISO 3166-1 alpha-2/alpha-3/numerique OU nom de pays en francais (map-monde : « Allemagne », « l'Allemagne », « Pays-Bas », converti en alpha-2) — prioritaire sur label-field. Une cle hors referentiel est ignoree ET comptee (console + volet Diagnostic) |
| map-highlight | String | `""` | non | Departements/regions a surligner |
| map-summary-weight | String | `""` | types map* | Champ d'effectif : le resume affiche sous le titre de la carte devient la moyenne PONDEREE (somme valeur x effectif / somme effectif). **A poser pour tout taux** : sans lui, le resume est la moyenne NON ponderee des territoires, qui n'est pas le taux national (ecart mesure : -24 %). Ex : `map-summary-weight="nb_eleves"` |
| map-summary-value | String | `""` | types map* | Valeur nationale fournie par la page, nombre litteral (`"5,6"`), prime sur map-summary-weight |
| map-summary | String | `""` | types map* | MODE de synthese du resume, calcule sur les lignes dessinees : `sum` (un VOLUME s'additionne — la moyenne d'un nombre de licencies par departement ne mesure rien), `weighted` (un TAUX se pondere, exige map-summary-weight), `avg` (moyenne non ponderee, le calcul historique), `none` (aucun chiffre ; l'en-tete « en France » est celui de DSFR Chart et reste). Absent : comportement inchange. Un mode inconnu est une erreur de configuration, sans resume de repli |
| map-summary-field | String | `""` | types map* | Colonne sur laquelle le resume est CALCULE, quand elle n'est pas celle qu'on affiche. Sans lui, le resume porte sur value-field ; avec, value-field ne sert plus qu'au trace et a l'infobulle. Repond au piege de l'arrondi amont (voir plus bas). Ex : `compute="taux_aff = round(taux, 1)"` puis `value-field="taux_aff" map-summary-field="taux"`. Un champ qu'aucune ligne dessinee ne porte en numerique est une erreur de configuration : aucun resume, jamais de repli sur la colonne affichee |
| reference-lines | String | `""` | non | Lignes de reference (overlay) en JSON. Cartesiens uniquement (line, bar, bar-line, scatter). Chaque item : `{ axis: "x" ou "y", value (string ou number), label?, color?, dash?, position? }`. `axis:"x"` → ligne verticale a une categorie/date ; `axis:"y"` → ligne horizontale a un seuil. Ex : `reference-lines='[{"axis":"x","value":"2026-02","label":"Lancement","color":"#c9191e","dash":true},{"axis":"y","value":3000,"label":"Objectif"}]'`. |
| targets | String | `""` | non | Cibles / objectifs futurs (overlay) en JSON. Types line et bar-line uniquement. Chaque item : `{ x (echeance, string ou number, requis), value (number, requis), series? (nom de dataset ou index, defaut 0), label?, color? }`. L'axe X est etendu automatiquement si l'echeance depasse les donnees : trait plein jusqu'au dernier point reel, trajectoire pointillee vers un losange a l'echeance, zone future grisee. Ex : `targets='[{"x":2030,"value":26,"label":"Cible 2030 : 26 %"}]'`. |
| targets-zone | String | `"on"` | non | Bande grisee + frontiere pointillee realise/projete. `"off"` desactive. |
| targets-legend | String | `""` | non | Legende sous le graphe : `""` = libelles par defaut (« Donnees historiques » / « Trajectoire, cible extrapolee »), `"off"` = masquee, `'["a","b"]'` = libelles personnalises. |

### Piege : un arrondi en amont fausse le resume d'une carte
Le resume porte sur la colonne `value-field` **telle qu'elle arrive au composant**.
L'arrondi au centieme que la carte applique pour se dessiner ne compte pas — le calcul
repart des lignes source. Mais un `dsfr-data-normalize round="champ:1"` en amont, qui
est le reflexe pour une infobulle lisible, **reecrit la colonne dans la donnee** : le
composant ne voit jamais la valeur brute, et `weighted` pondere alors des valeurs
arrondies. Mesure sur les 101 departements d'une federation sportive : taux national
exact 4,5368, ponderation sur la valeur brute 4,5368, ponderation sur round(x, 1)
**4,5331**. L'ecart reste plausible, donc invisible.

Les deux attributs sont corrects separement ; c'est leur composition qui ment. Le geste :
deriver une colonne d'affichage et laisser la brute intacte, puis pointer le calcul dessus.

```html
<dsfr-data-normalize id="n" source="licences"
  compute="lics_pop_aff = round(lics_pop, 1)"></dsfr-data-normalize>
<dsfr-data-chart source="n" type="map" code-field="dep"
  value-field="lics_pop_aff" map-summary-weight="pop"
  map-summary-field="lics_pop"></dsfr-data-chart>
```

Sur une somme l'ecart d'un arrondi amont reste marginal ; sur `weighted` il ne l'est pas.

### Bornes d'axe : quel attribut agit sur quel type

Regle : pour chaque couple attribut x type, la borne AGIT ou elle est SIGNALEE par un avertissement console — jamais ignoree en silence.

| Type | y-min / y-max | x-min / x-max |
|------|---------------|---------------|
| line, scatter | axe vertical (valeurs) | axe horizontal SI les etiquettes sont numeriques (annees, mesures) ; sinon sans effet, signale |
| bar | axe vertical (valeurs) | sans effet, signale (axe d'etiquettes) |
| bar + horizontal | axe des valeurs, qui est l'axe horizontal | meme axe — l'emporte si les deux sont ecrits |
| bar-line | axe des barres (a gauche) ; l'axe de la ligne (a droite) n'a pas de borne | sans effet, signale |
| radar | echelle radiale | sans effet, signale |
| pie, gauge, map* | sans effet, signale (pas d'axe) | sans effet, signale |

- **La borne est posee exactement** : `y-min="5"` sur une courbe donne un axe qui part de 5, `y-max="37"` un axe qui s'arrete a 37 (pas d'arrondi a la graduation voisine).
- **Une borne ne masque jamais une donnee** (hors radar) : un minimum au-dessus de la plus petite valeur, un maximum en dessous de la plus grande (du plus grand cumul pour des barres empilees) sont ignores et signales. Pour restreindre ce qui est affiche, filtrer en amont (dsfr-data-query `where`).
- **Des barres partent de zero** (bar, bar-line) : un minimum positif est ignore et signale — tronquer l'axe fausserait la comparaison des longueurs. Seul un minimum negatif ou nul agit. Pour un axe qui ne part pas de zero, utiliser une courbe.
- Petits multiples : poser les memes `y-min` / `y-max` sur chaque graphique pour une echelle commune.

### Attributs par type de graphique
| Type | Attributs essentiels | Attributs optionnels |
|------|---------------------|---------------------|
| bar | source, type, label-field, value-field | horizontal, stacked, highlight-index, selected-palette, y-min, y-max |
| line | source, type, label-field, value-field | x-min, x-max, y-min, y-max, value-field-2 |
| pie | source, type, label-field, value-field | fill (false=anneau, true=camembert plein) |
| radar | source, type, label-field, value-field | value-field-2, name, y-min, y-max |
| scatter | source, type, label-field, value-field | x-min, x-max, y-min, y-max |
| gauge | source, type, gauge-value | - |
| bar-line | source, type, label-field, value-field, value-field-2 | name, unit-tooltip, unit-tooltip-bar, y-min, y-max (axe des barres) |
| map | source, type, code-field, value-field | selected-palette, map-highlight, map-summary, map-summary-weight, map-summary-value |
| map-reg | source, type, code-field, value-field | selected-palette, map-highlight, map-summary, map-summary-weight, map-summary-value |
| map-aca | source, type, code-field, value-field | selected-palette, map-highlight, map-summary, map-summary-weight, map-summary-value |
| map-monde | source, type, code-field, value-field | selected-palette, map-highlight, map-summary, map-summary-weight, map-summary-value |

### Exemples
```html
<!-- Barres verticales -->
<dsfr-data-chart source="stats" type="bar"
  label-field="region" value-field="population"
  selected-palette="categorical">
</dsfr-data-chart>

<!-- Barres horizontales empilees -->
<dsfr-data-chart source="data" type="bar"
  label-field="catégorie" value-field="valeur"
  horizontal stacked>
</dsfr-data-chart>

<!-- Combine barres + ligne -->
<dsfr-data-chart source="data" type="bar-line"
  label-field="mois" value-field="ca" value-field-2="objectif"
  name='["CA","Objectif"]'
  unit-tooltip="EUR" unit-tooltip-bar="EUR">
</dsfr-data-chart>

<!-- Anneau (défaut de pie) -->
<dsfr-data-chart source="repartition" type="pie"
  label-field="catégorie" value-field="montant"
  unit-tooltip="%">
</dsfr-data-chart>

<!-- Camembert plein -->
<dsfr-data-chart source="repartition" type="pie"
  label-field="catégorie" value-field="montant" fill>
</dsfr-data-chart>

<!-- Carte par departement -->
<dsfr-data-chart source="dept-data" type="map"
  code-field="code_dept" value-field="valeur"
  selected-palette="sequentialAscending">
</dsfr-data-chart>

<!-- Carte par region -->
<dsfr-data-chart source="reg-data" type="map-reg"
  code-field="code_reg" value-field="valeur">
</dsfr-data-chart>

<!-- Carte par academie (noms en majuscules : PARIS, LYON...) -->
<dsfr-data-chart source="aca-data" type="map-aca"
  code-field="academie" value-field="valeur">
</dsfr-data-chart>

<!-- Carte mondiale (codes pays ISO : FR, US ou FRA, USA ou 250, 840) -->
<dsfr-data-chart source="pays-data" type="map-monde"
  code-field="code_pays" value-field="valeur"
  selected-palette="sequentialAscending">
</dsfr-data-chart>

<!-- Jauge -->
<dsfr-data-chart type="gauge" gauge-value="73"></dsfr-data-chart>
```

### Habillage DataBox (optionnel)

L'attribut `databox` active l'habillage DataBox DSFR autour du graphique :
cadre editorial avec titre, source, date, switch chart/tableau integre, screenshot PNG,
téléchargement CSV, plein écran, tendance. Le tableau intégré rend ses nombres en fr-FR
(« 2,27 », au plus 2 décimales ; une valeur non nulle inférieure à 0,01 garde deux chiffres
significatifs, 0,00123 → « 0,0012 », jamais « 0 »), comme celui de dsfr-data-a11y ; sa colonne de libellé porte
ce que l'axe affiche (`empty-label` compris) et son en-tête l'alias de `label-field`.

| Attribut | Type | Défaut | Description |
|----------|------|--------|-------------|
| databox | Boolean | `false` | Active l'habillage DataBox DSFR |
| databox-title | String | `""` | Titre affiche dans l'en-tete (ex: "Population par region") |
| heading-level | Number | `3` | Niveau de titre HTML du titre DataBox (2 à 6, borné) — `heading-level="2"` rend un h2, à caler sur la hiérarchie de la page (RGAA 9.1) |
| databox-source | String | `""` | Source des données (ex: "INSEE, RP 2021") |
| databox-date | String | `""` | Date des données (ex: "Mars 2024"). Prime sur databox-date-field |
| databox-date-field | String | `""` | Colonne de dates ISO (AAAA-MM-JJ) : la plus récente est affichée comme date, formatée JJ/MM/AAAA (ex: `databox-date-field="gazole_maj"`) |
| databox-download | Boolean | `false` | Bouton téléchargement CSV |
| databox-screenshot | Boolean | `false` | Bouton screenshot PNG |
| databox-fullscreen | Boolean | `false` | Bouton qui ouvre la fenêtre d'information. N'apparaît qu'AVEC databox-modal-title : seul, il ne rend rien (avertissement console). Le graphique n'est pas agrandi |
| databox-trend | String | `""` | Tendance (ex: "+5.2" ou "-3.1") |
| databox-tooltip-title | String | `""` | Titre du tooltip info (texte) |
| databox-tooltip-content | String | `""` | Contenu du tooltip info (texte, aucune balise) |
| databox-modal-title | String | `""` | Titre de la fenêtre d'information (texte). Exige databox-fullscreen : sans lui, aucune fenêtre |
| databox-modal-content | String | `""` | Contenu de la fenêtre, en HTML SIMPLE : p, strong, em, a, ul/li, table, img. Script, iframe, style, attribut on*, URL javascript: et data: sont retirés avant affichage |
| databox-default-source | String | `""` | SANS EFFET avec dsfr-data-chart (une seule source, aucun sélecteur) : ne pas l'écrire |
| databox-actions | String | `""` | Entrées ajoutées au menu « Plus d'actions » : tableau JSON de libellés, ex. `'["Source officielle","Méthode"]'`. Une entrée n'a AUCUN comportement : la page la branche par `data-action` |

Trois règles du cadre (#1289) :

- **Le menu « Plus d'actions », l'infobulle et la fenêtre ne s'ouvrent qu'avec le JavaScript du DSFR**
  (`dsfr.module.min.js`, chargé par la page). Sans lui, le téléchargement CSV et la capture du cadre sont
  hors d'atteinte ; le composant le dit dans la console. Le basculement graphique / tableau, lui, marche sans.
- **Une action de `databox-actions` est un bouton sans comportement.** Il porte `data-action` (le libellé
  en minuscules, sans accents, tout autre caractère en tiret : « Source officielle » → `source-officielle`)
  et `data-id` (l'id du cadre). La page écoute le clic :
  `document.addEventListener('click', (e) => { if (e.target.closest('[data-action="source-officielle"]')) … })`.
  Une valeur mal formée (JSON invalide, pas un tableau, entrée qui n'est pas une chaîne) est une erreur de
  configuration (`data-dsfr-config-error`) : les entrées fautives sont écartées, le cadre reste affiché.
- **Deux attributs reçoivent du HTML**, `databox-modal-content` et `unit-tooltip` (`unit-tooltip-bar`) ;
  tous les autres (titre, source, date, tendance, infobulle, noms de séries, libellés) sont rendus comme du
  texte. Le HTML est nettoyé — le contenu actif est retiré — mais une valeur lue dans les DONNÉES s'échappe
  quand même avant d'y être écrite.

Quand `databox` est active, dsfr-data-a11y ne doit PAS inclure `table` ni `download`
(DataBox les fournit déjà). Conserver uniquement `description` sur dsfr-data-a11y.

La vue tableau de la DataBox reprend ce que le graphique trace : une colonne par champ de valeur
(`value-field`, `value-field-2`, `value-fields`, en-tête = libellé de légende) ; au format long
(`series-field`), une ligne par libellé et une colonne par série. Elle montre 100 lignes au plus
et l'annonce sous le tableau (« Affichage limité aux 100 premières lignes sur N. »).

```html
<!-- Graphique avec habillage DataBox -->
<dsfr-data-chart source="data" type="bar"
  label-field="region" value-field="total"
  databox
  databox-title="Population par region"
  databox-source="INSEE, RP 2021"
  databox-date="Mars 2024"
  databox-download>
</dsfr-data-chart>
<dsfr-data-a11y for="chart" source="data"
  description="L'Ile-de-France concentre la majorite de la population.">
</dsfr-data-a11y>
```

### Référence `<dsfr-data-chart>` (générée depuis le code)

**Rôle pipeline** : affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’émet pas de données.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `code-field` | `string` | `""` (vide) | Chemin vers le champ code (prioritaire sur label-field) : département/région (map/map-reg), nom d'académie (map-aca), code pays ISO a2/a3/num (map-monde) |
| `color-map` | `string` | `""` (vide) | Couleur fixée par modalité (#732) : paires `modalité:#couleur` séparées par des virgules, même grammaire que `dsfr-data-map-layer`. Ex : `"Réalisé:#000091,Objectif:#E1000F"`. La modalité est un nom de série (une couleur par courbe ou par barre) ou, à défaut, un libellé de l'axe (une couleur par part de camembert, par barre, ou par point d'une courbe, d'un radar ou d'un nuage — le trait garde la couleur de sa série, #1244). Les modalités non citées gardent la couleur de la palette. Une virgule ou un deux-points dans une modalité s'écrit `%2C` ou `%3A`. Sans effet sur les cartes (`map*`). |
| `databox` | `boolean` | `false` | Envelopper le chart dans une DataBox DSFR native. Son menu « Plus d'actions » (CSV, capture, actions), son infobulle et sa fenêtre ne s'ouvrent que si la page charge le JavaScript du DSFR (`dsfr.module.min.js`) ; sinon un avertissement console le dit (#1289). |
| `databox-actions` | `string` | `""` (vide) | Entrées ajoutées au menu « Plus d'actions » du cadre : tableau JSON de libellés, ex. `'["Source officielle","Méthode"]'`. Une entrée n'a AUCUN comportement par elle-même : la page la branche en écoutant le clic du bouton, qui porte `data-action` (le libellé en minuscules, sans accents, tout autre caractère en tiret : `source-officielle`) et `data-id` (l'id du cadre). Valeur mal formée : erreur de configuration (`data-dsfr-config-error`), les entrées fautives sont écartées et le cadre reste affiché (#1289). |
| `databox-date` | `string` | `""` (vide) | Date de la donnée (ex: "Mars 2024"), affichée dans le pied de la DataBox et sur les cartes. Aucune date n'est rendue si l'attribut est absent — plus de repli sur la date du jour, qui n'est pas celle des données (#650). Prime sur `databox-date-field` quand les deux sont posés. |
| `databox-date-field` | `string` | `""` (vide) | Fraîcheur lue dans la donnée (#661) : chemin d'une colonne de dates ISO (`AAAA-MM-JJ`, heure facultative). La plus récente est affichée comme date de la DataBox (et des cartes), formatée JJ/MM/AAAA. Ignoré si `databox-date` est posé ; aucune date rendue si la colonne ne contient aucune date ISO valide. |
| `databox-default-source` | `string` | `""` (vide) | Source par défaut du sélecteur multi-source de la DataBox. SANS EFFET avec `dsfr-data-chart`, qui ne déclare au cadre qu'une source : aucun sélecteur n'est affiché, et un avertissement console le dit (#1289). |
| `databox-download` | `boolean` | `false` | Bouton téléchargement CSV dans DataBox |
| `databox-fullscreen` | `boolean` | `false` | Bouton à l'icône « plein écran » de la DataBox. Avec DSFR Chart 2.1.1, il n'apparaît qu'accompagné de `databox-modal-title`, et il ouvre cette modale (`databox-modal-content`) : le graphique lui-même n'est pas agrandi (#1179). Posé SEUL, il ne rend rien : un avertissement console le dit (#1289). |
| `databox-modal-content` | `string` | `""` (vide) | Contenu de la modale DataBox, en HTML SIMPLE (paragraphes, gras, liens, listes). DSFR Chart le pose tel quel dans la page : le composant le nettoie avant de le relayer (#1289) — scripts, iframes, styles, attributs `on*`, URL `javascript:` et `data:` sont retirés, et le retrait signalé dans la console. Une valeur venue d'une donnée s'échappe avant d'y être écrite. Sans effet sans `databox-modal-title` et `databox-fullscreen`. |
| `databox-modal-title` | `string` | `""` (vide) | Titre de la modale DataBox (texte). La fenêtre n'existe qu'avec ce titre ET `databox-fullscreen` : sans l'un des deux, rien n'est rendu et un avertissement console le dit (#1289). |
| `databox-screenshot` | `boolean` | `false` | Bouton screenshot PNG |
| `databox-source` | `string` | `""` (vide) | Mention de la source (ex: "INSEE, 2024") |
| `databox-title` | `string` | `""` (vide) | Titre affiché dans l'en-tête DataBox |
| `databox-tooltip-content` | `string` | `""` (vide) | Contenu du tooltip info DataBox (rendu comme du texte, aucune balise) |
| `databox-tooltip-title` | `string` | `""` (vide) | Titre du tooltip info DataBox (rendu comme du texte) |
| `databox-trend` | `string` | `""` (vide) | Badge tendance (ex: "+5.2", "-3.1") |
| `empty-label` | `string` | `'Non renseigné'` | Libellé affiché pour une catégorie vide (`null`, `undefined` ou `""` dans `label-field`) : légende du pie, axe X des cartésiens (#647). Sans lui, DSFR Chart substituerait « Série N » à un nom vide. Pour EXCLURE ces lignes plutôt que les nommer, filtrer en amont : `where="champ:isnotnull"` (query) ou `where="champ is not null"` (source ODS). |
| `fill` | `boolean` | `false` | Remplir le graphique (pie chart: true = plein, false = donut) |
| `gauge-value` | `number \| null` | `null` | Valeur pour la jauge (gauge chart uniquement) |
| `heading-level` | `number` | `3` | Niveau de titre HTML du titre de la DataBox (RGAA 9.1, #670) : entier de 2 à 6, borné (défaut 3, rendu historique de DSFR Chart). `heading-level="2"` rend un h2. |
| `highlight-index` | `string` | `""` (vide) | Index des éléments à mettre en avant (ex: "[0, 2]") |
| `horizontal` | `boolean` | `false` | Affichage horizontal (bar chart uniquement) |
| `idle-message` | `string` | `IDLE_MESSAGE_DEFAULT` | Message rendu quand l'amont attend un filtre (`require-where`, #690). Distinct de « aucune donnée » : aucune requête n'a été faite. Vide, le libellé par défaut est utilisé. |
| `label-field` | `string` | `""` (vide) | Chemin vers le champ label. Alias inline `champ:Libellé` (#1244), la grammaire de `value-field` (#668) et de `dsfr-data-a11y` (#1230) : `label-field="dep_nom:Département"` lit la colonne `dep_nom`, et « Département » devient l'en-tête de la colonne de libellé du tableau de la DataBox (`databox`). Le libellé ne sert nulle part ailleurs : DSFR Chart n'a pas de titre d'axe, et les graduations portent les VALEURS de la colonne. Sans deux-points, rien ne change. Un `:` littéral dans un chemin ou un libellé s'échappe en `%3A` (escapeColonValue) ; une colonne qui existe telle quelle dans les données, deux-points compris, est lue telle quelle. |
| `map-highlight` | `string` | `""` (vide) | ID du département/région à mettre en avant (map chart) |
| `map-summary` | `string` | `""` (vide) | MODE de synthèse du résumé affiché sous le titre d'une carte (`type="map*"`), #927 — calculé sur les lignes dessinées, donc suivant les filtres comme le reste de la carte : - `sum` — la **somme**. La seule synthèse juste d'une carte de VOLUMES : le nombre de licenciés, d'établissements, de logements par territoire. La moyenne d'un volume par territoire ne mesure rien (« 3 074,06 en France » pour 310 480 licences) ; - `avg` — la moyenne NON pondérée, le calcul historique. Juste pour un indicateur dont les territoires pèsent pareil, faux pour un taux dès qu'ils diffèrent : la Lozère y pèse autant que le Nord ; - `weighted` — la moyenne pondérée, Σ(valeur × effectif) / Σ(effectif). La synthèse juste d'une carte de TAUX (#763), et exige `map-summary-weight` ; - `none` — **aucun résumé**. Le choix honnête quand la carte ne porte pas un indicateur qui se résume en un nombre (un indice, un rang, une catégorie recodée). Ce qui disparaît est le CHIFFRE : l'en-tête « …, en France » appartient à DSFR Chart et reste affiché, sans valeur (vérifié au navigateur le 2026-09-19). **La première question d'une carte thématique est volume ou taux**, et elle décide du mode : un volume s'additionne, un taux se pondère, et l'autre calcul est faux dans les deux sens. Une somme n'a de sens que si les lignes dessinées forment une PARTITION du territoire — chaque unité comptée une fois et une seule. Deux lignes portant le même code géographique sont additionnées toutes les deux alors que la carte n'en dessine qu'une (la dernière) : un avertissement console le signale en mode `sum`, et il faut alors agréger en amont (`dsfr-data-query group-by="dep"`). Les lignes écartées faute de code géographique exploitable ne sont dans aucun résumé — le compte de ces lignes est déjà journalisé. **Attribut absent : rien ne change.** Le résumé garde son ordre historique — valeur fournie, sinon moyenne pondérée si `map-summary-weight` est posé, sinon moyenne non pondérée. Cet attribut n'est qu'une façon de plus de résumer, jamais une redéfinition des chiffres déjà publiés. **Ordre de priorité** : `none` l'emporte sur tout ; `map-summary-value` (littéral, #763) l'emporte ensuite sur le mode, avec un avertissement console quand les deux sont posés. Un mode inconnu, ou `weighted` sans `map-summary-weight`, est une erreur de configuration et n'affiche AUCUN résumé — jamais un chiffre de repli qui aurait l'air juste. **Ce que le résumé lit** : la colonne `value-field`, telle qu'elle arrive — donc arrondis d'un `dsfr-data-normalize round="…"` en amont compris, qui faussent `weighted` sans se voir (PG-031, #929). L'arrondi au centième que la carte applique pour SE DESSINER, lui, ne compte pas. Pour arrondir l'affichage sans fausser le calcul : `map-summary-field`. Ce que le résumé écarte est DIT sous la carte (#1201) : les lignes au code absent ou hors du découpage ne sont ni dessinées ni comptées, et une note « Ce chiffre écarte N lignes sans territoire sur la carte » le signale — avec leur total pour `sum`. |
| `map-summary-field` | `string` | `""` (vide) | Colonne sur laquelle le résumé d'une carte est CALCULÉ, quand elle n'est pas celle qu'on affiche (#929). Sans l'attribut le résumé porte sur `value-field` ; avec, `value-field` ne sert plus qu'au tracé et à l'infobulle. C'est la réponse au piège de composition d'un arrondi amont : `compute="taux_aff = round(taux, 1)"`, puis `value-field="taux_aff" map-summary-field="taux"`. Vaut pour les trois calculs (`sum`, `avg`, `weighted`), sans effet sous `map-summary-value` ou `map-summary="none"`. Un champ qu'aucune ligne dessinée ne porte en numérique est une erreur de configuration nommée : aucun résumé, jamais un repli silencieux sur la colonne affichée — qui serait le chiffre faux que l'attribut évite. **Attribut absent : rien ne change.** |
| `map-summary-value` | `string` | `""` (vide) | Valeur du résumé affiché sous le titre des cartes (`type="map*"`), à la place de la moyenne calculée (#763). Nombre littéral, décimales à la française acceptées (`map-summary-value="5,6"`) : la valeur nationale publiée par ailleurs, qui fait autorité. Prime sur `map-summary-weight`. Une valeur non numérique est une erreur de configuration, et aucun résumé n'est affiché plutôt qu'un chiffre faux. Sans cet attribut ni `map-summary-weight`, le résumé est la moyenne NON PONDÉRÉE des valeurs dessinées sur la carte. Pour un taux, ce n'est pas le taux national dès que les territoires ont des tailles différentes : l'écart mesuré atteint le quart de la valeur sur un indicateur dispersé, et reste invisible sur un indicateur homogène. |
| `map-summary-weight` | `string` | `""` (vide) | Champ d'effectif pour un résumé de carte PONDÉRÉ (#763) : Σ(valeur × effectif) / Σ(effectif) sur les lignes dessinées. Pour un taux de personnels par élève, `map-summary-weight="nb_eleves"` rend le taux national, là où la moyenne des taux départementaux s'en écarte. Les lignes dont l'effectif n'est pas numérique sont écartées du calcul ; si aucune n'en porte, erreur de configuration et pas de résumé. **Sur quoi porte le calcul** : la colonne `value-field` telle qu'elle arrive. L'arrondi au centième que la carte applique pour SE DESSINER ne compte pas — le résumé repart des lignes source. Mais un `dsfr-data-normalize round="champ:1"` en amont réécrit la colonne dans la donnée, et la pondération porte alors sur des valeurs arrondies : 4,5331 au lieu de 4,5368 sur 101 départements (PG-031, #929). `map-summary-field` désigne alors la colonne brute. |
| `name` | `string` | `""` (vide) | Nom(s) de série. Chaîne simple recommandée (`name="Taux"`), enveloppée automatiquement pour DSFR Chart ; tableau JSON pour le multi-séries (`name='["Réalisé","Objectif"]'`). Sur les cartes (`map*`), un seul nom : le premier élément d'un JSON est retenu (#653). Priorité (#668) : `name` explicite, sinon l'alias inline `champ:Libellé` de value-field(s), sinon le nom du champ (ou les valeurs de series-field en mode tidy). |
| `reference-lines` | `string` | `""` (vide) | Lignes de référence (overlay) au format JSON. Graphiques cartésiens uniquement (line, bar, bar-line, scatter). Chaque item : `{ axis: "x"\|"y", value: string\|number, label?, color?, dash?, position? }`. `axis:"x"` → ligne verticale à une catégorie/date ; `axis:"y"` → ligne horizontale à un seuil. Ex : `reference-lines='[{"axis":"x","value":"2026-02", "label":"Lancement","color":"#c9191e","dash":true}]'`. |
| `selected-palette` | `string` | `'categorical'` | Palette de couleurs |
| `series-field` | `string` | `""` (vide) | Champ "clé de série" pour des données au format long/tidy : ses valeurs distinctes deviennent autant de series (mode multi-series sans colonnes multiples). Ex: données {mois, groupe, valeur} avec series-field="groupe" → une série par groupe. S'applique aux types multi-series (bar, line, radar). Prioritaire sur value-fields. Une cellule (libellé, série) sans observation vaut `null` (#1198) : la courbe s'interrompt, la barre est absente — jamais un 0 dessiné. |
| `source` | `string` | `""` (vide) | Id de la `<dsfr-data-source>` (ou d'un transformateur) dont ce graphique consomme les données. |
| `stacked` | `boolean` | `false` | Barres empilées (bar chart uniquement) |
| `targets` | `string` | `""` (vide) | Cibles / objectifs futurs (overlay) au format JSON. Types `line` et `bar-line` uniquement. Chaque item : `{ x: string\|number (échéance, requis), value: number (requis), series?: string\|number (nom de dataset ou index, défaut 0), label?: string, color?: string }`. L'axe X est étendu automatiquement si l'échéance est au-delà des données (séries paddées avec null : trait plein jusqu'au dernier point réel, trajectoire pointillée vers le losange). Ex : `targets='[{"x":2030,"value":26,"label":"Cible 2030 : 26 %"}]'`. |
| `targets-legend` | `string` | `""` (vide) | Légende réalisé/projeté sous le graphe : `""` = libellés par défaut (« Données historiques » / « Trajectoire, cible extrapolée »), `"off"` = masquée, `'["a","b"]'` = libellés personnalisés. |
| `targets-zone` | `string` | `'on'` | Zone future grisée + frontière pointillée réalisé/projeté. `"off"` désactive. |
| `type` | `DSFRChartType` | `'bar'` | Type de graphique DSFR |
| `unit-tooltip` | `string` | `""` (vide) | Unité à afficher dans les tooltips (`%`, `€`…). DSFR Chart l'insère comme du HTML : le HTML simple est gardé (`m<sup>2</sup>`), le contenu actif retiré avant d'être relayé (#1289). |
| `unit-tooltip-bar` | `string` | `""` (vide) | Unité pour les barres (bar-line uniquement). Même nettoyage que `unit-tooltip`. |
| `value-field` | `string` | `""` (vide) | Chemin vers le champ valeur. Alias inline `champ:Libellé` (#668) : `value-field="Panier_moyen:Panier moyen"` affiche « Panier moyen » dans la légende à la place du nom technique. Un `name` explicite prime sur l'alias. Un `:` littéral dans un chemin ou un libellé s'échappe en `%3A` (escapeColonValue). |
| `value-field-2` | `string` | `""` (vide) | Chemin vers un second champ de valeur (pour bar-line: y-line). Alias inline `champ:Libellé` accepté (#668). |
| `value-fields` | `string` | `""` (vide) | Champs de valeur supplémentaires, séparés par des virgules (ex: 'budget,score'). Alias inline `champ:Libellé` par série (#668) : `value-fields="budget:Budget, score:Score"`. Un `name` explicite (tableau JSON) prime sur les alias. |
| `x-max` | `string` | `""` (vide) | Borne maximale de l'axe HORIZONTAL, quand il porte des nombres : `scatter` et `line` dont les étiquettes sont numériques (années, mesures), et barres horizontales (`type="bar" horizontal`), où l'axe horizontal est celui des valeurs. La borne est posée exactement. Elle est ignorée, avec un avertissement console, si elle masquerait une donnée (maximum en dessous de la plus grande valeur portée par l'axe). Sans effet, et signalée en console, sur un axe d'étiquettes (`bar` vertical, `bar-line`, `line` ou `scatter` à étiquettes texte), sur `radar` et sur les types sans axe (`pie`, `gauge`, cartes). |
| `x-min` | `string` | `""` (vide) | Borne minimale de l'axe HORIZONTAL, quand il porte des nombres : `scatter` et `line` dont les étiquettes sont numériques (années, mesures), et barres horizontales (`type="bar" horizontal`), où l'axe horizontal est celui des valeurs. La borne est posée exactement. Elle est ignorée, avec un avertissement console, si elle masquerait une donnée (minimum au-dessus de la plus petite valeur portée par l'axe) et, sur des barres horizontales, si elle est positive : des barres partent de zéro. Sans effet, et signalée en console, sur un axe d'étiquettes (`bar` vertical, `bar-line`, `line` ou `scatter` à étiquettes texte), sur `radar` et sur les types sans axe (`pie`, `gauge`, cartes). |
| `y-max` | `string` | `""` (vide) | Borne maximale de l'axe des VALEURS, où qu'il soit dessiné : axe vertical de `line`, `scatter` et `bar`, axe horizontal de barres horizontales (`type="bar" horizontal` — `x-max` y fait la même chose et l'emporte si les deux sont écrits), axe des barres (à gauche) de `bar-line` (l'axe de la ligne, à droite, n'a pas de borne), échelle radiale de `radar` (si `y-min` et `y-max` sont entiers avec une amplitude de 1 à 10, la grille utilise des anneaux entiers). La borne est posée exactement (`y-max="37"` : l'axe s'arrête à 37). Hors `radar`, elle est ignorée, avec un avertissement console, si elle masquerait une donnée (maximum en dessous de la plus grande valeur ; pour des barres empilées, du plus grand cumul). Sans effet, et signalée en console, sur les types sans axe (`pie`, `gauge`, cartes). |
| `y-min` | `string` | `""` (vide) | Borne minimale de l'axe des VALEURS, où qu'il soit dessiné : axe vertical de `line`, `scatter` et `bar`, axe horizontal de barres horizontales (`type="bar" horizontal` — `x-min` y fait la même chose et l'emporte si les deux sont écrits), axe des barres (à gauche) de `bar-line` (l'axe de la ligne, à droite, n'a pas de borne), échelle radiale de `radar` (le centre du radar est fixé à `y-min` au lieu du minimum des données). La borne est posée exactement (`y-min="5"` sur une courbe : l'axe part de 5). Hors `radar`, elle est ignorée, avec un avertissement console, si elle masquerait une donnée (minimum au-dessus de la plus petite valeur) et, sur des barres (`bar`, `bar-line`), si elle est positive : des barres partent de zéro, seul un minimum négatif ou nul agit. Sans effet, et signalée en console, sur les types sans axe (`pie`, `gauge`, cartes). |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getSkippedCount()` | `number` | Nombre de lignes ignorees par la dernière carte rendue (`type="map*"`) : code geographique absent, vide, invalide ou hors du referentiel du decoupage (academie inconnue, region inconnue, #729). 0 hors carte. |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
