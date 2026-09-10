import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { escapeColonValue } from '../utils/where.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { CONTEXT_CONNECTED_EVENT, findContextById } from './dsfr-data-context.js';
import type { DsfrDataContext } from './dsfr-data-context.js';

/** YYYY-MM-DD en UTC (#230) */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * YYYY-MM-DD dans le fuseau LOCAL (#682) : la date calendaire que voit
 * l'utilisateur — a 00:30 a Paris le 1er juin, l'UTC est encore le 31 mai.
 */
function localIsoDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Mots-clés dynamiques de `default` (#682), résolus au montage dans le fuseau local */
const DEFAULT_KEYWORDS = ['today', 'first-of-month', 'first-of-year'] as const;

/**
 * Résout un mot-clé de `default` en date ISO locale (#682) ; toute autre
 * valeur est un littéral rendu tel quel.
 */
function resolveDefaultKeyword(value: string): string {
  if (!(DEFAULT_KEYWORDS as readonly string[]).includes(value)) return value;
  const today = localIsoDate(new Date());
  if (value === 'first-of-month') return `${today.slice(0, 7)}-01`;
  if (value === 'first-of-year') return `${today.slice(0, 4)}-01-01`;
  return today;
}

/**
 * Tronque une date complete a la precision de l'operateur (#646) :
 * `year-of` accepte "YYYY", "YYYY-MM" et "YYYY-MM-DD" (-> "YYYY") ;
 * `month-of` accepte "YYYY-MM" et "YYYY-MM-DD" (-> "YYYY-MM"). Un
 * <input type="date"> peut ainsi nourrir les deux operateurs (il n'existe
 * pas de type="year"). Toute autre valeur est rendue telle quelle.
 */
function truncateToOperator(value: string, operator: 'year-of' | 'month-of'): string {
  const parts = dateParts(value);
  if (!parts) return value;
  return operator === 'year-of' ? parts[0] : parts.slice(0, 2).join('-');
}

/** Decompose "YYYY", "YYYY-MM" ou "YYYY-MM-DD" en segments — null pour toute autre forme */
function dateParts(value: string): string[] | null {
  const parts = value.split('-');
  if (parts.length > 3 || !/^\d{4}$/.test(parts[0])) return null;
  if (parts.slice(1).some((p) => !/^\d{2}$/.test(p))) return null;
  return parts;
}

/**
 * Adapte une valeur d'URL a la precision du controle qui la recoit (#646) :
 * un <input type="date"> refuse "2026" (valeur assainie a vide), un
 * type="month" refuse "2026-09-09". On complete ou tronque pour que le
 * controle accepte la valeur — buildColonWhere() retronque ensuite a la
 * precision de l'operateur.
 */
function fitDateToInput(
  value: string,
  inputType: string,
  operator: 'year-of' | 'month-of'
): string {
  const parts = dateParts(value);
  if (!parts) return value;
  const [year, month = '01', day = '01'] = parts;
  if (inputType === 'date') return `${year}-${month}-${day}`;
  if (inputType === 'month') return `${year}-${month}`;
  return truncateToOperator(value, operator);
}

/**
 * Adapte une valeur de `default` au controle qui la recoit (#682) : un
 * mot-cle resout en date complete, qu'un input type="month" refuserait et
 * qu'un `year-of` sur un input texte n'attend pas. Reutilise la troncature
 * de #646 ; une valeur qui n'est pas une date est rendue telle quelle.
 */
function fitDefaultToInput(value: string, inputType: string, operator: ContextOperator): string {
  if (operator === 'year-of' || operator === 'month-of') {
    return fitDateToInput(value, inputType, operator);
  }
  if (inputType === 'month') return truncateToOperator(value, 'month-of');
  return value;
}

/** Plage [1er du mois, 1er du mois suivant) depuis "YYYY-MM" (ou une date complete, #646) */
function monthRange(value: string): [string, string] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(truncateToOperator(value, 'month-of'));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  return [`${m[1]}-${m[2]}-01`, `${next}-01`];
}

/** Plage [1er janvier, 1er janvier suivant) depuis "YYYY" (ou une date complete, #646) */
function yearRange(value: string): [string, string] | null {
  const y = truncateToOperator(value, 'year-of');
  if (!/^\d{4}$/.test(y)) return null;
  const year = Number(y);
  return [`${y}-01-01`, `${year + 1}-01-01`];
}

/** Lendemain ISO de "YYYY-MM-DD" (borne haute exclusive = inclusif jusqu'au jour choisi) */
function dayAfter(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return isoDate(d);
}

/** Opérateurs du jeu de base (#229) */
const OPERATORS = [
  'eq',
  'in',
  'lt',
  'gte',
  'between',
  // Sous-chaine (#678) : deja traduit par filter-translator (like "%v%" en
  // ODSQL, includes en local), il n'etait simplement pas expose ici
  'contains',
  // Operateurs de date (#230) — clauses en plages [debut, fin)
  'month-of',
  'year-of',
  'lt-day-after',
  'last-n-days',
  'current-year',
  'current-month',
] as const;
type ContextOperator = (typeof OPERATORS)[number];

/**
 * <dsfr-data-context-filter> — un filtre du contexte (#229).
 *
 * Enfant de <dsfr-data-context> — ou, avec `context="id"` (#678), placé
 * n'importe où dans la page. Écoute les change/input de l'élément d'UI
 * référencé par `ui` (select, input, select multiple — ou DEUX ids pour
 * `between` : min puis max), construit une clause **colon** (le dialecte
 * pivot de la lib, #277) et la confie au contexte qui la diffuse aux
 * sources ciblées, traduite au dialecte de chaque adapter.
 *
 * La valeur vide retire le filtre (where vide sur le même whereKey).
 */
@customElement('dsfr-data-context-filter')
export class DsfrDataContextFilter extends LitElement {
  /** Colonne filtrée */
  @property({ type: String })
  field = '';

  /** Id(s) de l'élément d'UI écouté — deux ids (min max) pour between */
  @property({ type: String })
  ui = '';

  /**
   * Opérateur : eq, in, lt, gte, between, contains (sous-chaîne, #678) — et
   * dates (#230, clauses en plages [debut, fin)) : month-of, year-of,
   * lt-day-after, last-n-days, current-year, current-month (#682 — case à
   * cocher, mois en cours, borne dynamique).
   *
   * `year-of` et `month-of` acceptent une date plus precise que l'operateur
   * et la tronquent (#646) : "2026-09-09" -> annee 2026 / mois 2026-09, ce
   * qui permet de les nourrir d'un <input type="date"> (il n'existe pas de
   * type="year"). Une valeur qui reste inexploitable (ni date, ni mois, ni
   * annee) retire le filtre et le signale par un avertissement console,
   * emis une seule fois par filtre.
   */
  @property({ type: String })
  operator: ContextOperator = 'eq';

  /** Cibles : "*" (défaut, toutes les sources du contexte) ou ids ciblés */
  @property({ type: String, attribute: 'apply-to' })
  applyTo = '*';

  /** Libellé naturel pour l'affichage (tags #232) — défaut : field */
  @property({ type: String })
  label = '';

  /**
   * Valeur initiale du filtre (#682), appliquée au montage APRÈS l'URL —
   * un paramètre d'URL présent gagne toujours (ADR-031). Mots-clés
   * dynamiques résolus dans le fuseau local : `today` (date du jour),
   * `first-of-month` (1er du mois en cours), `first-of-year` (1er janvier
   * de l'année en cours) ; toute autre valeur est un littéral. La date est
   * adaptée au contrôle (input type="month" → AAAA-MM, `year-of` → AAAA)
   * puis écrite dans l'UI et émise par le chemin normal, jamais injectée
   * dans un where. Pour `between` et `in`, plusieurs valeurs séparées par
   * une virgule (ex. `first-of-year,today`).
   */
  @property({ type: String, attribute: 'default' })
  defaultValue = '';

  /**
   * Id du dsfr-data-context cible (#678). Vide = le contexte parent le plus
   * proche (`closest`), comportement historique. Le contexte peut être
   * déclaré après ce filtre dans le DOM : l'enregistrement se fait alors à
   * sa connexion.
   */
  @property({ type: String })
  context = '';

  private _context: DsfrDataContext | null = null;

  /** Un contexte visé par id vient d'être connecté : (re)bind si c'est le nôtre (#678) */
  private _onContextConnected = (e: Event) => {
    const id = (e as CustomEvent<{ id: string | null }>).detail?.id;
    if (this.context && id === this.context) {
      this._unbindUi();
      this._bind();
    }
  };

  private _uiEls: HTMLElement[] = [];

  private _onUiChange = () => this._emit();

  /** Valeur de date inexploitable deja signalee (#646) — un warn par filtre, pas par frappe */
  private _unusableDateWarned = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
    // Bind différé d'un tick : à l'innerHTML, les éléments d'UI déclarés
    // après le contexte dans le même fragment ne sont pas encore là
    queueMicrotask(() => this._bind());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
    this._unbindUi();
    this._context?._unregisterFilter(this);
    this._context = null;
  }

  willUpdate(changed: Map<string, unknown>) {
    super.willUpdate(changed);
    if (
      changed.has('ui') ||
      changed.has('field') ||
      changed.has('operator') ||
      changed.has('context')
    ) {
      if (this.hasUpdated) {
        this._unbindUi();
        this._bind();
      }
    }
  }

  /** Contexte cible : par id (`context`, #678) sinon le parent le plus proche */
  private _resolveContext(): DsfrDataContext | null {
    if (this.context) return findContextById(this.context);
    return this.closest('dsfr-data-context');
  }

  /** Validation + abonnement aux éléments d'UI */
  private _bind(): void {
    if (!this.isConnected) return;

    const context = this._resolveContext();
    if (context !== this._context) {
      this._context?._unregisterFilter(this);
      this._context = context;
    }
    if (!this._context) {
      reportConfigError(
        this,
        'dsfr-data-context-filter',
        this.context
          ? `dsfr-data-context introuvable : "${this.context}"`
          : 'doit être un enfant de <dsfr-data-context> (ou le viser par context="id")'
      );
      return;
    }
    if (!this.field) {
      reportConfigError(this, 'dsfr-data-context-filter', 'attribut "field" requis');
      return;
    }
    if (!OPERATORS.includes(this.operator)) {
      reportConfigError(
        this,
        'dsfr-data-context-filter',
        `operator "${this.operator}" inconnu (attendus : ${OPERATORS.join(', ')})`
      );
      return;
    }

    const ids = this.ui.split(/\s+/).filter(Boolean);
    const expected = this.operator === 'between' ? 2 : 1;
    if (ids.length !== expected) {
      reportConfigError(
        this,
        'dsfr-data-context-filter',
        this.operator === 'between'
          ? 'between attend deux ids d\'UI dans "ui" (min puis max)'
          : 'attribut "ui" requis (id de l\'élément écouté)'
      );
      return;
    }

    const els = ids.map((id) => document.getElementById(id));
    if (els.some((el) => !el)) {
      reportConfigError(
        this,
        'dsfr-data-context-filter',
        `élément d'UI introuvable : ${ids.filter((_, i) => !els[i]).join(', ')}`
      );
      return;
    }

    clearConfigError(this);
    this._uiEls = els as HTMLElement[];
    for (const el of this._uiEls) {
      el.addEventListener('change', this._onUiChange);
      el.addEventListener('input', this._onUiChange);
    }
    // S'enregistre auprès du contexte (whereKey stable + détection doublon)
    this._context._registerFilter(this);

    // Pré-remplissage depuis l'URL (#231, ADR-031) : les valeurs passent
    // par l'UI puis par le MÊME chemin d'émission qu'un clic utilisateur —
    // jamais injectées directement dans un where
    const urlValues = this._context._urlValuesFor(this.field);
    if (urlValues) {
      this._prefillUi(urlValues);
    } else if (this.defaultValue) {
      // Valeur initiale (#682) : APRES l'URL, qui gagne — meme chemin
      this._prefillUi(this._resolvedDefault());
    }

    // Une UI déjà remplie au montage applique son filtre immédiatement
    if (this._currentValues().some((v) => v !== '')) {
      this._emit();
    }
  }

  /**
   * Valeurs de `default` résolues (#682) : mots-clés → date locale du jour,
   * adaptée au contrôle qui la reçoit. `between` et `in` acceptent
   * plusieurs valeurs séparées par une virgule.
   */
  private _resolvedDefault(): string[] {
    const multi = this.operator === 'between' || this.operator === 'in';
    const raw = multi ? this.defaultValue.split(',') : [this.defaultValue];
    return raw.map((v, i) => {
      const el = this._uiEls[this.operator === 'between' ? i : 0];
      const inputType = el instanceof HTMLInputElement ? el.type : '';
      return fitDefaultToInput(resolveDefaultKeyword(v.trim()), inputType, this.operator);
    });
  }

  /** Écrit des valeurs (issues de l'URL ou de `default`) dans les contrôles d'UI liés */
  private _prefillUi(values: string[]): void {
    if (this.operator === 'between') {
      const [min, max] = values;
      const [elMin, elMax] = this._uiEls as Array<HTMLInputElement | undefined>;
      if (elMin && min !== undefined) elMin.value = min;
      if (elMax && max !== undefined) elMax.value = max;
      return;
    }
    const el = this._uiEls[0];
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      el.checked = values[0] === 'on' || values[0] === 'true' || values[0] === '1';
      return;
    }
    if (el instanceof HTMLSelectElement && el.multiple) {
      const wanted = new Set(values);
      for (const option of Array.from(el.options)) {
        option.selected = wanted.has(option.value);
      }
      return;
    }
    let value = values.join(',');
    if (this.operator === 'year-of' || this.operator === 'month-of') {
      // Une date complete dans l'URL doit tenir dans le controle (#646)
      value = fitDateToInput(value, el instanceof HTMLInputElement ? el.type : '', this.operator);
    }
    (el as HTMLInputElement | HTMLSelectElement).value = value;
  }

  /** Libellé d'affichage (tags #232) */
  displayLabel(): string {
    return this.label || this.field;
  }

  /** Valeur d'affichage humaine du filtre (tags #232) */
  displayValue(): string {
    const values = this._currentValues();
    if (this.operator === 'between') {
      const [min, max] = values;
      return [min, max].filter(Boolean).join(' – ');
    }
    const raw = values[0] ?? '';
    if (this.operator === 'current-year') return 'année en cours';
    if (this.operator === 'current-month') return 'mois en cours';
    if (this.operator === 'last-n-days') return `${raw} derniers jours`;
    if (this.operator === 'year-of' || this.operator === 'month-of') {
      // Le tag montre la precision reellement filtree (#646)
      return truncateToOperator(raw, this.operator);
    }
    return raw.split(/[|,]/).filter(Boolean).join(', ');
  }

  /**
   * Réinitialise le filtre en VIDANT ses contrôles d'UI puis ré-émet —
   * exactement le chemin d'un utilisateur qui efface le champ (#232) :
   * sources, URL et tags se mettent à jour ensemble.
   */
  clear(): void {
    for (const el of this._uiEls) {
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.checked = false;
      } else if (el instanceof HTMLSelectElement && el.multiple) {
        for (const option of Array.from(el.options)) option.selected = false;
      } else {
        (el as HTMLInputElement | HTMLSelectElement).value = '';
      }
    }
    this._emit();
  }

  /**
   * Valeur de ce filtre pour l'URL (#231) — encodage lisible ADR-031 :
   * valeurs jointes par virgule ('' = filtre inactif, paramètre retiré).
   */
  urlValue(): string {
    const values = this._currentValues();
    if (this.operator === 'between') {
      const [min, max] = values;
      return min || max ? `${min ?? ''},${max ?? ''}` : '';
    }
    const raw = values[0] ?? '';
    if (this.operator === 'in') {
      return raw.split(/[|,]/).filter(Boolean).join(',');
    }
    return raw;
  }

  private _unbindUi(): void {
    for (const el of this._uiEls) {
      el.removeEventListener('change', this._onUiChange);
      el.removeEventListener('input', this._onUiChange);
    }
    this._uiEls = [];
  }

  /** Valeurs courantes des UI (multi-select → toutes les sélectionnées) */
  private _currentValues(): string[] {
    return this._uiEls.map((el) => {
      if (el instanceof HTMLSelectElement && el.multiple) {
        // options.filter(selected) plutot que selectedOptions : plus
        // portable (happy-dom des tests, vieux navigateurs)
        return Array.from(el.options)
          .filter((o) => o.selected)
          .map((o) => o.value)
          .filter(Boolean)
          .join('|');
      }
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        // current-year & co : la checkbox cochee active le filtre (#230)
        return el.checked ? 'on' : '';
      }
      return (el as HTMLInputElement | HTMLSelectElement).value ?? '';
    });
  }

  /** Construit la clause colon et la confie au contexte */
  private _emit(): void {
    if (!this._context) return;
    this._context._applyFilter(this, this.buildColonWhere());
  }

  /**
   * Clause colon du filtre — chaîne vide si l'UI est vide (= retrait).
   * Les valeurs sont percent-encodées (#271) : une virgule ou un pipe dans
   * une valeur ne casse pas la grammaire.
   */
  buildColonWhere(): string {
    const values = this._currentValues();

    if (this.operator === 'between') {
      const [min, max] = values;
      const parts: string[] = [];
      if (min !== '') parts.push(`${this.field}:gte:${escapeColonValue(min)}`);
      if (max !== '') parts.push(`${this.field}:lt:${escapeColonValue(max)}`);
      return parts.join(', ');
    }

    const raw = values[0] ?? '';
    if (raw === '') return '';

    // Operateurs de date (#230) : plages [debut, fin) en ISO. Les bornes
    // DYNAMIQUES (last-n-days, current-year, current-month) se recalculent ICI, a chaque
    // diffusion — jamais de date figee ; l'URL serialise l'intention (#231)
    if (this.operator === 'month-of') {
      const range = monthRange(raw);
      if (!range) return this._unusableDate(raw, 'un mois "AAAA-MM" ou une date "AAAA-MM-JJ"');
      return `${this.field}:gte:${range[0]}, ${this.field}:lt:${range[1]}`;
    }
    if (this.operator === 'year-of') {
      const range = yearRange(raw);
      if (!range) {
        return this._unusableDate(
          raw,
          'une annee "AAAA", un mois "AAAA-MM" ou une date "AAAA-MM-JJ"'
        );
      }
      return `${this.field}:gte:${range[0]}, ${this.field}:lt:${range[1]}`;
    }
    if (this.operator === 'lt-day-after') {
      const bound = dayAfter(raw);
      if (!bound) return '';
      return `${this.field}:lt:${bound}`;
    }
    if (this.operator === 'last-n-days') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) return '';
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - n);
      return `${this.field}:gte:${isoDate(start)}`;
    }
    if (this.operator === 'current-year') {
      const year = new Date().getUTCFullYear();
      return `${this.field}:gte:${year}-01-01, ${this.field}:lt:${year + 1}-01-01`;
    }
    if (this.operator === 'current-month') {
      // Symetrique de current-year (#682) : meme horloge UTC, meme plage [1er, 1er suivant)
      const range = monthRange(isoDate(new Date()));
      if (!range) return '';
      return `${this.field}:gte:${range[0]}, ${this.field}:lt:${range[1]}`;
    }

    if (this.operator === 'in') {
      // | (multi-select) et , (saisie texte / URL lisible ADR-031)
      const escaped = raw
        .split(/[|,]/)
        .filter(Boolean)
        .map((v) => escapeColonValue(v.trim()))
        .join('|');
      return `${this.field}:in:${escaped}`;
    }

    return `${this.field}:${this.operator}:${escapeColonValue(raw)}`;
  }

  /**
   * Valeur de date inexploitable (#646) : le filtre est retire (clause vide)
   * mais on le DIT — une fois par filtre. Pas reportConfigError : c'est une
   * valeur de runtime, un input texte en emet une a chaque frappe.
   */
  private _unusableDate(raw: string, expected: string): '' {
    if (!this._unusableDateWarned) {
      this._unusableDateWarned = true;
      console.warn(
        `dsfr-data-context-filter (${this.field}, operator="${this.operator}") : ` +
          `valeur "${raw}" inexploitable, attendu ${expected} — filtre retire.`
      );
    }
    return '';
  }

  render() {
    return undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-context-filter': DsfrDataContextFilter;
  }
}
