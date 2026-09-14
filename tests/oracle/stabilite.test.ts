import { describe, it, expect } from 'vitest';
import {
  LIMITE_STABILITE,
  PAUSE_STABILITE,
  lireJusquAStabilite,
  memeLecture,
} from '../../tools/oracle/stabilite.js';

/**
 * La scrutation de stabilité, éprouvée SANS navigateur et sans horloge réelle.
 *
 * C'est tout l'intérêt de lui avoir injecté son attente et son horloge : un
 * test qui dormirait vraiment 150 ms par lecture serait lent, et un test qui
 * dépendrait de l'ordonnanceur serait exactement le genre d'instabilité que
 * cette fonction existe pour supprimer.
 */
describe('vérification des données — attendre qu’une observation ne bouge plus', () => {
  /** Une horloge et une attente factices : dormir AVANCE l'horloge, rien de plus. */
  function faux() {
    let instant = 0;
    const attentes: number[] = [];
    return {
      attentes,
      maintenant: () => instant,
      dormir: async (ms: number) => {
        attentes.push(ms);
        instant += ms;
      },
    };
  }

  it('rend la première valeur confirmée par une seconde lecture identique', async () => {
    const { maintenant, dormir, attentes } = faux();
    const lectures = [{ v: 8 }, { v: 8 }];
    let i = 0;
    const out = await lireJusquAStabilite(async () => lectures[Math.min(i++, 1)], {
      maintenant,
      dormir,
    });
    expect(out).toEqual({ v: 8 });
    // Deux lectures, une seule attente — et elle dure bien le délai annoncé.
    expect(i).toBe(2);
    expect(attentes).toEqual([PAUSE_STABILITE]);
  });

  it('ne s’arrête pas sur une valeur encore en mouvement', async () => {
    const { maintenant, dormir } = faux();
    // La valeur d'AVANT le geste, puis un rendu intermédiaire, puis la bonne.
    const lectures = [{ v: 25 }, { v: 25 }, { v: 8 }, { v: 8 }];
    let i = 0;
    const out = await lireJusquAStabilite(
      async () => lectures[Math.min(i++, lectures.length - 1)],
      { maintenant, dormir, egales: (a, b) => a.v === b.v && a.v === 8 }
    );
    expect(out).toEqual({ v: 8 });
  });

  it('deux lectures absentes ne passent JAMAIS pour une stabilité', async () => {
    expect(memeLecture(null, null)).toBe(false);
    expect(memeLecture(undefined, undefined)).toBe(false);
    expect(memeLecture({ a: 1 }, { a: 1 })).toBe(true);
    expect(memeLecture({ a: 1 }, { a: 2 })).toBe(false);
    expect(memeLecture([1, 2], [1, 2])).toBe(true);

    const { maintenant, dormir } = faux();
    await expect(lireJusquAStabilite(async () => null, { maintenant, dormir })).rejects.toThrow(
      /n’est pas stabilisée/
    );
  });

  it('échoue en nommant ce qu’on observait et la dernière valeur vue', async () => {
    const { maintenant, dormir } = faux();
    let n = 0;
    const promesse = lireJusquAStabilite(async () => ({ compteur: n++ }), {
      maintenant,
      dormir,
      quoi: '#k-n (kpi)',
    });
    await expect(promesse).rejects.toThrow('#k-n (kpi)');
    // La borne est bien celle qui est annoncée : pas d'attente sans fin.
    expect(n).toBeGreaterThan(LIMITE_STABILITE / PAUSE_STABILITE);
  });
});
