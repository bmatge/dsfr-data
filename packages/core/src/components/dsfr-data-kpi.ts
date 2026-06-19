import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { formatValue, formatPercentage, FormatType, getColorBySeuil } from '../utils/formatters.js';
import { computeAggregation } from '../utils/aggregations.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { renderSourceLoading, renderSourceError } from '../utils/status-templates.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { parseKpiLines, resolveKpiLines, type ResolvedKpiLine } from '../utils/kpi-lines.js';

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
  /**
   * Expression de valeur — convention cible anglaise (#300).
   * Grammaire commune "champ:fn" (#303), ex. value="population:sum".
   */
  @property({ type: String })
  value = '';

  /** @deprecated alias français de `value` (#300) */
  @property({ type: String })
  valeur = '';

  /**
   * Titre affiché AU-DESSUS de la valeur (surtitre, style majuscules grises).
   * Nommé `heading` et non `title` : ce dernier entrerait en collision avec la
   * propriété DOM native HTMLElement.title (infobulle).
   */
  @property({ type: String })
  heading = '';

  /** Libellé affiché sous le chiffre (et sous les `lines`) */
  @property({ type: String })
  label = '';

  /** Description détaillée pour l'accessibilité */
  @property({ type: String })
  description = '';

  /** Classe d'icône (ex: ri-global-line) */
  @property({ type: String })
  icon = '';

  /** @deprecated alias français de `icon` (#300) */
  @property({ type: String })
  icone = '';

  /** Format d'affichage: nombre, pourcentage, euro, decimal */
  @property({ type: String })
  format: FormatType = 'nombre';

  /**
   * RACCOURCI HERITE — pour une ligne d'evolution riche (signe, suffixe,
   * couleur, repli n.d.), preferez `lines`. Conserve pour compatibilite.
   *
   * Expression d'agregation pour la tendance, evaluee sur les donnees de la
   * source (grammaire commune "champ:fn", ex. "evolution:avg") — PAS un
   * litteral : l'ancienne doc ("+3.2") laissait croire qu'on passait une
   * valeur, la chaine etait interpretee comme nom de champ (#303).
   * Rendue avec une fleche (↑/↓) en pourcentage fr-FR ("↑ 5,2 %").
   */
  @property({ type: String })
  trend = '';

  /** @deprecated alias français de `trend` (#300) */
  @property({ type: String })
  tendance = '';

  /**
   * Lignes secondaires declaratives (JSON), rendues ENTRE la valeur et le
   * `label`. Chaque item est soit data-driven (`value` = expression
   * "champ:fn"), soit texte statique (`text`), avec couleur declarative.
   * Ex. `[{"value":"evol:avg","sign":true,"suffix":"vs mai 2025","color":"auto"}]`.
   * Schema complet : packages/core/src/utils/kpi-lines.ts (KpiLineSpec).
   */
  @property({ type: String })
  lines = '';

  /** Seuil au-dessus duquel la valeur est verte */
  @property({ type: Number, attribute: 'threshold-green' })
  thresholdGreen?: number;

  /** @deprecated alias français de `threshold-green` (#300) */
  @property({ type: Number, attribute: 'seuil-vert' })
  seuilVert?: number;

  /** Seuil au-dessus duquel la valeur est orange */
  @property({ type: Number, attribute: 'threshold-orange' })
  thresholdOrange?: number;

  /** @deprecated alias français de `threshold-orange` (#300) */
  @property({ type: Number, attribute: 'seuil-orange' })
  seuilOrange?: number;

  /** Couleur forcée: vert, orange, rouge, bleu */
  @property({ type: String })
  color: KpiColor | '' = '';

  /** @deprecated alias français de `color` (#300) */
  @property({ type: String })
  couleur: KpiColor | '' = '';

  /** Largeur en colonnes DSFR (1-12). Significatif uniquement dans un <dsfr-data-kpi-group>. */
  @property({ type: Number, reflect: true })
  col?: number;

  // Utilise le Light DOM pour bénéficier des styles DSFR
  createRenderRoot() {
    return this;
  }

  /** Warn-once : attributs français dépréciés (#300, cible = anglais) */
  private _warnDeprecatedFrenchAttrs() {
    const aliases: Array<[string, string]> = [
      ['valeur', 'value'],
      ['icone', 'icon'],
      ['couleur', 'color'],
      ['seuil-vert', 'threshold-green'],
      ['seuil-orange', 'threshold-orange'],
      ['tendance', 'trend'],
    ];
    const used = aliases.filter(([fr]) => this.hasAttribute(fr)).map(([fr, en]) => `${fr}→${en}`);
    if (used.length > 0) {
      console.warn(
        `dsfr-data-kpi: attributs français dépréciés (${used.join(', ')}) — la convention cible est l'anglais, les alias seront retirés à la 1.0 (#300)`
      );
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this._warnDeprecatedFrenchAttrs();
    sendWidgetBeacon('dsfr-data-kpi');
  }

  static styles = css``;

  private _computeValue(): number | string | null {
    const expr = this.value || this.valeur;
    if (!this._sourceData || !expr) return null;
    return computeAggregation(this._sourceData, expr);
  }

  private _getColor(): KpiColor {
    const explicitColor = this.color || this.couleur;
    if (explicitColor) return explicitColor;

    const value = this._computeValue();
    if (typeof value !== 'number') return 'bleu';

    return getColorBySeuil(
      value,
      this.thresholdGreen ?? this.seuilVert,
      this.thresholdOrange ?? this.seuilOrange
    );
  }

  private _getTendanceInfo(): { value: number; direction: 'up' | 'down' | 'stable' } | null {
    const trendExpr = this.trend || this.tendance;
    if (!trendExpr || !this._sourceData) return null;

    const tendanceValue = computeAggregation(this._sourceData, trendExpr);
    if (typeof tendanceValue !== 'number') return null;

    return {
      value: tendanceValue,
      direction: tendanceValue > 0 ? 'up' : tendanceValue < 0 ? 'down' : 'stable',
    };
  }

  /** Résout l'attribut `lines` en lignes affichables (pur, sans effet de bord). */
  private _resolveLines(): ResolvedKpiLine[] {
    if (!this.lines) return [];
    const specs = parseKpiLines(this.lines);
    if (!specs) return [];
    return resolveKpiLines(specs, this._sourceData);
  }

  /** Dernier message d'erreur de config posé (anti-spam console). */
  private _configErrorKey: string | null = null;

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    this._validateConfig();
  }

  /**
   * Diagnostic de configuration (hors render pour garder render() pur) :
   * `lines` JSON invalide, ou raccourci hérité `trend` qui ne résout pas en
   * nombre. Reporté une seule fois par état (au lieu de disparaître en
   * silence — #338).
   */
  private _validateConfig() {
    let message: string | null = null;

    if (this.lines && parseKpiLines(this.lines) === null) {
      message =
        'lines : JSON invalide — attendu un tableau d’objets, ex. ' +
        '[{"value":"evol:avg","suffix":"vs N-1","color":"auto"}]';
    }

    if (!message) {
      const trendExpr = this.trend || this.tendance;
      if (trendExpr && this._sourceData != null) {
        const v = computeAggregation(this._sourceData, trendExpr);
        if (typeof v !== 'number') {
          message =
            `trend="${trendExpr}" ne résout pas en nombre — attendu une ` +
            'expression "champ:fn" (ex. "evolution:avg"), pas une valeur littérale';
        }
      }
    }

    if (message !== this._configErrorKey) {
      this._configErrorKey = message;
      if (message) reportConfigError(this, 'dsfr-data-kpi', message);
      else clearConfigError(this);
    }
  }

  private _getAriaLabel(): string {
    if (this.description) return this.description;

    const value = this._computeValue();
    const formattedValue = formatValue(value as number, this.format);
    let label = this.heading
      ? `${this.heading} — ${this.label}: ${formattedValue}`
      : `${this.label}: ${formattedValue}`;

    if (
      typeof value === 'number' &&
      ((this.thresholdGreen ?? this.seuilVert) !== undefined ||
        (this.thresholdOrange ?? this.seuilOrange) !== undefined)
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

    const lineTexts = this._resolveLines()
      .map((l) => l.text)
      .filter(Boolean);
    if (lineTexts.length > 0) label += `. ${lineTexts.join('. ')}`;

    return label;
  }

  render() {
    const value = this._computeValue();
    const formattedValue = formatValue(value as number, this.format);
    const colorClass = COLOR_CLASSES[this._getColor()] || COLOR_CLASSES.bleu;
    const tendance = this._getTendanceInfo();
    const resolvedLines = this._resolveLines();

    return html`
      <div class="dsfr-data-kpi ${colorClass}" role="figure" aria-label="${this._getAriaLabel()}">
        ${this._sourceLoading
          ? renderSourceLoading('dsfr-data-kpi')
          : this._sourceError
            ? renderSourceError('dsfr-data-kpi', this._sourceError)
            : html`
                <div class="dsfr-data-kpi__content">
                  ${this.heading
                    ? html`<span class="dsfr-data-kpi__heading">${this.heading}</span>`
                    : ''}
                  ${this.icon || this.icone
                    ? html`
                        <span
                          class="dsfr-data-kpi__icon ${this.icon || this.icone}"
                          aria-hidden="true"
                        ></span>
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
                              ? `en hausse de ${formatPercentage(Math.abs(tendance.value))}`
                              : tendance.value < 0
                                ? `en baisse de ${formatPercentage(Math.abs(tendance.value))}`
                                : 'stable'}"
                          >
                            ${tendance.direction === 'up'
                              ? '↑'
                              : tendance.direction === 'down'
                                ? '↓'
                                : '→'}
                            ${formatPercentage(Math.abs(tendance.value))}
                          </span>
                        `
                      : ''}
                  </div>
                  ${resolvedLines.map(
                    (line) => html`
                      <span
                        class="dsfr-data-kpi__line"
                        style=${line.color ? `color: ${line.color};` : ''}
                        >${line.text}</span
                      >
                    `
                  )}
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
        .dsfr-data-kpi__heading {
          font-size: 0.875rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.01em;
          color: var(--text-mention-grey);
        }
        .dsfr-data-kpi__line {
          font-size: 0.875rem;
          font-weight: 500;
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
