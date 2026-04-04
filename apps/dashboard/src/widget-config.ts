/**
 * Dashboard app - Widget configuration modal
 */

import { escapeHtml } from '@dsfr-data/shared';
import { state } from './state.js';
import { renderWidget } from './widgets.js';
import { updateGeneratedCode } from './code-generator.js';
import type { Widget } from './state.js';

export function openConfigModal(widget: Widget): void {
  state.selectedWidget = widget;
  const modal = document.getElementById('config-modal');
  const title = document.getElementById('config-modal-title');
  const body = document.getElementById('config-modal-body');

  if (title) title.textContent = `Configurer: ${widget.title}`;
  if (body) body.innerHTML = getConfigForm(widget);
  if (modal) modal.classList.add('active');
}

export function closeConfigModal(): void {
  document.getElementById('config-modal')?.classList.remove('active');
  state.selectedWidget = null;
}

function getConfigForm(widget: Widget): string {
  const commonFields = `
    <div class="config-group">
      <label>Titre du widget</label>
      <input type="text" id="config-title" value="${escapeHtml(widget.title)}">
    </div>
  `;

  switch (widget.type) {
    case 'kpi':
      return (
        commonFields +
        `
        <div class="config-group">
          <label>Valeur
            <span class="fr-hint-text">Un nombre ou un calcul : sum:population, avg:budget, count:*</span>
          </label>
          <input type="text" id="config-valeur" value="${escapeHtml(widget.config.valeur || '')}">
        </div>
        <div class="config-group">
          <label>Label
            <span class="fr-hint-text">Texte affiche sous la valeur (ex : Population totale)</span>
          </label>
          <input type="text" id="config-label" value="${escapeHtml(widget.config.label || '')}">
        </div>
        <div class="config-group">
          <label>Format</label>
          <select id="config-format">
            <option value="nombre" ${widget.config.format === 'nombre' ? 'selected' : ''}>Nombre</option>
            <option value="pourcentage" ${widget.config.format === 'pourcentage' ? 'selected' : ''}>Pourcentage</option>
            <option value="euro" ${widget.config.format === 'euro' ? 'selected' : ''}>Euro</option>
            <option value="texte" ${widget.config.format === 'texte' ? 'selected' : ''}>Texte</option>
          </select>
        </div>
        <div class="config-group">
          <label>Icone
            <span class="fr-hint-text">Nom Remix Icon (ex : ri-money-euro-circle-line). <a href="https://remixicon.com/" target="_blank" rel="noopener">Catalogue</a></span>
          </label>
          <input type="text" id="config-icone" value="${escapeHtml(widget.config.icone || '')}">
        </div>
      `
      );

    case 'chart':
      if (widget.config.fromFavorite) {
        return (
          commonFields +
          `
          <div class="fr-callout fr-callout--green-emeraude">
            <p class="fr-callout__text">
              Ce graphique provient de vos favoris et utilise sa configuration d'origine.
            </p>
          </div>
        `
        );
      }
      return (
        commonFields +
        `
        <div class="config-group">
          <label>Type de graphique</label>
          <select id="config-chartType">
            <option value="bar" ${widget.config.chartType === 'bar' ? 'selected' : ''}>Barres</option>
            <option value="line" ${widget.config.chartType === 'line' ? 'selected' : ''}>Ligne</option>
            <option value="pie" ${widget.config.chartType === 'pie' ? 'selected' : ''}>Camembert</option>
            <option value="radar" ${widget.config.chartType === 'radar' ? 'selected' : ''}>Radar</option>
          </select>
        </div>
        <div class="config-group">
          <label>Champ pour les etiquettes (axe X)
            <span class="fr-hint-text">Ex : region, annee, categorie</span>
          </label>
          <input type="text" id="config-labelField" value="${escapeHtml(widget.config.labelField || '')}">
        </div>
        <div class="config-group">
          <label>Champ pour les valeurs (axe Y)
            <span class="fr-hint-text">Ex : population, budget, score</span>
          </label>
          <input type="text" id="config-valueField" value="${escapeHtml(widget.config.valueField || '')}">
        </div>
        <div class="config-group">
          <label>Palette de couleurs</label>
          <select id="config-palette">
            <option value="categorical" ${widget.config.palette === 'categorical' ? 'selected' : ''}>Categorielle</option>
            <option value="sequentialAscending" ${widget.config.palette === 'sequentialAscending' ? 'selected' : ''}>Sequentielle</option>
            <option value="divergent" ${widget.config.palette === 'divergent' ? 'selected' : ''}>Divergente</option>
          </select>
        </div>
      `
      );

    case 'table':
      return (
        commonFields +
        `
        <div class="config-group">
          <label>Colonnes
            <span class="fr-hint-text">Noms des champs a afficher, separes par des virgules (ex : nom, ville, budget)</span>
          </label>
          <input type="text" id="config-columns" value="${(widget.config.columns || []).join(', ')}">
        </div>
        <div class="config-group">
          <label>
            <input type="checkbox" id="config-searchable" ${widget.config.searchable ? 'checked' : ''}>
            Recherche activee
          </label>
        </div>
        <div class="config-group">
          <label>
            <input type="checkbox" id="config-sortable" ${widget.config.sortable ? 'checked' : ''}>
            Tri active
          </label>
        </div>
      `
      );

    case 'text':
      return (
        commonFields +
        `
        <div class="config-group">
          <label>Contenu HTML</label>
          <textarea id="config-content">${escapeHtml(widget.config.content || '')}</textarea>
        </div>
        <div class="config-group">
          <label>Style</label>
          <select id="config-style">
            <option value="paragraph" ${widget.config.style === 'paragraph' ? 'selected' : ''}>Paragraphe</option>
            <option value="title" ${widget.config.style === 'title' ? 'selected' : ''}>Titre</option>
            <option value="callout" ${widget.config.style === 'callout' ? 'selected' : ''}>Callout</option>
          </select>
        </div>
      `
      );

    default:
      return commonFields;
  }
}

export function applyConfig(): void {
  if (!state.selectedWidget) return;

  const widget = state.selectedWidget;

  widget.title =
    (document.getElementById('config-title') as HTMLInputElement)?.value || widget.title;

  switch (widget.type) {
    case 'kpi':
      widget.config.valeur =
        (document.getElementById('config-valeur') as HTMLInputElement)?.value || '';
      widget.config.label =
        (document.getElementById('config-label') as HTMLInputElement)?.value || '';
      widget.config.format =
        (document.getElementById('config-format') as HTMLSelectElement)?.value || 'nombre';
      widget.config.icone =
        (document.getElementById('config-icone') as HTMLInputElement)?.value || '';
      break;

    case 'chart':
      if (!widget.config.fromFavorite) {
        widget.config.chartType =
          (document.getElementById('config-chartType') as HTMLSelectElement)?.value || 'bar';
        widget.config.labelField =
          (document.getElementById('config-labelField') as HTMLInputElement)?.value || '';
        widget.config.valueField =
          (document.getElementById('config-valueField') as HTMLInputElement)?.value || '';
        widget.config.palette =
          (document.getElementById('config-palette') as HTMLSelectElement)?.value || 'categorical';
      }
      break;

    case 'table': {
      const columnsStr =
        (document.getElementById('config-columns') as HTMLInputElement)?.value || '';
      widget.config.columns = columnsStr
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c);
      widget.config.searchable =
        (document.getElementById('config-searchable') as HTMLInputElement)?.checked ?? true;
      widget.config.sortable =
        (document.getElementById('config-sortable') as HTMLInputElement)?.checked ?? true;
      break;
    }

    case 'text':
      widget.config.content =
        (document.getElementById('config-content') as HTMLTextAreaElement)?.value || '';
      widget.config.style =
        (document.getElementById('config-style') as HTMLSelectElement)?.value || 'paragraph';
      break;
  }

  const cell = document.querySelector(
    `.drop-cell[data-row="${widget.position.row}"][data-col="${widget.position.col}"]`
  ) as HTMLElement | null;
  if (cell) {
    renderWidget(widget, cell);
  }

  closeConfigModal();
  updateGeneratedCode();
}
