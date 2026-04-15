/**
 * Dashboard app - Widget management
 */

import { navigateTo, confirmDialog } from '@dsfr-data/shared';
import { state } from './state.js';
import { openConfigModal } from './widget-config.js';
import { updateGeneratedCode } from './code-generator.js';
import type { Widget, WidgetType } from './state.js';

export function addWidget(type: WidgetType, row: number, col: number, cell: HTMLElement): void {
  const widget: Widget = {
    id: crypto.randomUUID(),
    type,
    title: getDefaultTitle(type),
    position: { row, col },
    config: getDefaultConfig(type),
  };

  state.dashboard.widgets.push(widget);
  renderWidget(widget, cell);
  openConfigModal(widget);
  updateGeneratedCode();
}

export function addWidgetFromFavorite(
  favorite: any,
  row: number,
  col: number,
  cell: HTMLElement
): void {
  const widget: Widget = {
    id: crypto.randomUUID(),
    type: 'chart',
    title: favorite.name,
    position: { row, col },
    config: {
      fromFavorite: true,
      favoriteId: favorite.id,
      code: favorite.code,
      builderState: favorite.builderState,
    },
  };

  state.dashboard.widgets.push(widget);
  renderWidget(widget, cell);
  updateGeneratedCode();
}

export function getDefaultTitle(type: WidgetType): string {
  const titles: Record<WidgetType, string> = {
    kpi: 'Indicateur',
    chart: 'Graphique',
    table: 'Tableau de donnees',
    text: 'Texte',
  };
  return titles[type] || 'Widget';
}

export function getDefaultConfig(type: WidgetType): Record<string, any> {
  switch (type) {
    case 'kpi':
      return { valeur: '', format: 'nombre', icone: '', label: 'Mon KPI' };
    case 'chart':
      return { chartType: 'bar', labelField: '', valueField: '', palette: 'categorical' };
    case 'table':
      return { columns: [], searchable: true, sortable: true };
    case 'text':
      return { content: '<p>Votre texte ici...</p>', style: 'paragraph' };
    default:
      return {};
  }
}

function makeActionBtn(iconClass: string, title: string, handler: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'widget-action-btn';
  btn.title = title;
  btn.type = 'button';
  const i = document.createElement('i');
  i.className = iconClass;
  btn.append(i);
  btn.addEventListener('click', handler);
  return btn;
}

export function renderWidget(widget: Widget, cell: HTMLElement): void {
  cell.classList.remove('empty');
  cell.replaceChildren();

  const container = document.createElement('div');
  container.className = 'dashboard-widget';
  container.dataset.widgetId = widget.id;

  const header = document.createElement('div');
  header.className = 'widget-header';
  const title = document.createElement('h4');
  title.className = 'widget-title';
  const titleIcon = document.createElement('i');
  titleIcon.className = getWidgetIcon(widget.type);
  title.append(titleIcon, ' ', document.createTextNode(widget.title));

  const actions = document.createElement('div');
  actions.className = 'widget-actions';
  actions.append(makeActionBtn('ri-file-copy-line', 'Dupliquer', () => duplicateWidget(widget.id)));
  if (widget.config.fromFavorite) {
    actions.append(
      makeActionBtn('ri-edit-line', 'Editer dans le Builder', () => openInBuilder(widget.id))
    );
  }
  actions.append(makeActionBtn('ri-settings-3-line', 'Configurer', () => editWidget(widget.id)));
  actions.append(
    makeActionBtn('ri-delete-bin-line', 'Supprimer', () => void deleteWidget(widget.id))
  );

  header.append(title, actions);

  const content = document.createElement('div');
  content.className = 'widget-content';
  appendWidgetContent(content, widget);

  container.append(header, content);
  cell.append(container);
}

function appendWidgetContent(parent: HTMLElement, widget: Widget): void {
  switch (widget.type) {
    case 'kpi': {
      const wrap = document.createElement('div');
      wrap.className = 'widget-preview-center';
      const valueEl = document.createElement('div');
      valueEl.className = 'widget-kpi-value';
      valueEl.textContent = String(widget.config.valeur || '\u2014');
      const labelEl = document.createElement('div');
      labelEl.className = 'widget-kpi-label';
      labelEl.textContent = String(widget.config.label || '');
      wrap.append(valueEl, labelEl);
      parent.append(wrap);
      return;
    }
    case 'chart': {
      const wrap = document.createElement('div');
      wrap.className = 'widget-preview-center widget-preview-muted';
      const icon = document.createElement('i');
      icon.className = 'ri-bar-chart-box-line widget-preview-icon';
      const text = document.createElement('p');
      text.className = 'widget-preview-text';
      text.textContent = widget.config.fromFavorite
        ? 'Graphique depuis favoris'
        : 'Configurez le graphique';
      wrap.append(icon, text);
      parent.append(wrap);
      return;
    }
    case 'table': {
      const wrap = document.createElement('div');
      wrap.className = 'widget-preview-center widget-preview-muted';
      const icon = document.createElement('i');
      icon.className = 'ri-table-line widget-preview-icon';
      const text = document.createElement('p');
      text.className = 'widget-preview-text';
      text.textContent = 'Tableau de donnees';
      wrap.append(icon, text);
      parent.append(wrap);
      return;
    }
    case 'text': {
      const wrap = document.createElement('div');
      wrap.className = 'widget-text-content';
      // Text widgets are authored by the dashboard owner (authenticated user),
      // not by arbitrary visitors. The content is intentionally rendered as
      // rich HTML (formatted paragraphs, links, headings). Sanitize via
      // DOMParser to strip <script> and inline event handlers — trust the
      // author's structure, not unknown scripts.
      sanitizeAndAppend(wrap, String(widget.config.content || ''));
      parent.append(wrap);
      return;
    }
    default: {
      const wrap = document.createElement('div');
      wrap.textContent = 'Widget';
      parent.append(wrap);
    }
  }
}

/**
 * Parse an HTML fragment, strip any <script> elements and on* event
 * attributes, then append the surviving nodes to `parent`. Used for text
 * widgets whose content is authored by the dashboard owner.
 */
function sanitizeAndAppend(parent: HTMLElement, html: string): void {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll('script').forEach((s) => s.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    }
  });
  parent.append(...Array.from(doc.body.childNodes));
}

export function getWidgetIcon(type: WidgetType): string {
  const icons: Record<WidgetType, string> = {
    kpi: 'ri-number-1',
    chart: 'ri-bar-chart-box-line',
    table: 'ri-table-line',
    text: 'ri-text',
  };
  return icons[type] || 'ri-question-line';
}

export function editWidget(widgetId: string): void {
  const widget = state.dashboard.widgets.find((w) => w.id === widgetId);
  if (widget) {
    openConfigModal(widget);
  }
}

export async function deleteWidget(widgetId: string): Promise<void> {
  if (!(await confirmDialog('Supprimer ce widget ?'))) return;

  const index = state.dashboard.widgets.findIndex((w) => w.id === widgetId);
  if (index > -1) {
    const widget = state.dashboard.widgets[index];
    state.dashboard.widgets.splice(index, 1);

    const cell = document.querySelector(
      `.drop-cell[data-row="${widget.position.row}"][data-col="${widget.position.col}"]`
    ) as HTMLElement | null;
    if (cell) {
      cell.classList.add('empty');
      cell.innerHTML = `
        <div class="drop-cell-placeholder">
          <i class="ri-add-circle-line"></i>
          <span>Glisser un widget ici</span>
        </div>
      `;
    }

    updateGeneratedCode();
  }
}

export function openInBuilder(widgetId: string): void {
  const widget = state.dashboard.widgets.find((w) => w.id === widgetId);
  if (!widget?.config.builderState) return;
  sessionStorage.setItem('builder-state', JSON.stringify(widget.config.builderState));
  navigateTo('builder', { from: 'dashboard' });
}

export function duplicateWidget(widgetId: string): void {
  const widget = state.dashboard.widgets.find((w) => w.id === widgetId);
  if (!widget) return;

  // Find next empty cell
  const grid = document.getElementById('dashboard-grid');
  const emptyCell = grid?.querySelector('.drop-cell.empty') as HTMLElement | null;
  if (!emptyCell) {
    return;
  }

  const newWidget: Widget = {
    id: crypto.randomUUID(),
    type: widget.type,
    title: widget.title + ' (copie)',
    position: {
      row: parseInt(emptyCell.dataset.row || '0'),
      col: parseInt(emptyCell.dataset.col || '0'),
    },
    config: JSON.parse(JSON.stringify(widget.config)),
  };

  state.dashboard.widgets.push(newWidget);
  renderWidget(newWidget, emptyCell);
  updateGeneratedCode();
}
