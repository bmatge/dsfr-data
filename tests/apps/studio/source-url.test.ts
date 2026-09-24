/**
 * Outil `charger_source_url` du Studio IA (#1140) — reseau SIMULE.
 *
 * Chaque fournisseur : URL reconnue → source creee (forme de l'app Sources) ;
 * URL inconnue, jeu introuvable, ressource non tabulaire, Grist prive → refus
 * explicite, sans jamais demander de jeton. Puis la boucle : l'outil fait de
 * la source celle du document et du reste du tour.
 */
import { describe, it, expect, vi } from 'vitest';
import { createEmptyDashboard } from '@dsfr-data/shared';
import type { OpenAIResponse, PostChat } from '@dsfr-data/shared';
import {
  chargerSourceDepuisUrl,
  CHARGER_SOURCE_URL_TOOL,
  MAX_LIGNES_URL,
} from '../../../apps/studio/src/source-url';
import { definirSourceDuDocument } from '../../../apps/studio/src/document';
import { runStudioLoop } from '../../../apps/studio/src/ia/agent-loop';
import { buildSystemPrompt } from '../../../apps/studio/src/ia/system-prompt';

type Route = (url: string) => { status: number; body?: unknown } | null;

/** Reseau simule : la premiere route qui repond gagne ; sinon 599 (sortie inattendue). */
function reseau(...routes: Route[]) {
  const appels: string[] = [];
  const fetchImpl = vi.fn(async (entree: RequestInfo | URL) => {
    const url = String(entree);
    appels.push(url);
    for (const route of routes) {
      const r = route(url);
      if (r) return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }
    return new Response('{}', { status: 599 });
  }) as unknown as typeof fetch;
  return { fetchImpl, appels };
}

const JEI = [
  { annee: '2004', montant_d_exoneration: 62416226, nombre_de_jei: 1302 },
  { annee: '2010', montant_d_exoneration: 143485878, nombre_de_jei: 2937 },
  { annee: '2017', montant_d_exoneration: 187960511, nombre_de_jei: 3798 },
];

const ODS_URL = 'https://data.economie.gouv.fr/explore/dataset/les-jeunes-entreprises-innovantes/';

const odsOk: Route = (url) =>
  url.includes('/api/explore/v2.1/catalog/datasets/les-jeunes-entreprises-innovantes/records')
    ? { status: 200, body: { total_count: JEI.length, results: JEI } }
    : null;

describe('chargerSourceDepuisUrl — fournisseurs reconnus', () => {
  it('Opendatasoft sur domaine propre : source api, champs et lignes', async () => {
    const { fetchImpl, appels } = reseau(odsOk);
    const r = await chargerSourceDepuisUrl(ODS_URL, { fetchImpl });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toMatchObject({
      type: 'api',
      provider: 'opendatasoft',
      apiUrl:
        'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/les-jeunes-entreprises-innovantes/records',
      resourceIds: { datasetId: 'les-jeunes-entreprises-innovantes' },
      dataPath: 'results',
      recordCount: 3,
    });
    expect(r.source.data).toEqual(JEI);
    expect(r.fields.map((f) => f.name)).toEqual([
      'annee',
      'montant_d_exoneration',
      'nombre_de_jei',
    ]);
    expect(r.total).toBe(3);
    // Une seule page : moins de lignes que la taille de page.
    expect(appels).toHaveLength(1);
    expect(appels[0]).toContain('data.economie.gouv.fr/api/explore/v2.1/');
    expect(appels[0]).toContain('limit=100');
  });

  it('Opendatasoft : pagination bornée à MAX_LIGNES_URL', async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ n: i }));
    const { fetchImpl, appels } = reseau((url) =>
      url.includes('/records')
        ? { status: 200, body: { total_count: 50_000, results: page } }
        : null
    );
    const r = await chargerSourceDepuisUrl(ODS_URL, { fetchImpl });
    expect(r.ok && r.source.data?.length).toBe(MAX_LIGNES_URL);
    expect(appels).toHaveLength(MAX_LIGNES_URL / 100);
  });

  it('data.gouv.fr : page d’un jeu → première ressource tabulaire, par l’API tabulaire', async () => {
    const res = '2876a346-d50c-4911-934e-19ee07b0e503';
    const { fetchImpl, appels } = reseau(
      (url) =>
        url.includes('/api/1/datasets/mon-jeu/')
          ? {
              status: 200,
              body: {
                title: 'Mon jeu',
                resources: [
                  { id: 'pdf-1', title: 'Notice', format: 'pdf', extras: {} },
                  {
                    id: res,
                    title: 'Fichier CSV',
                    format: 'csv',
                    extras: { 'analysis:parsing:parsing_table': 'x' },
                  },
                ],
              },
            }
          : null,
      (url) =>
        url.includes(`/api/resources/${res}/data/`)
          ? { status: 200, body: { data: [{ a: 1 }, { a: 2 }], meta: { total: 2 } } }
          : null
    );
    const r = await chargerSourceDepuisUrl('https://www.data.gouv.fr/fr/datasets/mon-jeu/', {
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toMatchObject({
      type: 'api',
      provider: 'tabular',
      name: 'Mon jeu — Fichier CSV',
      resourceIds: { resourceId: res },
    });
    expect(r.source.data).toHaveLength(2);
    expect(appels.some((u) => u.includes('page_size=200'))).toBe(true);
  });

  it('Grist public : table de l’URL d’API, lignes aplaties, jamais de jeton envoyé', async () => {
    const entetes: Array<HeadersInit | undefined> = [];
    const fetchImpl = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      entetes.push(init?.headers);
      if (url.endsWith('/docs/abc123/tables')) {
        return new Response(JSON.stringify({ tables: [{ id: 'Budget' }, { id: 'Indicateurs' }] }));
      }
      if (url.endsWith('/docs/abc123/tables/Indicateurs/records')) {
        return new Response(
          JSON.stringify({ records: [{ id: 1, fields: { Nom: 'A', Valeur: 3 } }] })
        );
      }
      return new Response('{}', { status: 599 });
    }) as unknown as typeof fetch;
    const r = await chargerSourceDepuisUrl(
      'https://grist.numerique.gouv.fr/api/docs/abc123/tables/Indicateurs/records',
      { fetchImpl }
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toMatchObject({
      id: 'grist_abc123_Indicateurs',
      type: 'grist',
      provider: 'grist',
      documentId: 'abc123',
      tableId: 'Indicateurs',
      apiKey: null,
      isPublic: true,
    });
    expect(r.source.data).toEqual([{ id: 1, Nom: 'A', Valeur: 3 }]);
    expect(r.autres).toEqual(['Budget']);
    for (const h of entetes) expect(JSON.stringify(h ?? {})).not.toContain('Authorization');
  });

  it('INSEE Melodi : observations aplaties puis libellées', async () => {
    const { fetchImpl } = reseau(
      (url) =>
        url.includes('/melodi/data/DS_TEST')
          ? {
              status: 200,
              body: {
                observations: [
                  {
                    dimensions: { GEO: '2025-DEP-01' },
                    measures: { OBS_VALUE_NIVEAU: { value: 42 } },
                  },
                ],
                paging: { count: 1 },
              },
            }
          : null,
      (url) => (url.includes('/melodi/range/DS_TEST') ? { status: 200, body: [] } : null)
    );
    const r = await chargerSourceDepuisUrl('https://api.insee.fr/melodi/data/DS_TEST', {
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source.provider).toBe('insee');
      expect(r.source.data?.[0]).toMatchObject({ GEO: '2025-DEP-01' });
    }
  });
});

describe('chargerSourceDepuisUrl — refus explicites', () => {
  it('URL non reconnue : liste des formats et renvoi vers Sources, AUCUN appel réseau', async () => {
    const { fetchImpl, appels } = reseau();
    const r = await chargerSourceDepuisUrl('https://exemple.fr/donnees.csv', { fetchImpl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain('URL non reconnue');
    expect(r.message).toContain('data.economie.gouv.fr/explore/dataset/');
    expect(r.message).toContain('app Sources');
    expect(appels).toHaveLength(0);
  });

  it('http://, identifiants ou clé dans l’URL : refusés sans appel', async () => {
    const { fetchImpl, appels } = reseau(odsOk);
    for (const url of [
      'http://data.economie.gouv.fr/explore/dataset/x/',
      'https://moi:secret@data.economie.gouv.fr/explore/dataset/x/',
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/x/records?apikey=SECRET',
      'javascript:alert(1)',
      '',
    ]) {
      const r = await chargerSourceDepuisUrl(url, { fetchImpl });
      expect(r.ok, url).toBe(false);
      if (!r.ok) expect(r.message).not.toContain('SECRET');
    }
    expect(appels).toHaveLength(0);
  });

  it('identifiant hors caractères sûrs : refusé avant tout appel', async () => {
    const { fetchImpl, appels } = reseau(odsOk);
    const r = await chargerSourceDepuisUrl(
      'https://data.economie.gouv.fr/explore/dataset/%2E%2E%2Fadmin/',
      { fetchImpl }
    );
    expect(r.ok).toBe(false);
    expect(appels).toHaveLength(0);
  });

  it('jeu introuvable (404)', async () => {
    const { fetchImpl } = reseau(() => ({ status: 404 }));
    const r = await chargerSourceDepuisUrl(ODS_URL, { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Jeu introuvable');
  });

  it('data.gouv : aucune ressource tabulaire → refus nommant les formats', async () => {
    const { fetchImpl } = reseau((url) =>
      url.includes('/api/1/datasets/')
        ? {
            status: 200,
            body: {
              title: 'Rapports',
              resources: [{ id: 'r1', title: 'Rapport', format: 'pdf', extras: {} }],
            },
          }
        : null
    );
    const r = await chargerSourceDepuisUrl('https://www.data.gouv.fr/fr/datasets/rapports/', {
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain('aucune ressource tabulaire');
      expect(r.message).toContain('pdf');
    }
  });

  it('Tabular : ressource non analysée (404) → refus « non tabulaire »', async () => {
    const { fetchImpl } = reseau(() => ({ status: 404 }));
    const r = await chargerSourceDepuisUrl(
      'https://www.data.gouv.fr/fr/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503',
      { fetchImpl }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('non tabulaire');
  });

  it('Grist privé (403) : renvoi vers Sources, ne demande PAS de jeton', async () => {
    const { fetchImpl, appels } = reseau(() => ({ status: 403 }));
    const r = await chargerSourceDepuisUrl(
      'https://grist.numerique.gouv.fr/o/org/docPrive123/Page',
      { fetchImpl }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain('Accès refusé');
    expect(r.message).toContain('Ne demande PAS de clé ni de jeton');
    expect(r.message).toContain('app Sources');
    // La sonde seule : pas de lecture des lignes après un refus.
    expect(appels).toHaveLength(1);
  });

  it('réseau coupé : refus, pas d’exception', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const r = await chargerSourceDepuisUrl(ODS_URL, { fetchImpl });
    expect(r.ok).toBe(false);
  });
});

describe('source du document', () => {
  it('remplace la source, garde une précédente encore lue par un bloc', () => {
    const doc = createEmptyDashboard();
    doc.sources = [
      { id: 'ancienne', name: 'Ancienne', type: 'manual', data: [] },
      { id: 'orpheline', name: 'Orpheline', type: 'manual', data: [] },
    ] as unknown as typeof doc.sources;
    doc.widgets = [
      {
        id: 'b1',
        type: 'chart',
        title: 'x',
        position: { row: 0, col: 0 },
        config: { sourceId: 'ancienne' },
      },
    ] as unknown as typeof doc.widgets;
    const gardees = definirSourceDuDocument(doc, {
      id: 'nouvelle',
      name: 'Nouvelle',
      type: 'api',
    });
    expect(doc.sources.map((s) => s.id)).toEqual(['nouvelle', 'ancienne']);
    expect(gardees).toEqual([{ id: 'ancienne', name: 'Ancienne' }]);
  });
});

// ---------------------------------------------------------------------------
// La boucle : l'outil, le prompt, et la suite du tour sur la source chargee
// ---------------------------------------------------------------------------

function appel(name: string, args: Record<string, unknown>, id: string): OpenAIResponse {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id, type: 'function', function: { name, arguments: JSON.stringify(args) } },
          ],
        },
      },
    ],
  };
}

describe('boucle du Studio — charger_source_url', () => {
  it('déclaré au modèle seulement quand le chargement est branché', async () => {
    const outils: string[][] = [];
    const post: PostChat = vi.fn(async (body) => {
      outils.push(
        ((body.tools ?? []) as { function: { name: string } }[]).map((t) => t.function.name)
      );
      const vide: OpenAIResponse = { choices: [{ message: { role: 'assistant', content: 'ok' } }] };
      return vide;
    });
    const base = {
      conversation: [{ role: 'user' as const, content: 'x' }],
      systemPrompt: 's',
      document: createEmptyDashboard(),
      data: [],
      fields: [],
      sourceId: '',
      post,
      model: 'm',
    };
    await runStudioLoop(base);
    await runStudioLoop({
      ...base,
      sourceParUrl: { charger: async () => ({ ok: false, message: 'non' }) },
    });
    expect(outils[0]).not.toContain('charger_source_url');
    expect(outils[1][0]).toBe('charger_source_url');
  });

  it('URL → source du document, puis add_blocks sur SES champs dans le même tour', async () => {
    const { fetchImpl } = reseau(odsOk);
    const doc = createEmptyDashboard();
    const chargees: string[] = [];
    const retours: string[] = [];
    const reponses = [
      appel('charger_source_url', { url: ODS_URL }, 'c1'),
      appel('inspect_data', {}, 'c1b'),
      appel(
        'add_blocks',
        {
          blocks: [
            {
              kind: 'chart',
              config: { type: 'line', labelField: 'annee', valueField: 'nombre_de_jei' },
            },
          ],
        },
        'c2'
      ),
      appel('finish', { message: 'Graphique créé.' }, 'c3'),
    ];
    let i = 0;
    const post: PostChat = vi.fn(async (body) => {
      const dernier = (body.messages as { role: string; content?: string }[]).at(-1);
      if (dernier?.role === 'tool') retours.push(dernier.content ?? '');
      return reponses[Math.min(i++, reponses.length - 1)];
    });
    const r = await runStudioLoop({
      conversation: [{ role: 'user', content: `Un graphique avec ${ODS_URL}` }],
      systemPrompt: 's',
      document: doc,
      // Une source precedente : la suite du tour doit l'oublier.
      data: [{ region: 'IDF' }],
      fields: [{ name: 'region', type: 'texte', sample: 'IDF' }],
      sourceId: 'precedente',
      post,
      model: 'm',
      sourceParUrl: {
        charger: (url, ressource) => chargerSourceDepuisUrl(url, { ressource, fetchImpl }),
        surChargement: (s) => chargees.push(s.id),
      },
    });
    const id = 'url_opendatasoft_les-jeunes-entreprises-innovantes';
    expect(chargees).toEqual([id]);
    expect(doc.sources.map((s) => s.id)).toEqual([id]);
    expect(retours[0]).toContain('Source chargée');
    expect(retours[0]).toContain('nombre_de_jei (numérique)');
    expect(retours[0]).toContain('Lignes : 3');
    // inspect_data lit la source CHARGEE (lignes et champs)…
    expect(retours[1]).toContain('nombre_de_jei');
    expect(retours[1]).toContain('3798');
    // … add_blocks valide contre elle, et lui lie le bloc.
    expect(retours[2]).toContain('ajouté');
    expect(doc.widgets).toHaveLength(1);
    expect((doc.widgets[0].config as { sourceId?: string }).sourceId).toBe(id);
    expect(r.applied).toBe(1);
  });

  it('refus rendu tel quel au modèle, document intact', async () => {
    const doc = createEmptyDashboard();
    const retours: string[] = [];
    let i = 0;
    const reponses = [
      appel('charger_source_url', { url: 'https://exemple.fr/x.csv' }, 'c1'),
      appel('finish', { message: 'URL non reconnue.' }, 'c2'),
    ];
    const post: PostChat = vi.fn(async (body) => {
      const dernier = (body.messages as { role: string; content?: string }[]).at(-1);
      if (dernier?.role === 'tool') retours.push(dernier.content ?? '');
      return reponses[Math.min(i++, reponses.length - 1)];
    });
    await runStudioLoop({
      conversation: [{ role: 'user', content: 'x' }],
      systemPrompt: 's',
      document: doc,
      data: [],
      fields: [],
      sourceId: '',
      post,
      model: 'm',
      sourceParUrl: { charger: (url) => chargerSourceDepuisUrl(url, { fetchImpl: fetch }) },
    });
    expect(retours[0]).toContain('URL non reconnue');
    expect(doc.sources).toEqual([]);
  });
});

describe('prompt — l’outil présenté depuis son schéma', () => {
  it('sans source : appeler charger_source_url si une URL est donnée ; paramètres et formats', () => {
    const prompt = buildSystemPrompt({
      source: null,
      fields: [],
      sampleRecord: null,
      document: createEmptyDashboard(),
      sourceParUrl: true,
    });
    expect(prompt).toContain('charge-la avec charger_source_url');
    expect(prompt).toContain('## Source donnée par URL');
    for (const param of Object.keys(CHARGER_SOURCE_URL_TOOL.function.parameters.properties)) {
      expect(prompt).toContain(`- ${param}`);
    }
    expect(prompt).toContain('data.economie.gouv.fr/explore/dataset/');
    expect(prompt).toContain('Ne demande JAMAIS de clé');
  });

  it('outil absent : le prompt n’en parle pas', () => {
    const prompt = buildSystemPrompt({
      source: null,
      fields: [],
      sampleRecord: null,
      document: createEmptyDashboard(),
    });
    expect(prompt).not.toContain('charger_source_url');
  });
});
