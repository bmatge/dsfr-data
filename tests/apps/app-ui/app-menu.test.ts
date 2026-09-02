import { describe, it, expect, afterEach, vi } from 'vitest';
import { AppMenu } from '../../../packages/app-ui/src/app-menu.js';

/**
 * <app-menu> — bouton-menu ARIA (docs/ux/actions.md §5, lot UX 2 #539).
 * Les entrées sont des boutons/liens fournis en Light DOM : ids et écouteurs
 * conservés (ADR-096).
 */

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function mount(inner: string, attrs = 'label="Ouvrir dans"'): Promise<AppMenu> {
  document.body.innerHTML = `<app-menu ${attrs}>${inner}</app-menu>`;
  const menu = document.querySelector('app-menu') as AppMenu;
  await menu.updateComplete;
  return menu;
}

describe('<app-menu>', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('est enregistré comme custom element', () => {
    expect(customElements.get('app-menu')).toBe(AppMenu);
  });

  it('rend un bouton aria-haspopup relié à une liste role=menu, fermée par défaut', async () => {
    const menu = await mount('<button id="a">Playground</button><a id="b" href="#x">Pipeline</a>');
    const trigger = menu.trigger!;
    const list = menu.querySelector('[role="menu"]') as HTMLElement;
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe(list.id);
    expect(trigger.textContent?.trim()).toBe('Ouvrir dans');
    expect(trigger.classList.contains('fr-btn--secondary')).toBe(true);
    expect(list.hidden).toBe(true);
    expect(list.getAttribute('aria-label')).toBe('Ouvrir dans');
  });

  it('déplace les enfants en entrées role=menuitem, ids et écouteurs conservés', async () => {
    const menu = await mount(
      '<button id="a" class="fr-btn fr-icon-flask-line">Playground</button><a id="b" href="#x">Pipeline</a>'
    );
    const items = menu.items;
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(items.every((i) => i.getAttribute('role') === 'menuitem' && i.tabIndex === -1)).toBe(
      true
    );
    expect(items[0].closest('li')?.getAttribute('role')).toBe('none');
    expect(items[0].classList.contains('app-menu__item')).toBe(true);
    expect(items[0].classList.contains('fr-btn')).toBe(false);
    // L'icône DSFR d'origine est gardée.
    expect(items[0].classList.contains('fr-icon-flask-line')).toBe(true);

    const onClick = vi.fn();
    items[0].addEventListener('click', onClick);
    menu.openMenu('none');
    await menu.updateComplete;
    items[0].click();
    expect(onClick).toHaveBeenCalledTimes(1);
    // Un clic sur une entrée ferme le menu et rend le focus au déclencheur.
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(menu.trigger);
  });

  it('toggle ouvre/ferme, Échap ferme et restitue le focus', async () => {
    const menu = await mount('<button id="a">A</button>');
    const list = menu.querySelector('[role="menu"]') as HTMLElement;
    menu.trigger!.click();
    await menu.updateComplete;
    expect(menu.open).toBe(true);
    expect(list.hidden).toBe(false);
    expect(menu.trigger!.getAttribute('aria-expanded')).toBe('true');

    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await menu.updateComplete;
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(menu.trigger);
  });

  it('flèches : ArrowDown ouvre sur la première entrée, cycle, Home/End', async () => {
    const menu = await mount(
      '<button id="a">A</button><button id="b" disabled>B</button><button id="c">C</button>'
    );
    const [a, , c] = menu.items;
    menu.trigger!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await menu.updateComplete;
    await raf();
    expect(menu.open).toBe(true);
    expect(document.activeElement).toBe(a);

    const list = menu.querySelector('[role="menu"]') as HTMLElement;
    const press = (key: string) =>
      list.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    press('ArrowDown'); // saute B (disabled)
    expect(document.activeElement).toBe(c);
    press('ArrowDown'); // cycle
    expect(document.activeElement).toBe(a);
    press('End');
    expect(document.activeElement).toBe(c);
    press('Home');
    expect(document.activeElement).toBe(a);
    press('ArrowUp');
    expect(document.activeElement).toBe(c);
  });

  it('un clic hors du menu le ferme', async () => {
    const menu = await mount('<button id="a">A</button>');
    menu.openMenu('none');
    await menu.updateComplete;
    await raf();
    document.body.click();
    await menu.updateComplete;
    expect(menu.open).toBe(false);
  });

  it('addItem / removeItem / takeItems rendent leurs classes aux entrées', async () => {
    const menu = await mount('');
    expect(menu.isEmpty).toBe(true);
    const btn = document.createElement('button');
    btn.id = 'late';
    btn.className = 'fr-btn fr-btn--sm fr-btn--secondary';
    menu.addItem(btn);
    expect(menu.isEmpty).toBe(false);
    expect(btn.className).toBe('app-menu__item');
    expect(btn.getAttribute('role')).toBe('menuitem');

    const back = menu.takeItems();
    expect(back).toEqual([btn]);
    expect(btn.className).toBe('fr-btn fr-btn--sm fr-btn--secondary');
    expect(btn.hasAttribute('role')).toBe(false);
    expect(btn.hasAttribute('tabindex')).toBe(false);
    expect(menu.isEmpty).toBe(true);
  });

  it('icon-only : bouton icône avec libellé sr-only et title', async () => {
    const menu = await mount(
      '<button>A</button>',
      'label="Plus d\'actions" icon-only icon="fr-icon-more-line" variant="tertiary"'
    );
    const trigger = menu.trigger!;
    expect(trigger.classList.contains('fr-icon-more-line')).toBe(true);
    expect(trigger.classList.contains('fr-btn--tertiary')).toBe(true);
    expect(trigger.getAttribute('title')).toBe("Plus d'actions");
    expect(trigger.querySelector('.fr-sr-only')?.textContent).toBe("Plus d'actions");
  });
});
