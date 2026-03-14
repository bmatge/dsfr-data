/**
 * CSV parsing: parse lines, detect separators, handle file uploads.
 */

import { escapeHtml, toNumber, looksLikeNumber } from '@dsfr-data/shared';
import { setParsedCsvData } from '../state.js';

// ============================================================
// Pure CSV line parser
// ============================================================

/**
 * Parse a single CSV line into an array of string values,
 * handling quoted fields and escaped quotes.
 */
export function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

// ============================================================
// Parse CSV text into records
// ============================================================

/**
 * Parse full CSV text into an array of record objects.
 * Updates the DOM preview and sets parsedCsvData in state.
 */
export function parseCsvText(text: string): void {
  const separatorSelect = (document.getElementById('csv-separator') as HTMLSelectElement | null)
    ?.value ?? 'auto';
  let separator = separatorSelect;

  // Auto-detect separator
  if (separator === 'auto') {
    const firstLine = text.split('\n')[0];
    if (firstLine.includes(';')) separator = ';';
    else if (firstLine.includes('\t')) separator = '\t';
    else separator = ',';
  }

  const lines = text.trim().split('\n');
  if (lines.length === 0) {
    setParsedCsvData(null);
    return;
  }

  // Parse header
  const headers = parseCSVLine(lines[0], separator);

  // Parse data rows
  const data: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], separator);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      let val: unknown = values[index] || '';
      // Auto-detect numbers (handles FR and EN formats)
      if (typeof val === 'string' && looksLikeNumber(val)) {
        const num = toNumber(val, true);
        if (num !== null) {
          val = num;
        }
      }
      row[header] = val;
    });
    data.push(row);
  }

  setParsedCsvData(data);

  // Show preview
  const preview = document.getElementById('csv-preview');
  const countSpan = document.getElementById('csv-preview-count');
  const table = document.getElementById('csv-preview-table');

  if (countSpan) countSpan.textContent = String(data.length);
  if (preview) preview.style.display = 'block';

  if (table) {
    // Header
    let headerHtml = '';
    headers.forEach((h) => {
      headerHtml += `<th>${escapeHtml(h)}</th>`;
    });
    const thead = table.querySelector('thead tr');
    if (thead) thead.innerHTML = headerHtml;

    // Body (first 5 rows)
    let bodyHtml = '';
    data.slice(0, 5).forEach((row) => {
      bodyHtml += '<tr>';
      headers.forEach((h) => {
        bodyHtml += `<td>${escapeHtml(String(row[h] ?? ''))}</td>`;
      });
      bodyHtml += '</tr>';
    });
    if (data.length > 5) {
      bodyHtml += `<tr><td colspan="${headers.length}" style="text-align: center; color: var(--text-mention-grey);">... et ${data.length - 5} autres lignes</td></tr>`;
    }
    const tbody = table.querySelector('tbody');
    if (tbody) tbody.innerHTML = bodyHtml;
  }
}

// ============================================================
// Handle CSV file input
// ============================================================

export function handleCsvFile(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e: ProgressEvent<FileReader>) {
    const text = e.target?.result;
    if (typeof text === 'string') {
      parseCsvText(text);
    }
  };
  reader.readAsText(file);
}
