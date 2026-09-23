import { beforeEach, describe, it, expect } from 'vitest';

import { comparer } from '../../tools/oracle/compare.js';
import { cleAttendu, computeExpectedFor } from '../../tools/oracle/expected.js';
import { lireCompte } from '../../tools/oracle/observe.js';
import type { Check, ExpectCount, Row } from '../../tools/oracle/manifest.js';

/**
 * Le lecteur d'éléments TRACÉS (#1059) : combien de formes une couche de carte
 * a posées, contre combien de lignes le recalcul laisse.
 */

const CTX = { domaine: 'test', controle: 'c', mode: 'deterministic' as const, rawRows: 0 };

const LIGNES: Row[] = [
  { zone: 'Nord', lat: 43, lon: -2 },
  { zone: 'Nord', lat: 44, lon: 1 },
  { zone: 'Sud', lat: 45, lon: 3 },
];

function constat(e: ExpectCount, traces: number) {
  const check: Check = {
    id: 'c',
    mode: 'deterministic',
    origin: 'test',
    feed: { kind: 'fixture', datasets: { main: LIGNES } },
    markup: '',
    expects: [e],
  };
  const attendu = computeExpectedFor(check, { main: LIGNES }).values[cleAttendu(e)];
  return comparer(CTX, e, attendu, traces);
}

const NORD: ExpectCount = {
  kind: 'count',
  id: 'carte',
  selector: '.dsfr-data-map__marker',
  pipeline: [{ op: 'filter', filters: [{ field: 'zone', op: 'eq', value: 'Nord' }] }],
};

describe('vérification des données — éléments tracés', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('la clé porte le sélecteur : deux couches d’une même carte ne s’écrasent pas', () => {
    expect(cleAttendu(NORD)).toBe('count:carte:.dsfr-data-map__marker');
    expect(cleAttendu({ ...NORD, selector: 'path.zone' })).toBe('count:carte:path.zone');
  });

  it('l’attendu est le nombre de lignes recalculées, sans pipeline le jeu entier', () => {
    const check: Check = {
      id: 'c',
      mode: 'deterministic',
      origin: 'test',
      feed: { kind: 'fixture', datasets: { main: LIGNES } },
      markup: '',
      expects: [NORD, { kind: 'count', id: 'carte', selector: 'path' }],
    };
    const { values } = computeExpectedFor(check, { main: LIGNES });
    expect(values['count:carte:.dsfr-data-map__marker']).toEqual({ kind: 'count', value: 2 });
    expect(values['count:carte:path']).toEqual({ kind: 'count', value: 3 });
  });

  it('un tracé par ligne passe ; un de moins ou de trop tombe, avec les deux chiffres', () => {
    const ok = constat(NORD, 2);
    expect(ok.ok).toBe(true);
    expect(ok.comparaisons).toBe(1);

    const manque = constat(NORD, 1);
    expect(manque.ok).toBe(false);
    expect(manque.ecart).toBe(-1);
    expect(manque.message).toContain('1 élément(s) tracé(s)');
    expect(manque.message).toContain('2 ligne(s) recalculée(s)');

    expect(constat(NORD, 3).ok).toBe(false);
  });

  it('lireCompte : compte sous le composant, zéro s’il n’y a rien, null sans composant', () => {
    document.body.innerHTML = `
      <div id="carte">
        <div class="leaflet-marker-icon dsfr-data-map__marker"></div>
        <div class="leaflet-marker-icon dsfr-data-map__marker"></div>
        <svg><path class="zone"></path><path class="zone"></path><path class="zone"></path></svg>
      </div>
      <div class="dsfr-data-map__marker"></div>`;
    expect(lireCompte({ id: 'carte', selecteur: '.dsfr-data-map__marker' })).toBe(2);
    expect(lireCompte({ id: 'carte', selecteur: 'path.zone' })).toBe(3);
    expect(lireCompte({ id: 'carte', selecteur: 'path.autre' })).toBe(0);
    expect(lireCompte({ id: 'absente', selecteur: 'path' })).toBeNull();
  });
});
