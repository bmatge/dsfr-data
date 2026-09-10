import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #739 — `weight-field` : le compteur d'une facette annonce la SOMME d'une
 * mesure au lieu d'un nombre de lignes. Sur une table de relevés, « 1 240 »
 * lignes ne dit rien au lecteur ; la somme des effectifs, si.
 *
 * L'attribut est CLIENT UNIQUEMENT : en mode `server-facets`, la réponse de
 * l'API facettes ne porte qu'un nombre de lignes. Plutôt qu'un nombre faux
 * sous un libellé de somme, les compteurs y sont masqués, une erreur de
 * configuration est posée et un avertissement DSFR est rendu.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

const ROWS = [
  { region: 'IDF', effectif: 1000, label: 'a' },
  { region: 'IDF', effectif: 240, label: 'b' },
  { region: 'BRE', effectif: 3000, label: 'c' },
  { region: 'BRE', effectif: '1 500,5', label: 'd' },
  { region: 'BRE', effectif: 'n/a', label: 'e' },
];

let seq = 0;
const mounted: DsfrDataFacets[] = [];
const warn = vi.fn<(...args: unknown[]) => void>();
const error = vi.fn<(...args: unknown[]) => void>();

async function mountFacets(
  configure: (el: DsfrDataFacets) => void,
  rows: Record<string, unknown>[] = ROWS
): Promise<DsfrDataFacets> {
  const sourceId = `wf-src-${++seq}`;
  clearDataCache(sourceId);
  const facets = new DsfrDataFacets();
  facets.id = `wf-facets-${seq}`;
  facets.source = sourceId;
  facets.fields = 'region';
  configure(facets);
  document.body.appendChild(facets);
  mounted.push(facets);
  dispatchDataLoaded(sourceId, rows);
  await facets.updateComplete;
  return facets;
}

beforeEach(() => {
  warn.mockClear();
  error.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(warn);
  vi.spyOn(console, 'error').mockImplementation(error);
});

afterEach(() => {
  for (const f of mounted.splice(0)) f.remove();
  vi.restoreAllMocks();
});

describe('weight-field (#739)', () => {
  describe('mode client', () => {
    it('remplace le nombre de lignes par la somme du champ', async () => {
      const facets = await mountFacets((f) => {
        f.weightField = 'effectif';
      });
      const values = facets._computeFacetValues('region');
      const byValue = new Map(values.map((v) => [v.value, v.count]));
      expect(byValue.get('IDF')).toBe(1240);
      // 3000 + 1500,5 (format francais) + 'n/a' compte pour zero
      expect(byValue.get('BRE')).toBe(4500.5);
    });

    it('sans weight-field, le compteur reste un nombre de lignes', async () => {
      const facets = await mountFacets(() => {});
      const byValue = new Map(facets._computeFacetValues('region').map((v) => [v.value, v.count]));
      expect(byValue.get('IDF')).toBe(2);
      expect(byValue.get('BRE')).toBe(3);
    });

    it('le tri count porte sur la somme, pas sur le nombre de lignes', async () => {
      const facets = await mountFacets((f) => {
        f.weightField = 'effectif';
        f.sort = 'count:desc';
      });
      // BRE a 3 lignes contre 2 pour IDF, et la plus grosse somme : meme ordre.
      // On inverse les poids pour separer les deux criteres.
      const other = await mountFacets(
        (f) => {
          f.weightField = 'effectif';
          f.sort = 'count:desc';
        },
        [
          { region: 'IDF', effectif: 9000 },
          { region: 'BRE', effectif: 1 },
          { region: 'BRE', effectif: 1 },
          { region: 'BRE', effectif: 1 },
        ]
      );
      expect(facets._computeFacetValues('region')[0].value).toBe('BRE');
      expect(other._computeFacetValues('region')[0].value).toBe('IDF');
    });

    it('formate la somme a la francaise dans le rendu', async () => {
      const facets = await mountFacets((f) => {
        f.weightField = 'effectif';
      });
      const text = facets.renderRoot?.textContent ?? '';
      // Espace insecable etroit ou insecable selon la plateforme
      expect(text.replace(/[\u202f\u00a0\u2009 ]/g, ' ')).toContain('4 500,5');
    });

    it('annonce un total, pas un nombre de resultats, aux lecteurs d ecran', async () => {
      const facets = await mountFacets((f) => {
        f.weightField = 'effectif';
      });
      const srOnly = [...(facets.renderRoot?.querySelectorAll('.fr-sr-only') ?? [])]
        .map((el) => el.textContent ?? '')
        .join(' ');
      expect(srOnly).toContain('total');
      expect(srOnly).not.toContain('resultats');
    });

    it('signale une seule fois un champ absent des donnees', async () => {
      const facets = await mountFacets((f) => {
        f.weightField = 'inconnu';
      });
      const values = facets._computeFacetValues('region');
      expect(values.every((v) => v.count === 0)).toBe(true);
      facets._computeFacetValues('region');
      const messages = warn.mock.calls.map((a) => a.map(String).join(' '));
      expect(messages.filter((m) => m.includes('weight-field="inconnu"'))).toHaveLength(1);
    });

    it('ne perd pas de precision sur les sommes flottantes', async () => {
      const facets = await mountFacets(
        (f) => {
          f.weightField = 'v';
        },
        [
          { region: 'IDF', v: 0.1 },
          { region: 'IDF', v: 0.2 },
        ]
      );
      expect(facets._computeFacetValues('region')[0].count).toBe(0.3);
    });
  });

  describe('mode server-facets : refus explicite', () => {
    it('masque les compteurs plutot que d annoncer un nombre de lignes', async () => {
      const facets = await mountFacets((f) => {
        f.weightField = 'effectif';
        f.serverFacets = true;
      });
      expect(facets._weightUnsupported).toBe(true);
      expect(facets._effectiveHideCounts).toBe(true);
    });

    it('pose une erreur de configuration lisible', async () => {
      const facets = await mountFacets((f) => {
        f.weightField = 'effectif';
        f.serverFacets = true;
      });
      const attr = facets.getAttribute('data-dsfr-config-error') ?? '';
      expect(attr).toContain('weight-field');
      expect(attr).toContain('server-facets');
      const messages = error.mock.calls.map((a) => a.map(String).join(' '));
      expect(messages.some((m) => m.includes('weight-field'))).toBe(true);
    });

    it('rend un avertissement DSFR au-dessus des facettes', async () => {
      const facets = await mountFacets((f) => {
        f.weightField = 'effectif';
        f.serverFacets = true;
      });
      const alert = facets.renderRoot?.querySelector('.fr-alert--warning');
      expect(alert?.textContent).toContain('weight-field');
    });

    it('leve le marqueur quand server-facets est retire', async () => {
      const facets = await mountFacets((f) => {
        f.weightField = 'effectif';
        f.serverFacets = true;
      });
      facets.serverFacets = false;
      await facets.updateComplete;
      expect(facets.hasAttribute('data-dsfr-config-error')).toBe(false);
      expect(facets._effectiveHideCounts).toBe(false);
    });
  });
});
