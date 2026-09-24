/**
 * Dashboard app - Widget configuration modal
 */

import { escapeHtml } from '@dsfr-data/shared';
import {
  state,
  oneOf,
  isBuilderChart,
  KPI_FORMATS,
  CHART_TYPES,
  CHART_PALETTES,
  TEXT_STYLES,
} from './state.js';
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
      <label for="config-title">Titre du widget</label>
      <input type="text" id="config-title" data-repere="dashboard.widget.titre" value="${escapeHtml(widget.title)}">
    </div>
  `;

  switch (widget.type) {
    case 'kpi':
      return (
        commonFields +
        `
        <div data-zone="dashboard.widget.kpi" data-prerequis="widget-kpi" role="group" aria-label="Réglages du KPI">
        <div class="config-group">
          <label for="config-value">Valeur
            <span class="fr-hint-text">Un nombre ou un calcul : sum:population, avg:budget, count:*</span>
          </label>
          <input type="text" id="config-value" data-repere="dashboard.widget.kpi.valeur" data-prerequis="widget-kpi" data-attribut="dsfr-data-kpi:valeur" value="${escapeHtml(widget.config.value || '')}">
        </div>
        <div class="config-group">
          <label for="config-label">Label
            <span class="fr-hint-text">Texte affiché sous la valeur (ex : Population totale)</span>
          </label>
          <input type="text" id="config-label" data-repere="dashboard.widget.kpi.libelle" data-prerequis="widget-kpi" data-attribut="dsfr-data-kpi:label" value="${escapeHtml(widget.config.label || '')}">
        </div>
        <div class="config-group">
          <label for="config-format">Format</label>
          <select id="config-format" data-repere="dashboard.widget.kpi.format" data-prerequis="widget-kpi" data-attribut="dsfr-data-kpi:format">
            <option value="nombre" ${widget.config.format === 'nombre' ? 'selected' : ''}>Nombre</option>
            <option value="pourcentage" ${widget.config.format === 'pourcentage' ? 'selected' : ''}>Pourcentage</option>
            <option value="euro" ${widget.config.format === 'euro' ? 'selected' : ''}>Euro</option>
            <option value="texte" ${widget.config.format === 'texte' ? 'selected' : ''}>Texte</option>
          </select>
        </div>
        <div class="config-group">
          <label for="config-icon">Icône
            <span class="fr-hint-text">Nom Remix Icon (ex : ri-money-euro-circle-line). <a href="https://remixicon.com/" target="_blank" rel="noopener">Catalogue</a></span>
          </label>
          <input type="text" id="config-icon" data-repere="dashboard.widget.kpi.icone" data-prerequis="widget-kpi" data-attribut="dsfr-data-kpi:icone" value="${escapeHtml(widget.config.icon || '')}">
        </div>
        </div>
      `
      );

    case 'chart': {
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
      if (isBuilderChart(widget.config)) {
        return (
          commonFields +
          `
          <div class="fr-callout">
            <p class="fr-callout__text">
              Ce graphique a été produit par l'assistant : sa configuration complète
              s'édite dans le Studio IA.
            </p>
          </div>
        `
        );
      }
      return (
        commonFields +
        `
        <div data-zone="dashboard.widget.graphique" data-prerequis="widget-graphique" role="group" aria-label="Réglages du graphique">
        <div class="config-group">
          <label for="config-type">Type de graphique</label>
          <select id="config-type" data-repere="dashboard.widget.graphique.type" data-prerequis="widget-graphique" data-attribut="dsfr-data-chart:type">
            <option value="bar" ${widget.config.type === 'bar' ? 'selected' : ''}>Barres</option>
            <option value="line" ${widget.config.type === 'line' ? 'selected' : ''}>Ligne</option>
            <option value="pie" ${widget.config.type === 'pie' ? 'selected' : ''}>Camembert</option>
            <option value="radar" ${widget.config.type === 'radar' ? 'selected' : ''}>Radar</option>
          </select>
        </div>
        <div class="config-group">
          <label for="config-labelField">Champ pour les étiquettes (axe X)
            <span class="fr-hint-text">Ex : region, annee, catégorie</span>
          </label>
          <input type="text" id="config-labelField" data-repere="dashboard.widget.graphique.champ-x" data-prerequis="widget-graphique" data-attribut="dsfr-data-chart:label-field" value="${escapeHtml(widget.config.labelField || '')}">
        </div>
        <div class="config-group">
          <label for="config-valueField">Champ pour les valeurs (axe Y)
            <span class="fr-hint-text">Ex : population, budget, score</span>
          </label>
          <input type="text" id="config-valueField" data-repere="dashboard.widget.graphique.champ-y" data-prerequis="widget-graphique" data-attribut="dsfr-data-chart:value-field" value="${escapeHtml(widget.config.valueField || '')}">
        </div>
        <div class="config-group">
          <label for="config-palette">Palette de couleurs</label>
          <select id="config-palette" data-repere="dashboard.widget.graphique.palette" data-prerequis="widget-graphique" data-attribut="dsfr-data-chart:selected-palette">
            <option value="categorical" ${widget.config.palette === 'categorical' ? 'selected' : ''}>Catégorielle</option>
            <option value="sequentialAscending" ${widget.config.palette === 'sequentialAscending' ? 'selected' : ''}>Séquentielle</option>
            <option value="divergent" ${widget.config.palette === 'divergent' ? 'selected' : ''}>Divergente</option>
          </select>
        </div>
        </div>
      `
      );
    }

    case 'table':
      return (
        commonFields +
        `
        <div data-zone="dashboard.widget.tableau" data-prerequis="widget-tableau" role="group" aria-label="Réglages du tableau">
        <div class="config-group">
          <label for="config-columns">Colonnes
            <span class="fr-hint-text">Noms des champs à afficher, séparés par des virgules (ex : nom, ville, budget)</span>
          </label>
          <input type="text" id="config-columns" data-repere="dashboard.widget.tableau.colonnes" data-prerequis="widget-tableau" data-attribut="dsfr-data-list:colonnes" value="${escapeHtml((widget.config.columns || []).join(', '))}">
        </div>
        <div class="config-group">
          <label>
            <input type="checkbox" id="config-searchable" data-repere="dashboard.widget.tableau.recherche" data-prerequis="widget-tableau" data-attribut="dsfr-data-list:recherche" ${widget.config.searchable ? 'checked' : ''}>
            Recherche activée
          </label>
        </div>
        <div class="config-group">
          <label>
            <input type="checkbox" id="config-sortable" data-repere="dashboard.widget.tableau.tri" data-prerequis="widget-tableau" data-attribut="dsfr-data-list:tri" ${widget.config.sortable ? 'checked' : ''}>
            Tri activé
          </label>
        </div>
        </div>
      `
      );

    case 'text':
      return (
        commonFields +
        `
        <div data-zone="dashboard.widget.texte" data-prerequis="widget-texte" role="group" aria-label="Réglages du texte">
        <div class="config-group">
          <label for="config-content">Contenu HTML</label>
          <textarea id="config-content" data-repere="dashboard.widget.texte.contenu" data-prerequis="widget-texte">${escapeHtml(widget.config.content || '')}</textarea>
        </div>
        <div class="config-group">
          <label for="config-style">Style</label>
          <select id="config-style" data-repere="dashboard.widget.texte.style" data-prerequis="widget-texte">
            <option value="paragraph" ${widget.config.style === 'paragraph' ? 'selected' : ''}>Paragraphe</option>
            <option value="title" ${widget.config.style === 'title' ? 'selected' : ''}>Titre</option>
            <option value="callout" ${widget.config.style === 'callout' ? 'selected' : ''}>Callout</option>
          </select>
        </div>
        </div>
      `
      );

    case 'component': {
      // Lecture seule (#1111) : la validation des balises, attributs et valeurs
      // contre le manifeste vit dans le Studio IA. Un formulaire ici devrait la
      // dupliquer, ou laisser passer ce que le Studio refuse.
      const lignes = widget.config.components
        .map((c) => {
          const attrs = c.attributes
            .map((a) => (a.value === '' ? a.name : `${a.name}="${a.value}"`))
            .join(' ');
          return `<li><code>${escapeHtml(`<${c.tag}${attrs ? ` ${attrs}` : ''}>`)}</code></li>`;
        })
        .join('');
      return (
        commonFields +
        `
        <div class="fr-callout">
          <p class="fr-callout__text">
            Ce bloc « composant libre » a été produit par le Studio IA, qui en valide
            chaque composant et chaque attribut : il s'affiche ici en lecture seule et
            se modifie dans le Studio IA.
          </p>
        </div>
        <ul class="config-component-list">${lignes}</ul>
      `
      );
    }

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
      widget.config.value =
        (document.getElementById('config-value') as HTMLInputElement)?.value || '';
      widget.config.label =
        (document.getElementById('config-label') as HTMLInputElement)?.value || '';
      // Un <select> rend une `string` : on la ramene a l'union, meme helper
      // que la normalisation du stockage.
      widget.config.format = oneOf(
        (document.getElementById('config-format') as HTMLSelectElement)?.value,
        KPI_FORMATS,
        'nombre'
      );
      widget.config.icon =
        (document.getElementById('config-icon') as HTMLInputElement)?.value || '';
      break;

    case 'chart':
      if (!widget.config.fromFavorite && !isBuilderChart(widget.config)) {
        widget.config.type = oneOf(
          (document.getElementById('config-type') as HTMLSelectElement)?.value,
          CHART_TYPES,
          'bar'
        );
        widget.config.labelField =
          (document.getElementById('config-labelField') as HTMLInputElement)?.value || '';
        widget.config.valueField =
          (document.getElementById('config-valueField') as HTMLInputElement)?.value || '';
        widget.config.palette = oneOf(
          (document.getElementById('config-palette') as HTMLSelectElement)?.value,
          CHART_PALETTES,
          'categorical'
        );
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
      widget.config.style = oneOf(
        (document.getElementById('config-style') as HTMLSelectElement)?.value,
        TEXT_STYLES,
        'paragraph'
      );
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
