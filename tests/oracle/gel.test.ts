import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  chargerGels,
  datasetDe,
  geler,
  HOTE_GEL,
  reecrireBalisage,
  repondreGel,
  type Gel,
} from '../../tools/oracle/gel.js';
import type { Check } from '../../tools/oracle/manifest.js';
import {
  repondreOdsExport,
  repondreOdsFacets,
  repondreOdsMetadonnees,
  repondreOdsRecords,
} from '../builder-e2e/api-fixtures.js';

/**
 * Le GEL d'un échec (#884) : un contrôle vivant devient un contrôle figé,
 * hermétique — ses lignes brutes en fixtures, son balisage tourné vers le
 * faux serveur, ses secrets retirés — et le faux serveur le sert comme un
 * portail. Ce test tient la réécriture, l'absence de clé, la relecture, et
 * le service des lignes gelées.
 */

const dossiers: string[] = [];
afterEach(() => {
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true });
});

const VIVANT: Check = {
  id: 'bofip-total',
  mode: 'live',
  page: 'viz/bofip',
  constats: ['AM-034'],
  origin: 'viz/bofip — le total',
  feed: {
    kind: 'raw',
    source: {
      url: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/bofip-vigueur/exports/json?select=type',
    },
    sources: {
      corr: { baseUrl: 'https://data.economie.gouv.fr', dataset: 'bfn-table-de-correspondance' },
    },
  },
  markup: `
  <dsfr-data-source id="b" api-type="opendatasoft" base-url="https://data.economie.gouv.fr"
    dataset-id="bofip-vigueur" fetch-mode="export" max-records="10" api-key-ref="ods-mef"></dsfr-data-source>
  <dsfr-data-source id="c" api-type="opendatasoft" base-url="https://data.economie.gouv.fr"
    dataset-id="bfn-table-de-correspondance" headers='{"apikey":"secret"}'></dsfr-data-source>
  <dsfr-data-kpi id="k" source="b" value="count"></dsfr-data-kpi>`,
  expects: [{ kind: 'kpi', id: 'k', agg: 'count', crosscheck: { select: 'count(*) as v' } }],
};

const LIGNES = [
  { type: 'BOI', n: 1 },
  { type: 'BOI', n: 2 },
  { type: 'RES', n: 3 },
];

describe('geler', () => {
  it('produit un contrôle déterministe, hermétique, sans clé ni recoupement', () => {
    const gel = geler(
      'banc-pages',
      VIVANT,
      { main: LIGNES, corr: [{ code: '1' }] },
      ['kpi:k : affiché 9, recalculé 3'],
      '2026-09-19T03:00:00Z'
    );
    expect(gel.check.id).toBe('bofip-total-gel');
    expect(gel.check.mode).toBe('deterministic');
    expect(gel.check.feed).toEqual({
      kind: 'fixture',
      datasets: { main: LIGNES, corr: [{ code: '1' }] },
    });
    expect(gel.check.page).toBe('viz/bofip');
    expect(gel.check.constats).toEqual(['AM-034']);
    expect(gel.check.origin).toContain('GEL du 2026-09-19');
    expect(gel.check.origin).toContain('affiché 9, recalculé 3');
    expect(gel.check.markup).toContain(`base-url="${HOTE_GEL}/bofip-total-gel"`);
    expect(gel.check.markup).not.toContain('data.economie.gouv.fr');
    expect(gel.check.markup).not.toContain('api-key-ref');
    expect(gel.check.markup).not.toContain('headers=');
    expect(gel.check.markup).not.toContain('secret');
    expect(gel.check.expects[0]).not.toHaveProperty('crosscheck');
    expect(gel.provenance.datasets).toEqual({
      'bofip-vigueur': 'main',
      'bfn-table-de-correspondance': 'corr',
    });
    expect(JSON.stringify(gel)).not.toMatch(/apikey|api-key-ref|secret/);
  });

  it('nomme les clauses que le faux serveur ne saura pas rejouer', () => {
    const avecFonction: Check = {
      ...VIVANT,
      markup: `${VIVANT.markup}\n<dsfr-data-source id="d" base-url="https://x" dataset-id="y" where="year(annee) = 2025"></dsfr-data-source>`,
    };
    const gel = geler('banc-pages', avecFonction, { main: LIGNES }, []);
    expect(gel.provenance.reserves).toHaveLength(1);
    expect(gel.provenance.reserves[0]).toContain('year(annee) = 2025');
    expect(geler('banc-pages', VIVANT, { main: LIGNES }, []).provenance.reserves).toEqual([]);
  });

  it('datasetDe et reecrireBalisage', () => {
    expect(
      datasetDe({ url: 'https://p/api/explore/v2.1/catalog/datasets/a%20b/exports/json?x=1' })
    ).toBe('a b');
    expect(datasetDe({ dataset: 'jeu' })).toBe('jeu');
    expect(datasetDe({ url: 'https://tabular/api/resources/x/data/' })).toBeNull();
    expect(reecrireBalisage('<x base-url="http://a.b" api-key-ref="k">', 'g')).toBe(
      `<x base-url="${HOTE_GEL}/g">`
    );
  });
});

describe('repondreGel et chargerGels', () => {
  const repondeurs = {
    exportJson: repondreOdsExport,
    records: repondreOdsRecords,
    facets: repondreOdsFacets,
    metadonnees: repondreOdsMetadonnees,
  };

  it('sert l’export, /records et /facets depuis les lignes gelées, comme un portail', () => {
    const gel = geler('banc-pages', VIVANT, { main: LIGNES, corr: [{ code: '1' }] }, []);
    const base = `${HOTE_GEL}/bofip-total-gel/api/explore/v2.1/catalog/datasets`;
    expect(
      repondreGel(new URL(`${base}/bofip-vigueur/exports/json?limit=2`), [gel], repondeurs)
    ).toEqual(LIGNES.slice(0, 2));
    expect(
      repondreGel(
        new URL(`${base}/bofip-vigueur/exports/json?where=type%20%3D%20%22RES%22`),
        [gel],
        repondeurs
      )
    ).toEqual([LIGNES[2]]);
    const records = repondreGel(
      new URL(`${base}/bofip-vigueur/records?limit=10`),
      [gel],
      repondeurs
    ) as { total_count: number };
    expect(records.total_count).toBe(3);
    expect(
      repondreGel(new URL(`${base}/bfn-table-de-correspondance/exports/json`), [gel], repondeurs)
    ).toEqual([{ code: '1' }]);
    // Un jeu ou un contrôle inconnu, un autre hôte : rien, et l'appelant refuse la requête.
    expect(repondreGel(new URL(`${base}/inconnu/exports/json`), [gel], repondeurs)).toBeNull();
    expect(
      repondreGel(
        new URL(
          `${HOTE_GEL}/autre-gel/api/explore/v2.1/catalog/datasets/bofip-vigueur/exports/json`
        ),
        [gel],
        repondeurs
      )
    ).toBeNull();
    expect(
      repondreGel(
        new URL(
          'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/bofip-vigueur/exports/json'
        ),
        [gel],
        repondeurs
      )
    ).toBeNull();
  });

  it('relit un dossier de gels, et rend vide un dossier absent', () => {
    const dossier = mkdtempSync(resolve(tmpdir(), 'gel-'));
    dossiers.push(dossier);
    const gel = geler('banc-pages', VIVANT, { main: LIGNES }, ['x']);
    writeFileSync(resolve(dossier, 'bofip-total-gel.json'), JSON.stringify(gel));
    writeFileSync(resolve(dossier, 'README.md'), 'pas un gel');
    const relus: Gel[] = chargerGels(dossier);
    expect(relus).toHaveLength(1);
    expect(relus[0].check.id).toBe('bofip-total-gel');
    expect(relus[0].provenance.controle).toBe('bofip-total');
    expect(chargerGels(resolve(dossier, 'nulle-part'))).toEqual([]);
  });
});
