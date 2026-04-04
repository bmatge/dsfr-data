import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { StatusControl, ExecutionResult } from '../nodes/base-node.js';

@customElement('status-control-element')
export class StatusControlElement extends LitElement {
  @property({ type: Object }) ctrl!: StatusControl;
  @state() private _result: ExecutionResult = { status: 'idle' };

  // Light DOM for Rete compatibility
  createRenderRoot() {
    return this;
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('ctrl') && this.ctrl) {
      this._result = this.ctrl.result;
      this.ctrl.onChange = () => {
        this._result = { ...this.ctrl.result };
        this.requestUpdate();
      };
    }
  }

  render() {
    const r = this._result;

    if (r.status === 'idle') {
      return nothing;
    }

    if (r.status === 'loading') {
      return html`
        <div class="exec-status exec-status--loading">
          <span class="exec-status__icon">&#8987;</span>
          Chargement...
        </div>
      `;
    }

    if (r.status === 'error') {
      return html`
        <div class="exec-status exec-status--error">
          <span class="exec-status__icon">&#10060;</span>
          <span class="exec-status__msg">${r.message || 'Erreur'}</span>
        </div>
      `;
    }

    if (r.status === 'warning') {
      return html`
        <div class="exec-status exec-status--warning">
          <span class="exec-status__icon">&#9888;</span>
          <span class="exec-status__msg">${r.message || 'Attention'}</span>
        </div>
      `;
    }

    // success
    return html`
      <div class="exec-status exec-status--success">
        <div class="exec-status__header">
          <span class="exec-status__icon">&#9989;</span>
          <span>${r.rowCount ?? '?'} lignes &middot; ${r.fields?.length ?? 0} champs</span>
        </div>
        ${r.fields && r.fields.length > 0 ? html`
          <div class="exec-status__fields">
            ${r.fields.map(f => html`<span class="exec-status__field">${f}</span>`)}
          </div>
        ` : nothing}
        ${r.sampleData && r.sampleData.length > 0 ? html`
          <details class="exec-status__sample">
            <summary>Apercu (${r.sampleData.length} lignes)</summary>
            <table class="exec-status__table">
              <thead>
                <tr>${r.fields?.slice(0, 5).map(f => html`<th>${f}</th>`)}</tr>
              </thead>
              <tbody>
                ${r.sampleData.slice(0, 3).map(row => html`
                  <tr>${r.fields?.slice(0, 5).map(f => html`<td>${String(row[f] ?? '')}</td>`)}</tr>
                `)}
              </tbody>
            </table>
          </details>
        ` : nothing}
      </div>
    `;
  }
}
