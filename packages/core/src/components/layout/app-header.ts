import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { checkAuth, logout, onAuthChange, isDbMode, onSyncStatusChange } from '@dsfr-data/shared';
import type { User, SyncStatus } from '@dsfr-data/shared';

// Side-effect import: register custom elements
import './auth-modal.js';
import './password-change-modal.js';

/**
 * <app-header> - Header DSFR avec navigation
 *
 * Affiche le header conforme DSFR avec logo, titre du service,
 * et menu de navigation. La page active est mise en surbrillance.
 * En mode DB, affiche un bouton Connexion/Deconnexion.
 *
 * @example
 * <app-header current-page="builder" base-path=""></app-header>
 * <app-header current-page="composants" base-path="../"></app-header>
 */
@customElement('app-header')
export class AppHeader extends LitElement {
  /**
   * Page courante pour mettre en surbrillance dans la nav
   * Valeurs: 'accueil' | 'composants' | 'builder' | 'builder-ia' | 'dashboard' | 'playground' | 'favoris' | 'sources'
   */
  @property({ type: String, attribute: 'current-page' })
  currentPage = '';

  /**
   * Chemin de base pour les liens (ex: '', '../', '../../')
   */
  @property({ type: String, attribute: 'base-path' })
  basePath = '';

  @state()
  private _favCount = 0;

  @state()
  private _user: User | null = null;

  @state()
  private _dbMode = false;

  @state()
  private _syncStatus: SyncStatus = 'idle';

  @state()
  private _syncErrorCount = 0;

  @state()
  private _userMenuOpen = false;

  private _unsubAuth?: () => void;
  private _unsubSync?: () => void;
  private _outsideClickHandler = (e: MouseEvent) => {
    const menu = this.querySelector('.app-header-user-menu');
    if (menu && !menu.contains(e.target as Node)) {
      this._userMenuOpen = false;
    }
  };

  // Light DOM pour hériter des styles DSFR
  createRenderRoot() {
    return this;
  }

  /** Normalized base path with trailing slash */
  private get _base(): string {
    const bp = this.basePath;
    if (!bp) return '';
    return bp.endsWith('/') ? bp : bp + '/';
  }

  connectedCallback() {
    super.connectedCallback();
    // Read favorites count
    try {
      const favs = JSON.parse(localStorage.getItem('dsfr-data-favorites') || '[]');
      this._favCount = Array.isArray(favs) ? favs.length : 0;
    } catch {
      /* ignore */
    }
    // Inject active page style once
    if (!document.getElementById('app-header-active-style')) {
      const style = document.createElement('style');
      style.id = 'app-header-active-style';
      style.textContent = `.fr-nav__link[aria-current="page"]{font-weight:700;border-bottom:2px solid var(--border-action-high-blue-france);color:var(--text-action-high-blue-france)}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.app-header-user-menu{position:relative}.app-header-user-menu__dropdown{display:none;position:absolute;right:0;top:100%;z-index:1000;min-width:240px;background:var(--background-default-grey);box-shadow:0 8px 16px rgba(0,0,0,.16);padding:0}.app-header-user-menu__dropdown[data-open]{display:block}.app-header-user-menu__info{padding:1rem 1.5rem;border-bottom:1px solid var(--border-default-grey)}.app-header-user-menu__info-name{font-weight:700;color:var(--text-title-grey);margin:0;font-size:.875rem}.app-header-user-menu__info-email{color:var(--text-mention-grey);margin:0;font-size:.75rem}.app-header-user-menu__list{list-style:none;padding:0;margin:0}.app-header-user-menu__list li{border-bottom:1px solid var(--border-default-grey)}.app-header-user-menu__list li:last-child{border-bottom:none}.app-header-user-menu__list button{display:flex;align-items:center;gap:.5rem;width:100%;padding:.75rem 1.5rem;border:none;background:none;cursor:pointer;font-size:.875rem;color:var(--text-action-high-blue-france);font-family:inherit}.app-header-user-menu__list button:hover{background:var(--background-alt-blue-france-hover)}.app-header-user-menu__list button::before{font-family:'remixicon';font-size:1rem}`;
      document.head.appendChild(style);
    }
    // Check auth state
    this._initAuth();
    // Subscribe to sync status
    this._unsubSync = onSyncStatusChange((status, errorCount) => {
      this._syncStatus = status;
      this._syncErrorCount = errorCount;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubAuth?.();
    this._unsubSync?.();
    document.removeEventListener('click', this._outsideClickHandler);
  }

  private async _initAuth(): Promise<void> {
    try {
      const authState = await checkAuth();
      this._dbMode = await isDbMode(); // already cached, returns instantly
      this._user = authState.user;
      this._unsubAuth = onAuthChange((state) => {
        this._user = state.user;
      });

      // Auto-open reset password modal if URL has ?reset-password=TOKEN
      if (this._dbMode && !this._user) {
        const params = new URLSearchParams(window.location.search);
        const resetToken = params.get('reset-password');
        if (resetToken) {
          // Clean URL
          const url = new URL(window.location.href);
          url.searchParams.delete('reset-password');
          window.history.replaceState({}, '', url.toString());
          // Wait for next render then open modal
          await this.updateComplete;
          const modal = this.querySelector('auth-modal') as
            | (Element & { open?: (mode: string, token?: string) => void })
            | null;
          modal?.open?.('reset', resetToken);
        }
      }
    } catch {
      // Backend not available — stay in simple mode
    }
  }

  private _openAuthModal(): void {
    const modal = this.querySelector('auth-modal') as
      | (Element & { open?: (mode: string) => void })
      | null;
    modal?.open?.('login');
  }

  private _openPasswordChangeModal(): void {
    this._userMenuOpen = false;
    const modal = this.querySelector('password-change-modal') as
      | (Element & { open?: () => void })
      | null;
    modal?.open?.();
  }

  private async _handleLogout(): Promise<void> {
    this._userMenuOpen = false;
    await logout();
    window.location.reload();
  }

  private _toggleUserMenu(e: Event): void {
    e.stopPropagation();
    this._userMenuOpen = !this._userMenuOpen;
    if (this._userMenuOpen) {
      // Defer so the current click doesn't immediately close
      requestAnimationFrame(() => {
        document.addEventListener('click', this._outsideClickHandler);
      });
    } else {
      document.removeEventListener('click', this._outsideClickHandler);
    }
  }

  private _getNavItems() {
    return [
      { id: 'accueil', label: 'Accueil', href: 'index.html' },
      { id: 'sources', label: 'Sources', href: 'apps/sources/index.html' },
      { id: 'builder-ia', label: 'Assistant IA', href: 'apps/builder-ia/index.html' },
      { id: 'builder', label: 'Créer graphique', href: 'apps/builder/index.html' },
      { id: 'builder-carto', label: 'Créer carte', href: 'apps/builder-carto/index.html' },
      { id: 'playground', label: 'Editeur HTML', href: 'apps/playground/index.html' },
      { id: 'pipeline-helper', label: 'Flux de données', href: 'apps/pipeline-helper/index.html' },
      { id: 'dashboard', label: 'Tableau de bord', href: 'apps/dashboard/index.html' },
      { id: 'monitoring', label: 'Suivi', href: 'apps/monitoring/index.html' },
      { id: 'admin', label: 'Admin', href: 'apps/admin/index.html' },
    ];
  }

  private _renderSyncStatus() {
    if (!this._dbMode) return nothing;
    if (this._syncStatus === 'idle' && this._syncErrorCount === 0) return nothing;

    if (this._syncStatus === 'syncing') {
      return html`
        <li>
          <span
            class="fr-btn fr-btn--tertiary-no-outline"
            style="pointer-events:none;color:var(--text-mention-grey);"
            title="Synchronisation en cours..."
          >
            <i class="ri-refresh-line" style="animation:spin 1s linear infinite;"></i>
          </span>
        </li>
      `;
    }

    if (this._syncStatus === 'error' || this._syncErrorCount > 0) {
      return html`
        <li>
          <span
            class="fr-btn fr-btn--tertiary-no-outline"
            style="pointer-events:none;color:var(--text-default-warning);"
            title="Erreurs de synchronisation (${this._syncErrorCount})"
          >
            <i class="ri-error-warning-line"></i>
          </span>
        </li>
      `;
    }

    return nothing;
  }

  private _renderAuthButton() {
    if (!this._dbMode) return nothing;

    if (this._user) {
      const displayLabel = this._user.displayName || this._user.email;
      return html`
        <li class="app-header-user-menu">
          <button
            class="fr-btn fr-btn--tertiary-no-outline fr-icon-account-circle-line"
            aria-expanded="${this._userMenuOpen}"
            aria-haspopup="menu"
            @click=${this._toggleUserMenu}
          >
            Mon espace
          </button>
          <div class="app-header-user-menu__dropdown" ?data-open=${this._userMenuOpen}>
            <div class="app-header-user-menu__info">
              <p class="app-header-user-menu__info-name">${displayLabel}</p>
              ${this._user.displayName && this._user.email
                ? html`<p class="app-header-user-menu__info-email">${this._user.email}</p>`
                : nothing}
            </div>
            <ul class="app-header-user-menu__list" role="menu">
              <li role="menuitem">
                <button @click=${this._openPasswordChangeModal}>
                  <span class="fr-icon-lock-line" aria-hidden="true"></span>
                  Mot de passe
                </button>
              </li>
              <li role="menuitem">
                <button @click=${this._handleLogout}>
                  <span class="fr-icon-logout-box-r-line" aria-hidden="true"></span>
                  Se deconnecter
                </button>
              </li>
            </ul>
          </div>
        </li>
      `;
    }

    return html`
      <li>
        <button
          class="fr-btn fr-btn--tertiary-no-outline fr-icon-account-circle-line"
          @click=${this._openAuthModal}
        >
          Connexion
        </button>
      </li>
    `;
  }

  render() {
    const navItems = this._getNavItems();

    return html`
      <div class="fr-skiplinks">
        <nav class="fr-container" role="navigation" aria-label="Accès rapide">
          <ul class="fr-skiplinks__list">
            <li><a class="fr-link" href="#main-content">Contenu</a></li>
            <li><a class="fr-link" href="${this._base}specs/index.html">Specs</a></li>
          </ul>
        </nav>
      </div>
      <header role="banner" class="fr-header">
        <div class="fr-header__body">
          <div class="fr-container">
            <div class="fr-header__body-row">
              <div class="fr-header__brand fr-enlarge-link">
                <div class="fr-header__brand-top">
                  <div class="fr-header__logo">
                    <p class="fr-logo">République<br />Française</p>
                  </div>
                  <div class="fr-header__navbar">
                    <button
                      class="fr-btn--menu fr-btn"
                      data-fr-opened="false"
                      aria-controls="modal-menu"
                      aria-haspopup="menu"
                      id="button-menu"
                      title="Menu"
                    >
                      Menu
                    </button>
                  </div>
                </div>
                <div class="fr-header__service">
                  <a href="${this._base}index.html" title="Accueil - Charts builder">
                    <p class="fr-header__service-title">Charts builder</p>
                  </a>
                  <p
                    class="fr-header__service-tagline"
                    style="display:flex;align-items:center;gap:0.5rem;"
                  >
                    <span class="fr-badge fr-badge--sm fr-badge--warning fr-badge--no-icon"
                      >En developpement</span
                    >
                    Création de visualisations dynamiques conformes DSFR
                  </p>
                </div>
              </div>
              <div class="fr-header__tools">
                <div class="fr-header__tools-links">
                  <ul class="fr-btns-group">
                    <li>
                      <a
                        class="fr-btn fr-btn--tertiary-no-outline fr-icon-book-2-line"
                        href="${this._base}guide/guide.html"
                      >
                        Guide
                      </a>
                    </li>
                    <li>
                      <a
                        class="fr-btn fr-btn--tertiary-no-outline fr-icon-file-text-line"
                        href="${this._base}specs/index.html"
                      >
                        Specs
                      </a>
                    </li>
                    <li>
                      <a
                        class="fr-btn fr-btn--tertiary-no-outline fr-icon-star-fill"
                        href="${this._base}apps/favorites/index.html"
                      >
                        Favoris${this._favCount > 0
                          ? html` <span class="fr-badge fr-badge--sm fr-badge--info"
                              >${this._favCount}</span
                            >`
                          : nothing}
                      </a>
                    </li>
                    ${this._renderSyncStatus()} ${this._renderAuthButton()}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="fr-header__menu fr-modal" id="modal-menu" aria-labelledby="button-menu">
          <div class="fr-container">
            <button class="fr-btn--close fr-btn" aria-controls="modal-menu" title="Fermer">
              Fermer
            </button>
            <div class="fr-header__menu-links"></div>
            <nav
              class="fr-nav"
              id="header-navigation"
              role="navigation"
              aria-label="Menu principal"
            >
              <ul class="fr-nav__list">
                ${navItems.map(
                  (item) => html`
                    <li class="fr-nav__item">
                      <a
                        class="fr-nav__link"
                        href="${this._base}${item.href}"
                        ${this.currentPage === item.id ? html`aria-current="page"` : ''}
                      >
                        ${item.label}
                      </a>
                    </li>
                  `
                )}
              </ul>
            </nav>
          </div>
        </div>
      </header>
      ${this._dbMode
        ? html`<auth-modal></auth-modal><password-change-modal></password-change-modal>`
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-header': AppHeader;
  }
}
