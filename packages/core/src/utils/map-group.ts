/**
 * Regroupement des lignes d'une couche de carte (`group-field`, #1108).
 *
 * Données au format LONG — une ligne par couple ville × aide, coordonnées
 * répétées : la couche trace UN élément par valeur distincte du champ de
 * regroupement, et la popup / le volet / la modale reçoivent TOUTES les lignes
 * du groupe. Ce module ne fait que le rendu HTML du corps : un tableau (une
 * ligne par enregistrement) ou une liste (un gabarit appliqué par ligne).
 *
 * SÉCURITÉ : toute valeur venue des données passe par `escapeHtml`, en-têtes
 * compris — même politique que `_buildAutoTable` de dsfr-data-map-popup et
 * `_buildPopupTable` de dsfr-data-map-layer. Les éléments d'une liste sont
 * produits par un rendu qui échappe déjà (gabarit du compagnon, ou
 * `popup-template` de la couche) : ils ne sont pas rééchappés.
 */
import { escapeHtml } from '@dsfr-data/shared/lib';
import { getByPath } from './json-path.js';

/** Un groupe : la valeur de `group-field` et ses lignes, dans l'ordre reçu. */
export interface MapGroup {
  value: string;
  records: Record<string, unknown>[];
}

/**
 * Nombre maximal de lignes rendues dans le corps d'un groupe : au-delà, une
 * mention « … et N autres » dit ce qui n'est pas montré. Un volet de 5 000
 * lignes ne se lit pas et fige la page.
 */
export const GROUP_ROWS_MAX = 200;

/** Mention des lignes non montrées, vide quand tout tient. */
function autresHtml(total: number): string {
  const reste = total - GROUP_ROWS_MAX;
  if (reste <= 0) return '';
  return `<p class="dsfr-data-map__group-more fr-text--sm fr-mt-1w fr-mb-0">… et ${reste.toLocaleString('fr-FR')} autres</p>`;
}

/**
 * Colonnes par défaut du tableau d'un groupe, quand ni `popup-fields` ni
 * gabarit ne sont posés : les colonnes scalaires du premier enregistrement,
 * hors géométrie et hors champ de regroupement (déjà en titre).
 */
export function defaultGroupFields(
  records: Record<string, unknown>[],
  groupField: string
): string[] {
  const first = records[0] ?? {};
  return Object.keys(first).filter(
    (k) =>
      k !== groupField &&
      !k.startsWith('geo') &&
      k !== 'latitude' &&
      k !== 'longitude' &&
      typeof first[k] !== 'object'
  );
}

/** Tableau d'un groupe : une colonne par champ, une ligne par enregistrement. */
export function groupTableHtml(records: Record<string, unknown>[], fields: string[]): string {
  const head = fields.map((f) => `<th scope="col">${escapeHtml(f)}</th>`).join('');
  const rows = records.slice(0, GROUP_ROWS_MAX).map((record) => {
    const cells = fields.map((f) => {
      const value = getByPath(record, f);
      return `<td>${value === undefined || value === null ? '' : escapeHtml(String(value))}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  });
  return (
    `<table class="fr-table fr-table--sm dsfr-data-map__group-table">` +
    `<thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>` +
    autresHtml(records.length)
  );
}

/**
 * Liste d'un groupe : `renderRow` (qui ÉCHAPPE la donnée) appliqué à chaque
 * enregistrement, un élément de liste par ligne.
 */
export function groupListHtml(
  records: Record<string, unknown>[],
  renderRow: (record: Record<string, unknown>) => string
): string {
  const items = records.slice(0, GROUP_ROWS_MAX).map((r) => `<li>${renderRow(r)}</li>`);
  return (
    `<ul class="dsfr-data-map__group-list">${items.join('')}</ul>` + autresHtml(records.length)
  );
}
