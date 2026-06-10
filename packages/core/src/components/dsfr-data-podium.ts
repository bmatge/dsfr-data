import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { toNumber, CHOROPLETH_SCALES } from '@dsfr-data/shared/lib';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { getByPath } from '../utils/json-path.js';
import { formatNumber } from '../utils/formatters.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { renderSourceLoading, renderSourceError } from '../utils/status-templates.js';

// Palettes : source unique @dsfr-data/shared (#302) — la categorical locale
// differait de PALETTE_COLORS : meme attribut selected-palette que chart,
// couleurs differentes (dashboard incoherent visuellement).

interface PodiumItem {
  label: string;
  subtitle: string;
  value: number;
  ratio: number;
  color: string;
  rank: number;
}

/**
 * <dsfr-data-podium> - Classement visuel avec barres proportionnelles
 *
 * Affiche un podium (top N) avec rang, label, barre de progression et valeur.
 * Se connecte au pipeline dsfr-data-source / dsfr-data-query.
 *
 * @example
 * <dsfr-data-podium
 *   source="regions"
 *   label-field="nom"
 *   value-field="population"
 *   subtitle="Region"
 *   value-unit="hab."
 *   selected-palette="sequentialDescending"
 *   max-items="5">
 * </dsfr-data-podium>
 */
@customElement('dsfr-data-podium')
export class DsfrDataPodium extends SourceSubscriberMixin(LitElement) {
  @property({ type: String })
  source = '';

  /** Chemin vers le champ label */
  @property({ type: String, attribute: 'label-field' })
  labelField = '';

  /** Chemin vers le champ valeur (numérique) */
  @property({ type: String, attribute: 'value-field' })
  valueField = '';

  /** Texte fixe affiche sous chaque label */
  @property({ type: String })
  subtitle = '';

  /** Chemin vers un champ pour le sous-titre (prioritaire sur subtitle) */
  @property({ type: String, attribute: 'subtitle-field' })
  subtitleField = '';

  /** Unite affichee apres la valeur */
  @property({ type: String, attribute: 'value-unit' })
  valueUnit = '';

  /** Palette de couleurs pour la bordure gauche */
  @property({ type: String, attribute: 'selected-palette' })
  selectedPalette = 'sequentialDescending';

  /** Nombre maximum d'items affiches */
  @property({ type: Number, attribute: 'max-items' })
  maxItems = 5;

  /** Desactive le tri automatique (desc par valeur) */
  @property({ type: Boolean, attribute: 'no-sort' })
  noSort = false;

  /** Valeur max forcee pour le calcul des barres (ex: 100 pour des %) */
  @property({ type: Number, attribute: 'bar-max' })
  barMax?: number;

  @state()
  private _data: Record<string, unknown>[] = [];

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-podium');
  }

  static styles = [];

  onSourceReset(): void {
    this._data = [];
  }

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? data : [];
  }

  private _processItems(): PodiumItem[] {
    if (!this._data.length || !this.labelField || !this.valueField) return [];

    // Extract label + value + subtitle
    let items = this._data.map((record) => ({
      label: String(getByPath(record, this.labelField) ?? ''),
      subtitle: this.subtitleField
        ? String(getByPath(record, this.subtitleField) ?? '')
        : this.subtitle,
      value: toNumber(getByPath(record, this.valueField)),
      ratio: 0,
      color: '',
      rank: 0,
    }));

    // Sort descending by value (unless disabled)
    if (!this.noSort) {
      items.sort((a, b) => b.value - a.value);
    }

    // Truncate
    items = items.slice(0, this.maxItems);

    // Compute bar ratios
    const maxValue = this.barMax ?? Math.max(...items.map((i) => i.value), 1);

    // Pick palette colors
    const palette =
      CHOROPLETH_SCALES[this.selectedPalette] ?? CHOROPLETH_SCALES['sequentialDescending'];

    items.forEach((item, index) => {
      item.ratio = maxValue > 0 ? item.value / maxValue : 0;
      item.color = palette[index % palette.length];
      item.rank = index + 1;
    });

    return items;
  }

  private _formatValue(value: number): string {
    const formatted = formatNumber(value);
    return this.valueUnit ? `${formatted} ${this.valueUnit}` : formatted;
  }

  private _getAriaLabel(): string {
    const items = this._processItems();
    if (!items.length) return 'Classement vide';
    return `Classement : ${items.map((i) => `${i.rank}. ${i.label}, ${this._formatValue(i.value)}`).join(' ; ')}`;
  }

  render() {
    if (this._sourceLoading) {
      return html`
        <div class="dsfr-data-podium">${renderSourceLoading('dsfr-data-podium')}</div>
        ${this._renderStyles()}
      `;
    }

    if (this._sourceError) {
      return html`
        <div class="dsfr-data-podium">
          ${renderSourceError('dsfr-data-podium', this._sourceError)}
        </div>
        ${this._renderStyles()}
      `;
    }

    const items = this._processItems();

    if (!items.length) {
      return html`
        <div class="dsfr-data-podium">
          <div class="dsfr-data-podium__empty">Aucune donnee</div>
        </div>
        ${this._renderStyles()}
      `;
    }

    return html`
      <ol class="dsfr-data-podium" role="list" aria-label="${this._getAriaLabel()}">
        ${items.map(
          (item) => html`
            <li class="dsfr-data-podium__item" style="--podium-color: ${item.color}">
              <span class="dsfr-data-podium__rank" aria-hidden="true">${item.rank}</span>
              <div class="dsfr-data-podium__content">
                <div class="dsfr-data-podium__header">
                  <div class="dsfr-data-podium__label-group">
                    <span class="dsfr-data-podium__label">${item.label}</span>
                    ${item.subtitle
                      ? html`<span class="dsfr-data-podium__subtitle">${item.subtitle}</span>`
                      : ''}
                  </div>
                  <span class="dsfr-data-podium__value">${this._formatValue(item.value)}</span>
                </div>
                <div class="dsfr-data-podium__bar-track" aria-hidden="true">
                  <div
                    class="dsfr-data-podium__bar-fill"
                    style="width: ${Math.round(item.ratio * 100)}%"
                  ></div>
                </div>
              </div>
            </li>
          `
        )}
      </ol>
      ${this._renderStyles()}
    `;
  }

  private _renderStyles() {
    return html`
      <style>
        .dsfr-data-podium {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .dsfr-data-podium__item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          background: var(--background-default-grey);
          border-radius: 0.25rem;
          border-left: 4px solid var(--podium-color, var(--border-default-grey));
        }
        .dsfr-data-podium__rank {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-mention-grey);
          min-width: 1.75rem;
          text-align: center;
          flex-shrink: 0;
        }
        .dsfr-data-podium__content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .dsfr-data-podium__header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 1rem;
        }
        .dsfr-data-podium__label-group {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .dsfr-data-podium__label {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-title-grey);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dsfr-data-podium__subtitle {
          font-size: 0.75rem;
          color: var(--text-mention-grey);
        }
        .dsfr-data-podium__value {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--text-mention-grey);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .dsfr-data-podium__bar-track {
          height: 6px;
          background: var(--background-alt-grey);
          border-radius: 3px;
          overflow: hidden;
        }
        .dsfr-data-podium__bar-fill {
          height: 100%;
          background: var(--podium-color, var(--background-flat-info));
          border-radius: 3px;
          transition: width 0.3s ease;
        }
        .dsfr-data-podium__loading,
        .dsfr-data-podium__error,
        .dsfr-data-podium__empty {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1.5rem;
          color: var(--text-mention-grey);
          font-size: 0.875rem;
        }
        .dsfr-data-podium__error {
          color: var(--text-default-error);
        }
      </style>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-podium': DsfrDataPodium;
  }
}
