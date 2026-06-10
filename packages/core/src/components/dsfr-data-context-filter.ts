import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { escapeColonValue } from '../utils/where.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import type { DsfrDataContext } from './dsfr-data-context.js';

/** YYYY-MM-DD en UTC (#230) */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Plage [1er du mois, 1er du mois suivant) depuis "YYYY-MM" */
function monthRange(value: string): [string, string] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  return [`${m[1]}-${m[2]}-01`, `${next}-01`];
}

/** Plage [1er janvier, 1er janvier suivant) depuis "YYYY" */
function yearRange(value: string): [string, string] | null {
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return [`${value}-01-01`, `${year + 1}-01-01`];
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
  // Operateurs de date (#230) — clauses en plages [debut, fin)
  'month-of',
  'year-of',
  'lt-day-after',
  'last-n-days',
  'current-year',
] as const;
type ContextOperator = (typeof OPERATORS)[number];

/**
 * <dsfr-data-context-filter> — un filtre du contexte (#229).
 *
 * Enfant de <dsfr-data-context>. Écoute les change/input de l'élément d'UI
 * référencé par `ui` (select, input, select multiple — ou DEUX ids pour
 * `between` : min puis max), construit une clause **colon** (le dialecte
 * pivot de la lib, #277) et la confie au contexte parent qui la diffuse aux
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

  /** Opérateur : eq, in, lt, gte, between */
  @property({ type: String })
  operator: ContextOperator = 'eq';

  /** Cibles : "*" (défaut, toutes les sources du contexte) ou ids ciblés */
  @property({ type: String, attribute: 'apply-to' })
  applyTo = '*';

  /** Libellé naturel pour l'affichage (tags #232) — défaut : field */
  @property({ type: String })
  label = '';

  private _context: DsfrDataContext | null = null;

  private _uiEls: HTMLElement[] = [];

  private _onUiChange = () => this._emit();

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this._context = this.closest('dsfr-data-context');
    // Bind différé d'un tick : à l'innerHTML, les éléments d'UI déclarés
    // après le contexte dans le même fragment ne sont pas encore là
    queueMicrotask(() => this._bind());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unbindUi();
    this._context?._unregisterFilter(this);
    this._context = null;
  }

  willUpdate(changed: Map<string, unknown>) {
    super.willUpdate(changed);
    if (changed.has('ui') || changed.has('field') || changed.has('operator')) {
      if (this.hasUpdated) {
        this._unbindUi();
        this._bind();
      }
    }
  }

  /** Validation + abonnement aux éléments d'UI */
  private _bind(): void {
    if (!this.isConnected) return;

    if (!this._context) {
      reportConfigError(
        this,
        'dsfr-data-context-filter',
        'doit être un enfant de <dsfr-data-context>'
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
    }

    // Une UI déjà remplie au montage applique son filtre immédiatement
    if (this._currentValues().some((v) => v !== '')) {
      this._emit();
    }
  }

  /** Écrit des valeurs (issues de l'URL) dans les contrôles d'UI liés */
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
    (el as HTMLInputElement | HTMLSelectElement).value = values.join(',');
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
    if (this.operator === 'last-n-days') return `${raw} derniers jours`;
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
    // DYNAMIQUES (last-n-days, current-year) se recalculent ICI, a chaque
    // diffusion — jamais de date figee ; l'URL serialise l'intention (#231)
    if (this.operator === 'month-of') {
      const range = monthRange(raw);
      if (!range) return '';
      return `${this.field}:gte:${range[0]}, ${this.field}:lt:${range[1]}`;
    }
    if (this.operator === 'year-of') {
      const range = yearRange(raw);
      if (!range) return '';
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

  render() {
    return undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-context-filter': DsfrDataContextFilter;
  }
}
