/**
 * dsfr-data-map-popup — Composant compagnon d'affichage au clic sur un element de carte
 *
 * Definit un template HTML pour l'infobulle/panneau/modale et le mode d'affichage.
 * Se place comme enfant de dsfr-data-map.
 *
 * @example
 * <dsfr-data-map-popup mode="panel-right" title-field="nom">
 *   <template>
 *     <h4>{{nom}}</h4>
 *     <p>{{adresse}}</p>
 *     <p class="fr-text--bold">{{prix}} EUR</p>
 *   </template>
 * </dsfr-data-map-popup>
 */
import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { getByPath } from '../utils/json-path.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { escapeHtml } from '@dsfr-data/shared/lib';

export type PopupMode = 'popup' | 'modal' | 'panel-right' | 'panel-left';

@customElement('dsfr-data-map-popup')
export class DsfrDataMapPopup extends LitElement {
  @property({ type: String })
  mode: PopupMode = 'popup';

  @property({ type: String, attribute: 'title-field' })
  titleField = '';

  @property({ type: String })
  width = '350px';

  @property({ type: String, attribute: 'for' })
  for = '';

  // --- Internal ---

  private _panelEl: HTMLDivElement | null = null;
  private _modalEl: HTMLDivElement | null = null;
  private _templateEl: HTMLTemplateElement | null = null;
  private _templateRead = false;
  /** Currently displayed record (used by close to know state) */
  _currentRecord: Record<string, unknown> | null = null;

  // Light DOM
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-map-popup');
    // Note: do not query for <template> child here. When the component script
    // is loaded in <head> without `defer`, customElements.define() runs before
    // the body parser reaches the element, and connectedCallback fires before
    // the <template> child is parsed. The lookup is deferred to _getTemplate(),
    // which caches its result on first call.
    this._injectStyles();
  }

  private _getTemplate(): HTMLTemplateElement | null {
    if (!this._templateRead) {
      this._templateEl = this.querySelector('template');
      this._templateRead = true;
    }
    return this._templateEl;
  }

  /** Handler Escape pose sur document — retire dans _removeModal (#296) */
  private _escHandler: ((e: KeyboardEvent) => void) | null = null;

  /** Timer de suppression animee du panneau — annule a la reouverture (#296) */
  private _panelRemoveTimer: number | null = null;

  /** Element focus avant l'ouverture de la modale (restitution RGAA, #296) */
  private _previousFocus: HTMLElement | null = null;

  disconnectedCallback() {
    super.disconnectedCallback();
    this._removePanel(true);
    this._removeModal();
  }

  // --- Public API (called by dsfr-data-map-layer) ---

  /** Returns whether this popup targets the given layer */
  matchesLayer(layerId: string): boolean {
    if (!this.for) return true; // no filter → matches all
    return this.for === layerId;
  }

  /** Show content for a record. Called by the layer on feature click. */
  showForRecord(record: Record<string, unknown>): void {
    this._currentRecord = record;
    const html = this._renderTemplate(record);

    switch (this.mode) {
      case 'popup':
        // Popup mode is handled by the layer via Leaflet bindPopup
        // This method is only called for panel/modal modes
        break;
      case 'modal':
        this._showModal(html, record);
        break;
      case 'panel-right':
      case 'panel-left':
        this._showPanel(html, record);
        break;
    }
  }

  /** Returns the popup HTML for Leaflet bindPopup (popup mode only) */
  getPopupHtml(record: Record<string, unknown>): string {
    return `<div class="dsfr-data-map__popup">${this._renderTemplate(record)}</div>`;
  }

  /** Returns true if a custom template is defined */
  hasTemplate(): boolean {
    return !!this._getTemplate();
  }

  /** Close any open panel/modal */
  close(): void {
    this._removePanel();
    this._removeModal();
    this._currentRecord = null;
  }

  // --- Template rendering ---

  private _renderTemplate(record: Record<string, unknown>): string {
    const tpl = this._getTemplate();
    if (!tpl) {
      return this._buildAutoTable(record);
    }

    const templateHtml = tpl.innerHTML;
    return templateHtml.replace(/\{\{([^}]+)\}\}/g, (_match, field: string) => {
      const value = getByPath(record, field.trim());
      return value !== undefined ? escapeHtml(String(value)) : '';
    });
  }

  private _buildAutoTable(record: Record<string, unknown>): string {
    const keys = Object.keys(record).filter(
      (k) =>
        !k.startsWith('geo') &&
        k !== 'latitude' &&
        k !== 'longitude' &&
        typeof record[k] !== 'object'
    );
    const rows = keys.map((key) => {
      const value = record[key];
      const display = value !== undefined ? escapeHtml(String(value)) : '';
      return `<tr><th>${escapeHtml(key)}</th><td>${display}</td></tr>`;
    });
    return `<table class="fr-table fr-table--sm">${rows.join('')}</table>`;
  }

  // --- Panel mode ---

  private _showPanel(html: string, record: Record<string, unknown>) {
    const mapParent = this.closest('dsfr-data-map');
    if (!mapParent) return;

    const side = this.mode === 'panel-left' ? 'left' : 'right';
    const title = this.titleField ? String(getByPath(record, this.titleField) ?? '') : '';

    // Reouverture < 200 ms : annule la suppression animee en cours, sinon
    // le panneau frais serait supprime avec son contenu (#296)
    if (this._panelRemoveTimer !== null) {
      clearTimeout(this._panelRemoveTimer);
      this._panelRemoveTimer = null;
    }

    if (!this._panelEl) {
      this._panelEl = document.createElement('div');
      this._panelEl.className = `dsfr-data-map-popup__panel dsfr-data-map-popup__panel--${side}`;
      this._panelEl.style.width = this.width;
      this._panelEl.setAttribute('role', 'complementary');
      this._panelEl.setAttribute('aria-label', "Details de l'element sélectionné");
      this._panelEl.setAttribute('aria-live', 'polite');
      mapParent.appendChild(this._panelEl);
      // Trigger slide-in animation
      requestAnimationFrame(() => {
        this._panelEl?.classList.add('dsfr-data-map-popup__panel--open');
      });
    }

    this._panelEl.innerHTML = `
      <div class="dsfr-data-map-popup__panel-header">
        ${title ? `<h3 class="dsfr-data-map-popup__panel-title">${escapeHtml(title)}</h3>` : ''}
        <button class="dsfr-data-map-popup__panel-close fr-btn fr-btn--sm fr-btn--tertiary-no-outline"
                aria-label="Fermer le panneau" title="Fermer">
          <span class="fr-icon-close-line" aria-hidden="true"></span>
        </button>
      </div>
      <div class="dsfr-data-map-popup__panel-body">${html}</div>
    `;

    // Close button
    const closeBtn = this._panelEl.querySelector('.dsfr-data-map-popup__panel-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Announce to screen reader via map's live region
    const mapEl = mapParent as Element & { announceToScreenReader?: (msg: string) => void };
    if (title) {
      mapEl.announceToScreenReader?.(`Detail : ${title}`);
    }
  }

  private _removePanel(immediate = false) {
    if (this._panelRemoveTimer !== null) {
      clearTimeout(this._panelRemoveTimer);
      this._panelRemoveTimer = null;
    }
    if (!this._panelEl) return;

    if (immediate) {
      // Retrait differe en microtask : au disconnect du popup pendant le
      // demontage du sous-arbre carte, retirer le panneau en pleine
      // traversee est une mutation reentrante. Apres le demontage, remove()
      // sur un noeud deja detache est inoffensif.
      const panel = this._panelEl;
      this._panelEl = null;
      queueMicrotask(() => panel.remove());
      return;
    }

    this._panelEl.classList.remove('dsfr-data-map-popup__panel--open');
    this._panelRemoveTimer = window.setTimeout(() => {
      this._panelRemoveTimer = null;
      this._panelEl?.remove();
      this._panelEl = null;
    }, 200);
  }

  // --- Modal mode ---

  private _showModal(html: string, record: Record<string, unknown>) {
    this._removeModal();

    const title = this.titleField ? String(getByPath(record, this.titleField) ?? '') : 'Detail';
    const modalId = `dsfr-map-modal-${Date.now()}`;

    this._modalEl = document.createElement('div');
    this._modalEl.className = 'dsfr-data-map-popup__modal-overlay';
    this._modalEl.setAttribute('role', 'dialog');
    this._modalEl.setAttribute('aria-modal', 'true');
    this._modalEl.setAttribute('aria-label', title);

    this._modalEl.innerHTML = `
      <div class="dsfr-data-map-popup__modal" id="${modalId}">
        <div class="dsfr-data-map-popup__modal-header">
          <h3 class="dsfr-data-map-popup__modal-title">${escapeHtml(title)}</h3>
          <button class="dsfr-data-map-popup__modal-close fr-btn fr-btn--sm fr-btn--tertiary-no-outline"
                  aria-label="Fermer" title="Fermer">
            <span class="fr-icon-close-line" aria-hidden="true"></span>
          </button>
        </div>
        <div class="dsfr-data-map-popup__modal-body">${html}</div>
      </div>
    `;

    document.body.appendChild(this._modalEl);

    // Memorise le declencheur pour restitution a la fermeture (RGAA, #296)
    this._previousFocus = (document.activeElement as HTMLElement | null) ?? null;

    const closeBtn = this._modalEl.querySelector(
      '.dsfr-data-map-popup__modal-close'
    ) as HTMLElement;
    setTimeout(() => closeBtn?.focus(), 50);

    // Close on button click
    closeBtn?.addEventListener('click', () => this.close());

    // Close on overlay click
    this._modalEl.addEventListener('click', (e) => {
      if (e.target === this._modalEl) this.close();
    });

    // Vrai focus trap (#296) : Tab/Shift+Tab bouclent dans la modale —
    // l'ancien commentaire "Focus trap" ne piegeait rien (aria-modal seul)
    this._modalEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !this._modalEl) return;
      const focusables = this._modalEl.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    // Close on Escape — handler retire dans _removeModal quel que soit le
    // chemin de fermeture (bouton, overlay, Escape) : il s'empilait sur
    // document pour toujours hors fermeture clavier (#296)
    this._escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._escHandler);

    // Announce
    const mapParent = this.closest('dsfr-data-map') as
      (Element & { announceToScreenReader?: (msg: string) => void }) | null;
    mapParent?.announceToScreenReader?.(`Modale ouverte : ${title}`);
  }

  private _removeModal() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    if (this._modalEl) {
      this._modalEl.remove();
      this._modalEl = null;
      // Restitution du focus au declencheur (RGAA, #296)
      this._previousFocus?.focus?.();
      this._previousFocus = null;
    }
  }

  // --- Styles ---

  private _injectStyles() {
    if (document.querySelector('style[data-dsfr-map-popup]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-dsfr-map-popup', '');
    style.textContent = `
      /* Panel */
      .dsfr-data-map-popup__panel {
        position: absolute;
        top: 0;
        bottom: 0;
        z-index: 1001;
        background: var(--background-default-grey, #fff);
        box-shadow: 0 0 12px rgba(0,0,0,0.15);
        overflow-y: auto;
        transition: transform 0.2s ease;
        display: flex;
        flex-direction: column;
      }
      .dsfr-data-map-popup__panel--right {
        right: 0;
        transform: translateX(100%);
      }
      .dsfr-data-map-popup__panel--left {
        left: 0;
        transform: translateX(-100%);
      }
      .dsfr-data-map-popup__panel--open {
        transform: translateX(0);
      }
      .dsfr-data-map-popup__panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--border-default-grey);
        min-height: 48px;
      }
      .dsfr-data-map-popup__panel-title {
        font-size: 1rem;
        font-weight: 700;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dsfr-data-map-popup__panel-body {
        padding: 1rem;
        flex: 1;
        overflow-y: auto;
      }
      .dsfr-data-map-popup__panel-body table {
        margin: 0;
        font-size: 0.875rem;
      }
      .dsfr-data-map-popup__panel-body th {
        text-align: left;
        padding-right: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
        vertical-align: top;
      }
      .dsfr-data-map-popup__panel-body td {
        word-break: break-word;
      }

      /* Modal overlay */
      .dsfr-data-map-popup__modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dsfr-data-map-popup__modal {
        background: var(--background-default-grey, #fff);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        max-width: 640px;
        width: 90vw;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
      }
      .dsfr-data-map-popup__modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid var(--border-default-grey);
      }
      .dsfr-data-map-popup__modal-title {
        font-size: 1.125rem;
        font-weight: 700;
        margin: 0;
      }
      .dsfr-data-map-popup__modal-body {
        padding: 1.5rem;
        overflow-y: auto;
        flex: 1;
      }
      .dsfr-data-map-popup__modal-body table {
        margin: 0;
        font-size: 0.875rem;
      }
      .dsfr-data-map-popup__modal-body th {
        text-align: left;
        padding-right: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
        vertical-align: top;
      }
    `;
    document.head.appendChild(style);
  }

  render() {
    return undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-map-popup': DsfrDataMapPopup;
  }
}
