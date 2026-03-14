/**
 * Manual table editor - DOM operations for the inline table in the manual source modal.
 */

import { looksLikeNumber, toNumber, toastWarning } from '@dsfr-data/shared';

// ============================================================
// Helpers
// ============================================================

export function getTableEditor(): HTMLTableElement | null {
  return document.getElementById('manual-table') as HTMLTableElement | null;
}

export function getColumnCount(): number {
  const table = getTableEditor();
  if (!table) return 0;
  const headerRow = table.querySelector('thead tr');
  if (!headerRow) return 0;
  // Exclude the first column (row number) and the last column (row actions)
  return headerRow.children.length - 2;
}

// ============================================================
// Column operations
// ============================================================

export function addTableColumn(): void {
  const table = getTableEditor();
  if (!table) return;

  const colCount = getColumnCount();
  const newColName = `Colonne ${colCount + 1}`;

  // Add header
  const headerRow = table.querySelector('thead tr');
  if (headerRow) {
    const th = document.createElement('th');
    th.innerHTML = `
      <input type="text" value="${newColName}" class="fr-input fr-input--sm" style="min-width: 80px;">
      <button class="remove-col-btn" onclick="(window as any).removeTableColumn(this)" title="Supprimer la colonne"
        style="position: absolute; top: -2px; right: -2px; background: var(--background-action-high-error); color: white; border: none; border-radius: 50%; width: 16px; height: 16px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
        x
      </button>`;
    th.style.position = 'relative';
    // Insert before the last th (row actions)
    const lastTh = headerRow.lastElementChild;
    headerRow.insertBefore(th, lastTh);
  }

  // Add cell to each data row
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach((row) => {
    const td = document.createElement('td');
    td.innerHTML = '<input type="text" class="fr-input fr-input--sm">';
    // Insert before the last td (row actions)
    const lastTd = row.lastElementChild;
    row.insertBefore(td, lastTd);
  });
}

export function removeTableColumn(btn: HTMLElement): void {
  if (getColumnCount() <= 1) {
    toastWarning('Il faut au moins une colonne.');
    return;
  }

  const th = btn.closest('th');
  if (!th) return;
  const table = getTableEditor();
  if (!table) return;

  const headerRow = th.parentElement;
  if (!headerRow) return;

  const colIndex = Array.from(headerRow.children).indexOf(th);

  // Remove header
  th.remove();

  // Remove cell from each data row
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach((row) => {
    const cells = row.children;
    if (cells[colIndex]) {
      cells[colIndex].remove();
    }
  });
}

// ============================================================
// Row operations
// ============================================================

export function addTableRow(): void {
  const table = getTableEditor();
  if (!table) return;

  const colCount = getColumnCount();
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const rowNum = tbody.rows.length + 1;
  const tr = document.createElement('tr');

  // Row number cell
  tr.innerHTML = `<td class="row-number" style="text-align: center; color: var(--text-mention-grey); font-size: 0.75rem;">${rowNum}</td>`;

  // Data cells
  for (let i = 0; i < colCount; i++) {
    const td = document.createElement('td');
    td.innerHTML = '<input type="text" class="fr-input fr-input--sm">';
    tr.appendChild(td);
  }

  // Actions cell
  const actionTd = document.createElement('td');
  actionTd.innerHTML = `<button onclick="(window as any).removeTableRow(this)" class="remove-row-btn" title="Supprimer"
    style="background: none; border: none; color: var(--text-mention-grey); cursor: pointer; font-size: 0.875rem;">
    <i class="ri-delete-bin-line"></i>
  </button>`;
  tr.appendChild(actionTd);

  tbody.appendChild(tr);
}

export function removeTableRow(btn: HTMLElement): void {
  const table = getTableEditor();
  if (!table) return;

  const tbody = table.querySelector('tbody');
  if (!tbody || tbody.rows.length <= 1) {
    toastWarning('Il faut au moins une ligne.');
    return;
  }

  const row = btn.closest('tr');
  if (row) row.remove();

  renumberRows();
}

export function renumberRows(): void {
  const table = getTableEditor();
  if (!table) return;

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach((row, index) => {
    const numCell = row.querySelector('.row-number');
    if (numCell) numCell.textContent = String(index + 1);
  });
}

// ============================================================
// Collect data from table
// ============================================================

export function collectTableData(): Record<string, unknown>[] {
  const table = getTableEditor();
  if (!table) return [];

  // Get column headers
  const headers: string[] = [];
  const headerInputs = table.querySelectorAll('thead tr th input');
  headerInputs.forEach((input) => {
    headers.push((input as HTMLInputElement).value.trim() || `Col${headers.length + 1}`);
  });

  // Get row data
  const data: Record<string, unknown>[] = [];
  const rows = table.querySelectorAll('tbody tr');

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    const record: Record<string, unknown> = {};
    let hasData = false;

    // Skip first cell (row number) and last cell (actions)
    for (let i = 1; i < cells.length - 1; i++) {
      const input = cells[i].querySelector('input') as HTMLInputElement | null;
      let val: unknown = input?.value.trim() ?? '';

      if (typeof val === 'string' && val !== '') {
        hasData = true;
        if (looksLikeNumber(val)) {
          const num = toNumber(val, true);
          if (num !== null) val = num;
        }
      }

      const headerIndex = i - 1;
      if (headerIndex < headers.length) {
        record[headers[headerIndex]] = val;
      }
    }

    if (hasData) {
      data.push(record);
    }
  });

  return data;
}

// ============================================================
// Reset table editor
// ============================================================

export function resetTableEditor(): void {
  const table = getTableEditor();
  if (!table) return;

  // Reset header
  const headerRow = table.querySelector('thead tr');
  if (headerRow) {
    headerRow.innerHTML = `
      <th style="width: 30px;">#</th>
      <th style="position: relative;">
        <input type="text" value="Colonne 1" class="fr-input fr-input--sm" style="min-width: 80px;">
        <button class="remove-col-btn" onclick="(window as any).removeTableColumn(this)" title="Supprimer la colonne"
          style="position: absolute; top: -2px; right: -2px; background: var(--background-action-high-error); color: white; border: none; border-radius: 50%; width: 16px; height: 16px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
          x
        </button>
      </th>
      <th style="position: relative;">
        <input type="text" value="Colonne 2" class="fr-input fr-input--sm" style="min-width: 80px;">
        <button class="remove-col-btn" onclick="(window as any).removeTableColumn(this)" title="Supprimer la colonne"
          style="position: absolute; top: -2px; right: -2px; background: var(--background-action-high-error); color: white; border: none; border-radius: 50%; width: 16px; height: 16px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
          x
        </button>
      </th>
      <th style="width: 30px;"></th>`;
  }

  // Reset body (3 empty rows)
  const tbody = table.querySelector('tbody');
  if (tbody) {
    tbody.innerHTML = '';
    for (let r = 1; r <= 3; r++) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="row-number" style="text-align: center; color: var(--text-mention-grey); font-size: 0.75rem;">${r}</td>
        <td><input type="text" class="fr-input fr-input--sm"></td>
        <td><input type="text" class="fr-input fr-input--sm"></td>
        <td>
          <button onclick="(window as any).removeTableRow(this)" class="remove-row-btn" title="Supprimer"
            style="background: none; border: none; color: var(--text-mention-grey); cursor: pointer; font-size: 0.875rem;">
            <i class="ri-delete-bin-line"></i>
          </button>
        </td>`;
      tbody.appendChild(tr);
    }
  }
}
