import { describe, it, expect, afterEach, vi } from 'vitest';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { clearDataCache, clearDataMeta, dispatchDataLoaded } from '@/utils/data-bridge.js';

/**
 * Tableaux affichés par dsfr-data-list — épic #695.
 *
 * - #666 : cellules numériques en fr-FR (`2.27` → « 2,27 »), chaînes intactes
 *   (codes INSEE, SIREN), export CSV brut, attribut `decimals`.
 */

/** Vue interne du composant pour les tests (pas de `as any` dispersé) */
interface ListInternals {
  _currentPage: number;
  _serverPagination: boolean;
  _serverTotal: number | undefined;
  _exportCsv(): void;
}

const asInternal = (list: DsfrDataList): ListInternals => list as unknown as ListInternals;

/** Espace insécable (fin ou classique) → espace simple, pour des attentes lisibles */
const nbsp = (str: string) => str.replace(/[\u202F\u00A0]/g, ' ');

const mounted: Element[] = [];
const sources: string[] = [];
let seq = 0;

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  for (const id of sources.splice(0)) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  vi.restoreAllMocks();
});

function uid(): string {
  seq += 1;
  return `list-695-${seq}`;
}

async function mountList(attrs: Record<string, string | boolean>, rows: unknown[]) {
  const sourceId = uid();
  sources.push(sourceId);
  const list = new DsfrDataList();
  list.setAttribute('source', sourceId);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false) continue;
    list.setAttribute(name, value === true ? '' : value);
  }
  document.body.appendChild(list);
  mounted.push(list);
  dispatchDataLoaded(sourceId, rows);
  await list.updateComplete;
  return { list, sourceId };
}

const cellTexts = (list: DsfrDataList): string[] =>
  Array.from(list.querySelectorAll('tbody td')).map((td) => (td.textContent ?? '').trim());

// ---------------------------------------------------------------------------
// #666 — format fr-FR des nombres
// ---------------------------------------------------------------------------

describe('dsfr-data-list — format fr-FR des cellules numériques (#666)', () => {
  it('formatCellValue : 2.27 → « 2,27 », 0.2 → « 0,2 », entiers inchangés', () => {
    const list = new DsfrDataList();
    expect(list.formatCellValue(2.27)).toBe('2,27');
    expect(list.formatCellValue(0.2)).toBe('0,2');
    expect(list.formatCellValue(42)).toBe('42');
    expect(list.formatCellValue(0)).toBe('0');
    expect(nbsp(list.formatCellValue(1234.5))).toBe('1 234,5');
  });

  it('formatCellValue : au plus 2 décimales sans attribut decimals', () => {
    const list = new DsfrDataList();
    expect(list.formatCellValue(3.14159)).toBe('3,14');
    expect(list.formatCellValue(1.999)).toBe('2');
  });

  it('formatCellValue : les chaînes ne passent JAMAIS par le formateur (codes INSEE, SIREN)', () => {
    const list = new DsfrDataList();
    expect(list.formatCellValue('75056')).toBe('75056');
    expect(list.formatCellValue('552032534')).toBe('552032534');
    expect(list.formatCellValue('2.27')).toBe('2.27');
    expect(list.formatCellValue('01')).toBe('01');
  });

  it('formatCellValue : « — », Oui/Non conservés', () => {
    const list = new DsfrDataList();
    expect(list.formatCellValue(null)).toBe('—');
    expect(list.formatCellValue(undefined)).toBe('—');
    expect(list.formatCellValue(true)).toBe('Oui');
    expect(list.formatCellValue(false)).toBe('Non');
  });

  it('decimals fixe le nombre de décimales des cellules numériques', () => {
    const list = new DsfrDataList();
    list.decimals = 2;
    expect(list.formatCellValue(2)).toBe('2,00');
    expect(list.formatCellValue(2.275)).toBe('2,28');
    expect(list.formatCellValue('2')).toBe('2');
    list.decimals = 0;
    expect(list.formatCellValue(2.27)).toBe('2');
  });

  it('rend les cellules formatées dans le tableau, chaînes intactes', async () => {
    const { list } = await mountList({ columns: 'code:Code, taux:Taux, siren:SIREN' }, [
      { code: '75056', taux: 2.27, siren: '552032534' },
      { code: '01001', taux: 0.2, siren: '123456789' },
    ]);
    expect(cellTexts(list)).toEqual(['75056', '2,27', '552032534', '01001', '0,2', '123456789']);
  });

  it("l'attribut decimals est lu depuis le HTML", async () => {
    const { list } = await mountList({ columns: 'taux:Taux', decimals: '1' }, [
      { taux: 2.27 },
      { taux: 3 },
    ]);
    expect(cellTexts(list)).toEqual(['2,3', '3,0']);
  });

  it("l'export CSV reste brut (2.27, pas 2,27)", async () => {
    const { list } = await mountList({ columns: 'code:Code, taux:Taux', export: 'csv' }, [
      { code: '75056', taux: 2.27 },
    ]);
    let csvText = '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      // happy-dom : Blob expose son contenu de manière synchrone via
      // l'implémentation interne ; on lit via text() en différé ci-dessous
      void (blob as Blob).text().then((t) => (csvText = t));
      return 'blob:mock';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    asInternal(list)._exportCsv();
    await new Promise((r) => setTimeout(r, 0));

    expect(csvText).toContain('2.27');
    expect(csvText).not.toContain('2,27');
    expect(csvText).toContain('75056');
  });
});
