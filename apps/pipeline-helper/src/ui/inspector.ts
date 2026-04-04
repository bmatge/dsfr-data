import { PipelineNode } from '../nodes/base-node.js';

/**
 * Populate the inspector panel with data from a selected node.
 */
export function showInspector(node: PipelineNode): void {
  const panel = document.getElementById('inspector');
  if (!panel) return;

  const result = node.statusControl.result;
  const attrs = node.getAttributes();

  // Build status HTML
  let statusHtml = '';
  if (result.status === 'idle') {
    statusHtml = '<span style="color:#888">Non execute</span>';
  } else if (result.status === 'loading') {
    statusHtml = '<span style="color:#000091">&#8987; Chargement...</span>';
  } else if (result.status === 'success') {
    statusHtml = `<span style="color:#18753c">&#9989; ${result.rowCount ?? 0} lignes &middot; ${result.fields?.length ?? 0} champs</span>`;
  } else if (result.status === 'error') {
    statusHtml = `<span style="color:#ce0500">&#10060; ${escapeHtml(result.message || 'Erreur')}</span>`;
  } else if (result.status === 'warning') {
    statusHtml = `<span style="color:#b34000">&#9888; ${escapeHtml(result.message || 'Attention')}</span>`;
  }

  // Build fields HTML
  let fieldsHtml = '';
  if (result.fields && result.fields.length > 0) {
    fieldsHtml = `
      <div class="inspector__fields">
        <h4>Champs disponibles (${result.fields.length})</h4>
        <div class="inspector__field-list">
          ${result.fields.map((f) => `<span class="inspector__field-tag">${escapeHtml(f)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // Build attributes HTML
  const attrEntries = Object.entries(attrs);
  let attrsHtml = '';
  if (attrEntries.length > 0) {
    attrsHtml = `
      <div class="inspector__attrs">
        <h4>Configuration</h4>
        ${attrEntries
          .map(
            ([k, v]) => `
          <div class="inspector__attr-row">
            <span class="inspector__attr-key">${escapeHtml(k)}</span>
            <span class="inspector__attr-val">${escapeHtml(v)}</span>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  // Build data table HTML
  let dataHtml = '';
  if (result.sampleData && result.sampleData.length > 0 && result.fields) {
    const fields = result.fields;
    const rows = result.sampleData;
    dataHtml = `
      <div class="inspector__data">
        <h4>Apercu des donnees (${rows.length} sur ${result.rowCount ?? '?'})</h4>
        <table class="inspector__table">
          <thead>
            <tr>${fields.map((f) => `<th title="${escapeHtml(f)}">${escapeHtml(f)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr>${fields.map((f) => `<td title="${escapeHtml(String(row[f] ?? ''))}">${escapeHtml(String(row[f] ?? ''))}</td>`).join('')}</tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (
    result.status === 'success' &&
    (!result.sampleData || result.sampleData.length === 0)
  ) {
    dataHtml = `
      <div class="inspector__data">
        <p style="color:#888;font-size:0.85rem">Aucune donnee a afficher.</p>
      </div>
    `;
  }

  panel.innerHTML = `
    <div class="inspector__header">
      <h3>${escapeHtml(node.label)}</h3>
      <span class="inspector__tag">&lt;${escapeHtml(node.component)}&gt;</span>
    </div>
    <div class="inspector__status">${statusHtml}</div>
    ${attrsHtml}
    ${fieldsHtml}
    ${dataHtml}
  `;

  // Subscribe to future updates so inspector stays in sync
  node.statusControl.onChange = () => showInspector(node);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
