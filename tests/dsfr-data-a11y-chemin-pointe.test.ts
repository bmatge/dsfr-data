import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CSV_BOM } from '@dsfr-data/shared';
import { DsfrDataA11y } from '@/components/dsfr-data-a11y.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

/**
 * #1244 — `dsfr-data-a11y` lit ses colonnes par CHEMIN POINTÉ, comme
 * `dsfr-data-chart` (`getByPath`). `value-field="fields.total"`, recopié du
 * graphique, cherchait une colonne à plat nommée « fields.total » : le
 * tableau avait ses lignes et une colonne vide (signalée en console depuis la
 * 0.45.0, mais vide).
 */

const SOURCE_ID = 'test-a11y-chemin';

const IMBRIQUEES = [
  { id: 1, fields: { dep: 'Ain', total: 12.5, an: '2023' } },
  { id: 2, fields: { dep: 'Aisne', total: 7, an: '2023' } },
];

describe('dsfr-data-a11y — colonnes lues par chemin pointé (#1244)', () => {
  let comp: DsfrDataA11y;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearDataCache(SOURCE_ID);
    comp = new DsfrDataA11y();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    comp.remove();
    warn.mockRestore();
  });

  async function mount(rows: Record<string, unknown>[], attrs: Record<string, string>) {
    comp.source = SOURCE_ID;
    comp.table = true;
    comp.noAutoAria = true;
    for (const [name, value] of Object.entries(attrs)) comp.setAttribute(name, value);
    document.body.appendChild(comp);
    dispatchDataLoaded(SOURCE_ID, rows);
    await comp.updateComplete;
  }

  const entetes = (): string[] =>
    Array.from(comp.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
  const corps = (): string[][] =>
    Array.from(comp.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.children).map((c) => (c.textContent ?? '').trim())
    );

  it('`fields.total` recopié du graphique : la colonne n’est pas vide, et rien n’est signalé', async () => {
    await mount(IMBRIQUEES, { 'label-field': 'fields.dep', 'value-field': 'fields.total' });
    expect(entetes()).toEqual(['fields.dep', 'fields.total']);
    expect(corps()).toEqual([
      ['Ain', '12,5'],
      ['Aisne', '7'],
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('chemin pointé et alias se composent : `fields.total:Total`', async () => {
    await mount(IMBRIQUEES, {
      'label-field': 'fields.dep:Département',
      'value-field': 'fields.total:Total',
    });
    expect(entetes()).toEqual(['Département', 'Total']);
    expect(corps()[0]).toEqual(['Ain', '12,5']);
  });

  it('le CSV lit les mêmes chemins que le tableau', () => {
    comp.labelField = 'fields.dep:Département';
    comp.valueField = 'fields.total:Total';
    expect(comp._buildCsv(IMBRIQUEES)).toBe(`${CSV_BOM}Département;Total\nAin;12.5\nAisne;7`);
  });

  it('le CSV porte empty-label sur un libellé vide lu par chemin', () => {
    comp.labelField = 'fields.dep';
    comp.valueField = 'fields.total';
    comp.emptyLabel = 'Non renseigné';
    const csv = comp._buildCsv([{ fields: { dep: null, total: 3 } }]);
    expect(csv).toBe(`${CSV_BOM}fields.dep;fields.total\nNon renseigné;3`);
  });

  it('format long : libellé, série et valeur sont lus par chemin', async () => {
    await mount(
      [
        { fields: { dep: 'Ain', an: '2023', total: 12 } },
        { fields: { dep: 'Ain', an: '2024', total: 14 } },
      ],
      { 'label-field': 'fields.dep', 'value-field': 'fields.total', 'series-field': 'fields.an' }
    );
    expect(entetes()).toEqual(['fields.dep', '2023', '2024']);
    expect(corps()).toEqual([['Ain', '12', '14']]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('une colonne À PLAT dont le nom contient un point reste lue telle quelle', async () => {
    await mount([{ nom: 'A', 'taux.brut': 3.5 }], {
      'label-field': 'nom',
      'value-field': 'taux.brut',
    });
    expect(corps()).toEqual([['A', '3,5']]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('un chemin qui ne mène nulle part reste signalé, colonne vide', async () => {
    await mount(IMBRIQUEES, { 'label-field': 'fields.dep', 'value-field': 'fields.effectif' });
    expect(corps()).toEqual([
      ['Ain', ''],
      ['Aisne', ''],
    ]);
    const messages = warn.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('value-field — colonne « fields.effectif » introuvable');
  });
});
