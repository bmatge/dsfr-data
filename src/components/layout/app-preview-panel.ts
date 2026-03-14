import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/**
 * <app-preview-panel> - Panneau de prévisualisation avec onglets
 *
 * Composant réutilisable pour afficher un aperçu, du code et des données.
 * Utilisé par builder.html, builderIA.html et playground.html.
 *
 * Note: Utilise Light DOM pour hériter des styles DSFR.
 * Les éléments avec slot="preview", slot="code" et slot="data" sont déplacés
 * manuellement dans les conteneurs d'onglets après le rendu.
 *
 * @example
 * <app-preview-panel
 *   show-data-tab
 *   tab-labels="Aperçu,Code généré,Données brutes">
 *
 *   <!-- Slot preview : contenu de l'onglet aperçu -->
 *   <div slot="preview">
 *     <h2 id="preview-title">Mon graphique</h2>
 *     <p id="preview-subtitle">Source</p>
 *     <div class="chart-container">
 *       <canvas id="preview-canvas"></canvas>
 *     </div>
 *   </div>
 *
 *   <!-- Slot code : contenu de l'onglet code -->
 *   <div slot="code">
 *     <button id="copy-btn">Copier</button>
 *     <pre id="generated-code"></pre>
 *   </div>
 *
 *   <!-- Slot data : contenu de l'onglet données -->
 *   <div slot="data">
 *     <pre id="raw-data"></pre>
 *   </div>
 *
 * </app-preview-panel>
 */
@customElement('app-preview-panel')
export class AppPreviewPanel extends LitElement {
  /**
   * Afficher l'onglet Données
   */
  @property({ type: Boolean, attribute: 'show-data-tab' })
  showDataTab = false;

  /**
   * Afficher le bouton Sauvegarder en favoris
   */
  @property({ type: Boolean, attribute: 'show-save-button' })
  showSaveButton = false;

  /**
   * Afficher le bouton Ouvrir dans le Playground
   */
  @property({ type: Boolean, attribute: 'show-playground-button' })
  showPlaygroundButton = false;

  /**
   * Labels personnalisés pour les onglets (séparés par des virgules)
   */
  @property({ type: String, attribute: 'tab-labels' })
  tabLabels = 'Aperçu,Code,Données';

  /**
   * Onglet actif initial
   */
  @property({ type: String, attribute: 'active-tab' })
  activeTab = 'preview';

  @state()
  private _activeTab = 'preview';

  // Éléments enfants à projeter (sauvegardés avant le rendu)
  private _previewContent: Element[] = [];
  private _codeContent: Element[] = [];
  private _dataContent: Element[] = [];
  private _contentMoved = false;

  // Light DOM pour hériter des styles DSFR et permettre l'accès aux IDs
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this._activeTab = this.activeTab;
    // Sauvegarder les éléments enfants avant le premier rendu
    this._saveSlotContent();
  }

  /**
   * Sauvegarde les éléments enfants avec slot="preview", slot="code", slot="data"
   * pour les déplacer après le rendu (Light DOM n'a pas de slots natifs)
   */
  private _saveSlotContent() {
    this._previewContent = Array.from(this.querySelectorAll('[slot="preview"]'));
    this._codeContent = Array.from(this.querySelectorAll('[slot="code"]'));
    this._dataContent = Array.from(this.querySelectorAll('[slot="data"]'));
  }

  /**
   * Déplace le contenu sauvegardé dans les conteneurs d'onglets après le rendu
   */
  firstUpdated() {
    this._moveContent();
  }

  updated() {
    // S'assurer que le contenu est toujours dans les bons conteneurs
    if (!this._contentMoved) {
      this._moveContent();
    }
  }

  private _moveContent() {
    const previewContainer = this.querySelector('#tab-preview');
    const codeContainer = this.querySelector('#tab-code');
    const dataContainer = this.querySelector('#tab-data');

    if (previewContainer) {
      this._previewContent.forEach(el => previewContainer.appendChild(el));
    }
    if (codeContainer) {
      this._codeContent.forEach(el => codeContainer.appendChild(el));
    }
    if (dataContainer) {
      this._dataContent.forEach(el => dataContainer.appendChild(el));
    }
    this._contentMoved = true;
  }

  /**
   * Changer l'onglet actif programmatiquement
   */
  setActiveTab(tab: 'preview' | 'code' | 'data') {
    this._activeTab = tab;
    this.requestUpdate();
  }

  /**
   * Obtenir l'onglet actif
   */
  getActiveTab(): string {
    return this._activeTab;
  }

  private _handleTabClick(tab: string) {
    this._activeTab = tab;
    this.dispatchEvent(new CustomEvent('tab-change', {
      detail: { tab },
      bubbles: true,
      composed: true
    }));
    this.requestUpdate();
  }

  private _getTabLabels(): string[] {
    return this.tabLabels.split(',').map(l => l.trim());
  }

  private _handleSaveClick() {
    this.dispatchEvent(new CustomEvent('save-favorite', {
      bubbles: true,
      composed: true
    }));
  }

  private _handlePlaygroundClick() {
    this.dispatchEvent(new CustomEvent('open-playground', {
      bubbles: true,
      composed: true
    }));
  }

  render() {
    const labels = this._getTabLabels();
    const [previewLabel, codeLabel, dataLabel] = labels;

    return html`
      <div class="preview-panel">
        <!-- Onglets -->
        <div class="preview-panel-tabs">
          <button
            class="preview-panel-tab ${this._activeTab === 'preview' ? 'active' : ''}"
            data-tab="preview"
            @click="${() => this._handleTabClick('preview')}">
            ${previewLabel || 'Aperçu'}
          </button>
          <button
            class="preview-panel-tab ${this._activeTab === 'code' ? 'active' : ''}"
            data-tab="code"
            @click="${() => this._handleTabClick('code')}">
            ${codeLabel || 'Code'}
          </button>
          ${this.showDataTab ? html`
            <button
              class="preview-panel-tab ${this._activeTab === 'data' ? 'active' : ''}"
              data-tab="data"
              @click="${() => this._handleTabClick('data')}">
              ${dataLabel || 'Données'}
            </button>
          ` : nothing}
          ${this.showPlaygroundButton ? html`
            <button
              class="preview-panel-action-btn"
              @click="${this._handlePlaygroundClick}"
              title="Ouvrir dans le Playground">
              <i class="ri-play-circle-line" aria-hidden="true"></i>
              <span>Playground</span>
            </button>
          ` : nothing}
          ${this.showSaveButton ? html`
            <button
              class="preview-panel-action-btn preview-panel-save-btn"
              @click="${this._handleSaveClick}"
              title="Sauvegarder en favoris">
              <i class="ri-star-line" aria-hidden="true"></i>
              <span>Favoris</span>
            </button>
          ` : nothing}
        </div>

        <!-- Contenu des onglets -->
        <div class="preview-panel-content">
          <!-- Onglet Aperçu - contenu slot="preview" sera déplacé ici -->
          <div class="preview-panel-tab-content ${this._activeTab === 'preview' ? 'active' : ''}" id="tab-preview">
          </div>

          <!-- Onglet Code - contenu slot="code" sera déplacé ici -->
          <div class="preview-panel-tab-content ${this._activeTab === 'code' ? 'active' : ''}" id="tab-code">
          </div>

          <!-- Onglet Données - contenu slot="data" sera déplacé ici -->
          <div class="preview-panel-tab-content ${this._activeTab === 'data' ? 'active' : ''}" id="tab-data">
          </div>
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

        /* Onglets */
        .preview-panel-tabs {
          display: flex;
          background: var(--background-default-grey);
          border-bottom: 1px solid var(--border-default-grey);
          flex-shrink: 0;
        }

        .preview-panel-tab {
          padding: 0.75rem 1.5rem;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 0.85rem;
          border-bottom: 2px solid transparent;
          color: var(--text-mention-grey);
          transition: color 0.15s, border-color 0.15s;
        }

        .preview-panel-tab:hover {
          color: var(--text-action-high-blue-france);
        }

        .preview-panel-tab.active {
          color: var(--text-action-high-blue-france);
          border-bottom-color: var(--border-action-high-blue-france);
          font-weight: 600;
        }

        /* Boutons d'action (Playground, Favoris) */
        .preview-panel-action-btn {
          padding: 0.5rem 1rem;
          border: none;
          background: var(--background-action-low-blue-france);
          color: var(--text-action-high-blue-france);
          cursor: pointer;
          font-size: 0.8rem;
          border-radius: 4px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-right: 0.5rem;
          margin-top: 0.25rem;
          margin-bottom: 0.25rem;
          transition: background 0.15s;
        }

        .preview-panel-action-btn:first-of-type {
          margin-left: auto;
        }

        .preview-panel-action-btn:hover {
          background: var(--background-action-low-blue-france-hover);
        }

        .preview-panel-action-btn i {
          font-size: 1rem;
        }

        /* Contenu des onglets */
        .preview-panel-content {
          flex: 1;
          overflow: auto;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .preview-panel-tab-content {
          display: none;
          flex-direction: column;
          flex: 1;
          padding: 1.5rem;
          min-height: 0;
          overflow: auto;
        }

        .preview-panel-tab-content.active {
          display: flex;
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

        /* Copy button */
        .preview-panel-tab-content .copy-btn,
        .preview-panel-tab-content #copy-code-btn {
          align-self: flex-end;
          margin-bottom: 0.5rem;
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
          .preview-panel-tab {
            padding: 0.5rem 1rem;
            font-size: 0.8rem;
          }

          .preview-panel-tab-content {
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
