import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * <app-menu> - Bouton-menu DSFR (le DSFR n'a pas de « dropdown » natif)
 *
 * Patron ARIA « menu button » : un bouton `aria-haspopup="menu"` ouvre une
 * liste `role="menu"` d'entrées `role="menuitem"`. Navigation aux flèches,
 * Home/End, Échap ferme et restitue le focus, clic hors du menu ferme.
 *
 * Les entrées sont les enfants directs `<button>` / `<a>` fournis en Light
 * DOM : leurs ids et leurs écouteurs sont conservés (ADR-096), le composant
 * ne fait que les déplacer dans la liste. Sert aux menus `Ouvrir dans ▾`,
 * `Exporter ▾` et `Plus ▾` de l'AppActionBar (docs/ux/actions.md §5).
 *
 * @example
 * <app-menu label="Ouvrir dans" variant="secondary">
 *   <button type="button" id="open-playground">Playground</button>
 *   <a href="../pipeline-helper/index.html">Pipeline</a>
 * </app-menu>
 */
let menuSeq = 0;

export type AppMenuVariant = 'primary' | 'secondary' | 'tertiary' | 'tertiary-no-outline';

const VARIANT_CLASS: Record<AppMenuVariant, string> = {
  primary: '',
  secondary: 'fr-btn--secondary',
  tertiary: 'fr-btn--tertiary',
  'tertiary-no-outline': 'fr-btn--tertiary-no-outline',
};

export function injectAppMenuStyles(): void {
  if (document.getElementById('app-menu-style')) return;
  const style = document.createElement('style');
  style.id = 'app-menu-style';
  style.textContent = `
app-menu{display:inline-block;position:relative}
.app-menu__list{position:absolute;right:0;top:calc(100% + .25rem);z-index:900;min-width:12rem;margin:0;padding:.25rem 0;list-style:none;background:var(--background-default-grey);box-shadow:0 6px 18px rgba(0,0,0,.16);border:1px solid var(--border-default-grey)}
.app-menu__list[hidden]{display:none}
.app-menu__list li{margin:0}
.app-menu__item{display:flex;align-items:center;gap:.5rem;width:100%;box-sizing:border-box;min-height:2.5rem;padding:.5rem 1rem;margin:0;border:0;border-radius:0;background:none;box-shadow:none;color:var(--text-action-high-blue-france);font:inherit;font-size:.875rem;line-height:1.5rem;text-align:left;text-decoration:none;cursor:pointer;white-space:nowrap}
.app-menu__item:hover,.app-menu__item:focus-visible{background:var(--background-alt-blue-france-hover)}
.app-menu__item:focus-visible{outline:2px solid var(--border-active-blue-france);outline-offset:-2px}
.app-menu__item[disabled],.app-menu__item[aria-disabled="true"]{color:var(--text-disabled-grey);cursor:not-allowed;background:none}
.app-menu__item[class*="fr-icon-"]::before{--icon-size:1rem}
`;
  document.head.appendChild(style);
}

@customElement('app-menu')
export class AppMenu extends LitElement {
  /** Libellé du bouton (texte visible, ou nom accessible si `icon-only`). */
  @property({ type: String })
  label = '';

  /** Variante DSFR du bouton déclencheur. */
  @property({ type: String })
  variant: AppMenuVariant = 'secondary';

  /** Bouton icône seul (menu « Plus ▾ ») : classe `fr-icon-*` dans `icon`. */
  @property({ type: Boolean, attribute: 'icon-only' })
  iconOnly = false;

  /** Classe d'icône DSFR du déclencheur (`fr-icon-more-line`…). */
  @property({ type: String })
  icon = '';

  /** Taille : `sm` (barres d'outils) ou `md`. */
  @property({ type: String })
  size: 'sm' | 'md' = 'sm';

  @property({ type: Boolean, reflect: true })
  open = false;

  private _menuId = `app-menu-${++menuSeq}`;
  private _pending: Element[] = [];
  private _outsideHandler = (e: MouseEvent) => {
    if (!this.contains(e.target as Node)) this.close();
  };

  // Light DOM pour hériter des styles DSFR
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    injectAppMenuStyles();
    // Enfants fournis en HTML : déplacés dans la liste au premier rendu.
    this._pending = Array.from(this.children).filter(
      (c) => c.tagName === 'BUTTON' || c.tagName === 'A'
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._outsideHandler);
  }

  firstUpdated() {
    // Les enfants peuvent n'être attachés qu'après connectedCallback (parseur
    // HTML, happy-dom) : on recollecte ici, en excluant ce que Lit a rendu.
    const late = Array.from(this.children).filter(
      (c) =>
        (c.tagName === 'BUTTON' || c.tagName === 'A') &&
        !c.classList.contains('app-menu__trigger') &&
        !this._pending.includes(c)
    );
    const pending = [...this._pending, ...late];
    this._pending = [];
    for (const el of pending) this.addItem(el);
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('open')) {
      if (this.open) {
        requestAnimationFrame(() => document.addEventListener('click', this._outsideHandler));
      } else {
        document.removeEventListener('click', this._outsideHandler);
      }
    }
  }

  /** Bouton déclencheur (tab stop de la barre d'outils). */
  get trigger(): HTMLButtonElement | null {
    return (
      (Array.from(this.children).find((c) => c.classList.contains('app-menu__trigger')) as
        HTMLButtonElement | undefined) ?? null
    );
  }

  /** Entrées actuelles du menu, dans l'ordre. */
  get items(): HTMLElement[] {
    return Array.from(this.querySelectorAll<HTMLElement>('.app-menu__item'));
  }

  /**
   * Ajoute une entrée (bouton ou lien existant, écouteurs conservés). Les
   * classes d'origine sont mémorisées pour `removeItem`.
   */
  addItem(el: Element): void {
    const list = this._list();
    if (!list) {
      this._pending.push(el);
      return;
    }
    const item = el as HTMLElement;
    if (item.dataset.appMenuClass === undefined) item.dataset.appMenuClass = item.className;
    item.className = 'app-menu__item';
    // Conserve une éventuelle icône DSFR du bouton d'origine.
    const icon = (item.dataset.appMenuClass || '')
      .split(/\s+/)
      .find((c) => c.startsWith('fr-icon-'));
    if (icon) item.classList.add(icon);
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    const li = document.createElement('li');
    li.setAttribute('role', 'none');
    li.appendChild(item);
    list.appendChild(li);
    this.requestUpdate();
  }

  /** Retire une entrée et lui rend ses classes d'origine. */
  removeItem(el: Element): Element {
    const item = el as HTMLElement;
    const li = item.parentElement;
    if (li && li.parentElement === this._list()) li.remove();
    if (item.dataset.appMenuClass !== undefined) {
      item.className = item.dataset.appMenuClass;
      delete item.dataset.appMenuClass;
    }
    item.removeAttribute('role');
    item.removeAttribute('tabindex');
    this.requestUpdate();
    return item;
  }

  /**
   * Vide le menu et rend les entrées (dans l'ordre), y compris celles pas
   * encore adoptées (menu pas encore rendu, ou enfants attachés tardivement).
   */
  takeItems(): Element[] {
    const late = Array.from(this.children).filter(
      (c) =>
        (c.tagName === 'BUTTON' || c.tagName === 'A') &&
        !c.classList.contains('app-menu__trigger') &&
        !c.classList.contains('app-menu__item') &&
        !this._pending.includes(c)
    );
    const pending = [...this._pending, ...late];
    this._pending = [];
    pending.forEach((el) => el.remove());
    return [...this.items.map((it) => this.removeItem(it)), ...pending];
  }

  get isEmpty(): boolean {
    return this.items.length === 0 && this._pending.length === 0;
  }

  openMenu(focus: 'first' | 'last' | 'none' = 'first'): void {
    if (this.items.length === 0) return;
    this.open = true;
    if (focus === 'none') return;
    const items = this._enabledItems();
    const target = focus === 'last' ? items[items.length - 1] : items[0];
    requestAnimationFrame(() => target?.focus());
  }

  close(restoreFocus = false): void {
    if (!this.open) return;
    this.open = false;
    if (restoreFocus) this.trigger?.focus();
  }

  toggle(): void {
    if (this.open) this.close();
    else this.openMenu();
  }

  private _list(): HTMLUListElement | null {
    return (
      (Array.from(this.children).find((c) => c.classList.contains('app-menu__list')) as
        HTMLUListElement | undefined) ?? null
    );
  }

  private _enabledItems(): HTMLElement[] {
    return this.items.filter(
      (it) => !(it as HTMLButtonElement).disabled && it.getAttribute('aria-disabled') !== 'true'
    );
  }

  private _onTriggerKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.openMenu('first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.openMenu('last');
    } else if (e.key === 'Escape' && this.open) {
      e.preventDefault();
      this.close(true);
    }
  }

  private _onListKeydown(e: KeyboardEvent): void {
    const items = this._enabledItems();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (e.key) {
      case 'ArrowDown':
        next = current < 0 ? 0 : (current + 1) % items.length;
        break;
      case 'ArrowUp':
        next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
        return;
      case 'Tab':
        this.close();
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    items[next]?.focus();
  }

  private _onListClick(e: MouseEvent): void {
    const item = (e.target as HTMLElement).closest('.app-menu__item');
    if (item) this.close(true);
  }

  private _onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as Node | null;
    if (next && this.contains(next)) return;
    this.close();
  }

  render() {
    const size = this.size === 'sm' ? 'fr-btn--sm' : '';
    const variant = VARIANT_CLASS[this.variant] ?? '';
    const iconClass = this.iconOnly
      ? this.icon || 'fr-icon-more-line'
      : 'fr-icon-arrow-down-s-line fr-btn--icon-right';
    return html`
      <button
        type="button"
        class="fr-btn ${size} ${variant} ${iconClass} app-menu__trigger"
        aria-haspopup="menu"
        aria-expanded=${this.open ? 'true' : 'false'}
        aria-controls=${this._menuId}
        title=${this.iconOnly ? this.label : nothing}
        @click=${this.toggle}
        @keydown=${this._onTriggerKeydown}
      >
        ${this.iconOnly ? html`<span class="fr-sr-only">${this.label}</span>` : this.label}
      </button>
      <ul
        class="app-menu__list"
        role="menu"
        id=${this._menuId}
        aria-label=${this.label}
        ?hidden=${!this.open}
        @keydown=${this._onListKeydown}
        @click=${this._onListClick}
        @focusout=${this._onFocusOut}
      ></ul>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-menu': AppMenu;
  }
}
