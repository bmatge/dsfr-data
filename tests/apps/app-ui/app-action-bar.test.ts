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
  <button slot="help" id="tour" class="fr-icon-question-line">Visite guidée</button>
  <button slot="tertiary" id="reset">Réinitialiser</button>
  <button slot="secondary" id="copy" class="fr-btn fr-btn--tertiary fr-btn--lg fr-icon-clipboard-line fr-btn--icon-left">Copier le code</button>
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

  it('rend le h1, un role=toolbar nommé : ? · Plus d’actions · secondaire · primaire', async () => {
    const bar = await mount(SIX);
    expect(bar.querySelector('h1')?.textContent).toBe('Playground');
    const toolbar = bar.toolbar!;
    expect(toolbar.getAttribute('role')).toBe('toolbar');
    expect(toolbar.getAttribute('aria-label')).toBe('Actions de la page');
    expect(toolbarIds(bar)).toEqual(['tour', 'copy', 'run']);
    expect(bar.primary).toBe(byId('run'));
    // Aucun enfant slotté ne reste hors de la barre.
    expect(Array.from(bar.children).filter((c) => c.hasAttribute('slot')).length).toBe(0);
    // Plus d'actions : secondaires repliées puis tertiaires, séparées.
    const more = bar.moreMenu!;
    expect(more.hidden).toBe(false);
    expect(more.items.map((i) => i.id)).toEqual(['fav', 'share', 'reset']);
    expect(more.querySelectorAll('[role="separator"]').length).toBe(1);
    // Le déclencheur du menu est un bouton texte en desktop.
    expect(more.trigger!.textContent?.trim()).toBe("Plus d'actions");
    expect(more.iconOnly).toBe(false);
  });

  it('normalise les classes DSFR selon le rang (docs/ux/actions.md §4)', async () => {
    await mount(SIX);
    const cls = (id: string) => Array.from(byId(id).classList).sort();
    expect(cls('run')).toEqual(['fr-btn', 'fr-btn--sm']);
    expect(cls('copy')).toEqual([
      'fr-btn',
      'fr-btn--icon-left',
      'fr-btn--secondary',
      'fr-btn--sm',
      'fr-icon-clipboard-line',
    ]);
    // Aide : tertiaire sans contour, icône seule avec libellé sr-only.
    expect(cls('tour')).toEqual([
      'fr-btn',
      'fr-btn--sm',
      'fr-btn--tertiary-no-outline',
      'fr-icon-question-line',
    ]);
    expect(byId('tour').querySelector('.fr-sr-only')?.textContent).toBe('Visite guidée');
    expect(byId('tour').getAttribute('title')).toBe('Visite guidée');
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

  it('max-secondary (1 par défaut) : une seule secondaire visible, Plus d’actions masqué si vide', async () => {
    const bar = await mount(
      '<button slot="secondary" id="a">A</button><button slot="secondary" id="b">B</button><button slot="primary" id="p">P</button>',
      'heading="X" max-secondary="2"'
    );
    expect(toolbarIds(bar)).toEqual(['a', 'b', 'p']);
    expect(bar.moreMenu!.hidden).toBe(true);
    expect(bar.moreMenu!.hasAttribute('hidden')).toBe(true);
    expect(bar.moreMenu!.isEmpty).toBe(true);
  });

  it('une seule primaire : la seconde est rétrogradée en secondaire avec un avertissement', async () => {
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
    expect(['tour', 'copy'].every((id) => byId(id).tabIndex === -1)).toBe(true);
    byId('run').focus();
    const press = (el: HTMLElement, key: string) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    press(byId('run'), 'ArrowLeft');
    expect(document.activeElement).toBe(byId('copy'));
    expect(byId('copy').tabIndex).toBe(0);
    expect(byId('run').tabIndex).toBe(-1);
    press(byId('copy'), 'Home');
    expect(document.activeElement).toBe(byId('tour'));
    press(byId('tour'), 'ArrowLeft'); // cycle
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

  it('mobile : mêmes contrôles — Plus d’actions en icône, secondaire en bouton icône, retour desktop', async () => {
    stubMatchMedia(true);
    const bar = await mount(SIX);
    expect(bar.isMobile).toBe(true);
    expect(toolbarIds(bar)).toEqual(['tour', 'copy', 'run']);
    expect(bar.moreMenu!.iconOnly).toBe(true);
    expect(byId('copy').querySelector('.fr-sr-only')?.textContent).toBe('Copier le code');
    expect(byId('copy').classList.contains('fr-btn--icon-left')).toBe(false);
    expect(bar.moreMenu!.items.map((i) => i.id)).toEqual(['fav', 'share', 'reset']);

    mql.listeners.forEach((fn) => fn({ matches: false }));
    await bar.updateComplete;
    expect(bar.isMobile).toBe(false);
    expect(bar.moreMenu!.iconOnly).toBe(false);
    expect(byId('copy').querySelector('.fr-sr-only')).toBeNull();
    expect(byId('copy').textContent?.trim()).toBe('Copier le code');
    expect(byId('copy').classList.contains('fr-btn--icon-left')).toBe(true);
  });

  it('un <app-menu> slotté : visible s’il est la secondaire retenue, aplati dans Plus d’actions sinon', async () => {
    const bar = await mount(
      `<button slot="secondary" id="s1">S1</button>
       <app-menu slot="secondary" id="open" label="Ouvrir dans"><button id="o1">Playground</button><button id="o2">Pipeline</button></app-menu>
       <button slot="primary" id="p">P</button>`
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

  it('la primaire garde son libellé en mobile', async () => {
    stubMatchMedia(true);
    await mount(SIX);
    expect(byId('run').querySelector('.fr-sr-only')).toBeNull();
    expect(byId('run').textContent?.trim()).toBe('Exécuter');
  });

  it('addAction / removeAction après coup', async () => {
    const bar = await mount('<button slot="primary" id="p">P</button>');
    const late = document.createElement('button');
    late.id = 'late';
    late.textContent = 'Tard';
    bar.addAction(late, 'secondary');
    expect(toolbarIds(bar)).toEqual(['late', 'p']);
    expect(late.classList.contains('fr-btn--secondary')).toBe(true);
    bar.removeAction(late);
    expect(toolbarIds(bar)).toEqual(['p']);
    expect(document.getElementById('late')).toBeNull();
  });

  it('reason-host : la raison est déplacée dans l’hôte, aria-describedby conservé', async () => {
    document.body.innerHTML = '<div id="aside"></div>';
    const bar = document.createElement('app-action-bar') as AppActionBar;
    bar.setAttribute('heading', 'X');
    bar.setAttribute('reason-host', '#aside');
    bar.setAttribute('disabled-reason', 'Il manque : une source de données.');
    bar.innerHTML = '<button slot="primary" id="p">P</button>';
    document.body.appendChild(bar);
    await bar.updateComplete;
    await bar.updateComplete;
    const reason = document.querySelector('#aside .app-action-bar__reason') as HTMLElement;
    expect(reason).not.toBeNull();
    expect(reason.textContent).toBe('Il manque : une source de données.');
    expect(bar.querySelector('.app-action-bar__reason')).toBeNull();
    expect(byId('p').getAttribute('aria-describedby')).toBe(reason.id);
    expect(byId('p').hasAttribute('disabled')).toBe(true);
    bar.removeAttribute('disabled-reason');
    await bar.updateComplete;
    expect(reason.hidden).toBe(true);
    expect(byId('p').hasAttribute('disabled')).toBe(false);
  });

  it('slot="context" : placé après le titre, hors du toolbar', async () => {
    const bar = await mount(
      `<div slot="context"><label for="ex">Exemple</label><select id="ex" class="fr-select"></select></div>
       <button slot="primary" id="p">P</button>`
    );
    const ctx = bar.querySelector('.app-action-bar__context')!;
    expect(ctx.querySelector('#ex')).not.toBeNull();
    expect(bar.toolbar!.querySelector('#ex')).toBeNull();
    expect(ctx.previousElementSibling?.tagName).toBe('H1');
  });

  it('sans heading, pas de h1', async () => {
    const bar = await mount('<button slot="primary" id="p">P</button>', '');
    expect(bar.querySelector('h1')).toBeNull();
  });
});
