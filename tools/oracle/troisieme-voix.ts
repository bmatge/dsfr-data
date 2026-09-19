/**
 * La TROISIÈME VOIX dans le spec (#880) : lire `tests/verif-donnees/attendus.json`
 * — produit par `python3 tools/oracle-py/oracle.py`, versionné — et rendre
 * chaque entrée sous la forme d'un `Attendu`, pour que `comparer()` mette la
 * page en regard de l'oracle Python exactement comme elle l'est de l'oracle
 * TypeScript. Deux écarts sur la même observation, ou aucun.
 *
 * Ce module ne calcule rien : il traduit. Le fichier absent n'est pas une
 * erreur — la page garde ses deux voix, et le rapport dit combien en ont trois.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { Expect } from './manifest.js';
import type { Attendu } from './expected.js';

/** Une entrée d'`attendus.json`, telle que la troisième voix l'écrit. */
export interface EntreePython {
  domaine: string;
  controle: string;
  cle: string;
  kind: string;
  couvert: boolean;
  raison?: string;
  valeur?: unknown;
  brut?: number | null;
  decimals?: number;
}

/** Les entrées couvertes, par `domaine/controle/cle`. Fichier absent : aucune. */
export function lireAttendusPython(chemin: string): Map<string, EntreePython> {
  const out = new Map<string, EntreePython>();
  if (!existsSync(chemin)) return out;
  const brut = JSON.parse(readFileSync(chemin, 'utf-8')) as unknown[];
  for (const e of brut.slice(1) as EntreePython[]) {
    if (e.couvert) out.set(`${e.domaine}/${e.controle}/${e.cle}`, e);
  }
  return out;
}

/**
 * L'attendu Python sous la forme que `comparer()` attend — la MÊME que
 * l'attendu TypeScript, pour que la comparaison lib ↔ Python soit la même
 * fonction que lib ↔ TS. `null` quand le genre n'est pas traduit.
 */
export function attenduPython(entree: EntreePython, expect: Expect): Attendu | null {
  switch (expect.kind) {
    case 'kpi': {
      if (expect.as === 'date') {
        return {
          kind: 'kpi',
          value: null,
          decimals: 0,
          texte: entree.valeur === null ? null : String(entree.valeur),
          pattern: expect.pattern,
        };
      }
      // La valeur AVANT arrondi : `comparer` arrondit lui-même à `decimals`,
      // comme pour l'oracle TS — sinon on comparerait un arrondi à un arrondi.
      const brut = entree.brut ?? null;
      return {
        kind: 'kpi',
        value: brut,
        decimals: entree.decimals ?? expect.decimals ?? 0,
        pattern: expect.pattern,
      };
    }
    case 'rows':
      return { kind: 'rows', rows: entree.valeur as Array<Record<string, unknown>> };
    case 'chart': {
      const v = entree.valeur as { labels: string[]; series: Array<Array<number | null>> };
      return { kind: 'chart', labels: v.labels, series: v.series };
    }
    case 'list':
      return { kind: 'list', rows: entree.valeur as Array<Record<string, unknown>> };
    case 'facets':
      return {
        kind: 'facets',
        values: entree.valeur as Array<{ value: string; count: number | null }>,
      };
    case 'text':
      if (expect.numeric) {
        return {
          kind: 'text',
          text: null,
          value: entree.brut ?? null,
          decimals: entree.decimals ?? expect.decimals ?? 0,
        };
      }
      return { kind: 'text', text: String(entree.valeur ?? ''), value: null, decimals: 0 };
    case 'texts':
      return {
        kind: 'texts',
        valeurs: entree.valeur as Array<string | number | null>,
        numeric: expect.numeric === true,
        decimals: entree.decimals ?? expect.decimals ?? 0,
        pattern: expect.pattern,
      };
    default:
      return null;
  }
}
