import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { toNumber, looksLikeNumber } from '@dsfr-data/shared';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  clearDataCache,
  clearDataMeta,
  subscribeToSource,
  getDataCache,
  getDataMeta,
  setDataMeta,
  subscribeToSourceCommands,
  dispatchSourceCommand
} from '../utils/data-bridge.js';

/**
 * <dsfr-data-normalize> - Composant de normalisation de donnees
 *
 * S'insere entre une source (dsfr-data-source) et un consommateur (dsfr-data-query, dsfr-data-chart, etc.)
 * pour nettoyer et normaliser les donnees avant traitement.
 *
 * Position recommandee : AVANT dsfr-data-query pour que les filtres/agregations
 * travaillent sur des donnees propres.
 *
 * @example
 * <dsfr-data-source id="raw" url="https://api.example.com/data" transform="results"></dsfr-data-source>
 * <dsfr-data-normalize
 *   id="clean"
 *   source="raw"
 *   numeric="population, budget"
 *   rename="pop_tot:Population totale | lib_dep:Departement"
 *   trim
 *   replace="N/A: | n.d.:"
 * ></dsfr-data-normalize>
 * <dsfr-data-query id="stats" source="clean" group-by="Departement" aggregate="population:sum"></dsfr-data-query>
 * <dsfr-data-chart source="stats" type="bar" label-field="Departement" value-field="population__sum"></dsfr-data-chart>
 */
@customElement('dsfr-data-normalize')
export class DsfrDataNormalize extends LitElement {
  /** ID de la source de donnees a ecouter */
  @property({ type: String })
  source = '';

  /** Champs a convertir en nombre (virgule-separes). Ex: "population, surface" */
  @property({ type: String })
  numeric = '';

  /** Detection automatique des champs numeriques via looksLikeNumber() */
  @property({ type: Boolean, attribute: 'numeric-auto' })
  numericAuto = false;

  /** Renommage de cles. Format: "ancien:nouveau | ancien2:nouveau2" */
  @property({ type: String })
  rename = '';

  /** Supprime les espaces en debut/fin de toutes les cles et valeurs string */
  @property({ type: Boolean })
  trim = false;

  /** Supprime les balises HTML des valeurs string */
  @property({ type: Boolean, attribute: 'strip-html' })
  stripHtml = false;

  /** Remplacement de valeurs. Format: "pattern:remplacement | pattern2:remplacement2" */
  @property({ type: String })
  replace = '';

  /** Remplacement cible par champ. Format: "CHAMP:pattern:remplacement | CHAMP2:p:r" */
  @property({ type: String, attribute: 'replace-fields' })
  replaceFields = '';

  /** Cle du sous-objet a aplatir au premier niveau. Supporte la dot notation (ex: "data.attributes"). */
  @property({ type: String })
  flatten = '';

  /** Arrondit les champs numeriques a l'entier (ou a N decimales). Format: "champ1, champ2" ou "champ1:2, champ2:0" */
  @property({ type: String })
  round = '';

  /** Met toutes les cles en minuscules */
  @property({ type: Boolean, attribute: 'lowercase-keys' })
  lowercaseKeys = false;

  private _unsubscribe: (() => void) | null = null;
  private _unsubscribePageRequests: (() => void) | null = null;

  // --- Public API (delegation to upstream source) ---

  /**
   * Retourne l'adapter de la source amont (delegation transparente).
   * Permet aux composants en aval (dsfr-data-facets, dsfr-data-search)
   * d'acceder a l'adapter sans connaitre la structure du pipeline.
   */
  public getAdapter(): any {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getAdapter' in sourceEl) {
        return (sourceEl as any).getAdapter();
      }
    }
    return null;
  }

  /**
   * Retourne le where effectif de la source amont (delegation transparente).
   */
  public getEffectiveWhere(excludeKey?: string): string {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getEffectiveWhere' in sourceEl) {
        return (sourceEl as any).getEffectiveWhere(excludeKey);
      }
    }
    return '';
  }

  createRenderRoot() {
    return this;
  }

  render() {
    return html``;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-normalize');
    this._initialize();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._unsubscribePageRequests) {
      this._unsubscribePageRequests();
      this._unsubscribePageRequests = null;
    }
    if (this.id) {
      clearDataCache(this.id);
      clearDataMeta(this.id);
    }
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);

    // Re-initialiser si source change
    if (changedProperties.has('source')) {
      this._initialize();
      return;
    }

    // Re-traiter si les regles de normalisation changent
    const normalizationAttrs = ['flatten', 'numeric', 'numericAuto', 'round', 'rename', 'trim', 'stripHtml', 'replace', 'replaceFields', 'lowercaseKeys'];
    const hasNormalizationChange = normalizationAttrs.some(attr => changedProperties.has(attr));
    if (hasNormalizationChange) {
      const cachedData = this.source ? getDataCache(this.source) : undefined;
      if (cachedData !== undefined) {
        this._processData(cachedData);
      }
    }
  }

  private _initialize() {
    if (!this.id) {
      console.warn('dsfr-data-normalize: attribut "id" requis pour identifier la sortie');
      return;
    }

    if (!this.source) {
      console.warn('dsfr-data-normalize: attribut "source" requis');
      return;
    }

    // Se desabonner de l'ancienne source
    if (this._unsubscribe) {
      this._unsubscribe();
    }
    if (this._unsubscribePageRequests) {
      this._unsubscribePageRequests();
      this._unsubscribePageRequests = null;
    }

    // Verifier le cache avant de s'abonner (evite une race condition
    // si la source a deja emis ses donnees avant l'abonnement)
    const cachedData = getDataCache(this.source);
    if (cachedData !== undefined) {
      this._processData(cachedData);
    }

    // S'abonner a la nouvelle source
    this._unsubscribe = subscribeToSource(this.source, {
      onLoaded: (data: unknown) => {
        this._processData(data);
      },
      onLoading: () => {
        dispatchDataLoading(this.id);
      },
      onError: (error: Error) => {
        dispatchDataError(this.id, error);
      }
    });

    // Relayer les commandes vers la source upstream
    this._unsubscribePageRequests = subscribeToSourceCommands(this.id, (cmd) => {
      dispatchSourceCommand(this.source, cmd);
    });
  }

  private _processData(rawData: unknown) {
    try {
      dispatchDataLoading(this.id);

      let rows = Array.isArray(rawData) ? rawData : [rawData];

      // Flatten: extract nested sub-object keys to top level (before all other transforms)
      if (this.flatten) {
        rows = rows.map(row => {
          if (row === null || row === undefined || typeof row !== 'object' || Array.isArray(row)) {
            return row;
          }
          return this._flattenRow(row as Record<string, unknown>, this.flatten);
        });
      }

      const numericFields = this._parseNumericFields();
      const roundFields = this._parseRoundFields();
      const renameMap = this._parsePipeMap(this.rename);
      const replaceMap = this._parsePipeMap(this.replace);
      const replaceFieldsMap = this._parseReplaceFields(this.replaceFields);

      const result = rows.map(row => {
        if (row === null || row === undefined || typeof row !== 'object') {
          return row;
        }
        return this._normalizeRow(row as Record<string, unknown>, numericFields, roundFields, renameMap, replaceMap, replaceFieldsMap);
      });

      dispatchDataLoaded(this.id, result);

      // Pass-through de la meta de pagination de la source upstream
      const sourceMeta = getDataMeta(this.source);
      if (sourceMeta) {
        setDataMeta(this.id, sourceMeta);
      }
    } catch (error) {
      dispatchDataError(this.id, error as Error);
      console.error(`dsfr-data-normalize[${this.id}]: Erreur de normalisation`, error);
    }
  }

  private _normalizeRow(
    row: Record<string, unknown>,
    numericFields: Set<string>,
    roundFields: Map<string, number>,
    renameMap: Map<string, string>,
    replaceMap: Map<string, string>,
    replaceFieldsMap: Map<string, Map<string, string>>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [rawKey, value] of Object.entries(row)) {
      // 0. Trim key (when trim is enabled, also clean key names)
      const key = this.trim ? rawKey.trim() : rawKey;
      let normalizedValue = value;

      // 1. Trim value
      if (this.trim && typeof normalizedValue === 'string') {
        normalizedValue = normalizedValue.trim();
      }

      // 2. Strip HTML
      if (this.stripHtml && typeof normalizedValue === 'string') {
        normalizedValue = (normalizedValue as string).replace(/<[^>]*>/g, '');
      }

      // 3a. Field-specific replace (replace-fields)
      if (replaceFieldsMap.size > 0 && typeof normalizedValue === 'string') {
        const fieldReplacements = replaceFieldsMap.get(key);
        if (fieldReplacements) {
          for (const [pattern, replacement] of fieldReplacements) {
            if (normalizedValue === pattern) {
              normalizedValue = replacement;
              break;
            }
          }
        }
      }

      // 3b. Global replace
      if (replaceMap.size > 0 && typeof normalizedValue === 'string') {
        for (const [pattern, replacement] of replaceMap) {
          if (normalizedValue === pattern) {
            normalizedValue = replacement;
            break;
          }
        }
      }

      // 4. Numeric conversion (uses trimmed key for field matching)
      if (numericFields.has(key)) {
        normalizedValue = toNumber(normalizedValue);
      } else if (this.numericAuto && typeof normalizedValue === 'string' && looksLikeNumber(normalizedValue)) {
        const num = toNumber(normalizedValue, true);
        if (num !== null) {
          normalizedValue = num;
        }
      }

      // 5. Round numeric values
      if (roundFields.has(key) && typeof normalizedValue === 'number' && isFinite(normalizedValue)) {
        const decimals = roundFields.get(key)!;
        if (decimals === 0) {
          normalizedValue = Math.round(normalizedValue);
        } else {
          const factor = 10 ** decimals;
          normalizedValue = Math.round(normalizedValue * factor) / factor;
        }
      }

      // 6. Rename key (uses trimmed key for map lookup)
      const finalKey = renameMap.get(key) ?? key;

      // 7. Lowercase keys
      const outputKey = this.lowercaseKeys ? finalKey.toLowerCase() : finalKey;

      result[outputKey] = normalizedValue;
    }

    return result;
  }

  /** Aplatit un sous-objet au premier niveau d'un enregistrement */
  private _flattenRow(row: Record<string, unknown>, path: string): Record<string, unknown> {
    const nested = this._resolvePath(row, path);

    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const result = { ...row };
      this._deleteByPath(result, path);
      Object.assign(result, nested as Record<string, unknown>);
      return result;
    }

    return row;
  }

  /** Resout un chemin en dot notation sur un objet */
  private _resolvePath(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      return acc != null && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined;
    }, obj);
  }

  /** Supprime une cle par chemin dot notation (supprime aussi la racine du chemin) */
  private _deleteByPath(obj: Record<string, unknown>, path: string): void {
    const parts = path.split('.');
    // Always delete the top-level key to remove the entire nested path
    delete obj[parts[0]];
  }

  /** Parse l'attribut numeric en Set de noms de champs */
  _parseNumericFields(): Set<string> {
    if (!this.numeric) return new Set();
    return new Set(
      this.numeric.split(',').map(f => f.trim()).filter(Boolean)
    );
  }

  /** Parse l'attribut round en Map<champ, decimales>. Format: "champ1, champ2" (0 decimales) ou "champ1:2, champ2:1" */
  _parseRoundFields(): Map<string, number> {
    const map = new Map<string, number>();
    if (!this.round) return map;
    for (const entry of this.round.split(',')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) {
        map.set(trimmed, 0);
      } else {
        const field = trimmed.substring(0, colonIdx).trim();
        const decimals = parseInt(trimmed.substring(colonIdx + 1).trim(), 10);
        if (field) map.set(field, isNaN(decimals) ? 0 : decimals);
      }
    }
    return map;
  }

  /** Parse l'attribut replace-fields en Map<champ, Map<pattern, remplacement>> */
  _parseReplaceFields(attr: string): Map<string, Map<string, string>> {
    const result = new Map<string, Map<string, string>>();
    if (!attr) return result;

    const entries = attr.split('|');
    for (const entry of entries) {
      const trimmed = entry.trim();
      const firstColon = trimmed.indexOf(':');
      if (firstColon === -1) continue;
      const secondColon = trimmed.indexOf(':', firstColon + 1);
      if (secondColon === -1) continue;

      const field = trimmed.substring(0, firstColon).trim();
      const pattern = trimmed.substring(firstColon + 1, secondColon).trim();
      const replacement = trimmed.substring(secondColon + 1).trim();

      if (!field || !pattern) continue;

      if (!result.has(field)) {
        result.set(field, new Map());
      }
      result.get(field)!.set(pattern, replacement);
    }
    return result;
  }

  /** Parse un attribut pipe-separe en Map cle:valeur */
  _parsePipeMap(attr: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!attr) return map;

    const pairs = attr.split('|');
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;
      const key = pair.substring(0, colonIndex).trim();
      const value = pair.substring(colonIndex + 1).trim();
      if (key) {
        map.set(key, value);
      }
    }
    return map;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-normalize': DsfrDataNormalize;
  }
}
