/**
 * #1225 — l'export d'un tableau sur une source Tabular ne demande que les
 * colonnes lues (reprise de #985, parti avec l'ancien Assistant IA en #1217).
 *
 * L'export pose `select` sur la balise de source ; l'adaptateur Tabular le
 * traduit en `columns=`. Une source n'est emise qu'UNE fois : le `select` vaut
 * pour tous ses consommateurs, d'ou la regle — chacun doit savoir enumerer ses
 * colonnes, et aucun ne doit chercher dans toute la ligne.
 *
 * Les quatre premiers cas sont ceux de `tests/apps/builder-ia/tabular-select.test.ts`
 * (commit d3c3d88f), transposes : dans l'export, le tri d'un tableau porte sur
 * `valueField`, pas sur `labelField`.
 */
import { describe, it, expect } from 'vitest';
import {
  generateDashboardHTML,
  tabularProjectedSources,
} from '../../packages/shared/src/dashboard/export-html';
import { createEmptyDashboard } from '../../packages/shared/src/dashboard/model';
import type {
  DashboardData,
  DashboardSource,
  Widget,
} from '../../packages/shared/src/dashboard/model';
import type { ChartConfig } from '../../packages/shared/src/dashboard/chart-config';

const LIGNE = { nom: 'Durand', 'Code sexe': 'F', "Libellé de l'élu": 'Maire', region: 'Bretagne' };

const TABULAR: DashboardSource = {
  id: 'tab',
  name: 'Élus',
  type: 'api',
  provider: 'tabular',
  apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc/data/',
  resourceIds: { resourceId: 'abc' },
  data: [LIGNE],
};

const doc = (widgets: Widget[], sources: DashboardSource[] = [TABULAR]): DashboardData => ({
  ...createEmptyDashboard(),
  name: 'Test',
  widgets,
  sources,
});

const bloc = (id: string, chart: Partial<ChartConfig>, rang = 0): Widget => ({
  id,
  type: 'chart',
  title: id,
  position: { row: rang, col: 0 },
  config: {
    fromBuilder: true,
    sourceId: 'tab',
    chart: { type: 'datalist', valueField: '', ...chart },
  },
});

const tableau = (
  id: string,
  columns: string[],
  searchable: boolean,
  rang = 0
): Widget & { type: 'table' } => ({
  id,
  type: 'table',
  title: id,
  position: { row: rang, col: 0 },
  config: { columns, searchable, sortable: false, sourceId: 'tab' },
});

const filtres = (champ: string, rang = 0): Widget => ({
  id: 'f',
  type: 'filters',
  title: 'Filtres',
  position: { row: rang, col: 0 },
  config: { filters: [{ field: champ, operator: 'eq', options: ['Bretagne'] }] },
});

/** Le `select` pose sur la source `tab`, ou undefined. */
const selectDe = (d: DashboardData): string | undefined => tabularProjectedSources(d).get('tab');

/** La balise de la source `id` dans le document exporte. */
const baliseSource = (d: DashboardData, id = 'tab'): string => {
  const html = generateDashboardHTML(d);
  const debut = html.indexOf(`<dsfr-data-source id="${id}"`);
  return debut === -1 ? '' : html.slice(debut, html.indexOf('</dsfr-data-source>', debut));
};

describe('#1225 — select de la source Tabular d’un tableau', () => {
  it('colonnes de la liste et champ de tri, noms à espaces et apostrophe échappés', () => {
    const d = doc([
      bloc('t', {
        colonnes: "nom:Nom, Libellé de l'élu:Libellé, Code sexe:Sexe",
        valueField: 'region',
        sortOrder: 'asc',
      }),
    ]);
    const balise = baliseSource(d);
    expect(balise).toContain('select="nom, Libellé de l&#039;élu, Code sexe, region"');
    // Le tableau est seul lecteur : la source pagine côté serveur, sans recherche locale.
    expect(balise).toContain('server-side');
    expect(generateDashboardHTML(d)).not.toContain(' search');
  });

  it('sans colonnes choisies (le tableau affiche tout) : pas de select', () => {
    const d = doc([bloc('t', {})]);
    expect(selectDe(d)).toBeUndefined();
    expect(baliseSource(d)).not.toContain('select=');
  });

  it('un nom inconnu de la source (inventé par le modèle) : pas de select', () => {
    expect(selectDe(doc([bloc('t', { colonnes: 'nom:Nom, population:Pop' })]))).toBeUndefined();
  });

  it('le champ de valeur ne compte que s’il sert au tri ; le champ de libellé, jamais', () => {
    const d = doc([bloc('t', { colonnes: 'nom:Nom', valueField: 'region', labelField: 'region' })]);
    expect(selectDe(d)).toBe('nom');
  });

  it('le champ du filtre du tableau est lu aussi', () => {
    const d = doc([bloc('t', { colonnes: 'nom:Nom', where: 'region:eq:Bretagne' })]);
    expect(selectDe(d)).toBe('nom, region');
    // Un filtre multi-champs (`a|b:contains:x`, #1026) lit chacun de ses champs.
    const multi = doc([bloc('t', { colonnes: 'nom:Nom', where: 'region|Code sexe:contains:B' })]);
    expect(selectDe(multi)).toBe('nom, region, Code sexe');
  });

  it('un filtre illisible ou sur un champ inconnu : pas de select', () => {
    expect(selectDe(doc([bloc('t', { colonnes: 'nom:Nom', where: 'region' })]))).toBeUndefined();
    expect(
      selectDe(doc([bloc('t', { colonnes: 'nom:Nom', where: 'ville:eq:Brest' })]))
    ).toBeUndefined();
  });

  it('source sans lignes chargées (champs inconnus) : pas de select', () => {
    const { data: _data, ...sansLignes } = TABULAR;
    expect(selectDe(doc([bloc('t', { colonnes: 'nom:Nom' })], [sansLignes]))).toBeUndefined();
  });

  it('un nom que `select` ne sait pas porter (virgule, forme d’expression) : pas de select', () => {
    const source = { ...TABULAR, data: [{ nom: 'a', 'sum(x)': 1, 'a, b': 2 }] };
    expect(selectDe(doc([bloc('t', { colonnes: 'nom:Nom, sum(x):Somme' })], [source]))).toBe(
      undefined
    );
    // Une parenthèse précédée d'une espace est un nom de colonne, pas une fonction.
    const lng = { ...TABULAR, data: [{ nom: 'a', 'Stock (m3)': 1 }] };
    expect(selectDe(doc([bloc('t', { colonnes: 'nom:Nom, Stock (m3):Stock' })], [lng]))).toBe(
      'nom, Stock (m3)'
    );
  });

  it('une source Opendatasoft n’est pas concernée', () => {
    const ods: DashboardSource = {
      ...TABULAR,
      provider: 'opendatasoft',
      apiUrl: 'https://data.example.com/api/explore/v2.1/catalog/datasets/elus/records',
      resourceIds: { datasetId: 'elus' },
    };
    const d = doc([bloc('t', { colonnes: 'nom:Nom' })], [ods]);
    expect(selectDe(d)).toBeUndefined();
    expect(baliseSource(d)).not.toContain('select=');
  });

  it('un tableau agrégé ou limité lit le jeu entier : pas de select', () => {
    expect(selectDe(doc([bloc('t', { colonnes: 'nom:Nom', limit: 5 })]))).toBeUndefined();
    expect(
      selectDe(
        doc([
          bloc('t', {
            colonnes: 'region:Région',
            labelField: 'region',
            valueField: 'nom',
            aggregation: 'count',
          }),
        ])
      )
    ).toBeUndefined();
  });
});

describe('#1225 — source PARTAGÉE : le select couvre tous les consommateurs, ou n’est pas posé', () => {
  const liste = bloc('t', { colonnes: 'nom:Nom' }, 1);

  it('tableau + graphique non agrégé sur la même source : pas de select', () => {
    const graphique = bloc('g', { type: 'bar', labelField: 'region', valueField: 'Code sexe' });
    const d = doc([graphique, liste]);
    expect(selectDe(d)).toBeUndefined();
    expect(baliseSource(d)).not.toContain('select=');
  });

  it('tableau + KPI sur la même source : pas de select', () => {
    const kpi = bloc('k', { type: 'kpi', valueField: 'nom', aggregation: 'count' });
    expect(selectDe(doc([kpi, liste]))).toBeUndefined();
  });

  it('tableau + carte, tableau + composant libre : pas de select', () => {
    const carte: Widget = {
      id: 'c',
      type: 'map',
      title: 'Carte',
      position: { row: 0, col: 0 },
      config: { layers: [{ sourceId: 'tab', type: 'marker', latField: 'lat', lonField: 'lon' }] },
    };
    expect(selectDe(doc([carte, liste]))).toBeUndefined();
    const libre: Widget = {
      id: 'l',
      type: 'component',
      title: 'Libre',
      position: { row: 0, col: 0 },
      config: {
        components: [
          {
            tag: 'dsfr-data-list',
            attributes: [
              { name: 'source', value: 'tab' },
              { name: 'columns', value: 'region:Région' },
              { name: 'pagination', value: '10' },
            ],
          },
        ],
      },
    };
    expect(selectDe(doc([libre, liste]))).toBeUndefined();
    // Seul lecteur, un composant libre n'énumère pas ses colonnes non plus.
    expect(selectDe(doc([libre]))).toBeUndefined();
  });

  it('tableau + graphique AGRÉGÉ : le graphique a sa source dédiée sans select, le tableau garde le sien', () => {
    const graphique = bloc('g', {
      type: 'bar',
      labelField: 'region',
      valueField: 'Code sexe',
      aggregation: 'count',
    });
    const d = doc([graphique, liste]);
    expect(baliseSource(d, 'tab')).toContain('select="nom"');
    const dediee = baliseSource(d, 'tab--g');
    expect(dediee).toContain('api-type="tabular"');
    expect(dediee).not.toContain('select=');
  });

  it('deux tableaux de l’assistant : la recherche locale lit toute la ligne, pas de select', () => {
    const d = doc([
      bloc('a', { colonnes: 'nom:Nom' }),
      bloc('b', { colonnes: 'region:Région' }, 1),
    ]);
    expect(selectDe(d)).toBeUndefined();
    expect(generateDashboardHTML(d)).toContain(' search');
  });

  it('deux tableaux sans recherche : l’union de leurs colonnes', () => {
    const d = doc([tableau('a', ['nom'], false), tableau('b', ['region:Région', 'nom'], false, 1)]);
    expect(selectDe(d)).toBe('nom, region');
    expect(baliseSource(d)).not.toContain('server-side');
  });

  it('deux tableaux dont un avec recherche, ou un qui affiche tout : pas de select', () => {
    expect(
      selectDe(doc([tableau('a', ['nom'], false), tableau('b', ['region'], true, 1)]))
    ).toBeUndefined();
    expect(
      selectDe(doc([tableau('a', ['nom'], false), tableau('b', [], false, 1)]))
    ).toBeUndefined();
  });

  it('tableau du Tableau de bord, seul lecteur : ses colonnes, recherche ou non (pagination serveur)', () => {
    const d = doc([tableau('a', ['nom', 'region'], true)]);
    expect(baliseSource(d)).toContain('select="nom, region"');
    expect(baliseSource(d)).toContain('server-side');
  });

  it('bloc de filtres + tableau sans recherche : le champ filtré entre dans le select', () => {
    const d = doc([filtres('region'), tableau('a', ['nom'], false, 1)]);
    expect(selectDe(d)).toBe('region, nom');
  });

  it('bloc de filtres + tableau de l’assistant : recherche locale, pas de select', () => {
    expect(selectDe(doc([filtres('region'), liste]))).toBeUndefined();
  });
});
