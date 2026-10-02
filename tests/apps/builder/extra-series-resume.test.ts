/**
 * #1175 : le résumé « étiquette × valeur (+1 série) » de la section
 * « Configuration des données » suit les séries supplémentaires — au choix du
 * champ d'une série comme à sa suppression, sans attendre « Générer ».
 *
 * Preuve de mutation : retirer les appels à `updatePreviewSteps()` de
 * `apps/builder/src/ui/extra-series.ts` rend les deux cas rouges.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { addExtraSeries } from '../../../apps/builder/src/ui/extra-series';
import { state } from '../../../apps/builder/src/state';

function resume(): string {
  return document.querySelector<HTMLElement>('#section-data .section-summary')?.textContent ?? '';
}

describe('résumé de la configuration et séries supplémentaires (#1175)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="section-data" class="config-section">
        <div class="config-section-header"><h3>Configuration des données</h3></div>
      </div>
      <div id="extra-series-container"></div>
      <button id="generate-btn"></button>
    `;
    state.chartType = 'bar';
    state.fields = [
      { name: 'nom_region', type: 'string', sample: 'Bretagne' },
      { name: 'nombre_beneficiaires', type: 'number', sample: 12 },
      { name: 'montant', type: 'number', sample: 3.5 },
    ];
    state.labelField = 'nom_region';
    state.valueField = 'nombre_beneficiaires';
    state.valueField2 = '';
    state.extraSeries = [];
  });

  it('le choix du champ de la série 2 met le résumé à jour', () => {
    addExtraSeries();
    const select = document.querySelector<HTMLSelectElement>('.extra-series-field')!;
    select.value = 'montant';
    select.dispatchEvent(new Event('change'));

    expect(state.extraSeries).toEqual([{ field: 'montant', label: '' }]);
    expect(state.valueField2).toBe('montant');
    expect(resume()).toBe('nom_region × nombre_beneficiaires (+1 série)');
  });

  it('la suppression de la série retire la mention', () => {
    addExtraSeries();
    const select = document.querySelector<HTMLSelectElement>('.extra-series-field')!;
    select.value = 'montant';
    select.dispatchEvent(new Event('change'));
    expect(resume()).toContain('(+1 série)');

    document.querySelector<HTMLButtonElement>('.remove-series-btn')!.click();

    expect(state.extraSeries).toEqual([]);
    expect(resume()).toBe('nom_region × nombre_beneficiaires');
  });
});
