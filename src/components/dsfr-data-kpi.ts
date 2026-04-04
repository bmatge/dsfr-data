import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { formatValue, FormatType, getColorBySeuil } from '../utils/formatters.js';
import { computeAggregation } from '../utils/aggregations.js';
import { sendWidgetBeacon } from '../utils/beacon.js';

type KpiColor = 'vert' | 'orange' | 'rouge' | 'bleu';

const COLOR_CLASSES: Record<KpiColor, string> = {
  vert: 'dsfr-data-kpi--success',
  orange: 'dsfr-data-kpi--warning',
  rouge: 'dsfr-data-kpi--error',
  bleu: 'dsfr-data-kpi--info',
};

/**
 * <dsfr-data-kpi> - Widget d'indicateur chiffré
 *
 * Affiche une valeur numérique mise en avant, style "chiffre clé".
 * Se connecte à une source de données via son ID.
 *
 * @example
 * <dsfr-data-kpi
 *   source="sites"
 *   valeur="avg:score_rgaa"
 *   label="Score RGAA moyen"
 *   format="pourcentage"
 *   seuil-vert="80"
 *   seuil-orange="50">
 * </dsfr-data-kpi>
 */
@customElement('dsfr-data-kpi')
export class DsfrDataKpi extends SourceSubscriberMixin(LitElement) {
  @property({ type: String })
  source = '';

  /** Expression pour la valeur à afficher (ex: "total", "avg:score_rgaa") */
  @property({ type: String })
  valeur = '';

  /** Libellé affiché sous le chiffre */
  @property({ type: String })
  label = '';

  /** Description détaillée pour l'accessibilité */
  @property({ type: String })
  description = '';

  /** Classe d'icône (ex: ri-global-line) */
  @property({ type: String })
  icone = '';

  /** Format d'affichage: nombre, pourcentage, euro, decimal */
  @property({ type: String })
  format: FormatType = 'nombre';

  /** Expression pour la tendance (ex: "+3.2") */
  @property({ type: String })
  tendance = '';

  /** Seuil au-dessus duquel la valeur est verte */
  @property({ type: Number, attribute: 'seuil-vert' })
  seuilVert?: number;

  /** Seuil au-dessus duquel la valeur est orange */
  @property({ type: Number, attribute: 'seuil-orange' })
  seuilOrange?: number;

  /** Couleur forcée: vert, orange, rouge, bleu */
  @property({ type: String })
  couleur: KpiColor | '' = '';

  /** Largeur en colonnes DSFR (1-12). Significatif uniquement dans un <dsfr-data-kpi-group>. */
  @property({ type: Number, reflect: true })
  col?: number;

  // Utilise le Light DOM pour bénéficier des styles DSFR
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-kpi');
  }

  static styles = css``;

  private _computeValue(): number | string | null {
    if (!this._sourceData || !this.valeur) return null;
    return computeAggregation(this._sourceData, this.valeur);
  }

  private _getColor(): KpiColor {
    if (this.couleur) return this.couleur;

    const value = this._computeValue();
    if (typeof value !== 'number') return 'bleu';

    return getColorBySeuil(value, this.seuilVert, this.seuilOrange);
  }

  private _getTendanceInfo(): { value: number; direction: 'up' | 'down' | 'stable' } | null {
    if (!this.tendance || !this._sourceData) return null;

    const tendanceValue = computeAggregation(this._sourceData, this.tendance);
    if (typeof tendanceValue !== 'number') return null;

    return {
      value: tendanceValue,
      direction: tendanceValue > 0 ? 'up' : tendanceValue < 0 ? 'down' : 'stable',
    };
  }

  private _getAriaLabel(): string {
    if (this.description) return this.description;

    const value = this._computeValue();
    const formattedValue = formatValue(value as number, this.format);
    let label = `${this.label}: ${formattedValue}`;

    if (
      typeof value === 'number' &&
      (this.seuilVert !== undefined || this.seuilOrange !== undefined)
    ) {
      const color = this._getColor();
      const stateMap: Record<string, string> = {
        vert: 'bon',
        orange: 'attention',
        rouge: 'critique',
        bleu: '',
      };
      const state = stateMap[color];
      if (state) label += `, etat ${state}`;
    }

    return label;
  }

  render() {
    const value = this._computeValue();
    const formattedValue = formatValue(value as number, this.format);
    const colorClass = COLOR_CLASSES[this._getColor()] || COLOR_CLASSES.bleu;
    const tendance = this._getTendanceInfo();

    return html`
      <div class="dsfr-data-kpi ${colorClass}" role="figure" aria-label="${this._getAriaLabel()}">
        ${this._sourceLoading
          ? html`
              <div class="dsfr-data-kpi__loading" aria-live="polite">
                <span class="fr-icon-loader-4-line" aria-hidden="true"></span>
                Chargement...
              </div>
            `
          : this._sourceError
            ? html`
                <div class="dsfr-data-kpi__error" aria-live="assertive">
                  <span class="fr-icon-error-line" aria-hidden="true"></span>
                  Erreur de chargement
                </div>
              `
            : html`
                <div class="dsfr-data-kpi__content">
                  ${this.icone
                    ? html`
                        <span class="dsfr-data-kpi__icon ${this.icone}" aria-hidden="true"></span>
                      `
                    : ''}
                  <div class="dsfr-data-kpi__value-wrapper">
                    <span class="dsfr-data-kpi__value">${formattedValue}</span>
                    ${tendance
                      ? html`
                          <span
                            class="dsfr-data-kpi__tendance dsfr-data-kpi__tendance--${tendance.direction}"
                            role="img"
                            aria-label="${tendance.value > 0
                              ? `en hausse de ${Math.abs(tendance.value).toFixed(1)}%`
                              : tendance.value < 0
                                ? `en baisse de ${Math.abs(tendance.value).toFixed(1)}%`
                                : 'stable'}"
                          >
                            ${tendance.direction === 'up'
                              ? '↑'
                              : tendance.direction === 'down'
                                ? '↓'
                                : '→'}
                            ${Math.abs(tendance.value).toFixed(1)}%
                          </span>
                        `
                      : ''}
                  </div>
                  <span class="dsfr-data-kpi__label">${this.label}</span>
                </div>
              `}
      </div>
      <style>
        .dsfr-data-kpi {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 1.5rem;
          background: var(--background-default-grey);
          border-radius: 0.25rem;
          border-left: 4px solid var(--border-default-grey);
          min-height: 140px;
          height: 100%;
          box-sizing: border-box;
        }
        .dsfr-data-kpi--success {
          border-left-color: var(--background-flat-success);
        }
        .dsfr-data-kpi--warning {
          border-left-color: var(--background-flat-warning);
        }
        .dsfr-data-kpi--error {
          border-left-color: var(--background-flat-error);
        }
        .dsfr-data-kpi--info {
          border-left-color: var(--background-flat-info);
        }
        .dsfr-data-kpi__content {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .dsfr-data-kpi__icon {
          font-size: 1.5rem;
          color: var(--text-mention-grey);
        }
        .dsfr-data-kpi__value-wrapper {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }
        .dsfr-data-kpi__value {
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1;
          color: var(--text-title-grey);
        }
        .dsfr-data-kpi__tendance {
          font-size: 0.875rem;
          font-weight: 500;
        }
        .dsfr-data-kpi__tendance--up {
          color: var(--text-default-success);
        }
        .dsfr-data-kpi__tendance--down {
          color: var(--text-default-error);
        }
        .dsfr-data-kpi__tendance--stable {
          color: var(--text-mention-grey);
        }
        .dsfr-data-kpi__label {
          font-size: 0.875rem;
          color: var(--text-mention-grey);
        }
        .dsfr-data-kpi__loading,
        .dsfr-data-kpi__error {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-mention-grey);
          font-size: 0.875rem;
        }
        .dsfr-data-kpi__error {
          color: var(--text-default-error);
        }
      </style>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-kpi': DsfrDataKpi;
  }
}
