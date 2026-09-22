import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluerConstats,
  REGLES_GENERIQUES,
  REGLES_CARTO,
  REGLES_BUILDER_CARTO,
  GENERIQUES_REMPLACEES_EN_CARTO,
  MAX_ITEMS_PAR_DEFAUT,
  snapshotGraph,
  type Constat,
  type ContexteConstats,
  type EntreeReseau,
  type StageNode,
  type StageState,
  type Trace,
} from '@dsfr-data/shared';
import { REPERES } from '../../apps/builder-carto/src/assistant/reperes.generated';

/**
 * Règles cartographiques (#1000, ADR-143 §3).
 *
 * Même méthode que `constats.test.ts` : des traces FABRIQUÉES, une table par
 * règle (fautive → un constat, saine → aucun) et sa preuve de mutation —
 * retirée du registre, sa panne n'est plus vue. En plus : chaque repère cité
 * existe au registre généré du builder carto, et une panne ne fait parler
 * qu'une règle.
 */

const CTX: ContexteConstats = { app: 'builder-carto', origine: 'https://app.exemple.fr' };

type Row = Record<string, unknown>;

function noeud(
  id: string,
  tag: string,
  role: StageNode['role'],
  extra: Partial<StageNode> = {}
): StageNode {
  return { id, tag, role, synthetic: false, ambiguous: false, upstream: [], attrs: {}, ...extra };
}

function charge(sample: Row[], rows = sample.length, extra: Partial<StageState> = {}): StageState {
  const noms = new Set<string>();
  for (const r of sample) for (const k of Object.keys(r)) noms.add(k);
  return {
    status: 'loaded',
    rows,
    fields: [...noms].map((name) => ({ name, type: 'string', sample: 'x' })),
    sample,
    emissions: 1,
    ...extra,
  };
}

interface Morceaux {
  couche?: Partial<StageNode>;
  attrs?: Record<string, string>;
  source?: StageState;
  sourceAttrs?: Record<string, string>;
  reseau?: EntreeReseau[];
  extraNodes?: StageNode[];
}

/** Une source `pts` et une couche `couche` qui la consomme. */
function carte(m: Morceaux = {}): Trace {
  const nodes = [
    noeud('pts', 'dsfr-data-source', 'source', { attrs: m.sourceAttrs ?? {} }),
    noeud('couche', 'dsfr-data-map-layer', 'display', {
      upstream: ['pts'],
      attrs: { type: 'marker', 'lat-field': 'lat', 'lon-field': 'lon', ...(m.attrs ?? {}) },
      renderedCount: 3,
      ...(m.couche ?? {}),
    }),
    ...(m.extraNodes ?? []),
  ];
  return {
    graph: { nodes, dangling: [] },
    events: [],
    // Comme `snapshot()` : toute étape du graphe a un état, `idle` par défaut.
    states: {
      pts: m.source ?? charge(PARIS),
      ...Object.fromEntries(
        nodes
          .filter((n) => n.role === 'display')
          .map((n) => [n.id, { status: 'idle', emissions: 0 }])
      ),
    },
    order: nodes.map((n) => n.id),
    sinceLastEventMs: null,
    lastEventAt: null,
    quiescent: true,
    delegation: {},
    reseau: m.reseau ?? [],
    console: [],
  };
}

function requete(url: string, extra: Partial<EntreeReseau> = {}): EntreeReseau {
  return {
    t: 1000,
    url,
    methode: 'GET',
    statut: 200,
    dureeMs: 120,
    type: 'fetch',
    taille: 2048,
    erreur: null,
    origine: 'fetch',
    ...extra,
  };
}

const PARIS: Row[] = [
  { nom: 'Louvre', lat: 48.8606, lon: 2.3376 },
  { nom: 'Orsay', lat: 48.86, lon: 2.3266 },
  { nom: 'Pompidou', lat: 48.8607, lon: 2.3522 },
];

/** Pipeline sain : trois lignes, trois points dessinés. */
const SAINE = carte();

interface CasRegle {
  regle: string;
  fautive: Trace;
  attendu: Partial<Constat>;
  saine?: Trace;
}

const URL_API = 'https://tabular-api.data.gouv.fr/api/resources/abc/data/';

const CAS: CasRegle[] = [
  {
    regle: 'carte/sans-champ-geo',
    fautive: carte({
      attrs: { 'lat-field': '', 'lon-field': '' },
      couche: { renderedCount: 0, attrs: { type: 'marker' } },
      source: charge([{ nom: 'a', valeur: 1 }]),
    }),
    attendu: {
      id: 'carte/sans-champ-geo@couche',
      gravite: 'erreur',
      reperes: ['carto.couches.geo-field', 'carto.couches.lat', 'carto.couches.lon'],
    },
  },
  {
    regle: 'carte/adresse-seule',
    fautive: carte({
      couche: { renderedCount: 0, attrs: { type: 'marker' } },
      source: charge([{ nom: 'Mairie', adresse_postale: '1 place de la Mairie' }]),
    }),
    attendu: { gravite: 'avertissement', etape: 'couche' },
  },
  {
    regle: 'carte/code-insee-seul',
    fautive: carte({
      couche: { renderedCount: 0, attrs: { type: 'marker' } },
      source: charge([{ code_insee: '75056', population: 2133111 }]),
    }),
    attendu: { gravite: 'avertissement', etape: 'couche' },
  },
  {
    regle: 'carte/lambert-93',
    fautive: carte({
      attrs: { 'lat-field': 'y', 'lon-field': 'x' },
      source: charge([
        { x: 652469.02, y: 6862035.26 },
        { x: 651000, y: 6861000 },
      ]),
    }),
    attendu: {
      gravite: 'erreur',
      reperes: ['carto.couches.lat', 'carto.couches.lon'],
      preuve: 'lat-field="y" : 6862035.26, lon-field="x" : 652469.02',
    },
  },
  {
    regle: 'carte/lat-lon-inverses',
    fautive: carte({
      attrs: { 'lat-field': 'lon', 'lon-field': 'lat' },
    }),
    attendu: { gravite: 'erreur', etape: 'couche' },
  },
  {
    regle: 'carte/decimales-virgule',
    fautive: carte({
      couche: { renderedCount: 0, skippedRows: 2 },
      source: charge([
        { lat: '48,8606', lon: '2,3376' },
        { lat: '48,86', lon: '2,3266' },
      ]),
    }),
    attendu: {
      gravite: 'avertissement',
      preuve: 'lat-field="lat" : « 48,8606 », lon-field="lon" : « 2,3376 » — 2 lignes ignorées',
    },
  },
  {
    regle: 'carte/points-zero',
    fautive: carte({
      source: charge([...PARIS, { nom: 'inconnu', lat: 0, lon: 0 }]),
    }),
    attendu: { gravite: 'avertissement', etape: 'couche' },
  },
  {
    regle: 'carte/points-empiles',
    fautive: carte({ couche: { stackedPositions: { positions: 1, items: 40 } } }),
    attendu: { gravite: 'avertissement', preuve: '40 points sur 1 position distincte' },
  },
  {
    regle: 'carte/lignes-ignorees',
    fautive: carte({ couche: { skippedRows: 7, renderedCount: 3 }, source: charge(PARIS, 10) }),
    attendu: { gravite: 'avertissement', preuve: '7 lignes ignorées sur 10 reçues' },
  },
  {
    regle: 'carte/tronque-max-items',
    fautive: carte({
      attrs: { 'max-items': '1000' },
      couche: { renderedCount: 1000 },
      source: charge(PARIS, 34955),
    }),
    attendu: {
      gravite: 'avertissement',
      reperes: [
        'carto.elements.avancees.max-items',
        'carto.elements.cluster',
        'carto.elements.avancees.bbox',
      ],
      preuve: '34 955 lignes reçues, max-items="1000", 1 000 dessinées',
    },
  },
  {
    regle: 'carte/volume-excessif',
    fautive: carte({
      attrs: { 'max-items': '50000' },
      couche: { renderedCount: 42000 },
      source: charge(PARIS, 42000),
    }),
    attendu: { gravite: 'avertissement', preuve: '42 000 lignes chargées d’un coup' },
  },
  {
    regle: 'carte/latence-excessive',
    fautive: carte({
      sourceAttrs: { url: URL_API },
      reseau: [requete(`${URL_API}?page=1`, { dureeMs: 8421 })],
    }),
    attendu: {
      gravite: 'avertissement',
      preuve: `GET ${URL_API} : 8 421 ms`,
    },
  },
  {
    regle: 'carte/rien-dessine',
    fautive: carte({ couche: { renderedCount: 0 } }),
    attendu: {
      id: 'carte/rien-dessine@couche',
      gravite: 'erreur',
      preuve: '3 lignes reçues, 0 élément dessiné',
    },
  },
  {
    regle: 'carte/aucune-donnee',
    fautive: carte({ couche: { renderedCount: 0 }, source: charge([], 0) }),
    attendu: {
      gravite: 'erreur',
      reperes: ['carto.couches.source', 'carto.elements.avancees.filtre'],
    },
  },
];

function deLaRegle(constats: Constat[], regle: string): Constat[] {
  return constats.filter((c) => c.regle === regle);
}

const IDS_REGISTRE = new Set<string>(REPERES.map((r) => r.id));

describe('règles carto — une table par règle', () => {
  it('couvre chaque règle du lot carto, et rien d’autre', () => {
    expect(CAS.map((c) => c.regle).sort()).toEqual(REGLES_CARTO.map((r) => r.id).sort());
  });

  it('ids `carte/<regle>` en kebab, réservés au builder carto', () => {
    for (const r of REGLES_CARTO) {
      expect(r.id.startsWith('carte/')).toBe(true);
      expect(r.appliesTo).toEqual(['builder-carto']);
    }
  });

  it('la carte saine ne produit aucun constat', () => {
    expect(evaluerConstats(SAINE, CTX, REGLES_BUILDER_CARTO)).toEqual([]);
  });

  it('hors du builder carto, les règles carto se taisent', () => {
    for (const { fautive } of CAS) {
      const autres = evaluerConstats(fautive, { ...CTX, app: 'studio' }, REGLES_CARTO);
      expect(autres).toEqual([]);
    }
  });

  describe.each(CAS)('$regle', ({ regle, fautive, attendu, saine }) => {
    it('parle sur la trace fautive, une fois, par couche', () => {
      const trouves = deLaRegle(evaluerConstats(fautive, CTX, REGLES_BUILDER_CARTO), regle);
      expect(trouves).toHaveLength(1);
      expect(trouves[0]).toMatchObject({ etape: 'couche', id: `${regle}@couche`, ...attendu });
      expect(trouves[0].titre.endsWith('.')).toBe(false);
      expect(trouves[0].explication.length).toBeGreaterThan(0);
      expect(trouves[0].preuve.length).toBeGreaterThan(0);
      expect(trouves[0].reperes.length).toBeGreaterThan(0);
    });

    it('se tait sur la trace saine', () => {
      expect(deLaRegle(evaluerConstats(saine ?? SAINE, CTX, REGLES_BUILDER_CARTO), regle)).toEqual(
        []
      );
    });

    it('preuve de mutation : retirée du registre, sa panne n’est plus vue', () => {
      const sans = REGLES_BUILDER_CARTO.filter((r) => r.id !== regle);
      expect(deLaRegle(evaluerConstats(fautive, CTX, sans), regle)).toEqual([]);
    });

    it('chaque repère cité existe au registre généré du builder carto', () => {
      for (const c of evaluerConstats(fautive, CTX, REGLES_CARTO)) {
        for (const id of c.reperes) expect(IDS_REGISTRE.has(id), id).toBe(true);
      }
    });

    it('une panne, un constat d’erreur ou d’avertissement', () => {
      const alertes = evaluerConstats(fautive, CTX, REGLES_BUILDER_CARTO).filter(
        (c) => c.gravite !== 'info'
      );
      expect(alertes.map((c) => c.regle)).toEqual([regle]);
    });
  });
});

// ---------------------------------------------------------------------------
// Cas particuliers
// ---------------------------------------------------------------------------

describe('règles carto — cas particuliers', () => {
  const regles = (t: Trace) => evaluerConstats(t, CTX, REGLES_BUILDER_CARTO).map((c) => c.regle);

  it('Zones sans geo-field ni colonne de géométrie : le constat désigne aussi la représentation', () => {
    const t = carte({
      couche: { renderedCount: 0, attrs: { type: 'geoshape' } },
      source: charge([{ code: '75', nom: 'Paris' }]),
    });
    const [c] = evaluerConstats(t, CTX, REGLES_BUILDER_CARTO);
    expect(c.regle).toBe('carte/sans-champ-geo');
    expect(c.reperes).toContain('carto.elements.representation.type');
    expect(c.explication).toContain('geo_shape');
  });

  it('Zones sans geo-field mais avec une colonne geo_shape : rien ne manque (détection #1053)', () => {
    // Vrai avant comme après #1056 : la règle ne juge que les champs reçus.
    // Si la bibliothèque chargée ne détecte pas encore la colonne, c'est
    // « rien dessiné » qui parle, avec l'explication de la détection.
    const geom = {
      type: 'Polygon',
      coordinates: [
        [
          [2, 48],
          [3, 48],
          [3, 49],
          [2, 48],
        ],
      ],
    };
    const dessinee = carte({
      couche: { renderedCount: 1, attrs: { type: 'geoshape' } },
      source: charge([{ nom: 'Paris', geo_shape: geom }]),
    });
    expect(regles(dessinee)).toEqual([]);
    const vide = carte({
      couche: { renderedCount: 0, attrs: { type: 'geoshape' } },
      source: charge([{ nom: 'Paris', geo_shape: geom }]),
    });
    const [c] = evaluerConstats(vide, CTX, REGLES_BUILDER_CARTO);
    expect(c.regle).toBe('carte/rien-dessine');
    expect(c.explication).toContain('geo_shape');
  });

  it('colonne geo_point_2d reconnue seule : pas de « sans champ géo »', () => {
    const t = carte({
      attrs: { 'lat-field': '', 'lon-field': '' },
      couche: { attrs: { type: 'marker' } },
      source: charge([{ nom: 'a', geo_point_2d: { lat: 48.86, lon: 2.33 } }]),
    });
    expect(regles(t)).toEqual([]);
  });

  it('geo-field en chaîne JSON [lat, lon] inversée : la paire est lue comme la couche la lit', () => {
    const t = carte({
      attrs: { 'lat-field': '', 'lon-field': '', 'geo-field': 'pos' },
      source: charge([{ pos: '[2.3376, 48.8606]' }]),
    });
    const [c] = evaluerConstats(t, CTX, REGLES_BUILDER_CARTO);
    expect(c.regle).toBe('carte/lat-lon-inverses');
    expect(c.reperes).toEqual(['carto.couches.geo-field']);
  });

  it('la virgule décimale explique les lignes ignorées : un seul constat', () => {
    const t = CAS.find((c) => c.regle === 'carte/decimales-virgule')!.fautive;
    expect(regles(t)).toEqual(['carte/decimales-virgule']);
  });

  it('une cause précise tait « rien dessiné » : le symptôme ne la redouble pas', () => {
    const lambert = CAS.find((c) => c.regle === 'carte/lambert-93')!.fautive;
    const inverses = CAS.find((c) => c.regle === 'carte/lat-lon-inverses')!.fautive;
    for (const t of [lambert, inverses]) {
      const couche = t.graph.nodes.find((n) => n.id === 'couche')!;
      const vide: Trace = {
        ...t,
        graph: {
          ...t.graph,
          nodes: t.graph.nodes.map((n) => (n === couche ? { ...n, renderedCount: 0 } : n)),
        },
      };
      expect(regles(vide)).not.toContain('carte/rien-dessine');
      expect(regles(vide)).toHaveLength(1);
    }
  });

  it('sans max-items, le plafond par défaut décide sans être cité', () => {
    const t = carte({ couche: { renderedCount: 4321 }, source: charge(PARIS, 6000) });
    const [c] = deLaRegle(evaluerConstats(t, CTX, REGLES_BUILDER_CARTO), 'carte/tronque-max-items');
    expect(c.preuve).toContain('plafond max-items par défaut');
    expect(recollerMilliers(texteDuConstat(c))).not.toContain(String(MAX_ITEMS_PAR_DEFAUT));
  });

  it('max-items="0" désactive le plafond', () => {
    const t = carte({ attrs: { 'max-items': '0' }, source: charge(PARIS, 6000) });
    expect(regles(t)).not.toContain('carte/tronque-max-items');
  });

  it('volume : cluster ou bbox posés, la règle se tait', () => {
    for (const remede of ['cluster', 'bbox']) {
      const t = carte({
        attrs: { 'max-items': '50000', [remede]: '' },
        couche: { renderedCount: 42000 },
        source: charge(PARIS, 42000),
      });
      expect(regles(t)).not.toContain('carte/volume-excessif');
    }
  });

  it('volume : une réponse trop lourde parle aussi, URL coupée de sa requête', () => {
    const t = carte({
      sourceAttrs: { url: URL_API },
      reseau: [requete(`${URL_API}?token=SECRET`, { taille: 23456789 })],
    });
    const [c] = deLaRegle(evaluerConstats(t, CTX, REGLES_BUILDER_CARTO), 'carte/volume-excessif');
    expect(c.preuve).toBe(`${URL_API} : 23 456 789 octets`);
  });

  it('latence : sans URL reconnue et à plusieurs couches, la requête n’est pas attribuée', () => {
    const t = carte({
      reseau: [requete('https://ailleurs.fr/x.json', { dureeMs: 9000 })],
      extraNodes: [
        noeud('couche2', 'dsfr-data-map-layer', 'display', {
          upstream: ['pts'],
          attrs: { type: 'marker', 'lat-field': 'lat', 'lon-field': 'lon' },
          renderedCount: 3,
        }),
      ],
    });
    expect(regles(t)).not.toContain('carte/latence-excessive');
  });

  it('les clones d’encart ne sont pas recomptés', () => {
    const t = carte({
      couche: { renderedCount: 0 },
      extraNodes: [
        noeud('map-layer@2', 'dsfr-data-map-layer', 'display', {
          upstream: ['pts'],
          attrs: { type: 'marker', 'lat-field': 'lat', 'lon-field': 'lon' },
          renderedCount: 0,
          inset: true,
        }),
      ],
    });
    expect(evaluerConstats(t, CTX, REGLES_BUILDER_CARTO).map((c) => c.id)).toEqual([
      'carte/rien-dessine@couche',
    ]);
  });

  it('bbox : 0 élément dessiné peut être juste (zone visible vide)', () => {
    const t = carte({ attrs: { bbox: '' }, couche: { renderedCount: 0 } });
    expect(regles(t)).not.toContain('carte/rien-dessine');
  });

  it('source muette (jamais émise) : « aucune donnée », pas l’afficheur inerte générique', () => {
    const t = carte({ source: { status: 'idle', emissions: 0 } });
    expect(regles(t)).toEqual(['carte/aucune-donnee']);
  });

  it('source en échec : les règles génériques parlent, pas « aucune donnée »', () => {
    const t = carte({ source: { status: 'error', message: 'HTTP 500', emissions: 0 } });
    expect(regles(t)).toEqual(['pipeline/etape-en-erreur']);
  });

  it('source en attente voulue (require-where) : silence', () => {
    const t = carte({
      source: { status: 'waiting', emissions: 0, waitingReason: 'require-where' },
    });
    expect(regles(t)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Composition avec les génériques
// ---------------------------------------------------------------------------

describe('REGLES_BUILDER_CARTO — composition', () => {
  it('garde toutes les génériques sauf celles que le lot carto remplace', () => {
    const ids = REGLES_BUILDER_CARTO.map((r) => r.id);
    for (const r of REGLES_GENERIQUES) {
      expect(ids.includes(r.id)).toBe(!GENERIQUES_REMPLACEES_EN_CARTO.includes(r.id));
    }
    for (const r of REGLES_CARTO) expect(ids).toContain(r.id);
  });

  it('chaque générique remplacée existe (pas de nom périmé)', () => {
    const generiques = REGLES_GENERIQUES.map((r) => r.id);
    for (const id of GENERIQUES_REMPLACEES_EN_CARTO) expect(generiques).toContain(id);
  });

  it('preuve de mutation de la composition : sans le remplacement, une couche vide compte trois alertes', () => {
    const t = CAS.find((c) => c.regle === 'carte/aucune-donnee')!.fautive;
    const naif = evaluerConstats(t, CTX, [...REGLES_GENERIQUES, ...REGLES_CARTO]);
    expect(naif.map((c) => c.regle).sort()).toEqual([
      'carte/aucune-donnee',
      'pipeline/afficheur-inerte',
      'pipeline/zero-ligne',
    ]);
    expect(evaluerConstats(t, CTX, REGLES_BUILDER_CARTO).map((c) => c.regle)).toEqual([
      'carte/aucune-donnee',
    ]);
  });

  it('MAX_ITEMS_PAR_DEFAUT suit le défaut de max-items dans le custom-elements manifest', () => {
    const cem = JSON.parse(
      readFileSync(resolve(__dirname, '../../packages/core/custom-elements.json'), 'utf8')
    ) as {
      modules: Array<{
        declarations?: Array<{
          tagName?: string;
          attributes?: Array<{ name: string; default?: string }>;
        }>;
      }>;
    };
    const couche = cem.modules
      .flatMap((m) => m.declarations ?? [])
      .find((d) => d.tagName === 'dsfr-data-map-layer');
    const attr = couche?.attributes?.find((a) => a.name === 'max-items');
    expect(attr?.default).toBe(String(MAX_ITEMS_PAR_DEFAUT));
  });
});

// ---------------------------------------------------------------------------
// ADR-122 : aucun nombre nouveau (garde copié de constats.test.ts)
// ---------------------------------------------------------------------------

interface InventaireTrace {
  valeurs: Set<number>;
  chaines: Set<string>;
}

/**
 * Comme dans `constats.test.ts`, plus une chose : un nombre de la trace est
 * aussi admis sous son écriture exacte (`String(n)`), pour qu'une coordonnée
 * citée telle quelle (`652469.02`) ne soit pas lue comme deux nombres
 * inventés. Le recalcul (arrondi, différence) reste refusé.
 */
function inventaireDeLaTrace(
  valeur: unknown,
  out: InventaireTrace = { valeurs: new Set(), chaines: new Set() }
): InventaireTrace {
  if (typeof valeur === 'number') {
    out.valeurs.add(valeur);
    out.chaines.add(String(valeur));
  } else if (typeof valeur === 'string') out.chaines.add(valeur);
  else if (Array.isArray(valeur)) {
    out.valeurs.add(valeur.length);
    for (const v of valeur) inventaireDeLaTrace(v, out);
  } else if (valeur && typeof valeur === 'object') {
    for (const v of Object.values(valeur)) inventaireDeLaTrace(v, out);
  }
  return out;
}

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

/**
 * Noms propres et identifiants qui contiennent des chiffres sans en être :
 * une projection, des noms de colonnes reconnues par la couche. Liste FERMÉE,
 * retirée du texte avant la lecture des nombres.
 */
const VOCABULAIRE = ['Lambert 93', 'geo_point_2d'];

function texteDuConstat(c: Constat): string {
  let t = [c.titre, c.explication, c.action ?? '', c.preuve].join(' | ');
  for (const mot of VOCABULAIRE) t = t.split(mot).join(' ');
  return t;
}

function nombresInventes(trace: Trace, c: Constat): number[] {
  const inv = inventaireDeLaTrace(trace);
  const texte = texteDuConstat(c);
  const admis = new Set(inv.valeurs);
  for (const chaine of inv.chaines) {
    if (chaine.length === 0 || !texte.includes(chaine)) continue;
    for (const m of chaine.match(/\d+/g) ?? []) admis.add(Number(m));
  }
  const cites = (recollerMilliers(texte).match(/\d+/g) ?? []).map(Number);
  return cites.filter((n) => !admis.has(n));
}

describe('ADR-122 — aucune règle carto ne rend un nombre absent de la trace', () => {
  it.each(CAS)('$regle', ({ fautive }) => {
    for (const c of evaluerConstats(fautive, CTX, REGLES_BUILDER_CARTO)) {
      expect(nombresInventes(fautive, c), c.id).toEqual([]);
    }
  });

  it('le garde mord : un arrondi de coordonnée ou une part calculée sont refusés', () => {
    const fautive = CAS.find((c) => c.regle === 'carte/lambert-93')!.fautive;
    const base: Constat = {
      id: 'x',
      regle: 'x',
      gravite: 'erreur',
      titre: '',
      explication: '',
      reperes: [],
      preuve: '',
    };
    expect(nombresInventes(fautive, { ...base, preuve: 'x : 652469.02' })).toEqual([]);
    expect(nombresInventes(fautive, { ...base, preuve: 'x : 652469' })).toEqual([652469]);
    expect(nombresInventes(fautive, { ...base, preuve: '50 % des lignes' })).toEqual([50]);
  });

  it('le vocabulaire exempté est une liste fermée', () => {
    expect(VOCABULAIRE).toEqual(['Lambert 93', 'geo_point_2d']);
  });
});

// ---------------------------------------------------------------------------
// Collecteur : ce que les règles lisent entre bien dans la trace
// ---------------------------------------------------------------------------

describe('snapshotGraph — mesures de la couche', () => {
  function couche(rendu: number | (() => number) | null, dansEncart = false): HTMLElement {
    const racine = document.createElement('div');
    const el = document.createElement('dsfr-data-map-layer');
    el.setAttribute('source', 'pts');
    el.setAttribute('max-items', '1000');
    el.setAttribute('cluster', '');
    if (rendu !== null) {
      Object.assign(el, { getRenderedCount: typeof rendu === 'function' ? rendu : () => rendu });
    }
    if (dansEncart) {
      const encart = document.createElement('dsfr-data-map-inset');
      encart.appendChild(el);
      racine.appendChild(encart);
    } else racine.appendChild(el);
    return racine;
  }

  it('lit getRenderedCount(), 0 compris, et les attributs max-items et cluster', () => {
    const [n] = snapshotGraph(couche(0)).nodes;
    expect(n.renderedCount).toBe(0);
    expect(n.attrs['max-items']).toBe('1000');
    expect(n.attrs.cluster).toBe('');
    expect(n.inset).toBeUndefined();
    expect(snapshotGraph(couche(42)).nodes[0].renderedCount).toBe(42);
  });

  it('composant non rehaussé ou qui lève : pas de compte, jamais d’exception', () => {
    expect(snapshotGraph(couche(null)).nodes[0].renderedCount).toBeUndefined();
    const casse = () => {
      throw new Error('pas prêt');
    };
    expect(snapshotGraph(couche(casse)).nodes[0].renderedCount).toBeUndefined();
  });

  it('un clone d’encart est marqué inset', () => {
    expect(snapshotGraph(couche(3, true)).nodes[0].inset).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Frontière lib/app (#319)
// ---------------------------------------------------------------------------

describe('constats-carto.ts reste lib-safe', () => {
  const source = readFileSync(
    resolve(__dirname, '../../packages/shared/src/debug/constats-carto.ts'),
    'utf8'
  );

  it('n’importe que des modules du collecteur et le moteur de constats', () => {
    const imports: string[] = [];
    let i = source.indexOf("from '");
    while (i >= 0) {
      const fin = source.indexOf("'", i + 6);
      imports.push(source.slice(i + 6, fin));
      i = source.indexOf("from '", fin);
    }
    expect(imports.length).toBeGreaterThan(0);
    for (const imp of imports) {
      expect([
        './graph.js',
        './recorder.js',
        './format.js',
        './journal.js',
        './constats.js',
      ]).toContain(imp);
    }
  });
});
