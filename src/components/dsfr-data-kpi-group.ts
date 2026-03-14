import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { sendWidgetBeacon } from '../utils/beacon.js';

/**
 * <dsfr-data-kpi-group> - Groupe de KPIs en grille responsive
 *
 * Dispose plusieurs <dsfr-data-kpi> enfants dans une grille CSS 12 colonnes.
 * Chaque KPI peut specifier sa largeur via l'attribut `col` (1-12).
 *
 * @example
 * <dsfr-data-kpi-group cols="3">
 *   <dsfr-data-kpi source="src" valeur="sum:population" label="Population"></dsfr-data-kpi>
 *   <dsfr-data-kpi source="src" valeur="avg:score" label="Score moyen"></dsfr-data-kpi>
 *   <dsfr-data-kpi source="src" valeur="count" label="Nombre"></dsfr-data-kpi>
 * </dsfr-data-kpi-group>
 *
 * @example
 * <dsfr-data-kpi-group>
 *   <dsfr-data-kpi source="src" valeur="sum:ca" label="CA total" col="6"></dsfr-data-kpi>
 *   <dsfr-data-kpi source="src" valeur="avg:marge" label="Marge" col="3"></dsfr-data-kpi>
 *   <dsfr-data-kpi source="src" valeur="count" label="Transactions" col="3"></dsfr-data-kpi>
 * </dsfr-data-kpi-group>
 */
@customElement('dsfr-data-kpi-group')
export class DsfrDataKpiGroup extends LitElement {
  /** Nombre de colonnes par defaut (1-12). Chaque enfant occupe Math.floor(12/cols) colonnes. */
  @property({ type: Number })
  cols = 3;

  /** Espacement entre KPIs : sm (0.5rem), md (1rem), lg (1.5rem) */
  @property({ type: String })
  gap: 'sm' | 'md' | 'lg' = 'md';

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-kpi-group');
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'group');
    }
  }

  static styles = css`
    :host {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: var(--dsfr-data-kpi-group-gap, 1rem);
    }

    :host([gap="sm"]) { --dsfr-data-kpi-group-gap: 0.5rem; }
    :host([gap="md"]) { --dsfr-data-kpi-group-gap: 1rem; }
    :host([gap="lg"]) { --dsfr-data-kpi-group-gap: 1.5rem; }

    /* Per-KPI col overrides (1-12) */
    ::slotted([col="1"])  { grid-column: span 1; }
    ::slotted([col="2"])  { grid-column: span 2; }
    ::slotted([col="3"])  { grid-column: span 3; }
    ::slotted([col="4"])  { grid-column: span 4; }
    ::slotted([col="5"])  { grid-column: span 5; }
    ::slotted([col="6"])  { grid-column: span 6; }
    ::slotted([col="7"])  { grid-column: span 7; }
    ::slotted([col="8"])  { grid-column: span 8; }
    ::slotted([col="9"])  { grid-column: span 9; }
    ::slotted([col="10"]) { grid-column: span 10; }
    ::slotted([col="11"]) { grid-column: span 11; }
    ::slotted([col="12"]) { grid-column: span 12; }

    /* Responsive: stack on mobile */
    @media (max-width: 767px) {
      :host {
        grid-template-columns: 1fr;
      }
      ::slotted(*) {
        grid-column: span 1 !important;
      }
    }
  `;

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('cols')) {
      const cols = Math.max(1, Math.min(12, this.cols));
      const defaultSpan = Math.max(1, Math.floor(12 / cols));
      this.style.setProperty('--_kpi-default-span', String(defaultSpan));
    }
  }

  render() {
    const defaultSpan = Math.max(1, Math.floor(12 / Math.max(1, Math.min(12, this.cols))));
    return html`
      <style>
        ::slotted(*:not([col])) {
          grid-column: span ${defaultSpan};
        }
      </style>
      <slot></slot>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-kpi-group': DsfrDataKpiGroup;
  }
}
