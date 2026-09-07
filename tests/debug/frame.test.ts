import { describe, it, expect, afterEach } from 'vitest';
import {
  attachRecorderToFrame,
  drainEarlyBuffer,
  earlyBufferScript,
  formatTrace,
  getPreviewHTML,
  readCacheSnapshot,
  type FrameAttachment,
} from '@dsfr-data/shared';

/**
 * Observation d'un pipeline qui tourne dans une iframe d'apercu (#605).
 *
 * CE FICHIER EXISTE A CAUSE D'UN BUG REEL. La premiere version se branchait
 * au `load` de l'iframe. Or, mesure dans un navigateur :
 *
 *     dsfr-data-loading   t = 52 ms
 *     DOMContentLoaded    t = 53 ms
 *     dsfr-data-loaded    t = 56 ms
 *     window 'load'       t = 87 ms   <- on arrivait ICI
 *
 * Resultat : le volet affichait « inerte / rien recu » sous un graphique
 * parfaitement rendu, ET le meme ecran sur un pipeline en echec. Un
 * diagnostic confiant et faux dans les deux sens — exactement ce que tout ce
 * module existe pour empecher.
 *
 * Le premier bloc ci-dessous est LE test de non-regression : il simule la
 * chronologie reelle, evenements emis AVANT le branchement.
 */

/** Une iframe dont le document porte deja un pipeline et un tampon rempli. */
function makeFrame(): { frame: HTMLIFrameElement; doc: Document; win: Window } {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const win = doc.defaultView!;
  return { frame, doc, win };
}

/** Empile un evenement comme le ferait le tampon injecte dans la page. */
function buffer(win: Window, name: string, detail: unknown): void {
  const w = win as Window & {
    __dsfrDataTrace?: Array<{ name: string; detail: unknown; t: number }>;
  };
  if (!w.__dsfrDataTrace) w.__dsfrDataTrace = [];
  w.__dsfrDataTrace.push({ name, detail, t: 1000 + w.__dsfrDataTrace.length });
}

describe('le tampon précoce rattrape ce qui a émis avant le branchement', () => {
  let attachment: FrameAttachment | undefined;
  let frame: HTMLIFrameElement | undefined;

  afterEach(() => {
    attachment?.detach();
    attachment = undefined;
    frame?.remove();
    frame = undefined;
  });

  it('rejoue un pipeline entier émis AVANT que le collecteur n’existe', () => {
    const made = makeFrame();
    frame = made.frame;
    made.doc.body.innerHTML = `
      <dsfr-data-source id="src"></dsfr-data-source>
      <dsfr-data-chart id="c1" source="src"></dsfr-data-chart>
    `;
    // Tout se passe avant l'attachement — le cas reel.
    buffer(made.win, 'dsfr-data-loading', { sourceId: 'src' });
    buffer(made.win, 'dsfr-data-loaded', {
      sourceId: 'src',
      data: [
        { dept: 'A', montant: 1 },
        { dept: 'B', montant: 2 },
      ],
    });

    attachment = attachRecorderToFrame(frame);
    const trace = attachment.snapshot()!;

    expect(attachment.sawEarlyBuffer()).toBe(true);
    expect(trace.states.src.status).toBe('loaded');
    expect(trace.states.src.rows).toBe(2);
    expect(trace.events.map((e) => e.kind)).toEqual(['loading', 'loaded']);
  });

  it('rattrape aussi un ÉCHEC survenu avant le branchement', () => {
    // Le cas qui rendait la fonctionnalite phare de l'epic inatteignable :
    // un 404 emis pendant le parsing n'apparaissait nulle part.
    const made = makeFrame();
    frame = made.frame;
    made.doc.body.innerHTML = `<dsfr-data-source id="src"></dsfr-data-source>`;
    buffer(made.win, 'dsfr-data-error', {
      sourceId: 'src',
      error: { message: 'HTTP 404: Not Found' },
      attemptedUrl: 'https://api.fr/ce-dataset-nexiste-pas',
    });

    attachment = attachRecorderToFrame(frame);
    const text = formatTrace(attachment.snapshot()!);

    expect(text).toContain('HTTP 404: Not Found');
    expect(text).toContain('https://api.fr/ce-dataset-nexiste-pas');
  });

  it('préserve l’ordre des événements rejoués', () => {
    const made = makeFrame();
    frame = made.frame;
    buffer(made.win, 'dsfr-data-loading', { sourceId: 'src' });
    buffer(made.win, 'dsfr-data-loaded', { sourceId: 'src', data: [{ a: 1 }] });
    buffer(made.win, 'dsfr-data-source-command', {
      sourceId: 'src',
      page: 2,
      origin: 'l1',
    });

    attachment = attachRecorderToFrame(frame);
    const kinds = attachment.snapshot()!.events.map((e) => e.kind);

    expect(kinds).toEqual(['loading', 'loaded', 'command']);
  });

  it('enchaîne sur le direct après avoir vidé le tampon', () => {
    const made = makeFrame();
    frame = made.frame;
    buffer(made.win, 'dsfr-data-loaded', { sourceId: 'src', data: [{ a: 1 }] });

    attachment = attachRecorderToFrame(frame);
    made.doc.dispatchEvent(
      new CustomEvent('dsfr-data-loaded', {
        detail: { sourceId: 'src', data: [{ a: 1 }, { a: 2 }, { a: 3 }] },
      })
    );

    expect(attachment.snapshot()!.states.src.rows).toBe(3);
    expect(attachment.snapshot()!.states.src.emissions).toBe(2);
  });

  it('ne rejoue pas deux fois le même tampon', () => {
    // Le tampon est VIDE, pas copie : au rechargement suivant, le collecteur
    // ne doit pas ressortir les evenements du rendu precedent.
    const made = makeFrame();
    frame = made.frame;
    buffer(made.win, 'dsfr-data-loaded', { sourceId: 'src', data: [{ a: 1 }] });

    attachment = attachRecorderToFrame(frame);
    const first = attachment.snapshot()!.events.length;
    frame.dispatchEvent(new Event('load'));

    expect(first).toBe(1);
    expect(attachment.snapshot()!.events).toHaveLength(0);
  });
});

describe('filet de sécurité : reconstitution depuis le cache', () => {
  let attachment: FrameAttachment | undefined;
  let frame: HTMLIFrameElement | undefined;

  afterEach(() => {
    attachment?.detach();
    attachment = undefined;
    frame?.remove();
    frame = undefined;
  });

  it('reconstitue l’état d’une page SANS tampon', () => {
    // Code d'un tiers, ou apercu genere sans `debug: true` : on n'a pas la
    // chronologie, mais le cache global tient la sortie de chaque etape.
    const made = makeFrame();
    frame = made.frame;
    made.doc.body.innerHTML = `<dsfr-data-source id="src"></dsfr-data-source>`;
    (made.win as Window & { __dsfrDataCache?: Map<string, unknown> }).__dsfrDataCache = new Map([
      ['src', [{ a: 1 }, { a: 2 }]],
    ]);

    attachment = attachRecorderToFrame(frame);

    expect(attachment.sawEarlyBuffer()).toBe(false);
    expect(attachment.snapshot()!.states.src.rows).toBe(2);
  });

  it('le cache n’écrase jamais une observation directe', () => {
    // L'ordre est tampon PUIS cache : un instantane muet ne doit pas
    // remplacer une chronologie exacte.
    const made = makeFrame();
    frame = made.frame;
    buffer(made.win, 'dsfr-data-loaded', { sourceId: 'src', data: [{ a: 1 }, { a: 2 }, { a: 3 }] });
    (made.win as Window & { __dsfrDataCache?: Map<string, unknown> }).__dsfrDataCache = new Map([
      ['src', [{ a: 1 }]],
    ]);

    attachment = attachRecorderToFrame(frame);

    expect(attachment.snapshot()!.states.src.rows).toBe(3);
  });
});

describe('cycle de vie du rattachement', () => {
  let attachment: FrameAttachment | undefined;
  let frame: HTMLIFrameElement | undefined;

  afterEach(() => {
    attachment?.detach();
    attachment = undefined;
    frame?.remove();
    frame = undefined;
  });

  it('se rebranche à chaque rechargement — sinon le volet devient sourd', () => {
    const made = makeFrame();
    frame = made.frame;
    attachment = attachRecorderToFrame(frame);
    const first = attachment.current();

    frame.dispatchEvent(new Event('load'));

    expect(attachment.current()).not.toBe(first);
    expect(first!.isRunning).toBe(false);
    expect(attachment.current()!.isRunning).toBe(true);
  });

  it('signale la remise à zéro au rechargement', () => {
    const made = makeFrame();
    frame = made.frame;
    let resets = 0;
    attachment = attachRecorderToFrame(frame, { onReset: () => (resets += 1) });

    frame.dispatchEvent(new Event('load'));

    // Garder l'ancienne trace afficherait des chiffres qui ne correspondent
    // plus a ce qui est rendu.
    expect(resets).toBe(2);
  });

  it('detach() arrête tout, y compris les rechargements suivants', () => {
    const made = makeFrame();
    frame = made.frame;
    attachment = attachRecorderToFrame(frame);
    const recorder = attachment.current();

    attachment.detach();
    frame.dispatchEvent(new Event('load'));

    expect(recorder!.isRunning).toBe(false);
    expect(attachment.current()).toBeNull();
    expect(attachment.snapshot()).toBeNull();
  });

  it('survit à une iframe inaccessible (sandbox sans allow-same-origin)', () => {
    // `contentDocument` vaut null : le volet doit rester muet, pas planter.
    const inaccessible = {
      contentDocument: null,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLIFrameElement;

    expect(() => {
      const a = attachRecorderToFrame(inaccessible);
      expect(a.snapshot()).toBeNull();
      expect(a.current()).toBeNull();
      a.detach();
    }).not.toThrow();
  });

  it('waitForQuiescence rend false sans document observable', async () => {
    const inaccessible = {
      contentDocument: null,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLIFrameElement;

    const a = attachRecorderToFrame(inaccessible);
    expect(await a.waitForQuiescence()).toBe(false);
    a.detach();
  });

  it('deux rattachements sur la même iframe restent indépendants', () => {
    const made = makeFrame();
    frame = made.frame;
    const a = attachRecorderToFrame(frame);
    const b = attachRecorderToFrame(frame);

    made.doc.dispatchEvent(
      new CustomEvent('dsfr-data-loaded', { detail: { sourceId: 'src', data: [{ a: 1 }] } })
    );

    expect(a.snapshot()!.states.src.rows).toBe(1);
    expect(b.snapshot()!.states.src.rows).toBe(1);

    a.detach();
    // Detacher l'un ne doit pas rendre l'autre sourd.
    made.doc.dispatchEvent(
      new CustomEvent('dsfr-data-loaded', {
        detail: { sourceId: 'src', data: [{ a: 1 }, { a: 2 }] },
      })
    );
    expect(b.snapshot()!.states.src.rows).toBe(2);
    b.detach();
  });
});

describe('earlyBufferScript — le script injecté', () => {
  it('s’abonne aux quatre événements du bus', () => {
    const script = earlyBufferScript();

    for (const name of [
      'dsfr-data-loaded',
      'dsfr-data-error',
      'dsfr-data-loading',
      'dsfr-data-source-command',
    ]) {
      expect(script).toContain(name);
    }
  });

  it('est borné — une page en boucle ne doit pas manger la mémoire', () => {
    expect(earlyBufferScript()).toContain('500');
  });

  it('ne jette jamais : il s’exécute avant tout dans la page observée', () => {
    expect(earlyBufferScript()).toContain('try');
    expect(earlyBufferScript()).toContain('catch');
  });

  it('getPreviewHTML l’injecte AVANT toute feuille ou tout module', () => {
    // S'il arrivait apres le module de la bibliotheque, il raterait les
    // premiers connectedCallback — c'est-a-dire l'essentiel.
    const html = getPreviewHTML('<dsfr-data-source id="s"></dsfr-data-source>', { debug: true });

    expect(html).toContain('__dsfrDataTrace');
    expect(html.indexOf('__dsfrDataTrace')).toBeLessThan(html.indexOf('dsfr-data.esm.js'));
    expect(html.indexOf('__dsfrDataTrace')).toBeLessThan(html.indexOf('<link rel="stylesheet"'));
  });

  it('n’injecte rien sans debug — l’aperçu normal reste inchangé', () => {
    expect(getPreviewHTML('<p>x</p>')).not.toContain('__dsfrDataTrace');
  });
});

describe('drainEarlyBuffer / readCacheSnapshot — robustesse', () => {
  it('tolèrent une fenêtre sans tampon ni cache', () => {
    expect(drainEarlyBuffer(undefined)).toEqual([]);
    expect(drainEarlyBuffer({} as Window)).toEqual([]);
    expect(readCacheSnapshot(undefined)).toEqual([]);
    expect(readCacheSnapshot({} as Window)).toEqual([]);
  });

  it('drainEarlyBuffer vide réellement le tampon', () => {
    const win = { __dsfrDataTrace: [{ name: 'x', detail: null, t: 0 }] } as unknown as Window;

    expect(drainEarlyBuffer(win)).toHaveLength(1);
    expect(drainEarlyBuffer(win)).toHaveLength(0);
  });
});
