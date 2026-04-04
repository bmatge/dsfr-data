import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { loadFromStorage, STORAGE_KEYS } from '@dsfr-data/shared';
import type { Source } from '@dsfr-data/shared';
import { SavedSourceSelector } from '../nodes/base-node.js';
import { AttributeControl } from '../nodes/base-node.js';

@customElement('saved-source-control')
export class SavedSourceControlElement extends LitElement {
  @property({ type: Object }) ctrl!: SavedSourceSelector;
  @state() private _sources: Source[] = [];

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    this._loadSources();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('ctrl') && this.ctrl) {
      this.ctrl.onChange = () => this.requestUpdate();
    }
  }

  private _loadSources() {
    try {
      const raw = loadFromStorage(STORAGE_KEYS.SOURCES, []);
      this._sources = Array.isArray(raw) ? raw as Source[] : [];
    } catch {
      this._sources = [];
    }
  }

  private _onSelect(e: Event) {
    e.stopPropagation();
    const sourceId = (e.target as HTMLSelectElement).value;
    this.ctrl.value = sourceId;

    if (!sourceId) {
      // Manual mode — clear auto-filled values
      this.ctrl.onSourceSelected?.(null);
      return;
    }

    const source = this._sources.find(s => s.id === sourceId);
    if (source) {
      this.ctrl.onSourceSelected?.(source);
    }
  }

  private _stop(e: Event) { e.stopPropagation(); }

  render() {
    if (!this.ctrl) return nothing;

    return html`
      <div class="attr-field">
        <label class="attr-label" style="color:#000091;font-weight:700">Source enregistree</label>
        <select class="attr-input" style="border-color:#000091"
          .value=${this.ctrl.value}
          @change=${this._onSelect}
          @pointerdown=${this._stop}
        >
          <option value="">-- Configuration manuelle --</option>
          ${this._sources.map(s => html`
            <option value=${s.id} ?selected=${this.ctrl.value === s.id}>
              ${s.name} (${s.provider || s.type})
            </option>
          `)}
        </select>
      </div>
      ${this.ctrl.value ? html`
        <div style="font-size:0.7rem;color:#000091;margin:2px 0 4px;padding:2px 6px;background:#f0f0ff;border-radius:3px">
          Source connectee : ${this._sources.find(s => s.id === this.ctrl.value)?.name ?? this.ctrl.value}
        </div>
      ` : nothing}
    `;
  }
}
