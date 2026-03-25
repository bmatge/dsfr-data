import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { sendWidgetBeacon } from '../utils/beacon.js';

let autoIdCounter = 0;
const MAX_TABLE_ROWS = 100;

/**
 * <dsfr-data-a11y> - Companion d'accessibilite pour visualisations
 *
 * Offre trois alternatives accessibles a un graphique, chacune activable :
 * - `table`       : tableau HTML avec les donnees du graphique
 * - `download`    : bouton de telechargement CSV
 * - `description` : transcription textuelle libre
 *
 * Via l'attribut `for`, il injecte :
 * - Un skip link dans le graphique cible (visible au focus clavier)
 * - `aria-describedby` vers un resume concis (screen readers)
 * - `aria-details` vers le tableau (si active, progressive enhancement)
 *
 * @example
 * <dsfr-data-chart id="mon-graph" source="data" type="bar"
 *   label-field="region" value-field="total">
 * </dsfr-data-chart>
 * <dsfr-data-a11y for="mon-graph" source="data" table download
 *   description="L'Ile-de-France domine largement.">
 * </dsfr-data-a11y>
 */
@customElement('dsfr-data-a11y')
export class DsfrDataA11y extends SourceSubscriberMixin(LitElement) {

  @property({ type: String })
  source = '';

  @property({ type: String, attribute: 'for' })
  for = '';

  @property({ type: Boolean })
  table = false;

  @property({ type: Boolean })
  download = false;

  @property({ type: String })
  filename = 'donnees.csv';

  @property({ type: String })
  description = '';

  @property({ type: String, attribute: 'label-field' })
  labelField = '';

  @property({ type: String, attribute: 'value-field' })
  valueField = '';

  @property({ type: String })
  label = '';

  @property({ type: Boolean, attribute: 'no-auto-aria' })
  noAutoAria = false;

  private _previousForTarget: Element | null = null;
  private _injectedSkipLink: HTMLAnchorElement | null = null;

  createRenderRoot() {
    return this;
  }

  /** If none of the 3 features is explicitly set, show all available */
  private get _showAll(): boolean {
    return !this.table && !this.download && !this.description;
  }

  private get _showTable(): boolean {
    return this.table || this._showAll;
  }

  private get _showDownload(): boolean {
    return this.download || this._showAll;
  }

  private get _showDescription(): boolean {
    return !!this.description;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-a11y');
    this._ensureId();
    this._injectSkipLink();
    this._applyAria();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._removeSkipLink();
    this._removeAria();
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('for') || changedProperties.has('noAutoAria')) {
      this._removeSkipLink();
      this._removeAria();
      this._injectSkipLink();
      this._applyAria();
    }
  }

  // ---------------------------------------------------------------------------
  // ID management
  // ---------------------------------------------------------------------------

  private _ensureId() {
    if (!this.id) {
      this.id = `dsfr-data-a11y-${++autoIdCounter}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Skip link injection
  // ---------------------------------------------------------------------------

  private _injectSkipLink() {
    if (this.noAutoAria || !this.for) return;
    const target = document.getElementById(this.for);
    if (!target) return;

    const link = document.createElement('a');
    link.href = `#${this.id}-section`;
    link.className = 'dsfr-data-a11y__skiplink';
    link.textContent = 'Voir les donnees accessibles';
    link.setAttribute('data-dsfr-data-a11y-link', this.id);

    target.insertBefore(link, target.firstChild);
    this._injectedSkipLink = link;
  }

  private _removeSkipLink() {
    if (this._injectedSkipLink) {
      this._injectedSkipLink.remove();
      this._injectedSkipLink = null;
    }
  }

  // ---------------------------------------------------------------------------
  // ARIA management
  // ---------------------------------------------------------------------------

  private _applyAria() {
    if (this.noAutoAria || !this.for) return;
    const target = document.getElementById(this.for);
    if (!target) return;

    this._previousForTarget = target;

    // aria-describedby → concise description paragraph
    const descId = `${this.id}-desc`;
    const existing = target.getAttribute('aria-describedby') || '';
    if (!existing.split(/\s+/).includes(descId)) {
      const value = existing ? `${existing} ${descId}` : descId;
      target.setAttribute('aria-describedby', value);
    }

    // aria-details → data table (progressive enhancement)
    if (this._showTable) {
      target.setAttribute('aria-details', `${this.id}-table`);
    }
  }

  private _removeAria() {
    if (!this._previousForTarget) return;
    const target = this._previousForTarget;

    // Clean aria-describedby
    const descId = `${this.id}-desc`;
    const existing = target.getAttribute('aria-describedby') || '';
    const ids = existing.split(/\s+/).filter(id => id !== descId);
    if (ids.length > 0) {
      target.setAttribute('aria-describedby', ids.join(' '));
    } else {
      target.removeAttribute('aria-describedby');
    }

    // Clean aria-details
    if (target.getAttribute('aria-details') === `${this.id}-table`) {
      target.removeAttribute('aria-details');
    }

    this._previousForTarget = null;
  }

  // ---------------------------------------------------------------------------
  // CSV generation (ported from dsfr-data-raw-data)
  // ---------------------------------------------------------------------------

  private _handleDownload() {
    const data = this._sourceData;
    if (!data || !Array.isArray(data) || data.length === 0) return;
    const csv = this._buildCsv(data as Record<string, unknown>[]);
    this._triggerDownload(csv);
  }

  _buildCsv(data: Record<string, unknown>[]): string {
    const keys = Object.keys(data[0]);
    const header = keys.join(';');
    const rows = data.map(item =>
      keys.map(key => {
        const str = String(item[key] ?? '');
        return str.includes(';') || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(';')
    );
    return [header, ...rows].join('\n');
  }

  private _triggerDownload(csv: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------

  private _getColumns(data: Record<string, unknown>[]): string[] {
    if (this.labelField || this.valueField) {
      const cols: string[] = [];
      if (this.labelField) cols.push(this.labelField);
      if (this.valueField) {
        for (const vf of this.valueField.split(',').map(f => f.trim())) {
          if (vf) cols.push(vf);
        }
      }
      return cols;
    }
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }

  // ---------------------------------------------------------------------------
  // Auto-generated description for aria-describedby
  // ---------------------------------------------------------------------------

  private _getAutoDescription(hasData: boolean, data: unknown): string {
    if (!hasData) return 'Aucune donnee disponible.';
    const count = (data as unknown[]).length;
    const parts: string[] = [`Donnees du graphique : ${count} lignes.`];
    if (this.description) parts.push(this.description);
    if (this._showDownload) parts.push('Telechargement CSV disponible.');
    if (this._showTable) parts.push('Tableau de donnees disponible.');
    return parts.join(' ');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  render() {
    const data = this._sourceData;
    const hasData = Array.isArray(data) && data.length > 0;
    const sectionLabel = this.label || 'Accessibilite : donnees et description';
    const descId = `${this.id}-desc`;
    const tableId = `${this.id}-table`;

    const typedData = hasData ? (data as Record<string, unknown>[]) : [];
    const columns = hasData ? this._getColumns(typedData) : [];
    const tableRows = typedData.slice(0, MAX_TABLE_ROWS);
    const isTruncated = typedData.length > MAX_TABLE_ROWS;

    return html`
      <section class="dsfr-data-a11y"
               id="${this.id}-section"
               role="complementary"
               aria-label="${sectionLabel}">

        <!-- Concise description for aria-describedby (sr-only) -->
        <p id="${descId}" class="dsfr-data-a11y__sr-only">
          ${this._getAutoDescription(hasData, data)}
        </p>

        <details class="fr-accordion">
          <summary class="fr-accordion__btn">${sectionLabel}</summary>
          <div class="fr-accordion__content">

            ${this._showDescription ? html`
              <div class="fr-mb-2w">
                <p class="fr-text--sm">${this.description}</p>
              </div>
            ` : nothing}

            ${this._showTable && hasData ? html`
              <div class="fr-table fr-mb-2w" id="${tableId}">
                <table>
                  <caption class="dsfr-data-a11y__sr-only">Donnees du graphique</caption>
                  <thead>
                    <tr>
                      ${columns.map(col => html`<th scope="col">${col}</th>`)}
                    </tr>
                  </thead>
                  <tbody>
                    ${tableRows.map(row => html`
                      <tr>
                        ${columns.map(col => html`<td>${row[col] ?? ''}</td>`)}
                      </tr>
                    `)}
                  </tbody>
                </table>
                ${isTruncated ? html`
                  <p class="fr-text--xs fr-mt-1w">
                    Affichage limite aux ${MAX_TABLE_ROWS} premieres lignes.
                    ${this._showDownload ? 'Telechargez le CSV pour les donnees completes.' : ''}
                  </p>
                ` : nothing}
              </div>
            ` : nothing}

            ${this._showDownload ? html`
              <button
                class="fr-btn fr-btn--secondary fr-btn--sm fr-btn--icon-left fr-icon-download-line"
                @click="${this._handleDownload}"
                ?disabled="${!hasData || this._sourceLoading}"
                title="Telecharger les donnees (CSV)">
                Telecharger en CSV
              </button>
            ` : nothing}

          </div>
        </details>
      </section>

      <style>
        .dsfr-data-a11y {
          margin-top: 0.5rem;
        }
        .dsfr-data-a11y__sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          margin: -1px;
          padding: 0;
          border: 0;
        }
        .dsfr-data-a11y__skiplink {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          margin: -1px;
          padding: 0;
          border: 0;
        }
        .dsfr-data-a11y__skiplink:focus {
          position: static;
          width: auto;
          height: auto;
          overflow: visible;
          clip: auto;
          white-space: normal;
          margin: 0;
          display: inline-block;
          padding: 0.25rem 0.75rem;
          background: var(--background-default-grey, #fff);
          color: var(--text-action-high-blue-france, #000091);
          text-decoration: underline;
          font-size: 0.875rem;
          z-index: 1;
        }
      </style>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-a11y': DsfrDataA11y;
  }
}
