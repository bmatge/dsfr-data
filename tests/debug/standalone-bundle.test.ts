import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le bundle autonome de diagnostic (#608) et sa SEPARATION.
 *
 * La promesse : une balise `<script>` suffit a diagnostiquer n'importe quelle
 * page utilisant dsfr-data, y compris en production, sans rebuild. Elle tient
 * parce que le bus est plat et global — l'observateur n'a besoin de rien de
 * la bibliotheque.
 *
 * La contrepartie, et c'est ce que ce fichier verrouille : **cet outil
 * d'atelier ne doit peser sur AUCUN bundle publie**. Une page gouvernementale
 * n'a pas a embarquer un debogueur. Meme doctrine que `no-cdn-in-core`.
 *
 * Les tests sont ignores si `dist/` n'existe pas (poste sans build) plutot
 * que rouges : un garde-fou qui casse pour une raison etrangere a ce qu'il
 * garde finit par etre desactive.
 */

const DIST = join(__dirname, '../../packages/core/dist');
const built = existsSync(join(DIST, 'dsfr-data.esm.js'));

/** Symboles qui n'ont RIEN a faire dans un bundle publie. */
const SYMBOLES_DEBUG = [
  'DataflowRecorder',
  'snapshotGraph',
  'formatTrace',
  'summarizeTrace',
  'earlyBufferScript',
  'dsfr-data-debug-overlay',
];

/** Les trois bundles reellement publies sur npm et le CDN. */
const BUNDLES_PUBLIES = [
  'dsfr-data.esm.js',
  'dsfr-data.umd.js',
  'dsfr-data.core.esm.js',
  'dsfr-data.core.umd.js',
  'dsfr-data.map.esm.js',
  'dsfr-data.map.umd.js',
];

describe.skipIf(!built)('le diagnostic ne pese pas sur les bundles publies (#608)', () => {
  for (const fichier of BUNDLES_PUBLIES) {
    it(`${fichier} ne contient aucun symbole de diagnostic`, () => {
      const chemin = join(DIST, fichier);
      if (!existsSync(chemin)) return;
      const source = readFileSync(chemin, 'utf-8');

      for (const symbole of SYMBOLES_DEBUG) {
        expect(source.includes(symbole), `${fichier} contient « ${symbole} »`).toBe(false);
      }
    });
  }

  it('le collecteur n’est importé par aucun composant du coeur', () => {
    // La seule porte d'entree autorisee est `index-debug.ts`. Un composant qui
    // importerait le collecteur le ferait entrer dans les bundles publies, et
    // le test ci-dessus ne le dirait qu'apres un build complet.
    const composants = join(__dirname, '../../packages/core/src/components');
    for (const f of readdirSync(composants).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(join(composants, f), 'utf-8');
      expect(src.includes('DataflowRecorder'), `${f} importe le collecteur`).toBe(false);
      expect(src.includes('/debug/'), `${f} importe le module debug`).toBe(false);
    }
  });
});

describe.skipIf(!built)('le bundle autonome', () => {
  const chemin = join(DIST, 'dsfr-data.debug.js');

  it('est produit', () => {
    expect(existsSync(chemin)).toBe(true);
  });

  it('reste léger — c’est un outil, pas une bibliothèque', () => {
    // 60 Ko est deja tres large : le jour ou ce plafond saute, c'est que le
    // bundle a happe autre chose (un composant, Leaflet…).
    const ko = statSync(chemin).size / 1024;
    expect(ko).toBeLessThan(60);
  });

  it('n’embarque aucun composant dsfr-data', () => {
    // La promesse « aucune dependance a la bibliotheque » est ce qui permet
    // de l'injecter sur une page tierce.
    const source = readFileSync(chemin, 'utf-8');

    expect(source).not.toContain('customElements.define');
    expect(source).not.toContain('LitElement');
    expect(source).not.toContain('leaflet');
  });

  it('porte bien le collecteur et son incrustation', () => {
    const source = readFileSync(chemin, 'utf-8');

    expect(source).toContain('dsfr-data-loaded');
    expect(source).toContain('dsfrDataDebug');
    expect(source).toContain('__dsfrDataCache');
  });

  it('s’installe sans module ni import map', () => {
    // Format UMD/IIFE : un marque-page ne peut pas charger un module ESM.
    const source = readFileSync(chemin, 'utf-8');

    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/^\s*export\s+\{/m);
  });
});
