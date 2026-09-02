import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * <app-preview-panel> - Panneau de prévisualisation à onglets DSFR (fr-tabs)
 *
 * Onglets normalisés `Aperçu · Code · Données` (docs/ux/actions.md §2.4, lot UX 4
 * #541) rendus en **fr-tabs natifs** : le JS du DSFR (chargé par chaque page)
 * gère la sélection, `aria-selected`, le roving tabindex et les flèches. Le
 * composant ne bind jamais ces attributs (il les pose une fois) pour ne pas
 * écraser l'état géré par le DSFR à un rendu suivant.
 *
 * **Aucune action dans le tablist** (audit C3) : les actions sur l'artefact
 * vivent dans <app-action-bar>.
 *
 * Note : Light DOM pour hériter des styles DSFR. Les éléments avec
 * slot="preview", slot="code" et slot="data" sont déplacés dans les panneaux
 * `#tab-preview`, `#tab-code`, `#tab-data` (ids historiques conservés).
 *
 * @example
 * <app-preview-panel show-data-tab tab-labels="Aperçu,Code,JSON">
 *   <div slot="preview">…</div>
 *   <div slot="code"><pre id="generated-code"></pre></div>
 *   <div slot="data"><pre id="raw-data"></pre></div>
 * </app-preview-panel>
 *
 * @fires tab-change - { tab: 'preview' | 'code' | 'data' } à chaque changement d'onglet.
 */

export type PreviewTab = 'preview' | 'code' | 'data';

const TABS: PreviewTab[] = ['preview', 'code', 'data'];
const DEFAULT_LABELS: Record<PreviewTab, string> = {
  preview: 'Aperçu',
  code: 'Code',
  data: 'Données',
};

/** API DSFR (globale, injectée par dsfr.module.js) — optionnelle en test. */
interface DsfrTabPanelApi {
  tabPanel?: { disclose: () => void };
}
declare global {
  interface Window {
    dsfr?: (el: Element) => DsfrTabPanelApi;
  }
}

@customElement('app-preview-panel')
export class AppPreviewPanel extends LitElement {
  /** Afficher l'onglet Données (ou JSON). */
  @property({ type: Boolean, attribute: 'show-data-tab' })
  showDataTab = false;

  /**
   * Libellés des onglets, séparés par des virgules. Seules les formes du
   * lexique sont attendues : `Aperçu`, `Code`, `Données` ou `JSON`.
   */
  @property({ type: String, attribute: 'tab-labels' })
  tabLabels = 'Aperçu,Code,Données';

  /** Onglet actif initial. */
  @property({ type: String, attribute: 'active-tab' })
  activeTab: PreviewTab = 'preview';

  /** Onglet courant — champ simple, pas d'état Lit : le DSFR pilote le DOM. */
  private _activeTab: PreviewTab = 'preview';

  private _previewContent: Element[] = [];
  private _codeContent: Element[] = [];
  private _dataContent: Element[] = [];
  private _contentMoved = false;
  /** Suit la classe `fr-tabs__panel--selected` posée par le JS du DSFR. */
  private _selectionObserver?: MutationObserver;

  // Light DOM pour hériter des styles DSFR et permettre l'accès aux ids
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this._activeTab = this.activeTab;
    this._saveSlotContent();
  }

  /** Sauvegarde les enfants slot="…" pour les projeter après le rendu. */
  private _saveSlotContent() {
    this._previewContent = Array.from(this.querySelectorAll('[slot="preview"]'));
    this._codeContent = Array.from(this.querySelectorAll('[slot="code"]'));
    this._dataContent = Array.from(this.querySelectorAll('[slot="data"]'));
  }

  firstUpdated() {
    this._moveContent();
    // Le JS du DSFR bascule `fr-tabs__panel--selected` : on l'observe plutôt
    // que de dépendre du nom de ses événements.
    if (typeof MutationObserver !== 'undefined') {
      this._selectionObserver = new MutationObserver(() => {
        const selected = this._panels().find((p) =>
          p.classList.contains('fr-tabs__panel--selected')
        );
        const tab = selected?.dataset.tab as PreviewTab | undefined;
        if (tab && tab !== this._activeTab) this._emitChange(tab);
      });
      for (const panel of this._panels()) {
        this._selectionObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
      }
    }
  }

  updated() {
    if (!this._contentMoved) this._moveContent();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._selectionObserver?.disconnect();
  }

  private _panels(): HTMLElement[] {
    return Array.from(this.querySelectorAll<HTMLElement>('.fr-tabs__panel[data-tab]'));
  }

  private _moveContent() {
    const previewContainer = this.querySelector('#tab-preview');
    const codeContainer = this.querySelector('#tab-code');
    const dataContainer = this.querySelector('#tab-data');
    if (previewContainer) this._previewContent.forEach((el) => previewContainer.appendChild(el));
    if (codeContainer) this._codeContent.forEach((el) => codeContainer.appendChild(el));
    if (dataContainer) this._dataContent.forEach((el) => dataContainer.appendChild(el));
    this._contentMoved = true;
  }

  /** Changer l'onglet actif programmatiquement (via l'API DSFR si présente). */
  setActiveTab(tab: PreviewTab) {
    const panel = this.querySelector<HTMLElement>(`#tab-${tab}`);
    if (!panel) return;
    const api = typeof window.dsfr === 'function' ? window.dsfr(panel) : undefined;
    if (api?.tabPanel) {
      api.tabPanel.disclose();
    } else {
      // Repli sans JS DSFR (tests) : bascule manuelle des classes/attributs.
      for (const p of this._panels()) {
        const selected = p === panel;
        p.classList.toggle('fr-tabs__panel--selected', selected);
        const btn = this.querySelector<HTMLElement>(`#${p.getAttribute('aria-labelledby')}`);
        btn?.setAttribute('aria-selected', selected ? 'true' : 'false');
        btn?.setAttribute('tabindex', selected ? '0' : '-1');
      }
      if (tab !== this._activeTab) this._emitChange(tab);
    }
  }

  /** Onglet actif. */
  getActiveTab(): string {
    return this._activeTab;
  }

  private _emitChange(tab: PreviewTab) {
    this._activeTab = tab;
    this.dispatchEvent(
      new CustomEvent('tab-change', { detail: { tab }, bubbles: true, composed: true })
    );
  }

  /** Clic sur un onglet (repli si le JS DSFR n'a pas instancié les tabs). */
  private _onTabClick(tab: PreviewTab) {
    if (typeof window.dsfr !== 'function') this.setActiveTab(tab);
  }

  private _labels(): Record<PreviewTab, string> {
    const parts = this.tabLabels.split(',').map((l) => l.trim());
    return {
      preview: parts[0] || DEFAULT_LABELS.preview,
      code: parts[1] || DEFAULT_LABELS.code,
      data: parts[2] || DEFAULT_LABELS.data,
    };
  }

  render() {
    const labels = this._labels();
    const tabs = TABS.filter((t) => t !== 'data' || this.showDataTab);
    const initial = tabs.includes(this.activeTab) ? this.activeTab : 'preview';

    // Attributs d'état posés une fois (pas d'expression Lit) : le DSFR les
    // fait évoluer ensuite sans être écrasé par un re-rendu.
    return html`
      <div class="preview-panel">
        <div class="fr-tabs preview-panel-tabs">
          <ul class="fr-tabs__list" role="tablist" aria-label="Panneau d'aperçu">
            ${tabs.map((tab) =>
              tab === initial
                ? html`<li role="presentation">
                    <button
                      type="button"
                      id="tab-${tab}-btn"
                      class="fr-tabs__tab"
                      tabindex="0"
                      role="tab"
                      aria-selected="true"
                      aria-controls="tab-${tab}"
                      @click=${() => this._onTabClick(tab)}
                    >
                      ${labels[tab]}
                    </button>
                  </li>`
                : html`<li role="presentation">
                    <button
                      type="button"
                      id="tab-${tab}-btn"
                      class="fr-tabs__tab"
                      tabindex="-1"
                      role="tab"
                      aria-selected="false"
                      aria-controls="tab-${tab}"
                      @click=${() => this._onTabClick(tab)}
                    >
                      ${labels[tab]}
                    </button>
                  </li>`
            )}
          </ul>
          ${tabs.map((tab) =>
            tab === initial
              ? html`<div
                  id="tab-${tab}"
                  class="fr-tabs__panel fr-tabs__panel--selected preview-panel-tab-content"
                  role="tabpanel"
                  aria-labelledby="tab-${tab}-btn"
                  tabindex="0"
                  data-tab="${tab}"
                ></div>`
              : html`<div
                  id="tab-${tab}"
                  class="fr-tabs__panel preview-panel-tab-content"
                  role="tabpanel"
                  aria-labelledby="tab-${tab}-btn"
                  tabindex="0"
                  data-tab="${tab}"
                ></div>`
          )}
          ${nothing}
        </div>
      </div>

      <style>
        app-preview-panel {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          background: var(--background-alt-grey);
        }

        .preview-panel {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }

        /* fr-tabs : le DSFR fige la hauteur du bloc sur celle du panneau au
           moment de l'ouverture (--tabs-height) — incompatible avec un aperçu
           qui grandit après coup (graphique rendu en différé, iframe). On
           laisse la hauteur libre et on masque les panneaux non sélectionnés. */
        .preview-panel > .fr-tabs {
          height: auto !important;
          flex: 1;
          flex-direction: column;
          flex-wrap: nowrap;
          min-height: 0;
          overflow: visible;
          transition: none;
          box-shadow: none;
          border-bottom: 0;
          background: var(--background-default-grey);
        }

        /* Le filler ::before du DSFR (trait de fond en ligne) devient un
           item flex vide en colonne : on le retire. */
        .preview-panel > .fr-tabs::before {
          display: none;
        }

        .preview-panel > .fr-tabs > .fr-tabs__list {
          flex-shrink: 0;
          box-shadow: inset 0 -1px 0 0 var(--border-default-grey);
        }

        .preview-panel > .fr-tabs > .fr-tabs__panel {
          left: 0;
          margin-right: 0;
          transform: none;
          transition: none;
          background: var(--background-alt-grey);
        }

        .preview-panel > .fr-tabs > .fr-tabs__panel:not(.fr-tabs__panel--selected) {
          display: none;
        }

        .preview-panel-tab-content.fr-tabs__panel--selected {
          display: flex;
          flex-direction: column;
          flex: 1;
          padding: 1.5rem;
          min-height: 0;
          overflow: auto;
        }

        /* Styles communs pour le contenu des slots */

        /* Preview content */
        .preview-panel-tab-content .preview-chart,
        .preview-panel-tab-content .chart-wrapper {
          position: relative;
          flex: 1;
          min-height: 300px;
          background: var(--background-default-grey);
          border-radius: 8px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
        }

        .preview-panel-tab-content .preview-title,
        .preview-panel-tab-content h2:first-child {
          margin: 0 0 0.25rem;
          font-size: 1.25rem;
          color: var(--text-title-grey);
        }

        .preview-panel-tab-content .preview-subtitle,
        .preview-panel-tab-content .subtitle {
          margin: 0 0 1rem;
          font-size: 0.9rem;
          color: var(--text-mention-grey);
        }

        .preview-panel-tab-content .chart-container {
          position: relative;
          flex: 1;
          min-height: 300px;
        }

        .preview-panel-tab-content .empty-state {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--text-mention-grey);
          text-align: center;
          pointer-events: none;
        }

        .preview-panel-tab-content .empty-state i {
          font-size: 3rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        /* Code output styles */
        .preview-panel-tab-content .code-output,
        .preview-panel-tab-content pre#generated-code,
        .preview-panel-tab-content pre#raw-data {
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 1rem;
          border-radius: 8px;
          font-family: 'Fira Code', 'Consolas', monospace;
          font-size: 0.8rem;
          white-space: pre-wrap;
          word-break: break-word;
          overflow: auto;
          flex: 1;
          margin: 0;
          min-height: 200px;
        }

        /* Canvas and iframe in preview */
        .preview-panel-tab-content canvas {
          width: 100% !important;
          height: 100% !important;
        }

        .preview-panel-tab-content iframe {
          width: 100%;
          height: 100%;
          min-height: 400px;
          border: none;
          background: white;
          border-radius: 4px;
        }

        /* Data summary */
        .preview-panel-tab-content .data-summary {
          background: var(--background-default-grey);
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .preview-panel-tab-content .data-summary h4 {
          margin: 0 0 0.5rem;
          font-size: 0.9rem;
        }

        .preview-panel-tab-content .field-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .preview-panel-tab-content .field-tag {
          padding: 0.25rem 0.5rem;
          background: var(--background-contrast-info);
          border-radius: 4px;
          font-size: 0.75rem;
        }

        /* Responsive */
        @media (max-width: 600px) {
          .preview-panel-tab-content.fr-tabs__panel--selected {
            padding: 1rem;
          }
        }
      </style>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-preview-panel': AppPreviewPanel;
  }
}
