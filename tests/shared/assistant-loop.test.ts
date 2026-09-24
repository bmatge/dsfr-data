/**
 * Tour Albert de l'assistant contextuel (#1014, ADR-143 §6).
 *
 * `post` est mocké de bout en bout : aucun appel réseau. Critères de l'issue :
 *   - `montrer` d'un id hors enum est refusé sans nouvel appel au modèle ;
 *   - le plafond de tours est respecté (`MAX_ROUNDS_ASSISTANT`) ;
 *   - repli en mode texte quand `toolCalling` est faux ;
 *   - masquage appliqué aux constats envoyés.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import '../../packages/app-ui/src/app-assistant';
import { REGISTRE as REGISTRE_CARTO } from '../../apps/builder-carto/src/assistant/reperes.generated';
import {
  HISTORIQUE_ASSISTANT,
  MAX_ROUNDS_ASSISTANT,
  PREUVE_MASQUEE,
  REPERE_REFUSE,
  constatsPourModele,
  creerRepondreIA,
  idsCites,
  mountAssistant,
  outilMontrer,
  selecteurRepere,
  suivrePlan,
  type AdaptateurReperage,
  type Constat,
  type ContexteAssistant,
  type EtapeMontree,
  type MessageAssistant,
  type MountedAssistant,
  type OpenAIResponse,
  type Repere,
  type RegistreReperes,
  type ResultatMontrer,
  type TransportAssistant,
} from '@dsfr-data/shared';

// ─── Registre et app factices ──────────────────────────────────────────

function repere(
  id: string,
  genre: Repere['genre'],
  libelle: string,
  extra: Partial<Repere> = {}
): Repere {
  return {
    id,
    genre,
    libelle,
    element: genre === 'zone' ? 'section' : 'select',
    attributs: [],
    prerequis: [],
    synonymes: [],
    sources: ['apps/test/index.html'],
    ...extra,
  };
}

const REGISTRE: RegistreReperes = {
  app: 'test-app',
  prefixe: 't',
  reperes: [
    repere('t.source', 'zone', 'Source'),
    repere('t.source.url', 'controle', 'Adresse de l’API', { zone: 'source' }),
    repere('t.couches', 'zone', 'Couches'),
    repere('t.couches.liste', 'controle', 'Liste des couches', { zone: 'couches' }),
    repere('t.elements', 'zone', 'Éléments'),
    repere('t.elements.popup', 'controle', 'Comportement au clic', {
      zone: 'elements',
      synonymes: ['fiche au clic'],
      prerequis: ['couche-active'],
    }),
  ],
};

interface Etat {
  coucheActive: boolean;
}

const PREREQUIS = {
  'couche-active': {
    message: 'Sélectionnez une couche.',
    repereQuiLeve: 't.couches.liste',
    verifier: (e: Etat) => e.coucheActive,
  },
};

const AUCUN = { statut: 'aucun', candidats: [] } as const;

function contexte(partiel: Partial<ContexteAssistant> = {}): ContexteAssistant {
  return {
    question: 'comment je fais ça ?',
    correspondance: AUCUN,
    constats: [],
    mode: 'dire',
    historique: [],
    signal: new AbortController().signal,
    ...partiel,
  };
}

function appel(name: string, args: unknown, content = ''): OpenAIResponse {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content,
          tool_calls: [
            {
              id: `call_${name}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

function texte(content: string): OpenAIResponse {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

function transport(post: TransportAssistant['post'], toolCalling = true) {
  return async (): Promise<TransportAssistant> => ({
    mode: 'server',
    model: 'albert-large',
    post,
    capacites: { toolCalling },
  });
}

interface Corps {
  messages: { role: string; content: string | null }[];
  tools?: { function: { name: string; parameters: Record<string, unknown> } }[];
  tool_choice?: string;
}

const corps = (post: ReturnType<typeof vi.fn>, i: number): Corps => post.mock.calls[i][0] as Corps;

const profil = { nom: 'l’app de test', panneaux: ['Source', 'Couches', 'Éléments'] };

// ─── Correspondance locale d'abord ─────────────────────────────────────

describe('creerRepondreIA — le modèle en secours seulement', () => {
  it('une correspondance claire répond sans appeler le modèle', async () => {
    const post = vi.fn();
    const repondre = creerRepondreIA({ registre: REGISTRE, profil, transport: transport(post) });
    const trouve = {
      statut: 'trouve' as const,
      repere: { repere: REGISTRE.reperes[5], score: 10, raisons: [], chemin: [] },
      candidats: [],
    };

    const r = await repondre(contexte({ correspondance: trouve }));

    expect(post).not.toHaveBeenCalled();
    expect(r.montrer).toBe('t.elements.popup');
    expect(r.source).toBe('correspondance');
  });
});

// ─── montrer(id) à enum fermé ──────────────────────────────────────────

describe('creerRepondreIA — outil montrer(id)', () => {
  it("l'enum du paramètre id est fermé sur les ids du registre, schéma plat", async () => {
    const post = vi
      .fn()
      .mockResolvedValue(appel('montrer', { id: 't.source.url', message: 'Ici.' }));
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post),
      skills: false,
    });

    await repondre(contexte());

    const montrer = corps(post, 0).tools?.find((t) => t.function.name === 'montrer');
    const props = montrer?.function.parameters.properties as Record<string, { enum?: string[] }>;
    expect(props.id.enum).toEqual(REGISTRE.reperes.map((r) => r.id));
    expect(JSON.stringify(montrer)).not.toContain('oneOf');
  });

  it('un id du registre est montré', async () => {
    const post = vi
      .fn()
      .mockResolvedValue(
        appel('montrer', { id: 't.source.url', message: 'Renseignez l’adresse.' })
      );
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post),
      skills: false,
    });

    const r = await repondre(contexte());

    expect(post).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ texte: 'Renseignez l’adresse.', montrer: 't.source.url' });
  });

  it('un id hors enum est refusé sans nouvel appel au modèle', async () => {
    const post = vi
      .fn()
      .mockResolvedValue(appel('montrer', { id: 't.inexistant', message: 'Voyez là.' }));
    const reveler = vi.fn();
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post),
      skills: false,
      montrer: reveler,
    });

    const r = await repondre(contexte());

    expect(post).toHaveBeenCalledTimes(1);
    expect(reveler).not.toHaveBeenCalled();
    expect(r.montrer).toBeUndefined();
    expect(r.reperes).toBeUndefined();
    expect(r.texte).toContain(REPERE_REFUSE);
  });

  it('un id malformé (sélecteur) est refusé de même', async () => {
    const post = vi
      .fn()
      .mockResolvedValue(appel('montrer', { id: '[data-repere] , body', message: 'x' }));
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post),
      skills: false,
    });

    const r = await repondre(contexte());

    expect(post).toHaveBeenCalledTimes(1);
    expect(r.montrer).toBeUndefined();
  });
});

// ─── Plafond ───────────────────────────────────────────────────────────

describe('creerRepondreIA — plafond de tours', () => {
  it(`respecte MAX_ROUNDS_ASSISTANT (${MAX_ROUNDS_ASSISTANT}), dernier tour sans outils`, async () => {
    let n = 0;
    const post = vi.fn().mockImplementation(() => {
      n += 1;
      return Promise.resolve(
        appel('get_relevant_skills', { message: `essai ${n}` }, 'Je cherche.')
      );
    });
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post),
      skills: async () => null,
    });

    const r = await repondre(contexte());

    expect(MAX_ROUNDS_ASSISTANT).toBe(4);
    expect(post).toHaveBeenCalledTimes(MAX_ROUNDS_ASSISTANT);
    expect(corps(post, MAX_ROUNDS_ASSISTANT - 1).tool_choice).toBe('none');
    expect(r.montrer).toBeUndefined();
  });

  it('abandonnée (nouvelle question), la boucle ne rappelle plus le modèle', async () => {
    const ctrl = new AbortController();
    const post = vi.fn().mockImplementation(() => {
      ctrl.abort();
      return Promise.resolve(appel('get_relevant_skills', { message: 'x' }));
    });
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post),
      skills: async () => null,
    });

    await expect(repondre(contexte({ signal: ctrl.signal }))).rejects.toThrow(/abandonnée/);
    expect(post).toHaveBeenCalledTimes(1);
  });
});

// ─── Repli sans tool-calling ───────────────────────────────────────────

describe('creerRepondreIA — repli en mode texte', () => {
  it('sans toolCalling : un seul appel, sans outils, id cité relu et remplacé par son libellé', async () => {
    const post = vi
      .fn()
      .mockResolvedValue(texte('Choisissez le réglage `t.elements.popup` dans le panneau.'));
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post, false),
    });

    const r = await repondre(contexte());

    expect(post).toHaveBeenCalledTimes(1);
    expect(corps(post, 0).tools).toBeUndefined();
    expect(r.montrer).toBe('t.elements.popup');
    expect(r.texte).toBe('Choisissez le réglage « Comportement au clic » dans le panneau.');
    expect(r.source).toBe('modele');
  });

  it('sans id cité, la correspondance locale relit la réponse', async () => {
    const post = vi.fn().mockResolvedValue(texte('Il faut régler la fiche au clic.'));
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post, false),
    });

    const r = await repondre(contexte());

    expect(r.montrer).toBe('t.elements.popup');
  });

  it('idsCites ne compte pas un id qui en prolonge un autre', () => {
    expect(idsCites(REGISTRE, 'voir t.couches.liste.')).toEqual(['t.couches.liste']);
    expect(idsCites(REGISTRE, 'voir t.couches.liste-bis')).toEqual([]);
  });
});

// ─── Masquage ──────────────────────────────────────────────────────────

const CONSTAT: Constat = {
  id: 'reseau/http-erreur@src',
  regle: 'reseau/http-erreur',
  gravite: 'erreur',
  titre: 'src : réponse HTTP 404',
  explication: 'La source ne répond pas.',
  reperes: ['t.source.url'],
  preuve: 'GET https://api.exemple.fr/data?where=nom%3DDupont&apikey=SECRET123 → 404',
  etape: 'src',
};

describe('creerRepondreIA — masquage des constats envoyés', () => {
  it('par défaut, la preuve est masquée et aucun jeton ne part', async () => {
    const post = vi.fn().mockResolvedValue(appel('montrer', { id: 't.source.url', message: 'x' }));
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post),
      skills: false,
    });

    await repondre(contexte({ constats: [CONSTAT] }));

    const envoye = JSON.stringify(corps(post, 0).messages);
    expect(envoye).toContain('reseau/http-erreur@src');
    expect(envoye).toContain(PREUVE_MASQUEE);
    expect(envoye).not.toContain('SECRET123');
    expect(envoye).not.toContain('Dupont');
  });

  it('sans masquage des valeurs, le jeton en paramètre d’URL reste masqué', async () => {
    const post = vi.fn().mockResolvedValue(appel('montrer', { id: 't.source.url', message: 'x' }));
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post),
      skills: false,
      masquer: () => false,
    });

    await repondre(contexte({ constats: [CONSTAT] }));

    const envoye = JSON.stringify(corps(post, 0).messages);
    expect(envoye).toContain('apikey=***');
    expect(envoye).not.toContain('SECRET123');
    expect(constatsPourModele([CONSTAT], false)).toContain('where=nom%3DDupont');
  });

  it('lister_constats passe par le même masquage', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(appel('lister_constats', {}))
      .mockResolvedValueOnce(appel('montrer', { id: 't.source.url', message: 'x' }));
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post),
      skills: false,
      masquer: () => false,
      diagnostic: {
        attachment: () => null,
        rerender: () => {},
        redactValues: () => true,
        constats: () => [CONSTAT],
      },
    });

    await repondre(contexte());

    const outil = corps(post, 1).messages.find((m) => m.role === 'tool');
    expect(outil?.content).toContain('apikey=***');
    expect(outil?.content).not.toContain('SECRET123');
  });
});

// ─── Prompt par app, historique ────────────────────────────────────────

describe('creerRepondreIA — prompt et conversation', () => {
  it('le prompt porte le chemin des panneaux, les réglages et les prérequis de l’app', async () => {
    const post = vi.fn().mockResolvedValue(appel('montrer', { id: 't.source.url', message: 'x' }));
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil: { ...profil, prerequis: PREREQUIS },
      transport: transport(post),
      skills: false,
    });
    const historique: MessageAssistant[] = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'usager',
      texte: `m${i}`,
    }));

    await repondre(contexte({ historique }));

    const { messages } = corps(post, 0);
    const system = messages[0].content ?? '';
    expect(system).toContain('l’app de test');
    expect(system).toContain('Source › Couches › Éléments');
    expect(system).toContain('t.elements.popup — Éléments › Comportement au clic');
    expect(system).toContain('Sélectionnez une couche. Réglage qui le lève : t.couches.liste.');
    // Historique borné, puis la question (la boucle empile ensuite son tour
    // dans le MÊME tableau, que le mock garde par référence).
    expect(messages.filter((m) => m.content?.startsWith('m')).length).toBe(HISTORIQUE_ASSISTANT);
    expect(messages[1].content).toBe(`m${12 - HISTORIQUE_ASSISTANT}`);
    expect(messages[1 + HISTORIQUE_ASSISTANT]).toMatchObject({
      role: 'user',
      content: 'comment je fais ça ?',
    });
  });
});

// ─── Plan pas à pas ────────────────────────────────────────────────────

function adaptateurFactice(etat: Etat) {
  const abonnes = new Set<() => void>();
  const adapt: AdaptateurReperage<Etat> & { emettre(): void } = {
    prerequis: PREREQUIS,
    etat: () => etat,
    async reveler(id: string) {
      let el = document.querySelector<HTMLElement>(selecteurRepere(id));
      if (!el) {
        el = document.createElement('select');
        el.setAttribute('data-repere', id);
        document.body.appendChild(el);
      }
      return el;
    },
    onEtatChange(cb) {
      abonnes.add(cb);
      return () => abonnes.delete(cb);
    },
    emettre() {
      for (const cb of [...abonnes]) cb();
    },
  };
  return adapt;
}

const ok = (): ResultatMontrer => ({ ok: true, element: null, chemin: [] });
/** Un tour de boucle : les microtâches en attente, puis une macrotâche. */
const tour = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Laisse le plan finir l'étape qu'il montre. `afficher` (assistant-loop.ts)
 * se termine par UNE `pause()` d'une macrotâche, programmée depuis une
 * microtâche (après `await montrer`) ; tant qu'elle n'a pas rendu la main, le
 * plan est occupé et ignore `etat-change`. Le premier tour laisse passer les
 * microtâches — la pause est alors programmée —, le second, programmé après
 * elle avec le même délai, passe après elle (ordre d'insertion). Idem pour le
 * `setTimeout(demarrer, 0)` de `creerRepondreIA`, programmé avant nos tours.
 *
 * L'ancien `setTimeout(r, 5)` pariait que la pause serait programmée moins de
 * 4 ms après lui : sous charge, un fil désordonnancé perdait la course, et
 * l'`emettre()` suivant tombait sur un plan encore occupé (#1119).
 */
const attendre = async (): Promise<void> => {
  await tour();
  await tour();
};

describe('suivrePlan — avance sur le changement d’état', () => {
  it('montre chaque étape tour à tour, puis se termine', async () => {
    const adapt = adaptateurFactice({ coucheActive: true });
    const montrer = vi.fn(async (_id: string) => ok());
    const fin = vi.fn();
    const plan = suivrePlan({
      registre: REGISTRE,
      adaptateur: adapt,
      etapes: ['t.source.url', 't.couches.liste', 't.elements.popup'],
      montrer,
      onFin: fin,
    });

    await plan.demarrer();
    expect(montrer.mock.calls.map((c) => c[0])).toEqual(['t.source.url']);

    adapt.emettre();
    await attendre();
    expect(plan.courante()).toBe(1);
    adapt.emettre();
    await attendre();
    expect(montrer.mock.calls.map((c) => c[0])).toEqual([
      't.source.url',
      't.couches.liste',
      't.elements.popup',
    ]);
    adapt.emettre();
    expect(fin).toHaveBeenCalledWith('terminee');
    adapt.emettre();
    expect(montrer).toHaveBeenCalledTimes(3);
  });

  it('ignore les changements d’état émis pendant la révélation', async () => {
    const adapt = adaptateurFactice({ coucheActive: true });
    const montrer = vi.fn(async () => {
      adapt.emettre(); // ouvrir un panneau change l'état de l'app
      return ok();
    });
    const plan = suivrePlan({
      registre: REGISTRE,
      adaptateur: adapt,
      etapes: ['t.source.url', 't.couches.liste'],
      montrer,
    });

    await plan.demarrer();
    await attendre();

    expect(plan.courante()).toBe(0);
    expect(montrer).toHaveBeenCalledTimes(1);
  });

  it('une étape bloquée par un prérequis est remontrée quand il est levé', async () => {
    const etat: Etat = { coucheActive: false };
    const adapt = adaptateurFactice(etat);
    const montrer = vi.fn(async (id: string): Promise<ResultatMontrer> =>
      id === 't.elements.popup' && !etat.coucheActive
        ? { ok: false, element: null, chemin: [], raison: 'prerequis', prerequis: 'couche-active' }
        : ok()
    );
    const etapes: EtapeMontree[] = [];
    const plan = suivrePlan({
      registre: REGISTRE,
      adaptateur: adapt,
      etapes: ['t.elements.popup', 't.source.url'],
      montrer,
      onEtape: (e) => etapes.push(e),
    });

    await plan.demarrer();
    expect(etapes[0].resultat.raison).toBe('prerequis');

    adapt.emettre(); // prérequis toujours manquant : rien ne bouge
    await attendre();
    expect(montrer).toHaveBeenCalledTimes(1);

    etat.coucheActive = true;
    adapt.emettre(); // prérequis levé : la même étape est remontrée
    await attendre();
    expect(montrer.mock.calls.map((c) => c[0])).toEqual(['t.elements.popup', 't.elements.popup']);
    expect(plan.courante()).toBe(0);

    adapt.emettre(); // l'étape est faite : on avance
    await attendre();
    expect(plan.courante()).toBe(1);
  });

  it('s’arrête à l’abandon de la question', async () => {
    const adapt = adaptateurFactice({ coucheActive: true });
    const ctrl = new AbortController();
    const montrer = vi.fn(async (_id: string) => ok());
    const fin = vi.fn();
    const plan = suivrePlan({
      registre: REGISTRE,
      adaptateur: adapt,
      etapes: ['t.source.url', 't.couches.liste'],
      montrer,
      signal: ctrl.signal,
      onFin: fin,
    });

    await plan.demarrer();
    ctrl.abort();
    adapt.emettre();
    await attendre();

    expect(fin).toHaveBeenCalledWith('arretee');
    expect(montrer).toHaveBeenCalledTimes(1);
  });
});

describe('creerRepondreIA — planifier', () => {
  it('sans adaptateur : la première étape montrée, les autres en boutons ; ids hors enum écartés', async () => {
    const post = vi.fn().mockResolvedValue(
      appel('planifier', {
        etapes: ['t.couches.liste', 't.bidon', 't.elements.popup'],
        message: 'Deux gestes.',
      })
    );
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      transport: transport(post),
      skills: false,
    });

    const r = await repondre(contexte());

    expect(r.montrer).toBe('t.couches.liste');
    expect(r.reperes).toEqual(['t.couches.liste', 't.elements.popup']);
  });

  it('avec adaptateur : le plan démarre seul et avance sur etat-change', async () => {
    const post = vi
      .fn()
      .mockResolvedValue(
        appel('planifier', { etapes: ['t.couches.liste', 't.elements.popup'], message: 'Suivez.' })
      );
    const adapt = adaptateurFactice({ coucheActive: true });
    const montrer = vi.fn(async (_id: string) => ok());
    const fin = vi.fn();
    const repondre = creerRepondreIA({
      registre: REGISTRE,
      profil,
      adaptateur: adapt,
      transport: transport(post),
      skills: false,
      montrer,
      onFinPlan: fin,
    });

    const r = await repondre(contexte());
    expect(r.montrer).toBeUndefined();
    expect(r.reperes).toEqual(['t.couches.liste', 't.elements.popup']);

    await attendre();
    expect(montrer.mock.calls.map((c) => c[0])).toEqual(['t.couches.liste']);
    adapt.emettre();
    await attendre();
    adapt.emettre();
    expect(montrer.mock.calls.map((c) => c[0])).toEqual(['t.couches.liste', 't.elements.popup']);
    expect(fin).toHaveBeenCalledWith('terminee');
  });
});

// ─── Branchement dans mountAssistant (contrat de #1011) ────────────────

describe('creerRepondreIA — injecté comme repondre de mountAssistant', () => {
  let monte: MountedAssistant | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });
  afterEach(() => {
    monte?.destroy();
    monte = null;
  });

  it('sur le registre carto généré, le modèle en secours montre le repère désigné', async () => {
    const id = 'carto.elements.clic.popup-mode';
    const post = vi.fn().mockResolvedValue(appel('montrer', { id, message: 'Par ici.' }));
    const reveles: string[] = [];
    const adaptateur: AdaptateurReperage<Record<string, never>> = {
      prerequis: Object.fromEntries(
        REGISTRE_CARTO.reperes
          .flatMap((r) => r.prerequis)
          .map((nom) => [
            nom,
            { message: 'm', repereQuiLeve: REGISTRE_CARTO.reperes[0].id, verifier: () => true },
          ])
      ),
      etat: () => ({}),
      async reveler(cible: string) {
        reveles.push(cible);
        const el = document.createElement('select');
        el.setAttribute('data-repere', cible);
        document.body.appendChild(el);
        return el;
      },
    };
    const tools = outilMontrer(REGISTRE_CARTO.reperes.map((r) => r.id));
    expect(tools.function.parameters.properties.id.enum).toContain(id);

    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur,
      repondre: creerRepondreIA({
        registre: REGISTRE_CARTO,
        adaptateur,
        profil: { nom: 'le builder carto' },
        transport: transport(post),
        skills: false,
      }),
    });

    // Question hors correspondance locale : le modèle est appelé.
    await monte.poser('zzz qwxv');

    expect(post).toHaveBeenCalledTimes(1);
    expect(reveles).toEqual([id]);
    const dernier = monte.panel.messages[monte.panel.messages.length - 1];
    expect(dernier).toMatchObject({ role: 'assistant', source: 'modele', texte: 'Par ici.' });
  });
});
