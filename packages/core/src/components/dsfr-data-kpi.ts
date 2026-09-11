import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import {
  formatValue,
  formatPercentage,
  isFormatType,
  FORMAT_TYPES,
  FormatType,
  getColorBySeuil,
} from '../utils/formatters.js';
import {
  computeAggregation,
  parseExpression,
  countsReceivedRows,
  isRateExpression,
  type AggregationContext,
} from '../utils/aggregations.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  renderSourceLoading,
  renderSourceError,
  renderConfigError,
  renderSourceIdle,
  IDLE_MESSAGE_DEFAULT,
} from '../utils/status-templates.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { parseKpiLines, resolveKpiLines, type ResolvedKpiLine } from '../utils/kpi-lines.js';
import { getDataMeta } from '../utils/data-bridge.js';
import { getByPath } from '../utils/json-path.js';
import { applyLocalFilter, validateColonFilter } from '@dsfr-data/shared/lib';

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
  /** Id de la source (ou du transformateur) dont ce KPI consomme les données. Facultatif si `value` est un littéral (`value="=667"`). */
  @property({ type: String })
  source = '';

  /**
   * Expression de valeur — convention cible anglaise (#300).
   * Grammaire commune "champ:fn" (#303), ex. value="population:sum".
   * `champ:distinct` (alias `count-distinct`, #672) : nombre de valeurs
   * distinctes, null et chaîne vide exclus, calculé sur les lignes reçues.
   * `meta:total` (#659) : total publié par l'amont (total serveur en
   * server-side, lignes avant `limit` derrière un query) — `count` ne
   * compte que les lignes reçues.
   * Ratio (#673) : `value="count:statut:ouvert / count"`, chaque côté dans
   * la grammaire ci-dessus (`meta:total` compris). Résultat = fraction
   * (0,35) ; `format="pourcentage"` la rend en pourcentage (35 %) — les
   * seuils s'expriment alors en pourcentage aussi. Division par zéro : « — ».
   * `count:champ:valeur` accepte un champ tableau (un élément égal suffit).
   * Seul `count` accepte une valeur de filtre : `sum:champ:valeur` est une
   * erreur de configuration (#764).
   * Filtre propre à une expression (#776), dialecte du `where` entre
   * accolades : `value="effectif:sum{sexe:eq:F} / effectif:sum"` rend une
   * part de SOMMES — le filtre ne vaut que pour son côté du ratio, là où
   * `where` filtre les deux. Marche aussi pour `count{…}` et les autres
   * fonctions ; un filtre non reconnu est une erreur de configuration.
   * `champ:first` / `champ:last` : valeur du champ sur la première / la
   * dernière ligne, DANS L'ORDRE COURANT — poser un `order-by` en amont
   * (ex. dernière valeur d'une série datée). Propres au KPI : absentes de
   * l'`aggregate` de `dsfr-data-query`.
   * `champ:evolution` (#675) : (dernière − première) / première sur les
   * lignes DANS LEUR ORDRE COURANT — poser un `order-by` chronologique en
   * amont. Fraction, rendue en pourcentage par `format="pourcentage"`,
   * `trend` et `lines` ; « — » si moins de deux valeurs ou première = 0.
   */
  @property({ type: String })
  value = '';

  /** @deprecated alias français de `value` (#300) */
  @property({ type: String })
  valeur = '';

  /**
   * Filtre des lignes AVANT le calcul (#674), dialecte colon de
   * dsfr-data-query : `where="categorie:eq:Actif, montant:gte:1000"` —
   * mêmes 12 opérateurs (eq, neq, gt, gte, lt, lte, contains, notcontains,
   * in, notin, isnull, isnotnull), même égalité lâche, chemins imbriqués
   * acceptés. Appliqué à `value`, `trend` et `lines`.
   * CÔTÉ CLIENT SEULEMENT : le KPI ne délègue rien au serveur, le filtre
   * porte sur les lignes reçues (derrière un `limit` ou une page, poser le
   * `where` sur la source ou une query amont). `meta:total` n'en tient pas
   * compte. Une clause non reconnue est une erreur de configuration.
   */
  @property({ type: String })
  where = '';

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

  /**
   * Format d'affichage : nombre (défaut), pourcentage, euro, decimal, compact
   * (14 785 684 → « 14,8 M »), date (chaîne ISO → « 09/09/2026 », #667).
   * Les décimales passent par `decimals`, jamais par le format (`euro:3` est
   * refusé et affiché comme erreur de configuration, #665).
   */
  @property({ type: String })
  format: FormatType = 'nombre';

  /**
   * Nombre de décimales affichées (entier 0 à 20), ex. `format="euro" decimals="3"`
   * → « 1,749 € ». Fixe pour nombre, pourcentage, euro et decimal ; plafond pour
   * compact ; sans effet sur date. Absent : défaut historique du format (#665).
   */
  @property({ type: Number })
  decimals?: number;

  /**
   * Unité accolée après la valeur (espace insécable), ex. `format="compact" unit="€"`
   * → « 44,9 Md € ». Surtout utile avec nombre, decimal et compact — euro et
   * pourcentage portent déjà leur symbole (#665).
   */
  @property({ type: String })
  unit = '';

  /**
   * RACCOURCI HERITE — pour une ligne d'evolution riche (signe, suffixe,
   * couleur, repli n.d.), preferez `lines`. Conserve pour compatibilite.
   *
   * Expression d'agrégation pour la tendance, évaluée sur les données de la
   * source (grammaire commune "champ:fn", ex. "evolution:avg") — PAS un
   * litteral : l'ancienne doc ("+3.2") laissait croire qu'on passait une
   * valeur, la chaîne etait interpretee comme nom de champ (#303).
   * Rendue avec une fleche (↑/↓) en pourcentage fr-FR ("↑ 5,2 %").
   * `trend="recettes:evolution"` (#675) : taux d'évolution entre la première
   * et la dernière ligne, rendu en pourcentage.
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

  /** Couleur forcée (token sémantique DSFR) : vert, orange, rouge, bleu */
  @property({ type: String, attribute: 'color-token' })
  colorToken: KpiColor | '' = '';

  /** @deprecated alias de `color-token` (#367) — le nom `color` évoque l'attribut
   * de présentation HTML déprécié (faux positif d'audit RGAA 10.1.2) */
  @property({ type: String })
  color: KpiColor | '' = '';

  /** @deprecated alias français de `color-token` (#300) */
  @property({ type: String })
  couleur: KpiColor | '' = '';

  /** Largeur en colonnes DSFR (1-12). Significatif uniquement dans un <dsfr-data-kpi-group>. */
  @property({ type: Number, reflect: true })
  col?: number;

  /**
   * Message rendu quand l'amont attend un filtre (`require-where`, #690).
   * Distinct de « aucune donnée » : aucune requête n'a été faite. Vide,
   * le libellé par défaut est utilisé.
   */
  @property({ type: String, attribute: 'idle-message' })
  idleMessage = IDLE_MESSAGE_DEFAULT;

  // Utilise le Light DOM pour bénéficier des styles DSFR
  createRenderRoot() {
    return this;
  }

  /** Warn-once : attributs français dépréciés (#300, cible = anglais) */
  private _warnDeprecatedFrenchAttrs() {
    const aliases: Array<[string, string]> = [
      ['valeur', 'value'],
      ['icone', 'icon'],
      ['couleur', 'color-token'],
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

  /** Warn-once : `color` déprécié au profit de `color-token` (#367) */
  private _warnDeprecatedColorAttr() {
    if (this.hasAttribute('color')) {
      console.warn(
        `dsfr-data-kpi: attribut "color" déprécié — utilisez "color-token" (token sémantique DSFR). L'alias sera retiré à la prochaine version majeure (#367)`
      );
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this._warnDeprecatedFrenchAttrs();
    this._warnDeprecatedColorAttr();
    sendWidgetBeacon('dsfr-data-kpi');
  }

  static styles = css``;

  /**
   * Lignes de la source après le `where` client (#674). Sans `where` (ou
   * avec un `where` invalide, déjà signalé), les données brutes — y compris
   * une source mono-objet, que computeAggregation sait lire.
   */
  private _filteredData(): unknown {
    const data = this._sourceData;
    if (!this.where || data == null || validateColonFilter(this.where) !== null) return data;
    const rows: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : typeof data === 'object'
        ? [data as Record<string, unknown>]
        : [];
    return applyLocalFilter(rows, this.where, getByPath);
  }

  private _computeValue(): number | string | null {
    const expr = this.value || this.valeur;
    if (!expr) return null;
    // Valeur litterale : value="=667" ou value="=87 %" — affichee telle
    // quelle (nombre si numerique), sans dependre d'une source de donnees.
    // Pour les chiffres valides a la main ou non calculables depuis le flux.
    if (expr.startsWith('=')) {
      const literal = expr.slice(1).trim();
      const num = Number(literal.replace(',', '.'));
      return literal !== '' && !Number.isNaN(num) ? num : literal;
    }
    if (!this._sourceData) return null;
    const rows = Array.isArray(this._sourceData) ? this._sourceData.length : 1;
    const parsed = parseExpression(expr);
    // Le warn compare le total amont aux lignes RECUES (avant `where`) :
    // un filtre qui garde 3 lignes sur 12 n'est pas une troncature.
    if (countsReceivedRows(parsed)) {
      this._warnPartialCount(rows, parsed.type === 'distinct' ? 'distinct' : 'count');
    }
    // `meta:total` (#659) est résolu par le contexte : total de l'amont,
    // que le `where` client (#674) ne filtre pas.
    const raw = computeAggregation(this._filteredData(), expr, this._aggregationContext());
    return this._scaleRate(raw, expr, this.format);
  }

  /** Contexte d'évaluation : total publié par l'amont (`meta:total`, #659). */
  private _aggregationContext(): AggregationContext {
    return { metaTotal: getDataMeta(this.source)?.total };
  }

  /**
   * Un ratio (#673) est une fraction ; en `format="pourcentage"` on la rend
   * en pourcentage (0,35 -> 35). La valeur retournée par `_computeValue` est
   * celle qui s'affiche : seuils et aria-label parlent de la même unité.
   */
  private _scaleRate(
    value: number | string | null,
    expr: string,
    format: string
  ): number | string | null {
    if (typeof value === 'number' && format === 'pourcentage' && isRateExpression(expr)) {
      return value * 100;
    }
    return value;
  }

  /**
   * Texte affiché pour la valeur calculée : `format` + `decimals` + `unit`
   * (#665). Une chaîne (littéral `value="=87 %"`, champ texte) est rendue
   * telle quelle — sauf `format="date"`, qui la lit comme date ISO (#667).
   */
  private _formatDisplay(value: number | string | null): string {
    if (typeof value === 'string' && this.format !== 'date') return value;
    return formatValue(value, this.format, { decimals: this.decimals, unit: this.unit });
  }

  /** Warn-once : `count` sur des lignes tronquees (#659). */
  private _partialCountWarned = false;

  /**
   * `count` compte les lignes RECUES : derriere un `limit`, une page de
   * pagination serveur ou un plafond `max-records`, ce n'est pas le total.
   * Trois annuaires ont affiche « 12 activites » pour 28 pendant sept lots.
   */
  private _warnPartialCount(rows: number, fn: 'count' | 'distinct' = 'count'): void {
    if (this._partialCountWarned) return;
    const total = getDataMeta(this.source)?.total;
    if (typeof total !== 'number' || total <= rows) return;
    this._partialCountWarned = true;
    console.warn(
      `dsfr-data-kpi: value="${fn}" sur "${this.source}" compte ${rows} lignes reçues, ` +
        `mais l'amont en détient ${total} (meta.total) — chiffre partiel (limit, page ou max-records). ` +
        `Pour le total : value="meta:total" (#659)`
    );
  }

  private _getColor(): KpiColor {
    const explicitColor = this.colorToken || this.color || this.couleur;
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

    // La tendance est TOUJOURS rendue en pourcentage : un ratio y est mis à
    // l'échelle (#673), une colonne d'évolution est déjà en points de %.
    const tendanceValue = this._scaleRate(
      computeAggregation(this._filteredData(), trendExpr, this._aggregationContext()),
      trendExpr,
      'pourcentage'
    );
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
    return resolveKpiLines(specs, this._filteredData(), this._aggregationContext());
  }

  /** Dernier message d'erreur de config posé (anti-spam console). */
  private _configErrorKey: string | null = null;

  /**
   * Erreur de configuration BLOQUANTE (#649) : fonction d'agrégat inconnue
   * dans `value` — rendue dans la page à la place d'un KPI vide.
   */
  private _blockingConfigError: string | null = null;

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);
    // Avant le rendu (et non dans updated()) : render() lit
    // _blockingConfigError sans déclencher un second cycle de mise à jour.
    this._validateConfig();
  }

  /**
   * Diagnostic de configuration (hors render pour garder render() pur) :
   * fonction d'agrégat inconnue dans `value`/`trend` (#649), `lines` JSON
   * invalide, ou raccourci hérité `trend` qui ne résout pas en nombre.
   * Reporté une seule fois par état (au lieu de disparaître en silence — #338).
   */
  private _validateConfig() {
    let message: string | null = null;
    this._blockingConfigError = null;

    const valueExpr = this.value || this.valeur;
    if (valueExpr && !valueExpr.startsWith('=')) {
      const parsed = parseExpression(valueExpr);
      if (parsed.type === 'invalid') {
        message = `value="${valueExpr}" : ${parsed.error}`;
        this._blockingConfigError = message;
      }
    }

    // `where` non parsable (#674) : bloquant — un filtre ignoré en silence
    // afficherait un chiffre faux avec l'aplomb d'un chiffre juste.
    if (!message && this.where) {
      const whereError = validateColonFilter(this.where);
      if (whereError) {
        message = `where="${this.where}" : ${whereError}`;
        this._blockingConfigError = message;
      }
    }

    // Format inconnu (#665) : bloquant, comme une fonction d'agrégat inconnue —
    // `euro:3` rendait « 1 749 » en silence, la grammaire colon reste à `value`.
    if (!message && this.format && !isFormatType(this.format)) {
      const received = String(this.format);
      const hint = received.includes(':')
        ? ` — les décimales passent par decimals="N" (ex. format="${received.split(':')[0]}" decimals="${received.split(':')[1]}")`
        : '';
      message =
        `format="${received}" inconnu${hint} ; ` + `formats acceptés : ${FORMAT_TYPES.join(', ')}`;
      this._blockingConfigError = message;
    }

    if (!message && this.lines && parseKpiLines(this.lines) === null) {
      message =
        'lines : JSON invalide — attendu un tableau d’objets, ex. ' +
        '[{"value":"evol:avg","suffix":"vs N-1","color":"auto"}]';
    }

    if (!message) {
      const trendExpr = this.trend || this.tendance;
      if (trendExpr && parseExpression(trendExpr).type === 'invalid') {
        message = `trend="${trendExpr}" : ${parseExpression(trendExpr).error}`;
      } else if (trendExpr && this._sourceData != null) {
        const v = computeAggregation(this._filteredData(), trendExpr, this._aggregationContext());
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
    const formattedValue = this._formatDisplay(value);
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
    const formattedValue = this._formatDisplay(value);
    const colorClass = COLOR_CLASSES[this._getColor()] || COLOR_CLASSES.bleu;
    const tendance = this._getTendanceInfo();
    const resolvedLines = this._resolveLines();

    return html`
      <div class="dsfr-data-kpi ${colorClass}" role="figure" aria-label="${this._getAriaLabel()}">
        ${
          this._blockingConfigError
            ? renderConfigError('dsfr-data-kpi', this._blockingConfigError)
            : this._sourceLoading
              ? renderSourceLoading('dsfr-data-kpi')
              : this._sourceError
                ? renderSourceError('dsfr-data-kpi', this._sourceError)
                : this._sourceIdle
                  ? renderSourceIdle('dsfr-data-kpi', this.idleMessage)
                  : html`
                      <div class="dsfr-data-kpi__content">
                        ${
                          this.heading
                            ? html`<span class="dsfr-data-kpi__heading">${this.heading}</span>`
                            : ''
                        }
                        ${
                          this.icon || this.icone
                            ? html`
                                <span
                                  class="dsfr-data-kpi__icon ${this.icon || this.icone}"
                                  aria-hidden="true"
                                ></span>
                              `
                            : ''
                        }
                        <div class="dsfr-data-kpi__value-wrapper">
                          <span class="dsfr-data-kpi__value">${formattedValue}</span>
                          ${
                            tendance
                              ? html`
                                  <span
                                    class="dsfr-data-kpi__tendance dsfr-data-kpi__tendance--${tendance.direction}"
                                    role="img"
                                    aria-label="${
                                      tendance.value > 0
                                        ? `en hausse de ${formatPercentage(Math.abs(tendance.value))}`
                                        : tendance.value < 0
                                          ? `en baisse de ${formatPercentage(Math.abs(tendance.value))}`
                                          : 'stable'
                                    }"
                                  >
                                    ${
                                      tendance.direction === 'up'
                                        ? '↑'
                                        : tendance.direction === 'down'
                                          ? '↓'
                                          : '→'
                                    }
                                    ${formatPercentage(Math.abs(tendance.value))}
                                  </span>
                                `
                              : ''
                          }
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
                    `
        }
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
