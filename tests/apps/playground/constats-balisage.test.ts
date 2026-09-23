/**
 * Constats statiques du Playground (#1009) : l'analyse du balisage projetée
 * en `Constat[]`, évaluée avec les règles génériques par le même moteur que
 * les constats de l'exécution.
 */
import { describe, expect, it } from 'vitest';
import { evaluerConstats, REGLES_GENERIQUES } from '@dsfr-data/shared';
import type { ComponentContract, Trace } from '@dsfr-data/shared';

import {
  constatDepuisLint,
  constatsDuBalisage,
  creerRegleBalisage,
  ID_REGLE_BALISAGE,
  REGLE_BALISAGE,
} from '../../../apps/playground/src/assistant/constats-balisage';
import { lireRepereCode } from '../../../apps/playground/src/assistant/adaptateur';

const CONTRAT: ComponentContract = {
  'dsfr-data-source': { attributes: ['api-type', 'url'] },
  'dsfr-data-query': { attributes: ['source', 'group-by'] },
};

const CODE = [
  '<dsfr-data-source id="s" url="x"></dsfr-data-source>',
  '',
  '<dsfr-data-query id="q"',
  '  source="absent" typo="1"></dsfr-data-query>',
].join('\n');

/** Trace vide : les règles génériques n'y trouvent rien. */
const TRACE_VIDE: Trace = {
  graph: { nodes: [], dangling: [] },
  events: [],
  states: {},
  order: [],
  sinceLastEventMs: null,
  lastEventAt: null,
  quiescent: true,
  delegation: {},
  reseau: [],
  console: [],
};

describe('constats du balisage', () => {
  it('chaque constat porte la règle d’analyse, un id situé, un repère de code', () => {
    const constats = constatsDuBalisage(CODE, CONTRAT);
    const amont = constats.find((c) => c.regle === 'balisage/amont-absent')!;
    expect(amont).toMatchObject({
      id: 'balisage/amont-absent@3:1:source',
      gravite: 'erreur',
      titre: 'Amont introuvable dans le code',
      reperes: ['playground.ligne.3.dsfr-data-query.source'],
    });
    expect(amont.explication).toContain('"absent"');
    expect(amont.action).toBeTruthy();
    expect(lireRepereCode(amont.reperes[0])).toEqual({
      ligne: 3,
      tag: 'dsfr-data-query',
      attribut: 'source',
    });
    const typo = constats.find((c) => c.regle === 'balisage/attribut-inconnu')!;
    expect(typo.reperes).toEqual(['playground.ligne.3.dsfr-data-query.typo']);
  });

  it('deux constats d’une même règle sur une même ligne restent distincts', () => {
    const code = '<dsfr-data-query id="q" source="s" a="1" b="2"></dsfr-data-query>';
    const ids = constatsDuBalisage(code, CONTRAT)
      .filter((c) => c.regle === 'balisage/attribut-inconnu')
      .map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('la preuve ne cite que ce qui est écrit dans le code (ADR-122)', () => {
    const constats = constatsDuBalisage(CODE, CONTRAT);
    for (const c of constats) {
      // Seuls chiffres admis : ceux présents dans le code (numéros de ligne compris).
      for (const n of c.preuve.match(/\d+/g) ?? []) {
        const ligne = Number(n);
        const dansLeCode = CODE.includes(n) || ligne <= CODE.split('\n').length;
        expect(dansLeCode, `${c.id} : ${n}`).toBe(true);
      }
    }
    const amont = constats.find((c) => c.regle === 'balisage/amont-absent')!;
    expect(amont.preuve).toBe('Ligne 3 : <dsfr-data-query id="q">, attribut source');
  });

  it('constat global (aucune balise) : aucun repère, pas de ligne', () => {
    const [c] = constatsDuBalisage('<p>texte</p>', CONTRAT);
    expect(c.regle).toBe('balisage/aucune-balise');
    expect(c.reperes).toEqual([]);
    expect(c.id).toBe('balisage/aucune-balise');
    expect(c.gravite).toBe('avertissement');
  });

  it('code vide : aucun constat', () => {
    expect(constatsDuBalisage('   \n', CONTRAT)).toEqual([]);
  });

  it('un constat carte garde son code et un titre tiré du message', () => {
    const c = constatDepuisLint({
      severity: 'avertissement',
      tag: 'dsfr-data-map-layer',
      id: 'l',
      message: 'Couche hors carte — elle ne sera pas dessinée.',
      regle: 'carte/couche-hors-carte',
      ligne: 5,
      colonne: 3,
    });
    expect(c.regle).toBe('carte/couche-hors-carte');
    expect(c.titre).toBe('Couche hors carte');
    expect(c.id).toBe('carte/couche-hors-carte@5:3');
    expect(c.reperes).toEqual(['playground.ligne.5.dsfr-data-map-layer']);
  });
});

describe('règle d’app dans le moteur de constats', () => {
  it('lit le code dans contexte.etat, pour le Playground seulement', () => {
    const regle = creerRegleBalisage(CONTRAT);
    expect(regle.id).toBe(ID_REGLE_BALISAGE);
    const pg = evaluerConstats(TRACE_VIDE, { app: 'playground', etat: { code: CODE } }, [
      ...REGLES_GENERIQUES,
      regle,
    ]);
    expect(pg.map((c) => c.regle)).toContain('balisage/amont-absent');
    // Erreurs avant avertissements (tri du moteur).
    const gravites = pg.map((c) => c.gravite);
    expect([...gravites].sort((a, b) => (a === b ? 0 : a === 'erreur' ? -1 : 1))).toEqual(gravites);
    expect(evaluerConstats(TRACE_VIDE, { app: 'builder', etat: { code: CODE } }, [regle])).toEqual(
      []
    );
  });

  it('sans code dans l’état : aucun constat', () => {
    const regle = creerRegleBalisage(CONTRAT);
    expect(evaluerConstats(TRACE_VIDE, { app: 'playground' }, [regle])).toEqual([]);
    expect(evaluerConstats(TRACE_VIDE, { app: 'playground', etat: { code: 4 } }, [regle])).toEqual(
      []
    );
  });

  it('REGLE_BALISAGE utilise le vrai contrat : un code valide ne produit rien', () => {
    const code =
      '<dsfr-data-source id="s" api-type="tabular" resource="r"></dsfr-data-source>\n' +
      '<dsfr-data-query id="q" source="s" group-by="region"></dsfr-data-query>\n' +
      '<dsfr-data-chart source="q" type="bar" label-field="region" value-field="n"></dsfr-data-chart>';
    expect(REGLE_BALISAGE.evaluer(TRACE_VIDE, { app: 'playground', etat: { code } })).toEqual([]);
  });
});
