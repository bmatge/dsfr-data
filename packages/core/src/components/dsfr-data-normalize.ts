import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import {
  toNumber,
  looksLikeNumber,
  compileCompute,
  applyCompute,
  unescapeColonValue,
  toBoolean,
  computeTargets,
} from '@dsfr-data/shared/lib';
import type { CompiledCompute, ComputedColumn } from '@dsfr-data/shared/lib';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { getDataCache } from '../utils/data-bridge.js';
import { TransformerMixin } from '../utils/transformer-mixin.js';
import type { SourceElement } from '../utils/source-element.js';

/** Un motif de colonne de `fold` : joker `*` en début ou en fin seulement, ou nom exact. */
export interface FoldMatcher {
  kind: 'prefix' | 'suffix' | 'exact';
  /** Partie fixe du motif (sans le joker). */
  text: string;
}

/** Une règle de `fold` : les motifs (dans l'ordre déclaré) repliés dans une même cible. */
export interface FoldRule {
  target: string;
  matchers: FoldMatcher[];
}

/** Résultat du parsing de `fold` : règles valides + erreurs lisibles (mode dégradé). */
export interface ParsedFold {
  rules: FoldRule[];
  errors: string[];
}

/**
 * Remplacements d'une valeur scalaire (#730, #774) : d'abord `replace-fields`
 * du champ, puis `replace` global — premier motif égal gagnant dans chaque
 * table. Comparaison sur la forme chaîne des chaînes, nombres et booléens ;
 * toute autre valeur (null, objet) est rendue telle quelle.
 */
function applyReplacements(
  value: unknown,
  fieldReplacements: Map<string, string> | undefined,
  globalReplacements: Map<string, string>
): unknown {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return value;
  }
  let result: unknown = value;
  if (fieldReplacements) {
    const asString = String(result);
    for (const [pattern, replacement] of fieldReplacements) {
      if (asString === pattern) {
        result = replacement;
        break;
      }
    }
  }
  if (globalReplacements.size > 0) {
    const asString = String(result);
    for (const [pattern, replacement] of globalReplacements) {
      if (asString === pattern) {
        result = replacement;
        break;
      }
    }
  }
  return result;
}

/**
 * <dsfr-data-normalize> - Composant de normalisation de données
 *
 * S'insere entre une source (dsfr-data-source) et un consommateur (dsfr-data-query, dsfr-data-chart, etc.)
 * pour nettoyer et normaliser les données avant traitement.
 *
 * Position recommandee : AVANT dsfr-data-query pour que les filtres/agrégations
 * travaillent sur des données propres.
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
export class DsfrDataNormalize extends TransformerMixin(LitElement) {
  /** ID de la source de données a ecouter */
  @property({ type: String })
  source = '';

  /** Champs a convertir en nombre (virgule-séparés). Ex: "population, surface" */
  @property({ type: String })
  numeric = '';

  /** Detection automatique des champs numériques via looksLikeNumber() */
  @property({ type: Boolean, attribute: 'numeric-auto' })
  numericAuto = false;

  /**
   * Renommage de clés. Format : "ancien:nouveau | ancien2:nouveau2".
   * Un `:` ou `|` littéral dans un nom s'échappe en percent (`%3A`, `%7C`), comme dans `where`.
   */
  @property({ type: String })
  rename = '';

  /** Supprime les espaces en debut/fin de toutes les clés et valeurs string */
  @property({ type: Boolean })
  trim = false;

  /** Supprime les balises HTML des valeurs string */
  @property({ type: Boolean, attribute: 'strip-html' })
  stripHtml = false;

  /**
   * Remplacement de valeurs, sur tous les champs. Format : "pattern:remplacement | pattern2:remplacement2".
   * Le pattern est comparé à la valeur entière (égalité stricte, pas de regex) ; un remplacement
   * vide supprime la valeur. Un `:`, `|`, `,` ou `%` littéral dans le pattern ou le remplacement
   * s'échappe en percent (`%3A`, `%7C`, `%2C`, `%25`), comme dans `where` (#676) :
   * `replace="10%3A00:10h"` récrit « 10:00 » en « 10h ». La comparaison porte sur la forme
   * chaîne de la valeur : une colonne numérique est concernée aussi (#730). Un champ TABLEAU
   * (multivalué venu de la source) est remplacé élément par élément, longueur conservée et sans
   * dédoublonnage (#774). Limite : le remplacement s'exécute AVANT `split`, il ne voit donc pas les
   * tableaux fabriqués par `split` — il agit sur la chaîne entière avant la découpe. Pour un
   * recodage plus riche (sous-chaîne, année d'une date ISO), utiliser `compute` avec `replace()`
   * ou `year()`.
   */
  @property({ type: String })
  replace = '';

  /**
   * Remplacement ciblé par champ. Format : "CHAMP:pattern:remplacement | CHAMP2:p:r".
   * Les deux premiers `:` sont des délimiteurs, le remplacement peut contenir des `:` bruts.
   * Un `:` littéral dans le nom du champ ou dans le pattern s'échappe en `%3A` (`%7C`, `%2C`
   * et `%25` sont aussi décodés), comme dans `where` (#676) : `replace-fields="h:10%3A00:10h"`.
   * La comparaison porte sur la forme chaîne de la valeur : une colonne numérique est concernée
   * aussi, `replace-fields="annee:2024:2024-2025"` fonctionne (#730). Sur un champ tableau venu
   * de la source, élément par élément ; pas sur un tableau fabriqué par `split`, découpé après
   * (#774, même limite que `replace`).
   * Pas de regex : pour un recodage plus riche, voir `compute` (`replace()`, `year()`).
   */
  @property({ type: String, attribute: 'replace-fields' })
  replaceFields = '';

  /** Clé du sous-objet a aplatir au premier niveau. Supporte la dot notation (ex: "data.attributes"). */
  @property({ type: String })
  flatten = '';

  /**
   * Découpe des champs multivalués (chaîne avec séparateur) en vrais tableaux,
   * comme une ChoiceList Grist. Format : "champ:sep, champ2:sep2" ; séparateur
   * par défaut : la virgule ("champ" seul). Ex : "Axes:|, Cibles:;".
   * Chaque élément est trimé, les éléments vides sont écartés, une chaîne vide
   * donne un tableau vide. Les valeurs non-string (tableau déjà forme, null,
   * nombre) sont laissées telles quelles. Les composants aval traitent ces
   * tableaux comme des champs multi-valeurs (facettes : une valeur par élément).
   */
  @property({ type: String })
  split = '';

  /**
   * Repli de colonnes booléennes parallèles en un champ multi-valeurs (#677) — le motif
   * open data « une colonne Oui/Non par modalité » (`handicap_moteur`, `handicap_visuel`…).
   * Format : "motif:cible, motif2:cible2". Le joker `*` n'est accepté qu'en début ou en fin
   * de motif (`handicap_*`, `*_ok`) ; un motif sans joker désigne une colonne exacte ; plusieurs
   * motifs peuvent viser la même cible. Chaque ligne reçoit dans `cible` le tableau des colonnes
   * dont la valeur est vraie au sens de `toBoolean` (Oui/Non, 1/0, true/false, X/vide…),
   * étiquetées par la partie variable du motif (`handicap_moteur` donne « moteur ») ou par le
   * nom complet de la colonne pour un motif sans joker. Les colonnes sources sont conservées
   * (voir `fold-drop`). S'exécute après `rename` et `lowercase-keys`, avant `compute` : les
   * motifs se lisent sur les noms renommés, qui servent donc d'étiquettes
   * (`rename="handicap_moteur:handicap_Moteur"` donne « Moteur »). Le tableau obtenu se
   * filtre avec `dsfr-data-facets` comme un champ `split` (une valeur par élément).
   * Ex : `fold="handicap_*:handicaps"`.
   */
  @property({ type: String })
  fold = '';

  /** Avec `fold` : retire du résultat les colonnes sources repliées. */
  @property({ type: Boolean, attribute: 'fold-drop' })
  foldDrop = false;

  /** Arrondit les champs numériques à l'entier (ou à N décimales). Format: "champ1, champ2" ou "champ1:2, champ2:0" */
  @property({ type: String })
  round = '';

  /** Met toutes les clés en minuscules */
  @property({ type: Boolean, attribute: 'lowercase-keys' })
  lowercaseKeys = false;

  /**
   * Colonnes calculées, ligne à ligne, en dernier (sur les valeurs déjà typées par
   * numeric / round / rename). Format : `cible = expression; cible2 = expression2`
   * (une assignation suivante peut relire une colonne calculée avant elle).
   *
   * Grammaire (ADR-105, #671) :
   * - arithmétique `+ - * /`, parenthèses, moins unaire ; `+` concatène dès qu'un côté
   *   n'est pas numérique ; littéraux texte 'entre quotes simples', nombres à point ;
   * - littéraux `null`, `true`, `false` ;
   * - fonctions en liste blanche, appel `f(a, b)` :
   *   dates `year(d)`, `month(d)`, `day(d)` (ISO ou Date, sinon null) ;
   *   nombres `round(x, n)`, `abs(x)`, `floor(x)`, `ceil(x)` (non numérique → null) ;
   *   texte `lower(s)`, `upper(s)`, `trim(s)`, `len(s)`, `concat(a, b, …)`,
   *   `replace(s, 'de', 'vers')` (littéral, toutes les occurrences, pas de regex) ;
   *   absence `coalesce(a, b, …)` (première valeur non nulle), `is_null(x)`,
   *   `is_empty(x)` (null, '' ou tableau vide) ;
   *   tableaux `join(arr, ', ')`, `contains(arr_ou_texte, v)` ;
   * - conditions `when COND then EXPR [when … then …]… else EXPR` — le `else` est
   *   obligatoire (erreur de configuration sinon) ; comparaisons d'égalité `=` et `!=`
   *   et d'ordre (inférieur, inférieur ou égal, supérieur, supérieur ou égal, avec les
   *   signes usuels — grammaire complète dans le guide « Colonnes calculées » de la skill),
   *   `and`, `or`, `not`. L'égalité est lâche comme celle de `where` (nombre ↔ chaîne
   *   numérique) : `when cat = 'A'` et `where="cat:eq:A"` gardent les mêmes lignes.
   *   Les comparaisons d'ordre se font en nombre quand les deux côtés sont numériques,
   *   en texte sinon (dates ISO comprises) ; null, undefined et '' ne matchent jamais.
   *
   * Exemples : `solde = actif - passif`,
   * `tranche = when montant = 0 then 'Nul' when is_null(montant) then 'Inconnu' else 'Renseigné'`,
   * `type = coalesce(type_entreprise, 'Non renseigné')`, `annee = year(date_notification)`,
   * `pct = round(part * 100, 1)`, `serie = Indicateurs + ' / ' + Sous_theme` ; une tranche
   * par seuils s'écrit avec les opérateurs d'ordre (voir le guide).
   *
   * Fonction hors liste, arité fausse, `when` sans `else`, expression trop longue ou trop
   * imbriquée : erreur de configuration (console + `data-dsfr-config-error`), état d'erreur
   * en aval — jamais une colonne silencieusement vide. Aucun `eval` : tokenizer, parseur,
   * AST ; seuls les champs de la ligne sont accessibles. Hors périmètre : valeurs
   * agrégées (query / kpi), ligne précédente, cumul.
   */
  @property({ type: String })
  compute = '';

  /**
   * Colonnes produites par `compute` au dernier traitement, avec un exemple
   * de valeur (première ligne) — lu par la trace du volet Diagnostic (#604,
   * #671), même doctrine que `getSkippedCount()` des afficheurs.
   */
  private _computedColumns: ComputedColumn[] = [];

  /** True tant qu'une erreur de grammaire `compute` est affichée (#671). */
  private _computeConfigError = false;

  /** Colonnes ajoutées par `compute` au dernier traitement (vide sans compute). */
  public getComputedColumns(): ComputedColumn[] {
    return this._computedColumns.map((c) => ({ ...c }));
  }

  // --- Public API (delegation to upstream source) ---

  /**
   * Retourne l'adapter de la source amont (délégation transparente).
   * Permet aux composants en aval (dsfr-data-facets, dsfr-data-search)
   * d'acceder a l'adapter sans connaitre la structure du pipeline.
   */
  public getAdapter(): import('../adapters/api-adapter.js').ApiAdapter | null {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getAdapter' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getAdapter();
      }
    }
    return null;
  }

  /**
   * Retourne le where effectif de la source amont (délégation transparente).
   */
  public getEffectiveWhere(excludeKey?: string): string {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getEffectiveWhere' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getEffectiveWhere(excludeKey);
      }
    }
    return '';
  }

  /**
   * Retourne les paramètres adapter resolus de la source amont
   * (délégation transparente, headers api-key-ref inclus — #274).
   */
  public getAdapterParams(): import('../adapters/api-adapter.js').AdapterParams | null {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getAdapterParams' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getAdapterParams?.() ?? null;
      }
    }
    return null;
  }

  /**
   * True si la normalisation crée/renomme des colonnes (#394) : rename,
   * compute, flatten et lowercase-keys changent les clés — les opérations
   * serveur d'une query aval porteraient sur des noms inconnus de l'API.
   * Sinon (transformations de valeurs uniquement : numeric, trim…), le
   * statut est délégué à l'amont — un unpivot peut précéder ce normalize.
   */
  public transformsSchema(): boolean {
    if (this.rename || this.compute || this.flatten || this.lowercaseKeys || this.fold) {
      return true;
    }
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'transformsSchema' in sourceEl) {
        return (sourceEl as unknown as SourceElement).transformsSchema?.() === true;
      }
    }
    return false;
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
  }

  // --- Hooks TransformerMixin (#280) ---

  protected transformerName(): string {
    return 'dsfr-data-normalize';
  }

  /** Regles de normalisation → retraitement des données en cache (#281) */
  protected transformerReprocessProps(): string[] {
    return [
      'flatten',
      'split',
      'numeric',
      'numericAuto',
      'round',
      'rename',
      'trim',
      'stripHtml',
      'replace',
      'replaceFields',
      'lowercaseKeys',
      'fold',
      'foldDrop',
      'compute',
    ];
  }

  protected onTransformerReprocess(): void {
    const cachedData = this.source ? getDataCache(this.source) : undefined;
    if (cachedData !== undefined) {
      this._processData(cachedData);
    }
  }

  protected onTransformerData(data: unknown): void {
    this._processData(data);
  }

  private _processData(rawData: unknown) {
    try {
      this.emitTransformerLoading();

      let rows = Array.isArray(rawData) ? rawData : [rawData];

      // Flatten: extract nested sub-object keys to top level (before all other transforms)
      if (this.flatten) {
        rows = rows.map((row) => {
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
      const splitFields = this._parseSplitFields();
      // Fold (#677) : parse une fois par lot ; une entree malformee est signalee
      // (console + data-dsfr-config-error) et ignoree, les autres s'appliquent.
      const { rules: foldRules, errors: foldErrors } = this._parseFold();
      for (const message of foldErrors) {
        reportConfigError(this, `dsfr-data-normalize[${this.id}]`, message);
      }
      // Compile once per batch (not per row). Compute runs LAST, on already-typed
      // values, so `valeur * 100` sees a number and `a + ' / ' + b` concatenates.
      // Erreur de grammaire (fonction hors liste, `when` sans `else`…, #671) :
      // erreur de configuration nommée (#649) + état d'erreur aval, jamais une
      // colonne vide en silence.
      let compiledCompute: CompiledCompute;
      try {
        compiledCompute = compileCompute(this.compute);
      } catch (error) {
        const message = `compute="${this.compute}" : ${(error as Error).message}`;
        reportConfigError(this, `dsfr-data-normalize[${this.id}]`, message);
        this._computeConfigError = true;
        this._computedColumns = [];
        this.emitTransformerError(new Error(message));
        return;
      }
      if (this._computeConfigError) {
        clearConfigError(this);
        this._computeConfigError = false;
      }

      const result = rows.map((row) => {
        if (row === null || row === undefined || typeof row !== 'object') {
          return row;
        }
        let normalized = this._normalizeRow(
          row as Record<string, unknown>,
          numericFields,
          roundFields,
          renameMap,
          replaceMap,
          replaceFieldsMap,
          splitFields
        );
        // Fold reads the FINAL key names (after rename / lowercase-keys) so the
        // renamed labels become the folded values; compute may then use the array.
        if (foldRules.length > 0) {
          normalized = this._applyFold(normalized, foldRules);
        }
        return compiledCompute.length > 0 ? applyCompute(normalized, compiledCompute) : normalized;
      });

      // Colonnes dérivées pour la trace (#671) : noms + valeur de la première ligne.
      const firstRow = result.find((r) => r !== null && typeof r === 'object') as
        Record<string, unknown> | undefined;
      this._computedColumns = computeTargets(compiledCompute).map((name) => ({
        name,
        sample: firstRow ? firstRow[name] : undefined,
      }));

      // Meta de pagination posee AVANT le dispatch par le mixin (#282) —
      // document.dispatchEvent est synchrone, l'aval lirait sinon la meta
      // du batch precedent
      this.emitTransformedData(result);
    } catch (error) {
      this.emitTransformerError(error as Error);
      console.error(`dsfr-data-normalize[${this.id}]: Erreur de normalisation`, error);
    }
  }

  private _normalizeRow(
    row: Record<string, unknown>,
    numericFields: Set<string>,
    roundFields: Map<string, number>,
    renameMap: Map<string, string>,
    replaceMap: Map<string, string>,
    replaceFieldsMap: Map<string, Map<string, string>>,
    splitFields: Map<string, string> = new Map()
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
      // Loop until stable to handle nested patterns like `<a<b>c>` → `<ac>` → ``
      if (this.stripHtml && typeof normalizedValue === 'string') {
        let previous;
        do {
          previous = normalizedValue;
          normalizedValue = (normalizedValue as string).replace(/<[^>]*>/g, '');
        } while (normalizedValue !== previous);
      }

      // Les deux remplacements comparent la FORME CHAINE de la valeur (#730) :
      // gardes par `typeof === 'string'`, ils étaient sans effet — et sans
      // message — sur une colonne numérique ou booléenne, l'attribut mentait.
      // L'égalité reste STRICTE sur cette forme : un nombre n'est jamais
      // transformé par accident, et `null` / `undefined` / objets restent hors
      // jeu (« null » n'est pas une valeur qu'on écrit dans `replace`).
      //
      // Un champ TABLEAU (multivalué d'Opendatasoft) est remplacé élément par
      // élément (#774) : il traversait intact, sans message, alors que ce sont
      // justement les colonnes aux libellés hétérogènes. La longueur est
      // conservée et rien n'est dédoublonné — deux libellés ramenés au même
      // restent deux éléments.
      if (replaceFieldsMap.size > 0 || replaceMap.size > 0) {
        const fieldReplacements = replaceFieldsMap.get(key);
        if (Array.isArray(normalizedValue)) {
          normalizedValue = normalizedValue.map((element: unknown) =>
            applyReplacements(element, fieldReplacements, replaceMap)
          );
        } else {
          normalizedValue = applyReplacements(normalizedValue, fieldReplacements, replaceMap);
        }
      }

      // 3c. Split multi-valued string into an array (uses trimmed key). Runs
      // after replace so a placeholder ("N/A" -> "") yields an empty array,
      // and before numeric/compute which never target a split field.
      if (splitFields.size > 0 && typeof normalizedValue === 'string' && splitFields.has(key)) {
        normalizedValue = this._splitValue(normalizedValue, splitFields.get(key)!);
      }

      // 4. Numeric conversion (uses trimmed key for field matching)
      if (numericFields.has(key)) {
        // Semantique stricte alignee sur numeric-auto (#301) : "N/A"/null
        // devenait 0 et faussait les sommes — desormais null (exclu des
        // agregats par la politique NaN unique)
        normalizedValue = toNumber(normalizedValue, true);
      } else if (
        this.numericAuto &&
        typeof normalizedValue === 'string' &&
        looksLikeNumber(normalizedValue)
      ) {
        const num = toNumber(normalizedValue, true);
        if (num !== null) {
          normalizedValue = num;
        }
      }

      // 5. Round numeric values
      if (
        roundFields.has(key) &&
        typeof normalizedValue === 'number' &&
        isFinite(normalizedValue)
      ) {
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
      return acc != null && typeof acc === 'object'
        ? (acc as Record<string, unknown>)[key]
        : undefined;
    }, obj);
  }

  /** Supprime une clé par chemin dot notation (supprime aussi la racine du chemin) */
  private _deleteByPath(obj: Record<string, unknown>, path: string): void {
    const parts = path.split('.');
    // Always delete the top-level key to remove the entire nested path
    delete obj[parts[0]];
  }

  /** Découpe une cellule multivaluee : éléments trimes, vides écartés */
  private _splitValue(value: string, separator: string): string[] {
    if (value === '') return [];
    return value
      .split(separator)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  /**
   * Parse l'attribut fold en règles `{ cible, motifs }` (#677). Format : "motif:cible, motif2:cible2".
   * Entrées séparées par virgule ; le premier `:` sépare le motif de la cible (échappement percent
   * décodé après découpage). Le joker `*` n'est accepté qu'en début ou en fin de motif ; une
   * entrée malformée (sans `:`, motif ou cible vide, joker au milieu ou multiple) est rendue dans
   * `errors` et ignorée. Plusieurs motifs visant la même cible sont regroupés, dans l'ordre déclaré.
   */
  _parseFold(): ParsedFold {
    const rules: FoldRule[] = [];
    const errors: string[] = [];
    if (!this.fold) return { rules, errors };

    const byTarget = new Map<string, FoldRule>();
    for (const entry of this.fold.split(',')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) {
        errors.push(`fold : entrée « ${trimmed} » sans cible (format attendu : motif:cible)`);
        continue;
      }
      const pattern = unescapeColonValue(trimmed.substring(0, colonIdx).trim());
      const target = unescapeColonValue(trimmed.substring(colonIdx + 1).trim());
      if (!pattern || !target) {
        errors.push(`fold : entrée « ${trimmed} » incomplète (format attendu : motif:cible)`);
        continue;
      }
      const matcher = this._parseFoldMatcher(pattern);
      if (!matcher) {
        errors.push(
          `fold : motif « ${pattern} » invalide (un seul joker *, en début ou en fin de motif)`
        );
        continue;
      }
      let rule = byTarget.get(target);
      if (!rule) {
        rule = { target, matchers: [] };
        byTarget.set(target, rule);
        rules.push(rule);
      }
      rule.matchers.push(matcher);
    }
    return { rules, errors };
  }

  /** Un motif de fold : `prefix*`, `*suffix` ou nom exact ; null si le joker est mal placé. */
  private _parseFoldMatcher(pattern: string): FoldMatcher | null {
    const stars = pattern.split('*').length - 1;
    if (stars === 0) return { kind: 'exact', text: pattern };
    if (stars > 1) return null;
    if (pattern.endsWith('*')) {
      const text = pattern.slice(0, -1);
      return text ? { kind: 'prefix', text } : null;
    }
    if (pattern.startsWith('*')) {
      const text = pattern.slice(1);
      return text ? { kind: 'suffix', text } : null;
    }
    return null;
  }

  /**
   * Étiquette d'une colonne repliée : la partie variable du motif (`handicap_moteur` avec
   * `handicap_*` donne « moteur »), ou le nom complet pour un motif exact ; null si la
   * colonne ne matche pas. Une partie variable vide (colonne = partie fixe) garde le nom complet.
   */
  private _foldLabel(key: string, matcher: FoldMatcher): string | null {
    switch (matcher.kind) {
      case 'exact':
        return key === matcher.text ? key : null;
      case 'prefix':
        if (!key.startsWith(matcher.text)) return null;
        return key.slice(matcher.text.length) || key;
      case 'suffix':
        if (!key.endsWith(matcher.text)) return null;
        return key.slice(0, key.length - matcher.text.length) || key;
    }
  }

  /**
   * Applique les règles de fold à une ligne déjà normalisée (clés finales). Pour chaque cible,
   * les colonnes matchées sont parcourues motif par motif, dans l'ordre de la ligne ; chaque
   * colonne ne compte qu'une fois (le premier motif qui la matche fixe son étiquette) et celles
   * dont la valeur est vraie (`toBoolean`) fournissent leur étiquette au tableau cible, sans
   * doublon. Les colonnes sources sont retirées si `fold-drop` est posé.
   */
  private _applyFold(row: Record<string, unknown>, rules: FoldRule[]): Record<string, unknown> {
    const result: Record<string, unknown> = { ...row };
    const keys = Object.keys(row);
    for (const rule of rules) {
      const labels: string[] = [];
      const seenKeys = new Set<string>();
      for (const matcher of rule.matchers) {
        for (const key of keys) {
          if (key === rule.target || seenKeys.has(key)) continue;
          const label = this._foldLabel(key, matcher);
          if (label === null) continue;
          seenKeys.add(key);
          if (this.foldDrop) delete result[key];
          if (toBoolean(row[key]) && !labels.includes(label)) labels.push(label);
        }
      }
      result[rule.target] = labels;
    }
    return result;
  }

  /**
   * Parse l'attribut split en Map<champ, séparateur>. Format : "champ:sep, champ2:sep2".
   * Entrees séparées par virgule ; le premier `:` separe le champ du séparateur.
   * Séparateur absent ou vide = virgule (ainsi "Tags" et "Tags:," sont equivalents).
   */
  _parseSplitFields(): Map<string, string> {
    const map = new Map<string, string>();
    if (!this.split) return map;
    for (const entry of this.split.split(',')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) {
        map.set(trimmed, ',');
        continue;
      }
      const field = trimmed.substring(0, colonIdx).trim();
      const separator = trimmed.substring(colonIdx + 1).trim();
      if (field) map.set(field, separator || ',');
    }
    return map;
  }

  /** Parse l'attribut numeric en Set de noms de champs */
  _parseNumericFields(): Set<string> {
    if (!this.numeric) return new Set();
    return new Set(
      this.numeric
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
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

  /**
   * Parse l'attribut replace-fields en Map<champ, Map<pattern, remplacement>>.
   * Les trois parties sont décodées par `unescapeColonValue` APRÈS le découpage
   * sur `|` et sur les deux premiers `:` (échappement percent, #676).
   */
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

      const field = unescapeColonValue(trimmed.substring(0, firstColon).trim());
      const pattern = unescapeColonValue(trimmed.substring(firstColon + 1, secondColon).trim());
      const replacement = unescapeColonValue(trimmed.substring(secondColon + 1).trim());

      if (!field || !pattern) continue;

      if (!result.has(field)) {
        result.set(field, new Map());
      }
      result.get(field)!.set(pattern, replacement);
    }
    return result;
  }

  /**
   * Parse un attribut pipe-séparé (`rename`, `replace`) en Map clé:valeur.
   * Clé et valeur sont décodées par `unescapeColonValue` APRÈS le découpage
   * sur `|` et sur le premier `:` (échappement percent, #676).
   */
  _parsePipeMap(attr: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!attr) return map;

    const pairs = attr.split('|');
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;
      const key = unescapeColonValue(pair.substring(0, colonIndex).trim());
      const value = unescapeColonValue(pair.substring(colonIndex + 1).trim());
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
