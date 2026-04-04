import { LitElement, html, css, nothing, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { PipelineNode, AttributeControl, NodeCategory } from '../nodes/base-node.js';
import { ClassicPreset } from 'rete';

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  source: 'Source',
  transform: 'Transformation',
  interact: 'Interaction',
  display: 'Affichage',
  a11y: 'Accessibilite',
};

const CATEGORY_COLORS: Record<NodeCategory, string> = {
  source: '#000091',
  transform: '#6a6af4',
  interact: '#009081',
  display: '#e18b76',
  a11y: '#8585f6',
};

@customElement('pipeline-node-element')
export class PipelineNodeElement extends LitElement {
  @property({ type: Object }) data!: PipelineNode;
  @property({ type: Object }) emit!: (event: any) => void;

  static styles = css`
    :host {
      display: block;
      font-family: 'Marianne', system-ui, sans-serif;
    }

    .node {
      background: #fff;
      border: 2px solid #ddd;
      border-radius: 8px;
      min-width: 230px;
      max-width: 280px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      transition: box-shadow 0.15s ease;
    }

    .node:hover {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    }

    .header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border-radius: 6px 6px 0 0;
      color: #fff;
      font-weight: 700;
      font-size: 0.85rem;
      user-select: none;
    }

    .header .tag {
      margin-left: auto;
      font-size: 0.65rem;
      font-weight: 400;
      opacity: 0.8;
      background: rgba(255, 255, 255, 0.2);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
    }

    .body {
      padding: 0.5rem 0.75rem;
    }

    .description {
      font-size: 0.72rem;
      color: #666;
      margin-bottom: 0.4rem;
      line-height: 1.3;
    }

    .ports {
      display: flex;
      justify-content: space-between;
      padding: 0.3rem 0;
      border-top: 1px solid #eee;
    }

    .port-group {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .port {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.7rem;
      color: #666;
    }

    .port--output {
      flex-direction: row-reverse;
    }

    .field {
      margin: 0.3rem 0;
    }

    .field label {
      display: block;
      font-size: 0.68rem;
      font-weight: 600;
      color: #888;
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .field input,
    .field select {
      width: 100%;
      padding: 0.2rem 0.4rem;
      font-size: 0.78rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #f8f8f8;
      font-family: inherit;
      box-sizing: border-box;
    }

    .field input:focus,
    .field select:focus {
      outline: 2px solid #000091;
      outline-offset: -1px;
    }

    .component-tag {
      display: inline-block;
      font-size: 0.68rem;
      font-family: 'Courier New', monospace;
      color: #000091;
      background: #f0f0ff;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      margin-bottom: 0.3rem;
    }
  `;

  private _onFieldChange(attrName: string, e: Event) {
    e.stopPropagation();
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const ctrl = this.data.controls[attrName];
    if (ctrl instanceof AttributeControl) {
      ctrl.value =
        target.type === 'checkbox'
          ? (target as HTMLInputElement).checked
            ? 'true'
            : ''
          : target.value;
    }
  }

  private _stopPropagation(e: Event) {
    e.stopPropagation();
  }

  private _renderControl(name: string, ctrl: AttributeControl): TemplateResult {
    const def = ctrl.def;

    if (def.type === 'select' && def.options) {
      return html`
        <div class="field">
          <label>${def.label}</label>
          <select
            .value=${ctrl.value}
            @change=${(e: Event) => this._onFieldChange(name, e)}
            @pointerdown=${this._stopPropagation}
          >
            <option value="">--</option>
            ${def.options.map(
              (opt) => html`
                <option value=${opt.value} ?selected=${ctrl.value === opt.value}>
                  ${opt.label}
                </option>
              `
            )}
          </select>
        </div>
      `;
    }

    if (def.type === 'boolean') {
      return html`
        <div class="field" style="display:flex;align-items:center;gap:0.3rem">
          <input
            type="checkbox"
            ?checked=${ctrl.value === 'true'}
            @change=${(e: Event) => this._onFieldChange(name, e)}
            @pointerdown=${this._stopPropagation}
          />
          <label style="margin:0;text-transform:none;font-size:0.78rem">${def.label}</label>
        </div>
      `;
    }

    return html`
      <div class="field">
        <label>${def.label}</label>
        <input
          type=${def.type === 'number' ? 'number' : 'text'}
          .value=${ctrl.value}
          placeholder=${def.placeholder ?? ''}
          @input=${(e: Event) => this._onFieldChange(name, e)}
          @pointerdown=${this._stopPropagation}
          @dblclick=${this._stopPropagation}
        />
      </div>
    `;
  }

  render() {
    if (!this.data) return nothing;

    const node = this.data;
    const color = CATEGORY_COLORS[node.category];
    const catLabel = CATEGORY_LABELS[node.category];

    const inputs = Object.entries(node.inputs);
    const outputs = Object.entries(node.outputs);
    const controls = Object.entries(node.controls).filter(
      ([, c]) => c instanceof AttributeControl
    ) as [string, AttributeControl][];

    return html`
      <div class="node">
        <div class="header" style="background:${color}">
          <span>${node.label}</span>
          <span class="tag">${catLabel}</span>
        </div>
        <div class="body">
          <span class="component-tag">&lt;${node.component}&gt;</span>
          <div class="description">${node.description}</div>

          ${controls.map(([name, ctrl]) => this._renderControl(name, ctrl))}
          ${inputs.length > 0 || outputs.length > 0
            ? html`
                <div class="ports">
                  <div class="port-group">
                    ${inputs.map(
                      ([key, input]) => html`
                        <div class="port" data-testid="input-${key}">
                          <span
                            style="color:${(input as any).socket === this._commandSocket
                              ? '#009081'
                              : '#000091'}"
                            >&#9679;</span
                          >
                          <span>${(input as ClassicPreset.Input<any>).label ?? key}</span>
                        </div>
                      `
                    )}
                  </div>
                  <div class="port-group">
                    ${outputs.map(
                      ([key, output]) => html`
                        <div class="port port--output" data-testid="output-${key}">
                          <span
                            style="color:${(output as any).socket === this._commandSocket
                              ? '#009081'
                              : '#000091'}"
                            >&#9679;</span
                          >
                          <span>${(output as ClassicPreset.Output<any>).label ?? key}</span>
                        </div>
                      `
                    )}
                  </div>
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  /** Reference to CommandSocket for color coding — injected by sockets module */
  private get _commandSocket() {
    // Lazy import to avoid circular deps: check socket name
    const firstInput = Object.values(this.data.inputs)[0] as ClassicPreset.Input<any> | undefined;
    if (firstInput && (firstInput.socket as any)?.name === 'command') {
      return firstInput.socket;
    }
    return null;
  }
}
