/**
 * SelectionFilterMixin — le clic qui filtre les autres vues (#734, ADR-104).
 *
 * Le motif maître-détail (cliquer un élément pour filtrer le reste de la page)
 * n'existait que sur `dsfr-data-map-layer` (`refine-on-click`, #681). Le bus de
 * diffusion, lui, était déjà générique : `dsfr-data-context` ne connaît de ses
 * filtres que le contrat `ContextFilterLike`. Ce qui manquait aux afficheurs,
 * c'était le geste de clic, pas le branchement au contexte.
 *
 * Ce mixin extrait le tronc commun écrit dans la carte — bascule de la
 * sélection, événement de sélection, enregistrement auprès du contexte,
 * chemin dégradé vers `source`, valeur initiale depuis l'URL, libération à la
 * déconnexion — pour que `dsfr-data-list` et `dsfr-data-display` s'en servent
 * à l'identique. Chaque hôte ne garde que ce qui lui est propre : où poser le
 * geste de clic, comment le rendre accessible, et le nom de son événement.
 *
 * Contrat repris tel quel de la carte :
 * - premier clic = filtre, second clic sur le même élément = retrait, clic sur
 *   un autre élément = remplacement ;
 * - l'identité d'un élément est la VALEUR du champ de `refine-on-click`, pas la
 *   référence de l'objet (la source ré-émet des objets neufs à chaque rendu) ;
 * - avec `context="id"` : un filtre `eq` enregistré auprès du contexte, qui
 *   traduit au dialecte de chaque source, porte l'URL et le tag ;
 * - sans `context` : la clause part directement à `source` sous un whereKey
 *   stable, sans tag ni URL (chemin dégradé documenté).
 *
 * L'hôte doit déclarer les propriétés `refineOnClick`, `context`, `source` et
 * `label` (chacune avec sa JSDoc, la référence des skills étant générée depuis
 * le manifeste des composants).
 */
import type { LitElement } from 'lit';
import { getByPath } from './json-path.js';
import { escapeColonValue, filterToOdsql } from './where.js';
import { dispatchSourceCommand } from './data-bridge.js';
import { reportConfigError, clearConfigError } from './config-error.js';
import { CONTEXT_CONNECTED_EVENT, findContextHostById } from './context-registry.js';
import type { ContextHost } from './context-registry.js';
import type { ContextFilterLike } from '@dsfr-data/shared/lib';
import type { SourceElement } from './source-element.js';

// Pattern Lit mixin canonique : le constructor doit être callable avec
// n'importe quels args pour permettre le chaînage `class extends mixin(Parent)`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] est le pattern canonique des mixins Lit
type Constructor<T = object> = new (...args: any[]) => T;

/** Ce que le filtre de contexte attend de l'afficheur qui le porte (#734) */
export interface SelectionFilterHost extends HTMLElement {
  /** Champ filtré (`refine-on-click`, espaces retirés) */
  readonly selectionField: string;
  /** Libellé naturel du tag */
  selectionLabel(): string;
  /** Valeur sélectionnée courante — chaîne vide hors sélection */
  _selectedValue(): string;
  /** Retire la sélection par le même chemin qu'un second clic */
  _clearSelection(): void;
}

/**
 * La sélection d'un afficheur vue par le contexte (#734, ADR-104) : UN filtre
 * `eq` sur le champ de `refine-on-click`, dont la valeur est celle de l'élément
 * cliqué. Le contexte diffuse à ses cibles (au dialecte de chacune), porte
 * l'URL et le tag ; l'afficheur ne fait que tenir la sélection courante.
 */
export class SelectionContextFilter implements ContextFilterLike {
  readonly applyTo = '*';
  readonly operator = 'eq';

  constructor(private readonly host: SelectionFilterHost) {}

  get field(): string {
    return this.host.selectionField;
  }

  get isConnected(): boolean {
    return this.host.isConnected;
  }

  buildColonWhere(): string {
    const value = this.host._selectedValue();
    if (!value || !this.field) return '';
    return `${this.field}:eq:${escapeColonValue(value)}`;
  }

  displayLabel(): string {
    return this.host.selectionLabel();
  }

  displayValue(): string {
    return this.host._selectedValue();
  }

  /** Même chemin qu'un second clic sur l'élément sélectionné : l'hôte vide sa sélection et re-diffuse */
  clear(): void {
    this.host._clearSelection();
  }

  urlValue(): string {
    return this.host._selectedValue();
  }
}

/** Contrat public ajouté par le mixin (#734) */
export interface SelectionFilterInterface {
  refineOnClick: string;
  context: string;
  source: string;
  label: string;
  readonly selectionField: string;
  selectionLabel(): string;
  _selectedValue(): string;
  _clearSelection(): void;
  _onFeatureClick(record: Record<string, unknown>): void;
  getSelectedRecord(): Record<string, unknown> | null;
  isSelected(record: Record<string, unknown>): boolean;
  selectionValueOf(record: Record<string, unknown>): string;
}

let selectionUidSeq = 0;

export function SelectionFilterMixin<T extends Constructor<LitElement>>(superClass: T) {
  class SelectionFilterElement extends superClass {
    /** Déclarées par l'hôte (`@property`), pas par le mixin : chacune porte sa JSDoc */
    declare refineOnClick: string;
    declare context: string;
    declare source: string;
    declare label: string;

    /** Repli d'identifiant quand l'hôte n'a pas d'`id` (whereKey du chemin dégradé) */
    private readonly _selectionUid = `dsfr-sel-${++selectionUidSeq}`;

    /** Élément sélectionné (null hors sélection ; null aussi si la sélection vient de l'URL) */
    private _selectedRecord: Record<string, unknown> | null = null;

    /**
     * Identité de la sélection : la valeur du champ `refine-on-click` (stable
     * d'un rendu à l'autre — l'afficheur se redessine avec de nouveaux objets
     * quand sa source ré-émet), sinon l'objet lui-même.
     */
    private _selectedKey: string | Record<string, unknown> | null = null;

    /** Valeur filtrée — conservée même sans élément (pré-remplie depuis l'URL) */
    private _selectedFieldValue = '';

    /** Contexte résolu (mode `context`) */
    private _context: ContextHost | null = null;

    /** Le filtre unique enregistré auprès du contexte */
    private _contextFilter: SelectionContextFilter | null = null;

    /** Dernière clause confiée au contexte ou à la source — ne re-diffuse pas une clause inchangée */
    private _lastPushedWhere = '';

    /** Un contexte visé par id vient d'être connecté : (re)bind si c'est le nôtre */
    private _onContextConnected = (e: Event) => {
      const id = (e as CustomEvent<{ id: string | null }>).detail?.id;
      if (this.context && id === this.context) this._bindContext();
    };

    // --- Points de personnalisation de l'hôte ---

    /** Nom de l'événement émis à chaque bascule de sélection */
    protected selectionEventName(): string {
      return 'dsfr-data-select';
    }

    /** Détail de l'événement de sélection */
    protected selectionEventDetail(
      record: Record<string, unknown>,
      selected: boolean
    ): Record<string, unknown> {
      return { record, elementId: this.id, selected };
    }

    /** Préfixe du whereKey du chemin dégradé (commande directe à `source`) */
    protected selectionWhereKeyPrefix(): string {
      return 'select';
    }

    /** Identifiant de repli du whereKey quand l'hôte n'a pas d'`id` */
    protected selectionUid(): string {
      return this._selectionUid;
    }

    /** La sélection a changé : l'hôte redessine (état visible, bouton, annonce) */
    protected onSelectionChange(): void {
      // par défaut : rien
    }

    // --- Contrat public ---

    /** Champ filtré (`refine-on-click`, espaces retirés) */
    get selectionField(): string {
      return (this.refineOnClick || '').trim();
    }

    /** Libellé du tag : `label`, à défaut le nom du champ */
    selectionLabel(): string {
      return this.label || this.selectionField;
    }

    /** Mode `refine-on-click` demandé */
    protected get _refineMode(): boolean {
      return this.selectionField !== '';
    }

    /** Mode `context` demandé (que le contexte soit déjà résolu ou non) */
    protected get _contextMode(): boolean {
      return this._refineMode && (this.context || '').trim() !== '';
    }

    /** whereKey du chemin dégradé (commande directe à `source`) */
    protected get _directWhereKey(): string {
      return `${this.selectionWhereKeyPrefix()}-${this.id || this.selectionUid()}`;
    }

    /** Valeur courante du filtre de sélection (lue par le filtre de contexte) */
    _selectedValue(): string {
      return this._selectedFieldValue;
    }

    /** Élément actuellement sélectionné (null hors sélection) */
    getSelectedRecord(): Record<string, unknown> | null {
      return this._selectedRecord;
    }

    /** Valeur de sélection d'un élément (chaîne vide hors mode refine) */
    selectionValueOf(record: Record<string, unknown>): string {
      if (!this._refineMode) return '';
      const raw = getByPath(record, this.selectionField);
      return raw === undefined || raw === null ? '' : String(raw);
    }

    /** Cet élément porte-t-il la sélection courante ? (rendu de l'état) */
    isSelected(record: Record<string, unknown>): boolean {
      if (this._selectedKey === null) return false;
      return this._selectionKeyOf(record) === this._selectedKey;
    }

    /** Identité d'un élément pour la sélection : valeur du champ en mode refine, l'objet sinon */
    private _selectionKeyOf(record: Record<string, unknown>): string | Record<string, unknown> {
      if (!this._refineMode) return record;
      return this.selectionValueOf(record);
    }

    /**
     * Clic sur un élément : bascule la sélection (premier clic = sélection,
     * second clic sur le même élément = retrait, autre élément = remplacement),
     * émet l'événement de sélection, puis diffuse le filtre en mode refine.
     */
    _onFeatureClick(record: Record<string, unknown>): void {
      const key = this._selectionKeyOf(record);
      const same = this._selectedKey !== null && key === this._selectedKey;
      if (same) {
        this._setSelection(null, null);
        this._emitSelect(record, false);
      } else {
        this._setSelection(record, key);
        this._emitSelect(record, true);
      }
      this._pushSelection();
      this.onSelectionChange();
    }

    /** Retire la sélection courante par le même chemin qu'un second clic (appelé par le tag du contexte) */
    _clearSelection(): void {
      if (this._selectedKey === null && !this._selectedFieldValue) return;
      const previous = this._selectedRecord;
      this._setSelection(null, null);
      if (previous) this._emitSelect(previous, false);
      this._pushSelection();
      this.onSelectionChange();
    }

    private _setSelection(
      record: Record<string, unknown> | null,
      key: string | Record<string, unknown> | null
    ): void {
      this._selectedRecord = record;
      this._selectedKey = key;
      this._selectedFieldValue = typeof key === 'string' ? key : '';
    }

    private _emitSelect(record: Record<string, unknown>, selected: boolean): void {
      this.dispatchEvent(
        new CustomEvent(this.selectionEventName(), {
          bubbles: true,
          composed: true,
          detail: this.selectionEventDetail(record, selected),
        })
      );
    }

    /**
     * Diffuse la sélection courante : au contexte (qui traduit, porte l'URL et
     * le tag) ou, sans `context`, directement à `source` sous un whereKey
     * stable. Dédupliqué : une clause inchangée ne repart pas.
     */
    private _pushSelection(): void {
      if (!this._refineMode) return;
      if (this._context && this._contextFilter) {
        const where = this._contextFilter.buildColonWhere();
        if (where === this._lastPushedWhere) return;
        this._lastPushedWhere = where;
        this._context._applyFilter(this._contextFilter, where);
        return;
      }
      // Contexte demandé mais pas encore résolu : rien ne part en direct
      if (this._contextMode || !this.source) return;
      const field = this.selectionField;
      const colon = this._selectedFieldValue
        ? `${field}:eq:${escapeColonValue(this._selectedFieldValue)}`
        : '';
      if (colon === this._lastPushedWhere) return;
      this._lastPushedWhere = colon;
      const sourceEl = document.getElementById(this.source) as unknown as SourceElement | null;
      const whereFormat = sourceEl?.getAdapter?.()?.capabilities?.whereFormat;
      const where = colon && whereFormat === 'odsql' ? filterToOdsql(colon) : colon;
      dispatchSourceCommand(this.source, {
        where,
        whereKey: this._directWhereKey,
        origin: this.id,
      });
    }

    /**
     * Résout le contexte visé par `context="id"` et y enregistre le filtre.
     * Le contexte peut arriver plus tard (déclaré après dans la page) :
     * l'erreur de config est posée en attendant et levée à sa connexion.
     */
    protected _bindContext(): void {
      if (!this.isConnected || !this._contextMode) return;
      const context = findContextHostById(this.context);
      if (context && context === this._context) return;
      this._unbindContext();
      if (!context) {
        reportConfigError(
          this,
          this.tagName.toLowerCase(),
          `dsfr-data-context introuvable : "${this.context}"`
        );
        return;
      }
      clearConfigError(this);
      this._context = context;
      this._contextFilter = new SelectionContextFilter(this);
      context._registerFilter(this._contextFilter);

      // Valeur initiale depuis l'URL du contexte (#231, ADR-031) : elle devient
      // la sélection courante (sans élément : la donnée n'est pas encore là) et
      // repasse par le MÊME chemin qu'un clic — jamais injectée dans un where.
      const urlValues = context._urlValuesFor(this._contextFilter.field);
      if (urlValues && urlValues.length > 0 && !this._selectedFieldValue) {
        this._setSelection(null, urlValues[0]);
      }
      this._pushSelection();
      this.onSelectionChange();
    }

    /** Libère le filtre auprès du contexte (disconnect, changement de contexte) */
    protected _unbindContext(): void {
      if (this._context && this._contextFilter) {
        this._context._unregisterFilter(this._contextFilter);
      }
      this._context = null;
      this._contextFilter = null;
      this._lastPushedWhere = '';
    }

    /** Libère la clause du chemin dégradé poussée sur `source` (disconnect, changement de mode) */
    protected _releaseDirectSelection(): void {
      if (!this._lastPushedWhere || this._context || !this.source) return;
      this._lastPushedWhere = '';
      dispatchSourceCommand(this.source, {
        where: '',
        whereKey: this._directWhereKey,
        origin: this.id,
      });
    }

    // --- Cycle de vie ---

    connectedCallback() {
      super.connectedCallback();
      if (this._contextMode) {
        document.addEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
        // Bind différé d'un tick : dans un même fragment innerHTML, le contexte
        // déclaré après l'afficheur n'est pas encore upgradé
        queueMicrotask(() => this._bindContext());
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
      this._setSelection(null, null);
      this._releaseDirectSelection();
      this._unbindContext();
    }

    willUpdate(changed: Map<PropertyKey, unknown>) {
      super.willUpdate(changed);
      // Changement de contexte ou de champ à chaud : la sélection courante est
      // libérée sur l'ancien chemin, le nouveau est rejoint
      if ((changed.has('context') || changed.has('refineOnClick')) && this.hasUpdated) {
        // Sélection vidée AVANT le désenregistrement : le contexte relit
        // urlValue() du filtre en libérant sa clause (synchro d'URL)
        this._setSelection(null, null);
        this._releaseDirectSelection();
        this._unbindContext();
        document.removeEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
        if (this._contextMode) {
          document.addEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
          this._bindContext();
        } else {
          clearConfigError(this);
        }
      }
    }
  }

  return SelectionFilterElement as unknown as Constructor<SelectionFilterInterface> & T;
}
