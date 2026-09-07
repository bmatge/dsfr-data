/**
 * Apercu de l'Assistant IA — **l'apercu EST l'export** (#609).
 *
 * Cette app dessinait son apercu avec `@gouvfr/dsfr-chart` en direct, dans un
 * `chart-renderer.ts` de 580 lignes qui ne creait AUCUN composant dsfr-data,
 * pendant qu'elle generait du code dsfr-data a cote. L'apercu pouvait donc
 * diverger du code copie, silencieusement — et c'est arrive : le podium
 * levait une exception (#617) parce que le renderer ne le connaissait pas,
 * alors que le generateur l'emettait parfaitement.
 *
 * Le Studio a tranche cette question avant nous
 * (`apps/studio/src/ui/preview.ts`) : *« l'apercu EST l'export […] Aucun
 * rendu parallele a maintenir. »* On applique la meme doctrine, avec le
 * patron du Playground et du Builder — `getPreviewHTML` sur le code
 * REELLEMENT genere, dans une `<iframe srcdoc>`.
 *
 * Ce qui reste ici est l'AGREGATION : elle n'a jamais servi au rendu seul,
 * c'est elle qui alimente `generateCode`. Tout le dessin disparait.
 *
 * Invariants tenus (voir docs/ARCHITECTURE.md §3.6/3.7) :
 *   - `debug: true` sur l'appel qui alimente la `srcdoc`, et LUI SEUL : sans
 *     le tampon precoce, le collecteur du volet Diagnostic arrive apres que
 *     tout a emis et perd les erreurs ;
 *   - `#generated-code` reste la sortie BRUTE — c'est la source unique de
 *     « Copier le code », des favoris et du passage au Playground. Une sonde
 *     de diagnostic ne doit jamais s'y glisser ;
 *   - le code est produit AVANT le rendu (#617) : un defaut d'apercu ne doit
 *     couter que l'apercu.
 */

import { MAP_LEVEL_MAP, getPreviewHTML } from '@dsfr-data/shared';
import { state } from '../state.js';
import type { ChartConfig, AggregatedResult } from '../state.js';
import { addMessage } from '../chat/chat.js';
import { generateCode } from './code-generator.js';
import {
  applyWhereFilter,
  buildMultiSeries,
  aggregateBy,
  type Aggregation,
} from '../ia/data-tools.js';

const FRAME_ID = 'preview-frame';

/** Le code actuellement affiche dans l'onglet Code — la sortie brute. */
function currentCode(): string {
  return document.getElementById('generated-code')?.textContent?.trim() ?? '';
}

/**
 * Rend le code genere dans l'iframe d'apercu.
 *
 * Aucun rendu parallele : ce que l'utilisateur VOIT est exactement ce qu'il
 * copiera. Le `debug: true` n'existe que dans cette chaine-la.
 */
export function renderPreview(): void {
  const frame = document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
  const emptyState = document.getElementById('empty-state');
  const code = currentCode();

  const hasCode = code !== '' && !code.startsWith('//');
  if (emptyState) emptyState.hidden = hasCode;
  if (!frame) return;
  frame.hidden = !hasCode;
  if (hasCode) frame.srcdoc = getPreviewHTML(code, { debug: true });
}

/** Remet l'apercu et le code a zero. */
export function resetChartPreview(): void {
  state.chartConfig = null;

  const codeEl = document.getElementById('generated-code');
  if (codeEl) codeEl.textContent = '';

  const frame = document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
  if (frame) {
    frame.srcdoc = '';
    frame.hidden = true;
  }
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.hidden = false;

  const previewPanel = document.querySelector('app-preview-panel');
  if (previewPanel) (previewPanel as HTMLElement & { code: string }).code = '';
}

/** Signale un probleme de configuration dans le chat, sans rien rendre. */
function refuse(message: string): void {
  addMessage('assistant', message);
}

/**
 * Applique une configuration : valide, agrege, genere le code, rend l'apercu.
 *
 * L'agregation est conservee telle quelle — elle produit ce que
 * `generateCode` consomme. Seul le dessin a disparu.
 */
export function applyChartConfig(config: ChartConfig): void {
  state.chartConfig = config;

  if (!state.localData || state.localData.length === 0) {
    refuse('Aucune donnee disponible. Veuillez sélectionner une source de données.');
    return;
  }

  const dataKeys = Object.keys(state.localData[0]);
  for (const champ of [config.labelField, config.valueField]) {
    if (champ && !dataKeys.includes(champ)) {
      refuse(
        `Le champ "${champ}" n'existe pas dans les données. Champs disponibles : ${dataKeys.join(', ')}`
      );
      return;
    }
  }

  let workingData = state.localData;
  if (config.where) {
    workingData = applyWhereFilter(state.localData, config.where);
    if (workingData.length === 0) {
      refuse(
        `Aucun enregistrement ne correspond au filtre "${config.where}". Vérifiez les noms de champs et les valeurs.`
      );
      return;
    }
  }

  // La datalist consomme les lignes SOURCE telles quelles : le generateur
  // les lit dans `state.localData`, il n'a pas d'agregat a recevoir.
  if (config.type === 'datalist') {
    generateCode(config, []);
    renderPreview();
    return;
  }

  // Le podium, lui, classe des valeurs AGREGEES. Ses variantes API delegent
  // l'agregation au serveur et ignorent cet argument, mais la variante
  // embarquee en fabrique l'attribut `data` — lui passer un tableau vide
  // produisait un podium vide (defaut trouve par la recette #615).
  if (config.type === 'podium') {
    generateCode(config, aggregate(config, workingData));
    renderPreview();
    return;
  }

  if (config.type === 'kpi') {
    generateCode(config, [
      { label: config.title || 'Valeur', value: aggregateKpi(config, workingData) },
    ]);
    renderPreview();
    return;
  }

  // Multi-séries (format LARGE) : une colonne numerique par série, alignees
  // sur un meme axe d'etiquettes. Court-circuite l'agregation mono-série.
  const MULTI_SERIES_TYPES = ['bar', 'line', 'radar', 'horizontalBar', 'bar-line'];
  if (
    config.valueFields &&
    config.valueFields.length > 0 &&
    MULTI_SERIES_TYPES.includes(config.type)
  ) {
    const agg = (config.aggregation ?? 'sum') as Aggregation;
    const fields = [config.valueField, ...config.valueFields].filter(Boolean);
    // `buildMultiSeries` valide l'alignement des séries ; le generateur emet
    // `value-fields` et n'a besoin que de la série primaire.
    buildMultiSeries(workingData, config.labelField, fields, agg);
    generateCode(config, aggregateBy(workingData, config.labelField, config.valueField, agg));
    renderPreview();
    return;
  }

  generateCode(config, aggregate(config, workingData));
  renderPreview();
}

/** Agrege toutes les valeurs en une seule, pour un KPI. */
function aggregateKpi(config: ChartConfig, rows: Record<string, unknown>[]): number {
  const values = rows.map((r) => parseFloat(String(r[config.valueField])) || 0);
  switch (config.aggregation) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'count':
      return rows.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'avg':
    default:
      return values.reduce((a, b) => a + b, 0) / values.length;
  }
}

/** Agrege par etiquette (ou par code, pour les cartes). */
function aggregate(config: ChartConfig, rows: Record<string, unknown>[]): AggregatedResult[] {
  const groupes: Record<string, { values: number[]; count: number; code: string | null }> = {};
  const isMap = config.type in MAP_LEVEL_MAP;
  const codeField = config.codeField || config.labelField;

  for (const record of rows) {
    const label = isMap
      ? String(record[codeField!] || 'N/A')
      : String(record[config.labelField!] || 'N/A');
    const value = parseFloat(String(record[config.valueField])) || 0;

    if (!groupes[label]) {
      groupes[label] = {
        values: [],
        count: 0,
        code: isMap ? String(record[codeField!] || '') : null,
      };
    }
    groupes[label].values.push(value);
    groupes[label].count++;
  }

  const results: AggregatedResult[] = Object.entries(groupes).map(([label, data]) => {
    let value: number;
    switch (config.aggregation) {
      case 'sum':
        value = data.values.reduce((a, b) => a + b, 0);
        break;
      case 'count':
        value = data.count;
        break;
      case 'min':
        value = Math.min(...data.values);
        break;
      case 'max':
        value = Math.max(...data.values);
        break;
      case 'avg':
      default:
        value = data.values.reduce((a, b) => a + b, 0) / data.values.length;
    }
    return { label, value, code: data.code };
  });

  results.sort((a, b) => (config.sortOrder === 'asc' ? a.value - b.value : b.value - a.value));
  return results;
}
