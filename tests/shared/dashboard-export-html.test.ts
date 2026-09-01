/**
 * Export HTML vivant d'un dashboard multi-blocs (#515).
 *
 * Verifie la traduction deterministe modele -> balises dsfr-data-* :
 * emission des sources, pipeline query des widgets fromBuilder (convention
 * d'alias `field__fn`), filtres partages (selects + context + tags), et le
 * choix du bundle (core sauf carte).
 */
import { describe, it, expect } from 'vitest';
import {
  generateDashboardHTML,
  generateWidgetHTML,
  generateSourceHTML,
} from '../../packages/shared/src/dashboard/export-html';
import { createEmptyDashboard } from '../../packages/shared/src/dashboard/model';
import type { DashboardData, Widget } from '../../packages/shared/src/dashboard/model';
import type { ChartConfig } from '../../packages/shared/src/dashboard/chart-config';

function dashboardWith(widgets: Widget[], sources: DashboardData['sources'] = []): DashboardData {
  return { ...createEmptyDashboard(), name: 'Test', widgets, sources };
}

const builderWidget = (chart: ChartConfig, sourceId = 'src-1'): Widget => ({
  id: 'w1',
  type: 'chart',
  title: 'Mon graphique',
  position: { row: 0, col: 0 },
  config: { fromBuilder: true, chart, sourceId },
});

const SRC = { id: 'src-1', name: 'Données', data: [{ region: 'IDF', population: 12000 }] };

describe('export-html — sources', () => {
  it('embarque les donnees chargees en attribut data inline', () => {
    const html = generateSourceHTML(SRC);
    expect(html).toContain('<dsfr-data-source id="src-1"');
    expect(html).toContain('data=\'[{"region":"IDF","population":12000}]\'');
  });

  it('emet une source ODS declarative (api-type + base-url + dataset-id)', () => {
    const html = generateSourceHTML({
      id: 'ods',
      name: 'ODS',
      provider: 'opendatasoft',
      apiUrl: 'https://data.example.com/api/explore/v2.1/catalog/datasets/mon-jeu/records',
      resourceIds: { datasetId: 'mon-jeu' },
    });
    expect(html).toContain('api-type="opendatasoft"');
    expect(html).toContain('base-url="https://data.example.com"');
    expect(html).toContain('dataset-id="mon-jeu"');
  });

  it('retombe sur url= pour une API generique', () => {
    const html = generateSourceHTML({
      id: 'api',
      name: 'API',
      apiUrl: 'https://api.example.com/items',
      dataPath: 'results',
    });
    expect(html).toContain('url="https://api.example.com/items"');
    expect(html).toContain('transform="results"');
  });

  it("n'emet les sources que si un widget les reference", () => {
    const chart: ChartConfig = { type: 'bar', valueField: 'population' };
    const html = generateDashboardHTML(
      dashboardWith(
        [builderWidget(chart)],
        [SRC, { id: 'inutilisee', name: 'X', data: [{ a: 1 }] }]
      )
    );
    expect(html).toContain('id="src-1"');
    expect(html).not.toContain('inutilisee');
  });
});

describe('export-html — widget fromBuilder', () => {
  it('sans where/aggregation, le chart consomme la source directement', () => {
    const chart: ChartConfig = { type: 'line', labelField: 'mois', valueField: 'total' };
    const html = generateWidgetHTML(builderWidget(chart), dashboardWith([], [SRC]));
    expect(html).not.toContain('dsfr-data-query');
    expect(html).toContain('<dsfr-data-chart source="src-1" type="line"');
    expect(html).toContain('label-field="mois"');
    expect(html).toContain('value-field="total"');
  });

  it('avec aggregation, emet une query group-by/aggregate et le chart lit l’alias field__fn', () => {
    const chart: ChartConfig = {
      type: 'bar',
      labelField: 'region',
      valueField: 'population',
      aggregation: 'sum',
      sortOrder: 'desc',
      limit: 10,
      where: 'annee:eq:2024',
    };
    const html = generateWidgetHTML(builderWidget(chart), dashboardWith([], [SRC]));
    expect(html).toContain('<dsfr-data-query id="q-w1" source="src-1"');
    expect(html).toContain('where="annee:eq:2024"');
    expect(html).toContain('group-by="region"');
    expect(html).toContain('aggregate="population:sum"');
    expect(html).toContain('order-by="population__sum:desc"');
    expect(html).toContain('limit="10"');
    expect(html).toContain('<dsfr-data-chart source="q-w1"');
    expect(html).toContain('value-field="population__sum"');
  });

  it('un KPI agrege via sa grammaire value="champ:fn" (pas de group-by en query)', () => {
    const chart: ChartConfig = {
      type: 'kpi',
      valueField: 'population',
      aggregation: 'sum',
      title: 'Population totale',
      unit: 'hab.',
      variant: 'success',
      where: 'annee:eq:2024',
    };
    const html = generateWidgetHTML(builderWidget(chart), dashboardWith([], [SRC]));
    expect(html).toContain('<dsfr-data-query id="q-w1" source="src-1" where="annee:eq:2024"');
    expect(html).not.toContain('group-by');
    expect(html).toContain('<dsfr-data-kpi source="q-w1" value="population:sum"');
    expect(html).toContain('label="Population totale"');
    expect(html).toContain('color-token="vert"');
  });

  it('horizontalBar et doughnut sont traduits au vocabulaire du composant', () => {
    const hbar = generateWidgetHTML(
      builderWidget({ type: 'horizontalBar', labelField: 'a', valueField: 'b' }),
      dashboardWith([], [SRC])
    );
    expect(hbar).toContain('type="bar"');
    expect(hbar).toContain(' horizontal');

    const doughnut = generateWidgetHTML(
      builderWidget({ type: 'doughnut', labelField: 'a', valueField: 'b' }),
      dashboardWith([], [SRC])
    );
    expect(doughnut).toContain('type="pie"');
    expect(doughnut).not.toContain(' fill');
  });

  it('datalist et podium utilisent leurs composants dedies', () => {
    const list = generateWidgetHTML(
      builderWidget({ type: 'datalist', valueField: 'nom', colonnes: 'nom:Nom, ville:Ville' }),
      dashboardWith([], [SRC])
    );
    expect(list).toContain('<dsfr-data-list source="src-1"');
    expect(list).toContain('columns="nom:Nom, ville:Ville"');

    const podium = generateWidgetHTML(
      builderWidget({ type: 'podium', labelField: 'nom', valueField: 'score', limit: 3 }),
      dashboardWith([], [SRC])
    );
    expect(podium).toContain('<dsfr-data-podium source="q-w1"');
    expect(podium).toContain('max-items="3"');
  });

  it('sans source associee, emet un commentaire explicite plutot qu’un pipeline casse', () => {
    const html = generateWidgetHTML(
      builderWidget({ type: 'bar', valueField: 'x' }, ''),
      dashboardWith([], [])
    );
    expect(html).toContain('aucune source associee');
    expect(html).not.toContain('dsfr-data-chart');
  });
});

describe('export-html — filtres partages', () => {
  const filtersWidget: Widget = {
    id: 'f1',
    type: 'filters',
    title: 'Filtres',
    position: { row: 0, col: 0 },
    config: {
      filters: [
        { field: 'region', label: 'Région', operator: 'in', options: ['IDF', 'PACA'] },
        { field: 'annee', operator: 'eq', options: ['2023', '2024'] },
      ],
    },
  };

  it('rend selects DSFR + dsfr-data-context + tags, cables sur toutes les sources', () => {
    const dash = dashboardWith(
      [filtersWidget, builderWidget({ type: 'bar', valueField: 'x' })],
      [SRC]
    );
    const html = generateWidgetHTML(filtersWidget, dash);
    expect(html).toContain('<select class="fr-select" id="flt-f1-region" multiple>');
    expect(html).toContain('<option value="IDF">IDF</option>');
    expect(html).toContain('<select class="fr-select" id="flt-f1-annee">');
    expect(html).toContain('<dsfr-data-context id="ctx-f1" sources="src-1">');
    expect(html).toContain(
      '<dsfr-data-context-filter field="region" operator="in" ui="flt-f1-region" label="Région">'
    );
    expect(html).toContain('<dsfr-data-context-tags for="ctx-f1">');
  });

  it('cible les sourceIds explicites quand ils sont fournis', () => {
    const scoped: Widget = {
      ...filtersWidget,
      config: { ...filtersWidget.config, sourceIds: ['src-2'] },
    };
    const html = generateWidgetHTML(scoped, dashboardWith([], [SRC]));
    expect(html).toContain('sources="src-2"');
  });
});

describe('export-html — page complete', () => {
  it('reste sur le bundle core sans carte, passe au bundle complet avec carte', () => {
    const noMap = generateDashboardHTML(
      dashboardWith([builderWidget({ type: 'bar', valueField: 'x' })], [SRC])
    );
    expect(noMap).toContain('dsfr-data.core.esm.js');

    const withMap = generateDashboardHTML(
      dashboardWith([builderWidget({ type: 'map', valueField: 'x', codeField: 'dep' })], [SRC])
    );
    expect(withMap).toContain('/dsfr-data.esm.js');
  });

  it('emet titre, chapo et echappe le HTML', () => {
    const dash = dashboardWith([], []);
    dash.name = 'Mon <dashboard>';
    dash.description = 'Chapô & contexte';
    const html = generateDashboardHTML(dash);
    expect(html).toContain('<h1>Mon &lt;dashboard&gt;</h1>');
    expect(html).toContain('<p class="fr-text--lead">Chapô &amp; contexte</p>');
  });
});
