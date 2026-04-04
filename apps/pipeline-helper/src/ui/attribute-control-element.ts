import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { AttributeControl } from '../nodes/base-node.js';

/**
 * Renders an AttributeControl as a form field inside a Rete node.
 * Uses Light DOM so Rete's event system works correctly.
 */
@customElement('attribute-control-element')
export class AttributeControlElement extends LitElement {
  @property({ type: Object }) ctrl!: AttributeControl;

  // Light DOM — required for Rete pointer event handling
  createRenderRoot() {
    return this;
  }

  // Register onChange whenever ctrl property changes (not in connectedCallback
  // because Lit sets properties AFTER the element is connected to the DOM)
  updated(changed: Map<string, unknown>) {
    if (changed.has('ctrl') && this.ctrl) {
      this.ctrl.onChange = () => this.requestUpdate();
    }
  }

  private _onChange(e: Event) {
    e.stopPropagation();
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (this.ctrl) {
      this.ctrl.value = target.type === 'checkbox'
        ? (target as HTMLInputElement).checked ? 'true' : ''
        : target.value;
    }
  }

  private _stop(e: Event) {
    e.stopPropagation();
  }

  render() {
    if (!this.ctrl) return nothing;
    const def = this.ctrl.def;

    if (def.type === 'select' && def.options) {
      return html`
        <div class="attr-field">
          <label class="attr-label">${def.label}</label>
          <select class="attr-input"
            .value=${this.ctrl.value}
            @change=${this._onChange}
            @pointerdown=${this._stop}
          >
            <option value="">--</option>
            ${def.options.map(opt => html`
              <option value=${opt.value} ?selected=${this.ctrl.value === opt.value}>${opt.label}</option>
            `)}
          </select>
        </div>
      `;
    }

    if (def.type === 'boolean') {
      return html`
        <div class="attr-field attr-field--check">
          <input type="checkbox"
            ?checked=${this.ctrl.value === 'true'}
            @change=${this._onChange}
            @pointerdown=${this._stop}
          >
          <label class="attr-label attr-label--inline">${def.label}</label>
        </div>
      `;
    }

    return html`
      <div class="attr-field">
        <label class="attr-label">${def.label}</label>
        <input class="attr-input"
          type=${def.type === 'number' ? 'number' : 'text'}
          .value=${this.ctrl.value}
          placeholder=${def.placeholder ?? ''}
          @input=${this._onChange}
          @pointerdown=${this._stop}
          @dblclick=${this._stop}
        >
      </div>
    `;
  }
}
