import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { buildCsv, formatNumberFr } from '@dsfr-data/shared/lib';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { IDLE_MESSAGE_DEFAULT } from '../utils/status-templates.js';

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
 * Les cellules numériques du tableau sont rendues en fr-FR (`2.27` → « 2,27 »,
 * au plus 2 décimales, #666) ; les chaînes (codes INSEE, SIREN…) restent
 * intactes et le CSV téléchargé reste brut. Avant #666, le contournement était
 * `normalize round="champ:2"`, qui arrondit mais ne localise pas.
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
  /** Id de la source (ou du transformateur) dont ce complément accessible consomme les données. */
  @property({ type: String })
  source = '';

  /** Id de l'élément cible (graphique, carte) pour la liaison ARIA et le lien d'évitement. */
  @property({ type: String, attribute: 'for' })
  for = '';

  /** Affiche le tableau de données équivalent au graphique. */
  @property({ type: Boolean })
  table = false;

  /** Affiche le bouton de téléchargement CSV. */
  @property({ type: Boolean })
  download = false;

  /** Nom du fichier CSV téléchargé. */
  @property({ type: String })
  filename = 'données.csv';

  /** Description textuelle du graphique, lue par les lecteurs d'écran. */
  @property({ type: String })
  description = '';

  /** Colonne utilisée pour les labels du tableau. */
  @property({ type: String, attribute: 'label-field' })
  labelField = '';

  /** Colonne(s) utilisée(s) pour les valeurs du tableau (séparées par des virgules). */
  @property({ type: String, attribute: 'value-field' })
  valueField = '';

  /**
   * Libellé substitué aux cellules VIDES (`null`, `undefined` ou `""`) de la
   * colonne de libellé du tableau, et aux noms de série vides en mode
   * `series-field` (#933). Même rôle que l'`empty-label` de
   * `dsfr-data-chart` (#647) : sans lui, la barre du groupe non renseigné
   * porte un nom sur l'axe alors que sa ligne dans le tableau équivalent a
   * une cellule vide — le tableau dit autre chose que le graphique.
   *
   * Colonne de libellé = `label-field` s'il est posé, sinon la PREMIÈRE
   * colonne rendue. Les colonnes de valeur ne sont jamais touchées : une
   * mesure absente reste une cellule vide, on n'invente pas un libellé.
   *
   * Absent (défaut), le rendu est inchangé : la cellule reste vide. La
   * valeur n'est PAS reprise du graphique visé par `for` — l'écrire sur les
   * deux balises est volontaire, pour qu'aucune page existante ne voie son
   * tableau changer.
   *
   * Le CSV téléchargé porte le même libellé que le tableau affiché.
   */
  @property({ type: String, attribute: 'empty-label' })
  emptyLabel = '';

  /**
   * Champ « clé de série » d'un jeu au format long/tidy — typiquement
   * l'`origin-field` d'un `dsfr-data-concat` (#807), ou le champ que
   * `dsfr-data-chart series-field` consomme déjà côté graphique (#930).
   *
   * Posé, le tableau équivalent PIVOTE : une ligne par valeur de
   * `label-field`, une colonne par valeur distincte de ce champ (dans leur
   * ordre d'apparition), au lieu d'une ligne par couple (libellé, série)
   * sans colonne disant de quelle série la valeur provient. Le CSV
   * téléchargé suit la même structure.
   *
   * Exige `label-field` ET `value-field` : sans eux on ne sait pas quelle
   * colonne porte la mesure. Le manque est signalé
   * (`data-dsfr-config-error`) et le tableau retombe sur le rendu à plat,
   * jamais un pivot silencieusement faux. Seul le PREMIER champ de
   * `value-field` est pivoté.
   *
   * Un couple (libellé, série) absent des données rend une cellule vide :
   * `dsfr-data-chart` y trace 0, le tableau ne l'affirme pas.
   *
   * Absent (défaut), le rendu est inchangé. La valeur n'est PAS reprise du
   * graphique visé par `for`.
   */
  @property({ type: String, attribute: 'series-field' })
  seriesField = '';

  /** Libellé personnalisé de la section accessible. */
  @property({ type: String })
  label = '';

  /** Desactive la pose automatique des attributs ARIA et du lien d'évitement. */
  @property({ type: Boolean, attribute: 'no-auto-aria' })
  noAutoAria = false;

  /**
   * Nombre de décimales des cellules numériques du tableau (#666). Absent :
   * au plus 2 décimales, format fr-FR. Le CSV n'est pas concerné.
   */
  @property({ type: Number })
  decimals: number | null = null;

  /**
   * Message annoncé quand l'amont attend un filtre (`require-where`, #690).
   * Remplace « aucune donnée disponible » dans la description lue par les
   * lecteurs d'écran : rien n'a été chargé, rien n'a échoué.
   */
  @property({ type: String, attribute: 'idle-message' })
  idleMessage = IDLE_MESSAGE_DEFAULT;

  /** Vrai quand l'erreur de configuration posée vient de `series-field`. */
  private _seriesConfigError = false;

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
    this._checkSeriesConfig();
  }

  /**
   * `series-field` sans `label-field` ni `value-field` ne peut pas pivoter :
   * on ne sait pas quelle colonne porte la mesure. Le manque est nommé plutôt
   * que silencieux (le tableau retombe sur le rendu à plat) — une grammaire
   * fausse qui ne dit rien coûte plus cher qu'une erreur en console.
   */
  private _checkSeriesConfig() {
    if (!this.seriesField || this._seriesMode) {
      if (this._seriesConfigError) {
        this._seriesConfigError = false;
        clearConfigError(this);
      }
      return;
    }
    if (this._seriesConfigError) return;
    this._seriesConfigError = true;
    reportConfigError(
      this,
      `dsfr-data-a11y[${this.id}]`,
      'series-field exige aussi label-field et value-field pour pivoter le tableau — ' +
        'tableau rendu à plat, sans colonne de série'
    );
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
    // Mode serie (#930) : le CSV porte la meme structure pivotee que le
    // tableau affiche — une ligne par libelle, une colonne par serie.
    if (this._seriesMode) {
      const { headers, rows } = this._pivotSeries(data);
      const columns = headers.map((label, i) => ({ key: `c${i}`, label }));
      const records = rows.map((cells) => Object.fromEntries(cells.map((v, i) => [`c${i}`, v])));
      return buildCsv(records, { columns });
    }

    // Memes colonnes que le tableau rendu (label-field/value-field si definis),
    // champs techniques `_*` exclus dans tous les cas.
    const columns = this._getColumns(data)
      .filter((key) => !key.startsWith('_'))
      .map((key) => ({ key }));

    // `empty-label` (#933) : le CSV nomme le groupe null comme le tableau.
    if (this.emptyLabel) {
      const labelKey = this._labelColumnKey(data);
      if (labelKey) {
        const rows = data.map((row) =>
          this._isEmptyValue(row[labelKey]) ? { ...row, [labelKey]: this.emptyLabel } : row
        );
        return buildCsv(rows, { columns });
      }
    }

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

  /**
   * Nom de la colonne de libellé : `label-field` s'il est posé, sinon la
   * PREMIÈRE colonne rendue. C'est la seule colonne où `empty-label`
   * s'applique (#933).
   */
  private _labelColumnKey(data: Record<string, unknown>[]): string {
    return this.labelField || this._getColumns(data)[0] || '';
  }

  // ---------------------------------------------------------------------------
  // Series pivot (#930)
  // ---------------------------------------------------------------------------

  /** Vrai quand le pivot du format long est demandé ET exploitable. */
  private get _seriesMode(): boolean {
    return !!(this.seriesField && this.labelField && this.valueField);
  }

  /**
   * Pivote un jeu au format long en tableau croisé : une ligne par valeur de
   * `label-field`, une colonne par valeur distincte de `series-field`, dans
   * leur ordre d'apparition — l'ordre que `dsfr-data-chart` donne déjà aux
   * séries (#930). Les valeurs de cellule restent brutes : c'est le rendu qui
   * les formate, comme pour le tableau à plat.
   */
  private _pivotSeries(data: Record<string, unknown>[]): {
    headers: string[];
    rows: unknown[][];
  } {
    const valueKey = this.valueField.split(',')[0].trim();
    const labelKeys: string[] = [];
    const labelValues: unknown[] = [];
    const seriesNames: string[] = [];
    const cells = new Map<string, Map<string, unknown>>();

    for (const record of data) {
      const labelKey = this._headerText(record[this.labelField]);
      const seriesName = this._headerText(record[this.seriesField]);
      if (!cells.has(labelKey)) {
        cells.set(labelKey, new Map());
        labelKeys.push(labelKey);
        labelValues.push(record[this.labelField]);
      }
      if (!seriesNames.includes(seriesName)) seriesNames.push(seriesName);
      cells.get(labelKey)!.set(seriesName, record[valueKey]);
    }

    return {
      headers: [this.labelField, ...seriesNames],
      rows: labelKeys.map((key, i) => [
        labelValues[i],
        ...seriesNames.map((s) => cells.get(key)!.get(s)),
      ]),
    };
  }

  /**
   * Modèle du tableau rendu : en-têtes, lignes de valeurs brutes, et rang de
   * la colonne de libellé (toujours la première). Un seul point de vérité
   * pour le tableau affiché et pour la description lue.
   */
  private _tableModel(data: Record<string, unknown>[]): {
    headers: string[];
    rows: unknown[][];
    seriesCount: number;
  } {
    if (this._seriesMode) {
      const { headers, rows } = this._pivotSeries(data);
      return { headers, rows, seriesCount: headers.length - 1 };
    }
    const headers = this._getColumns(data);
    return {
      headers,
      rows: data.map((row) => headers.map((col) => row[col])),
      seriesCount: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Cell formatting (#666)
  // ---------------------------------------------------------------------------

  /** Valeur « vide » au sens d'`empty-label` : mêmes cas que dsfr-data-chart. */
  private _isEmptyValue(value: unknown): boolean {
    return value === null || value === undefined || value === '';
  }

  /**
   * Texte d'un en-tête ou d'une clé de regroupement : `empty-label` quand la
   * valeur est vide, sinon la valeur telle quelle.
   */
  private _headerText(value: unknown): string {
    return this._isEmptyValue(value) ? this.emptyLabel : String(value);
  }

  /**
   * Texte d'une cellule du corps du tableau. La colonne de libellé porte
   * `empty-label` quand la valeur est vide (#933) ; les colonnes de valeur
   * restent au rendu historique — une mesure absente reste une cellule vide.
   */
  private _bodyCellText(value: unknown, isLabelColumn: boolean): string {
    if (isLabelColumn && this.emptyLabel && this._isEmptyValue(value)) {
      return this.emptyLabel;
    }
    return this.formatCellValue(value);
  }

  /**
   * Texte d'une cellule du tableau : nombres en fr-FR (au plus 2 décimales,
   * ou `decimals`), tout le reste tel quel. Le CSV (`_buildCsv`) reste brut.
   */
  formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
      return formatNumberFr(
        value,
        this.decimals === null ? undefined : { decimals: this.decimals }
      );
    }
    return String(value);
  }

  // ---------------------------------------------------------------------------
  // Auto-generated description for aria-describedby
  // ---------------------------------------------------------------------------

  private _getAutoDescription(
    hasData: boolean,
    data: unknown,
    model?: { rows: unknown[][]; seriesCount: number }
  ): string {
    // En attente d'un filtre (#690) : dire ce qui manque, pas « aucune donnée »
    if (this._sourceIdle) return `${this.idleMessage || IDLE_MESSAGE_DEFAULT}.`;
    if (!hasData) return 'Aucune donnee disponible.';
    // En mode série (#930) le tableau est pivoté : annoncer SES lignes, pas
    // celles du format long, qui en compte autant que de couples.
    const pivoted = model && model.seriesCount > 0;
    const count = pivoted ? model!.rows.length : (data as unknown[]).length;
    // Detect if target is a map component
    const target = this.for ? document.getElementById(this.for) : null;
    const isMap = target?.tagName?.toLowerCase() === 'dsfr-data-map';
    const label = isMap ? 'Données de la carte' : 'Données du graphique';
    const parts: string[] = [
      pivoted
        ? `${label} : ${count} lignes, ${model!.seriesCount} séries.`
        : `${label} : ${count} lignes.`,
    ];
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
    const model = hasData
      ? this._tableModel(typedData)
      : { headers: [] as string[], rows: [] as unknown[][], seriesCount: 0 };
    const columns = model.headers;
    const tableRows = model.rows.slice(0, MAX_TABLE_ROWS);
    const isTruncated = model.rows.length > MAX_TABLE_ROWS;

    return html`
      <section
        class="dsfr-data-a11y"
        id="${this.id}-section"
        role="complementary"
        aria-label="${sectionLabel}"
      >
        <!-- Concise description for aria-describedby (sr-only) -->
        <p id="${descId}" class="dsfr-data-a11y__sr-only">
          ${this._getAutoDescription(hasData, data, model)}
        </p>

        <details class="fr-accordion">
          <summary class="fr-accordion__btn">${sectionLabel}</summary>
          <div class="fr-accordion__content">
            ${
              this._showDescription
                ? html`
                    <div class="fr-mb-2w">
                      <p class="fr-text--sm">${this.description}</p>
                    </div>
                  `
                : nothing
            }
            ${
              this._showTable && hasData
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
                                ${row.map((cell, i) =>
                                  // Tableau croise (#930) : la premiere cellule
                                  // est l'en-tete de SA ligne — sans quoi une
                                  // valeur au croisement n'a plus qu'une moitie
                                  // de coordonnees pour un lecteur d'ecran. Le
                                  // tableau a plat garde ses <td> historiques.
                                  model.seriesCount > 0 && i === 0
                                    ? html`<th scope="row">${this._bodyCellText(cell, true)}</th>`
                                    : html`<td>${this._bodyCellText(cell, i === 0)}</td>`
                                )}
                              </tr>
                            `
                          )}
                        </tbody>
                      </table>
                      ${
                        isTruncated
                          ? html`
                              <p class="fr-text--xs fr-mt-1w">
                                Affichage limite aux ${MAX_TABLE_ROWS} premieres lignes.
                                ${
                                  this._showDownload
                                    ? 'Telechargez le CSV pour les données completes.'
                                    : ''
                                }
                              </p>
                            `
                          : nothing
                      }
                    </div>
                  `
                : nothing
            }
            ${
              this._showDownload
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
                : nothing
            }
          </div>
        </details>
      </section>

      <style>
        .dsfr-data-a11y {
          margin-top: 0.5rem;
        }
        /*
          La classe DSFR fr-accordion__btn est ecrite pour un bouton, dont le
          box-sizing par defaut est border-box ; un summary est content-box. Il
          recevait donc width:100% ET 16 px de padding de chaque cote : 390 px
          dans un conteneur de 358 px, et toute page portant un dsfr-data-a11y
          defilait horizontalement de 16 px sur telephone (#898). Regle bornee a
          notre propre accordeon : sur summary tout court, elle re-ecrirait ceux
          de la page hote.
        */
        .dsfr-data-a11y summary.fr-accordion__btn {
          box-sizing: border-box;
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
