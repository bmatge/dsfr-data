import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { buildCsv } from '@dsfr-data/shared/lib';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';

let autoIdCounter = 0;
const MAX_TABLE_ROWS = 100;

/**
 * <dsfr-data-a11y> - Companion d'accessibilité pour visualisations
 *
 * Offre trois alternatives accessibles a un graphique, chacune activable :
 * - `table`       : tableau HTML avec les données du graphique
 * - `download`    : bouton de téléchargement CSV
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
  filename = 'données.csv';

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

  /** Observe le DOM en attendant la cible `for` si elle n'existe pas encore (#283) */
  private _targetObserver: MutationObserver | null = null;

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
    this._setupTarget();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopTargetObserver();
    this._removeSkipLink();
    this._removeAria();
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('for') || changedProperties.has('noAutoAria')) {
      this._removeSkipLink();
      this._removeAria();
      this._setupTarget();
    }
  }

  /**
   * Branche le companion sur sa cible `for` (#283).
   *
   * Cible introuvable : signalee via reportConfigError (avant : silence
   * total — la fonctionnalite centrale du composant pouvait ne pas
   * s'appliquer) puis OBSERVEE — un a11y pose avant sa cible (graphique
   * rendu par un autre script) s'applique des qu'elle apparait.
   */
  private _setupTarget() {
    this._stopTargetObserver();

    if (this.noAutoAria || !this.for) {
      clearConfigError(this);
      return;
    }

    if (document.getElementById(this.for)) {
      clearConfigError(this);
      this._injectSkipLink();
      this._applyAria();
      return;
    }

    reportConfigError(
      this,
      `dsfr-data-a11y[${this.id}]`,
      `cible "${this.for}" introuvable — application différée (en attente de son apparition dans le DOM)`
    );

    this._targetObserver = new MutationObserver(() => {
      if (!document.getElementById(this.for)) return;
      this._stopTargetObserver();
      clearConfigError(this);
      this._injectSkipLink();
      this._applyAria();
    });
    this._targetObserver.observe(document.body, { childList: true, subtree: true });
  }

  private _stopTargetObserver() {
    if (this._targetObserver) {
      this._targetObserver.disconnect();
      this._targetObserver = null;
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
    link.textContent = 'Voir les données accessibles';
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
    const ids = existing.split(/\s+/).filter((id) => id !== descId);
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
    // Memes colonnes que le tableau rendu (label-field/value-field si definis),
    // champs techniques `_*` exclus dans tous les cas.
    const columns = this._getColumns(data)
      .filter((key) => !key.startsWith('_'))
      .map((key) => ({ key }));
    return buildCsv(data, { columns });
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
        for (const vf of this.valueField.split(',').map((f) => f.trim())) {
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
    // Detect if target is a map component
    const target = this.for ? document.getElementById(this.for) : null;
    const isMap = target?.tagName?.toLowerCase() === 'dsfr-data-map';
    const label = isMap ? 'Données de la carte' : 'Données du graphique';
    const parts: string[] = [`${label} : ${count} lignes.`];
    if (this.description) parts.push(this.description);
    if (this._showDownload) parts.push('Téléchargement CSV disponible.');
    if (this._showTable) parts.push('Tableau de données disponible.');
    return parts.join(' ');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  render() {
    const data = this._sourceData;
    const hasData = Array.isArray(data) && data.length > 0;
    const sectionLabel = this.label || 'Accessibilité : données et description';
    const descId = `${this.id}-desc`;
    const tableId = `${this.id}-table`;

    const typedData = hasData ? (data as Record<string, unknown>[]) : [];
    const columns = hasData ? this._getColumns(typedData) : [];
    const tableRows = typedData.slice(0, MAX_TABLE_ROWS);
    const isTruncated = typedData.length > MAX_TABLE_ROWS;

    return html`
      <section
        class="dsfr-data-a11y"
        id="${this.id}-section"
        role="complementary"
        aria-label="${sectionLabel}"
      >
        <!-- Concise description for aria-describedby (sr-only) -->
        <p id="${descId}" class="dsfr-data-a11y__sr-only">
          ${this._getAutoDescription(hasData, data)}
        </p>

        <details class="fr-accordion">
          <summary class="fr-accordion__btn">${sectionLabel}</summary>
          <div class="fr-accordion__content">
            ${this._showDescription
              ? html`
                  <div class="fr-mb-2w">
                    <p class="fr-text--sm">${this.description}</p>
                  </div>
                `
              : nothing}
            ${this._showTable && hasData
              ? html`
                  <div class="fr-table fr-mb-2w" id="${tableId}">
                    <table>
                      <caption class="dsfr-data-a11y__sr-only">
                        ${(() => {
                          const t = this.for ? document.getElementById(this.for) : null;
                          return t?.tagName?.toLowerCase() === 'dsfr-data-map'
                            ? 'Données de la carte'
                            : 'Données du graphique';
                        })()}
                      </caption>
                      <thead>
                        <tr>
                          ${columns.map((col) => html`<th scope="col">${col}</th>`)}
                        </tr>
                      </thead>
                      <tbody>
                        ${tableRows.map(
                          (row) => html`
                            <tr>
                              ${columns.map((col) => html`<td>${row[col] ?? ''}</td>`)}
                            </tr>
                          `
                        )}
                      </tbody>
                    </table>
                    ${isTruncated
                      ? html`
                          <p class="fr-text--xs fr-mt-1w">
                            Affichage limite aux ${MAX_TABLE_ROWS} premieres lignes.
                            ${this._showDownload
                              ? 'Telechargez le CSV pour les données completes.'
                              : ''}
                          </p>
                        `
                      : nothing}
                  </div>
                `
              : nothing}
            ${this._showDownload
              ? html`
                  <button
                    class="fr-btn fr-btn--secondary fr-btn--sm fr-btn--icon-left fr-icon-download-line"
                    @click="${this._handleDownload}"
                    ?disabled="${!hasData || this._sourceLoading}"
                    title="Télécharger les données (CSV)"
                  >
                    Télécharger en CSV
                  </button>
                `
              : nothing}
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
