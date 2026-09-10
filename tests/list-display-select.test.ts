import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

/**
 * Tests #734 — la liste devient interactive : un clic sur une ligne filtre les
 * autres vues.
 *
 * Le tronc commun est celui de la carte (#681), extrait en `SelectionFilterMixin` :
 * premier clic = filtre, second clic = retrait, autre ligne = remplacement, tag
 * visible via `activeFilters()`, URL portée par le contexte, chemin dégradé vers
 * `source` sans `context`.
 *
 * L'accessibilité est le vrai coût du correctif et le cœur de ces tests : la
 * ligne cliquable doit être atteignable au clavier (un vrai bouton), son rôle et
 * son état annoncés (`aria-pressed`, `aria-current`), et l'état de sélection
 * perceptible autrement que par la couleur (libellé et icône du bouton).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';
import type { DsfrDataContext } from '@/components/dsfr-data-context.js';

type Row = Record<string, unknown>;

interface Captured {
  where?: string;
  whereKey?: string;
  origin?: string;
}

interface SelectDetail {
  record: Row;
  elementId: string;
  selected: boolean;
}

const ROWS: Row[] = [
  { commune: 'Paris', population: 2148000, alerte: 'seuil-haut' },
  { commune: 'Lyon', population: 522000, alerte: 'seuil-ok' },
];

const mounted: Element[] = [];
const sources: string[] = [];
const unsubs: Array<() => void> = [];
let seq = 0;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const u of unsubs.splice(0)) u();
  for (const el of mounted.splice(0)) el.remove();
  for (const id of sources.splice(0)) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  document.body.innerHTML = '';
  window.history.replaceState(null, '', window.location.pathname);
  errorSpy.mockRestore();
  vi.restoreAllMocks();
});

function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-734-${seq}`;
}

/** Fausse source cible : capture les commandes reçues (whereKey, where) */
function fakeSource(id: string, whereFormat: 'colon' | 'odsql' = 'colon') {
  clearDataCache(id);
  sources.push(id);
  const el = document.createElement('div');
  el.id = id;
  const commands: Captured[] = [];
  Object.assign(el, { getAdapter: () => ({ capabilities: { whereFormat } }) });
  unsubs.push(subscribeToSourceCommands(id, (cmd) => commands.push(cmd as Captured)));
  document.body.appendChild(el);
  mounted.push(el);
  return { el, commands };
}

function last(commands: Captured[]): Captured | undefined {
  return commands[commands.length - 1];
}

function urlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

async function settle() {
  await new Promise((r) => setTimeout(r, 0));
}

async function mountList(attrs: Record<string, string>, rows: Row[] = ROWS) {
  const sourceId = attrs.source ?? uid('src');
  sources.push(sourceId);
  const list = new DsfrDataList();
  list.setAttribute('source', sourceId);
  for (const [name, value] of Object.entries(attrs)) list.setAttribute(name, value);
  document.body.appendChild(list);
  mounted.push(list);
  dispatchDataLoaded(sourceId, rows);
  await list.updateComplete;
  await settle();
  await list.updateComplete;
  return { list, sourceId };
}

async function mountDisplay(attrs: Record<string, string>, rows: Row[] = ROWS) {
  const sourceId = attrs.source ?? uid('src');
  sources.push(sourceId);
  const display = new DsfrDataDisplay();
  display.setAttribute('source', sourceId);
  for (const [name, value] of Object.entries(attrs)) display.setAttribute(name, value);
  display.innerHTML = '<template><p class="titre">{{commune}}</p></template>';
  document.body.appendChild(display);
  mounted.push(display);
  dispatchDataLoaded(sourceId, rows);
  await display.updateComplete;
  await settle();
  await display.updateComplete;
  return { display, sourceId };
}

const selectButtons = (host: Element): HTMLButtonElement[] =>
  Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));

// ---------------------------------------------------------------------------
// dsfr-data-list — accessibilité du geste de clic
// ---------------------------------------------------------------------------

describe('dsfr-data-list — la ligne cliquable est accessible (#734)', () => {
  it('sans refine-on-click : aucune colonne de sélection, tableau inchangé', async () => {
    const { list } = await mountList({ columns: 'commune:Commune' });
    expect(selectButtons(list)).toHaveLength(0);
    expect(list.querySelectorAll('thead th')).toHaveLength(1);
  });

  it('un vrai bouton par ligne : atteignable au clavier, rôle et état annoncés', async () => {
    const { list } = await mountList({
      columns: 'commune:Commune',
      'refine-on-click': 'commune',
    });
    const buttons = selectButtons(list);
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      // Un <button> natif est dans l'ordre de tabulation et annoncé « bouton »
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
      expect(button.hasAttribute('tabindex')).toBe(false);
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }
    expect(buttons[0].textContent).toContain('Filtrer sur Paris');
    // La colonne de sélection a un en-tête, masqué visuellement
    const head = list.querySelector('thead th');
    expect(head?.classList.contains('dsfr-data-list__select-head')).toBe(true);
    expect(head?.textContent?.trim()).toBe('Filtrer');
  });

  it("l'état sélectionné ne tient pas qu'à la couleur : libellé, aria-pressed, aria-current", async () => {
    const { list } = await mountList({
      columns: 'commune:Commune',
      'refine-on-click': 'commune',
    });
    selectButtons(list)[0].click();
    await list.updateComplete;

    const buttons = selectButtons(list);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].textContent).toContain('Retirer le filtre Paris');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');

    const rows = list.querySelectorAll('tbody tr');
    expect(rows[0].getAttribute('aria-current')).toBe('true');
    expect(rows[0].classList.contains('dsfr-data-list__row--selected')).toBe(true);
    expect(rows[1].hasAttribute('aria-current')).toBe(false);
  });

  it('le clic sur la ligne bascule aussi, et le bouton ne le double pas', async () => {
    const { list } = await mountList({
      columns: 'commune:Commune',
      'refine-on-click': 'commune',
    });
    const events: SelectDetail[] = [];
    list.addEventListener('dsfr-data-select', (e) =>
      events.push((e as CustomEvent<SelectDetail>).detail)
    );

    // Clic sur une cellule : la ligne bascule
    list.querySelectorAll<HTMLElement>('tbody tr td')[1].click();
    await list.updateComplete;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ selected: true });
    expect((events[0].record as Row).commune).toBe('Paris');

    // Clic sur le bouton : une seule bascule, malgré la remontée jusqu'à la ligne
    selectButtons(list)[0].click();
    await list.updateComplete;
    expect(events).toHaveLength(2);
    expect(events[1].selected).toBe(false);
  });

  it('un lien dans une cellule garde son clic', async () => {
    const { list } = await mountList({
      columns: 'commune:Commune',
      'refine-on-click': 'commune',
    });
    const events: SelectDetail[] = [];
    list.addEventListener('dsfr-data-select', (e) =>
      events.push((e as CustomEvent<SelectDetail>).detail)
    );
    const cell = list.querySelectorAll('tbody tr td')[1];
    const link = document.createElement('a');
    link.href = '#ailleurs';
    cell.appendChild(link);
    link.click();
    expect(events).toHaveLength(0);
  });

  it('la sélection est annoncée dans la région live', async () => {
    const { list } = await mountList({
      columns: 'commune:Commune',
      'refine-on-click': 'commune',
    });
    selectButtons(list)[0].click();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await list.updateComplete;
    expect(list.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'Filtre appliqué : Paris'
    );
  });
});

// ---------------------------------------------------------------------------
// dsfr-data-list — le filtre part vers les autres vues
// ---------------------------------------------------------------------------

describe('dsfr-data-list + context — le clic filtre les autres vues (#734)', () => {
  async function annuaire() {
    const a = fakeSource('cible-734-a');
    const b = fakeSource('cible-734-b', 'odsql');
    const own = uid('src');
    sources.push(own);
    const ctx = document.createElement('dsfr-data-context') as DsfrDataContext;
    ctx.id = 'ctx-734';
    ctx.setAttribute('sources', 'cible-734-a cible-734-b');
    ctx.setAttribute('url-sync', '');
    document.body.appendChild(ctx);
    mounted.push(ctx);
    const { list } = await mountList({
      source: own,
      columns: 'commune:Commune',
      'refine-on-click': 'commune',
      context: 'ctx-734',
    });
    return { a, b, ctx, list };
  }

  it('premier clic : les deux cibles se filtrent au dialecte de chacune, tag et URL', async () => {
    const { a, b, ctx, list } = await annuaire();

    selectButtons(list)[0].click();

    expect(last(a.commands)).toMatchObject({ where: 'commune:eq:Paris', origin: 'ctx-734' });
    expect(last(b.commands)).toMatchObject({ where: 'commune = "Paris"', origin: 'ctx-734' });
    expect(last(a.commands)?.whereKey).toBe(last(b.commands)?.whereKey);

    const active = ctx.activeFilters();
    expect(active).toHaveLength(1);
    // Le libellé du tag vient de la colonne quand `label` est absent
    expect(active[0].displayLabel()).toBe('Commune');
    expect(active[0].displayValue()).toBe('Paris');
    expect(active[0].operator).toBe('eq');
    expect(urlParam('commune')).toBe('Paris');
  });

  it('second clic sur la même ligne : retrait (where vide, tag et URL disparus)', async () => {
    const { a, ctx, list } = await annuaire();
    selectButtons(list)[0].click();
    await list.updateComplete;
    const key = last(a.commands)?.whereKey;

    selectButtons(list)[0].click();

    expect(last(a.commands)).toMatchObject({ where: '', whereKey: key });
    expect(ctx.activeFilters()).toHaveLength(0);
    expect(urlParam('commune')).toBeNull();
    expect(list.getSelectedRecord()).toBeNull();
  });

  it('clic sur une autre ligne : remplacement sous le même whereKey', async () => {
    const { a, ctx, list } = await annuaire();
    selectButtons(list)[0].click();
    await list.updateComplete;
    const key = last(a.commands)?.whereKey;

    selectButtons(list)[1].click();

    expect(last(a.commands)).toMatchObject({ where: 'commune:eq:Lyon', whereKey: key });
    expect(ctx.activeFilters()[0].displayValue()).toBe('Lyon');
    expect(urlParam('commune')).toBe('Lyon');
  });

  it('clear() du filtre (la croix du tag) : même chemin qu un second clic', async () => {
    const { a, ctx, list } = await annuaire();
    const events: SelectDetail[] = [];
    list.addEventListener('dsfr-data-select', (e) =>
      events.push((e as CustomEvent<SelectDetail>).detail)
    );
    selectButtons(list)[0].click();
    await list.updateComplete;

    ctx.activeFilters()[0].clear();
    await list.updateComplete;

    expect(last(a.commands)).toMatchObject({ where: '' });
    expect(ctx.activeFilters()).toHaveLength(0);
    expect(events.map((e) => e.selected)).toEqual([true, false]);
    expect(selectButtons(list)[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('label explicite : il prime sur le libellé de colonne', async () => {
    const a = fakeSource('cible-734-label');
    const ctx = document.createElement('dsfr-data-context') as DsfrDataContext;
    ctx.id = 'ctx-734-label';
    ctx.setAttribute('sources', 'cible-734-label');
    document.body.appendChild(ctx);
    mounted.push(ctx);
    const { list } = await mountList({
      columns: 'commune:Commune',
      'refine-on-click': 'commune',
      context: 'ctx-734-label',
      label: 'Territoire',
    });
    selectButtons(list)[0].click();
    expect(ctx.activeFilters()[0].displayLabel()).toBe('Territoire');
    expect(last(a.commands)).toMatchObject({ where: 'commune:eq:Paris' });
  });

  it('contexte introuvable : erreur de config, aucune commande directe', async () => {
    const own = uid('src');
    const src = fakeSource(own);
    const { list } = await mountList({
      source: own,
      columns: 'commune:Commune',
      'refine-on-click': 'commune',
      context: 'ctx-absent-734',
    });
    expect(list.hasAttribute('data-dsfr-config-error')).toBe(true);
    selectButtons(list)[0].click();
    expect(src.commands).toHaveLength(0);
  });

  it('retrait du tableau du DOM : la clause est libérée sur les cibles', async () => {
    const { a, ctx, list } = await annuaire();
    selectButtons(list)[0].click();
    await list.updateComplete;
    const key = last(a.commands)?.whereKey;

    list.remove();

    expect(last(a.commands)).toMatchObject({ where: '', whereKey: key });
    expect(ctx.activeFilters()).toHaveLength(0);
  });
});

describe('dsfr-data-list sans context — commande directe à source (#734)', () => {
  it('pousse un where eq sous le whereKey list-select-ID, retiré au second clic', async () => {
    const id = uid('src');
    const src = fakeSource(id);
    const { list } = await mountList({
      source: id,
      id: 'tableau',
      columns: 'commune:Commune',
      'refine-on-click': 'commune',
    });

    selectButtons(list)[0].click();
    expect(last(src.commands)).toEqual({
      where: 'commune:eq:Paris',
      whereKey: 'list-select-tableau',
      origin: 'tableau',
    });

    await list.updateComplete;
    selectButtons(list)[0].click();
    expect(last(src.commands)).toMatchObject({ where: '', whereKey: 'list-select-tableau' });
  });
});

// ---------------------------------------------------------------------------
// dsfr-data-display
// ---------------------------------------------------------------------------

describe('dsfr-data-display — même geste, rendu par chaîne (#734)', () => {
  it('sans refine-on-click : aucun bouton de sélection', async () => {
    const { display } = await mountDisplay({});
    expect(selectButtons(display)).toHaveLength(0);
  });

  it('un bouton par élément, atteignable au clavier, état annoncé', async () => {
    const { display } = await mountDisplay({ 'refine-on-click': 'commune' });
    const buttons = selectButtons(display);
    expect(buttons).toHaveLength(2);
    expect(buttons[0].tagName).toBe('BUTTON');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[0].textContent).toBe('Filtrer sur Paris');

    buttons[0].click();
    await display.updateComplete;

    const after = selectButtons(display);
    expect(after[0].getAttribute('aria-pressed')).toBe('true');
    expect(after[0].textContent).toBe('Retirer le filtre Paris');
    const item = display.querySelector('[data-dsfr-select="0"]');
    expect(item?.getAttribute('aria-current')).toBe('true');
    expect(item?.classList.contains('dsfr-data-display__item--selected')).toBe(true);
  });

  it('le clic sur la carte bascule, sans doubler celui du bouton', async () => {
    const { display } = await mountDisplay({ 'refine-on-click': 'commune' });
    const events: SelectDetail[] = [];
    display.addEventListener('dsfr-data-select', (e) =>
      events.push((e as CustomEvent<SelectDetail>).detail)
    );

    display.querySelector<HTMLElement>('.titre')!.click();
    await display.updateComplete;
    expect(events).toHaveLength(1);
    expect(events[0].selected).toBe(true);

    selectButtons(display)[0].click();
    await display.updateComplete;
    expect(events).toHaveLength(2);
    expect(events[1].selected).toBe(false);
  });

  it('context : le clic filtre les autres vues, second clic retire', async () => {
    const a = fakeSource('cible-734-d');
    const ctx = document.createElement('dsfr-data-context') as DsfrDataContext;
    ctx.id = 'ctx-734-d';
    ctx.setAttribute('sources', 'cible-734-d');
    document.body.appendChild(ctx);
    mounted.push(ctx);
    const { display } = await mountDisplay({
      'refine-on-click': 'commune',
      context: 'ctx-734-d',
      label: 'Commune',
    });

    selectButtons(display)[0].click();
    expect(last(a.commands)).toMatchObject({ where: 'commune:eq:Paris', origin: 'ctx-734-d' });
    expect(ctx.activeFilters()[0].displayLabel()).toBe('Commune');

    await display.updateComplete;
    selectButtons(display)[0].click();
    expect(last(a.commands)).toMatchObject({ where: '' });
    expect(ctx.activeFilters()).toHaveLength(0);
  });

  it('sans context : commande directe sous le whereKey display-select-ID', async () => {
    const id = uid('src');
    const src = fakeSource(id);
    const { display } = await mountDisplay({
      source: id,
      id: 'cartes',
      'refine-on-click': 'commune',
    });
    selectButtons(display)[0].click();
    expect(last(src.commands)).toEqual({
      where: 'commune:eq:Paris',
      whereKey: 'display-select-cartes',
      origin: 'cartes',
    });
  });
});
