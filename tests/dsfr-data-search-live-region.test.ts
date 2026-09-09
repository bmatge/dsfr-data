import { describe, it, expect, afterEach } from 'vitest';
import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

/**
 * Tests traversants #654 — une seule region live par chaine.
 *
 * Bug d'origine (#640 pt 5) : dsfr-data-search annoncait son propre compte
 * (lignes apres SA seule recherche) dans une region `aria-live` pendant que
 * dsfr-data-list annoncait le sien (apres les facettes aval). Le lecteur
 * d'ecran entendait « 2873 resultats » puis « 33 résultats ».
 *
 * Regle : quand un afficheur aval (list, display) consomme la sortie de
 * search — en direct ou via facets — il porte seul la region live. Sans
 * afficheur aval, search garde la sienne.
 */

const ROWS = [
  { nom: 'NetCommerce', region: 'PACA' },
  { nom: 'Campus Online', region: 'Grand Est' },
  { nom: 'NetPoint', region: 'IDF' },
  { nom: 'SuperCommerce', region: 'PACA' },
];

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-654-${seq}`;
}

/** Texte de chaque region live du document, indexe par element. */
function liveSnapshot(): Map<Element, string> {
  const snap = new Map<Element, string>();
  for (const el of Array.from(document.querySelectorAll('[aria-live]'))) {
    snap.set(el, (el.textContent ?? '').replace(/\s+/g, ' ').trim());
  }
  return snap;
}

/** Nombre de regions live dont le texte a change entre deux instantanes. */
function changedRegions(before: Map<Element, string>, after: Map<Element, string>): Element[] {
  const changed: Element[] = [];
  for (const [el, text] of after) {
    if (before.get(el) !== text) changed.push(el);
  }
  return changed;
}

async function settle(...els: { updateComplete: Promise<boolean> }[]) {
  for (const el of els) await el.updateComplete;
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  for (const el of els) await el.updateComplete;
}

/** Tape un terme puis attend le filtre (debounce a 0). */
async function type(search: DsfrDataSearch, term: string, ...others: DsfrDataList[]) {
  const input = search.querySelector('input[type="search"]') as HTMLInputElement;
  input.value = term;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 5));
  await settle(search, ...others);
}

const mounted: Element[] = [];
const sources: string[] = [];

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  for (const id of sources.splice(0)) clearDataCache(id);
});

function mount<T extends Element>(el: T): T {
  document.body.appendChild(el);
  mounted.push(el);
  return el;
}

function makeSearch(sourceId: string, opts: { count?: boolean } = {}): DsfrDataSearch {
  const search = new DsfrDataSearch();
  search.id = uid('search');
  search.source = sourceId;
  search.fields = 'nom';
  search.debounce = 0;
  search.count = opts.count ?? false;
  sources.push(search.id);
  return search;
}

function makeList(sourceId: string): DsfrDataList {
  const list = new DsfrDataList();
  list.id = uid('list');
  // Attribut (et non propriete) : la chaine est suivie par `[source="id"]`,
  // comme dans l'usage declaratif en HTML.
  list.setAttribute('source', sourceId);
  sources.push(list.id);
  return list;
}

describe('#654 — AC : chaine search -> list, une seule annonce par changement', () => {
  it('search seul (sans afficheur aval) garde sa region live sr-only, accentuee', async () => {
    const src = uid('src');
    sources.push(src);
    const search = mount(makeSearch(src));
    dispatchDataLoaded(src, ROWS);
    await settle(search);

    const regions = search.querySelectorAll('[aria-live]');
    expect(regions.length).toBe(1);
    expect(regions[0].getAttribute('role')).toBe('status');
    expect(regions[0].classList.contains('fr-sr-only')).toBe(true);
    expect(regions[0].textContent).toContain('4 résultats');
    expect(regions[0].textContent).not.toContain('resultat');

    await type(search, 'net');
    expect(search.querySelector('[aria-live]')?.textContent).toContain('2 résultats');
  });

  it('search -> list : search ne rend AUCUNE region live, list porte la seule annonce', async () => {
    const src = uid('src');
    sources.push(src);
    const search = mount(makeSearch(src));
    const list = mount(makeList(search.id));
    dispatchDataLoaded(src, ROWS);
    await settle(search, list);

    expect(search.querySelectorAll('[aria-live]').length).toBe(0);
    expect(search.querySelectorAll('[role="status"]').length).toBe(0);

    const before = liveSnapshot();
    await type(search, 'net', list);
    const changed = changedRegions(before, liveSnapshot());

    expect(changed.length, 'une seule region live a change').toBe(1);
    expect(list.contains(changed[0])).toBe(true);
    expect(changed[0].textContent).toContain('2 résultats');
  });

  it('search count -> list : le compteur visible est conserve mais n est plus une region live', async () => {
    const src = uid('src');
    sources.push(src);
    const search = mount(makeSearch(src, { count: true }));
    const list = mount(makeList(search.id));
    dispatchDataLoaded(src, ROWS);
    await settle(search, list);

    const counter = search.querySelector('.dsfr-data-search-count');
    expect(counter, 'compteur visible present').not.toBeNull();
    expect(counter?.textContent).toContain('4 résultats');
    expect(counter?.hasAttribute('aria-live')).toBe(false);
    expect(counter?.hasAttribute('role')).toBe(false);
    expect(search.querySelectorAll('[aria-live]').length).toBe(0);

    const before = liveSnapshot();
    await type(search, 'commerce', list);
    const changed = changedRegions(before, liveSnapshot());
    expect(changed.length).toBe(1);
    expect(list.contains(changed[0])).toBe(true);

    // Le compteur visible suit bien le filtre, sans annoncer
    expect(search.querySelector('.dsfr-data-search-count')?.textContent).toContain('2 résultats');
  });

  it('search count seul : le compteur visible reste une region live', async () => {
    const src = uid('src');
    sources.push(src);
    const search = mount(makeSearch(src, { count: true }));
    dispatchDataLoaded(src, ROWS);
    await settle(search);

    const counter = search.querySelector('.dsfr-data-search-count');
    expect(counter?.getAttribute('aria-live')).toBe('polite');
    expect(counter?.getAttribute('role')).toBe('status');
    expect(search.querySelectorAll('[aria-live]').length).toBe(1);
  });

  it('search -> facets -> list : la chaine indirecte est suivie, search se tait', async () => {
    const src = uid('src');
    sources.push(src);
    const search = mount(makeSearch(src));
    const facets = new DsfrDataFacets();
    facets.id = uid('facets');
    facets.setAttribute('source', search.id);
    facets.fields = 'region';
    sources.push(facets.id);
    mount(facets);
    const list = mount(makeList(facets.id));
    dispatchDataLoaded(src, ROWS);
    await settle(search, facets, list);

    expect(search.querySelectorAll('[aria-live]').length).toBe(0);

    const before = liveSnapshot();
    await type(search, 'net', list);
    await facets.updateComplete;
    const changed = changedRegions(before, liveSnapshot());
    expect(changed.length, 'une seule region live a change').toBe(1);
    expect(list.contains(changed[0])).toBe(true);
  });

  it('search -> chart (aval sans region de compte) : search garde sa region', async () => {
    const src = uid('src');
    sources.push(src);
    const search = mount(makeSearch(src));
    // Consommateur aval sans region live de compte : un element quelconque
    // lie par `source` (chart, kpi...) ne fait pas taire search.
    const consumer = document.createElement('dsfr-data-kpi');
    consumer.setAttribute('source', search.id);
    mount(consumer);
    dispatchDataLoaded(src, ROWS);
    await settle(search);

    expect(search.querySelectorAll('[aria-live]').length).toBe(1);
  });
});
