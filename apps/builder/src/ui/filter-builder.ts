/**
 * Builder visuel de filtres (refonte v2 — Claude Design).
 *
 * Des lignes champ / opérateur / valeur synchronisées avec l'input texte
 * historique `#query-filter` (colon-syntax `champ:op:valeur, …`), qui reste la
 * source de vérité consommée par code-generator. La bascule « Mode texte
 * (expert) » montre l'input brut ; toute édition texte re-parse les lignes.
 *
 * Compat : `state.advancedMode` gardait l'émission de dsfr-data-query dans le
 * code généré — le toggle DSFR a disparu, on le déduit désormais du contenu
 * (filtres, group-by ou agrégats non vides).
 */

import { state } from '../state.js';

const OPERATORS: { value: string; label: string; noValue?: boolean }[] = [
  { value: 'eq', label: 'égal' },
  { value: 'neq', label: 'différent' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'contains', label: 'contient' },
  { value: 'in', label: 'dans la liste' },
  { value: 'isnull', label: 'est vide', noValue: true },
  { value: 'isnotnull', label: 'non vide', noValue: true },
];

interface FilterRow {
  field: string;
  op: string;
  value: string;
}

let rows: FilterRow[] = [];
let textMode = false;

/** Parse la colon-syntax en lignes ; les clauses non parsables sont gardées telles quelles côté texte. */
function parseFilterString(str: string): FilterRow[] {
  return (str || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [field, op, ...rest] = part.split(':');
      return { field: field ?? '', op: op ?? 'eq', value: rest.join(':') };
    });
}

function serializeRows(): string {
  return rows
    .filter((r) => r.field && r.op)
    .map((r) => {
      const opDef = OPERATORS.find((o) => o.value === r.op);
      return opDef?.noValue ? `${r.field}:${r.op}` : `${r.field}:${r.op}:${r.value}`;
    })
    .filter((clause) => {
      // Une clause à valeur vide (hors isnull/isnotnull) est incomplète : on ne l'émet pas.
      const parts = clause.split(':');
      const opDef = OPERATORS.find((o) => o.value === parts[1]);
      return opDef?.noValue || (parts.length >= 3 && parts.slice(2).join(':') !== '');
    })
    .join(', ');
}

/** advancedMode déduit du contenu (compat code-generator, toggle retiré). */
export function syncAdvancedModeFromContent(): void {
  state.advancedMode = !!(state.queryFilter || state.queryGroupBy || state.queryAggregate);
}

/** Pousse les lignes dans #query-filter + state, et met à jour le compteur. */
function commit(): void {
  const input = document.getElementById('query-filter') as HTMLInputElement | null;
  const serialized = serializeRows();
  if (input && !textMode) input.value = serialized;
  state.queryFilter = textMode && input ? input.value : serialized;
  syncAdvancedModeFromContent();

  const countEl = document.getElementById('filters-count');
  if (countEl) {
    const n = state.queryFilter ? state.queryFilter.split(',').filter((c) => c.trim()).length : 0;
    countEl.textContent = n === 0 ? 'aucun' : `${n} actif${n > 1 ? 's' : ''}`;
  }
}

/**
 * Remplit un select de champs sans innerHTML (les noms de champs viennent des
 * données : createElement + textContent, jamais d'interpolation HTML — CodeQL
 * js/html-constructed-from-input, cf. précédent #484).
 */
function populateFieldSelect(select: HTMLSelectElement, selected: string): void {
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— champ —';
  select.appendChild(placeholder);

  state.fields.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.name;
    opt.textContent = f.displayName || f.name;
    opt.selected = f.name === selected;
    select.appendChild(opt);
  });
  // Champ configuré mais absent de la source courante : on le garde visible.
  if (selected && !state.fields.some((f) => f.name === selected)) {
    const opt = document.createElement('option');
    opt.value = selected;
    opt.textContent = selected;
    opt.selected = true;
    select.appendChild(opt);
  }
}

function renderRows(): void {
  const host = document.getElementById('filters-visual');
  if (!host) return;
  host.innerHTML = '';

  rows.forEach((row, i) => {
    const el = document.createElement('div');
    el.className = 'filter-row';

    const fieldSel = document.createElement('select');
    fieldSel.className = 'fr-select fr-select--sm filter-row__field';
    fieldSel.setAttribute('aria-label', 'Champ du filtre');
    populateFieldSelect(fieldSel, row.field);
    fieldSel.addEventListener('change', () => {
      rows[i].field = fieldSel.value;
      commit();
    });

    const opSel = document.createElement('select');
    opSel.className = 'fr-select fr-select--sm filter-row__op';
    opSel.setAttribute('aria-label', 'Opérateur du filtre');
    OPERATORS.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      opt.selected = o.value === row.op;
      opSel.appendChild(opt);
    });

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'fr-input fr-input--sm filter-row__value';
    valInput.setAttribute('aria-label', 'Valeur du filtre');
    valInput.placeholder = row.op === 'in' ? 'val1|val2|val3' : 'valeur';
    valInput.value = row.value;
    valInput.addEventListener('input', () => {
      rows[i].value = valInput.value;
      commit();
    });

    const applyOpUi = () => {
      const noValue = !!OPERATORS.find((o) => o.value === opSel.value)?.noValue;
      valInput.disabled = noValue;
      valInput.placeholder = noValue ? '—' : opSel.value === 'in' ? 'val1|val2|val3' : 'valeur';
      if (noValue) valInput.value = '';
    };
    opSel.addEventListener('change', () => {
      rows[i].op = opSel.value;
      if (OPERATORS.find((o) => o.value === opSel.value)?.noValue) rows[i].value = '';
      applyOpUi();
      commit();
    });
    applyOpUi();

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'filter-row__remove';
    removeBtn.title = 'Retirer ce filtre';
    removeBtn.setAttribute('aria-label', 'Retirer ce filtre');
    removeBtn.innerHTML = '<i class="ri-close-line" aria-hidden="true"></i>';
    removeBtn.addEventListener('click', () => {
      rows.splice(i, 1);
      renderRows();
      commit();
    });

    el.append(fieldSel, opSel, valInput, removeBtn);
    host.appendChild(el);
  });
}

function setTextMode(on: boolean): void {
  textMode = on;
  const visual = document.getElementById('filters-visual');
  const addBtn = document.getElementById('add-filter-btn');
  const text = document.getElementById('filters-text');
  const toggle = document.getElementById('filters-mode-toggle');
  if (visual) visual.hidden = on;
  if (addBtn) addBtn.hidden = on;
  if (text) text.hidden = !on;
  if (toggle) toggle.textContent = on ? '← Mode visuel' : 'Mode texte (expert)';
  if (!on) {
    // Retour au visuel : re-parser le texte (potentiellement édité à la main).
    const input = document.getElementById('query-filter') as HTMLInputElement | null;
    rows = parseFilterString(input?.value ?? state.queryFilter);
    renderRows();
    commit();
  }
}

/** Recharge les lignes depuis state.queryFilter (restauration favori, source…). */
export function refreshFilterBuilder(): void {
  const input = document.getElementById('query-filter') as HTMLInputElement | null;
  const source = input?.value || state.queryFilter || '';
  rows = parseFilterString(source);
  renderRows();
  commit();
}

/** Initialisation : wiring des contrôles + premier rendu. */
export function initFilterBuilder(): void {
  document.getElementById('add-filter-btn')?.addEventListener('click', () => {
    rows.push({ field: '', op: 'eq', value: '' });
    renderRows();
  });
  document.getElementById('filters-mode-toggle')?.addEventListener('click', () => {
    setTextMode(!textMode);
  });
  // Édition directe en mode texte → state + compteur (le re-parse visuel se
  // fait au retour en mode visuel).
  document.getElementById('query-filter')?.addEventListener('input', () => {
    if (textMode) commit();
  });
  // La liste des champs vient d'être (re)peuplée : rafraîchir les selects.
  document.addEventListener('builder:fields-updated', () => {
    renderRows();
  });

  refreshFilterBuilder();
}
