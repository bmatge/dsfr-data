import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { checkAuth, logout, onAuthChange, isDbMode, onSyncStatusChange } from '@dsfr-data/shared';
import type { User, SyncStatus } from '@dsfr-data/shared';
import { injectAppPrimitives } from './app-primitives.js';
import { PINNED } from './chrome-breakpoints.js';
// Version injectee au build par define (#306) — plus d'import vers core
declare const __DSFR_DATA_VERSION__: string;
const PACKAGE_VERSION = typeof __DSFR_DATA_VERSION__ !== 'undefined' ? __DSFR_DATA_VERSION__ : '';

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
/**
 * Entrées de la navigation principale pour un utilisateur donné (#575).
 * « Suivi » et « Admin » ne sont proposées qu'aux administrateurs connectés :
 * c'est de l'ergonomie, pas une protection — les apps et les routes serveur
 * gardent leurs contrôles d'accès.
 */
export function navItemsFor(user: User | null): Array<{ id: string; label: string; href: string }> {
  const admin = user?.role === 'admin';
  return [
    { id: 'accueil', label: 'Accueil', href: 'index.html' },
    { id: 'sources', label: 'Sources', href: 'apps/sources/index.html' },
    // Le Studio IA remplace l'Assistant IA comme entree usager (#1081) ;
    // l'ancien Assistant reste joignable par `apps/builder-ia/?ancien=1`.
    { id: 'studio', label: 'Studio IA', href: 'apps/studio/index.html' },
    { id: 'builder', label: 'Créer un graphique', href: 'apps/builder/index.html' },
    { id: 'builder-carto', label: 'Créer une carte', href: 'apps/builder-carto/index.html' },
    { id: 'dashboard', label: 'Créer un tableau de bord', href: 'apps/dashboard/index.html' },
    { id: 'playground', label: 'Playground', href: 'apps/playground/index.html' },
    { id: 'pipeline-helper', label: 'Pipeline', href: 'apps/pipeline-helper/index.html' },
    { id: 'monitoring', label: 'Suivi', href: 'apps/monitoring/index.html' },
    { id: 'admin', label: 'Admin', href: 'apps/admin/index.html' },
  ].filter((item) => admin || (item.id !== 'monitoring' && item.id !== 'admin'));
}

/**
 * COMPACTION AU DEFILEMENT. Au-dessus de 62em, l'en-tete epingle passe de
 * 175 px a une ligne d'environ 56 px des qu'une zone de travail defile : la
 * page elle-meme (Playground, Sources...) ou une colonne des apps plein ecran
 * (Builder, Carte, Studio), ou la page ne defile jamais. Il se redeplie quand
 * cette zone revient en haut.
 *
 * `--app-header-h` suit deja la hauteur reelle (`_observeHeaderHeight`) : la
 * barre d'actions et les colonnes suivent la compaction sans autre code.
 */
export const COMPACT_ENTER_PX = 48;
export const COMPACT_EXIT_PX = 4;
/**
 * Hauteur gagnee par la compaction : 175 px -> 48 px mesures a 1440 px, soit
 * 127, arrondi au-dessus. La compaction agrandit la zone qui defile, donc
 * raccourcit sa course d'autant : une zone dont la course restante tomberait
 * sous `COMPACT_EXIT_PX` ne compacte pas, sinon le navigateur la ramenerait en
 * haut et l'en-tete se redeplierait aussitot — il clignoterait.
 */
export const COMPACT_GAIN_PX = 130;
/** Course minimale qui doit rester a la zone une fois l'en-tete compacte. */
export const COMPACT_RESIDUAL_PX = 12;

/**
 * Choix manuel « Reduire l'en-tete » (bouton-icone des acces rapides),
 * memorise par navigateur. Il l'emporte sur le defilement : utile la ou rien
 * ne defile assez (Carte, canevas plein ecran). « Deplier » l'efface, et le
 * repli au defilement reprend.
 */
export const CLE_ENTETE_REDUITE = 'dsfr-data-entete-reduite';

/** Etat compact suivant, pour une zone qui vient de defiler. */
export function nextCompact(compact: boolean, scrollTop: number, scrollMax: number): boolean {
  if (scrollTop <= COMPACT_EXIT_PX) return false;
  if (compact) return true;
  return scrollTop > COMPACT_ENTER_PX && scrollMax > COMPACT_GAIN_PX + COMPACT_RESIDUAL_PX;
}

/** Seuil DSFR a partir duquel l'en-tete montre sa navigation en ligne. */
const HEADER_LG = '(min-width:62em)';

/**
 * Regles de la variante compacte. Toutes sous `HEADER_LG` : en deca, l'en-tete
 * DSFR est deja la variante empilee a burger, et la classe n'a aucun effet.
 * Le bloc-marque reste (Marianne + « Republique Francaise » sur une ligne) ;
 * seule la devise est retiree, comme la tagline et la ligne de navigation,
 * remplacee par le selecteur d'app.
 */
const COMPACT_CSS = `@media ${HEADER_LG}{app-header.app-header--compact .fr-header__body-row{padding:.25rem 0}app-header.app-header--compact .fr-header__brand{margin-top:0;margin-bottom:0}app-header.app-header--compact .fr-header__logo,app-header.app-header--compact .fr-header__service{padding-top:.5rem;padding-bottom:.5rem}app-header.app-header--compact .fr-header__logo .fr-logo{display:flex;align-items:center;gap:.5rem;font-size:.7875rem;line-height:1rem}app-header.app-header--compact .fr-header__logo .fr-logo br{display:none}app-header.app-header--compact .fr-header__logo .fr-logo::before{width:2.0625rem;height:.75rem;margin:0;background-size:2.0625rem .84375rem,2.0625rem .75rem,0;background-position:0 -.046875rem,0 0,0 0}app-header.app-header--compact .fr-header__logo .fr-logo::after{display:none}app-header.app-header--compact .fr-header__service-title{font-size:1rem;line-height:1.5rem}app-header.app-header--compact .fr-header__service-tagline{display:none!important}app-header.app-header--compact .fr-header__menu{display:none}app-header.app-header--compact .app-header-switch{display:block}.app-header-reduire{display:list-item}}.app-header-reduire{display:none}.app-header-switch{display:none;position:relative;padding:0 1rem;flex:0 0 auto}.app-header-switch__list{position:absolute;left:1rem;top:calc(100% + .25rem);z-index:1000;min-width:16rem;margin:0;padding:.25rem 0;list-style:none;background:var(--background-default-grey);box-shadow:0 8px 16px rgba(0,0,0,.16)}.app-header-switch__list[hidden]{display:none}.app-header-switch__list a{display:block;padding:.5rem 1rem;font-size:.875rem;color:var(--text-title-grey);background-image:none}.app-header-switch__list a:hover{background-color:var(--background-default-grey-hover)}.app-header-switch__list a[aria-current="page"]{font-weight:700;color:var(--text-action-high-blue-france);box-shadow:inset 3px 0 0 var(--border-action-high-blue-france)}`;

/**
 * Feuille de style de l'en-tete, injectee une fois par document.
 *
 * Extraite de `connectedCallback` pour etre EPROUVABLE sans rendre l'element
 * — le rendre declenche `_initAuth()` et un appel reseau. Aligne sur
 * `injectAppActionBarStyles` / `injectAppMenuStyles`.
 *
 * EPINGLAGE. L'en-tete DSFR reste en variante empilee (logo + service +
 * burger) jusqu'a 62em/992 px : sous 900 px il occupe un quart de l'ecran et
 * reste DEFILANT, comme sur tout site de l'Etat. Il n'est epingle qu'au-dessus
 * de `PINNED` — seuil partage avec l'empilement des colonnes (#613) et avec
 * `app-action-bar`, parce qu'un element ne peut etre epingle a
 * `--app-header-h` que la ou l'en-tete l'est lui-meme.
 *
 * La garde precedente etait a 48em, celle de la barre d'actions inexistante :
 * entre 768 et 900 px l'en-tete etait donc clou en haut d'une page qui
 * defilait, et sur telephone la barre de titre restait epinglee a 189 px du
 * haut sans referent. Un telephone en paysage tombe pile dans cette bande.
 *
 * Le sticky est porte par `<app-header>` lui-meme et non par `.fr-header` :
 * dans les pages dont le body est en flex-column, `<app-header>` est le bloc
 * conteneur de `.fr-header` et un sticky interne n'aurait aucune marge de
 * collage. Il passe sous les modales DSFR (1750) et sous les panneaux des
 * apps (>= 900). 776 : juste au-dessus de la barre d'actions (775), elle-meme
 * au-dessus du volet de l'assistant (770) — les menus de l'en-tete (Mon
 * espace, selecteur d'app) sont enfermes dans ce contexte.
 *
 * La hauteur reelle est publiee dans `--app-header-h` (voir
 * `_observeHeaderHeight`), INCONDITIONNELLEMENT : son usage en hauteur est
 * legitime partout, seul son usage en decalage d'epinglage demande `PINNED`.
 */
export function injectAppHeaderStyles(): void {
  if (document.getElementById('app-header-active-style')) return;
  const style = document.createElement('style');
  style.id = 'app-header-active-style';
  style.textContent = `app-header{display:block}@media ${PINNED}{app-header{position:sticky;top:0;z-index:776}}.fr-nav__link[aria-current="page"]{font-weight:700;border-bottom:2px solid var(--border-action-high-blue-france);color:var(--text-action-high-blue-france)}.fr-header__tools-links .fr-btn[aria-current="page"]{font-weight:700;color:var(--text-action-high-blue-france)}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.app-header-user-menu{position:relative}.app-header-user-menu__dropdown{display:none;position:absolute;right:0;top:100%;z-index:1000;min-width:240px;background:var(--background-default-grey);box-shadow:0 8px 16px rgba(0,0,0,.16);padding:0}.app-header-user-menu__dropdown[data-open]{display:block}.app-header-user-menu__info{padding:1rem 1.5rem;border-bottom:1px solid var(--border-default-grey)}.app-header-user-menu__info-name{font-weight:700;color:var(--text-title-grey);margin:0;font-size:.875rem}.app-header-user-menu__info-email{color:var(--text-mention-grey);margin:0;font-size:.75rem}.app-header-user-menu__list{list-style:none;padding:0;margin:0}.app-header-user-menu__list li{border-bottom:1px solid var(--border-default-grey)}.app-header-user-menu__list li:last-child{border-bottom:none}.app-header-user-menu__list button{display:flex;align-items:center;gap:.5rem;width:100%;padding:.75rem 1.5rem;border:none;background:none;cursor:pointer;font-size:.875rem;color:var(--text-action-high-blue-france);font-family:inherit}.app-header-user-menu__list button:hover{background:var(--background-alt-blue-france-hover)}.app-header-user-menu__list button::before{font-family:'remixicon';font-size:1rem}${COMPACT_CSS}`;
  document.head.appendChild(style);
}

@customElement('app-header')
export class AppHeader extends LitElement {
  /**
   * Page courante pour mettre en surbrillance dans la nav
   * Valeurs: 'accueil' | 'composants' | 'builder' | 'studio' | 'dashboard' | 'playground' | 'favoris' | 'sources'
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

  /** Selecteur d'app de la variante compacte ouvert. */
  @state()
  private _switchOpen = false;

  private _compact = false;
  /** Choix manuel memorise (`CLE_ENTETE_REDUITE`) : compact quoi qu'il defile. */
  private _reduitManuel = false;
  private _scrollRaf = 0;
  /** Derniere position verticale vue par zone : ignore les defilements horizontaux. */
  private _lastScrollTop = new WeakMap<Element, number>();

  private _onAnyScroll = (e: Event) => {
    const el =
      e.target === document
        ? document.scrollingElement
        : e.target instanceof Element
          ? e.target
          : null;
    if (!el || this.contains(el)) return;
    // Une modale ou une liste deroulante qui defile n'est pas la zone de travail.
    if (el.closest('dialog, .fr-modal')) return;
    if (el.clientHeight < window.innerHeight * 0.4) return;
    const top = el.scrollTop;
    if (this._lastScrollTop.get(el) === top) return;
    this._lastScrollTop.set(el, top);
    if (this._scrollRaf) return;
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = 0;
      this._setCompact(
        this._reduitManuel ||
          nextCompact(this._compact, el.scrollTop, el.scrollHeight - el.clientHeight)
      );
    });
  };

  private _switchOutsideHandler = (e: MouseEvent) => {
    const sw = this.querySelector('.app-header-switch');
    if (sw && !sw.contains(e.target as Node)) this._closeSwitch();
  };

  private _unsubAuth?: () => void;
  private _unsubSync?: () => void;
  private _headerResizeObserver?: ResizeObserver;
  private _outsideClickHandler = (e: MouseEvent) => {
    const menus = this.querySelectorAll('.app-header-user-menu');
    const target = e.target as Node;
    const inside = Array.from(menus).some((m) => m.contains(target));
    if (!inside) {
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
    injectAppPrimitives();
    injectAppHeaderStyles();
    try {
      this._reduitManuel = localStorage.getItem(CLE_ENTETE_REDUITE) === '1';
    } catch {
      this._reduitManuel = false;
    }
    if (this._reduitManuel) this._setCompact(true);
    document.addEventListener('scroll', this._onAnyScroll, { capture: true, passive: true });
    // Check auth state
    this._initAuth();
    // Subscribe to sync status
    this._unsubSync = onSyncStatusChange((status, errorCount) => {
      this._syncStatus = status;
      this._syncErrorCount = errorCount;
    });
  }

  firstUpdated() {
    this._observeHeaderHeight();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubAuth?.();
    this._unsubSync?.();
    this._headerResizeObserver?.disconnect();
    document.removeEventListener('scroll', this._onAnyScroll, { capture: true });
    cancelAnimationFrame(this._scrollRaf);
    document.removeEventListener('click', this._switchOutsideHandler);
    document.removeEventListener('click', this._outsideClickHandler);
  }

  /**
   * Publie la hauteur réelle du header (variable selon breakpoint et
   * bandeau de version) dans `--app-header-h` sur <html>. Les layouts qui
   * calent un panneau sticky ou plein écran sous le header (app-layout-builder,
   * playground, pipeline) consomment cette variable.
   */
  private _observeHeaderHeight(): void {
    const header = this.querySelector<HTMLElement>('.fr-header');
    if (!header) return;
    const publish = () => {
      document.documentElement.style.setProperty(
        '--app-header-h',
        `${Math.round(header.getBoundingClientRect().height)}px`
      );
    };
    publish();
    if (typeof ResizeObserver !== 'undefined') {
      this._headerResizeObserver = new ResizeObserver(publish);
      this._headerResizeObserver.observe(header);
    }
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
            (Element & { open?: (mode: string, token?: string) => void }) | null;
          modal?.open?.('reset', resetToken);
        }
      }
    } catch {
      // Backend not available — stay in simple mode
    }
  }

  private _openAuthModal(): void {
    const modal = this.querySelector('auth-modal') as
      (Element & { open?: (mode: string) => void }) | null;
    modal?.open?.('login');
  }

  private _openPasswordChangeModal(): void {
    this._userMenuOpen = false;
    const modal = this.querySelector('password-change-modal') as
      (Element & { open?: () => void }) | null;
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

  private _setCompact(compact: boolean): void {
    if (compact === this._compact) return;
    this._compact = compact;
    this.classList.toggle('app-header--compact', compact);
    if (!compact) this._closeSwitch();
    // Le bouton-icone (libelle, icone, etat) suit.
    this.requestUpdate();
  }

  /**
   * Bouton « Reduire / Deplier l'en-tete ». Reduire est memorise et l'emporte
   * sur le defilement ; deplier efface ce choix (le repli au defilement reprend).
   */
  private _basculerReduction(): void {
    const reduire = !this._compact;
    this._reduitManuel = reduire;
    try {
      if (reduire) localStorage.setItem(CLE_ENTETE_REDUITE, '1');
      else localStorage.removeItem(CLE_ENTETE_REDUITE);
    } catch {
      // Stockage indisponible : le choix vaut pour la page.
    }
    this._setCompact(reduire);
  }

  private _renderBoutonReduire() {
    const libelle = this._compact ? 'Déplier l’en-tête' : 'Réduire l’en-tête';
    return html`<li class="app-header-reduire">
      <button
        type="button"
        class="fr-btn fr-btn--tertiary-no-outline ${
          this._compact ? 'fr-icon-arrow-down-s-line' : 'fr-icon-arrow-up-s-line'
        }"
        title=${libelle}
        @click=${this._basculerReduction}
      >
        <span class="fr-sr-only">${libelle}</span>
      </button>
    </li>`;
  }

  private _toggleSwitch(e: Event): void {
    e.stopPropagation();
    if (this._switchOpen) {
      this._closeSwitch();
      return;
    }
    this._switchOpen = true;
    requestAnimationFrame(() => document.addEventListener('click', this._switchOutsideHandler));
  }

  private _closeSwitch(): void {
    this._switchOpen = false;
    document.removeEventListener('click', this._switchOutsideHandler);
  }

  private _onSwitchKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !this._switchOpen) return;
    this._closeSwitch();
    this.querySelector<HTMLButtonElement>('.app-header-switch > button')?.focus();
  }

  /** Selecteur d'app : remplace la ligne de navigation dans la variante compacte. */
  private _renderSwitch(navItems: Array<{ id: string; label: string; href: string }>) {
    const current = navItems.find((item) => item.id === this.currentPage);
    return html`
      <nav
        class="app-header-switch"
        aria-label="Changer d'application"
        @keydown=${this._onSwitchKeydown}
      >
        <button
          type="button"
          class="fr-btn fr-btn--tertiary fr-btn--sm fr-btn--icon-right fr-icon-arrow-down-s-line"
          aria-expanded="${this._switchOpen}"
          aria-controls="app-header-switch-list"
          @click=${this._toggleSwitch}
        >
          ${current?.label ?? 'Menu'}
        </button>
        <ul
          id="app-header-switch-list"
          class="app-header-switch__list"
          ?hidden=${!this._switchOpen}
        >
          ${navItems.map(
            (item) => html`
              <li>
                <a
                  href="${this._base}${item.href}"
                  aria-current=${this.currentPage === item.id ? 'page' : nothing}
                  >${item.label}</a
                >
              </li>
            `
          )}
        </ul>
      </nav>
    `;
  }

  private _getNavItems() {
    return navItemsFor(this._user);
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
              ${
                this._user.displayName && this._user.email
                  ? html`<p class="app-header-user-menu__info-email">${this._user.email}</p>`
                  : nothing
              }
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

  private _renderToolsList() {
    return html`
      <ul class="fr-btns-group">
        <li>
          <a
            class="fr-btn fr-btn--tertiary-no-outline fr-icon-book-2-line"
            href="${this._base}guide/guide.html"
            aria-current=${this.currentPage === 'guide' ? 'page' : nothing}
          >
            Guide
          </a>
        </li>
        <li>
          <a
            class="fr-btn fr-btn--tertiary-no-outline fr-icon-file-text-line"
            href="${this._base}specs/index.html"
            aria-current=${this.currentPage === 'composants' ? 'page' : nothing}
          >
            Specs
          </a>
        </li>
        <li>
          <a
            class="fr-btn fr-btn--tertiary-no-outline fr-icon-star-fill"
            href="${this._base}apps/favorites/index.html"
            aria-current=${this.currentPage === 'favoris' ? 'page' : nothing}
          >
            Favoris${
              this._favCount > 0
                ? html` <span class="fr-badge fr-badge--sm fr-badge--info">${this._favCount}</span>`
                : nothing
            }
          </a>
        </li>
        ${this._renderSyncStatus()} ${this._renderAuthButton()} ${this._renderBoutonReduire()}
      </ul>
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
                    <p class="fr-logo">République <br />Française</p>
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
                    <!-- Le badge de statut vit dans le TITRE : c'est son
                         emplacement DSFR officiel, et le seul pour lequel une
                         regle de calage existe
                         (.fr-header__service-title .fr-badge, a la racine).
                         Il etait dans la tagline, hors patron, ce qui avait
                         impose un display:flex inline — et rendait la tagline
                         non masquable sans perdre le signal « outil en
                         evolution ». Ici il est visible a TOUS les points de
                         rupture, telephone compris.

                         aria-hidden sur le numero : ce titre est DANS le
                         <a>, donc son contenu devient le nom accessible du
                         lien d'accueil, sur chaque page de chaque app. Sans
                         cela un lecteur d'ecran annoncerait « Charts builder
                         Apercu 0 point 20 point 0 ». Le numero reste visible
                         pour les voyants. -->
                    <p class="fr-header__service-title">
                      Charts builder<span
                        class="fr-badge fr-badge--sm fr-badge--info fr-badge--no-icon"
                        >Aperçu <span aria-hidden="true">${PACKAGE_VERSION}</span></span
                      >
                    </p>
                  </a>
                  <!-- Masquee sous 62em par les utilitaires DSFR, au point de
                       rupture du composant lui-meme et non a un seuil maison :
                       48 px rendus a l'utilisateur sur telephone, ou l'en-tete
                       occupait 22 % de l'ecran. -->
                  <p class="fr-header__service-tagline fr-hidden fr-unhidden-lg">
                    Création de visualisations dynamiques conformes DSFR
                  </p>
                </div>
              </div>
              ${this._renderSwitch(navItems)}
              <div class="fr-header__tools">
                <div class="fr-header__tools-links">${this._renderToolsList()}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="fr-header__menu fr-modal" id="modal-menu" aria-labelledby="button-menu">
          <div class="fr-container">
            <button class="fr-btn--close fr-btn" aria-controls="modal-menu" title="Fermer">
              Fermer
            </button>
            <div class="fr-header__menu-links">${this._renderToolsList()}</div>
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
                        aria-current=${this.currentPage === item.id ? 'page' : nothing}
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
      ${
        this._dbMode
          ? html`<auth-modal></auth-modal><password-change-modal></password-change-modal>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-header': AppHeader;
  }
}
