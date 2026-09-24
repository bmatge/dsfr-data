/**
 * Bloc « composant libre » : noms de champs contrôlés étape par étape, et
 * pagination serveur d'une liste libre (#1141).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  analyzeDataFields,
  type DiagnosticContext,
  type FrameAttachment,
  type OpenAIResponse,
  type PostChat,
  createEmptyDashboard,
  generateDashboardHTML,
  type DashboardData,
  type DashboardSource,
  type Trace,
} from '@dsfr-data/shared';
import {
  addBlocks,
  updateBlock,
  type BlockSpec,
  type DocumentContext,
} from '../../../apps/studio/src/document';
import {
  observationsDeTrace,
  verifierChampsLibres,
  type ObservationEtape,
} from '../../../apps/studio/src/composant-libre';
import { runStudioLoop } from '../../../apps/studio/src/ia/agent-loop';

type Attr = { name: string; value: string };
const a = (name: string, value: string): Attr => ({ name, value });

const LIGNES = [
  { Commune: 'Lyon', Type: 'Public', 'Nombre d’élèves': 120, Adresse: { ville: 'Lyon' } },
  { Commune: 'Lyon', Type: 'Privé', 'Nombre d’élèves': 80, Adresse: { ville: 'Lyon' } },
  // Jeu creux : une cle absente de la premiere ligne reste un champ connu.
  { Commune: 'Brest', Type: 'Public', 'Nombre d’élèves': 60, Secteur: 'Nord' },
];

function contexte(extra: Partial<DocumentContext> = {}): DocumentContext {
  return { data: LIGNES, fields: analyzeDataFields(LIGNES), sourceId: 'src', ...extra };
}

function docVide(source: Partial<DashboardSource> = {}): DashboardData {
  const doc = createEmptyDashboard();
  doc.sources = [{ id: 'src', name: 'Établissements', type: 'manual', data: LIGNES, ...source }];
  return doc;
}

interface Comp {
  tag: string;
  attributes: Attr[];
}

/** Pivot `croise` sur la source, puis une liste qui le lit ; `pivotAttrs` remplace ses attributs. */
const pivot = (extra: Attr[] = [], pivotAttrs: Partial<Record<string, string>> = {}): Comp[] => [
  {
    tag: 'dsfr-data-pivot',
    attributes: [
      a('id', 'croise'),
      a('source', 'src'),
      a('row', pivotAttrs.row ?? 'Commune'),
      a('column', pivotAttrs.column ?? 'Type'),
      a('value', pivotAttrs.value ?? 'Nombre d’élèves'),
    ],
  },
  { tag: 'dsfr-data-list', attributes: [a('source', 'croise'), ...extra] },
];

/** Trace minimale : le pivot `croise` observe, ecrit comme `pivot()`. */
function traceDuPivot(attrs: Record<string, string> = {}): Trace {
  return {
    graph: {
      nodes: [
        {
          id: 'croise',
          tag: 'dsfr-data-pivot',
          role: 'transform',
          synthetic: false,
          ambiguous: false,
          upstream: ['src'],
          attrs: { row: 'Commune', column: 'Type', value: 'Nombre d’élèves', ...attrs },
        },
      ],
      dangling: [],
    },
    states: {
      croise: {
        status: 'ok',
        emissions: 1,
        fields: [
          { name: 'Commune', type: 'texte', sample: 'Lyon' },
          { name: 'Public', type: 'numérique', sample: 120 },
          { name: 'Privé', type: 'numérique', sample: 80 },
        ],
      },
    },
  } as unknown as Trace;
}

function ajouter(
  components: BlockSpec['components'],
  ctx = contexte(),
  doc = docVide()
): { ok: boolean; summary: string; doc: DashboardData } {
  const { ok, summary } = addBlocks(doc, [{ kind: 'component', components }], ctx);
  return { ok, summary, doc };
}

describe('bloc libre — noms de champs, étape par étape (#1141)', () => {
  it('un champ présent dans la source est accepté', () => {
    const { ok, summary } = ajouter([
      {
        tag: 'dsfr-data-chart',
        attributes: [
          a('source', 'src'),
          a('type', 'bar'),
          a('label-field', 'Commune'),
          a('value-field', 'Nombre d’élèves'),
        ],
      },
    ]);
    expect(ok).toBe(true);
    expect(summary).not.toContain('non vérifiés');
  });

  it('un champ absent de la source est refusé, avec les champs disponibles', () => {
    const { ok, summary } = ajouter([
      {
        tag: 'dsfr-data-chart',
        attributes: [
          a('source', 'src'),
          a('type', 'bar'),
          a('label-field', 'Commune'),
          a('value-field', 'Montant'),
        ],
      },
    ]);
    expect(ok).toBe(false);
    expect(summary).toContain('value-field="Montant"');
    expect(summary).toContain('absent de la source #src');
    expect(summary).toMatch(/champs disponibles : Commune, Type, Nombre d’élèves/);
  });

  it('une liste séparée par des virgules : chaque champ est vérifié', () => {
    const refuse = ajouter(pivot([], { row: 'Commune, Departement' }));
    expect(refuse.ok).toBe(false);
    expect(refuse.summary).toContain('champ "Departement" absent de la source #src');

    // Alias `champ:Libellé` : seul le champ est vérifié ; jeu creux et chemin imbriqué.
    const accepte = ajouter([
      {
        tag: 'dsfr-data-list',
        attributes: [
          a('source', 'src'),
          a('columns', 'Commune:Ville, Secteur:Secteur, Adresse.ville:Adresse'),
          a('sort', 'Commune:asc'),
        ],
      },
    ]);
    expect(accepte.ok).toBe(true);
  });

  it('champ absent APRÈS le pivot mais présent avant : refusé sur la sortie observée', () => {
    const ctx = contexte({ trace: () => traceDuPivot() });
    const refuse = ajouter(pivot([a('sort', 'Nombre d’élèves:desc')]), ctx);
    expect(refuse.ok).toBe(false);
    expect(refuse.summary).toContain('sort="Nombre d’élèves:desc"');
    expect(refuse.summary).toContain('absent de la sortie de #croise');
    expect(refuse.summary).toContain('champs disponibles : Commune, Public, Privé');

    // La meme colonne produite par le pivot est acceptee.
    const accepte = ajouter(pivot([a('sort', 'Public:desc')]), ctx);
    expect(accepte.ok).toBe(true);
    expect(accepte.summary).not.toContain('non vérifiés');
  });

  it('étape inconnue (pas encore calculée) : pas de refus, lecture signalée non vérifiée', () => {
    const sansTrace = ajouter(pivot([a('sort', 'Nombre d’élèves:desc')]));
    expect(sansTrace.ok).toBe(true);
    expect(sansTrace.summary).toContain('champs non vérifiés');
    expect(sansTrace.summary).toContain('<dsfr-data-list> sort (lit #croise)');
    expect(sansTrace.summary).not.toContain('run_and_trace');

    // Avec l'apercu observable mais le pivot pas encore rendu : renvoi a run_and_trace.
    const aTracer = ajouter(
      pivot([a('sort', 'Nombre d’élèves:desc')]),
      contexte({ trace: () => null })
    );
    expect(aTracer.ok).toBe(true);
    expect(aTracer.summary).toContain('run_and_trace');
  });

  it('une observation d’une version PRÉCÉDENTE du pivot n’est pas reprise', () => {
    // L'apercu a calcule le pivot avec column="Secteur" : la sortie ne vaut plus.
    const ctx = contexte({ trace: () => traceDuPivot({ column: 'Secteur' }) });
    const { ok, summary } = ajouter(pivot([a('sort', 'Nombre d’élèves:desc')]), ctx);
    expect(ok).toBe(true);
    expect(summary).toContain('champs non vérifiés');
  });

  it('un filtre qui conserve le schéma transmet les champs de son entrée', () => {
    const { ok, summary } = ajouter([
      { tag: 'dsfr-data-search', attributes: [a('id', 'rech'), a('source', 'src')] },
      { tag: 'dsfr-data-list', attributes: [a('source', 'rech'), a('sort', 'Montant:desc')] },
    ]);
    expect(ok).toBe(false);
    expect(summary).toContain('absent de la sortie de #rech');
  });

  it('les attributs du pivot lui-même sont vérifiés contre la source', () => {
    const { ok, summary } = ajouter(pivot([], { value: 'Élèves' }));
    expect(ok).toBe(false);
    expect(summary).toContain('value="Élèves"');
  });

  it('update_block contrôle aussi les champs', () => {
    const { doc } = ajouter(pivot());
    const id = doc.widgets[0].id;
    const ctx = contexte({ trace: () => traceDuPivot() });
    const refuse = updateBlock(
      doc,
      id,
      { kind: 'component', components: pivot([a('filters', 'Type')]) },
      ctx
    );
    expect(refuse.ok).toBe(false);
    expect(refuse.summary).toContain('filters="Type"');
  });

  it('verifierChampsLibres : une jointure est vérifiée contre l’union de ses entrées', () => {
    const r = verifierChampsLibres(
      [
        {
          tag: 'dsfr-data-join',
          attributes: [a('id', 'j'), a('left', 'g'), a('right', 'd'), a('on', 'code=cle')],
        },
      ],
      { idsExternes: ['g', 'd'], champsDesSources: { g: ['code', 'nom'], d: ['cle', 'pop'] } }
    );
    expect(r).toEqual({});
    const faux = verifierChampsLibres(
      [
        {
          tag: 'dsfr-data-join',
          attributes: [a('id', 'j'), a('left', 'g'), a('right', 'd'), a('on', 'code=cles')],
        },
      ],
      { idsExternes: ['g', 'd'], champsDesSources: { g: ['code', 'nom'], d: ['cle', 'pop'] } }
    );
    expect(faux.error).toContain('absent des entrées #g et #d');
  });

  it('observationsDeTrace ne retient que les étapes qui ont émis des champs', () => {
    const obs = observationsDeTrace(traceDuPivot());
    const croise = obs.get('croise') as ObservationEtape;
    expect(croise.fields).toEqual(['Commune', 'Public', 'Privé']);
    expect(observationsDeTrace(null).size).toBe(0);
  });
});

describe('bloc libre — la boucle du Studio lit la trace de l’aperçu (#1141)', () => {
  it('add_blocks refuse un champ absent de la sortie observée du pivot', async () => {
    const appel = (name: string, args: Record<string, unknown>): OpenAIResponse => ({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: `c-${name}`,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const reponses = [
      appel('add_blocks', {
        blocks: [{ kind: 'component', components: pivot([a('sort', 'Nombre d’élèves:desc')]) }],
      }),
      appel('finish', { message: 'Fait.' }),
    ];
    let i = 0;
    const post = vi.fn(async () => reponses[Math.min(i++, reponses.length - 1)]) as PostChat;
    const diagnostic: DiagnosticContext = {
      attachment: () => ({ snapshot: () => traceDuPivot() }) as unknown as FrameAttachment,
      rerender: () => undefined,
      redactValues: () => false,
    };
    const doc = docVide();
    await runStudioLoop({
      conversation: [{ role: 'user', content: 'tableau croisé' }],
      systemPrompt: 'system',
      document: doc,
      data: LIGNES,
      fields: analyzeDataFields(LIGNES),
      sourceId: 'src',
      post,
      model: 'm',
      diagnostic,
    });
    const second = (post as ReturnType<typeof vi.fn>).mock.calls[1][0] as {
      messages: { role: string; content?: string }[];
    };
    const outil = second.messages.filter((m) => m.role === 'tool').map((m) => m.content ?? '');
    expect(outil.join('\n')).toContain('absent de la sortie de #croise');
    expect(doc.widgets).toHaveLength(0);
  });
});

describe('bloc libre — pagination serveur d’une liste (#1141, ADR-109)', () => {
  const ODS: Partial<DashboardSource> = {
    provider: 'opendatasoft',
    apiUrl: 'https://data.example.com/api/explore/v2.1/catalog/datasets/mon-jeu/records',
    resourceIds: { datasetId: 'mon-jeu' },
  };

  const liste = (extra: Attr[] = []): BlockSpec['components'] => [
    {
      tag: 'dsfr-data-list',
      attributes: [
        a('source', 'src'),
        a('columns', 'Commune:Ville'),
        a('pagination', '20'),
        ...extra,
      ],
    },
  ];

  it('une liste qui lit directement la source pagine côté serveur, comme la liste guidée', () => {
    const { ok, summary, doc } = ajouter(liste(), contexte(), docVide(ODS));
    expect(ok).toBe(true);
    expect(summary).toContain('pagination serveur (20 lignes par page)');
    const html = generateDashboardHTML(doc);
    expect(html).toContain('server-side page-size="20"');
    expect(html).toMatch(/<dsfr-data-list[^>]*pagination="20"[^>]* server-sort>/);
  });

  it('une liste après un pivot ne pagine jamais côté serveur, et le modèle le sait', () => {
    const { ok, summary, doc } = ajouter(pivot([a('pagination', '20')]), contexte(), docVide(ODS));
    expect(ok).toBe(true);
    expect(summary).toContain(
      'lit #croise, calculé dans le navigateur : pagination serveur impossible'
    );
    expect(generateDashboardHTML(doc)).not.toContain('server-side');
  });

  it('une recherche locale suppose toutes les lignes : jeu entier, dit au modèle', () => {
    const { summary, doc } = ajouter(liste([a('search', '')]), contexte(), docVide(ODS));
    expect(summary).toContain('search suppose toutes les lignes');
    expect(generateDashboardHTML(doc)).not.toContain('server-side');
  });

  it('une source partagée avec un autre lecteur reste chargée entièrement', () => {
    const doc = docVide(ODS);
    ajouter(
      [
        {
          tag: 'dsfr-data-chart',
          attributes: [
            a('source', 'src'),
            a('type', 'bar'),
            a('label-field', 'Commune'),
            a('value-field', 'Nombre d’élèves'),
          ],
        },
      ],
      contexte(),
      doc
    );
    const { summary } = ajouter(liste(), contexte(), doc);
    expect(summary).toContain('jeu entier chargé');
    expect(generateDashboardHTML(doc)).not.toContain('server-side');
  });

  it('une source embarquée ne pagine pas côté serveur', () => {
    const { summary, doc } = ajouter(liste());
    expect(summary).toContain('jeu entier chargé');
    expect(generateDashboardHTML(doc)).not.toContain('server-side');
  });
});
