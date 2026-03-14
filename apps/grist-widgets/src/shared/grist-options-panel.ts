/**
 * Panneau de configuration pour les widgets Grist.
 *
 * Genere un panneau DSFR avec les controles de configuration
 * (type de chart, palette, unites, etc.) et persiste les choix
 * via grist.setOption().
 */

import { saveGristOptions } from './grist-bridge.js';

export interface OptionDef {
  key: string;
  label: string;
  type: 'select' | 'text' | 'checkbox';
  options?: { value: string; label: string }[];
  defaultValue?: string | boolean;
  hint?: string;
}

/**
 * Cree le panneau d'options dans un conteneur DOM.
 * Retourne une fonction pour recuperer les valeurs actuelles.
 */
export function createOptionsPanel(
  container: HTMLElement,
  definitions: OptionDef[],
  currentValues: Record<string, unknown>,
  onSave?: () => void
): { getValues: () => Record<string, unknown>; save: () => void } {

  container.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'fr-container fr-py-2w';

  for (const def of definitions) {
    const group = document.createElement('div');
    group.className = 'fr-mb-2w';

    if (def.type === 'select' && def.options) {
      group.innerHTML = `
        <div class="fr-select-group fr-select-group--sm">
          <label class="fr-label" for="opt-${def.key}">
            ${def.label}
            ${def.hint ? `<span class="fr-hint-text">${def.hint}</span>` : ''}
          </label>
          <select class="fr-select" id="opt-${def.key}" data-option-key="${def.key}">
            ${def.options.map(o =>
              `<option value="${o.value}" ${(currentValues[def.key] ?? def.defaultValue) === o.value ? 'selected' : ''}>${o.label}</option>`
            ).join('')}
          </select>
        </div>
      `;
    } else if (def.type === 'text') {
      const val = (currentValues[def.key] ?? def.defaultValue ?? '') as string;
      group.innerHTML = `
        <div class="fr-input-group fr-input-group--sm">
          <label class="fr-label" for="opt-${def.key}">
            ${def.label}
            ${def.hint ? `<span class="fr-hint-text">${def.hint}</span>` : ''}
          </label>
          <input class="fr-input" type="text" id="opt-${def.key}" data-option-key="${def.key}" value="${val}">
        </div>
      `;
    } else if (def.type === 'checkbox') {
      const checked = (currentValues[def.key] ?? def.defaultValue) === true;
      group.innerHTML = `
        <div class="fr-checkbox-group fr-checkbox-group--sm">
          <input type="checkbox" id="opt-${def.key}" data-option-key="${def.key}" ${checked ? 'checked' : ''}>
          <label class="fr-label" for="opt-${def.key}">${def.label}</label>
        </div>
      `;
    }

    form.appendChild(group);
  }

  // Bouton Appliquer
  const btnWrapper = document.createElement('div');
  btnWrapper.className = 'fr-mt-2w';
  btnWrapper.innerHTML = `<button class="fr-btn fr-btn--sm" id="grist-opts-save">Appliquer</button>`;
  form.appendChild(btnWrapper);

  container.appendChild(form);

  const getValues = (): Record<string, unknown> => {
    const values: Record<string, unknown> = {};
    for (const def of definitions) {
      const el = container.querySelector(`[data-option-key="${def.key}"]`) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) continue;
      if (def.type === 'checkbox') {
        values[def.key] = (el as HTMLInputElement).checked;
      } else {
        values[def.key] = el.value;
      }
    }
    return values;
  };

  const save = () => {
    saveGristOptions(getValues());
    if (onSave) onSave();
  };

  container.querySelector('#grist-opts-save')?.addEventListener('click', save);

  return { getValues, save };
}
