import { describe, it, expect, afterEach, vi } from 'vitest';
import { DsfrDataList, type PageItem } from '@/components/dsfr-data-list.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  setDataMeta,
} from '@/utils/data-bridge.js';

/**
 * Tableaux affichés par dsfr-data-list — épic #695.
 *
 * - #666 : cellules numériques en fr-FR (`2.27` → « 2,27 »), chaînes intactes
 *   (codes INSEE, SIREN), export CSV brut, attribut `decimals`.
 * - #669 : `caption` paramétrable (RGAA 5.4, à défaut `aria-label`) ;
 *   pagination DSFR avec « Page N sur M », ellipses et total serveur.
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

const pageButtons = (list: DsfrDataList): HTMLButtonElement[] =>
  Array.from(
    list.querySelectorAll<HTMLButtonElement>(
      '.fr-pagination__list button:not([class*="--first"]):not([class*="--prev"]):not([class*="--next"]):not([class*="--last"])'
    )
  );

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

// ---------------------------------------------------------------------------
// #669 — caption
// ---------------------------------------------------------------------------

describe('dsfr-data-list — caption du tableau (#669, RGAA 5.4)', () => {
  const captionText = (list: DsfrDataList) =>
    (list.querySelector('table caption')?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('caption="…" est rendu dans <caption>', async () => {
    const { list } = await mountList({ columns: 'nom:Nom', caption: 'Tarifs par établissement' }, [
      { nom: 'A' },
    ]);
    expect(captionText(list)).toBe('Tarifs par établissement');
    expect(list.querySelector('table caption')?.classList.contains('fr-sr-only')).toBe(true);
  });

  it("à défaut, le caption dérive de l'aria-label", async () => {
    const { list } = await mountList(
      { columns: 'nom:Nom', 'aria-label': 'Établissements bancaires' },
      [{ nom: 'A' }]
    );
    expect(captionText(list)).toBe('Établissements bancaires');
  });

  it('caption prime sur aria-label', async () => {
    const { list } = await mountList(
      { columns: 'nom:Nom', caption: 'Tarifs', 'aria-label': 'Région' },
      [{ nom: 'A' }]
    );
    expect(captionText(list)).toBe('Tarifs');
  });

  it('sans caption ni aria-label : libellé générique inchangé', async () => {
    const { list } = await mountList({ columns: 'nom:Nom' }, [{ nom: 'A' }]);
    expect(captionText(list)).toBe('Liste des données');
  });

  it('un changement de caption est répercuté au rendu suivant', async () => {
    const { list } = await mountList({ columns: 'nom:Nom', caption: 'Avant' }, [{ nom: 'A' }]);
    list.caption = 'Après';
    await list.updateComplete;
    expect(captionText(list)).toBe('Après');
  });
});

// ---------------------------------------------------------------------------
// #669 — pagination DSFR : « Page N sur M », ellipses, total serveur
// ---------------------------------------------------------------------------

describe('dsfr-data-list — getPageItems (#669)', () => {
  const list = new DsfrDataList();
  const items = (total: number, current: number, known = true): PageItem[] =>
    list.getPageItems(total, current, known);

  it('115 pages, page 1 : « 1 2 3 … 115 »', () => {
    expect(items(115, 1)).toEqual([1, 2, 3, 'ellipsis', 115]);
  });

  it('115 pages, page 50 : « 1 … 49 50 51 … 115 »', () => {
    expect(items(115, 50)).toEqual([1, 'ellipsis', 49, 50, 51, 'ellipsis', 115]);
  });

  it('115 pages, page 115 : « 1 … 113 114 115 »', () => {
    expect(items(115, 115)).toEqual([1, 'ellipsis', 113, 114, 115]);
  });

  it("un trou d'une seule page est comblé par son numéro, pas une ellipse", () => {
    expect(items(115, 4)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 115]);
    expect(items(115, 112)).toEqual([1, 'ellipsis', 111, 112, 113, 114, 115]);
  });

  it('peu de pages : toutes affichées, aucune ellipse', () => {
    expect(items(2, 1)).toEqual([1, 2]);
    expect(items(5, 3)).toEqual([1, 2, 3, 4, 5]);
    expect(items(6, 3)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('total inconnu (Grist Records) : pas de dernière page ni d ellipse finale', () => {
    // _getTotalPages rend currentPage + 1 tant que la page est pleine (#270)
    expect(items(4, 3, false)).toEqual([1, 2, 3, 4]);
    expect(items(51, 50, false)).toEqual([1, 'ellipsis', 49, 50, 51]);
  });
});

describe('dsfr-data-list — pagination rendue (#669)', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

  it('115 pages : « Page 1 sur 115 », ellipse et dernière page visibles', async () => {
    const { list } = await mountList({ columns: 'id:Id', pagination: '25' }, rows(2873));
    const nav = list.querySelector('nav.fr-pagination')!;
    expect(nav).not.toBeNull();
    expect(nav.getAttribute('role')).toBe('navigation');
    expect(nav.textContent).toContain('Page 1 sur 115');

    const numbers = pageButtons(list).map((b) => b.textContent!.trim());
    expect(numbers).toEqual(['1', '2', '3', '115']);
    const ellipses = nav.querySelectorAll('.dsfr-data-list__ellipsis');
    expect(ellipses).toHaveLength(1);
    expect(ellipses[0].getAttribute('aria-hidden')).toBe('true');
    expect(ellipses[0].textContent).toBe('…');
  });

  it('page courante : aria-current="page", classe active, libellé « Page N sur M »', async () => {
    const { list } = await mountList({ columns: 'id:Id', pagination: '25' }, rows(2873));
    const buttons = pageButtons(list);
    const current = buttons.find((b) => b.getAttribute('aria-current') === 'page')!;
    expect(current.textContent!.trim()).toBe('1');
    expect(current.classList.contains('fr-pagination__link--active')).toBe(true);
    expect(current.getAttribute('aria-label')).toBe('Page 1 sur 115');
    expect(buttons.filter((b) => b.hasAttribute('aria-current'))).toHaveLength(1);
    const last = buttons[buttons.length - 1];
    expect(last.getAttribute('aria-label')).toBe('Page 115 sur 115');
  });

  it('en page 50 : deux ellipses, position annoncée dans la région live', async () => {
    const { list } = await mountList({ columns: 'id:Id', pagination: '25' }, rows(2873));
    const last = pageButtons(list).find((b) => b.textContent!.trim() === '115')!;
    last.click();
    await list.updateComplete;
    // Depuis la dernière page, aller sur 114 puis observer la fenêtre
    asInternal(list)._currentPage = 50;
    list.requestUpdate();
    await list.updateComplete;

    const nav = list.querySelector('nav.fr-pagination')!;
    expect(nav.textContent).toContain('Page 50 sur 115');
    expect(pageButtons(list).map((b) => b.textContent!.trim())).toEqual([
      '1',
      '49',
      '50',
      '51',
      '115',
    ]);
    expect(nav.querySelectorAll('.dsfr-data-list__ellipsis')).toHaveLength(2);
  });

  it('le clic sur une page annonce « Page N sur M » (live region)', async () => {
    const { list } = await mountList({ columns: 'id:Id', pagination: '25' }, rows(2873));
    pageButtons(list)
      .find((b) => b.textContent!.trim() === '3')!
      .click();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await list.updateComplete;
    const live = list.querySelector('[aria-live="polite"].fr-sr-only')!;
    expect(live.textContent!.trim()).toBe('Page 3 sur 115');
    expect(asInternal(list)._currentPage).toBe(3);
  });

  it('libellés des boutons de navigation (a11y) et désactivation aux bornes', async () => {
    const { list } = await mountList({ columns: 'id:Id', pagination: '25' }, rows(2873));
    const byLabel = (label: string) =>
      list.querySelector<HTMLButtonElement>(`.fr-pagination__list button[aria-label="${label}"]`)!;
    expect(byLabel('Première page').disabled).toBe(true);
    expect(byLabel('Page précédente').disabled).toBe(true);
    expect(byLabel('Page suivante').disabled).toBe(false);
    expect(byLabel('Dernière page').disabled).toBe(false);
  });

  it('mode serveur : total et pages depuis meta.total, « Page N sur M »', async () => {
    const sourceId = uid();
    sources.push(sourceId);
    const list = new DsfrDataList();
    list.setAttribute('source', sourceId);
    list.setAttribute('columns', 'id:Id');
    document.body.appendChild(list);
    mounted.push(list);
    setDataMeta(sourceId, { page: 3, pageSize: 25, total: 2873, serverSide: true });
    dispatchDataLoaded(sourceId, rows(25));
    await list.updateComplete;

    expect(asInternal(list)._serverPagination).toBe(true);
    const nav = list.querySelector('nav.fr-pagination')!;
    expect(nav.textContent).toContain('Page 3 sur 115');
    expect(pageButtons(list).map((b) => b.textContent!.trim())).toEqual([
      '1',
      '2',
      '3',
      '4',
      '115',
    ]);
    expect(list.querySelector('[role="status"]')!.textContent).toContain('2873');
  });

  it('mode serveur, total inconnu : « Page N » seul, pas de dernière page', async () => {
    const sourceId = uid();
    sources.push(sourceId);
    const list = new DsfrDataList();
    list.setAttribute('source', sourceId);
    list.setAttribute('columns', 'id:Id');
    document.body.appendChild(list);
    mounted.push(list);
    setDataMeta(sourceId, { page: 3, pageSize: 25, serverSide: true });
    dispatchDataLoaded(sourceId, rows(25));
    await list.updateComplete;

    expect(asInternal(list)._serverTotal).toBeUndefined();
    const nav = list.querySelector('nav.fr-pagination')!;
    const position = nav.querySelector('.dsfr-data-list__page-position')!.textContent!.trim();
    expect(position).toBe('Page 3');
    expect(nav.querySelector('button[aria-label="Dernière page"]')).toBeNull();
    expect(pageButtons(list).map((b) => b.textContent!.trim())).toEqual(['1', '2', '3', '4']);
    expect(pageButtons(list)[2].getAttribute('aria-label')).toBe('Page 3');
  });

  it('une seule page : aucune pagination rendue', async () => {
    const { list } = await mountList({ columns: 'id:Id', pagination: '25' }, rows(10));
    expect(list.querySelector('nav.fr-pagination')).toBeNull();
  });
});
