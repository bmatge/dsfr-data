import { LitElement, html, TemplateResult, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface SidemenuItem {
  id: string;
  label: string;
  href?: string;
  children?: SidemenuItem[];
}

export interface SidemenuSection {
  title?: string;
  items: SidemenuItem[];
}

declare global {
  interface Window {
    __APP_MENUS__?: Record<string, SidemenuSection[]>;
  }
  interface HTMLElementTagNameMap {
    'app-sidemenu': AppSidemenu;
  }
}

/**
 * <app-sidemenu> - Navigation laterale generique DSFR
 *
 * Lit le menu depuis window.__APP_MENUS__[section] (defini par un <script> externe).
 * Detecte automatiquement la page active via window.location.
 *
 * @example
 * <script src="guide-menu.js"></script>
 * <app-sidemenu section="guide"></app-sidemenu>
 */
@customElement('app-sidemenu')
export class AppSidemenu extends LitElement {
  @property({ type: String })
  section = '';

  @property({ type: String, attribute: 'active-path' })
  activePath = '';

  @property({ type: String, attribute: 'base-path' })
  basePath = '';

  // Light DOM for DSFR style inheritance
  createRenderRoot() {
    return this;
  }

  private get _base(): string {
    const bp = this.basePath;
    if (!bp) return '';
    return bp.endsWith('/') ? bp : bp + '/';
  }

  private _getMenu(): SidemenuSection[] {
    return window.__APP_MENUS__?.[this.section] ?? [];
  }

  private _getActivePath(): string {
    if (this.activePath) return this.activePath;

    // Auto-detect from current URL
    const pathname = window.location.pathname;
    const filename = pathname.split('/').pop() || '';
    const hash = window.location.hash;

    const menu = this._getMenu();
    for (const section of menu) {
      for (const item of section.items) {
        const match = this._findMatchingItem(item, filename, hash);
        if (match) return match;
      }
    }
    return '';
  }

  private _findMatchingItem(item: SidemenuItem, filename: string, hash: string): string | null {
    // Check href against current filename + hash
    const href = item.href;
    if (hash && href === filename + hash) return item.id;
    if (href === filename) return item.id;
    // Anchor-only links on same page
    if (hash && href === hash) return item.id;

    if (item.children) {
      for (const child of item.children) {
        const match = this._findMatchingItem(child, filename, hash);
        if (match) return match;
      }
      // No hash: if a child href matches filename + any hash, select first matching child
      // This ensures the parent section expands when visiting the page without a specific anchor
      if (!hash) {
        const firstMatch = item.children.find(child => {
          const [childFile] = (child.href || '').split('#');
          return childFile === filename;
        });
        if (firstMatch) return firstMatch.id;
      }
    }
    return null;
  }

  private _isActive(itemId: string, activePath: string): boolean {
    return activePath === itemId;
  }

  private _isParentActive(item: SidemenuItem, activePath: string): boolean {
    if (!item.children) return false;
    return item.children.some(child =>
      this._isActive(child.id, activePath) || this._isParentActive(child, activePath)
    );
  }

  private _renderItem(item: SidemenuItem, activePath: string): TemplateResult {
    const isActive = this._isActive(item.id, activePath);

    if (item.children) {
      const sectionId = `fr-sidemenu-${item.id}`;
      const isExpanded = this._isParentActive(item, activePath);

      return html`
        <li class="fr-sidemenu__item">
          <button class="fr-sidemenu__btn"
                  aria-expanded="${isExpanded}"
                  aria-controls="${sectionId}">
            ${item.label}
          </button>
          <div class="fr-collapse ${isExpanded ? 'fr-collapse--expanded' : ''}" id="${sectionId}">
            <ul class="fr-sidemenu__list">
              ${item.children.map(child => this._renderItem(child, activePath))}
            </ul>
          </div>
        </li>
      `;
    }

    return html`
      <li class="fr-sidemenu__item ${isActive ? 'fr-sidemenu__item--active' : ''}">
        <a class="fr-sidemenu__link"
           href="${this._base}${item.href}"
           ${isActive ? html`aria-current="true"` : nothing}>
          ${item.label}
        </a>
      </li>
    `;
  }

  render() {
    const menu = this._getMenu();
    if (!menu.length) return nothing;

    const activePath = this._getActivePath();

    return html`
      <nav class="fr-sidemenu guide-sidemenu" role="navigation" aria-labelledby="app-sidemenu-title">
        <div class="fr-sidemenu__inner">
          <button class="fr-sidemenu__btn" hidden aria-controls="app-sidemenu-wrapper" aria-expanded="true">Menu</button>
          <div class="fr-collapse" id="app-sidemenu-wrapper">
            ${menu.map((section, i) => html`
              ${section.title ? html`
                <div class="fr-sidemenu__title ${i > 0 ? 'fr-mt-1w' : ''}"
                     id="${i === 0 ? 'app-sidemenu-title' : `app-sidemenu-title-${i}`}">
                  ${section.title}
                </div>
              ` : nothing}
              <ul class="fr-sidemenu__list">
                ${section.items.map(item => this._renderItem(item, activePath))}
              </ul>
            `)}
          </div>
        </div>
      </nav>

      <style>
        .guide-sidemenu {
          flex: 0 0 280px;
          position: sticky;
          top: 1rem;
          height: fit-content;
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
        }
        @media (max-width: 992px) {
          .guide-sidemenu {
            position: static;
            flex: none;
            max-height: none;
          }
        }
        .fr-sidemenu__link[aria-current="true"] {
          font-weight: 700;
          color: var(--text-action-high-blue-france);
        }
      </style>
    `;
  }
}
