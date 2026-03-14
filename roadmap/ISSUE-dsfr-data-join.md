# Feature Request: Nouveau composant `dsfr-data-join`

## Contexte

Les donnees ouvertes de l'Etat sont reparties entre de nombreux jeux de donnees independants.
Un cas d'usage tres frequent est l'enrichissement de donnees metier avec un referentiel commun
(geographique, administratif, etc.), ce qui necessite aujourd'hui un traitement externe
(Excel, Python, ETL) avant de pouvoir visualiser les donnees.

## Objectif

Creer un composant `dsfr-data-join` (actuellement `dsfr-data-join` en attendant le renommage)
qui effectue une **jointure declarative en HTML** entre deux sources de donnees, sur une cle
commune (pivot).

Le composant s'insere dans le pipeline existant comme un noeud supplementaire :

```
dsfr-data-source A ── dsfr-data-query A ──►┐
                                            ├── dsfr-data-join ── dsfr-data-chart
dsfr-data-source B ── dsfr-data-query B ──►┘
```

## Cas d'usage cibles

| Donnees metier (left) | Referentiel (right) | Pivot | Resultat |
|---|---|---|---|
| Demographie par departement | Referentiel departements INSEE (noms, coords) | `code_dept` | Carte choropleth avec noms propres |
| Criminalite par commune | COG INSEE (communes, populations) | `code_commune` | Taux pour 1000 habitants par commune |
| Budget par ministere | Annuaire des administrations | `code_admin` | Tableau enrichi avec contacts |
| Qualite de l'air par station | Coordonnees des stations de mesure | `id_station` | Carte avec valeurs de pollution |
| Resultats scolaires par etablissement | Referentiel academies | `code_academie` | Comparaison inter-academies |
| Emploi par bassin | Contours bassins d'emploi | `code_bassin` | Choropleth bassins d'emploi |

## API du composant

### Attributs

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| `left` | `string` | requis | ID de la source/query gauche (donnees metier) |
| `right` | `string` | requis | ID de la source/query droite (referentiel) |
| `on` | `string` | — | Cle de jointure commune (meme nom des deux cotes) |
| `left-key` | `string` | — | Nom de la cle cote gauche (si different de `on`) |
| `right-key` | `string` | — | Nom de la cle cote droite (si different de `on`) |
| `type` | `string` | `"left"` | Type de jointure : `left`, `inner`, `full` |
| `fields` | `string` | — | Champs a conserver (comma-separated). Tous par defaut |
| `prefix-right` | `string` | — | Prefixe pour les champs right en cas de collision de noms |

### Exemple d'utilisation

```html
<!-- Source 1 : donnees metier agregees par departement -->
<dsfr-data-source id="stats" api-type="opendatasoft"
  dataset-id="demographie-par-dept" base-url="https://data.economie.gouv.fr"
  server-side where="annee=2024"
  group-by="code_dept" aggregate="population:sum:pop">
</dsfr-data-source>

<!-- Source 2 : referentiel geographique -->
<dsfr-data-source id="geo" api-type="tabular"
  resource="referentiel-departements">
</dsfr-data-source>
<dsfr-data-normalize id="n-geo" source="geo"
  rename="libelle:nom_dept">
</dsfr-data-normalize>

<!-- Jointure sur code departement -->
<dsfr-data-join id="enriched"
  left="stats" right="n-geo"
  on="code_dept">
</dsfr-data-join>

<!-- Affichage du resultat joint -->
<dsfr-data-chart source="enriched" type="bar"
  label-field="nom_dept" value-field="pop">
</dsfr-data-chart>
```

### Cles differentes des deux cotes

```html
<!-- La cle s'appelle "dept" a gauche et "code" a droite -->
<dsfr-data-join id="merged"
  left="stats" right="geo"
  left-key="dept" right-key="code"
  fields="pop,nom_dept,lat,lng"
  prefix-right="geo_">
</dsfr-data-join>
```

## Position dans le pipeline

Le join se place **apres** query/normalize, **avant** l'affichage. C'est fondamental
pour la performance :

```
Source A (50 000 lignes) ── Query A (GROUP BY) ── 96 lignes ──►┐
                                                                ├── Join (96 x 96) ── Chart
Source B (referentiel)   ── Normalize B        ── 96 lignes ──►┘
```

En placant le join apres les transformations, on opere sur des jeux deja reduits.
Une jointure 96 x 96 est instantanee cote client.

### Pourquoi client-side uniquement

Aucune des APIs supportees ne propose de jointure cross-dataset :

| API | Join natif ? |
|-----|---|
| OpenDataSoft | Non — un dataset a la fois |
| Tabular | Non — endpoint par ressource |
| Grist | Non — SQL mono-table |
| INSEE Melodi | Non — catalogue uniquement |

Le join est donc forcement client-side. Mais combine avec le `server-side` filtering
de `dsfr-data-source`, le volume de donnees transitant sur le reseau est deja reduit
par le serveur avant d'arriver au join.

## Implementation technique

### Architecture du composant

```typescript
@customElement('dsfr-data-join')  // ou dsfr-data-join en attendant le renommage
export class DsfrDataJoin extends LitElement {
  @property() left: string = '';
  @property() right: string = '';
  @property() on: string = '';
  @property({ attribute: 'left-key' }) leftKey: string = '';
  @property({ attribute: 'right-key' }) rightKey: string = '';
  @property() type: 'left' | 'inner' | 'full' = 'left';
  @property() fields: string = '';
  @property({ attribute: 'prefix-right' }) prefixRight: string = '';

  // Donnees jointes en sortie — meme interface que source/query
  get records(): Record<string, unknown>[] { ... }
}
```

### Algorithme de jointure

1. Ecouter les evenements `dsfr-data-loaded` des deux sources (left et right)
2. Quand les deux cotes sont disponibles, construire un index (Map) sur la cle right
3. Iterer sur left, chercher la correspondance dans l'index right
4. Fusionner les champs selon `fields` et `prefix-right`
5. Emettre l'evenement `dsfr-data-loaded` avec le resultat joint

```typescript
private _performJoin(leftData: Row[], rightData: Row[]): Row[] {
  const lk = this.leftKey || this.on;
  const rk = this.rightKey || this.on;

  // Index right par cle — O(n)
  const rightIndex = new Map<string, Row>();
  for (const row of rightData) {
    rightIndex.set(String(row[rk]), row);
  }

  // Jointure — O(m)
  const result: Row[] = [];
  for (const leftRow of leftData) {
    const key = String(leftRow[lk]);
    const rightRow = rightIndex.get(key);

    if (rightRow) {
      result.push(this._mergeRows(leftRow, rightRow));
    } else if (this.type === 'left' || this.type === 'full') {
      result.push({ ...leftRow });
    }
  }

  // Full join : ajouter les lignes right sans correspondance
  if (this.type === 'full') {
    const leftKeys = new Set(leftData.map(r => String(r[lk])));
    for (const rightRow of rightData) {
      if (!leftKeys.has(String(rightRow[rk]))) {
        result.push(this._mergeRows({}, rightRow));
      }
    }
  }

  return result;
}
```

### Complexite

- Indexation right : O(n)
- Jointure : O(m)
- Total : **O(n + m)** — lineaire, performant meme sur des jeux moyens (quelques milliers de lignes)

### Integration dans le pipeline

Le composant doit :
- Implementer la meme interface de sortie que `dsfr-data-source` et `dsfr-data-query` (propriete `records`, evenement `dsfr-data-loaded`)
- Pouvoir etre consomme par n'importe quel composant d'affichage (`dsfr-data-chart`, `dsfr-data-list`, `dsfr-data-kpi`, etc.)
- Re-executer la jointure quand l'une des sources emet de nouvelles donnees (pagination, filtre modifie)

## Tests

### Tests unitaires (`tests/dsfr-data-join.test.ts`)

- [ ] Jointure `inner` — ne garde que les correspondances
- [ ] Jointure `left` — garde toutes les lignes left, null pour right manquant
- [ ] Jointure `full` — garde toutes les lignes des deux cotes
- [ ] Cle commune (`on`) — meme nom des deux cotes
- [ ] Cles differentes (`left-key` / `right-key`)
- [ ] Filtre de champs (`fields`)
- [ ] Prefixe collision (`prefix-right`)
- [ ] Cles manquantes — lignes sans correspondance
- [ ] Cles dupliquees cote right — prend la derniere valeur
- [ ] Sources vides — retourne un tableau vide
- [ ] Re-jointure quand une source emet de nouvelles donnees
- [ ] Performance — 10 000 x 10 000 lignes en < 100ms

### Tests d'integration

- [ ] Pipeline complet : source → query → join → chart
- [ ] Jointure avec sources server-side (ODS + Tabular)
- [ ] Jointure avec normalize en amont
- [ ] Interactions avec facets/search sur une source jointe

## Valeur ajoutee

**Sans join** : l'utilisateur doit telecharger deux CSV, les joindre dans Excel/Python,
reexporter le resultat, et l'injecter dans un composant.

**Avec join** : la jointure est declarative en HTML, executee a la volee dans le navigateur,
et s'integre nativement dans le pipeline de composants.

C'est un **killer feature pour l'interministeriel** : chaque ministere a ses donnees metier,
mais les referentiels (COG INSEE, codes postaux, EPCI, nomenclatures) sont communs. Un join
declaratif evite a chaque equipe de refaire le travail d'enrichissement.

## Labels

`enhancement`, `new-component`, `data-pipeline`
