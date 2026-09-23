/**
 * Prérequis nommés de la carto (#1002, ADR-143 §5) : chaque règle, vraie puis
 * fausse sur un état fabriqué, et chaque repère qui la lève présent au registre.
 */
import { describe, expect, it } from 'vitest';

import { PREREQUIS } from '../../../apps/builder-carto/src/assistant/prerequis';
import { REPERES } from '../../../apps/builder-carto/src/assistant/reperes.generated';
import {
  createLayer,
  type CartoState,
  type LayerConfig,
} from '../../../apps/builder-carto/src/state';

/** État minimal : une couche active `layer-a`, modifiée par `reglages`. */
function etat(reglages: Partial<LayerConfig> = {}, active = 'layer-a'): CartoState {
  const couche: LayerConfig = { ...createLayer(), id: 'layer-a', ...reglages };
  return {
    map: {} as CartoState['map'],
    layers: [couche],
    activeLayerId: active,
    generationMode: 'embedded',
  };
}

const SOURCE = { id: 's', name: 'Source', type: 'manual', data: [] };

describe('prérequis de la carto', () => {
  it('les six règles attendues, et elles seules', () => {
    expect(Object.keys(PREREQUIS).sort()).toEqual([
      'composition-proposee',
      'couche-active',
      'couche-interactive',
      'couche-source',
      'popup-champs',
      'zones-avec-geometrie',
    ]);
  });

  it('chaque règle est levée par un repère du registre', () => {
    const ids = new Set<string>(REPERES.map((r) => r.id));
    for (const [nom, regle] of Object.entries(PREREQUIS)) {
      expect(ids.has(regle.repereQuiLeve), `${nom} → ${regle.repereQuiLeve}`).toBe(true);
      expect(regle.message.trim(), nom).not.toBe('');
    }
  });

  it('couche-active : une couche est sélectionnée', () => {
    expect(PREREQUIS['couche-active'].verifier(etat())).toBe(true);
    expect(PREREQUIS['couche-active'].verifier(etat({}, 'layer-disparue'))).toBe(false);
  });

  it('couche-source : la couche active a des données', () => {
    expect(PREREQUIS['couche-source'].verifier(etat({ source: SOURCE }))).toBe(true);
    expect(PREREQUIS['couche-source'].verifier(etat({ source: null }))).toBe(false);
    expect(PREREQUIS['couche-source'].verifier(etat({ source: SOURCE }, 'aucune'))).toBe(false);
  });

  it('couche-interactive : la couche active n’est pas décorative', () => {
    expect(PREREQUIS['couche-interactive'].verifier(etat({ noInteractive: false }))).toBe(true);
    expect(PREREQUIS['couche-interactive'].verifier(etat({ noInteractive: true }))).toBe(false);
    expect(PREREQUIS['couche-interactive'].verifier(etat({}, 'aucune'))).toBe(false);
  });

  it('zones-avec-geometrie : un champ géographique est renseigné', () => {
    expect(PREREQUIS['zones-avec-geometrie'].verifier(etat({ geoField: 'geo_shape' }))).toBe(true);
    expect(PREREQUIS['zones-avec-geometrie'].verifier(etat({ geoField: '' }))).toBe(false);
    expect(PREREQUIS['zones-avec-geometrie'].verifier(etat({ geoField: '   ' }))).toBe(false);
  });

  it('popup-champs : des champs sont choisis pour la fiche', () => {
    expect(PREREQUIS['popup-champs'].verifier(etat({ popupFields: 'nom,adresse' }))).toBe(true);
    expect(PREREQUIS['popup-champs'].verifier(etat({ popupFields: '' }))).toBe(false);
    expect(PREREQUIS['popup-champs'].verifier(etat({ popupFields: 'nom' }, 'aucune'))).toBe(false);
  });

  it('composition-proposee : couche de données à champ territoire, ni agrégée ni composée', () => {
    const regle = PREREQUIS['composition-proposee'];
    const territoire = { champ: 'Code du département', niveau: 'departement' as const };
    expect(regle.verifier(etat({ source: SOURCE, territoire }))).toBe(true);
    expect(regle.verifier(etat({ source: SOURCE, territoire: null }))).toBe(false);
    expect(regle.verifier(etat({ source: null, territoire }))).toBe(false);
    expect(regle.verifier(etat({ source: SOURCE, territoire }, 'aucune'))).toBe(false);
    expect(
      regle.verifier(etat({ source: SOURCE, territoire, agregat: { ...territoire, depuis: 'x' } }))
    ).toBe(false);
    // Déjà composée : une couche agrégée en est issue.
    const compose = etat({ source: SOURCE, territoire });
    const zones: LayerConfig = {
      ...createLayer(),
      id: 'layer-b',
      agregat: { ...territoire, depuis: 'layer-a' },
    };
    expect(regle.verifier({ ...compose, layers: [...compose.layers, zones] })).toBe(false);
    expect(regle.repereQuiLeve).toBe('carto.couches.liste');
  });
});
