import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  attachRecorderToFrame,
  DataflowRecorder,
  drainerJournal,
  earlyBufferScript,
  formatTrace,
  installerJournal,
  journalScript,
  masquerUrl,
  JOURNAL_MAX,
  type EntreeConsole,
  type EntreeReseau,
  type FrameAttachment,
  type Trace,
} from '@dsfr-data/shared';

/**
 * Journal réseau et console (#994).
 *
 * Deux implémentations écrivent le même tampon : `installerJournal` (TS, même
 * document — Carto, Pipeline) et `journalScript()` (ES5, tampon précoce de
 * l'iframe d'aperçu). Elles ne partagent pas de code : CHAQUE test ci-dessous
 * tourne donc sur les deux, sans quoi l'une dériverait en silence.
 */

/** Une fenêtre factice : ce que les deux poses touchent, rien de plus. */
interface FenetreFactice {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  console: { warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
  location: { href: string; origin: string };
  performance: { getEntriesByName: (name: string, type?: string) => unknown[] };
  addEventListener: EventTarget['addEventListener'];
  dispatchEvent: EventTarget['dispatchEvent'];
  __dsfrDataNet?: EntreeReseau[];
  __dsfrDataConsole?: EntreeConsole[];
}

function fenetre(fetchImpl: FenetreFactice['fetch']): FenetreFactice {
  const cible = new EventTarget();
  return {
    fetch: fetchImpl,
    console: { warn: vi.fn(), error: vi.fn() },
    location: { href: 'https://app.test/carto/', origin: 'https://app.test' },
    performance: { getEntriesByName: () => [] },
    addEventListener: cible.addEventListener.bind(cible),
    dispatchEvent: cible.dispatchEvent.bind(cible),
  };
}

const POSES: Array<[string, (w: FenetreFactice) => void]> = [
  ['installerJournal (même document)', (w) => installerJournal(w as unknown as Window)],
  [
    'journalScript (tampon précoce ES5)',
    (w) => new Function('window', journalScript())(w as unknown as Window),
  ],
];

/** Laisse passer les `then` posés par l'enveloppe. */
const vider = () => new Promise((r) => setTimeout(r, 0));

function reponse(corps: string, status: number, type = 'application/json'): Response {
  return new Response(corps, {
    status,
    headers: { 'content-type': type, 'content-length': String(corps.length) },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(POSES)('journal — %s', (_nom, poser) => {
  it('journalise une réponse 404 sans en lire le corps, et rend la MÊME promesse', async () => {
    const json = vi.spyOn(Response.prototype, 'json');
    const text = vi.spyOn(Response.prototype, 'text');
    const clone = vi.spyOn(Response.prototype, 'clone');
    const promesse = Promise.resolve(reponse('{"erreur":"introuvable"}', 404));
    const w = fenetre(() => promesse);
    poser(w);

    const rendue = w.fetch('/tabular-proxy/api/resources/abc/data/?page=1');
    expect(rendue).toBe(promesse);
    await vider();

    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
    const [entree] = drainerJournal(w as unknown as Window).reseau;
    expect(entree).toMatchObject({
      url: 'https://app.test/tabular-proxy/api/resources/abc/data/?page=1',
      methode: 'GET',
      statut: 404,
      type: 'application/json',
      taille: 24,
      erreur: null,
      origine: 'fetch',
    });
    expect(typeof entree.t).toBe('number');
    expect(entree.dureeMs).not.toBeNull();
    // L'appelant lit le corps, intact.
    expect(await (await rendue).json()).toEqual({ erreur: 'introuvable' });
  });

  it('journalise un TypeError (CORS simulé) et le rend tel quel à l’appelant', async () => {
    const erreur = new TypeError('Failed to fetch');
    const w = fenetre(() => Promise.reject(erreur));
    poser(w);

    await expect(w.fetch('https://data.exemple.fr/api', { method: 'post' })).rejects.toBe(erreur);
    await vider();

    const [entree] = drainerJournal(w as unknown as Window).reseau;
    expect(entree).toMatchObject({
      url: 'https://data.exemple.fr/api',
      methode: 'POST',
      statut: null,
      erreur: 'TypeError: Failed to fetch',
    });
  });

  it('laisse remonter une exception synchrone du fetch d’origine', () => {
    const w = fenetre(() => {
      throw new TypeError('URL invalide');
    });
    poser(w);

    expect(() => w.fetch('::')).toThrow('URL invalide');
  });

  it('journalise un console.error de la lib et appelle toujours la console d’origine', () => {
    const w = fenetre(() => Promise.resolve(reponse('', 200)));
    const origine = w.console.error;
    poser(w);

    const err = new Error('HTTP 404');
    w.console.error('[dsfr-data-source] Erreur de chargement :', err);
    w.console.warn('attention');

    expect(origine).toHaveBeenCalledWith('[dsfr-data-source] Erreur de chargement :', err);
    const { console: messages } = drainerJournal(w as unknown as Window);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      niveau: 'error',
      source: 'console',
      message: '[dsfr-data-source] Erreur de chargement : Error: HTTP 404',
    });
    expect(messages[0].pile).toContain('HTTP 404');
    expect(messages[1]).toMatchObject({ niveau: 'warn', source: 'console', message: 'attention' });
  });

  it('journalise les erreurs non rattrapées et les promesses rejetées', () => {
    const w = fenetre(() => Promise.resolve(reponse('', 200)));
    poser(w);

    w.dispatchEvent(
      new ErrorEvent('error', { message: 'Uncaught ReferenceError: x', error: new Error('x') })
    );
    const rejet = new Event('unhandledrejection');
    Object.defineProperty(rejet, 'reason', { value: new Error('promesse perdue') });
    w.dispatchEvent(rejet);

    const { console: messages } = drainerJournal(w as unknown as Window);
    expect(messages.map((m) => [m.source, m.niveau])).toEqual([
      ['onerror', 'error'],
      ['unhandledrejection', 'error'],
    ]);
    expect(messages[0].message).toBe('Uncaught ReferenceError: x');
    expect(messages[1].message).toBe('Error: promesse perdue');
  });

  it('borne les messages à 500 caractères', () => {
    const w = fenetre(() => Promise.resolve(reponse('', 200)));
    poser(w);
    w.console.warn('x'.repeat(2000));

    expect(drainerJournal(w as unknown as Window).console[0].message).toHaveLength(500);
  });

  it('plafonne chaque tampon à 500 entrées en évinçant les plus anciennes', () => {
    const w = fenetre(() => Promise.resolve(reponse('', 200)));
    poser(w);
    for (let i = 0; i < JOURNAL_MAX + 10; i++) w.console.warn(`m${i}`);

    const { console: messages } = drainerJournal(w as unknown as Window);
    expect(messages).toHaveLength(JOURNAL_MAX);
    expect(messages[0].message).toBe('m10');
    expect(messages[messages.length - 1].message).toBe(`m${JOURNAL_MAX + 9}`);
  });

  it('exclut le beacon et les appels /api/* de l’app, pas les /api d’un autre hôte', async () => {
    const w = fenetre(() => Promise.resolve(reponse('', 200)));
    poser(w);

    await w.fetch('https://chartsbuilder.test/beacon?c=dsfr-data-chart');
    await w.fetch('/api/monitoring/beacon', { method: 'POST' });
    await w.fetch('/api/auth/me');
    await w.fetch('https://data.exemple.fr/api/records');
    await vider();

    expect(drainerJournal(w as unknown as Window).reseau.map((e) => e.url)).toEqual([
      'https://data.exemple.fr/api/records',
    ]);
  });

  it('est idempotent : une seconde pose ne double pas les entrées', async () => {
    const w = fenetre(() => Promise.resolve(reponse('', 200)));
    poser(w);
    installerJournal(w as unknown as Window);
    new Function('window', journalScript())(w);

    await w.fetch('https://data.exemple.fr/a');
    w.console.error('une fois');
    await vider();

    const journal = drainerJournal(w as unknown as Window);
    expect(journal.reseau).toHaveLength(1);
    expect(journal.console).toHaveLength(1);
  });

  it('vide les tampons au drainage et complète la taille par performance', async () => {
    const sansLongueur = new Response('abc', { status: 200 });
    const w = fenetre(() => Promise.resolve(sansLongueur));
    w.performance.getEntriesByName = () => [
      { duration: 12, encodedBodySize: 2048, transferSize: 0 },
    ];
    poser(w);

    await w.fetch('https://data.exemple.fr/b');
    await vider();

    const [entree] = drainerJournal(w as unknown as Window).reseau;
    expect(entree.statut).toBe(200);
    expect(entree.taille).toBe(2048);
    expect(drainerJournal(w as unknown as Window).reseau).toEqual([]);
  });

  it('ne conserve AUCUN en-tête de requête', async () => {
    const w = fenetre(() => Promise.resolve(reponse('', 401)));
    poser(w);

    await w.fetch('https://docs.getgrist.com/api/docs/x', {
      headers: { Authorization: 'Bearer SECRET-GRIST', 'X-Grist-Token': 'SECRET-2' },
    });
    await vider();

    const brut = JSON.stringify(drainerJournal(w as unknown as Window));
    expect(brut).not.toContain('SECRET');
  });
});

describe('le tampon précoce porte le journal', () => {
  it('earlyBufferScript embarque le journal dans la même balise', () => {
    const script = earlyBufferScript();
    expect(script).toContain('__dsfrDataNet');
    expect(script).toContain('__dsfrDataConsole');
    expect(script.match(/<script>/g)).toHaveLength(1);
    expect(script).toContain(journalScript());
  });
});

describe('le collecteur draine le journal', () => {
  const entreeReseau = (over: Partial<EntreeReseau> = {}): EntreeReseau => ({
    t: 1000,
    url: 'https://data.exemple.fr/api?apikey=SECRET',
    methode: 'GET',
    statut: 404,
    dureeMs: 40,
    type: 'application/json',
    taille: 12,
    erreur: null,
    origine: 'fetch',
    ...over,
  });

  let attachment: FrameAttachment | null = null;
  afterEach(() => {
    attachment?.detach();
    attachment = null;
    document.body.innerHTML = '';
    delete (window as unknown as FenetreFactice).__dsfrDataNet;
    delete (window as unknown as FenetreFactice).__dsfrDataConsole;
  });

  it('attachRecorderToFrame lit les tampons de l’iframe', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const win = frame.contentWindow as unknown as FenetreFactice;
    win.__dsfrDataNet = [entreeReseau()];
    win.__dsfrDataConsole = [{ t: 1001, niveau: 'error', message: 'boom', source: 'console' }];

    attachment = attachRecorderToFrame(frame);
    const trace = attachment.snapshot()!;

    expect(trace.reseau).toHaveLength(1);
    expect(trace.console).toHaveLength(1);
    // Vidé : l'iframe ne rejouera pas ce journal.
    expect(win.__dsfrDataNet).toEqual([]);
  });

  it('en même document (liveRoot), l’instantané lit le journal de la fenêtre, en continu', () => {
    const w = window as unknown as FenetreFactice;
    w.__dsfrDataNet = [entreeReseau({ t: 1 })];
    w.__dsfrDataConsole = [];
    const recorder = new DataflowRecorder({ root: document.body });
    recorder.start();

    expect(recorder.snapshot().reseau).toHaveLength(1);
    // Un console.warn seul n'émet rien sur le bus : seul le pull le rattrape.
    w.__dsfrDataConsole.push({ t: 2, niveau: 'warn', message: 'tardif', source: 'console' });
    const trace = recorder.snapshot();
    expect(trace.reseau).toHaveLength(1);
    expect(trace.console.map((m) => m.message)).toEqual(['tardif']);

    recorder.clear();
    expect(recorder.snapshot().reseau).toEqual([]);
    recorder.stop();
  });

  it('une trace sans journal porte des tableaux vides', () => {
    const recorder = new DataflowRecorder({ root: document.body });
    const trace = recorder.snapshot();
    expect(trace.reseau).toEqual([]);
    expect(trace.console).toEqual([]);
  });
});

describe('formatTrace — sections Réseau et Console', () => {
  function trace(over: Partial<Trace>): Trace {
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
            attrs: {},
          },
        ],
        dangling: [],
      },
      events: [],
      states: { src: { status: 'error', message: 'HTTP 404', emissions: 0 } },
      order: ['src'],
      sinceLastEventMs: 0,
      lastEventAt: 0,
      quiescent: true,
      delegation: {},
      reseau: [],
      console: [],
      ...over,
    };
  }

  const reseau: EntreeReseau[] = [
    {
      t: 1,
      url: 'https://data.exemple.fr/api/records?where=nom%3D%22Dupont%22&apikey=SECRET1&monkey=1',
      methode: 'GET',
      statut: 404,
      dureeMs: 1234,
      type: 'application/json; charset=utf-8',
      taille: 2048,
      erreur: null,
      origine: 'fetch',
    },
    {
      t: 2,
      url: 'https://autre.exemple.fr/data?access_token=SECRET2&Token=SECRET3',
      methode: 'GET',
      statut: null,
      dureeMs: 5,
      type: null,
      taille: null,
      erreur: 'TypeError: Failed to fetch',
      origine: 'fetch',
    },
    {
      t: 3,
      url: 'https://data.exemple.fr/ok?key=SECRET4',
      methode: 'GET',
      statut: 200,
      dureeMs: 30,
      type: 'application/json',
      taille: 500,
      erreur: null,
      origine: 'fetch',
    },
  ];
  const messagesConsole: EntreeConsole[] = [
    {
      t: 4,
      niveau: 'error',
      source: 'console',
      message: '[dsfr-data-source] échec https://data.exemple.fr/x?api_key=SECRET5&q=Dupont',
    },
  ];

  it('rend le 404, le TypeError et le console.error', () => {
    const texte = formatTrace(trace({ reseau, console: messagesConsole }), { now: () => 0 });

    expect(texte).toContain('Réseau — 3 requêtes, 2 en échec :');
    expect(texte).toContain('✗ GET 404 https://data.exemple.fr/api/records');
    expect(texte).toContain('1 234 ms, application/json, 2,0 Ko');
    expect(texte).toContain('sans réponse : TypeError: Failed to fetch');
    expect(texte).toContain('✓ GET 200 https://data.exemple.fr/ok?key=***');
    expect(texte).toContain('Console — 1 message, dont 1 erreur :');
    expect(texte).toContain('✗ console (error) : [dsfr-data-source] échec');
  });

  it('masque les jetons d’URL, dans les requêtes comme dans les messages', () => {
    const texte = formatTrace(trace({ reseau, console: messagesConsole }), { now: () => 0 });

    expect(texte).not.toMatch(/SECRET/);
    expect(texte).toContain('apikey=***');
    expect(texte).toContain('access_token=***');
    expect(texte).toContain('Token=***');
    expect(texte).toContain('api_key=***');
    // `key` est un nom EXACT : `monkey` n'est pas un jeton.
    expect(texte).toContain('monkey=1');
  });

  it('sous redactValues, réduit l’URL à l’hôte et au chemin', () => {
    const texte = formatTrace(trace({ reseau, console: messagesConsole }), {
      now: () => 0,
      redactValues: true,
    });

    expect(texte).toContain('✗ GET 404 data.exemple.fr/api/records —');
    expect(texte).not.toContain('Dupont');
    expect(texte).not.toContain('where=');
    expect(texte).not.toMatch(/SECRET/);
  });

  it('sans journal, le texte ne change pas', () => {
    const texte = formatTrace(trace({}), { now: () => 0 });
    expect(texte).not.toContain('Réseau');
    expect(texte).not.toContain('Console');
  });

  it('sans composant, le journal dit encore pourquoi', () => {
    const vide = trace({ reseau, graph: { nodes: [], dangling: [] }, states: {}, order: [] });
    const texte = formatTrace(vide, { now: () => 0 });
    expect(texte).toContain('Aucun composant dsfr-data');
    expect(texte).toContain('Réseau — 3 requêtes');
  });

  it('masquerUrl garde une URL sans jeton intacte', () => {
    expect(masquerUrl('https://a.fr/p?x=1&y=2')).toBe('https://a.fr/p?x=1&y=2');
    expect(masquerUrl('https://a.fr/p?x=1#f', { hoteEtCheminSeulement: true })).toBe('a.fr/p');
  });
});
