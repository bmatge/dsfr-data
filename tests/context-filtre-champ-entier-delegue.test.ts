import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #980 (PG-030, suite de #924 / #948) — l'avertissement « comparée en
 * TEXTE » ne sortait pas quand le filtre est DÉLÉGUÉ à une source dont les
 * lignes ne portent pas le champ.
 *
 * Montage mesuré par le banc (`sc_missions`, `reg` publié en `int`) : un KPI
 * agrégé côté serveur (`select=sum(nb_missions) as m`, `limit=1`) filtré par
 * région. La requête part avec `reg = "01"`, le portail ne trouve rien, le KPI
 * affiche « — »… et la console reste muette : la réponse ne ramène que `m`,
 * le type de `reg` ne s'observe dans aucune ligne, et #948 se taisait par
 * construction. C'est le montage le plus courant (la page réelle
 * `/sports/portrait-territoire` en est un).
 *
 * Correctif : quand les lignes ne portent pas le champ, le type DÉCLARÉ par
 * le jeu (`/datasets/<id>`, lu une fois par jeu) décide. La clause émise,
 * elle, ne change pas.
 *
 * Les tests montent de VRAIES `dsfr-data-source` Opendatasoft, fetch simulé
 * sur les réponses réelles du portail (relevées le 2026-09-23).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-source.js';
import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import { clearDataCache } from '@/utils/data-bridge.js';
import {
  checkNumericFieldMismatch,
  resetNumericFieldMismatchWarnings,
} from '@/utils/numeric-field-mismatch.js';
import { getAdapter } from '@/adapters/adapter-registry.js';
import { OpenDataSoftAdapter, odsFieldKind } from '@/adapters/opendatasoft-adapter.js';

const BASE = 'https://data.sports.gouv.fr';
const DATASET_META = `${BASE}/api/explore/v2.1/catalog/datasets/sc_missions`;

/** Métadonnées réelles du jeu : `reg` en int, `dep` en text. */
const FIELDS = [
  { name: 'annee', type: 'text' },
  { name: 'reg', type: 'int' },
  { name: 'dep', type: 'text' },
  { name: 'nb_missions', type: 'int' },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let urls: string[] = [];
let metaStatus = 200;

/** Le portail : agrégat, lignes brutes, et métadonnées du jeu. */
function portal(u: string): Response {
  const url = decodeURIComponent(String(u)).replace(/\+/g, ' ');
  urls.push(url);
  if (!url.includes('/records')) {
    return metaStatus === 200 ? json({ fields: FIELDS }) : json({}, metaStatus);
  }
  const filtered01 = url.includes('reg = "01"');
  if (url.includes('select=sum(nb_missions) as m')) {
    return json({ total_count: 0, results: [{ m: filtered01 ? null : 86406 }] });
  }
  const rows = filtered01
    ? []
    : [
        { reg: 94, nb_missions: 207 },
        { reg: 84, nb_missions: 272 },
        { reg: 75, nb_missions: 7607 },
      ];
  return json({ total_count: rows.length, results: rows });
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function settle() {
  for (let i = 0; i < 6; i++) await tick(5);
}

/** Les avertissements de ce piège-là, à l'exclusion de tout autre */
function mismatches(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((m: string) => m.includes('en TEXTE'));
}

const metaRequests = () => urls.filter((u) => u === DATASET_META);

const AGGREGATED = `<dsfr-data-source id="a" api-type="opendatasoft" base-url="${BASE}"
  dataset-id="sc_missions" where="annee = '2024'" select="sum(nb_missions) as m" limit="1"></dsfr-data-source>`;
const RAW = `<dsfr-data-source id="b" api-type="opendatasoft" base-url="${BASE}"
  dataset-id="sc_missions" where="annee = '2024'" select="reg, nb_missions" max-records="200"></dsfr-data-source>`;

async function mount(sources: string, body: string, field = 'reg') {
  document.body.innerHTML = `
    <select id="sel"><option value=""></option><option value="01">01</option>
      <option value="02">02</option><option value="75">75</option></select>
    <dsfr-data-context id="ctx" sources="${sources}">
      <dsfr-data-context-filter ui="sel" field="${field}"></dsfr-data-context-filter>
    </dsfr-data-context>
    ${body}`;
  await settle();
  return document.getElementById('sel') as HTMLSelectElement;
}

async function choose(sel: HTMLSelectElement, value: string) {
  sel.value = value;
  sel.dispatchEvent(new Event('change'));
  await settle();
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  urls = [];
  metaStatus = 200;
  resetNumericFieldMismatchWarnings();
  (getAdapter('opendatasoft') as OpenDataSoftAdapter).resetFieldTypesCache();
  for (const id of ['a', 'b']) clearDataCache(id);
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (u: string) => portal(u));
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  document.body.innerHTML = '';
});

describe('#980 (PG-030) — filtre délégué à une source agrégée côté serveur', () => {
  it('le piège se dit : source agrégée, aucune ligne ne porte « reg », le jeu le déclare int', async () => {
    const sel = await mount('a', AGGREGATED);
    await choose(sel, '01');

    const messages = mismatches(warn);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('(reg)');
    expect(messages[0]).toContain('"01"');
    expect(messages[0]).toContain('"a"');
    expect(messages[0]).toContain('NOMBRE');
    expect(messages[0]).toContain('type nombre déclaré par le jeu');
    expect(messages[0]).toContain('("1")');
  });

  it('la clause délégué part inchangée, avant la lecture du type', async () => {
    const sel = await mount('a', AGGREGATED);
    const listen = (e: Event) => urls.push(`COMMANDE ${(e as CustomEvent).detail.where}`);
    document.addEventListener('dsfr-data-source-command', listen);
    await choose(sel, '01');
    document.removeEventListener('dsfr-data-source-command', listen);

    // La clause est celle d'avant, et part vraiment au portail
    expect(urls.some((u) => u.includes('/records') && u.includes('reg = "01"'))).toBe(true);
    // La commande est émise d'abord : la lecture du type vient après, sans la retenir
    const command = urls.indexOf('COMMANDE reg = "01"');
    expect(command).toBeGreaterThan(-1);
    expect(urls.indexOf(DATASET_META)).toBeGreaterThan(command);
  });

  it('« 75 » survit à l’aller-retour : silence, et pas une requête de plus', async () => {
    const sel = await mount('a', AGGREGATED);
    await choose(sel, '75');

    expect(mismatches(warn)).toEqual([]);
    expect(metaRequests()).toEqual([]);
  });

  it('un seul message et une seule lecture du type, quel que soit le nombre de gestes', async () => {
    const sel = await mount('a', AGGREGATED);
    for (let i = 0; i < 12; i++) await choose(sel, ['01', '02', '75', ''][i % 4]);

    expect(mismatches(warn)).toHaveLength(1);
    expect(metaRequests()).toHaveLength(1);
  });

  it('se tait quand le jeu déclare le champ en texte', async () => {
    // `dep` est déclaré text : « 01 » y est une valeur légitime
    const sel = await mount('a', AGGREGATED, 'dep');
    await choose(sel, '01');

    expect(mismatches(warn)).toEqual([]);
  });

  it('se tait quand les métadonnées du jeu ne répondent pas', async () => {
    metaStatus = 403;
    const sel = await mount('a', AGGREGATED);
    await choose(sel, '01');

    expect(mismatches(warn)).toEqual([]);
  });

  it('les deux montages du banc : un message par source, pas trois', async () => {
    const sel = await mount('a b', AGGREGATED + RAW);
    await choose(sel, '01');
    await choose(sel, '75');
    await choose(sel, '01');

    const messages = mismatches(warn);
    expect(messages).toHaveLength(2);
    // Source agrégée : preuve par le type déclaré
    expect(messages.find((m) => m.includes('"a"'))).toContain('type nombre déclaré par le jeu');
    // Source aux lignes brutes : preuve par la donnée, comme avant (#948)
    expect(messages.find((m) => m.includes('"b"'))).toContain('(ex. 94)');
  });
});

describe('#980 — non-régression du chemin client (#948)', () => {
  it('lignes qui portent le champ en nombre : message par la donnée, sans lire le type déclaré', async () => {
    const sel = await mount('b', RAW);
    await choose(sel, '01');

    const messages = mismatches(warn);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('(ex. 94)');
    expect(metaRequests()).toEqual([]);
  });

  it('lignes qui portent le champ en texte : silence, même si le jeu le déclarait int', async () => {
    mockFetch.mockImplementation(async (u: string) => {
      const url = decodeURIComponent(String(u));
      urls.push(url);
      if (!url.includes('/records')) return json({ fields: FIELDS });
      return json({ total_count: 1, results: [{ reg: '01', nb_missions: 3 }] });
    });
    const sel = await mount('b', RAW);
    await choose(sel, '01');

    expect(mismatches(warn)).toEqual([]);
    expect(urls.filter((u) => u === DATASET_META)).toEqual([]);
  });

  it('une source sans type déclaré (adaptateur qui ne sait pas le dire) : silence', async () => {
    const el = document.createElement('div');
    el.id = 'fake';
    (el as unknown as Record<string, unknown>).getAdapter = () => ({ capabilities: {} });
    document.body.appendChild(el);
    await checkNumericFieldMismatch('fake', 'reg:eq:01');

    expect(mismatches(warn)).toEqual([]);
    el.remove();
  });
});

describe('#980 — describeFieldTypes (adaptateur Opendatasoft)', () => {
  it('lit fields[].type, une requête par jeu, passe par le proxy', async () => {
    const adapter = new OpenDataSoftAdapter();
    const params = {
      baseUrl: BASE,
      datasetId: 'sc_missions',
      proxyUrl: 'https://proxy.example/ods-proxy',
    };
    const first = await adapter.describeFieldTypes(params);
    const second = await adapter.describeFieldTypes(params);

    expect(first).toEqual({ annee: 'text', reg: 'number', dep: 'text', nb_missions: 'number' });
    expect(second).toBe(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rend un objet vide sur une erreur réseau, sans lever', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockFetch.mockRejectedValueOnce(new Error('réseau'));
    await expect(adapter.describeFieldTypes({ baseUrl: BASE, datasetId: 'x' })).resolves.toEqual(
      {}
    );
  });
});

describe('#1138 — describeFieldTypes rend un type normalisé', () => {
  it('Opendatasoft traduit ses types bruts dans l’adaptateur', () => {
    const cas: Array<[string, string]> = [
      ['int', 'number'],
      ['double', 'number'],
      ['decimal', 'number'],
      ['text', 'text'],
      ['date', 'date'],
      ['datetime', 'date'],
      ['boolean', 'bool'],
      ['geo_point_2d', 'geo'],
      ['geo_shape', 'geo'],
      ['file', 'other'],
      ['json_blob', 'other'],
    ];
    for (const [brut, normalise] of cas) expect(odsFieldKind(brut), brut).toBe(normalise);
  });

  it('un adaptateur tiers qui rend « number » suffit : le composant ne connaît aucun type brut', async () => {
    const el = document.createElement('div');
    el.id = 'tiers';
    Object.assign(el, {
      getAdapter: () => ({ describeFieldTypes: async () => ({ code: 'number' }) }),
      getAdapterParams: () => ({ datasetId: 'jeu' }),
    });
    document.body.appendChild(el);
    await checkNumericFieldMismatch('tiers', 'code:eq:01');

    const messages = mismatches(warn);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('type nombre déclaré par le jeu');
    // Aucun vocabulaire de fournisseur dans le message
    expect(messages[0]).not.toMatch(/portail|refine|opendatasoft/i);
    el.remove();
  });

  it('un type brut qui ne serait pas normalisé (« int ») ne déclenche plus rien', async () => {
    const el = document.createElement('div');
    el.id = 'brut';
    Object.assign(el, {
      getAdapter: () => ({ describeFieldTypes: async () => ({ code: 'int' }) }),
      getAdapterParams: () => ({ datasetId: 'jeu' }),
    });
    document.body.appendChild(el);
    await checkNumericFieldMismatch('brut', 'code:eq:01');

    expect(mismatches(warn)).toEqual([]);
    el.remove();
  });
});
