import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { AppMenu, injectAppMenuStyles } from './app-menu.js';

/**
 * <app-action-bar> - Barre d'actions unique des éditeurs (docs/ux/actions.md §5)
 *
 * Une seule barre par app, en haut de la zone de travail : le titre de page
 * (`<h1>`) à gauche, et à droite, dans un `role="toolbar"` navigable aux
 * flèches : `?` (aide / visite guidée, icône seule) · `Plus d'actions ▾` ·
 * la secondaire visible · **la** primaire. Tout le reste (autres secondaires,
 * tertiaires, entrées des menus slottés) vit dans « Plus d'actions », par
 * groupes séparés — pattern « primaire + bouton dépliant » (2026-09-02).
 *
 * Les boutons sont fournis en Light DOM avec un attribut `slot` qui donne leur
 * rang (`primary` | `secondary` | `tertiary` | `help`) : ids et écouteurs sont
 * conservés (ADR-096), le composant les déplace, normalise leurs classes DSFR
 * et remplit le menu. Un `<app-menu slot="secondary">` est une action comme
 * une autre (visible s'il est la secondaire retenue, aplati dans « Plus
 * d'actions » sinon).
 *
 * Sous 768 px, les actions deviennent une barre collante en bas d'écran, avec
 * les mêmes contrôles : `Plus d'actions` en icône seule, la secondaire en bouton
 * icône (libellé sr-only), la primaire pleine largeur. Hauteurs publiées dans
 * `--app-action-bar-h` (en flux) et `--app-action-bar-fixed-h` (barre fixe).
 *
 * @example
 * <app-action-bar heading="Playground" disabled-reason="">
 *   <button slot="help" id="tour-btn" class="fr-icon-question-line">Visite guidée</button>
 *   <button slot="secondary" id="copy-btn" class="fr-icon-clipboard-line fr-btn--icon-left">Copier le code</button>
 *   <button slot="secondary" id="save-btn" class="fr-icon-star-line">Ajouter aux favoris</button>
 *   <button slot="tertiary" id="reset-btn" class="fr-icon-refresh-line">Réinitialiser</button>
 *   <button slot="primary" id="run-btn" class="fr-icon-play-line fr-btn--icon-left">Exécuter</button>
 * </app-action-bar>
 *
 * @attr heading - Titre de la zone de travail, rendu en <h1> (optionnel).
 * @attr disabled-reason - Tant que non vide : la primaire est désactivée
 *   (`disabled` + `aria-disabled`) et la raison est affichée sous la barre,
 *   reliée par `aria-describedby`.
 * @attr busy - Traitement en cours : la primaire passe `aria-busy`, son icône tourne.
 * @attr max-secondary - Nombre de secondaires visibles hors menu (1).
 * @attr reason-host - Sélecteur CSS d'un élément qui accueille le texte de
 *   `disabled-reason` (ex. la zone `slot="aside"` du panneau d'aperçu) ; sans
 *   lui, la raison s'affiche sous la barre. Le lien `aria-describedby` est
 *   conservé où que le texte soit.
 *
 * Un enfant `slot="context"` (label + select, champ de recherche…) est placé après
 * le titre, hors du `role="toolbar"` : ce n'est pas une action.
 */

export type ActionRank = 'primary' | 'secondary' | 'tertiary' | 'help';

const RANKS: ActionRank[] = ['primary', 'secondary', 'tertiary', 'help'];
/** Contrôles de contexte (sélecteur d'exemple, filtre…) : après le titre, hors du toolbar. */
const CONTEXT_SLOT = 'context';
const VARIANT_CLASSES = ['fr-btn--secondary', 'fr-btn--tertiary', 'fr-btn--tertiary-no-outline'];
const SIZE_CLASSES = ['fr-btn--sm', 'fr-btn--lg'];
const MOBILE_QUERY = '(max-width: 47.99em)';

let barSeq = 0;

interface ActionItem {
  el: HTMLElement;
  rank: ActionRank;
}

export function injectAppActionBarStyles(): void {
  if (document.getElementById('app-action-bar-style')) return;
  const style = document.createElement('style');
  style.id = 'app-action-bar-style';
  style.textContent = `
app-action-bar{display:block;position:sticky;top:var(--app-header-h,0px);z-index:700}
.app-action-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem 1rem;padding:.5rem 1rem;background:var(--background-default-grey);border-bottom:1px solid var(--border-default-grey)}
.app-action-bar__title{flex:0 1 auto;min-width:0;margin:0;font-size:1.125rem;line-height:1.5rem;font-weight:700;color:var(--text-title-grey);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app-action-bar__context{display:flex;align-items:center;flex:1 1 auto;min-width:0;gap:.5rem}
.app-action-bar__context:empty{display:none}
.app-action-bar__context label{white-space:nowrap;margin:0}
.app-action-bar__context .fr-select{width:auto;max-width:100%;flex:1 1 12rem;min-width:0}
.app-action-bar__actions{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem;margin-left:auto}
.app-action-bar__group{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem}
.app-action-bar__group:empty{display:none}
.app-action-bar__group--help{margin-right:.25rem}
.app-action-bar__actions .fr-btn{white-space:nowrap}
.app-action-bar>.app-action-bar__reason{flex:0 0 100%;margin:0;text-align:right}
.app-action-bar__reason[hidden]{display:none}
.app-action-bar__actions .fr-btn[aria-busy="true"]::before{animation:app-action-bar-spin 1s linear infinite}
@keyframes app-action-bar-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@media (max-width:47.99em){
  .app-action-bar__actions{position:fixed;left:0;right:0;bottom:0;z-index:800;margin:0;padding:.5rem 1rem;justify-content:flex-end;background:var(--background-default-grey);border-top:1px solid var(--border-default-grey);box-shadow:0 -4px 12px rgba(0,0,0,.08)}
  .app-action-bar__actions .app-action-bar__group--primary{flex:1 1 auto}
  .app-action-bar__actions .app-action-bar__group--secondary{flex-wrap:nowrap}
  .app-action-bar__actions .app-action-bar__group--primary .fr-btn{width:100%;justify-content:center}
  .app-action-bar__actions .app-menu__list{position:fixed;top:auto;left:.5rem;right:.5rem;bottom:calc(var(--app-action-bar-fixed-h,3.5rem) + .25rem);max-height:60vh;overflow:auto}
  .app-action-bar__reason{position:fixed;left:0;right:0;bottom:var(--app-action-bar-fixed-h,3.5rem);z-index:800;padding:.25rem 1rem;background:var(--background-default-grey)}
  body:has(app-action-bar){padding-bottom:var(--app-action-bar-fixed-h,3.5rem)}
}
`;
  document.head.appendChild(style);
}

@customElement('app-action-bar')
export class AppActionBar extends LitElement {
  @property({ type: String })
  heading = '';

  @property({ type: String, attribute: 'disabled-reason' })
  disabledReason = '';

  @property({ type: String, attribute: 'reason-host' })
  reasonHost = '';

  @property({ type: Boolean, reflect: true })
  busy = false;

  @property({ type: Number, attribute: 'max-secondary' })
  maxSecondary = 1;

  private _items: ActionItem[] = [];
  private _reasonId = `app-action-bar-reason-${++barSeq}`;
  private _mobile = false;
  private _mql: MediaQueryList | null = null;
  private _mqlHandler = (e: MediaQueryListEvent) => {
    this._mobile = e.matches;
    this._layout();
  };
  private _resizeObserver?: ResizeObserver;
  private _primaryManaged = false;
  /** Menus repliés dans Plus ▾ : leurs entrées, pour les leur rendre au prochain layout. */
  private _flattened = new Map<AppMenu, Element[]>();

  // Light DOM pour hériter des styles DSFR
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    injectAppMenuStyles();
    injectAppActionBarStyles();
    this._collect();
    if (typeof window.matchMedia === 'function') {
      this._mql = window.matchMedia(MOBILE_QUERY);
      this._mobile = this._mql.matches;
      this._mql.addEventListener?.('change', this._mqlHandler);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._mql?.removeEventListener?.('change', this._mqlHandler);
    this._resizeObserver?.disconnect();
  }

  firstUpdated() {
    // Les enfants peuvent n'être attachés qu'après connectedCallback (parseur
    // HTML, happy-dom) : seconde collecte avant la première mise en page.
    this._collect();
    this._layout();
    const actions = this._actionsEl();
    if (actions && typeof ResizeObserver !== 'undefined') {
      const root = document.documentElement.style;
      this._resizeObserver = new ResizeObserver(() => {
        // Hauteur en flux (titre + actions sur desktop, titre seul en mobile)
        // pour les panneaux sticky ; hauteur de la barre fixe en mobile pour
        // le padding-bottom du body.
        root.setProperty(
          '--app-action-bar-h',
          `${Math.round(this.getBoundingClientRect().height)}px`
        );
        root.setProperty(
          '--app-action-bar-fixed-h',
          `${this._mobile ? Math.round(actions.getBoundingClientRect().height) : 0}px`
        );
      });
      this._resizeObserver.observe(this);
      this._resizeObserver.observe(actions);
    }
  }

  updated(changed: Map<string, unknown>) {
    this._hostReason();
    if (changed.has('disabledReason') || changed.has('busy')) this._applyPrimaryState();
  }

  /** Déplace le texte de raison dans `reason-host` s'il existe (id conservé). */
  private _hostReason(): void {
    if (!this.reasonHost) return;
    const reason = document.getElementById(this._reasonId);
    const host = document.querySelector(this.reasonHost);
    if (reason && host && reason.parentElement !== host) host.appendChild(reason);
  }

  /** Enfants `slot="primary|secondary|tertiary"` encore dans le Light DOM. */
  private _collect(): void {
    const ctx = this.querySelector<HTMLElement>('.app-action-bar__context');
    for (const el of Array.from(this.children) as HTMLElement[]) {
      if (el.getAttribute('slot') === CONTEXT_SLOT && ctx) ctx.appendChild(el);
    }
    const fresh = (Array.from(this.children) as HTMLElement[]).filter((el) =>
      RANKS.includes(el.getAttribute('slot') as ActionRank)
    );
    for (const el of fresh) {
      if (this._items.some((it) => it.el === el)) continue;
      this._items.push({ el, rank: el.getAttribute('slot') as ActionRank });
    }
  }

  /** Action primaire (au plus une). */
  get primary(): HTMLElement | null {
    return this._items.find((it) => it.rank === 'primary')?.el ?? null;
  }

  /** Menu `Plus ▾` de débordement. */
  get moreMenu(): AppMenu | null {
    return this.querySelector<AppMenu>('.app-action-bar__more');
  }

  /** Élément `role="toolbar"`. */
  get toolbar(): HTMLElement | null {
    return this._actionsEl();
  }

  /** Mode mobile (barre collante en bas, tout replié dans `Plus ▾`). */
  get isMobile(): boolean {
    return this._mobile;
  }

  /** Ajoute une action après coup (bouton créé par script). */
  addAction(el: HTMLElement, rank: ActionRank): void {
    el.setAttribute('slot', rank);
    this._items.push({ el, rank });
    this._layout();
  }

  /** Retire une action de la barre et la rend (écouteurs conservés). */
  removeAction(el: HTMLElement): HTMLElement {
    const idx = this._items.findIndex((it) => it.el === el);
    if (idx >= 0) this._items.splice(idx, 1);
    this.moreMenu?.removeItem(el);
    el.remove();
    this._layout();
    return el;
  }

  /** Force une nouvelle disposition (après un changement d'état des boutons). */
  refresh(): void {
    this._collect();
    this._layout();
  }

  private _actionsEl(): HTMLElement | null {
    return this.querySelector<HTMLElement>('.app-action-bar__actions');
  }

  private _group(rank: ActionRank): HTMLElement | null {
    return this.querySelector<HTMLElement>(`.app-action-bar__group--${rank}`);
  }

  private _hasDsfrIcon(el: HTMLElement): boolean {
    return (
      !(el instanceof AppMenu) && Array.from(el.classList).some((c) => c.startsWith('fr-icon-'))
    );
  }

  /**
   * Bouton icône seule (mobile) : le libellé passe en `fr-sr-only` et la
   * classe `fr-btn--icon-left` est retirée ; l'inverse restaure le bouton.
   * Idempotent, ne touche ni aux ids ni aux écouteurs.
   */
  private _iconify(el: HTMLElement, on: boolean): void {
    if (el instanceof AppMenu || !this._hasDsfrIcon(el)) return;
    const wrapped = el.querySelector<HTMLElement>(':scope > [data-ab-label]');
    if (on && !wrapped) {
      const texts = Array.from(el.childNodes).filter(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''
      );
      if (texts.length === 0) return;
      const span = document.createElement('span');
      span.className = 'fr-sr-only';
      span.dataset.abLabel = '';
      span.textContent = texts
        .map((t) => t.textContent)
        .join('')
        .trim();
      if (!el.title) el.title = span.textContent;
      texts.forEach((t) => t.remove());
      el.appendChild(span);
      if (el.classList.contains('fr-btn--icon-left')) {
        el.dataset.abIconLeft = '';
        el.classList.remove('fr-btn--icon-left');
      }
    } else if (!on && wrapped) {
      el.replaceChild(document.createTextNode(wrapped.textContent ?? ''), wrapped);
      if (el.dataset.abIconLeft !== undefined) {
        el.classList.add('fr-btn--icon-left');
        delete el.dataset.abIconLeft;
      }
    }
  }

  private _normalize(item: ActionItem): void {
    const el = item.el;
    if (el instanceof AppMenu) {
      el.variant =
        item.rank === 'primary'
          ? 'primary'
          : item.rank === 'help'
            ? 'tertiary-no-outline'
            : item.rank;
      el.size = 'sm';
      return;
    }
    el.classList.add('fr-btn');
    el.classList.remove(...SIZE_CLASSES, ...VARIANT_CLASSES);
    el.classList.add('fr-btn--sm');
    if (item.rank === 'secondary') el.classList.add('fr-btn--secondary');
    if (item.rank === 'help') el.classList.add('fr-btn--tertiary-no-outline');
    if (item.rank === 'tertiary') {
      el.classList.add(
        el.dataset.variant === 'no-outline' ? 'fr-btn--tertiary-no-outline' : 'fr-btn--tertiary'
      );
    }
    if (el.tagName === 'BUTTON' && !el.hasAttribute('type')) el.setAttribute('type', 'button');
  }

  private _layout(): void {
    const more = this.moreMenu;
    const groups = {
      primary: this._group('primary'),
      secondary: this._group('secondary'),
      help: this._group('help'),
    };
    if (!more || !groups.primary || !groups.secondary || !groups.help) return;

    // 1. Tout reprendre (menu Plus compris) pour repartir d'une base propre,
    //    et rendre aux menus repliés les entrées qu'on leur avait prises.
    more.takeItems();
    for (const [menu, subs] of this._flattened) subs.forEach((sub) => menu.addItem(sub));
    this._flattened.clear();

    // 2. Une seule primaire : les suivantes sont rétrogradées en secondaires.
    let primarySeen = false;
    for (const it of this._items) {
      if (it.rank !== 'primary') continue;
      if (primarySeen) {
        console.warn(
          '[app-action-bar] une seule action primaire par écran (docs/ux/actions.md §4) :',
          it.el
        );
        it.rank = 'secondary';
        it.el.setAttribute('slot', 'secondary');
      }
      primarySeen = true;
    }

    // 3. Répartition : help (icône seule) · Plus d'actions · secondaire visible · primaire.
    const helps = this._items.filter((it) => it.rank === 'help');
    const tertiaries = this._items.filter((it) => it.rank === 'tertiary');
    const secondaries = this._items.filter((it) => it.rank === 'secondary');
    const primary = this._items.find((it) => it.rank === 'primary');
    const visibleSecondaries = secondaries.slice(0, Math.max(0, this.maxSecondary));
    const foldedSecondaries = secondaries.filter((it) => !visibleSecondaries.includes(it));

    for (const it of [...helps, ...visibleSecondaries, ...(primary ? [primary] : [])]) {
      this._normalize(it);
      // Aide : toujours icône seule ; secondaire : icône seule en mobile.
      this._iconify(it.el, it.rank === 'help' || (this._mobile && it.rank === 'secondary'));
    }
    groups.help.replaceChildren(...helps.map((it) => it.el));
    groups.secondary.replaceChildren(...visibleSecondaries.map((it) => it.el));
    groups.primary.replaceChildren(...(primary ? [primary.el] : []));

    // Menu « Plus d'actions » : secondaires repliées, puis tertiaires, groupes séparés.
    const fold = (items: ActionItem[]) => {
      for (const it of items) {
        if (it.el instanceof AppMenu) {
          // Un menu ne s'imbrique pas : ses entrées rejoignent le menu telles quelles.
          const subs = it.el.takeItems();
          this._flattened.set(it.el, subs);
          subs.forEach((sub) => more.addItem(sub));
          it.el.remove();
        } else {
          more.addItem(it.el);
        }
      }
    };
    fold(foldedSecondaries);
    if (foldedSecondaries.length && tertiaries.length) more.addSeparator();
    fold(tertiaries);
    more.iconOnly = this._mobile;
    more.hidden = more.isEmpty;

    this._applyPrimaryState();
    this._updateTabStops();
  }

  private _applyPrimaryState(): void {
    const primary = this.primary;
    const reason = document.getElementById(this._reasonId);
    if (!primary || !reason) return;
    const target = primary instanceof AppMenu ? primary.trigger : primary;
    if (!target) return;
    if (this.disabledReason) {
      (target as HTMLButtonElement).disabled = true;
      target.setAttribute('aria-disabled', 'true');
      target.setAttribute('aria-describedby', this._reasonId);
      reason.textContent = this.disabledReason;
      reason.hidden = false;
      this._primaryManaged = true;
    } else if (this._primaryManaged) {
      (target as HTMLButtonElement).disabled = false;
      target.removeAttribute('aria-disabled');
      target.removeAttribute('aria-describedby');
      reason.textContent = '';
      reason.hidden = true;
      this._primaryManaged = false;
    }
    if (this.busy) target.setAttribute('aria-busy', 'true');
    else target.removeAttribute('aria-busy');
  }

  /** Éléments focusables de la barre, dans l'ordre visuel. */
  private _stops(): HTMLElement[] {
    const actions = this._actionsEl();
    if (!actions) return [];
    const stops: HTMLElement[] = [];
    for (const el of Array.from(actions.querySelectorAll<HTMLElement>('button, a[href]'))) {
      if (el.closest('.app-menu__list')) continue; // entrées de menu : gérées par le menu
      if (el.closest('[hidden]')) continue;
      stops.push(el);
    }
    return stops;
  }

  private _enabledStops(): HTMLElement[] {
    return this._stops().filter(
      (el) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true'
    );
  }

  /** Roving tabindex : un seul tab stop, la primaire par défaut. */
  private _updateTabStops(current?: HTMLElement): void {
    const stops = this._stops();
    const enabled = this._enabledStops();
    const active =
      current && enabled.includes(current)
        ? current
        : enabled.includes(this._primaryStop()!)
          ? this._primaryStop()!
          : enabled[enabled.length - 1];
    for (const el of stops) el.tabIndex = el === active ? 0 : -1;
  }

  private _primaryStop(): HTMLElement | null {
    const p = this.primary;
    if (!p) return null;
    return p instanceof AppMenu ? p.trigger : p;
  }

  private _onToolbarKeydown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).closest('.app-menu__list')) return;
    const stops = this._enabledStops();
    if (stops.length === 0) return;
    const current = stops.indexOf(e.target as HTMLElement);
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
        next = current < 0 ? 0 : (current + 1) % stops.length;
        break;
      case 'ArrowLeft':
        next = current < 0 ? stops.length - 1 : (current - 1 + stops.length) % stops.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = stops.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const target = stops[next];
    this._updateTabStops(target);
    target.focus();
  }

  private _onToolbarFocusIn(e: FocusEvent): void {
    const el = e.target as HTMLElement;
    if (el.closest('.app-menu__list')) return;
    if (this._stops().includes(el)) this._updateTabStops(el);
  }

  render() {
    return html`
      <div class="app-action-bar">
        ${this.heading ? html`<h1 class="app-action-bar__title">${this.heading}</h1>` : nothing}
        <div class="app-action-bar__context"></div>
        <div
          class="app-action-bar__actions"
          role="toolbar"
          aria-label="Actions de la page"
          @keydown=${this._onToolbarKeydown}
          @focusin=${this._onToolbarFocusIn}
        >
          <div class="app-action-bar__group app-action-bar__group--help"></div>
          <app-menu
            class="app-action-bar__more"
            icon="fr-icon-more-line"
            label="Plus d'actions"
            variant="tertiary"
            hidden
          ></app-menu>
          <div class="app-action-bar__group app-action-bar__group--secondary"></div>
          <div class="app-action-bar__group app-action-bar__group--primary"></div>
        </div>
        <p class="fr-hint-text app-action-bar__reason" id=${this._reasonId} hidden></p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-action-bar': AppActionBar;
  }
}
