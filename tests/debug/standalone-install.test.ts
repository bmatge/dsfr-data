import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataflowRecorder } from '@dsfr-data/shared';
import { dispatchDataLoaded, clearDataCache, setDataCache } from '@/utils/data-bridge.js';

/**
 * L'aveu de trace reconstituee du bundle autonome (#608, D1).
 *
 * CE FICHIER EXISTE A CAUSE D'UN DEFAUT REEL. `install()` calculait
 *
 *     reconstitue = backfillFromCache(window) > 0 && snapshot().events.length === 0
 *
 * or `backfillFromCache` POUSSE un evenement par etape reconstituee : la
 * conjonction etait insatisfiable, et la banniere « Trace reconstituee depuis
 * le cache » ne pouvait JAMAIS s'afficher — y compris dans le cas qu'elle
 * vise, un script injecte sur une page tierce deja chargee. L'incrustation
 * presentait alors silencieusement une trace amputee de sa chronologie et de
 * ses erreurs comme une observation complete.
 *
 * On verifie ici l'INVARIANT qui rendait le calcul faux, plutot que le
 * bundle : le compte d'evenements doit etre releve AVANT le remplissage.
 */

describe('backfillFromCache pousse des événements — le compte doit se relever avant', () => {
  afterEach(() => {
    clearDataCache('bf-src');
    clearDataCache('bf-autre');
  });

  it('reconstituer depuis le cache ALIMENTE le journal', () => {
    // Le fait qui rendait la condition insatisfiable.
    setDataCache('bf-src', [{ a: 1 }]);
    const r = new DataflowRecorder({ root: document.body });
    r.start();

    const avant = r.snapshot().events.length;
    const complete = r.backfillFromCache(window);
    const apres = r.snapshot().events.length;
    r.stop();

    expect(avant).toBe(0);
    expect(complete).toBeGreaterThan(0);
    expect(apres).toBeGreaterThan(0);
    // La conjonction fautive : `complete > 0 && apres === 0` est impossible.
    expect(complete > 0 && apres === 0).toBe(false);
  });

  it('relevé AVANT, le verdict « reconstituée » est correct', () => {
    setDataCache('bf-src', [{ a: 1 }]);
    const r = new DataflowRecorder({ root: document.body });
    r.start();

    const observesAvant = r.snapshot().events.length;
    const complete = r.backfillFromCache(window);
    r.stop();

    expect(complete > 0 && observesAvant === 0).toBe(true);
  });

  it('une observation directe préalable rend la trace COMPLÈTE', () => {
    // Un collecteur precoce qui a tout vu ne doit pas etre accuse de
    // reconstitution parce que le cache a par ailleurs comble une etape.
    const r = new DataflowRecorder({ root: document.body });
    r.start();
    dispatchDataLoaded('bf-src', [{ a: 1 }]);
    setDataCache('bf-autre', [{ b: 1 }]);

    const observesAvant = r.snapshot().events.length;
    const complete = r.backfillFromCache(window);
    r.stop();

    expect(observesAvant).toBeGreaterThan(0);
    expect(complete > 0 && observesAvant === 0).toBe(false);
  });

  it('backfillFromCache ne réécrit jamais une étape déjà observée', () => {
    // L'observation directe prime : un instantane muet ne doit pas ecraser
    // une erreur reellement vue.
    const r = new DataflowRecorder({ root: document.body });
    r.start();
    dispatchDataLoaded('bf-src', [{ a: 1 }, { a: 2 }, { a: 3 }]);
    setDataCache('bf-src', [{ a: 1 }]);

    const complete = r.backfillFromCache(window);
    const rows = r.snapshot().states['bf-src'].rows;
    r.stop();

    expect(complete).toBe(0);
    expect(rows).toBe(3);
  });
});

describe('le code du bundle autonome relève bien le compte avant', () => {
  it('index-debug.ts n’évalue pas events.length après le backfill', () => {
    // Garde-fou textuel : la condition fautive etait subtile et le test
    // unitaire ci-dessus ne couvre pas le site d'appel lui-meme.
    const src = readFileSync(join(__dirname, '../../packages/core/src/index-debug.ts'), 'utf-8');

    const iAvant = src.indexOf('const observesAvant');
    const iBackfill = src.indexOf('backfillFromCache(window)');
    expect(iAvant).toBeGreaterThan(-1);
    expect(iAvant).toBeLessThan(iBackfill);
    expect(src).not.toContain('recorder.snapshot().events.length === 0');
  });
});
