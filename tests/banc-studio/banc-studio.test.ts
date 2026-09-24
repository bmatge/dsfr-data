/**
 * Banc de pertinence du Studio (#1112) — le banc lui-meme, sous transport
 * MOCKE (reponses d'outils preenregistrees, aucun reseau).
 *
 * Chaque critere est vu VERT sur un essai conforme, puis ROUGE sur un defaut
 * injecte dans la conversation du modele (preuve de mutation) : un critere
 * qui ne peut pas echouer ne mesure rien. La boucle, le document, l'export et
 * le lint sont les VRAIS (ceux du Studio) : seul le modele est simule.
 */
import { describe, it, expect } from 'vitest';
import { lintMarkup, type ComponentContract, type OpenAIResponse } from '@dsfr-data/shared';
import { COMPONENT_CONTRACT } from '../../mcp-server/src/component-contract.generated.js';
import { executerScenario } from '../../tools/banc-studio/executer.js';
import {
  evaluer,
  groupesManquants,
  type CritereId,
  type Execution,
  type ResultatCritere,
  type Scenario,
  type Verdict,
} from '../../tools/banc-studio/criteres.js';
import {
  agreger,
  essaiDe,
  rapportMarkdown,
  type MetaRapport,
} from '../../tools/banc-studio/rapport.js';
import { SCENARIOS, choisirScenarios } from '../../tools/banc-studio/scenarios.js';
import { ecartsAuSchema, ecartsDeLAppel } from '../../tools/banc-studio/schema.js';
import { creerCadence, normaliserInstance } from '../../tools/banc-studio/transport.js';

// ---------------------------------------------------------------------------
// Modele simule
// ---------------------------------------------------------------------------

interface Appel {
  name: string;
  args: Record<string, unknown>;
}

let compteur = 0;

/** Reponse du modele : appels d'outils, texte, et `usage` comme Albert. */
function reponse(appels: Appel[], content = ''): OpenAIResponse {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content,
          tool_calls: appels.length
            ? appels.map((a) => ({
                id: `appel-${++compteur}`,
                type: 'function' as const,
                function: { name: a.name, arguments: JSON.stringify(a.args) },
              }))
            : undefined,
        },
      },
    ],
    usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
  } as OpenAIResponse;
}

/** Transport qui rejoue une liste de reponses, puis un texte de repli. */
function modele(reponses: OpenAIResponse[]) {
  let i = 0;
  const corps: Record<string, unknown>[] = [];
  const post = async (body: Record<string, unknown>): Promise<OpenAIResponse> => {
    corps.push(body);
    return reponses[i++] ?? reponse([], 'Terminé.');
  };
  return { post, corps };
}

function scenario(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
}

function verdicts(resultats: ResultatCritere[]): Record<CritereId, Verdict> {
  return Object.fromEntries(resultats.map((r) => [r.critere, r.verdict])) as Record<
    CritereId,
    Verdict
  >;
}

function detail(resultats: ResultatCritere[], critere: CritereId): string {
  return resultats.find((r) => r.critere === critere)?.detail ?? '';
}

async function jouer(id: string, reponses: OpenAIResponse[]): Promise<Execution> {
  const { post } = modele(reponses);
  return executerScenario(scenario(id), { post, model: 'simule' });
}

// ---------------------------------------------------------------------------
// « Aides nationales »
// ---------------------------------------------------------------------------

const COUCHE_CONFORME = {
  type: 'marker',
  latField: 'Latitude',
  lonField: 'Longitude',
  groupField: 'Ville',
  popupMode: 'panel-right',
  popupTitleField: 'Ville',
  popupFields: 'Action / aide nationale',
};

const FIN_AVEC_AVERTISSEMENT =
  "Carte ajoutée : un marqueur par ville, le volet liste les aides. Attention : « Nombre total d'actions » " +
  'est un total par ville répété sur chaque ligne, je ne l’affiche pas comme une valeur par aide.';

function aidesConformes(
  couche: Record<string, unknown> = COUCHE_CONFORME,
  fin = FIN_AVEC_AVERTISSEMENT
) {
  return [
    reponse([{ name: 'inspect_data', args: {} }]),
    reponse([
      { name: 'add_blocks', args: { blocks: [{ kind: 'map', title: 'Aides', layers: [couche] }] } },
    ]),
    reponse([{ name: 'finish', args: { message: fin } }]),
  ];
}

describe('banc Studio — aides nationales, essai conforme', () => {
  it('tous les criteres applicables sont verts', async () => {
    const e = await jouer('aides-nationales', aidesConformes());
    expect(e.erreur).toBeUndefined();
    expect(e.tours).toBe(3);
    expect(e.tokens.total).toBe(3300);
    expect(e.appels.map((a) => a.nom)).toEqual(['inspect_data', 'add_blocks', 'finish']);
    expect(e.html).toContain('group-field="Ville"');
    expect(verdicts(evaluer(scenario('aides-nationales'), e))).toEqual({
      'blocs-attendus': 'ok',
      'hors-schema': 'ok',
      'bloc-non-demande': 'ok',
      avertissements: 'ok',
      'refus-d-emblee': 'na',
      'code-valide': 'ok',
      'fin-propre': 'ok',
      tours: 'ok',
    });
  });

  it('le banc joue la boucle du Studio EN LIGNE : prompt, outils de diagnostic, plafond de sortie', async () => {
    const { post, corps } = modele(aidesConformes());
    await executerScenario(scenario('aides-nationales'), { post, model: 'simule' });
    const premier = corps[0];
    const outils = (premier.tools as Array<{ function: { name: string } }>).map(
      (t) => t.function.name
    );
    expect(outils).toEqual(
      expect.arrayContaining(['add_blocks', 'finish', 'run_and_trace', 'read_generated_code'])
    );
    expect(premier.max_completion_tokens).toBe(4096);
    const systeme = (premier.messages as Array<{ role: string; content: string }>)[0];
    expect(systeme.content).toContain('Vocabulaire des blocs');
    expect(systeme.content).toContain('Aides nationales par ville');
    // Comme main.ts : les lignes chargees nourrissent le signal du total repete (#1123).
    expect(systeme.content).toContain(
      "« Nombre total d'actions » est constant pour chaque « Ville »"
    );
  });
});

describe('banc Studio — preuves de mutation, un critere a la fois', () => {
  it('blocs-attendus ROUGE sans groupField', async () => {
    const { groupField: _retire, ...sansGroupe } = COUCHE_CONFORME;
    const r = evaluer(
      scenario('aides-nationales'),
      await jouer('aides-nationales', aidesConformes(sansGroupe))
    );
    expect(verdicts(r)['blocs-attendus']).toBe('echec');
    expect(detail(r, 'blocs-attendus')).toContain('groupField');
  });

  it('blocs-attendus ROUGE avec une bulle au lieu du volet', async () => {
    const r = evaluer(
      scenario('aides-nationales'),
      await jouer('aides-nationales', aidesConformes({ ...COUCHE_CONFORME, popupMode: 'popup' }))
    );
    expect(verdicts(r)['blocs-attendus']).toBe('echec');
    expect(detail(r, 'blocs-attendus')).toContain('popupMode');
  });

  it('hors-schema ROUGE sur une option inconnue — que le document, lui, ignore en silence', async () => {
    const e = await jouer(
      'aides-nationales',
      aidesConformes({ ...COUCHE_CONFORME, popupTemplateMode: 'liste' })
    );
    // Le bloc est cree : sans le banc, rien ne signalerait l'option inventee.
    expect(e.document.widgets).toHaveLength(1);
    const r = evaluer(scenario('aides-nationales'), e);
    expect(verdicts(r)['hors-schema']).toBe('echec');
    expect(detail(r, 'hors-schema')).toContain('popupTemplateMode');
  });

  it('hors-schema ROUGE sur un type faux (cluster:"Ville", la confusion de #1109)', async () => {
    const r = evaluer(
      scenario('aides-nationales'),
      await jouer('aides-nationales', aidesConformes({ ...COUCHE_CONFORME, cluster: 'Ville' }))
    );
    expect(verdicts(r)['hors-schema']).toBe('echec');
    expect(detail(r, 'hors-schema')).toContain('cluster');
  });

  it('bloc-non-demande ROUGE quand un filtre et un tableau sont ajoutes (constat de #1109)', async () => {
    const reponses = [
      reponse([{ name: 'inspect_data', args: {} }]),
      reponse([
        {
          name: 'add_blocks',
          args: {
            blocks: [
              { kind: 'filters', fields: ['Ville'] },
              { kind: 'map', layers: [COUCHE_CONFORME] },
              { kind: 'chart', config: { type: 'datalist', valueField: "Nombre total d'actions" } },
            ],
          },
        },
      ]),
      reponse([{ name: 'finish', args: { message: FIN_AVEC_AVERTISSEMENT } }]),
    ];
    const r = evaluer(scenario('aides-nationales'), await jouer('aides-nationales', reponses));
    expect(verdicts(r)['bloc-non-demande']).toBe('echec');
    expect(verdicts(r)['blocs-attendus']).toBe('ok');
    expect(detail(r, 'bloc-non-demande')).toContain('filters');
    expect(detail(r, 'bloc-non-demande')).toContain('chart/datalist');
  });

  it('avertissements ROUGE si le total repete n’est pas signale', async () => {
    // Le critere lit les reponses : on lui donne celle qui TAIT le total, telle
    // quelle (la boucle, elle, y ajoute desormais la note — test suivant).
    const e = await jouer('aides-nationales', aidesConformes());
    const r = evaluer(scenario('aides-nationales'), {
      ...e,
      reponses: ['Carte ajoutée : un marqueur par ville.'],
    });
    expect(verdicts(r).avertissements).toBe('echec');
  });

  it('avertissements VERT de bout en bout : la boucle ajoute la note quand le modele la tait (#1123)', async () => {
    const e = await jouer(
      'aides-nationales',
      aidesConformes(COUCHE_CONFORME, 'Carte ajoutée : un marqueur par ville.')
    );
    expect(e.reponses[0]).toContain('Carte ajoutée : un marqueur par ville.');
    expect(e.reponses[0]).toContain(
      "« Nombre total d'actions » est constant pour chaque « Ville »"
    );
    // Coordonnees de la couche : repetees par ville, c'est normal, on les tait.
    expect(e.reponses[0]).not.toContain('Latitude');
    expect(verdicts(evaluer(scenario('aides-nationales'), e)).avertissements).toBe('ok');
  });

  it('code-valide ROUGE quand le balisage exporte porte un attribut inconnu', async () => {
    const e = await jouer('aides-nationales', aidesConformes());
    expect(verdicts(evaluer(scenario('aides-nationales'), e))['code-valide']).toBe('ok');
    const html = e.html.replace('<dsfr-data-map-layer', '<dsfr-data-map-layer group-champ="Ville"');
    expect(html).not.toBe(e.html);
    const mute: Execution = {
      ...e,
      html,
      lint: lintMarkup(html, COMPONENT_CONTRACT as unknown as ComponentContract),
    };
    const r = evaluer(scenario('aides-nationales'), mute);
    expect(verdicts(r)['code-valide']).toBe('echec');
    expect(detail(r, 'code-valide')).toContain('group-champ');
  });

  it('fin-propre et tours ROUGES quand la boucle epuise son plafond', async () => {
    // run_and_trace est repetable : la boucle ne l'arrete pas, seul le plafond le fait.
    const boucle = Array.from({ length: 11 }, () => reponse([{ name: 'run_and_trace', args: {} }]));
    const e = await jouer('aides-nationales', [...boucle, reponse([], 'Je n’ai pas pu conclure.')]);
    expect(e.plafond).toBe(true);
    expect(e.tours).toBe(12);
    const r = verdicts(evaluer(scenario('aides-nationales'), e));
    expect(r['fin-propre']).toBe('echec');
    expect(r.tours).toBe('echec');
  });

  it('fin-propre ROUGE sur une reponse vide', async () => {
    const e = await jouer('aides-nationales', [reponse([], '')]);
    expect(verdicts(evaluer(scenario('aides-nationales'), e))['fin-propre']).toBe('echec');
  });

  it('fin-propre ROUGE quand l’usager verrait du JSON brut (#1123)', async () => {
    const e = await jouer('aides-nationales', aidesConformes());
    for (const brut of [
      `{"message": "${FIN_AVEC_AVERTISSEMENT}"}`,
      '```json\n{"message": "Fait."}\n```',
      '{"name": "finish", "arguments": {"message": "Fait."}}',
    ]) {
      const r = evaluer(scenario('aides-nationales'), { ...e, reponses: [brut] });
      expect(verdicts(r)['fin-propre']).toBe('echec');
      expect(detail(r, 'fin-propre')).toContain('JSON brut');
    }
    // Une prose qui CITE du JSON n'est pas du JSON brut.
    const prose = evaluer(scenario('aides-nationales'), {
      ...e,
      reponses: ['Le document porte {"groupField": "Ville"} sur la couche.'],
    });
    expect(verdicts(prose)['fin-propre']).toBe('ok');
  });

  it('fin-propre VERT de bout en bout : le finish ecrit en texte est lu par la boucle (#1123)', async () => {
    // Conversation du constat : l'argument de finish ecrit en TEXTE au lieu
    // d'un appel d'outil. La boucle du Studio n'en garde que le message.
    const [inspecter, ajouter] = aidesConformes();
    const e = await jouer('aides-nationales', [
      inspecter,
      ajouter,
      reponse([], JSON.stringify({ message: FIN_AVEC_AVERTISSEMENT })),
    ]);
    expect(e.reponses).toEqual([FIN_AVEC_AVERTISSEMENT]);
    const r = verdicts(evaluer(scenario('aides-nationales'), e));
    expect(r['fin-propre']).toBe('ok');
    expect(r.avertissements).toBe('ok');
  });
});

describe('banc Studio — ecarts de la mesure de base (#1123)', () => {
  it('aides nationales : inspect_data remet au modele le FAIT du total repete', async () => {
    const { post, corps } = modele(aidesConformes());
    await executerScenario(scenario('aides-nationales'), { post, model: 'simule' });
    // Deuxieme requete : elle porte le resultat d'inspect_data.
    const messages = corps[1].messages as Array<{ role: string; content: string }>;
    const resultat = messages.filter((m) => m.role === 'tool').map((m) => m.content);
    expect(resultat.join('\n')).toContain(
      "« Nombre total d'actions » est constant pour chaque « Ville »"
    );
  });

  it('tableau pagine : un datalist sans valueField est conforme et accepte du premier coup', async () => {
    const e = await jouer('tableau-pagine', [
      reponse([
        {
          name: 'add_blocks',
          args: { blocks: [{ kind: 'chart', config: { type: 'datalist', pagination: 10 } }] },
        },
      ]),
      reponse([{ name: 'finish', args: { message: 'Tableau ajouté.' } }]),
    ]);
    const r = verdicts(evaluer(scenario('tableau-pagine'), e));
    expect(r['hors-schema']).toBe('ok');
    expect(r['blocs-attendus']).toBe('ok');
    expect(r['code-valide']).toBe('ok');
    expect(e.tours).toBe(2);
  });
});

describe('banc Studio — demande impossible', () => {
  it('VERT : le dit d’emblee, sans toucher au document', async () => {
    const e = await jouer('demande-impossible', [
      reponse(
        [],
        'Ce n’est pas possible dans le Studio : il compose des pages de lecture, pas des formulaires de saisie.'
      ),
    ]);
    const r = verdicts(evaluer(scenario('demande-impossible'), e));
    expect(r['refus-d-emblee']).toBe('ok');
    expect(r['blocs-attendus']).toBe('na');
    expect(r['code-valide']).toBe('na');
    expect(r['bloc-non-demande']).toBe('ok');
  });

  it('ROUGE s’il agit sur le document avant de refuser', async () => {
    const e = await jouer('demande-impossible', [
      reponse([
        { name: 'add_blocks', args: { blocks: [{ kind: 'text', content: 'Formulaire' }] } },
      ]),
      reponse([
        { name: 'finish', args: { message: 'Ce n’est pas possible, voici un texte à la place.' } },
      ]),
    ]);
    const r = evaluer(scenario('demande-impossible'), e);
    expect(verdicts(r)['refus-d-emblee']).toBe('echec');
    expect(detail(r, 'refus-d-emblee')).toContain('add_blocks');
    expect(verdicts(r)['bloc-non-demande']).toBe('echec');
  });

  it('ROUGE s’il ne dit pas que c’est impossible', async () => {
    const e = await jouer('demande-impossible', [
      reponse([], 'Voulez-vous une carte des musées ?'),
    ]);
    expect(verdicts(evaluer(scenario('demande-impossible'), e))['refus-d-emblee']).toBe('echec');
  });
});

describe('banc Studio — conversation a plusieurs messages', () => {
  const barres = { type: 'bar', labelField: 'Région', valueField: 'Population' };

  it('VERT : le camembert remplace les barres (update_block)', async () => {
    const e = await jouer('modification', [
      reponse([{ name: 'add_blocks', args: { blocks: [{ kind: 'chart', config: barres }] } }]),
      reponse([{ name: 'finish', args: { message: 'Graphique en barres ajouté.' } }]),
      reponse([{ name: 'update_block', args: { block_id: 'b1', config: { type: 'pie' } } }]),
      reponse([{ name: 'finish', args: { message: 'Passé en camembert.' } }]),
    ]);
    expect(e.reponses).toEqual(['Graphique en barres ajouté.', 'Passé en camembert.']);
    const r = verdicts(evaluer(scenario('modification'), e));
    expect(r['blocs-attendus']).toBe('ok');
    expect(r['bloc-non-demande']).toBe('ok');
  });

  it('ROUGE quand un second graphique s’ajoute au lieu de modifier le premier', async () => {
    const e = await jouer('modification', [
      reponse([{ name: 'add_blocks', args: { blocks: [{ kind: 'chart', config: barres }] } }]),
      reponse([{ name: 'finish', args: { message: 'Graphique en barres ajouté.' } }]),
      reponse([
        {
          name: 'add_blocks',
          args: { blocks: [{ kind: 'chart', config: { ...barres, type: 'pie' } }] },
        },
      ]),
      reponse([{ name: 'finish', args: { message: 'Camembert ajouté.' } }]),
    ]);
    const r = evaluer(scenario('modification'), e);
    expect(verdicts(r)['blocs-attendus']).toBe('ok');
    expect(verdicts(r)['bloc-non-demande']).toBe('echec');
    expect(detail(r, 'bloc-non-demande')).toContain('chart/bar');
  });
});

describe('banc Studio — autres scenarios, forme des attentes', () => {
  it('barres triees : ROUGE sans sortOrder desc', async () => {
    const config = { type: 'bar', labelField: 'Région', valueField: 'Population' };
    const vert = await jouer('barres-triees', [
      reponse([
        {
          name: 'add_blocks',
          args: { blocks: [{ kind: 'chart', config: { ...config, sortOrder: 'desc' } }] },
        },
      ]),
      reponse([{ name: 'finish', args: { message: 'Fait.' } }]),
    ]);
    const rouge = await jouer('barres-triees', [
      reponse([{ name: 'add_blocks', args: { blocks: [{ kind: 'chart', config }] } }]),
      reponse([{ name: 'finish', args: { message: 'Fait.' } }]),
    ]);
    expect(verdicts(evaluer(scenario('barres-triees'), vert))['blocs-attendus']).toBe('ok');
    expect(verdicts(evaluer(scenario('barres-triees'), rouge))['blocs-attendus']).toBe('echec');
  });

  it('carte de points : ROUGE si un regroupement est pose sans raison', async () => {
    const couche = {
      type: 'marker',
      latField: 'Latitude',
      lonField: 'Longitude',
      tooltipField: 'Nom',
    };
    const jouerCouche = (c: Record<string, unknown>) =>
      jouer('carte-points', [
        reponse([{ name: 'add_blocks', args: { blocks: [{ kind: 'map', layers: [c] }] } }]),
        reponse([{ name: 'finish', args: { message: 'Fait.' } }]),
      ]);
    const vert = await jouerCouche(couche);
    const rouge = await jouerCouche({ ...couche, groupField: 'Ville' });
    expect(verdicts(evaluer(scenario('carte-points'), vert))['blocs-attendus']).toBe('ok');
    expect(verdicts(evaluer(scenario('carte-points'), rouge))['blocs-attendus']).toBe('echec');
  });

  it('au moins six scenarios, ids uniques, sous-ensemble de PR discriminant', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    const pr = choisirScenarios({ pr: true }).map((s) => s.id);
    expect(pr).toEqual(expect.arrayContaining(['aides-nationales', 'demande-impossible']));
    expect(pr.length).toBeLessThan(SCENARIOS.length);
    expect(choisirScenarios({}).length).toBe(SCENARIOS.length);
    expect(choisirScenarios({ ids: ['kpi-total'] }).map((s) => s.id)).toEqual(['kpi-total']);
    expect(() => choisirScenarios({ ids: ['inexistant'] })).toThrow(/inconnu/);
  });

  it('la fixture « Aides nationales » porte bien un total REPETE par ville', () => {
    const lignes = scenario('aides-nationales').source.lignes;
    const parVille = new Map<unknown, Set<unknown>>();
    for (const l of lignes) {
      const s = parVille.get(l.Ville) ?? new Set();
      s.add(l["Nombre total d'actions"]);
      parVille.set(l.Ville, s);
    }
    expect(parVille.size).toBeGreaterThanOrEqual(3);
    for (const [ville, totaux] of parVille) {
      expect(totaux.size, String(ville)).toBe(1);
      const n = lignes.filter((l) => l.Ville === ville).length;
      expect([...totaux][0]).toBe(n);
    }
  });
});

describe('banc Studio — conformite au schema', () => {
  const schema = {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['a', 'b'] },
      n: { type: 'integer' },
      liste: {
        type: 'array',
        items: {
          type: 'object',
          properties: { x: { type: 'string' } },
          additionalProperties: false,
        },
      },
    },
    required: ['mode'],
    additionalProperties: false,
  };

  it('vert sur un objet conforme', () => {
    expect(ecartsAuSchema({ mode: 'a', n: 2, liste: [{ x: 'y' }] }, schema, 'outil')).toEqual([]);
  });

  it('rouge sur enum, type, requis, option inconnue imbriquee', () => {
    expect(ecartsAuSchema({ mode: 'c' }, schema, 'o')[0]).toContain('hors enum');
    expect(ecartsAuSchema({ mode: 'a', n: 1.5 }, schema, 'o')[0]).toContain('au lieu de integer');
    expect(ecartsAuSchema({}, schema, 'o')[0]).toContain('requis');
    expect(ecartsAuSchema({ mode: 'a', liste: [{ z: 1 }] }, schema, 'o')[0]).toBe(
      'o.liste[0].z : option inconnue du schéma'
    );
  });

  it('rouge sur un outil non declare ou des arguments illisibles', () => {
    const outils = [{ type: 'function', function: { name: 'f', parameters: schema } }];
    expect(ecartsDeLAppel({ nom: 'g', brut: '{}' }, outils)[0]).toContain('non déclaré');
    expect(ecartsDeLAppel({ nom: 'f', brut: '{mode' }, outils)[0]).toContain('illisibles');
    expect(ecartsDeLAppel({ nom: 'f', brut: '{"mode":"a"}' }, outils)).toEqual([]);
  });
});

describe('banc Studio — agregation des repetitions', () => {
  const meta: MetaRapport = {
    date: '2026-09-24T00:00:00Z',
    instance: 'https://exemple.test',
    modele: 'simule',
    repetitions: 3,
    pauseMs: 0,
    sousEnsemble: 'choisi',
  };

  it('taux par critere et par scenario ; na et essais en erreur exclus', async () => {
    const s = scenario('aides-nationales');
    const bon = await jouer('aides-nationales', aidesConformes());
    const sansAvertissement = {
      ...(await jouer('aides-nationales', aidesConformes())),
      reponses: ['Carte ajoutée.'],
    };
    const panne = await executerScenario(s, {
      model: 'simule',
      post: async () => {
        throw new Error('HTTP 429');
      },
    });
    expect(panne.erreur).toContain('429');

    const essais = [
      essaiDe(s, 1, bon),
      essaiDe(s, 2, sansAvertissement),
      essaiDe(s, 3, bon),
      essaiDe(s, 4, panne),
    ];
    expect(essais[3].criteres).toEqual([]);
    const rapport = agreger([s], essais, meta, 1234);
    const synthese = rapport.scenarios[0];
    expect(synthese.essais).toBe(4);
    expect(synthese.erreurs).toBe(1);
    expect(synthese.criteres.avertissements).toEqual({ ok: 2, evalues: 3, taux: 2 / 3 });
    expect(synthese.criteres['blocs-attendus'].taux).toBe(1);
    expect(synthese.criteres['refus-d-emblee']).toEqual({ ok: 0, evalues: 0, taux: null });
    expect(synthese.complet).toEqual({ ok: 2, evalues: 3, taux: 2 / 3 });
    expect(synthese.moyennes.tours).toBe(3);
    expect(rapport.cout.appels).toBe(9);
    expect(rapport.cout.tokens.total).toBe(9900);
    expect(rapport.cout.dureeMs).toBe(1234);

    const md = rapportMarkdown(rapport);
    expect(md).toContain('| `aides-nationales` | 67 % (2/3)');
    expect(md).toContain('Avertissements attendus | 67 % (2/3)');
    // Un critere jamais evalue n'encombre pas le tableau.
    expect(md).not.toContain('Impossible dit d’emblée');
    expect(md).toContain('#4 : erreur');
  });

  it('le Markdown neutralise les barres et sauts de ligne d’un texte externe', async () => {
    const s = scenario('demande-impossible');
    const e = await executerScenario(s, {
      model: 'simule',
      post: async () => {
        throw new Error('passerelle | indisponible\nréessayer');
      },
    });
    const md = rapportMarkdown(agreger([s], [essaiDe(s, 1, e)], meta, 0));
    expect(md).toContain('erreur — passerelle \\| indisponible réessayer');
  });
});

describe('banc Studio — outillage', () => {
  it('mots-cles : casse, accents et apostrophes ignores', () => {
    const mots = { libelle: 't', tous: [['total'], ['répété', 'constant']] };
    expect(groupesManquants('Le TOTAL est repete', mots)).toEqual([]);
    expect(groupesManquants('Le total', mots)).toEqual(['répété | constant']);
    expect(
      groupesManquants('total\u202frépété', { libelle: 't', tous: [['total répété']] })
    ).toEqual([]);
  });

  it('cadence : attend le reste de la pause depuis le debut du dernier appel', async () => {
    let t = 0;
    const attentes: number[] = [];
    const cadence = creerCadence(
      10000,
      () => t,
      async (ms) => {
        attentes.push(ms);
        t += ms;
      }
    );
    await cadence();
    t += 3000;
    await cadence();
    t += 12000;
    await cadence();
    expect(attentes).toEqual([7000]);
  });

  it('instance : http(s) seulement, sans barre finale', () => {
    expect(normaliserInstance('https://chartsbuilder.miweb.run/')).toBe(
      'https://chartsbuilder.miweb.run'
    );
    expect(normaliserInstance('http://localhost:5173')).toBe('http://localhost:5173');
    expect(() => normaliserInstance('file:///etc/passwd')).toThrow(/http/);
    expect(() => normaliserInstance('pas une url')).toThrow(/invalide/);
  });
});

// ---------------------------------------------------------------------------
// « Tableau croisé » : seulement avec le bloc « composant libre » (#1111)
// ---------------------------------------------------------------------------

describe('banc Studio — tableau croisé (bloc composant libre, #1111)', () => {
  const pivot = (attrs: Record<string, string>) => ({
    tag: 'dsfr-data-pivot',
    attributes: Object.entries({ id: 'croise', source: 'banc-tableau-croise', ...attrs }).map(
      ([name, value]) => ({ name, value })
    ),
  });
  const LISTE = { tag: 'dsfr-data-list', attributes: [{ name: 'source', value: 'croise' }] };
  const CONFORME = { row: 'Commune', column: 'Type', value: 'Nombre d’élèves' };
  const essai = (components: unknown[]) =>
    jouer('tableau-croise', [
      reponse([{ name: 'inspect_data', args: {} }]),
      reponse([
        {
          name: 'add_blocks',
          args: { blocks: [{ kind: 'component', title: 'Élèves', components }] },
        },
      ]),
      reponse([{ name: 'finish', args: { message: 'Tableau croisé ajouté.' } }]),
    ]);

  it('essai conforme : tous les criteres applicables sont verts', async () => {
    const r = evaluer(scenario('tableau-croise'), await essai([pivot(CONFORME), LISTE]));
    expect(verdicts(r)).toMatchObject({
      'blocs-attendus': 'ok',
      'hors-schema': 'ok',
      'bloc-non-demande': 'ok',
      'code-valide': 'ok',
      'fin-propre': 'ok',
    });
  });

  it('colonnes et lignes inversees : blocs attendus en echec, avec l’ecart', async () => {
    const r = evaluer(
      scenario('tableau-croise'),
      await essai([pivot({ ...CONFORME, row: 'Type', column: 'Commune' }), LISTE])
    );
    expect(verdicts(r)['blocs-attendus']).toBe('echec');
    expect(detail(r, 'blocs-attendus')).toContain('<dsfr-data-pivot> row');
  });

  it('pivot sans liste pour l’afficher : echec', async () => {
    const r = evaluer(scenario('tableau-croise'), await essai([pivot(CONFORME)]));
    expect(detail(r, 'blocs-attendus')).toContain('<dsfr-data-list> absent');
  });

  it('un tableau guide a la place du pivot : echec', async () => {
    const e = await jouer('tableau-croise', [
      reponse([
        {
          name: 'add_blocks',
          args: { blocks: [{ kind: 'chart', config: { type: 'datalist' } }] },
        },
      ]),
      reponse([{ name: 'finish', args: { message: 'Tableau ajouté.' } }]),
    ]);
    const r = verdicts(evaluer(scenario('tableau-croise'), e));
    expect(r['blocs-attendus']).toBe('echec');
    expect(r['bloc-non-demande']).toBe('echec');
  });
});
