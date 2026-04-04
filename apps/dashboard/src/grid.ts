/**
 * Dashboard app - Grid management (per-row column control)
 */

import { confirmDialog } from '@dsfr-data/shared';
import { state, getRowColumns, setRowColumns, removeRowFromLayout } from './state.js';
import { initDropZones } from './drag-drop.js';
import { renderWidget } from './widgets.js';
import { updateGeneratedCode } from './code-generator.js';

function colClassFor(columns: number): string {
  const colSize = Math.floor(12 / columns);
  return colSize === 12 ? 'fr-col-12' : `fr-col-12 fr-col-md-${colSize}`;
}

function buildRowControls(rowIdx: number, columns: number, totalRows: number): string {
  return `
    <div class="row-controls" data-row="${rowIdx}">
      <span class="row-label">Ligne ${rowIdx + 1}</span>
      <div class="row-controls-actions">
        <button class="row-control-btn" onclick="removeColumnFromRow(${rowIdx})"
                title="Retirer une cellule" ${columns <= 1 ? 'disabled' : ''}>
          <i class="ri-subtract-line"></i>
        </button>
        <span class="row-columns-count">${columns}</span>
        <button class="row-control-btn" onclick="addColumnToRow(${rowIdx})"
                title="Ajouter une cellule" ${columns >= 4 ? 'disabled' : ''}>
          <i class="ri-add-line"></i>
        </button>
        <button class="row-control-btn row-control-btn--danger" onclick="deleteRow(${rowIdx})"
                title="Supprimer la ligne" ${totalRows <= 1 ? 'disabled' : ''}>
          <i class="ri-delete-bin-line"></i>
        </button>
      </div>
    </div>
  `;
}

export function addRow(): void {
  const grid = document.getElementById('dashboard-grid');
  if (!grid) return;

  const rowIndex = grid.querySelectorAll('.dashboard-row').length;
  const defaultColumns = parseInt(
    (document.getElementById('grid-columns') as HTMLSelectElement)?.value || '2'
  );

  setRowColumns(state.dashboard, rowIndex, defaultColumns);

  const cc = colClassFor(defaultColumns);
  const row = document.createElement('div');
  row.className = `fr-grid-row ${state.dashboard.layout.gap} dashboard-row`;
  row.dataset.row = String(rowIndex);

  // Insert row controls
  const totalRows = rowIndex + 1;
  const tmp = document.createElement('div');
  tmp.innerHTML = buildRowControls(rowIndex, defaultColumns, totalRows);
  row.appendChild(tmp.firstElementChild!);

  for (let i = 0; i < defaultColumns; i++) {
    const colDiv = document.createElement('div');
    colDiv.className = cc;
    colDiv.innerHTML = `
      <div class="drop-cell empty" data-row="${rowIndex}" data-col="${i}">
        <div class="drop-cell-placeholder">
          <i class="ri-add-circle-line"></i>
          <span>Glisser un widget ici</span>
        </div>
      </div>
    `;
    row.appendChild(colDiv);
  }

  grid.appendChild(row);
  initDropZones();
}

export function resetGrid(): void {
  const grid = document.getElementById('dashboard-grid');
  if (!grid) return;

  const columns = parseInt(
    (document.getElementById('grid-columns') as HTMLSelectElement)?.value || '2'
  );

  state.dashboard.layout.rowColumns = { 0: columns };

  const cc = colClassFor(columns);

  grid.innerHTML = `
    <div class="fr-grid-row ${state.dashboard.layout.gap} dashboard-row" data-row="0">
      ${buildRowControls(0, columns, 1)}
      ${Array(columns)
        .fill(0)
        .map(
          (_, i) => `
        <div class="${cc}">
          <div class="drop-cell empty" data-row="0" data-col="${i}">
            <div class="drop-cell-placeholder">
              <i class="ri-add-circle-line"></i>
              <span>Glisser un widget ici</span>
            </div>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;

  initDropZones();
}

export function rebuildGrid(): void {
  const grid = document.getElementById('dashboard-grid');
  if (!grid) return;

  // Determine max row from widgets and rowColumns
  let maxRow = state.dashboard.widgets.reduce((max, w) => Math.max(max, w.position.row), -1);
  if (state.dashboard.layout.rowColumns) {
    for (const key of Object.keys(state.dashboard.layout.rowColumns)) {
      maxRow = Math.max(maxRow, Number(key));
    }
  }

  // Always show at least one row
  if (maxRow < 0) {
    const defaultColumns = state.dashboard.layout.columns || 2;
    setRowColumns(state.dashboard, 0, defaultColumns);
    maxRow = 0;
  }

  grid.innerHTML = '';

  for (let rowIdx = 0; rowIdx <= maxRow; rowIdx++) {
    const columns = getRowColumns(state.dashboard, rowIdx);
    const cc = colClassFor(columns);

    const row = document.createElement('div');
    row.className = `fr-grid-row ${state.dashboard.layout.gap} dashboard-row`;
    row.dataset.row = String(rowIdx);

    // Row controls
    const tmp = document.createElement('div');
    tmp.innerHTML = buildRowControls(rowIdx, columns, maxRow + 1);
    row.appendChild(tmp.firstElementChild!);

    for (let colIdx = 0; colIdx < columns; colIdx++) {
      const widget = state.dashboard.widgets.find(
        (w) => w.position.row === rowIdx && w.position.col === colIdx
      );
      const colDiv = document.createElement('div');
      colDiv.className = cc;

      const cell = document.createElement('div');
      cell.className = 'drop-cell';
      cell.dataset.row = String(rowIdx);
      cell.dataset.col = String(colIdx);

      if (widget) {
        renderWidget(widget, cell);
      } else {
        cell.classList.add('empty');
        cell.innerHTML = `
          <div class="drop-cell-placeholder">
            <i class="ri-add-circle-line"></i>
            <span>Glisser un widget ici</span>
          </div>
        `;
      }

      colDiv.appendChild(cell);
      row.appendChild(colDiv);
    }

    grid.appendChild(row);
  }

  initDropZones();
}

export function addColumnToRow(rowIndex: number): void {
  const current = getRowColumns(state.dashboard, rowIndex);
  if (current >= 4) return;
  setRowColumns(state.dashboard, rowIndex, current + 1);
  rebuildGrid();
  updateGeneratedCode();
}

export async function removeColumnFromRow(rowIndex: number): Promise<void> {
  const current = getRowColumns(state.dashboard, rowIndex);
  if (current <= 1) return;

  const widgetsInLastCol = state.dashboard.widgets.filter(
    (w) => w.position.row === rowIndex && w.position.col === current - 1
  );

  if (widgetsInLastCol.length > 0) {
    if (!(await confirmDialog('Cette cellule contient un widget. Le supprimer ?'))) return;
    state.dashboard.widgets = state.dashboard.widgets.filter(
      (w) => !(w.position.row === rowIndex && w.position.col === current - 1)
    );
  }

  setRowColumns(state.dashboard, rowIndex, current - 1);
  rebuildGrid();
  updateGeneratedCode();
}

export async function deleteRow(rowIndex: number): Promise<void> {
  // Count total rows
  const grid = document.getElementById('dashboard-grid');
  const totalRows = grid?.querySelectorAll('.dashboard-row').length ?? 0;
  if (totalRows <= 1) return;

  const widgetsInRow = state.dashboard.widgets.filter((w) => w.position.row === rowIndex);

  if (widgetsInRow.length > 0) {
    if (
      !(await confirmDialog(`Cette ligne contient ${widgetsInRow.length} widget(s). Supprimer ?`))
    )
      return;
  }

  // Remove widgets in the row
  state.dashboard.widgets = state.dashboard.widgets.filter((w) => w.position.row !== rowIndex);

  // Re-index widget positions for rows above the deleted one
  state.dashboard.widgets.forEach((w) => {
    if (w.position.row > rowIndex) {
      w.position.row -= 1;
    }
  });

  // Re-index rowColumns
  removeRowFromLayout(state.dashboard, rowIndex);

  rebuildGrid();
  updateGeneratedCode();
}
