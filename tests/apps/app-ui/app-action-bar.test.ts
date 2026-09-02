import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { AppActionBar } from '../../../packages/app-ui/src/app-action-bar.js';
import type { AppMenu } from '../../../packages/app-ui/src/app-menu.js';

/**
 * <app-action-bar> — barre d'actions unique des éditeurs (docs/ux/actions.md
 * §5, lot UX 2 #539). Recette §4 : une primaire à l'extrême droite, ≤ 3
 * secondaires visibles puis Plus ▾, variantes normalisées, roving tabindex,
 * primaire désactivée avec raison, mode mobile.
 */

type MqlStub = { matches: boolean; listeners: Array<(e: { matches: boolean }) => void> };
let mql: MqlStub;

function stubMatchMedia(matches: boolean): void {
  mql = { matches, listeners: [] };
  window.matchMedia = ((query: string) =>
    ({
      matches: mql.matches,
      media: query,
      addEventListener: (_: string, fn: (e: { matches: boolean }) => void) =>
        mql.listeners.push(fn),
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

const SIX = `
  <button slot="tertiary" id="tour" data-variant="no-outline" class="fr-icon-question-line">Visite guidée</button>
  <button slot="tertiary" id="reset">Réinitialiser</button>
  <button slot="secondary" id="copy" class="fr-btn fr-btn--tertiary fr-btn--lg">Copier le code</button>
  <button slot="secondary" id="fav">Ajouter aux favoris</button>
  <button slot="secondary" id="share">Partager</button>
  <button slot="primary" id="run" class="fr-btn--secondary">Exécuter</button>
`;

async function mount(inner: string, attrs = 'heading="Playground"'): Promise<AppActionBar> {
  document.body.innerHTML = `<app-action-bar ${attrs}>${inner}</app-action-bar>`;
  const bar = document.querySelector('app-action-bar') as AppActionBar;
  await bar.updateComplete;
  return bar;
}

const byId = (id: string) => document.getElementById(id) as HTMLButtonElement;
const toolbarIds = (bar: AppActionBar) =>
  Array.from(bar.toolbar!.querySelectorAll<HTMLElement>('button[id]'))
    .filter((b) => !b.closest('.app-menu__list'))
    .map((b) => b.id);

describe('<app-action-bar>', () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('est enregistré comme custom element', () => {
    expect(customElements.get('app-action-bar')).toBe(AppActionBar);
  });

  it('rend le h1, un role=toolbar nommé, et la primaire en dernier', async () => {
    const bar = await mount(SIX);
    expect(bar.querySelector('h1')?.textContent).toBe('Playground');
    const toolbar = bar.toolbar!;
    expect(toolbar.getAttribute('role')).toBe('toolbar');
    expect(toolbar.getAttribute('aria-label')).toBe('Actions de la page');
    expect(toolbarIds(bar)).toEqual(['tour', 'reset', 'copy', 'fav', 'share', 'run']);
    expect(bar.primary).toBe(byId('run'));
    // Aucun enfant slotté ne reste hors de la barre.
    expect(Array.from(bar.children).filter((c) => c.hasAttribute('slot')).length).toBe(0);
  });

  it('normalise les classes DSFR selon le rang (docs/ux/actions.md §4)', async () => {
    await mount(SIX);
    const cls = (id: string) => Array.from(byId(id).classList).sort();
    expect(cls('run')).toEqual(['fr-btn', 'fr-btn--sm']);
    expect(cls('copy')).toEqual(['fr-btn', 'fr-btn--secondary', 'fr-btn--sm']);
    expect(cls('reset')).toEqual(['fr-btn', 'fr-btn--sm', 'fr-btn--tertiary']);
    expect(cls('tour')).toEqual([
      'fr-btn',
      'fr-btn--sm',
      'fr-btn--tertiary-no-outline',
      'fr-icon-question-line',
    ]);
    expect(byId('run').getAttribute('type')).toBe('button');
  });

  it('conserve ids et écouteurs posés avant la mise en page (ADR-096)', async () => {
    document.body.innerHTML = `<app-action-bar heading="X"><button slot="primary" id="go">Go</button></app-action-bar>`;
    const onClick = vi.fn();
    byId('go').addEventListener('click', onClick);
    const bar = document.querySelector('app-action-bar') as AppActionBar;
    await bar.updateComplete;
    byId('go').click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(byId('go').closest('.app-action-bar__group--primary')).not.toBeNull();
  });

  it('au-delà de max-secondary (3), les secondaires passent dans Plus ▾', async () => {
    const bar = await mount(SIX + '<button slot="secondary" id="extra">Extra</button>');
    const more = bar.moreMenu!;
    expect(more.hidden).toBe(false);
    expect(toolbarIds(bar)).toEqual(['tour', 'reset', 'copy', 'fav', 'share', 'run']);
    expect(more.items.map((i) => i.id)).toEqual(['extra']);
    expect(byId('extra').getAttribute('role')).toBe('menuitem');

    // Sans débordement, Plus ▾ est masqué (attribut hidden, que le style
    // display:inline-block du composant ne doit pas écraser).
    const bar2 = await mount(SIX);
    expect(bar2.moreMenu!.hidden).toBe(true);
    expect(bar2.moreMenu!.hasAttribute('hidden')).toBe(true);
    expect(bar2.moreMenu!.isEmpty).toBe(true);
  });

  it('une seule primaire : la seconde est rétrogradée avec un avertissement', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bar = await mount(
      '<button slot="primary" id="p1">Un</button><button slot="primary" id="p2">Deux</button>'
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(bar.primary).toBe(byId('p1'));
    expect(byId('p2').classList.contains('fr-btn--secondary')).toBe(true);
    expect(toolbarIds(bar)).toEqual(['p2', 'p1']);
  });

  it('disabled-reason désactive la primaire et affiche la raison (§4.10)', async () => {
    const bar = await mount(
      SIX,
      'heading="X" disabled-reason="Sélectionnez une source pour exécuter"'
    );
    const run = byId('run');
    const reason = bar.querySelector('.app-action-bar__reason') as HTMLElement;
    expect(run.disabled).toBe(true);
    expect(run.getAttribute('aria-disabled')).toBe('true');
    expect(run.getAttribute('aria-describedby')).toBe(reason.id);
    expect(reason.hidden).toBe(false);
    expect(reason.textContent).toBe('Sélectionnez une source pour exécuter');

    bar.disabledReason = '';
    await bar.updateComplete;
    expect(run.disabled).toBe(false);
    expect(run.hasAttribute('aria-disabled')).toBe(false);
    expect(run.hasAttribute('aria-describedby')).toBe(false);
    expect(reason.hidden).toBe(true);
  });

  it('busy pose aria-busy sur la primaire', async () => {
    const bar = await mount(SIX);
    bar.busy = true;
    await bar.updateComplete;
    expect(byId('run').getAttribute('aria-busy')).toBe('true');
    bar.busy = false;
    await bar.updateComplete;
    expect(byId('run').hasAttribute('aria-busy')).toBe(false);
  });

  it('roving tabindex : la primaire est le tab stop, les flèches déplacent le focus', async () => {
    await mount(SIX);
    expect(byId('run').tabIndex).toBe(0);
    expect(['tour', 'reset', 'copy', 'fav', 'share'].every((id) => byId(id).tabIndex === -1)).toBe(
      true
    );
    byId('run').focus();
    const press = (el: HTMLElement, key: string) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    press(byId('run'), 'ArrowLeft');
    expect(document.activeElement).toBe(byId('share'));
    expect(byId('share').tabIndex).toBe(0);
    expect(byId('run').tabIndex).toBe(-1);
    press(byId('share'), 'Home');
    expect(document.activeElement).toBe(byId('tour'));
    press(byId('tour'), 'ArrowLeft'); // cycle
    expect(document.activeElement).toBe(byId('run'));
    press(byId('run'), 'End');
    expect(document.activeElement).toBe(byId('run'));
    press(byId('run'), 'ArrowRight'); // cycle
    expect(document.activeElement).toBe(byId('tour'));
  });

  it('les flèches sautent les boutons désactivés', async () => {
    await mount(
      '<button slot="secondary" id="a">A</button><button slot="secondary" id="b" disabled>B</button><button slot="primary" id="p">P</button>'
    );
    byId('p').focus();
    byId('p').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(byId('a'));
  });

  it('mobile : tout sauf la primaire est replié dans Plus ▾, et revient au retour desktop', async () => {
    stubMatchMedia(true);
    const bar = await mount(SIX);
    expect(bar.isMobile).toBe(true);
    // Aucun secondaire n'a d'icône DSFR dans SIX : tous repliés.
    expect(toolbarIds(bar)).toEqual(['run']);
    expect(bar.moreMenu!.items.map((i) => i.id)).toEqual(['tour', 'reset', 'copy', 'fav', 'share']);

    mql.listeners.forEach((fn) => fn({ matches: false }));
    await bar.updateComplete;
    expect(bar.isMobile).toBe(false);
    expect(toolbarIds(bar)).toEqual(['tour', 'reset', 'copy', 'fav', 'share', 'run']);
    expect(bar.moreMenu!.hidden).toBe(true);
    expect(byId('copy').classList.contains('fr-btn--secondary')).toBe(true);
  });

  it('un <app-menu> slotté est une action ; replié, ses entrées rejoignent Plus ▾ puis lui reviennent', async () => {
    const bar = await mount(
      `<button slot="secondary" id="s1">S1</button>
       <app-menu slot="secondary" id="open" label="Ouvrir dans"><button id="o1">Playground</button><button id="o2">Pipeline</button></app-menu>
       <button slot="primary" id="p">P</button>`,
      'heading="X" max-secondary="1"'
    );
    const more = bar.moreMenu!;
    expect(more.items.map((i) => i.id)).toEqual(['o1', 'o2']);
    expect(document.getElementById('open')).toBeNull();

    bar.maxSecondary = 2;
    bar.refresh();
    await bar.updateComplete;
    const open = bar.querySelector('#open') as AppMenu;
    expect(open).not.toBeNull();
    expect(open.variant).toBe('secondary');
    expect(open.items.map((i) => i.id)).toEqual(['o1', 'o2']);
    expect(more.hidden).toBe(true);
  });

  it('mobile : les secondaires à icône restent visibles en boutons icône (libellé sr-only)', async () => {
    stubMatchMedia(true);
    const bar = await mount(
      `<button slot="secondary" id="copy" class="fr-icon-clipboard-line fr-btn--icon-left">Copier le code</button>
       <button slot="secondary" id="share">Partager</button>
       <button slot="tertiary" id="tour" class="fr-icon-question-line">Visite guidée</button>
       <button slot="primary" id="run" class="fr-icon-play-line fr-btn--icon-left">Exécuter</button>`
    );
    expect(toolbarIds(bar)).toEqual(['copy', 'run']);
    const copy = byId('copy');
    expect(copy.querySelector('.fr-sr-only')?.textContent).toBe('Copier le code');
    expect(copy.classList.contains('fr-btn--icon-left')).toBe(false);
    expect(copy.getAttribute('title')).toBe('Copier le code');
    // La primaire garde son libellé visible.
    expect(byId('run').querySelector('.fr-sr-only')).toBeNull();
    expect(bar.moreMenu!.items.map((i) => i.id)).toEqual(['tour', 'share']);

    // Retour desktop : libellé et icône à gauche restaurés.
    mql.listeners.forEach((fn) => fn({ matches: false }));
    await bar.updateComplete;
    expect(copy.querySelector('.fr-sr-only')).toBeNull();
    expect(copy.textContent?.trim()).toBe('Copier le code');
    expect(copy.classList.contains('fr-btn--icon-left')).toBe(true);
  });

  it('addAction / removeAction après coup', async () => {
    const bar = await mount('<button slot="primary" id="p">P</button>');
    const late = document.createElement('button');
    late.id = 'late';
    late.textContent = 'Tard';
    bar.addAction(late, 'tertiary');
    expect(toolbarIds(bar)).toEqual(['late', 'p']);
    expect(late.classList.contains('fr-btn--tertiary')).toBe(true);
    bar.removeAction(late);
    expect(toolbarIds(bar)).toEqual(['p']);
    expect(document.getElementById('late')).toBeNull();
  });

  it('sans heading, pas de h1', async () => {
    const bar = await mount('<button slot="primary" id="p">P</button>', '');
    expect(bar.querySelector('h1')).toBeNull();
  });
});
