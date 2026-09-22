import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DIAGNOSTIC_TOOLS,
  DIAGNOSTIC_TOOL_NAMES,
  PREUVE_MASQUEE,
  REPEATABLE_TOOLS,
  formaterConstats,
  humanizeDiagnosticStep,
  runDiagnosticTool,
  type DiagnosticContext,
} from '../../packages/shared/src/ia/diagnostic-tools.js';
import type { Constat } from '../../packages/shared/src/debug/constats.js';
import type { FrameAttachment } from '../../packages/shared/src/debug/frame.js';
import type { Trace } from '../../packages/shared/src/debug/recorder.js';

/**
 * Outils de diagnostic du socle IA (#607, partagés par #1010, ADR-143).
 *
 * Migrés du studio : ils servent désormais le studio, l'assistant contextuel
 * (#1011, #1014) et le builder IA (#1015). L'intégration à la boucle du studio
 * (anti-boucle, budget de tours, prompt) reste testée dans
 * `tests/apps/studio/diagnostic-tools.test.ts`.
 */

function makeTrace(over: Partial<Trace> = {}): Trace {
  return {
    graph: {
      nodes: [
        {
          id: 'src',
          tag: 'dsfr-data-source',
          role: 'source',
          synthetic: false,
          ambiguous: false,
          upstream: [],
          attrs: { 'api-type': 'tabular' },
        },
        {
          id: 'q1',
          tag: 'dsfr-data-query',
          role: 'transform',
          synthetic: false,
          ambiguous: false,
          upstream: ['src'],
          attrs: { 'group-by': 'dept' },
        },
      ],
      dangling: [],
    },
    events: [],
    states: {
      src: {
        status: 'loaded',
        rows: 100,
        fields: [
          { name: 'dept', type: 'texte', sample: 'A' },
          { name: 'montant', type: 'numérique', sample: 1 },
        ],
        sample: [{ dept: 'A', montant: 42 }],
        shape: 'array',
        emissions: 1,
      },
      q1: {
        status: 'loaded',
        rows: 8,
        fields: [{ name: 'dept', type: 'texte', sample: 'A' }],
        sample: [{ dept: 'A' }],
        shape: 'array',
        emissions: 1,
      },
    },
    order: ['src', 'q1'],
    sinceLastEventMs: 10,
    lastEventAt: 1_000_000,
    quiescent: true,
    delegation: { q1: { groupBy: false, aggregate: false, orderBy: false, where: false } },
    reseau: [],
    console: [],
    ...over,
  };
}

function makeContext(
  trace: Trace | null,
  opts: { settled?: boolean; redact?: boolean; constats?: DiagnosticContext['constats'] } = {}
) {
  const rerender = vi.fn();
  const attachment = trace
    ? ({
        snapshot: () => trace,
        waitForQuiescence: async () => opts.settled ?? true,
        current: () => null,
        sawEarlyBuffer: () => true,
        detach: () => {},
      } as unknown as FrameAttachment)
    : null;
  const ctx: DiagnosticContext = {
    attachment: () => attachment,
    rerender,
    redactValues: () => opts.redact ?? false,
    ...(opts.constats ? { constats: opts.constats } : {}),
  };
  return { ctx, rerender };
}

/** Parcourt un schéma JSON et rend les chemins des clés interdites ou imbriquées. */
function defautsDePlatitude(schema: unknown, chemin = ''): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const out: string[] = [];
  for (const [cle, valeur] of Object.entries(schema as Record<string, unknown>)) {
    if (cle === 'oneOf' || cle === 'anyOf' || cle === 'allOf' || cle === '$ref') {
      out.push(`${chemin}.${cle}`);
    }
    out.push(...defautsDePlatitude(valeur, `${chemin}.${cle}`));
  }
  return out;
}

describe('schémas des outils — décodage guidé vLLM', () => {
  it('aucun oneOf / anyOf / allOf / $ref, à aucune profondeur', () => {
    for (const tool of DIAGNOSTIC_TOOLS) {
      expect(defautsDePlatitude(tool), tool.function.name).toEqual([]);
    }
    // Et sur le JSON réellement envoyé, au cas où un schéma serait construit.
    const json = JSON.stringify(DIAGNOSTIC_TOOLS);
    for (const cle of ['oneOf', 'anyOf', 'allOf', '$ref']) expect(json).not.toContain(cle);
  });

  it('paramètres plats : un objet dont chaque propriété est un scalaire', () => {
    for (const tool of DIAGNOSTIC_TOOLS) {
      const params = tool.function.parameters;
      expect(params.type).toBe('object');
      expect(params.additionalProperties).toBe(false);
      for (const [nom, prop] of Object.entries(params.properties as Record<string, unknown>)) {
        const type = (prop as { type?: unknown }).type;
        expect(
          ['string', 'number', 'integer', 'boolean'],
          `${tool.function.name}.${nom}`
        ).toContain(type);
      }
    }
  });

  it('les noms déclarés correspondent au jeu d’exécution', () => {
    expect(new Set(DIAGNOSTIC_TOOLS.map((t) => t.function.name))).toEqual(
      new Set(DIAGNOSTIC_TOOL_NAMES)
    );
  });

  it('tous les outils de diagnostic sont répétables — ils observent du mutable', () => {
    for (const name of DIAGNOSTIC_TOOL_NAMES) {
      expect(REPEATABLE_TOOLS.has(name), `${name} doit être répétable`).toBe(true);
    }
  });
});

describe('run_and_trace', () => {
  it('relance le rendu AVANT d’observer', async () => {
    const { ctx, rerender } = makeContext(makeTrace());
    await runDiagnosticTool('run_and_trace', {}, ctx);
    expect(rerender).toHaveBeenCalled();
  });

  it('rend le flux en texte français', async () => {
    const { ctx } = makeContext(makeTrace());
    const out = await runDiagnosticTool('run_and_trace', {}, ctx);
    expect(out).toContain('Flux —');
    expect(out).toContain('reçoit 100 lignes ← src');
  });

  it('avertit quand le relevé est pris en plein vol', async () => {
    const { ctx } = makeContext(makeTrace({ quiescent: false }), { settled: false });
    expect(await runDiagnosticTool('run_and_trace', {}, ctx)).toContain('ATTENTION');
  });

  it('explique l’absence d’aperçu au lieu de jeter', async () => {
    const { ctx } = makeContext(null);
    expect(await runDiagnosticTool('run_and_trace', {}, ctx)).toContain('Aucun aperçu observable');
  });

  it('nomme les champs présents en entrée et absents en sortie', async () => {
    const { ctx } = makeContext(makeTrace());
    const out = await runDiagnosticTool('run_and_trace', {}, ctx);
    expect(out).toContain('Champs présents en entrée mais absents en sortie');
    expect(out).toContain('montant');
  });
});

describe('trace_pipeline', () => {
  it('observe sans relancer', async () => {
    const { ctx, rerender } = makeContext(makeTrace());
    const out = await runDiagnosticTool('trace_pipeline', {}, ctx);
    expect(rerender).not.toHaveBeenCalled();
    expect(out).toContain('Flux —');
  });
});

describe('inspect_stage', () => {
  it('détaille une étape', async () => {
    const { ctx } = makeContext(makeTrace());
    const out = await runDiagnosticTool('inspect_stage', { node_id: 'src' }, ctx);
    expect(out).toContain('Étape src — dsfr-data-source');
    expect(out).toContain('api-type="tabular"');
    expect(out).toContain('dept (texte)');
  });

  it('liste les étapes connues quand l’id est faux', async () => {
    const { ctx } = makeContext(makeTrace());
    const out = await runDiagnosticTool('inspect_stage', { node_id: 'inexistant' }, ctx);
    expect(out).toContain("n'existe pas");
    expect(out).toContain('src, q1');
  });

  it('rend l’URL réellement appelée sur un échec (#603)', async () => {
    const trace = makeTrace();
    trace.states.src = {
      status: 'error',
      message: 'HTTP 400: Bad Request',
      attemptedUrl: 'https://api.fr/x?dept__groupby=yes',
      emissions: 0,
    };
    const { ctx } = makeContext(trace);
    const out = await runDiagnosticTool('inspect_stage', { node_id: 'src' }, ctx);
    expect(out).toContain('ÉCHEC : HTTP 400: Bad Request');
    expect(out).toContain('https://api.fr/x?dept__groupby=yes');
  });

  it('dit où chaque opération s’est exécutée', async () => {
    const { ctx } = makeContext(makeTrace());
    expect(await runDiagnosticTool('inspect_stage', { node_id: 'q1' }, ctx)).toContain(
      'Délégation : groupBy=client'
    );
  });

  it('masque les valeurs sous redactValues mais garde comptes et champs', async () => {
    const { ctx } = makeContext(makeTrace(), { redact: true });
    const out = await runDiagnosticTool('inspect_stage', { node_id: 'src' }, ctx);
    expect(out).not.toContain('42');
    expect(out).toContain('dept (texte)');
    expect(out).toContain('100 ligne');
  });
});

// ---------------------------------------------------------------------------
// lister_constats (#1010)
// ---------------------------------------------------------------------------

/** Valeurs de données qu'aucune sortie masquée ne doit contenir. */
const SECRETS = ['Dupont', 'Martine', 'SIRET-83412', 'jeton-tres-secret'];

/**
 * Trace dont chaque constat porte, dans sa preuve, une valeur de donnée :
 * message d'erreur, requête d'URL, message de console.
 */
function traceFautive(): Trace {
  const trace = makeTrace();
  trace.states.src = {
    status: 'error',
    message: 'Valeur invalide « Dupont » pour le champ nom',
    attemptedUrl: 'https://api.fr/x?where=nom%3D%22Martine%22&apikey=jeton-tres-secret',
    emissions: 0,
  };
  trace.states.q1 = { status: 'loaded', rows: 0, fields: [], emissions: 1 };
  trace.console = [
    {
      t: 1,
      niveau: 'error',
      message: 'Uncaught TypeError: ligne SIRET-83412 illisible',
      source: 'onerror',
    },
  ];
  return trace;
}

describe('lister_constats', () => {
  it('rend constat, cause, preuve et id, classés par gravité', async () => {
    const { ctx } = makeContext(traceFautive());
    const out = await runDiagnosticTool('lister_constats', {}, ctx);

    expect(out).toContain('3 constats : 1 erreur, 2 avertissements.');
    // L'id en tête : la clé que #1014 relie aux repères.
    expect(out).toContain('1. pipeline/etape-en-erreur@src — [erreur] src : échec du chargement');
    expect(out).toContain('. pipeline/zero-ligne@q1 — [avertissement] q1 : aucune ligne');
    expect(out).toContain('. console/erreur-non-rattachee — [avertissement]');
    expect(out).toContain('Cause : ');
    expect(out).toContain('Preuve : Valeur invalide « Dupont »');
    // Toujours rendue : le modèle sait qu'il n'y a rien à montrer.
    expect(out).toContain('Repères : aucun');
    // L'erreur passe avant les avertissements.
    expect(out.indexOf('[erreur]')).toBeLessThan(out.indexOf('[avertissement]'));
  });

  it('sous redactValues, aucune valeur de donnée ne fuit', async () => {
    const { ctx } = makeContext(traceFautive(), { redact: true });
    const out = await runDiagnosticTool('lister_constats', {}, ctx);

    for (const secret of SECRETS) expect(out, secret).not.toContain(secret);
    expect(out).toContain(PREUVE_MASQUEE);
    expect(out).not.toContain('Preuve : Valeur');
    // Le diagnostic reste exploitable : constats, ids, causes.
    expect(out).toContain('1. pipeline/etape-en-erreur@src — [erreur]');
    expect(out).toContain('3 constats : 1 erreur, 2 avertissements.');
  });

  it('sans redactValues, la même trace cite ses preuves (le masquage est bien la cause)', async () => {
    const { ctx } = makeContext(traceFautive());
    const out = await runDiagnosticTool('lister_constats', {}, ctx);
    expect(out).toContain('Dupont');
    expect(out).toContain('SIRET-83412');
    expect(out).not.toContain(PREUVE_MASQUEE);
  });

  it('lit les constats de l’app quand elle les fournit, repères compris', async () => {
    const constat: Constat = {
      id: 'carte/sans-champ-geo@lay',
      regle: 'carte/sans-champ-geo',
      gravite: 'erreur',
      titre: 'lay : aucun champ géographique',
      explication: 'La couche ne sait pas où placer les points.',
      action: 'Choisir le champ géographique de la couche',
      reperes: ['carto.couches.geo-field'],
      preuve: 'aucun champ de type geo_point parmi 12',
      etape: 'lay',
    };
    const constats = vi.fn(() => [constat]);
    const { ctx } = makeContext(makeTrace(), { constats });
    const out = await runDiagnosticTool('lister_constats', {}, ctx);

    expect(constats).toHaveBeenCalled();
    expect(out).toContain('1 constat : 1 erreur.');
    expect(out).toContain('1. carte/sans-champ-geo@lay — [erreur] lay : aucun champ géographique');
    expect(out).toContain('À faire : Choisir le champ géographique de la couche');
    expect(out).toContain('Repères : carto.couches.geo-field');
  });

  it('masque aussi la preuve d’une règle d’app, repères en clair', async () => {
    const constat: Constat = {
      id: 'carte/latlon-inversees',
      regle: 'carte/latlon-inversees',
      gravite: 'avertissement',
      titre: 'Latitude et longitude inversées',
      explication: 'Les points tombent hors de France.',
      reperes: ['carto.couches.geo-field'],
      preuve: 'premier point : Dupont (2.35, 48.85)',
    };
    const { ctx } = makeContext(makeTrace(), { constats: () => [constat], redact: true });
    const out = await runDiagnosticTool('lister_constats', {}, ctx);
    expect(out).not.toContain('Dupont');
    expect(out).toContain(PREUVE_MASQUEE);
    expect(out).toContain('Repères : carto.couches.geo-field');
  });

  it('dit qu’il n’y a rien à signaler sur un pipeline sain', async () => {
    const { ctx } = makeContext(makeTrace());
    expect(await runDiagnosticTool('lister_constats', {}, ctx)).toContain('Aucun constat');
  });

  it('explique l’absence d’aperçu', async () => {
    const { ctx } = makeContext(null);
    expect(await runDiagnosticTool('lister_constats', {}, ctx)).toContain(
      'Aucun aperçu observable'
    );
    const { ctx: ctx2 } = makeContext(makeTrace(), { constats: () => null });
    expect(await runDiagnosticTool('lister_constats', {}, ctx2)).toContain(
      'Aucun aperçu observable'
    );
  });

  it('formaterConstats omet « À faire » sans geste et dit « aucun » repère', () => {
    const out = formaterConstats([
      {
        id: 'pipeline/traitement-client@src',
        regle: 'pipeline/traitement-client',
        gravite: 'info',
        titre: 'src : regroupement calculé dans le navigateur',
        explication: 'x',
        reperes: [],
        preuve: '8 lignes rapatriées',
      },
    ]);
    expect(out).toContain('1 constat : 1 info.');
    expect(out).not.toContain('À faire');
    expect(out).toContain('Repères : aucun');
  });
});

describe('libellés de progression', () => {
  it('nomme chaque outil en français', () => {
    expect(humanizeDiagnosticStep('run_and_trace', {})).toContain('relance');
    expect(humanizeDiagnosticStep('inspect_stage', { node_id: 'q1' })).toContain('q1');
    expect(humanizeDiagnosticStep('lister_constats', {})).toContain('constats');
    expect(humanizeDiagnosticStep('lister_constats', {})).toBe('Je relis les constats…');
    expect(humanizeDiagnosticStep('inconnu', {})).toBeNull();
  });

  it('chaque outil déclaré a son libellé', () => {
    for (const name of DIAGNOSTIC_TOOL_NAMES) {
      expect(humanizeDiagnosticStep(name, {}), name).not.toBeNull();
    }
  });
});

describe('frontière lib/app (#319)', () => {
  const src = (f: string) =>
    readFileSync(resolve(__dirname, '../../packages/shared/src', f), 'utf-8');

  it('exporté par index.ts, jamais par lib.ts', () => {
    expect(src('index.ts')).toContain("from './ia/diagnostic-tools.js'");
    expect(src('lib.ts')).not.toContain('diagnostic-tools');
  });

  it('le studio ne garde pas de copie locale', () => {
    expect(() =>
      readFileSync(resolve(__dirname, '../../apps/studio/src/ia/diagnostic-tools.ts'))
    ).toThrow();
  });
});
