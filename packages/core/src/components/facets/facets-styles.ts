import { html } from 'lit';

/**
 * Feuille de style de `<dsfr-data-facets>` (#838).
 *
 * Elle vivait en clair dans `render()`, dont elle faisait la moitié. Rendue
 * telle quelle — mêmes règles, même ordre, même position dans le gabarit :
 * aucune n'est ajoutée, retirée ni réordonnée.
 *
 * Le composant rend en LIGHT DOM (pas de shadow root) : ces règles portent
 * donc sur le document, comme avant.
 */
export const facetsStyles = html`
  <style>
    .dsfr-data-facets {
      margin-bottom: 1.5rem;
    }
    .dsfr-data-facets__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    .dsfr-data-facets__groups {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 1.5rem;
    }
    .dsfr-data-facets__group {
      min-width: 0;
    }
    .dsfr-data-facets__count {
      font-weight: 400;
      font-size: 0.75rem;
      color: var(--text-mention-grey, #666);
      margin-left: 0.25rem;
    }
    .dsfr-data-facets .fr-radio-group .fr-label,
    .dsfr-data-facets .fr-checkbox-group .fr-label {
      flex-wrap: nowrap;
    }
    .dsfr-data-facets__multiselect {
      position: relative;
    }
    .dsfr-data-facets__multiselect-trigger {
      width: 100%;
      text-align: left;
      cursor: pointer;
      appearance: none;
    }
    .dsfr-data-facets__multiselect-trigger[aria-expanded='true']::after {
      transform: rotate(180deg);
    }
    .dsfr-data-facets__multiselect-panel {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 1000;
      background: var(--background-default-grey, #fff);
      border: 1px solid var(--border-default-grey, #ddd);
      border-radius: 0 0 0.25rem 0.25rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-height: 320px;
      overflow-y: auto;
      padding: 0.75rem;
    }
    .dsfr-data-facets__multiselect-panel .fr-search-bar {
      margin-bottom: 0.75rem;
    }
    .dsfr-data-facets__dropdown-fieldset {
      margin: 0;
      padding: 0;
      border: none;
    }
    .dsfr-data-facets__dropdown-fieldset .fr-fieldset__element {
      padding: 0;
    }
    .dsfr-data-facets__multiselect-toggle {
      width: 100%;
      margin-bottom: 0.75rem;
    }
    @media (max-width: 576px) {
      .dsfr-data-facets__groups {
        grid-template-columns: 1fr;
      }
    }
  </style>
`;
