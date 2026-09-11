import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { TransformerMixin } from '../utils/transformer-mixin.js';
import { getDataMeta, type PaginationMeta } from '../utils/data-bridge.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';

type Row = Record<string, unknown>;

/** Découpe une liste séparée par des virgules en éléments non vides. */
function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * <dsfr-data-concat> — Empile les lignes de plusieurs sources de même schéma
 *
 * L'opération inverse de `dsfr-data-join`, qui juxtapose des colonnes : ici
 * les lignes des sources se suivent, dans l'ordre de `sources`. Empiler quatre
 * séries de même schéma demandait sinon quatre pivots, trois jointures et un
 * dépliage (#777). Avec `origin-field`, chaque ligne garde la trace de sa
 * source : c'est le format long que `series-field` consomme directement.
 *
 * Attend que TOUTES les sources aient émis. Un schéma divergent est une
 * erreur de configuration nommée, jamais une troncature ni une colonne vide
 * muette. Ne relaie aucune commande aval (page, where, tri) : on ne saurait à
 * quelle source l'adresser. Un filtre ou un regroupement posé derrière un
 * empilement s'exécute côté client ; pour filtrer côté serveur, filtrer
 * chaque source.
 *
 * Ne fait aucun fetch HTTP — c'est un pur transformateur de données.
 *
 * @example
 * <dsfr-data-source id="v2023" … where="annee = 2023"></dsfr-data-source>
 * <dsfr-data-source id="v2024" … where="annee = 2024"></dsfr-data-source>
 * <dsfr-data-concat id="ventes" sources="v2023, v2024"
 *   origin-field="millesime" origin-labels="v2023:2023 | v2024:2024">
 * </dsfr-data-concat>
 * <dsfr-data-chart source="ventes" type="line"
 *   label-field="mois" value-field="montant" series-field="millesime">
 * </dsfr-data-chart>
 */
@customElement('dsfr-data-concat')
export class DsfrDataConcat extends TransformerMixin(LitElement) {
  /**
   * Ids des sources (ou transformateurs) à empiler, séparés par des
   * virgules, dans l'ordre d'empilement. Au moins deux.
   */
  @property({ type: String })
  sources = '';

  /**
   * Colonne ajoutée à chaque ligne, qui dit de quelle source elle vient
   * (facultatif). Sa valeur est l'id de la source, ou le libellé que lui
   * donne `origin-labels`. Un nom de colonne déjà présent dans les données
   * est une erreur de configuration : on écraserait une donnée.
   */
  @property({ type: String, attribute: 'origin-field' })
  originField = '';

  /**
   * Valeur écrite dans `origin-field` pour chaque source :
   * `"id:libellé | id2:libellé2"`. Une source non citée garde son id. Un
   * `:` ou un `|` littéral dans un libellé s'échappe en `%3A` / `%7C`.
   */
  @property({ type: String, attribute: 'origin-labels' })
  originLabels = '';

  /** Lignes reçues par source (index = position dans `sources`), null tant qu'absentes. */
  private _received: Array<Row[] | null> = [];

  private _data: Row[] = [];

  /** Erreur de schéma de la dernière tentative, pour ne la signaler qu'une fois. */
  private _schemaError: string | null = null;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  render() {
    return html``;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-concat');
  }

  getData(): Row[] {
    return this._data;
  }

  // --- Hooks TransformerMixin (#280) ---

  protected transformerName(): string {
    return 'dsfr-data-concat';
  }

  protected transformerSources(): string[] {
    return parseList(this.sources);
  }

  /** Aucun relais : une commande aval n'a pas de source naturelle ici. */
  protected transformerCommandTarget(): string | null {
    return null;
  }

  protected validateTransformerConfig(): string | null {
    if (!this.id) return 'attribut "id" requis pour identifier la sortie';
    const sources = this.transformerSources();
    if (sources.length < 2) {
      return 'attribut "sources" : au moins deux sources à empiler, séparées par des virgules';
    }
    const seen = new Set<string>();
    for (const id of sources) {
      if (seen.has(id)) return `attribut "sources" : la source "${id}" est citée deux fois`;
      seen.add(id);
    }
    return null;
  }

  protected beforeTransformerSubscribe(): void {
    this._received = this.transformerSources().map(() => null);
    this._schemaError = null;
    this.emitTransformerLoading();
  }

  protected onTransformerData(data: unknown, _sourceId: string, sourceIndex: number): void {
    this._received[sourceIndex] = Array.isArray(data)
      ? (data as Row[])
      : data && typeof data === 'object'
        ? [data as Row]
        : [];
    this._tryConcat();
  }

  protected transformerReinitProps(): string[] {
    return ['sources'];
  }

  protected transformerReprocessProps(): string[] {
    return ['originField', 'originLabels'];
  }

  protected onTransformerReprocess(): void {
    this._tryConcat();
  }

  /**
   * Meta aval : `total` invalidé (le nombre de lignes change) et `truncated`
   * levé si UNE des sources l'est — un total faux sur une seule série doit se
   * voir au volet Diagnostic.
   */
  protected transformMeta(meta: PaginationMeta): PaginationMeta {
    const { truncated: _primaryTruncated, ...rest } = meta;
    return { ...rest, total: undefined, ...(this._anyTruncated() ? { truncated: true } : {}) };
  }

  protected transformerOwnMeta(): PaginationMeta | null {
    if (!this._anyTruncated()) return null;
    return { page: 1, pageSize: 0, serverSide: false, truncated: true };
  }

  private _anyTruncated(): boolean {
    return this.transformerSources().some((id) => getDataMeta(id)?.truncated === true);
  }

  // --- Empilement ---

  /** Libellés d'origine par id de source (`origin-labels`). */
  private _parseOriginLabels(): Map<string, string> {
    const map = new Map<string, string>();
    for (const pair of this.originLabels.split('|')) {
      const colon = pair.indexOf(':');
      if (colon === -1) continue;
      const id = pair.slice(0, colon).trim();
      const label = pair
        .slice(colon + 1)
        .trim()
        .replace(/%3A/gi, ':')
        .replace(/%7C/gi, '|');
      if (id) map.set(id, label);
    }
    return map;
  }

  /** Schéma d'une source : union des clés de ses lignes. */
  private _schemaOf(rows: Row[]): Set<string> {
    const keys = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row)) keys.add(key);
    return keys;
  }

  /**
   * Compare les schémas à celui de la première source non vide. Rend le
   * message d'erreur nommant, par source, les colonnes en trop et en moins,
   * ou null. Une source vide n'impose rien.
   */
  private _checkSchemas(ids: string[], received: Row[][]): string | null {
    const refIndex = received.findIndex((rows) => rows.length > 0);
    if (refIndex === -1) return null;
    const reference = this._schemaOf(received[refIndex]);
    const problems: string[] = [];
    received.forEach((rows, i) => {
      if (i === refIndex || rows.length === 0) return;
      const schema = this._schemaOf(rows);
      const missing = [...reference].filter((k) => !schema.has(k));
      const extra = [...schema].filter((k) => !reference.has(k));
      if (missing.length === 0 && extra.length === 0) return;
      const parts = [
        missing.length ? `sans ${missing.map((k) => `"${k}"`).join(', ')}` : '',
        extra.length ? `avec en plus ${extra.map((k) => `"${k}"`).join(', ')}` : '',
      ].filter(Boolean);
      problems.push(`"${ids[i]}" ${parts.join(' et ')}`);
    });
    if (problems.length === 0) return null;
    return (
      `schémas divergents, rien n'est empilé — par rapport à "${ids[refIndex]}" : ` +
      `${problems.join(' ; ')}. Aligner les colonnes en amont (dsfr-data-normalize rename, ` +
      `select de la source) : empiler des lignes de schémas différents laisserait des ` +
      `colonnes vides sans le dire.`
    );
  }

  private _tryConcat(): void {
    if (this._received.length === 0 || this._received.some((rows) => rows === null)) return;
    const ids = this.transformerSources();
    const received = this._received as Row[][];

    let error = this._checkSchemas(ids, received);
    const originField = this.originField.trim();
    if (!error && originField) {
      const clash = received.some((rows) => rows.some((row) => originField in row));
      if (clash) {
        error =
          `origin-field="${originField}" porte le nom d'une colonne des données — ` +
          `choisir un autre nom, sinon cette colonne serait écrasée`;
      }
    }

    if (error) {
      if (error !== this._schemaError) {
        this._schemaError = error;
        reportConfigError(this, `dsfr-data-concat[${this.id}]`, error);
      }
      this._data = [];
      this.emitTransformerError(new Error(`dsfr-data-concat[${this.id}] : ${error}`));
      return;
    }
    if (this._schemaError) {
      this._schemaError = null;
      clearConfigError(this);
    }

    const labels = originField ? this._parseOriginLabels() : null;
    const rows: Row[] = [];
    received.forEach((sourceRows, i) => {
      if (!originField) {
        rows.push(...sourceRows);
        return;
      }
      const origin = labels?.get(ids[i]) ?? ids[i];
      for (const row of sourceRows) rows.push({ ...row, [originField]: origin });
    });
    this._data = rows;
    this.emitTransformedData(rows);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-concat': DsfrDataConcat;
  }
}
