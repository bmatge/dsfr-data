import { html } from 'lit';

/**
 * Feuille de style de `<dsfr-data-list>` (#838).
 *
 * Elle vivait en clair dans `render()`, dont elle faisait les deux tiers.
 * Rendue telle quelle — meme balise `<style>`, meme contenu, meme position
 * dans le gabarit : aucune regle n'est ajoutee, retiree ni reordonnee.
 *
 * Le composant rend en LIGHT DOM (pas de shadow root) : ces regles portent
 * donc sur le document, comme avant.
 */
export const listStyles = html`
  <style>
    .dsfr-data-list__filters {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .dsfr-data-list__filters .fr-select-group {
      margin-bottom: 0;
    }
    .dsfr-data-list__toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    .dsfr-data-list__toolbar .fr-search-bar {
      flex: 1;
      min-width: 200px;
      max-width: 400px;
    }
    @media (max-width: 576px) {
      .dsfr-data-list__filters {
        grid-template-columns: 1fr;
      }
      .dsfr-data-list__toolbar {
        flex-direction: column;
        align-items: stretch;
      }
      .dsfr-data-list__toolbar .fr-search-bar {
        max-width: none;
      }
    }
    .dsfr-data-list__export-buttons {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .dsfr-data-list__sort-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-weight: 700;
      font-size: inherit;
      font-family: inherit;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .dsfr-data-list__sort-btn:hover {
      text-decoration: underline;
    }
    .dsfr-data-list__loading,
    .dsfr-data-list__error {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 2rem;
      color: var(--text-mention-grey, #666);
      font-size: 0.875rem;
    }
    .dsfr-data-list__error {
      color: var(--text-default-error, #ce0500);
    }
    .dsfr-data-list__empty {
      text-align: center;
      color: var(--text-mention-grey);
      padding: 2rem !important;
    }
    .dsfr-data-list__page-position {
      color: var(--text-mention-grey, #666);
    }
    .dsfr-data-list__ellipsis {
      cursor: default;
    }
    .dsfr-data-list__select-head,
    .dsfr-data-list__select-cell {
      width: 3rem;
      text-align: center;
    }
    .dsfr-data-list__select-btn {
      background: none;
      border: 1px solid var(--border-default-grey, #ddd);
      border-radius: 0.25rem;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      color: var(--text-action-high-blue-france, #000091);
      font-family: inherit;
    }
    .dsfr-data-list__select-btn[aria-pressed='true'] {
      background-color: var(--background-action-high-blue-france, #000091);
      color: var(--text-inverted-blue-france, #fff);
      border-color: var(--background-action-high-blue-france, #000091);
    }
    .dsfr-data-list__row--selected > td {
      background-color: var(--background-alt-blue-france, #f5f5fe);
      font-weight: 700;
    }
    .dsfr-data-list__row--selected > td:first-child {
      box-shadow: inset 0.25rem 0 0 0 var(--border-active-blue-france, #000091);
    }
  </style>
`;
