/**
 * Prérequis nommés du builder graphique (#1006, ADR-143 §5) : chaque règle,
 * vraie puis fausse sur un état fabriqué, et chaque repère qui la lève présent
 * au registre.
 */
import { describe, expect, it } from 'vitest';

import { PREREQUIS } from '../../../apps/builder/src/assistant/prerequis';
import { REPERES } from '../../../apps/builder/src/assistant/reperes.generated';
import {
  MULTI_SERIES_TYPES,
  getCompleteness,
  state,
  type BuilderState,
  type ChartType,
} from '../../../apps/builder/src/state';

const CHAMPS: BuilderState['fields'] = [
  { name: 'region', type: 'string', sample: 'Bretagne' },
  { name: 'population', type: 'number', sample: 3000 },
];

/** Copie de l'état initial, modifiée par `reglages`. */
function etat(reglages: Partial<BuilderState> = {}): BuilderState {
  return { ...(JSON.parse(JSON.stringify(state)) as BuilderState), ...reglages };
}

const TOUS_LES_TYPES: ChartType[] = [
  'bar',
  'horizontalBar',
  'line',
  'pie',
  'doughnut',
  'radar',
  'scatter',
  'gauge',
  'kpi',
  'map',
  'datalist',
];

describe('prérequis du builder', () => {
  it('les trois règles attendues, et elles seules', () => {
    expect(Object.keys(PREREQUIS).sort()).toEqual([
      'champs-choisis',
      'source-chargee',
      'type-multi-series',
    ]);
  });

  it('chaque règle est levée par un repère du registre', () => {
    const ids = new Set<string>(REPERES.map((r) => r.id));
    for (const [nom, regle] of Object.entries(PREREQUIS)) {
      expect(ids.has(regle.repereQuiLeve), `${nom} → ${regle.repereQuiLeve}`).toBe(true);
      expect(regle.message.trim(), nom).not.toBe('');
    }
  });

  it('chaque prérequis cité par le registre a une règle', () => {
    for (const r of REPERES) {
      for (const p of r.prerequis) expect(Object.keys(PREREQUIS), r.id).toContain(p);
    }
  });

  it('source-chargee : des champs sont disponibles', () => {
    expect(PREREQUIS['source-chargee'].verifier(etat({ fields: CHAMPS }))).toBe(true);
    expect(PREREQUIS['source-chargee'].verifier(etat({ fields: [] }))).toBe(false);
  });

  it('champs-choisis : suit getCompleteness().config, type par type', () => {
    const complet = etat({
      fields: CHAMPS,
      chartType: 'bar',
      labelField: 'region',
      valueField: 'population',
    });
    expect(PREREQUIS['champs-choisis'].verifier(complet)).toBe(true);
    expect(PREREQUIS['champs-choisis'].verifier({ ...complet, valueField: '' })).toBe(false);
    expect(PREREQUIS['champs-choisis'].verifier({ ...complet, fields: [] })).toBe(false);
    // Carte : il faut aussi le code département.
    expect(PREREQUIS['champs-choisis'].verifier({ ...complet, chartType: 'map' })).toBe(false);
    expect(
      PREREQUIS['champs-choisis'].verifier({ ...complet, chartType: 'map', codeField: 'region' })
    ).toBe(true);
    for (const t of TOUS_LES_TYPES) {
      const s = { ...complet, chartType: t };
      expect(PREREQUIS['champs-choisis'].verifier(s), t).toBe(getCompleteness(s).config);
    }
  });

  it('type-multi-series : barres, barres horizontales, lignes, radar', () => {
    expect([...MULTI_SERIES_TYPES].sort()).toEqual(['bar', 'horizontalBar', 'line', 'radar']);
    for (const t of TOUS_LES_TYPES) {
      expect(PREREQUIS['type-multi-series'].verifier(etat({ chartType: t })), t).toBe(
        MULTI_SERIES_TYPES.includes(t)
      );
    }
  });

  it("le bouton d'ajout de série cite type-multi-series en premier", () => {
    const ajouter = REPERES.find((r) => r.id === 'builder.donnees.series.ajouter');
    expect(ajouter?.prerequis[0]).toBe('type-multi-series');
  });
});
