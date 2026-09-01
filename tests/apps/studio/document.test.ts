/**
 * Couche document du studio (#515) : actions incrementales deterministes sur
 * la DashboardData partagee — ajout batch, placement en grille, mise a jour,
 * suppression/compactage, deplacement, options de filtres remplies par l'app.
 */
import { describe, it, expect } from 'vitest';
import { createEmptyDashboard } from '@dsfr-data/shared';
import {
  addBlocks,
  updateBlock,
  removeBlock,
  moveBlock,
  setPage,
  describeDocument,
  defaultWidth,
  nextBlockId,
  type DocumentContext,
} from '../../../apps/studio/src/document';

const DATA = [
  { region: 'IDF', annee: 2023, population: 12000 },
  { region: 'PACA', annee: 2023, population: 5000 },
  { region: 'IDF', annee: 2024, population: 12500 },
];

const ctx: DocumentContext = {
  data: DATA,
  fields: [
    { name: 'region', type: 'texte', sample: 'IDF' },
    { name: 'annee', type: 'numérique', sample: 2023 },
    { name: 'population', type: 'numérique', sample: 12000 },
  ],
  sourceId: 'src-1',
};

describe('studio/document — add_blocks', () => {
  it('ajoute un batch texte + kpi + chart avec placement automatique', () => {
    const doc = createEmptyDashboard();
    const outcome = addBlocks(
      doc,
      [
        { kind: 'text', content: 'Chapô du dashboard', style: 'paragraph' },
        {
          kind: 'chart',
          title: 'Total',
          config: { type: 'kpi', valueField: 'population', aggregation: 'sum' },
        },
        {
          kind: 'chart',
          title: 'Par région',
          config: {
            type: 'bar',
            labelField: 'region',
            valueField: 'population',
            aggregation: 'sum',
          },
        },
      ],
      ctx
    );
    expect(outcome.ok).toBe(true);
    expect(doc.widgets).toHaveLength(3);
    expect(doc.widgets.map((w) => w.id)).toEqual(['b1', 'b2', 'b3']);

    // text = full (ligne seule), kpi = third, chart = half : trois lignes.
    expect(doc.widgets[0].position).toEqual({ row: 0, col: 0 });
    expect(doc.widgets[1].position).toEqual({ row: 1, col: 0 });
    expect(doc.widgets[2].position).toEqual({ row: 2, col: 0 });
    expect(doc.layout.rowColumns).toEqual({ 0: 1, 1: 3, 2: 2 });

    // Le texte brut est enveloppe en <p>.
    const text = doc.widgets[0];
    if (text.type !== 'text') throw new Error('text attendu');
    expect(text.config.content).toBe('<p>Chapô du dashboard</p>');

    // Le chart porte la ChartConfig complete + la source.
    const chart = doc.widgets[2];
    if (chart.type !== 'chart' || !('chart' in chart.config))
      throw new Error('fromBuilder attendu');
    expect(chart.config.sourceId).toBe('src-1');
    expect(chart.config.chart.aggregation).toBe('sum');
  });

  it('complete une ligne de meme largeur avant d’en ouvrir une nouvelle', () => {
    const doc = createEmptyDashboard();
    addBlocks(
      doc,
      [
        { kind: 'chart', config: { type: 'kpi', valueField: 'population' }, width: 'third' },
        { kind: 'chart', config: { type: 'kpi', valueField: 'annee' }, width: 'third' },
        {
          kind: 'chart',
          config: { type: 'kpi', valueField: 'population', aggregation: 'avg' },
          width: 'third',
        },
        {
          kind: 'chart',
          config: { type: 'kpi', valueField: 'annee', aggregation: 'max' },
          width: 'third',
        },
      ],
      ctx
    );
    const rows = doc.widgets.map((w) => w.position.row);
    expect(rows).toEqual([0, 0, 0, 1]);
  });

  it('refuse un chart dont le champ n’existe pas (diagnostic renvoye au modele)', () => {
    const doc = createEmptyDashboard();
    const outcome = addBlocks(
      doc,
      [{ kind: 'chart', config: { type: 'bar', labelField: 'region', valueField: 'inconnu' } }],
      ctx
    );
    expect(outcome.ok).toBe(false);
    expect(doc.widgets).toHaveLength(0);
    expect(outcome.summary).toContain('inconnu');
  });

  it('remplit les options des filtres depuis les donnees (jamais par le LLM)', () => {
    const doc = createEmptyDashboard();
    const outcome = addBlocks(doc, [{ kind: 'filters', fields: ['region'] }], ctx);
    expect(outcome.ok).toBe(true);
    const w = doc.widgets[0];
    if (w.type !== 'filters') throw new Error('filters attendu');
    expect(w.config.filters[0].options).toEqual(['IDF', 'PACA']);
  });

  it('refuse un filtre sur un champ inexistant', () => {
    const doc = createEmptyDashboard();
    const outcome = addBlocks(doc, [{ kind: 'filters', fields: ['pays'] }], ctx);
    expect(outcome.ok).toBe(false);
    expect(outcome.summary).toContain('pays');
  });
});

describe('studio/document — update / remove / move / set_page', () => {
  function seeded() {
    const doc = createEmptyDashboard();
    addBlocks(
      doc,
      [
        { kind: 'text', content: 'Intro' },
        {
          kind: 'chart',
          title: 'Par région',
          config: {
            type: 'pie',
            labelField: 'region',
            valueField: 'population',
            aggregation: 'sum',
          },
        },
      ],
      ctx
    );
    return doc;
  }

  it('update_block patch la ChartConfig par fusion', () => {
    const doc = seeded();
    const outcome = updateBlock(doc, 'b2', { kind: 'chart', config: { type: 'bar' } }, ctx);
    expect(outcome.ok).toBe(true);
    const w = doc.widgets[1];
    if (w.type !== 'chart' || !('chart' in w.config)) throw new Error('fromBuilder attendu');
    expect(w.config.chart.type).toBe('bar');
    expect(w.config.chart.labelField).toBe('region'); // conserve
  });

  it('update_block refuse un patch qui casse la config', () => {
    const doc = seeded();
    const outcome = updateBlock(
      doc,
      'b2',
      { kind: 'chart', config: { valueField: 'inconnu' } },
      ctx
    );
    expect(outcome.ok).toBe(false);
    const w = doc.widgets[1];
    if (w.type !== 'chart' || !('chart' in w.config)) throw new Error('fromBuilder attendu');
    expect(w.config.chart.valueField).toBe('population'); // inchange
  });

  it('remove_block compacte les lignes', () => {
    const doc = seeded();
    removeBlock(doc, 'b1');
    expect(doc.widgets).toHaveLength(1);
    expect(doc.widgets[0].position.row).toBe(0);
  });

  it('move_block echange deux lignes', () => {
    const doc = seeded();
    const outcome = moveBlock(doc, 'b2', 'up');
    expect(outcome.ok).toBe(true);
    expect(doc.widgets.find((w) => w.id === 'b2')?.position.row).toBe(0);
    expect(doc.widgets.find((w) => w.id === 'b1')?.position.row).toBe(1);
  });

  it('set_page pose titre et chapo', () => {
    const doc = seeded();
    setPage(doc, { name: 'Populations régionales', description: 'Chiffres 2023-2024' });
    expect(doc.name).toBe('Populations régionales');
    expect(doc.description).toBe('Chiffres 2023-2024');
  });

  it('describeDocument liste ids et natures par ligne', () => {
    const doc = seeded();
    const desc = describeDocument(doc);
    expect(desc).toContain('b1:text');
    expect(desc).toContain('b2:chart');
  });
});

describe('studio/document — helpers', () => {
  it('defaultWidth : kpi=third, datalist=full, chart=half, text/filters=full', () => {
    expect(defaultWidth({ kind: 'chart', config: { type: 'kpi', valueField: 'x' } })).toBe('third');
    expect(defaultWidth({ kind: 'chart', config: { type: 'datalist', valueField: 'x' } })).toBe(
      'full'
    );
    expect(defaultWidth({ kind: 'chart', config: { type: 'bar', valueField: 'x' } })).toBe('half');
    expect(defaultWidth({ kind: 'text' })).toBe('full');
    expect(defaultWidth({ kind: 'filters' })).toBe('full');
  });

  it('nextBlockId ne recycle pas un id existant', () => {
    const doc = createEmptyDashboard();
    addBlocks(doc, [{ kind: 'text', content: 'a' }], ctx);
    removeBlock(doc, 'b1');
    addBlocks(doc, [{ kind: 'text', content: 'b' }], ctx);
    expect(nextBlockId(doc)).not.toBe(doc.widgets[0].id);
  });
});
