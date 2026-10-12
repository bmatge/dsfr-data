import { describe, it, expect } from 'vitest';

import { comparer } from '../../tools/oracle/compare.js';
import { cleAttendu, computeExpectedFor } from '../../tools/oracle/expected.js';
import type { ObservationEchelle } from '../../tools/oracle/observe.js';
import type { Check, ExpectScale, Row } from '../../tools/oracle/manifest.js';

/**
 * L'ÉCHELLE appliquée à un axe (#1273) : la borne que la page déclare, les
 * étiquettes qu'un axe de catégories porte, l'étendue des valeurs qu'un axe
 * numérique doit contenir. Chaque cas rouge est un défaut mesuré dans un
 * navigateur avant la correction.
 */

const CTX = { domaine: 'test', controle: 'c', mode: 'deterministic' as const, rawRows: 0 };

const LIGNES: Row[] = [
  { l: 'A', v: 12, w: 120 },
  { l: 'B', v: 18, w: 300 },
  { l: 'C', v: 27, w: 450 },
  { l: 'D', v: 33, w: 510 },
];

function attendu(e: ExpectScale) {
  const check: Check = {
    id: 'c',
    mode: 'deterministic',
    origin: 'test',
    feed: { kind: 'fixture', datasets: { main: LIGNES } },
    markup: '',
    expects: [e],
  };
  return computeExpectedFor(check, { main: LIGNES }).values[cleAttendu(e)];
}

const constat = (e: ExpectScale, obs: ObservationEchelle) => comparer(CTX, e, attendu(e), obs);

const lineaire = (min: number, max: number): ObservationEchelle => ({
  type: 'linear',
  min,
  max,
  labels: [],
});
const categories = (labels: string[]): ObservationEchelle => ({
  type: 'category',
  min: 0,
  max: labels.length - 1,
  labels,
});

const Y: ExpectScale = {
  kind: 'scale',
  id: 'g',
  axis: 'y',
  min: 5,
  max: 37,
  valueColumns: ['v'],
  pipeline: [],
};
const X: ExpectScale = { kind: 'scale', id: 'g', axis: 'x', labelColumn: 'l', pipeline: [] };

describe('vérification des données — échelle d’un axe', () => {
  it('la clé porte l’axe : les deux axes d’un graphique ne s’écrasent pas', () => {
    expect(cleAttendu(Y)).toBe('scale:g:y');
    expect(cleAttendu(X)).toBe('scale:g:x');
  });

  it('l’attendu : bornes déclarées, étiquettes et étendue recalculées', () => {
    expect(attendu(Y)).toEqual({
      kind: 'scale',
      min: 5,
      max: 37,
      labels: null,
      etendue: { min: 12, max: 33 },
    });
    expect(attendu(X)).toEqual({
      kind: 'scale',
      min: null,
      max: null,
      labels: ['A', 'B', 'C', 'D'],
      etendue: null,
    });
    // Des barres : zéro fait partie de ce que l'axe doit contenir.
    expect(attendu({ ...Y, min: undefined, max: undefined, fromZero: true })).toMatchObject({
      etendue: { min: 0, max: 33 },
    });
    // Deux colonnes : l'étendue de l'ensemble.
    expect(attendu({ ...Y, valueColumns: ['v', 'w'] })).toMatchObject({
      etendue: { min: 12, max: 510 },
    });
  });

  it('vert quand l’axe porte exactement les bornes déclarées', () => {
    const c = constat(Y, lineaire(5, 37));
    expect(c.ok).toBe(true);
    expect(c.comparaisons).toBe(4);
    expect(c.lib).toBe('5 … 37');
  });

  it('rouge sur une borne ARRONDIE à la graduation (borne « suggérée »)', () => {
    const c = constat(Y, lineaire(0, 40));
    expect(c.ok).toBe(false);
    expect(c.message).toBe('axe y : minimum appliqué 0, déclaré 5');
    expect(c.ecart).toBe(-5);
    expect(constat({ ...Y, min: undefined }, lineaire(0, 40)).message).toBe(
      'axe y : maximum appliqué 40, déclaré 37'
    );
  });

  it('rouge sur une CATÉGORIE FANTÔME ajoutée à l’axe des étiquettes', () => {
    const c = constat(X, categories(['A', 'B', 'C', 'D', '5', '40']));
    expect(c.ok).toBe(false);
    expect(c.ecart).toBe(2);
    expect(c.message).toBe('axe x : étiquettes « A, B, C, D, 5, 40 », recalculé « A, B, C, D »');
    expect(constat(X, categories(['A', 'B', 'C', 'D'])).ok).toBe(true);
    // L'ordre compte : c'est celui qu'on lit.
    expect(constat(X, categories(['B', 'A', 'C', 'D'])).ok).toBe(false);
  });

  it('rouge quand une donnée tombe HORS de l’axe', () => {
    const libre: ExpectScale = { ...Y, min: undefined, max: undefined };
    expect(constat(libre, lineaire(10, 40)).ok).toBe(true);
    expect(constat(libre, lineaire(20, 40)).message).toBe(
      "axe y : il commence à 20, la plus petite valeur recalculée est 12 — donnée hors de l'axe"
    );
    expect(constat(libre, lineaire(10, 25)).message).toBe(
      "axe y : il s'arrête à 25, la plus grande valeur recalculée est 33 — donnée hors de l'axe"
    );
    // Des barres tronquées : l'axe ne contient plus zéro.
    expect(constat({ ...libre, fromZero: true }, lineaire(10, 40)).message).toContain(
      'la plus petite valeur recalculée est 0'
    );
  });

  it('rouge quand l’axe n’est pas de la nature attendue', () => {
    expect(constat(X, lineaire(0, 3)).message).toBe(
      "axe x : échelle « linear », un axe d'étiquettes était attendu"
    );
    expect(constat(Y, categories(['A'])).message).toBe(
      "axe y : axe d'étiquettes, une échelle numérique était attendue"
    );
  });

  it('une attente qui ne compare rien ne passe pas', () => {
    const vide: ExpectScale = { kind: 'scale', id: 'g', axis: 'y' };
    const c = constat(vide, lineaire(0, 1));
    expect(c.ok).toBe(false);
    expect(c.comparaisons).toBe(0);
  });
});
