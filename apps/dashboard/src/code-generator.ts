/**
 * Dashboard app - Code generation
 *
 * La generation vit desormais dans `@dsfr-data/shared`
 * (`packages/shared/src/dashboard/export-html.ts`, #515) : elle est partagee
 * entre le dashboard et le studio. Ce module garde le branchement DOM et
 * re-exporte les generateurs — point d'entree historique des tests.
 */

import { generateDashboardHTML as sharedGenerateDashboardHTML } from '@dsfr-data/shared';
import { generateWidgetHTML as sharedGenerateWidgetHTML } from '@dsfr-data/shared';
import { state } from './state.js';
import type { Widget } from './state.js';

export function updateGeneratedCode(): void {
  const code = generateHTMLCode();
  const codeEl = document.getElementById('generated-code');
  const jsonEl = document.getElementById('generated-json');
  if (codeEl) codeEl.textContent = code;
  if (jsonEl) jsonEl.textContent = JSON.stringify(state.dashboard, null, 2);
}

export function generateHTMLCode(): string {
  return sharedGenerateDashboardHTML(state.dashboard);
}

export function generateWidgetHTML(widget: Widget): string {
  return sharedGenerateWidgetHTML(widget, state.dashboard);
}
