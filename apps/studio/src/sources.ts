/**
 * Studio IA - Selection de source.
 *
 * Version volontairement lean du sources.ts du builder-IA : le studio ne
 * traite (v1) que les sources dont les donnees sont embarquees (chargees au
 * moment de l'enregistrement dans l'app Sources) — comme le fait deja le
 * builder-IA en pratique.
 */

import {
  analyzeDataFields,
  escapeHtml,
  loadFromStorage,
  migrateSource,
  STORAGE_KEYS,
} from '@dsfr-data/shared';
import type { Source } from '@dsfr-data/shared';
import { state } from './state.js';

/** Remplit le select avec les sources sauvegardees (donnees embarquees). */
export function loadSavedSources(): void {
  const select = document.getElementById('saved-source') as HTMLSelectElement | null;
  if (!select) return;
  select.innerHTML = '<option value="">-- Choisir --</option>';

  const sources = loadFromStorage<Source[]>(STORAGE_KEYS.SOURCES, []).map(migrateSource);
  for (const source of sources) {
    if (!source.data || source.data.length === 0) continue;
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = `${source.name} (${source.data.length} lignes)`;
    option.dataset.source = JSON.stringify(source);
    select.appendChild(option);
  }
}

/** Charge la source selectionnee dans l'etat + met a jour l'UI. */
export function handleSourceChange(onLoaded?: (source: Source) => void): void {
  const select = document.getElementById('saved-source') as HTMLSelectElement | null;
  const infoEl = document.getElementById('saved-source-info');
  const summaryEl = document.getElementById('source-summary');
  const selectedOption = select?.options[select.selectedIndex];

  if (!selectedOption?.dataset.source) {
    state.source = null;
    state.localData = null;
    state.fields = [];
    if (infoEl) infoEl.textContent = '';
    if (summaryEl) summaryEl.textContent = '';
    return;
  }

  const source: Source = JSON.parse(selectedOption.dataset.source);
  state.source = source;
  state.localData = source.data ?? [];
  state.fields = analyzeDataFields(state.localData);

  // La source devient LA source du document (id stable pour l'export).
  state.document.sources = [source as unknown as (typeof state.document.sources)[number]];

  if (infoEl) {
    infoEl.innerHTML = `${state.localData.length} enregistrements · ${state.fields
      .map((f) => escapeHtml(f.name))
      .join(', ')}`;
  }
  if (summaryEl) summaryEl.textContent = `· ${source.name}`;
  onLoaded?.(source);
}
