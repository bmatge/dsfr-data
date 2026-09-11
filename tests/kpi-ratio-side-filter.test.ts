import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #776 — filtrer un côté du ratio sur autre chose qu'un comptage.
 *
 * `count:champ:valeur` exprime une part de comptages, rien n'exprimait une
 * part de SOMMES : sur une source pré-agrégée (une ligne par école et par
 * sexe, avec un effectif), la part des filles est Σ(effectif des filles) /
 * Σ(effectif). Le `where` du KPI filtre les deux côtés à la fois. Forme
 * retenue : l'accolade, `ecoles:sum{sexe:eq:F}`, dialecte du `where`.
 */

import { parseExpression, computeAggregation } from '@/utils/aggregations.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';

const EFFECTIFS = [
  { ecole: 'A', sexe: 'F', effectif: 120, secteur: 'public' },
  { ecole: 'A', sexe: 'M', effectif: 80, secteur: 'public' },
  { ecole: 'B', sexe: 'F', effectif: 30, secteur: 'prive' },
  { ecole: 'B', sexe: 'M', effectif: 70, secteur: 'prive' },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('#776 — grammaire accolade', () => {
  it('parse le filtre sur l’expression de base', () => {
    expect(parseExpression('effectif:sum{sexe:eq:F}')).toEqual({
      type: 'sum',
      field: 'effectif',
      rowFilter: 'sexe:eq:F',
    });
  });

  it('une part de sommes : Σ filles / Σ total', () => {
    // (120 + 30) / 300 = 0,5
    expect(computeAggregation(EFFECTIFS, 'effectif:sum{sexe:eq:F} / effectif:sum')).toBe(0.5);
  });

  it('le filtre ne vaut que pour son côté', () => {
    // Filtre sur les deux côtés, distincts : filles du public / total du public
    expect(
      computeAggregation(
        EFFECTIFS,
        'effectif:sum{sexe:eq:F, secteur:eq:public} / effectif:sum{secteur:eq:public}'
      )
    ).toBe(0.6);
  });

  it('marche avec count et les autres fonctions', () => {
    expect(computeAggregation(EFFECTIFS, 'count{sexe:eq:F}')).toBe(2);
    expect(computeAggregation(EFFECTIFS, 'effectif:avg{secteur:eq:prive}')).toBe(50);
    expect(computeAggregation(EFFECTIFS, 'effectif:max{sexe:eq:M}')).toBe(80);
  });

  it('un filtre qui ne garde rien rend une somme nulle, et un ratio « — »', () => {
    expect(computeAggregation(EFFECTIFS, 'effectif:sum{sexe:eq:X}')).toBe(0);
    expect(computeAggregation(EFFECTIFS, 'effectif:sum / effectif:sum{sexe:eq:X}')).toBeNull();
  });

  it('accepte les opérateurs du where, dont in et les comparaisons', () => {
    expect(computeAggregation(EFFECTIFS, 'effectif:sum{ecole:in:A|B, effectif:gte:80}')).toBe(200);
  });
});

describe('#776 — la grammaire colon existante est inchangée', () => {
  it('count:champ:valeur, champ:fn et ratio simple', () => {
    expect(computeAggregation(EFFECTIFS, 'count:sexe:F')).toBe(2);
    expect(computeAggregation(EFFECTIFS, 'effectif:sum')).toBe(300);
    expect(computeAggregation(EFFECTIFS, 'count:sexe:F / count')).toBe(0.5);
  });
});

describe('#776 — un filtre non reconnu est une erreur de configuration', () => {
  it.each([
    ['opérateur inconnu', 'effectif:sum{sexe:egal:F}', 'opérateur inconnu'],
    ['valeur manquante', 'effectif:sum{sexe:eq}', 'valeur manquante'],
    ['accolades vides', 'effectif:sum{}', 'filtre vide'],
    ['accolade non fermée', 'effectif:sum{sexe:eq:F', 'mal formé'],
    ['texte après l’accolade', 'effectif:sum{sexe:eq:F}x', 'mal formé'],
    ['deux accolades', 'effectif:sum{sexe:eq:F}{a:eq:1}', 'mal formé'],
    ['meta:total filtré', 'meta:total{sexe:eq:F}', 'ne se filtre pas'],
    ['accès direct filtré', 'effectif{sexe:eq:F}', 'accès direct'],
    ['fonction inconnue', 'effectif:somme{sexe:eq:F}', 'inconnue'],
  ])('%s', (_label, expr, message) => {
    const parsed = parseExpression(expr);
    expect(parsed.type).toBe('invalid');
    expect(parsed.error).toContain(message);
  });

  it('dans un ratio, le côté fautif invalide le tout', () => {
    expect(parseExpression('effectif:sum{sexe:egal:F} / effectif:sum').type).toBe('invalid');
  });

  it('le KPI bloque sur un filtre fautif', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const kpi = new DsfrDataKpi();
    kpi.value = 'effectif:sum{sexe:egal:F} / effectif:sum';
    (kpi as unknown as { _validateConfig(): void })._validateConfig();
    expect(kpi.getAttribute('data-dsfr-config-error')).toContain('opérateur inconnu');
  });
});
