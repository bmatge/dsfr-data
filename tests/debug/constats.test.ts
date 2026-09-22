import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluerConstats,
  compterAlertes,
  summarizeTrace,
  urlDejaProxifiee,
  REGLES_GENERIQUES,
  type Constat,
  type ContexteConstats,
  type EntreeConsole,
  type EntreeReseau,
  type StageNode,
  type StageState,
  type Trace,
} from '@dsfr-data/shared';

/**
 * Le moteur de constats (#996, ADR-143 §3).
 *
 * Traces FABRIQUÉES, sans DOM ni collecteur : une règle est une fonction pure,
 * on la juge sur l'objet qu'elle reçoit. Chaque règle a sa table — une trace
 * fautive qui doit la faire parler, une trace saine qui doit la faire taire —
 * et sa preuve de mutation : retirée du registre, sa trace fautive ne produit
 * plus son constat, donc la table la voit ROUGE.
 */

const CTX: ContexteConstats = { app: '*', origine: 'https://app.exemple.fr' };

function noeud(
  id: string,
  tag: string,
  role: StageNode['role'],
  extra: Partial<StageNode> = {}
): StageNode {
  return { id, tag, role, synthetic: false, ambiguous: false, upstream: [], attrs: {}, ...extra };
}

function champs(...noms: string[]): NonNullable<StageState['fields']> {
  return noms.map((name) => ({ name, type: 'string', sample: 'x' }));
}

function charge(rows: number, extra: Partial<StageState> = {}): StageState {
  return { status: 'loaded', rows, fields: champs('commune'), emissions: 1, ...extra };
}

interface Morceaux {
  nodes: StageNode[];
  states?: Record<string, StageState>;
  dangling?: Trace['graph']['dangling'];
  reseau?: EntreeReseau[];
  console?: EntreeConsole[];
}

function trace(m: Morceaux): Trace {
  return {
    graph: { nodes: m.nodes, dangling: m.dangling ?? [] },
    events: [],
    states: m.states ?? {},
    order: m.nodes.map((n) => n.id),
    sinceLastEventMs: null,
    lastEventAt: null,
    quiescent: true,
    delegation: {},
    reseau: m.reseau ?? [],
    console: m.console ?? [],
  };
}

function requete(url: string, statut: number | null, erreur: string | null = null): EntreeReseau {
  return {
    t: 1000,
    url,
    methode: 'GET',
    statut,
    dureeMs: null,
    type: null,
    taille: null,
    erreur,
    origine: 'fetch',
  };
}

function message(texte: string, niveau: EntreeConsole['niveau'] = 'error'): EntreeConsole {
  return { t: 1000, niveau, message: texte, source: 'console' };
}

const SOURCE = noeud('src', 'dsfr-data-source', 'source');
const CARTE = noeud('carte', 'dsfr-data-chart', 'display', {
  upstream: ['src'],
  attrs: { 'label-field': 'commune' },
});
const URL_API = 'https://tabular-api.data.gouv.fr/api/resources/abc/data/?page=1';

/** Un pipeline sain : une source livre trois lignes, un graphique les consomme. */
const SAINE = trace({ nodes: [SOURCE, CARTE], states: { src: charge(3) } });

interface CasRegle {
  regle: string;
  fautive: Trace;
  attendu: Partial<Constat>;
  /** Trace saine propre à la règle ; `SAINE` sinon. */
  saine?: Trace;
  contexte?: ContexteConstats;
}

const CAS: CasRegle[] = [
  {
    regle: 'pipeline/amont-manquant',
    fautive: trace({
      nodes: [noeud('carte', 'dsfr-data-chart', 'display', { upstream: ['fantome'] })],
      dangling: [{ node: 'carte', missing: 'fantome' }],
    }),
    attendu: { id: 'pipeline/amont-manquant@carte', gravite: 'erreur', etape: 'carte' },
  },
  {
    regle: 'pipeline/configuration',
    fautive: trace({
      nodes: [SOURCE, { ...CARTE, configError: 'attribut type requis' }],
      states: { src: charge(3) },
    }),
    attendu: { gravite: 'erreur', etape: 'carte', preuve: 'attribut type requis' },
  },
  {
    regle: 'pipeline/attribut-inconnu',
    fautive: trace({
      nodes: [SOURCE, { ...CARTE, unknownAttrs: ['titre-field', 'couleur-champ'] }],
      states: { src: charge(3) },
    }),
    attendu: { gravite: 'avertissement', etape: 'carte' },
  },
  {
    regle: 'pipeline/champ-introuvable',
    fautive: trace({
      nodes: [SOURCE, { ...CARTE, attrs: { 'label-field': 'comune' } }],
      states: { src: charge(3) },
    }),
    attendu: { gravite: 'erreur', etape: 'carte', preuve: 'label-field="comune"' },
  },
  {
    regle: 'pipeline/etape-en-erreur',
    fautive: trace({
      nodes: [SOURCE, CARTE],
      states: { src: { status: 'error', message: 'Réponse illisible', emissions: 0 } },
    }),
    attendu: { id: 'pipeline/etape-en-erreur@src', gravite: 'erreur', etape: 'src' },
  },
  {
    regle: 'pipeline/zero-ligne',
    fautive: trace({ nodes: [SOURCE, CARTE], states: { src: charge(0) } }),
    attendu: { gravite: 'avertissement', etape: 'src' },
  },
  {
    regle: 'pipeline/afficheur-inerte',
    fautive: trace({ nodes: [SOURCE, CARTE], states: { carte: { status: 'idle', emissions: 0 } } }),
    attendu: { gravite: 'avertissement', etape: 'carte' },
  },
  {
    regle: 'pipeline/lignes-ignorees',
    fautive: trace({
      nodes: [SOURCE, { ...CARTE, tag: 'dsfr-data-map-layer', skippedRows: 7 }],
      states: { src: charge(3) },
    }),
    attendu: { gravite: 'avertissement', etape: 'carte', preuve: '7 lignes ignorées' },
  },
  {
    regle: 'pipeline/points-empiles',
    fautive: trace({
      nodes: [SOURCE, { ...CARTE, stackedPositions: { positions: 1, items: 40 } }],
      states: { src: charge(3) },
    }),
    attendu: { gravite: 'avertissement', etape: 'carte' },
  },
  {
    regle: 'pipeline/traitement-client',
    fautive: trace({
      nodes: [SOURCE, CARTE],
      states: { src: charge(3, { meta: { page: 1, pageSize: 3, needsClientProcessing: true } }) },
    }),
    attendu: { gravite: 'info', etape: 'src' },
  },
  {
    regle: 'pipeline/tronque',
    fautive: trace({
      nodes: [{ ...SOURCE, attrs: { 'max-records': '1000' } }, CARTE],
      states: {
        src: charge(1000, { meta: { page: 1, pageSize: 1000, total: 34955, truncated: true } }),
      },
    }),
    attendu: { gravite: 'avertissement', etape: 'src', preuve: '1 000 / 34 955 lignes' },
  },
  {
    regle: 'pipeline/jointure-faible',
    fautive: trace({
      nodes: [
        noeud('gauche', 'dsfr-data-source', 'source'),
        noeud('droite', 'dsfr-data-source', 'source'),
        noeud('jointure', 'dsfr-data-join', 'transform', { upstream: ['gauche', 'droite'] }),
      ],
      states: {
        gauche: charge(100),
        droite: charge(90),
        jointure: charge(100, {
          meta: {
            page: 1,
            pageSize: 100,
            join: { leftMatched: 12, leftTotal: 100, rightMatched: 12, rightTotal: 90 },
          },
        }),
      },
    }),
    attendu: { gravite: 'avertissement', etape: 'jointure' },
  },
  {
    regle: 'reseau/http-erreur',
    fautive: trace({
      nodes: [SOURCE, CARTE],
      states: {
        src: {
          status: 'error',
          message: 'HTTP 404: Not Found',
          attemptedUrl: URL_API,
          emissions: 0,
        },
      },
      reseau: [requete(URL_API, 404)],
    }),
    attendu: { id: 'reseau/http-erreur@src', gravite: 'erreur', etape: 'src' },
  },
  {
    regle: 'reseau/cors-deduit',
    fautive: trace({
      nodes: [SOURCE, CARTE],
      states: {
        src: { status: 'error', message: 'Failed to fetch', attemptedUrl: URL_API, emissions: 0 },
      },
      reseau: [requete(URL_API, null, 'TypeError: Failed to fetch')],
    }),
    attendu: { id: 'reseau/cors-deduit@src', gravite: 'erreur', etape: 'src' },
  },
  {
    regle: 'console/erreur-non-rattachee',
    fautive: trace({
      nodes: [SOURCE, CARTE],
      states: { src: charge(3) },
      console: [message('Uncaught ReferenceError: leaflet is not defined')],
    }),
    attendu: { id: 'console/erreur-non-rattachee', gravite: 'avertissement' },
  },
];

function deLaRegle(constats: Constat[], regle: string): Constat[] {
  return constats.filter((c) => c.regle === regle);
}

describe('evaluerConstats — une table par règle', () => {
  it('couvre chaque règle du registre, et rien d’autre', () => {
    expect(CAS.map((c) => c.regle).sort()).toEqual(REGLES_GENERIQUES.map((r) => r.id).sort());
  });

  it('la trace saine ne produit aucun constat', () => {
    expect(evaluerConstats(SAINE, CTX)).toEqual([]);
    expect(summarizeTrace(SAINE).alerts).toBe(0);
  });

  describe.each(CAS)('$regle', ({ regle, fautive, attendu, saine, contexte }) => {
    const ctx = contexte ?? CTX;

    it('parle sur la trace fautive', () => {
      const trouves = deLaRegle(evaluerConstats(fautive, ctx), regle);
      expect(trouves).toHaveLength(1);
      expect(trouves[0]).toMatchObject(attendu);
      expect(trouves[0].titre.length).toBeGreaterThan(0);
      expect(trouves[0].titre.endsWith('.')).toBe(false);
      expect(trouves[0].explication.length).toBeGreaterThan(0);
      expect(trouves[0].preuve.length).toBeGreaterThan(0);
      expect(trouves[0].reperes).toEqual([]);
    });

    it('se tait sur la trace saine', () => {
      expect(deLaRegle(evaluerConstats(saine ?? SAINE, ctx), regle)).toEqual([]);
    });

    it('preuve de mutation : retirée du registre, sa panne n’est plus vue', () => {
      const sans = REGLES_GENERIQUES.filter((r) => r.id !== regle);
      expect(deLaRegle(evaluerConstats(fautive, ctx, sans), regle)).toEqual([]);
    });

    it('chaque constat rendu porte regle === id de la règle', () => {
      const r = REGLES_GENERIQUES.find((x) => x.id === regle);
      expect(r).toBeDefined();
      for (const c of r!.evaluer(fautive, ctx)) {
        expect(c.regle).toBe(regle);
        expect(c.id === regle || c.id === `${regle}@${c.etape}`).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// ADR-122 : aucun nombre nouveau
// ---------------------------------------------------------------------------

/** Tous les nombres de la trace : valeurs numériques, longueurs de tableaux, chiffres des chaînes. */
function nombresDeLaTrace(valeur: unknown, out = new Set<number>()): Set<number> {
  if (typeof valeur === 'number') out.add(valeur);
  else if (typeof valeur === 'string') {
    for (const m of valeur.match(/\d+/g) ?? []) out.add(Number(m));
  } else if (Array.isArray(valeur)) {
    out.add(valeur.length);
    for (const v of valeur) nombresDeLaTrace(v, out);
  } else if (valeur && typeof valeur === 'object') {
    for (const v of Object.values(valeur)) nombresDeLaTrace(v, out);
  }
  return out;
}

/** « 34 955 » (formatInt) se relit 34955 : on recolle les chiffres séparés d'une espace. */
function recollerMilliers(texte: string): string {
  let out = '';
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    const entreChiffres =
      c === ' ' &&
      i > 0 &&
      i + 1 < texte.length &&
      /\d/.test(texte[i - 1]) &&
      /\d/.test(texte[i + 1]);
    if (!entreChiffres) out += c;
  }
  return out;
}

function nombresDuConstat(c: Constat): number[] {
  const texte = recollerMilliers([c.titre, c.explication, c.action ?? '', c.preuve].join(' | '));
  return (texte.match(/\d+/g) ?? []).map(Number);
}

describe('ADR-122 — non applicable : aucune règle ne rend un nombre absent de la trace', () => {
  it.each(CAS)('$regle', ({ fautive }) => {
    const connus = nombresDeLaTrace(fautive);
    for (const c of evaluerConstats(fautive, CTX)) {
      for (const n of nombresDuConstat(c)) {
        expect(connus, `${c.id} cite ${n}`).toContain(n);
      }
    }
  });

  it('le test refuse bien un pourcentage calculé (mutation du garde-fou)', () => {
    const fautive = CAS.find((c) => c.regle === 'pipeline/jointure-faible')!.fautive;
    const inventeur: Constat = {
      id: 'x',
      regle: 'x',
      gravite: 'avertissement',
      titre: 'jointure : 12 % appariées',
      explication: '',
      reperes: [],
      preuve: '',
    };
    const connus = nombresDeLaTrace(fautive);
    expect(nombresDuConstat(inventeur).every((n) => connus.has(n))).toBe(true); // 12 est dans la trace
    const pourcent = { ...inventeur, titre: 'jointure : 88 % perdues' };
    expect(nombresDuConstat(pourcent).every((n) => connus.has(n))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Réseau et console : rattachement, déduction du CORS
// ---------------------------------------------------------------------------

describe('reseau/* — rattachement à l’étape et CORS déduit', () => {
  const enEchec = (attemptedUrl: string): StageState => ({
    status: 'error',
    message: 'Failed to fetch',
    attemptedUrl,
    emissions: 0,
  });

  it('un échec HTTP rattaché remplace « étape en erreur » : une panne, une alerte', () => {
    const t = CAS.find((c) => c.regle === 'reseau/http-erreur')!.fautive;
    const constats = evaluerConstats(t, CTX);
    expect(deLaRegle(constats, 'pipeline/etape-en-erreur')).toEqual([]);
    expect(constats.map((c) => c.id)).toContain('reseau/http-erreur@src');
    // La requête de la preuve est coupée : ni `?page=1`, ni données de filtre.
    expect(deLaRegle(constats, 'reseau/http-erreur')[0].preuve).not.toContain('?');
  });

  it('un échec HTTP que nulle étape ne revendique reste signalé, sans étape', () => {
    const t = trace({
      nodes: [SOURCE, CARTE],
      states: { src: charge(3) },
      reseau: [
        requete('https://ailleurs.fr/a.json', 500),
        requete('https://ailleurs.fr/b.json', 503),
      ],
    });
    const http = deLaRegle(evaluerConstats(t, CTX), 'reseau/http-erreur');
    expect(http).toHaveLength(1);
    expect(http[0].id).toBe('reseau/http-erreur');
    expect(http[0].etape).toBeUndefined();
    expect(http[0].titre).toContain('503');
  });

  it('les jetons d’URL sont masqués dans la preuve', () => {
    const url = 'https://api.exemple.fr/data?apikey=SECRET123';
    const t = trace({
      nodes: [SOURCE],
      states: { src: { status: 'error', message: 'x', attemptedUrl: url, emissions: 0 } },
      reseau: [requete(url, 401)],
    });
    const texte = JSON.stringify(evaluerConstats(t, CTX));
    expect(texte).not.toContain('SECRET123');
  });

  it('pas de CORS sur une URL déjà proxifiée : l’étape reste en erreur', () => {
    const url = 'https://chartsbuilder.miweb.run/tabular-proxy/api/resources/abc/data/';
    const t = trace({
      nodes: [SOURCE],
      states: { src: enEchec(url) },
      reseau: [requete(url, null, 'TypeError: Failed to fetch')],
    });
    const regles = evaluerConstats(t, CTX).map((c) => c.regle);
    expect(regles).not.toContain('reseau/cors-deduit');
    expect(regles).toContain('pipeline/etape-en-erreur');
  });

  it('pas de CORS sur une requête de même origine', () => {
    const url = 'https://app.exemple.fr/donnees.json';
    const t = trace({
      nodes: [SOURCE],
      states: { src: enEchec(url) },
      reseau: [requete(url, null, 'TypeError: Failed to fetch')],
    });
    expect(deLaRegle(evaluerConstats(t, CTX), 'reseau/cors-deduit')).toEqual([]);
  });

  it('pas de CORS sans TypeError (requête annulée)', () => {
    const t = trace({
      nodes: [SOURCE],
      states: { src: charge(3) },
      reseau: [requete(URL_API, null, 'AbortError: The user aborted a request')],
    });
    expect(deLaRegle(evaluerConstats(t, CTX), 'reseau/cors-deduit')).toEqual([]);
  });

  it('le CORS propose getProxiedUrl()', () => {
    const t = CAS.find((c) => c.regle === 'reseau/cors-deduit')!.fautive;
    expect(deLaRegle(evaluerConstats(t, CTX), 'reseau/cors-deduit')[0].action).toContain(
      'getProxiedUrl()'
    );
  });

  it('reconnaît les points de sortie du proxy', () => {
    expect(urlDejaProxifiee('/tabular-proxy/api/x')).toBe(true);
    expect(urlDejaProxifiee('https://p.fr/cors-proxy')).toBe(true);
    expect(urlDejaProxifiee('https://tabular-api.data.gouv.fr/api/x')).toBe(false);
  });
});

describe('console/erreur-non-rattachee', () => {
  it('ignore une erreur qui nomme une étape (logFetchError) ou son URL', () => {
    const t = trace({
      nodes: [SOURCE],
      states: { src: { status: 'error', message: 'x', attemptedUrl: URL_API, emissions: 0 } },
      console: [
        message('dsfr-data-source[src]: Erreur de chargement'),
        message(`échec sur ${URL_API}`),
      ],
    });
    expect(deLaRegle(evaluerConstats(t, CTX), 'console/erreur-non-rattachee')).toEqual([]);
  });

  it('ignore les avertissements', () => {
    const t = trace({
      nodes: [SOURCE],
      states: { src: charge(3) },
      console: [message('x', 'warn')],
    });
    expect(deLaRegle(evaluerConstats(t, CTX), 'console/erreur-non-rattachee')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Registre : composition, filtrage par app, tri, dédoublonnage
// ---------------------------------------------------------------------------

describe('evaluerConstats — registre', () => {
  it('trie erreur → avertissement → info, puis dans l’ordre du pipeline', () => {
    const t = trace({
      nodes: [
        noeud('a', 'dsfr-data-source', 'source'),
        noeud('b', 'dsfr-data-source', 'source'),
        noeud('c', 'dsfr-data-chart', 'display', { upstream: ['fantome'] }),
      ],
      dangling: [{ node: 'c', missing: 'fantome' }],
      states: {
        a: charge(0),
        b: charge(3, { meta: { page: 1, pageSize: 3, needsClientProcessing: true } }),
        c: { status: 'idle', emissions: 0 },
      },
      console: [message('boum')],
    });
    const ordre = evaluerConstats(t, CTX).map((c) => c.id);
    expect(ordre).toEqual([
      'pipeline/amont-manquant@c',
      'pipeline/zero-ligne@a',
      'pipeline/afficheur-inerte@c',
      'console/erreur-non-rattachee',
      'pipeline/traitement-client@b',
    ]);
  });

  it('une app compose ses règles avec les génériques, filtrées par appliesTo', () => {
    const regleCarto = {
      id: 'carto/sans-geo',
      appliesTo: ['builder-carto'],
      evaluer: (): Constat[] => [
        {
          id: 'carto/sans-geo',
          regle: 'carto/sans-geo',
          gravite: 'erreur',
          titre: 'Aucun champ géographique',
          explication: 'La couche ne sait pas où placer les points.',
          reperes: ['carto.couches.geo-field'],
          preuve: 'champs : commune',
        },
      ],
    };
    const regles = [...REGLES_GENERIQUES, regleCarto];
    expect(evaluerConstats(SAINE, { app: 'builder-carto' }, regles).map((c) => c.id)).toEqual([
      'carto/sans-geo',
    ]);
    expect(evaluerConstats(SAINE, { app: 'studio' }, regles)).toEqual([]);
  });

  it('dédoublonne par id : la première occurrence gagne', () => {
    const doublon = {
      id: 'x/doublon',
      appliesTo: ['*'],
      evaluer: (): Constat[] =>
        [1, 2].map((n) => ({
          id: 'x/doublon',
          regle: 'x/doublon',
          gravite: 'avertissement' as const,
          titre: `occurrence ${n}`,
          explication: '',
          reperes: [],
          preuve: '',
        })),
    };
    const out = evaluerConstats(SAINE, CTX, [doublon]);
    expect(out).toHaveLength(1);
    expect(out[0].titre).toBe('occurrence 1');
  });

  it('summarizeTrace compte les constats non-info, ceux passés par l’appelant s’il y en a', () => {
    const t = CAS.find((c) => c.regle === 'pipeline/traitement-client')!.fautive;
    expect(summarizeTrace(t).alerts).toBe(0);
    const constats = evaluerConstats(CAS[0].fautive, CTX);
    expect(summarizeTrace(t, constats).alerts).toBe(compterAlertes(constats));
  });
});

// ---------------------------------------------------------------------------
// Frontière lib/app (#319)
// ---------------------------------------------------------------------------

describe('constats.ts reste lib-safe', () => {
  const source = readFileSync(
    resolve(__dirname, '../../packages/shared/src/debug/constats.ts'),
    'utf8'
  );

  it('n’importe ni ia/, ni ui/, ni api/', () => {
    for (const interdit of ["from '../ia/", "from '../ui/", "from '../api/"]) {
      expect(source).not.toContain(interdit);
    }
  });

  it('n’importe que des modules du collecteur', () => {
    const imports = source
      .split('\n')
      .filter((l) => l.startsWith('import '))
      .map((l) => l.slice(l.indexOf("from '") + 6, l.lastIndexOf("'")));
    for (const i of imports) {
      expect([
        './graph.js',
        './field-check.js',
        './recorder.js',
        './format.js',
        './journal.js',
      ]).toContain(i);
    }
  });
});
