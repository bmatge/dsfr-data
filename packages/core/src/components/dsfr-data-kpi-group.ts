import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  parsePerRow,
  spanForPerRow,
  legacyConflictMessage,
  syncLayoutError,
} from '../utils/grid-layout.js';

/**
 * <dsfr-data-kpi-group> - Groupe de KPIs en grille responsive
 *
 * Dispose plusieurs <dsfr-data-kpi> enfants dans une grille CSS 12 colonnes.
 * `per-row` fixe le nombre de KPI par ligne ; un KPI peut préciser sa largeur
 * par `span` (1-12). `cols` et `col` restent acceptés, avec le même sens (#790).
 *
 * @example
 * <dsfr-data-kpi-group per-row="3">
 *   <dsfr-data-kpi source="src" value="population:sum" label="Population"></dsfr-data-kpi>
 *   <dsfr-data-kpi source="src" value="score:avg" label="Score moyen"></dsfr-data-kpi>
 *   <dsfr-data-kpi source="src" value="count" label="Nombre"></dsfr-data-kpi>
 * </dsfr-data-kpi-group>
 *
 * @example
 * <dsfr-data-kpi-group>
 *   <dsfr-data-kpi source="src" value="ca:sum" label="CA total" span="6"></dsfr-data-kpi>
 *   <dsfr-data-kpi source="src" value="marge:avg" label="Marge" span="3"></dsfr-data-kpi>
 *   <dsfr-data-kpi source="src" value="count" label="Transactions" span="3"></dsfr-data-kpi>
 * </dsfr-data-kpi-group>
 *
 * @slot - Les `<dsfr-data-kpi>` a disposer dans la grille DSFR 12 colonnes.
 * @cssprop [--dsfr-data-kpi-group-gap=1rem] - Gouttiere entre les KPI. Pilotee par l'attribut `gap` (sm/md/lg), surchargeable par la page.
 */
@customElement('dsfr-data-kpi-group')
export class DsfrDataKpiGroup extends LitElement {
  /**
   * Nombre de KPI par ligne par défaut (1-12). Chaque enfant occupe
   * Math.floor(12/cols) colonnes. Même rôle que `per-row`, qui est préféré :
   * `cols` désigne une LARGEUR sur `dsfr-data-facets` (#790). Toujours
   * accepté, avec le même sens.
   */
  @property({ type: Number })
  cols = 3;

  /**
   * Nombre de KPI par ligne à partir de 768 px (en dessous : un par ligne) —
   * 1, 2, 3, 4, 6 ou 12, les diviseurs de la grille. Remplace `cols`, même
   * sens (#790) ; prime sur `cols` s'ils sont posés ensemble. Un KPI qui porte
   * `span` (ou `col`) garde sa propre largeur.
   */
  @property({ type: String, attribute: 'per-row' })
  perRow = '';

  /** Erreur de colonnage posée par ce composant (#790). */
  private _layoutError: string | null = null;

  /** Largeur par défaut d'un enfant : `per-row` valide, sinon `cols`. */
  private _defaultSpan(): number {
    const perRow = parsePerRow(this.perRow, 12).value;
    if (perRow !== null) return spanForPerRow(perRow);
    return Math.max(1, Math.floor(12 / Math.max(1, Math.min(12, this.cols))));
  }

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

    :host([gap='sm']) {
      --dsfr-data-kpi-group-gap: 0.5rem;
    }
    :host([gap='md']) {
      --dsfr-data-kpi-group-gap: 1rem;
    }
    :host([gap='lg']) {
      --dsfr-data-kpi-group-gap: 1.5rem;
    }

    /* Per-KPI col overrides (1-12) */
    ::slotted([col='1']) {
      grid-column: span 1;
    }
    ::slotted([col='2']) {
      grid-column: span 2;
    }
    ::slotted([col='3']) {
      grid-column: span 3;
    }
    ::slotted([col='4']) {
      grid-column: span 4;
    }
    ::slotted([col='5']) {
      grid-column: span 5;
    }
    ::slotted([col='6']) {
      grid-column: span 6;
    }
    ::slotted([col='7']) {
      grid-column: span 7;
    }
    ::slotted([col='8']) {
      grid-column: span 8;
    }
    ::slotted([col='9']) {
      grid-column: span 9;
    }
    ::slotted([col='10']) {
      grid-column: span 10;
    }
    ::slotted([col='11']) {
      grid-column: span 11;
    }
    ::slotted([col='12']) {
      grid-column: span 12;
    }

    /* span (#790) : même grille que col, déclarée APRÈS pour primer
       à spécificité égale quand un KPI porte les deux. */
    ::slotted([span='1']) {
      grid-column: span 1;
    }
    ::slotted([span='2']) {
      grid-column: span 2;
    }
    ::slotted([span='3']) {
      grid-column: span 3;
    }
    ::slotted([span='4']) {
      grid-column: span 4;
    }
    ::slotted([span='5']) {
      grid-column: span 5;
    }
    ::slotted([span='6']) {
      grid-column: span 6;
    }
    ::slotted([span='7']) {
      grid-column: span 7;
    }
    ::slotted([span='8']) {
      grid-column: span 8;
    }
    ::slotted([span='9']) {
      grid-column: span 9;
    }
    ::slotted([span='10']) {
      grid-column: span 10;
    }
    ::slotted([span='11']) {
      grid-column: span 11;
    }
    ::slotted([span='12']) {
      grid-column: span 12;
    }

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
    if (changedProperties.has('cols') || changedProperties.has('perRow')) {
      this.style.setProperty('--_kpi-default-span', String(this._defaultSpan()));
      const perRow = parsePerRow(this.perRow, 12);
      const message =
        perRow.error ??
        (perRow.value !== null && this.hasAttribute('cols')
          ? legacyConflictMessage('cols', 'per-row')
          : null);
      this._layoutError = syncLayoutError(this, 'dsfr-data-kpi-group', message, this._layoutError);
    }
  }

  render() {
    const defaultSpan = this._defaultSpan();
    return html`
      <style>
        ::slotted(*:not([col]):not([span])) {
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
