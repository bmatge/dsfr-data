import { describe, it, expect } from 'vitest';
import { examples } from '../../../apps/playground/src/examples/examples-data';
import type { AxePipeline, AxeSortie } from '../../../apps/playground/src/examples/catalogue';
import {
  catalogue,
  filtrer,
  EXEMPLE_PAR_DEFAUT,
  LIBELLES_PIPELINE,
  LIBELLES_SORTIE,
  LIBELLES_SOURCE,
} from '../../../apps/playground/src/examples/catalogue';

/**
 * Le catalogue est la seule liste d'exemples ecrite a la main : les `<option>`
 * de index.html sont desormais generees, et ce test ne recopie plus les cles.
 * Il verifie que catalogue et code ne peuvent pas diverger.
 */
describe('catalogue du playground', () => {
  it('etiquette exactement les exemples qui existent', () => {
    const idsCatalogue = catalogue.map((e) => e.id).sort();
    const idsCode = Object.keys(examples).sort();
    expect(idsCatalogue).toEqual(idsCode);
  });

  it("n'a pas d'id en double", () => {
    const ids = catalogue.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('donne a chaque exemple un titre et au moins une etiquette par axe', () => {
    for (const e of catalogue) {
      expect(e.title.trim(), `titre de ${e.id}`).not.toBe('');
      expect(e.source.length, `source de ${e.id}`).toBeGreaterThan(0);
      expect(e.pipeline.length, `pipeline de ${e.id}`).toBeGreaterThan(0);
      expect(e.output.length, `sortie de ${e.id}`).toBeGreaterThan(0);
    }
  });

  it("n'emploie que des valeurs d'axe declarees", () => {
    const sources = new Set(LIBELLES_SOURCE.map(([v]) => v));
    const pipelines = new Set(LIBELLES_PIPELINE.map(([v]) => v));
    const sorties = new Set(LIBELLES_SORTIE.map(([v]) => v));
    for (const e of catalogue) {
      for (const v of e.source) expect(sources.has(v), `${e.id}: source ${v}`).toBe(true);
      for (const v of e.pipeline) expect(pipelines.has(v), `${e.id}: pipeline ${v}`).toBe(true);
      for (const v of e.output) expect(sorties.has(v), `${e.id}: sortie ${v}`).toBe(true);
    }
  });

  it('charge un exemple par defaut qui existe', () => {
    expect(examples[EXEMPLE_PAR_DEFAUT]).toBeDefined();
  });

  it('rend tout le catalogue quand les trois filtres sont relaches', () => {
    expect(filtrer(null, null, null)).toHaveLength(catalogue.length);
  });

  it('intersecte bien les trois axes', () => {
    const retenus = filtrer('opendatasoft', 'query', 'chart');
    expect(retenus.length).toBeGreaterThan(0);
    for (const e of retenus) {
      expect(e.source).toContain('opendatasoft');
      expect(e.pipeline).toContain('query');
      expect(e.output).toContain('chart');
    }
  });
});

describe('code des exemples', () => {
  it('produit du HTML non vide contenant une source', () => {
    for (const e of catalogue) {
      const code = examples[e.id];
      expect(code, `code de ${e.id}`).toBeDefined();
      expect(code.trim().length, `code de ${e.id}`).toBeGreaterThan(0);
      expect(code, `source de ${e.id}`).toContain('<dsfr-data-source');
    }
  });

  it('etiquette « inline » exactement les exemples a donnees en dur', () => {
    for (const e of catalogue) {
      const enDur = /<dsfr-data-source[^>]*\sdata=/.test(examples[e.id]);
      expect(e.source.includes('inline'), `${e.id} : donnees en dur ${enDur}`).toBe(enDur);
    }
  });
});

/**
 * Coherence etiquette <-> code, dans les DEUX sens. Remplace les assertions
 * par categorie de l'ancien test : celles-ci ne portaient que sur des listes
 * de cles recopiees a la main, celle-ci porte sur tout le catalogue.
 */
const MARQUEURS_PIPELINE: Partial<Record<AxePipeline, RegExp>> = {
  query: /<dsfr-data-query/,
  normalize: /<dsfr-data-normalize/,
  search: /<dsfr-data-search/,
  facets: /<dsfr-data-facets/,
  join: /<dsfr-data-join/,
  concat: /<dsfr-data-concat/,
  repeat: /<dsfr-data-repeat/,
  context: /<dsfr-data-context/,
  pivot: /<dsfr-data-(un)?pivot/,
  'server-side': /server-side/,
  paginate: /\bpaginate\b/,
};

const MARQUEURS_SORTIE: Record<AxeSortie, RegExp> = {
  chart: /<dsfr-data-chart/,
  kpi: /<dsfr-data-kpi/,
  podium: /<dsfr-data-podium/,
  list: /<dsfr-data-list/,
  display: /<dsfr-data-display/,
  map: /<dsfr-data-map|type="map"|\blevel="/,
};

describe('coherence etiquette / code', () => {
  it('une etiquette de pipeline implique son composant dans le code', () => {
    for (const e of catalogue) {
      for (const [tag, marqueur] of Object.entries(MARQUEURS_PIPELINE)) {
        if (e.pipeline.includes(tag as AxePipeline)) {
          expect(marqueur.test(examples[e.id]), `${e.id} etiquete ${tag}`).toBe(true);
        }
      }
    }
  });

  it('un composant present dans le code implique son etiquette', () => {
    for (const e of catalogue) {
      for (const [tag, marqueur] of Object.entries(MARQUEURS_PIPELINE)) {
        if (marqueur.test(examples[e.id])) {
          expect(e.pipeline.includes(tag as AxePipeline), `${e.id} contient ${tag}`).toBe(true);
        }
      }
      for (const [tag, marqueur] of Object.entries(MARQUEURS_SORTIE)) {
        if (marqueur.test(examples[e.id])) {
          expect(e.output.includes(tag as AxeSortie), `${e.id} affiche ${tag}`).toBe(true);
        }
      }
    }
  });

  it('une etiquette de sortie implique son composant dans le code', () => {
    for (const e of catalogue) {
      for (const tag of e.output) {
        expect(MARQUEURS_SORTIE[tag].test(examples[e.id]), `${e.id} etiquete ${tag}`).toBe(true);
      }
    }
  });

  it('« direct » exclut toute transformation', () => {
    for (const e of catalogue.filter((x) => x.pipeline.includes('direct'))) {
      expect(e.pipeline, `${e.id}`).toEqual(['direct']);
      for (const [tag, marqueur] of Object.entries(MARQUEURS_PIPELINE)) {
        expect(marqueur.test(examples[e.id]), `${e.id} direct mais ${tag}`).toBe(false);
      }
    }
  });

  it('un exemple « display » porte un <template>', () => {
    for (const e of catalogue.filter((x) => x.output.includes('display'))) {
      expect(examples[e.id], `${e.id}`).toContain('<template>');
    }
  });

  it('ne perd aucun des 38 exemples historiques', () => {
    expect(catalogue.length).toBeGreaterThanOrEqual(38);
  });
});
