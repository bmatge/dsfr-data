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

  // Le cas REEL, et celui qu'aucun test ne couvrait : une source venue de
  // l'app Sources porte TOUJOURS sa connexion ET les lignes rapatriees. Les
  // deux tests ci-dessus n'exercent qu'une moitie chacun, et c'est ce qui a
  // laissé passer l'inversion de priorite (le Studio figeait un data='[…]').
  it('une source ODS DEJA CHARGEE reste declarative, sans figer ses lignes', () => {
    const html = generateSourceHTML({
      id: 'prix-ct',
      name: 'Prix CT',
      type: 'api',
      provider: 'opendatasoft',
      apiUrl: 'https://data.example.com/api/explore/v2.1/catalog/datasets/prix-ct/records',
      resourceIds: { datasetId: 'prix-ct' },
      data: [{ cct_siret: '98525263400011', prix_visite: 78 }],
      recordCount: 12000,
    });

    expect(html).toContain('api-type="opendatasoft"');
    expect(html).toContain('dataset-id="prix-ct"');
    expect(html, 'les lignes chargees ne doivent pas etre figees').not.toContain('data=');
    expect(html).not.toContain('98525263400011');
  });

  it('une source Tabular deja chargee reste declarative', () => {
    const html = generateSourceHTML({
      id: 'tab',
      name: 'Tabular',
      type: 'api',
      provider: 'tabular',
      apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc/data/',
      resourceIds: { resourceId: 'abc' },
      data: [{ a: 1 }],
    });

    expect(html).toContain('api-type="tabular"');
    expect(html).not.toContain('data=');
  });

  it('une source Grist chargee reste embarquee — son URL exige une cle', () => {
    // Le repli assumé : emettre l'URL ferait une page publique qui 401.
    const html = generateSourceHTML({
      id: 'grist',
      name: 'Grist',
      type: 'grist',
      provider: 'grist',
      apiUrl: 'https://docs.getgrist.com/api/docs/DOC/tables/T/records',
      apiKey: 'secret-a-ne-jamais-emettre',
      data: [{ a: 1 }],
    });

    expect(html).toContain('data=\'[{"a":1}]\'');
    expect(html, 'la cle ne doit jamais sortir').not.toContain('secret-a-ne-jamais-emettre');
    expect(html).not.toContain('docs.getgrist.com');
  });

  it("une API a en-tetes d'authentification reste embarquee", () => {
    // Les en-tetes ne sont jamais emis ; sans eux la requete echouerait.
    const html = generateSourceHTML({
      id: 'privee',
      name: 'API privée',
      type: 'api',
      provider: 'generic',
      apiUrl: 'https://api.example.com/items',
      headers: '{"Authorization":"Bearer tok"}',
      data: [{ a: 1 }],
    });

    expect(html).toContain('data=');
    expect(html).not.toContain('Bearer');
  });

  it('une API publique generique deja chargee passe en url= dynamique', () => {
    const html = generateSourceHTML({
      id: 'pub',
      name: 'API publique',
      type: 'api',
      provider: 'generic',
      apiUrl: 'https://api.example.com/items',
      dataPath: 'results',
      data: [{ a: 1 }],
    });

    expect(html).toContain('url="https://api.example.com/items"');
    expect(html).toContain('transform="results"');
    expect(html).not.toContain('data=');
  });

  it('une source manuelle JSON/CSV reste embarquee — elle n’a aucune URL', () => {
    const html = generateSourceHTML({
      id: 'm',
      name: 'Manuelle',
      type: 'manual',
      data: [{ a: 1 }],
    });
    expect(html).toContain('data=\'[{"a":1}]\'');
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

  it('une carte agregee garde son champ de code dans le group-by', () => {
    // DEFAUT TROUVE PAR LA RECETTE E2E DES VARIANTES API (#625). La
    // configuration la plus naturelle — « population par region, coloriee par
    // departement » — emettait group-by="region" et code-field="code_dept".
    // Les lignes agregees ne portaient plus que `region` et `population__sum` :
    // le composant ecartait les 137 lignes faute de code geographique et
    // rendait une carte VIDE, sans erreur, sur un HTML bien forme. Aucune
    // assertion de chaine ne pouvait le voir — seul un rendu le pouvait.
    const html = generateWidgetHTML(
      builderWidget({
        type: 'map',
        labelField: 'region',
        valueField: 'population',
        codeField: 'code_dept',
        aggregation: 'sum',
      }),
      dashboardWith([], [SRC])
    );
    expect(html).toContain('group-by="region,code_dept"');
    expect(html).toContain('code-field="code_dept"');
    expect(html).toContain('value-field="population__sum"');
  });

  it('un code identique a l’etiquette n’est pas groupe deux fois', () => {
    const html = generateWidgetHTML(
      builderWidget({
        type: 'map-reg',
        labelField: 'code_reg',
        valueField: 'population',
        codeField: 'code_reg',
        aggregation: 'sum',
      }),
      dashboardWith([], [SRC])
    );
    expect(html).toContain('group-by="code_reg"');
  });

  it('sans agregation, le champ de code ne cree pas de group-by', () => {
    const html = generateWidgetHTML(
      builderWidget({ type: 'map', labelField: 'region', valueField: 'v', codeField: 'dep' }),
      dashboardWith([], [SRC])
    );
    expect(html).not.toContain('dsfr-data-query');
    expect(html).toContain('code-field="dep"');
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

describe('export-html — strategie de chargement (ADR-109, #717)', () => {
  /** Source ODS a adaptateur : la seule forme qui sache paginer cote serveur. */
  const ODS = {
    id: 'ods',
    name: 'Jeu ODS',
    provider: 'opendatasoft',
    apiUrl: 'https://data.example.com/api/explore/v2.1/catalog/datasets/mon-jeu/records',
    resourceIds: { datasetId: 'mon-jeu' },
  };

  const listeWidget = (sourceId = 'ods', id = 'w-liste'): Widget => ({
    id,
    type: 'chart',
    title: 'Tableau',
    position: { row: 0, col: 0 },
    config: {
      fromBuilder: true,
      sourceId,
      chart: {
        type: 'datalist',
        labelField: 'region',
        valueField: 'population',
        colonnes: 'region:Territoire, population:Habitants',
        pagination: 25,
      },
    },
  });

  const graphiqueWidget = (sourceId = 'ods', id = 'w-graphe'): Widget => ({
    id,
    type: 'chart',
    title: 'Graphique',
    position: { row: 1, col: 0 },
    config: {
      fromBuilder: true,
      sourceId,
      chart: {
        type: 'bar',
        labelField: 'region',
        valueField: 'population',
        aggregation: 'sum',
      },
    },
  });

  it('une source a consommateur unique et paginant pagine cote serveur', () => {
    const html = generateDashboardHTML(dashboardWith([listeWidget()], [ODS]));
    expect(html).toContain('server-side page-size="25"');
    expect(html).toContain('<dsfr-data-list source="ods"');
    expect(html).toContain('server-sort');
    // La recherche locale ne verrait que la page chargee : le composant la
    // desactiverait avec un avertissement (#304). Autant ne pas l'offrir.
    expect(html).not.toContain(' search');
    // Les deux strategies s'excluent par construction (#689, ADR-106).
    expect(html).not.toContain('fetch-mode');
  });

  it('un graphique agrege a cote d’une liste recoit sa propre source : la liste pagine, jamais le graphique', () => {
    // L'invariant d'ADR-109 tient toujours : AUCUN graphique agrege ne lit
    // une source paginee cote serveur (il sommerait une page de 25 lignes).
    // Depuis #765, le graphique recoit sa source dediee ; la liste reste seule
    // sur la source partagee, qui devient le cas « un consommateur, une liste
    // paginee » qu'ADR-109 autorise.
    const html = generateDashboardHTML(dashboardWith([listeWidget(), graphiqueWidget()], [ODS]));
    const balises = html.split('<dsfr-data-source').slice(1);
    const partagee = balises.find((b) => b.includes('id="ods"'));
    const dediee = balises.find((b) => b.includes('id="ods--w-graphe"'));
    expect(partagee).toContain('server-side');
    expect(dediee).toBeDefined();
    expect(dediee).not.toContain('server-side');
    expect(html).toContain('<dsfr-data-query id="q-w-graphe" source="ods--w-graphe"');
    expect(html).toContain('server-sort');
  });

  it('une source dont le seul consommateur agrege ne pagine pas cote serveur', () => {
    const html = generateDashboardHTML(dashboardWith([graphiqueWidget()], [ODS]));
    expect(html).not.toContain('server-side');
  });

  it('une source pilotee par un contexte ne pagine pas cote serveur', () => {
    // Le filtrage de `dsfr-data-context` est CLIENT : il ne saurait filtrer
    // que la page chargee.
    const filtres: Widget = {
      id: 'f1',
      type: 'filters',
      title: 'Filtres',
      position: { row: 0, col: 0 },
      config: { filters: [{ field: 'region', operator: 'eq', options: ['IDF'] }] },
    };
    const html = generateDashboardHTML(dashboardWith([filtres, listeWidget()], [ODS]));
    expect(html).toContain('<dsfr-data-context id="ctx-f1" sources="ods">');
    expect(html).not.toContain('server-side');
  });

  it('une liste agregee ou limitee lit des groupes, pas des lignes : pas de pagination serveur', () => {
    const agregee = { ...listeWidget() } as Widget & { type: 'chart' };
    const html = generateDashboardHTML(
      dashboardWith(
        [
          {
            ...agregee,
            config: {
              fromBuilder: true,
              sourceId: 'ods',
              chart: {
                type: 'datalist',
                labelField: 'region',
                valueField: 'population',
                aggregation: 'sum',
              },
            },
          },
        ],
        [ODS]
      )
    );
    // ODS annonce la taille de page et non le nombre de groupes sur un
    // group_by (#641) : le total de pages serait faux.
    expect(html).not.toContain('server-side');
  });

  it('une source embarquee ou generique ne pagine pas cote serveur', () => {
    const embarquee = generateDashboardHTML(dashboardWith([listeWidget('src-1')], [SRC]));
    expect(embarquee).not.toContain('server-side');

    const generique = generateDashboardHTML(
      dashboardWith([listeWidget('api')], [{ id: 'api', name: 'API', apiUrl: 'https://x.test/i' }])
    );
    expect(generique).not.toContain('server-side');
  });

  it('un tableau branche sur sa propre source pagine aussi cote serveur', () => {
    const table: Widget = {
      id: 't1',
      type: 'table',
      title: 'Tableau',
      position: { row: 0, col: 0 },
      config: { columns: ['region'], searchable: true, sortable: true, sourceId: 'ods' },
    };
    const html = generateDashboardHTML(dashboardWith([table], [ODS]));
    expect(html).toContain('server-side page-size="10"');
    expect(html).toContain('server-sort');
    expect(html).not.toContain(' search');
  });

  it('deux sources cote a cote : chaque liste seule sur sa source pagine, le graphique a la sienne', () => {
    const AUTRE = { ...ODS, id: 'ods-2' };
    const html = generateDashboardHTML(
      dashboardWith(
        [listeWidget('ods'), listeWidget('ods-2', 'w-liste-2'), graphiqueWidget('ods-2')],
        [ODS, AUTRE]
      )
    );
    const balises = html.split('<dsfr-data-source').slice(1);
    expect(balises.find((b) => b.includes('id="ods"'))).toContain('server-side');
    expect(balises.find((b) => b.includes('id="ods-2"'))).toContain('server-side');
    expect(balises.find((b) => b.includes('id="ods-2--w-graphe"'))).not.toContain('server-side');
  });
});

describe('export-html — une source dediee par graphique agrege partage (#765)', () => {
  // Mesure en conditions reelles (export Studio, plan-de-relance, 0.28.1) :
  // une query group-by deleguee reecrivait la source partagee — KPI a 11 au
  // lieu de 3 080, et le graphique « par region » affichait les groupes du
  // graphique « par type ».
  const ODS = {
    id: 'ods',
    name: 'Jeu ODS',
    provider: 'opendatasoft',
    apiUrl: 'https://data.example.com/api/explore/v2.1/catalog/datasets/mon-jeu/records',
    resourceIds: { datasetId: 'mon-jeu' },
  };
  const chart = (id: string, labelField: string, extra: Partial<ChartConfig> = {}): Widget => ({
    id,
    type: 'chart',
    title: id,
    position: { row: 0, col: 0 },
    config: {
      fromBuilder: true,
      sourceId: 'ods',
      chart: { type: 'bar', labelField, valueField: 'population', aggregation: 'sum', ...extra },
    },
  });
  const kpi: Widget = {
    id: 'k',
    type: 'chart',
    title: 'Total',
    position: { row: 0, col: 0 },
    config: {
      fromBuilder: true,
      sourceId: 'ods',
      chart: { type: 'kpi', valueField: 'population', aggregation: 'sum' },
    },
  };
  const sourcesOf = (html: string) =>
    [...html.matchAll(/<dsfr-data-source id="([^"]+)"/g)].map((m) => m[1]);

  it('KPI + deux graphiques agreges : le KPI et le second graphique ont leur source, le premier garde la partagee', () => {
    // Le KPI a sa source a agregat serveur (#810) ; restent deux graphiques
    // sur la partagee, dont le premier la garde (#765).
    const html = generateDashboardHTML(
      dashboardWith([kpi, chart('reg', 'region'), chart('typ', 'type')], [ODS])
    );
    expect(sourcesOf(html).sort()).toEqual(['ods', 'ods--k', 'ods--typ']);
    expect(html).toContain('<dsfr-data-query id="q-reg" source="ods"');
    expect(html).toContain('<dsfr-data-query id="q-typ" source="ods--typ"');
    // Meme jeu : la source dediee reprend la connexion de la partagee
    expect(html).toMatch(
      /id="ods--typ" api-type="opendatasoft"\s+base-url="https:\/\/data\.example\.com"\s+dataset-id="mon-jeu"/
    );
  });

  it('deux graphiques agreges seuls : le premier garde la source partagee (pas de requete inutile)', () => {
    const html = generateDashboardHTML(
      dashboardWith([chart('reg', 'region'), chart('typ', 'type')], [ODS])
    );
    expect(sourcesOf(html).sort()).toEqual(['ods', 'ods--typ']);
    expect(html).toContain('<dsfr-data-query id="q-reg" source="ods"');
  });

  it('un graphique agrege seul sur sa source la garde', () => {
    const html = generateDashboardHTML(dashboardWith([chart('reg', 'region')], [ODS]));
    expect(sourcesOf(html)).toEqual(['ods']);
  });

  it('les filtres partages visent aussi les sources dediees', () => {
    const filtres: Widget = {
      id: 'f1',
      type: 'filters',
      title: 'Filtres',
      position: { row: 0, col: 0 },
      config: { filters: [{ field: 'region', operator: 'eq', options: ['IDF'] }] },
    };
    const html = generateDashboardHTML(
      dashboardWith([filtres, kpi, chart('reg', 'region')], [ODS])
    );
    // Le KPI a sa source dediee (#810), le graphique seul lecteur garde la
    // partagee : le contexte vise les deux.
    expect(html).toContain('<dsfr-data-context id="ctx-f1" sources="ods ods--k">');
  });

  it('une source embarquee n’est jamais dupliquee (elle ne delegue rien)', () => {
    const EMBARQUEE = { id: 'ods', name: 'Saisie', data: [{ region: 'IDF', population: 1 }] };
    const html = generateDashboardHTML(
      dashboardWith([kpi, chart('reg', 'region'), chart('typ', 'type')], [EMBARQUEE])
    );
    expect(sourcesOf(html)).toEqual(['ods']);
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

describe('export-html — KPI calculé par le serveur (#810)', () => {
  // Mesuré dans un navigateur (export Studio, plan-de-relance, 3 080 lignes) :
  // un KPI de comptage sur la source partagée affichait 1 000, le plafond de
  // max-records, puisqu'il comptait les lignes chargées par /records.
  const ODS = {
    id: 'ods',
    name: 'Jeu ODS',
    provider: 'opendatasoft',
    apiUrl: 'https://data.example.com/api/explore/v2.1/catalog/datasets/mon-jeu/records',
    resourceIds: { datasetId: 'mon-jeu' },
  };
  const TABULAR = {
    id: 'tab',
    name: 'Jeu Tabular',
    provider: 'tabular',
    apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc/data/',
    resourceIds: { resourceId: 'abc' },
  };
  const kpiOn = (sourceId: string, chart: Partial<ChartConfig>, id = 'k'): Widget => ({
    id,
    type: 'chart',
    title: 'KPI',
    position: { row: 0, col: 0 },
    config: {
      fromBuilder: true,
      sourceId,
      chart: { type: 'kpi', valueField: 'montant', ...chart },
    },
  });
  const sourcesOf = (html: string) =>
    [...html.matchAll(/<dsfr-data-source id="([^"]+)"/g)].map((m) => m[1]);

  it('comptage ODS : count(*) par le serveur, le KPI lit la colonne', () => {
    const html = generateDashboardHTML(
      dashboardWith([kpiOn('ods', { valueField: 'entreprise', aggregation: 'count' })], [ODS])
    );
    expect(html).toContain('select="count(*) as entreprise__count"');
    expect(html).toContain('<dsfr-data-kpi source="ods--k" value="entreprise__count"');
    // Seul lecteur remplacé : la source partagée n'est plus émise (pas de requête pour rien)
    expect(sourcesOf(html)).toEqual(['ods--k']);
  });

  it('somme, moyenne, min, max : l’agrégat est aussi calculé par le serveur', () => {
    for (const fn of ['sum', 'avg', 'min', 'max'] as const) {
      const html = generateDashboardHTML(dashboardWith([kpiOn('ods', { aggregation: fn })], [ODS]));
      expect(html, fn).toContain(`select="${fn}(montant) as montant__${fn}"`);
      expect(html, fn).toContain(`value="montant__${fn}"`);
    }
  });

  it('le filtre propre du KPI passe sur sa source, traduit en ODSQL, sans query', () => {
    const html = generateDashboardHTML(
      dashboardWith([kpiOn('ods', { aggregation: 'sum', where: 'statut:eq:ouvert' })], [ODS])
    );
    expect(html).toContain('where="statut = &quot;ouvert&quot;"');
    expect(html).not.toContain('<dsfr-data-query');
  });

  it('un champ à espaces est échappé dans le select', () => {
    const html = generateDashboardHTML(
      dashboardWith([kpiOn('ods', { valueField: 'Montant total', aggregation: 'sum' })], [ODS])
    );
    expect(html).toContain('select="sum(`Montant total`) as `Montant total__sum`"');
    expect(html).toContain('value="Montant total__sum"');
  });

  it('la source partagée reste émise quand un autre widget en lit les lignes', () => {
    const liste: Widget = {
      id: 'l',
      type: 'chart',
      title: 'Liste',
      position: { row: 1, col: 0 },
      config: {
        fromBuilder: true,
        sourceId: 'ods',
        chart: { type: 'datalist', labelField: 'x', valueField: 'y' },
      },
    };
    const html = generateDashboardHTML(
      dashboardWith([kpiOn('ods', { aggregation: 'sum' }), liste], [ODS])
    );
    expect(sourcesOf(html).sort()).toEqual(['ods', 'ods--k']);
  });

  it('comptage Tabular : le total annoncé par l’API (meta:total)', () => {
    const html = generateDashboardHTML(
      dashboardWith([kpiOn('tab', { aggregation: 'count' })], [TABULAR])
    );
    expect(html).toContain('<dsfr-data-kpi source="tab" value="meta:total"');
  });

  it('une source embarquée garde son KPI tel quel (les lignes sont toutes là)', () => {
    const EMB = { id: 'emb', name: 'Saisie', data: [{ montant: 1 }] };
    const html = generateDashboardHTML(
      dashboardWith([kpiOn('emb', { aggregation: 'sum' })], [EMB])
    );
    expect(html).toContain('<dsfr-data-kpi source="emb" value="montant:sum"');
  });
});
