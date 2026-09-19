/**
 * SPIKE #889 — élément JETABLE `<spike-repeat>` (rien pour `packages/`).
 *
 * Un répéteur minimal à trois modes de rendu, pour isoler la variable
 * « mode de rendu » de la variable « réconciliation » :
 *
 * - `mode="innerhtml"`   : la chaîne du gabarit est substituée par ligne et le
 *                          tout est réinjecté par `innerHTML` (ce que fait
 *                          `dsfr-data-display`, sans région ni compteur) ;
 * - `mode="clone"`       : chaque ligne est clonée depuis `template.content`
 *                          et interpolée nœud par nœud (renderer.ts) ; à
 *                          chaque émission tout est détruit et recréé ;
 * - `mode="clone-keyed"` : idem, mais une ligne dont la clé (`key-field`)
 *                          subsiste garde ses nœuds — les liaisons sont
 *                          ré-appliquées en place, l'ordre est rétabli par
 *                          déplacement, les clés absentes sont retirées.
 *
 * L'abonnement passe par `SourceSubscriberMixin` (jamais de
 * `subscribeToSource` manuel). Rendu TRANSPARENT : aucun rôle, aucun compteur.
 */
import { LitElement, nothing } from 'lit';
import { SourceSubscriberMixin } from '../../packages/core/src/utils/source-subscriber.ts';
import {
  renderRow,
  renderRowHtml,
  applyBindings,
  type Binding,
  type TemplateVars,
} from './renderer.ts';

interface KeyedRow {
  container: HTMLElement;
  bindings: Binding[];
}

export interface SpikeStats {
  /** Durée synchrone du dernier rendu, en ms (hors rehaussement différé). */
  lastRenderMs: number;
  /** Nombre de lignes créées au dernier rendu. */
  created: number;
  /** Nombre de lignes mises à jour en place au dernier rendu. */
  patched: number;
  /** Nombre d'écritures DOM (texte/attribut) au dernier patch. */
  writes: number;
  renders: number;
}

let instanceSeq = 0;

export class SpikeRepeat extends SourceSubscriberMixin(LitElement) {
  static properties = {
    source: { type: String },
    mode: { type: String },
    keyField: { type: String, attribute: 'key-field' },
    raw: { type: Boolean },
  };

  declare source: string;
  declare mode: 'innerhtml' | 'clone' | 'clone-keyed';
  declare keyField: string;
  declare raw: boolean;

  stats: SpikeStats = { lastRenderMs: 0, created: 0, patched: 0, writes: 0, renders: 0 };

  private _uid = `spike-repeat-${++instanceSeq}`;
  private _template: HTMLTemplateElement | null = null;
  private _rows: HTMLElement | null = null;
  private _keyed = new Map<string, KeyedRow>();

  constructor() {
    super();
    this.source = '';
    this.mode = 'clone';
    this.keyField = '';
    this.raw = false;
  }

  createRenderRoot() {
    return this;
  }

  render() {
    return nothing;
  }

  /** Lecture PARESSEUSE du gabarit (motif de map-popup, #894). */
  private _getTemplate(): HTMLTemplateElement | null {
    if (!this._template) {
      this._template = this.querySelector(':scope > template');
    }
    return this._template;
  }

  private _getRows(): HTMLElement {
    if (!this._rows) {
      this._rows = document.createElement('div');
      this._rows.className = 'spike-repeat__rows';
      this.appendChild(this._rows);
    }
    return this._rows;
  }

  private _vars(item: Record<string, unknown>, index: number, key: string): TemplateVars {
    return {
      $index: () => String(index),
      $key: () => key,
      $uid: () => `${this._uid}-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    };
  }

  private _keyOf(item: Record<string, unknown>, index: number): string {
    if (!this.keyField) return String(index);
    const v = item[this.keyField];
    return v === null || v === undefined || v === '' ? String(index) : String(v);
  }

  onSourceReset(): void {
    this._getRows().replaceChildren();
    this._keyed.clear();
  }

  onSourceData(data: unknown): void {
    const items = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    const tpl = this._getTemplate();
    if (!tpl) return;
    const rows = this._getRows();
    const origin = `spike-repeat${this.id ? `#${this.id}` : ''}`;
    const t0 = performance.now();
    this.stats.created = 0;
    this.stats.patched = 0;
    this.stats.writes = 0;

    if (this.mode === 'innerhtml') {
      const html = items
        .map((item, i) => {
          const key = this._keyOf(item, i);
          return `<div data-key="${key}">${renderRowHtml(tpl.innerHTML, item, this._vars(item, i, key), { raw: true, origin })}</div>`;
        })
        .join('');
      rows.innerHTML = html;
      this.stats.created = items.length;
    } else if (this.mode === 'clone') {
      const frag = document.createDocumentFragment();
      items.forEach((item, i) => {
        const key = this._keyOf(item, i);
        const container = document.createElement('div');
        container.dataset.key = key;
        const rendered = renderRow(tpl, item, this._vars(item, i, key), {
          raw: this.raw,
          origin,
          warnSplitBlocks: true,
        });
        container.appendChild(rendered.fragment);
        frag.appendChild(container);
      });
      // Une seule insertion : les custom elements sont rehaussés à la connexion,
      // avec leurs attributs déjà résolus.
      rows.replaceChildren(frag);
      this.stats.created = items.length;
    } else {
      // clone-keyed : réconciliation par clé, nœuds conservés.
      const seen = new Set<string>();
      let cursor: ChildNode | null = rows.firstChild;
      items.forEach((item, i) => {
        const key = this._keyOf(item, i);
        const vars = this._vars(item, i, key);
        let row = this._keyed.get(key);
        if (row && !seen.has(key)) {
          this.stats.writes += applyBindings(row.bindings, item, vars, { raw: this.raw, origin });
          this.stats.patched++;
        } else {
          const container = document.createElement('div');
          container.dataset.key = key;
          const rendered = renderRow(tpl, item, vars, {
            raw: this.raw,
            origin,
            warnSplitBlocks: true,
          });
          container.appendChild(rendered.fragment);
          row = { container, bindings: rendered.bindings };
          this._keyed.set(key, row);
          this.stats.created++;
        }
        seen.add(key);
        // Ordre du DOM = ordre des données : déplacement sans recréation.
        if (row.container !== cursor) {
          rows.insertBefore(row.container, cursor);
        } else {
          cursor = cursor.nextSibling;
        }
      });
      for (const [key, row] of this._keyed) {
        if (!seen.has(key)) {
          row.container.remove();
          this._keyed.delete(key);
        }
      }
    }

    this.stats.lastRenderMs = performance.now() - t0;
    this.stats.renders++;
    this.dispatchEvent(new CustomEvent('spike-rendered', { detail: { ...this.stats } }));
  }
}

if (!customElements.get('spike-repeat')) {
  customElements.define('spike-repeat', SpikeRepeat);
}
