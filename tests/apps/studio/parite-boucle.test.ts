/**
 * Parité des tests : la BOUCLE du Studio IA face à un modèle qui se trompe (#1081).
 *
 * L'ancien Assistant IA validait une action JSON (`validateAction`) et renvoyait
 * au modèle un `create_chart` cassé (`tests/apps/builder-ia/action-schema.test.ts`
 * et `agent-loop.test.ts`, partis avec lui). Le Studio n'a plus d'action
 * terminale : le modèle édite un document par des outils, la boucle continue
 * jusqu'à `finish`. Ce fichier garde les mêmes comportements, sur ce chemin :
 *
 *   - les outils proposés au modèle, et `get_skill` adressable par section ;
 *   - la documentation consultée DANS la boucle revient au modèle, dans
 *     l'ordre du reclasseur quand il y en a un (#514) ;
 *   - un outil ou un type inventé, des arguments illisibles : refus rendu au
 *     modèle, qui se corrige au tour suivant ;
 *   - les étapes sont dites à l'usager au fil de l'eau.
 *
 * Déjà gardé ailleurs, et non refait ici : le plafond de tours (8, 12 avec le
 * diagnostic — `diagnostic-tools.test.ts`), l'anti-doublon, la réponse sans
 * outil et la correction d'un champ inexistant (`agent-loop.test.ts`), le
 * contenu des fiches par section et le repli du reclasseur
 * (`tests/shared/ia-skills-client.test.ts`, `skill-rerank.test.ts`).
 *
 * Un comportement attendu est rouge aujourd'hui : il reste en `it.skip`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHART_CONFIG_TYPES,
  SKILLS_INDISPONIBLES,
  createEmptyDashboard,
  resetSkillsCache,
} from '@dsfr-data/shared';
import type {
  DashboardData,
  OpenAIResponse,
  PostChat,
  PublishedSkill,
  ReclasserSkills,
} from '@dsfr-data/shared';
import { runStudioLoop } from '../../../apps/studio/src/ia/agent-loop';
import { BLOCK_KINDS } from '../../../apps/studio/src/document';

const DATA = [
  { region: 'Bretagne', population: 3300 },
  { region: 'Normandie', population: 3400 },
];
const FIELDS = [
  { name: 'region', type: 'texte', sample: 'Bretagne' },
  { name: 'population', type: 'numérique', sample: 3300 },
];

const FICHES: PublishedSkill[] = [
  {
    id: 'dsfrDataChart',
    name: 'dsfr-data-chart',
    description: 'Graphiques DSFR',
    trigger: ['graphique', 'chart'],
    content: '## Chart — fiche entière',
    sections: { guide: '## Chart — guide', reference: '## Chart — référence' },
  },
  {
    id: 'dsfrDataKpi',
    name: 'dsfr-data-kpi',
    description: 'Indicateur chiffré',
    trigger: ['kpi', 'indicateur'],
    content: '## KPI — fiche entière',
    sections: { guide: '## KPI — guide' },
  },
];

interface Appel {
  name: string;
  /** Objet sérialisé en JSON, ou chaîne envoyée telle quelle (JSON cassé). */
  args: Record<string, unknown> | string;
}

function appels(...calls: Appel[]): OpenAIResponse {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: calls.map((c, i) => ({
            id: `appel-${c.name}-${i}`,
            type: 'function' as const,
            function: {
              name: c.name,
              arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args),
            },
          })),
        },
      },
    ],
  };
}

const fin = (message: string) => appels({ name: 'finish', args: { message } });

/** Corps d'une requête au modèle, tel que la boucle l'a envoyé. */
interface Corps {
  messages: { role: string; content: string }[];
  tools: { function: { name: string; parameters?: unknown } }[];
}

/** Modèle scripté : rend les réponses dans l'ordre, et garde ce qu'il a reçu. */
function modele(reponses: OpenAIResponse[]): { post: PostChat; recus: Corps[] } {
  const recus: Corps[] = [];
  let i = 0;
  const post: PostChat = async (body) => {
    // La boucle complète le MÊME tableau de messages d'un tour à l'autre :
    // on en garde une copie, sinon chaque corps montrerait l'état final.
    recus.push(JSON.parse(JSON.stringify(body)) as Corps);
    return reponses[Math.min(i++, reponses.length - 1)];
  };
  return { post, recus };
}

/** Résultats d'outils (role `tool`) présents dans une requête, dans l'ordre. */
const retours = (corps: Corps): string[] =>
  corps.messages.filter((m) => m.role === 'tool').map((m) => m.content);

function options(post: PostChat, doc: DashboardData = createEmptyDashboard()) {
  return {
    conversation: [{ role: 'user' as const, content: 'population par région, en barres' }],
    systemPrompt: 'système',
    document: doc,
    data: DATA,
    fields: FIELDS,
    sourceId: 'src-1',
    post,
    model: 'modele-test',
  };
}

const BLOC_VALIDE = {
  kind: 'chart',
  config: { type: 'bar', labelField: 'region', valueField: 'population' },
};

/** Sert `skills.json` au client des fiches, comme le fait l'instance déployée. */
function servirFiches(fiches: PublishedSkill[] | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      fiches
        ? new Response(JSON.stringify(fiches), { status: 200 })
        : new Response('', { status: 404 })
    )
  );
}

beforeEach(() => resetSkillsCache());

afterEach(() => {
  vi.unstubAllGlobals();
  resetSkillsCache();
});

describe('les outils proposés au modèle', () => {
  it('sans option : introspection, documentation, édition du document, puis finish', async () => {
    const { post, recus } = modele([fin('ok')]);
    await runStudioLoop(options(post));

    expect(recus[0].tools.map((t) => t.function.name)).toEqual([
      'inspect_data',
      'distinct_values',
      'count_where',
      'get_relevant_skills',
      'get_skill',
      'add_blocks',
      'update_block',
      'remove_block',
      'move_block',
      'set_page',
      'reset_document',
      'finish',
    ]);
  });

  it('get_skill est adressable par section, dans une énumération fermée (#513)', async () => {
    const { post, recus } = modele([fin('ok')]);
    await runStudioLoop(options(post));

    const getSkill = recus[0].tools.find((t) => t.function.name === 'get_skill');
    const params = getSkill?.function.parameters as {
      properties: { section?: { enum?: string[] } };
      required: string[];
    };
    expect(params.properties.section?.enum).toEqual([
      'guide',
      'reference',
      'exemples',
      'pieges',
      'tout',
    ]);
    expect(params.required).toEqual(['skill_id']);
  });

  it('finish est le seul outil terminal : il clôt le tour sans rien exécuter', async () => {
    const doc = createEmptyDashboard();
    const { post, recus } = modele([
      appels(
        { name: 'finish', args: { message: 'Terminé.' } },
        { name: 'add_blocks', args: { blocks: [BLOC_VALIDE] } }
      ),
    ]);
    const resultat = await runStudioLoop(options(post, doc));

    expect(resultat.fin).toBe('terminal');
    expect(resultat.text).toBe('Terminé.');
    expect(recus).toHaveLength(1);
    // Ce qui suit finish dans le même tour n'est pas appliqué.
    expect(doc.widgets).toHaveLength(0);
  });
});

describe('la documentation consultée dans la boucle revient au modèle', () => {
  it('get_relevant_skills puis add_blocks : la fiche est lue au tour suivant', async () => {
    servirFiches(FICHES);
    const doc = createEmptyDashboard();
    const { post, recus } = modele([
      appels({ name: 'get_relevant_skills', args: { message: 'graphique en barres' } }),
      appels({ name: 'add_blocks', args: { blocks: [BLOC_VALIDE] } }),
      fin('Graphique ajouté.'),
    ]);
    const progres: string[][] = [];
    const resultat = await runStudioLoop({
      ...options(post, doc),
      onProgress: (etapes) => progres.push([...etapes]),
    });

    expect(retours(recus[1])).toEqual(['## Chart — guide']);
    expect(doc.widgets).toHaveLength(1);
    expect(resultat.text).toBe('Graphique ajouté.');
    // Les étapes sont dites à l'usager au fil de l'eau, puis gardées.
    expect(progres[0]).toEqual(['Je consulte la documentation…']);
    expect(resultat.steps).toEqual([
      'Je consulte la documentation…',
      'J’ajoute un bloc…',
      'Je finalise…',
    ]);
  });

  it('get_skill(section) ne rend que la section demandée, sans section la fiche entière', async () => {
    servirFiches(FICHES);
    const { post, recus } = modele([
      appels(
        { name: 'get_skill', args: { skill_id: 'dsfrDataChart', section: 'reference' } },
        { name: 'get_skill', args: { skill_id: 'dsfrDataChart', section: 'tout' } }
      ),
      fin('ok'),
    ]);
    const resultat = await runStudioLoop(options(post));

    expect(retours(recus[1])).toEqual(['## Chart — référence', '## Chart — fiche entière']);
    expect(resultat.steps[0]).toBe('Je consulte la fiche « dsfrDataChart »…');
  });

  it('le reclasseur injecté ordonne les fiches rendues au modèle (#514)', async () => {
    servirFiches(FICHES);
    const vus: { message: string; ids: string[] }[] = [];
    const inverse: ReclasserSkills = async (message, candidates) => {
      vus.push({ message, ids: candidates.map((c) => c.skill.id) });
      return [...candidates].reverse();
    };
    const demande = {
      name: 'get_relevant_skills',
      args: { message: 'graphique kpi indicateur chart' },
    };

    const sans = modele([appels(demande), fin('ok')]);
    await runStudioLoop(options(sans.post));
    const avec = modele([appels(demande), fin('ok')]);
    await runStudioLoop({ ...options(avec.post), reclasserSkills: inverse });

    expect(vus).toHaveLength(1);
    expect(vus[0].message).toBe('graphique kpi indicateur chart');
    expect([...vus[0].ids].sort()).toEqual(['dsfrDataChart', 'dsfrDataKpi']);
    // L'ordre inversé se lit dans ce que le modèle reçoit.
    const ordreLocal = retours(sans.recus[1])[0].split('\n\n---\n\n');
    const ordreReclasse = retours(avec.recus[1])[0].split('\n\n---\n\n');
    expect(ordreLocal).toHaveLength(2);
    expect(ordreReclasse).toEqual([...ordreLocal].reverse());
  });

  it('sans skills.json, la boucle le dit au modèle et continue', async () => {
    servirFiches(null);
    const { post, recus } = modele([
      appels({ name: 'get_relevant_skills', args: { message: 'graphique' } }),
      fin('Fait sans documentation.'),
    ]);
    const resultat = await runStudioLoop(options(post));

    expect(retours(recus[1])).toEqual([SKILLS_INDISPONIBLES]);
    expect(resultat.text).toBe('Fait sans documentation.');
  });
});

describe('un appel d’outil cassé est rendu au modèle, qui se corrige', () => {
  /** Un premier appel fautif, puis le bloc valide, puis finish. */
  async function corriger(fautif: Appel) {
    const doc = createEmptyDashboard();
    const { post, recus } = modele([
      appels(fautif),
      appels({ name: 'add_blocks', args: { blocks: [BLOC_VALIDE] } }),
      fin('Corrigé.'),
    ]);
    const resultat = await runStudioLoop(options(post, doc));
    return { doc, resultat, refus: retours(recus[1])[0] ?? '', tours: recus.length };
  }

  it('un outil inventé : « Outil inconnu », le document n’est pas touché', async () => {
    const { doc, resultat, refus, tours } = await corriger({
      name: 'create_chart',
      args: { config: { type: 'bar', valueField: 'population' } },
    });

    expect(refus).toBe('Outil inconnu : create_chart');
    expect(tours).toBe(3);
    expect(doc.widgets).toHaveLength(1);
    expect(resultat.applied).toBe(1);
    expect(resultat.text).toBe('Corrigé.');
  });

  it('un type de graphique inventé : refus qui liste les types permis', async () => {
    const { doc, refus } = await corriger({
      name: 'add_blocks',
      args: { blocks: [{ kind: 'chart', config: { type: 'pyramide', valueField: 'population' } }] },
    });

    expect(refus).toContain('✗ bloc chart refusé');
    expect(refus).toContain('Type "pyramide" inconnu');
    for (const type of CHART_CONFIG_TYPES) expect(refus).toContain(type);
    expect(doc.widgets).toHaveLength(1);
  });

  it('une nature de bloc inventée : refus qui liste les natures permises', async () => {
    const { doc, refus } = await corriger({
      name: 'add_blocks',
      args: { blocks: [{ kind: 'table', config: { type: 'bar', valueField: 'population' } }] },
    });

    expect(refus).toContain(`kind "table" inconnu (${BLOCK_KINDS.join(' | ')})`);
    expect(doc.widgets).toHaveLength(1);
  });

  it('des arguments qui ne sont pas du JSON : l’outil dit ce qui manque, sans lever', async () => {
    const { doc, resultat, refus } = await corriger({
      name: 'add_blocks',
      args: '{"blocks": [{"kind": "chart", "config": {"type": "bar"',
    });

    expect(refus).toBe('add_blocks : aucun bloc fourni.');
    expect(doc.widgets).toHaveLength(1);
    // L'appel fautif n'a rien appliqué : seul le bloc corrigé compte.
    expect(resultat.applied).toBe(1);
  });

  it('un bloc refusé et un bloc valide dans le même appel : le valide est gardé, le refus est dit', async () => {
    const doc = createEmptyDashboard();
    const { post, recus } = modele([
      appels({
        name: 'add_blocks',
        args: { blocks: [{ kind: 'chart', config: { type: 'bar' } }, BLOC_VALIDE] },
      }),
      fin('ok'),
    ]);
    await runStudioLoop(options(post, doc));

    const [compteRendu] = retours(recus[1]);
    expect(compteRendu).toContain('"valueField" est obligatoire pour le type bar');
    expect(compteRendu).toContain('+ b1 (chart)');
    expect(doc.widgets).toHaveLength(1);
  });

  // DÉFAUT DU STUDIO — laissé en `skip`, non corrigé ici (#1081, parité des tests).
  //
  // Un argument dont la FORME n'est pas celle du schéma fait lever une
  // exception dans `apps/studio/src/document.ts`, au lieu d'un refus rendu au
  // modèle. `executer` (agent-loop.ts) la relance, `runAgentLoop` ne la rattrape
  // pas : le tour entier échoue, et l'usager lit dans le chat
  // « Erreur : (spec.fields ?? []).filter is not a function ».
  //
  //   blocks: [null]                        → TypeError: Cannot read properties of null (reading 'kind')
  //   {kind:"filters", fields:"region"}     → TypeError: (spec.fields ?? []).filter is not a function
  //   {kind:"map", layers:{type:"marker"}}  → TypeError: rawLayers is not iterable
  //
  //   attendu : « ✗ bloc … refusé : … », rendu au modèle, et la boucle continue
  //   (comme pour `config: "bar"`, déjà refusé proprement).
  //
  // L'ancien Assistant rejetait une entrée non-objet sans lever
  // (`validateAction(null)` rendait null) et renvoyait l'appel cassé au modèle.
  // Une chaîne à la place d'un tableau d'un seul élément est une erreur
  // courante d'un modèle sans décodage guidé.
  it.skip.each([
    ['un bloc null', { blocks: [null] }],
    ['fields en chaîne au lieu d’un tableau', { blocks: [{ kind: 'filters', fields: 'region' }] }],
    [
      'layers en objet au lieu d’un tableau',
      { blocks: [{ kind: 'map', layers: { type: 'marker' } }] },
    ],
  ])('%s : refus rendu au modèle, la boucle continue', async (_cas, args) => {
    const { doc, resultat, refus } = await corriger({ name: 'add_blocks', args });

    expect(refus).toContain('refusé');
    expect(resultat.text).toBe('Corrigé.');
    expect(doc.widgets).toHaveLength(1);
  });
});
