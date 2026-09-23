import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { AggregateControl } from '../nodes/base-node.js';

const AGG_FUNCTIONS = [
  { value: 'sum', label: 'Somme' },
  { value: 'avg', label: 'Moyenne' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Compte' },
];

@customElement('aggregate-control-element')
export class AggregateControlElement extends LitElement {
  @property({ type: Object }) ctrl!: AggregateControl;

  createRenderRoot() {
    return this;
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('ctrl') && this.ctrl) {
      this.ctrl.onChange = () => this.requestUpdate();
    }
  }

  private _stop(e: Event) {
    e.stopPropagation();
  }

  private _onFieldChange(index: number, e: Event) {
    e.stopPropagation();
    this.ctrl.rows[index].field = (e.target as HTMLSelectElement).value;
    // Auto-generate alias from field + fn
    const row = this.ctrl.rows[index];
    if (row.field && !row.alias) {
      row.alias = row.fn === 'count' ? 'count' : `${row.field}_${row.fn}`;
    }
    this.ctrl.onChange?.();
    this.requestUpdate();
  }

  private _onFnChange(index: number, e: Event) {
    e.stopPropagation();
    this.ctrl.rows[index].fn = (e.target as HTMLSelectElement).value;
    // Update alias
    const row = this.ctrl.rows[index];
    if (row.field) {
      row.alias = row.fn === 'count' ? 'count' : `${row.field}_${row.fn}`;
    }
    this.ctrl.onChange?.();
    this.requestUpdate();
  }

  private _onAliasChange(index: number, e: Event) {
    e.stopPropagation();
    this.ctrl.rows[index].alias = (e.target as HTMLInputElement).value;
    this.ctrl.onChange?.();
  }

  private _addRow(e: Event) {
    e.stopPropagation();
    this.ctrl.addRow();
  }

  private _removeRow(index: number, e: Event) {
    e.stopPropagation();
    this.ctrl.removeRow(index);
  }

  render() {
    if (!this.ctrl) return nothing;

    const fields = this.ctrl.availableFields;
    const hasFields = fields.length > 0;

    return html`
      <div class="agg-control">
        <label class="attr-label">Agrégations</label>
        ${this.ctrl.rows.map(
          (row, i) => html`
            <div class="agg-row">
              ${
                hasFields
                  ? html`
                      <select
                        class="agg-field"
                        aria-label="Champ agrégé"
                        data-repere="pipeline.query.agregat-champ"
                        data-attribut="dsfr-data-query:aggregate"
                        data-prerequis="noeud-query"
                        .value=${row.field}
                        @change=${(e: Event) => this._onFieldChange(i, e)}
                        @pointerdown=${this._stop}
                      >
                        <option value="">Champ...</option>
                        ${fields.map(
                          (f) => html`<option value=${f} ?selected=${row.field === f}>${f}</option>`
                        )}
                      </select>
                    `
                  : html`
                      <input
                        class="agg-field"
                        type="text"
                        aria-label="Champ agrégé"
                        data-repere="pipeline.query.agregat-champ-saisi"
                        data-attribut="dsfr-data-query:aggregate"
                        data-prerequis="noeud-query"
                        .value=${row.field}
                        placeholder="champ"
                        @input=${(e: Event) => {
                          e.stopPropagation();
                          row.field = (e.target as HTMLInputElement).value;
                          this.ctrl.onChange?.();
                        }}
                        @pointerdown=${this._stop}
                        @dblclick=${this._stop}
                      />
                    `
              }
              <select
                class="agg-fn"
                aria-label="Fonction d'agrégation"
                data-repere="pipeline.query.agregat-fonction"
                data-attribut="dsfr-data-query:aggregate"
                data-prerequis="noeud-query"
                .value=${row.fn}
                @change=${(e: Event) => this._onFnChange(i, e)}
                @pointerdown=${this._stop}
              >
                ${AGG_FUNCTIONS.map(
                  (f) =>
                    html`<option value=${f.value} ?selected=${row.fn === f.value}>
                      ${f.label}
                    </option>`
                )}
              </select>
              <input
                class="agg-alias"
                type="text"
                aria-label="Alias de l'agrégat"
                data-repere="pipeline.query.agregat-alias"
                data-attribut="dsfr-data-query:aggregate"
                data-prerequis="noeud-query"
                .value=${row.alias}
                placeholder="alias"
                @input=${(e: Event) => this._onAliasChange(i, e)}
                @pointerdown=${this._stop}
                @dblclick=${this._stop}
              />
              ${
                this.ctrl.rows.length > 1
                  ? html`
                      <button
                        class="agg-remove"
                        data-repere="pipeline.query.agregat-retirer"
                        data-repere-libelle="Retirer l'agrégat"
                        data-prerequis="noeud-query"
                        @click=${(e: Event) => this._removeRow(i, e)}
                        @pointerdown=${this._stop}
                        title="Supprimer"
                      >
                        &#10005;
                      </button>
                    `
                  : nothing
              }
            </div>
          `
        )}
        <button
          class="agg-add"
          data-repere="pipeline.query.agregat-ajouter"
          data-repere-libelle="Ajouter un agrégat"
          data-prerequis="noeud-query"
          @click=${this._addRow}
          @pointerdown=${this._stop}
        >
          + Ajouter un champ
        </button>
      </div>
    `;
  }
}
