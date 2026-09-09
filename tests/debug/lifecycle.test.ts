import { describe, it, expect, afterEach, vi } from 'vitest';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DataflowRecorder, formatTrace, summarizeTrace, snapshotGraph } from '@dsfr-data/shared';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  dispatchSourceCommand,
  subscribeToSourceCommands,
  clearDataCache,
  clearDataMeta,
  setDataMeta,
} from '@/utils/data-bridge.js';
import { TransformerMixin } from '@/utils/transformer-mixin.js';
import { LitElement } from 'lit';

/**
 * Cycle de vie du collecteur, invalidation sur erreur, et relais d'`origin`.
 *
 * Ces cas etaient tous corrects mais non verrouilles : rien n'empechait une
 * regression de les casser en silence. Le plus important est l'invalidation
 * sur erreur — sans elle, le module produit une trace CONFIANTE ET FAUSSE sur
 * la panne meme qu'il est cense diagnostiquer.
 */

function mount(html: string): () => void {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return () => host.remove();
}

function purge(...ids: string[]) {
  for (const id of ids) {
    clearDataCache(id);
    clearDataMeta(id);
  }
}

describe('DataflowRecorder — cycle de vie', () => {
  let recorder: DataflowRecorder | undefined;
  let unmount: (() => void) | undefined;

  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    unmount?.();
    unmount = undefined;
    purge('src', 'q1', 'a', 'b', 'j1');
  });

  it('snapshot() avant start() rend une trace vide plutôt que de jeter', () => {
    recorder = new DataflowRecorder({ root: document.body });

    const trace = recorder.snapshot();

    expect(trace.events).toEqual([]);
    expect(trace.quiescent).toBe(true);
    expect(trace.sinceLastEventMs).toBeNull();
  });

  it('start() deux fois ne double pas les écouteurs', () => {
    // La doc annonce « Idempotent. » — un double abonnement produirait deux
    // evenements par emission et fausserait le compteur d'emissions, donc
    // l'alerte « rechargements en boucle ».
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    recorder.start();

    dispatchDataLoaded('src', [{ a: 1 }]);

    expect(recorder.snapshot().events).toHaveLength(1);
    expect(recorder.snapshot().states.src.emissions).toBe(1);
  });

  it('stop() puis start() réobserve', () => {
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    recorder.stop();
    dispatchDataLoaded('src', [{ a: 1 }]);
    recorder.start();
    dispatchDataLoaded('src', [{ a: 1 }, { a: 2 }]);

    expect(recorder.snapshot().events).toHaveLength(1);
    expect(recorder.snapshot().states.src.rows).toBe(2);
  });

  it('clear() vide journal et états sans détacher les écouteurs', () => {
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    dispatchDataLoaded('src', [{ a: 1 }]);

    recorder.clear();
    expect(recorder.snapshot().events).toEqual([]);
    expect(recorder.snapshot().states).toEqual({});

    dispatchDataLoaded('src', [{ a: 1 }, { a: 2 }]);
    expect(recorder.snapshot().states.src.rows).toBe(2);
    // Le compteur repart de zero : clear() est une remise a plat complete.
    expect(recorder.snapshot().states.src.emissions).toBe(1);
  });

  it('clear() notifie les abonnés — le volet doit se vider', () => {
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    const seen = vi.fn();
    recorder.onChange(seen);

    recorder.clear();

    expect(seen).toHaveBeenCalled();
  });

  it('l’ordre topologique est porté explicitement, ids numériques inclus', () => {
    // `states` est un objet nu : JavaScript y range les cles entieres AVANT
    // les autres. Sans `order`, un id="2" en amont d'un id="1" serait lu a
    // l'envers.
    unmount = mount(`
      <dsfr-data-query id="1" source="2"></dsfr-data-query>
      <dsfr-data-source id="2"></dsfr-data-source>
    `);
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();

    const trace = recorder.snapshot();

    expect(trace.order).toEqual(['2', '1']);
    expect(Object.keys(trace.states)).toEqual(['1', '2']);
  });

  it('observe le document d’une autre fenêtre (cas iframe)', () => {
    // Chemin cross-realm dont depend le rattachement a l'apercu : le
    // collecteur doit ecouter le document de l'iframe, pas celui de l'hote.
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.body.innerHTML = `<dsfr-data-source id="src"></dsfr-data-source>`;

    recorder = new DataflowRecorder({ doc, root: doc.body });
    recorder.start();

    // Un evenement du document HOTE ne doit pas etre capte.
    dispatchDataLoaded('src', [{ a: 1 }]);
    expect(recorder.snapshot().events).toHaveLength(0);

    // Un evenement du document de l'iframe, si.
    doc.dispatchEvent(
      new CustomEvent('dsfr-data-loaded', {
        detail: { sourceId: 'src', data: [{ a: 1 }, { a: 2 }] },
      })
    );
    expect(recorder.snapshot().states.src.rows).toBe(2);

    frame.remove();
  });
});

describe('une étape en échec n’alimente plus l’aval', () => {
  let recorder: DataflowRecorder | undefined;
  let unmount: (() => void) | undefined;

  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    unmount?.();
    unmount = undefined;
    purge('src', 'c1');
  });

  function failAfterSuccess() {
    unmount = mount(`
      <dsfr-data-source id="src"></dsfr-data-source>
      <dsfr-data-chart id="c1" source="src"></dsfr-data-chart>
    `);
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    setDataMeta('src', { page: 1, pageSize: 10, total: 3 });
    dispatchDataLoaded('src', [{ a: 1 }, { a: 2 }, { a: 3 }]);
    dispatchDataError('src', new Error('HTTP 500: Server Error'), 'https://api.fr/x');
    return recorder.snapshot();
  }

  it('les données du dernier succès sont invalidées', () => {
    const trace = failAfterSuccess();

    expect(trace.states.src.status).toBe('error');
    expect(trace.states.src.rows).toBeUndefined();
    expect(trace.states.src.fields).toBeUndefined();
    expect(trace.states.src.meta).toBeUndefined();
  });

  it('l’aval ne se déclare pas alimenté sous une source tombée', () => {
    // Le faux calme applique a l'erreur : « ✗ ÉCHEC » suivi trois lignes plus
    // bas de « ✓ alimenté » est exactement ce que ce module doit empecher.
    const text = formatTrace(failAfterSuccess());

    expect(text).toContain('✗ ÉCHEC — HTTP 500: Server Error');
    expect(text).toContain('en échec : plus rien ne descend');
    expect(text).not.toContain('✓ alimenté');
    expect(text).not.toContain('reçoit 3 lignes');
  });

  it('le résumé du rail ne montre pas les lignes d’une source tombée', () => {
    const summary = summarizeTrace(failAfterSuccess());

    expect(summary.firstRows).toBeNull();
    expect(summary.alerts).toBeGreaterThan(0);
  });
});

describe('graphe — id fabriqué vs id dupliqué', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => unmount?.());

  it('distingue l’afficheur sans id du doublon qui, lui, émet', () => {
    // Les confondre ferait conclure a tort « ce noeud ne parle pas » a un
    // consommateur qui lit `synthetic` pour decider s'il attend des evenements.
    unmount = mount(`
      <dsfr-data-chart source="src"></dsfr-data-chart>
      <dsfr-data-query id="dup" source="src"></dsfr-data-query>
      <dsfr-data-query id="dup" source="src"></dsfr-data-query>
    `);

    const nodes = snapshotGraph(document.body).nodes;

    const sansId = nodes.find((n) => n.tag === 'dsfr-data-chart')!;
    expect(sansId.synthetic).toBe(true);
    expect(sansId.ambiguous).toBe(false);

    const doublon = nodes.filter((n) => n.tag === 'dsfr-data-query');
    expect(doublon[0].ambiguous).toBe(false);
    expect(doublon[1].ambiguous).toBe(true);
    expect(doublon[1].synthetic).toBe(false);
  });
});

describe('formatTrace sur un join — deux amonts', () => {
  let recorder: DataflowRecorder | undefined;
  let unmount: (() => void) | undefined;

  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    unmount?.();
    unmount = undefined;
    purge('a', 'b', 'j1');
  });

  it('nomme chaque amont, ses lignes et le delta de champs par côté', () => {
    unmount = mount(`
      <dsfr-data-source id="a"></dsfr-data-source>
      <dsfr-data-source id="b"></dsfr-data-source>
      <dsfr-data-join id="j1" left="a" right="b" on="code"></dsfr-data-join>
    `);
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    dispatchDataLoaded('a', [{ code: '75', pop: 2 }]);
    dispatchDataLoaded('b', [{ code: '75', budget: 9 }]);
    dispatchDataLoaded('j1', [{ code: '75', pop: 2, budget: 9 }]);

    const text = formatTrace(recorder.snapshot());

    expect(text).toContain('reçoit 1 ligne ← a');
    expect(text).toContain('reçoit 1 ligne ← b');
    expect(text).toContain('depuis a');
    expect(text).toContain('depuis b');
  });
});

describe('relais d’origin par TransformerMixin (#603)', () => {
  afterEach(() => purge('relay-target'));

  it('un transformateur qui relaie une commande se nomme', async () => {
    class RelayProbe extends TransformerMixin(LitElement) {
      source = 'relay-target';
      protected createRenderRoot() {
        return this;
      }
    }
    customElements.define('relay-probe-transformer', RelayProbe);

    const probe = document.createElement('relay-probe-transformer') as RelayProbe & HTMLElement;
    probe.id = 'relay-probe';
    (probe as unknown as { source: string }).source = 'relay-target';
    document.body.appendChild(probe);

    const seen: Array<{ sourceId: string; origin?: string }> = [];
    const off = subscribeToSourceCommands('relay-target', () => {});
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ sourceId: string; origin?: string }>).detail;
      if (detail.sourceId === 'relay-target') seen.push(detail);
    };
    document.addEventListener('dsfr-data-source-command', handler);

    // Une commande adressee au transformateur doit repartir vers son amont,
    // signee de l'id du RELAYEUR — pas de l'emetteur d'origine.
    dispatchSourceCommand('relay-probe', { page: 3, origin: 'un-afficheur' });

    document.removeEventListener('dsfr-data-source-command', handler);
    off();
    probe.remove();

    expect(seen).toHaveLength(1);
    expect(seen[0].origin).toBe('relay-probe');
  });
});

describe('non-régression : origin ne perturbe pas dsfr-data-source (#603)', () => {
  afterEach(() => purge('dedup-src'));

  /** Vue interne de la source, plutôt que des casts dispersés (CLAUDE.md). */
  interface SourceInternals {
    _setupCommandListener(): void;
    _scheduleFetch(): void;
    _unsubscribeCommands: (() => void) | null;
  }

  it('la déduplication des commandes reste champ par champ', () => {
    // Le seul endroit ou un champ « purement additif » aurait pu casser
    // quelque chose : si la source dedupliquait par JSON ou par nombre de
    // cles, `origin` declencherait un refetch parasite a chaque commande.
    const source = new DsfrDataSource();
    source.id = 'dedup-src';
    source.serverSide = true;
    const internals = source as unknown as SourceInternals;
    const refetch = vi.spyOn(internals, '_scheduleFetch').mockImplementation(() => {});
    internals._setupCommandListener();

    dispatchSourceCommand('dedup-src', { page: 2 });
    const afterFirst = refetch.mock.calls.length;
    dispatchSourceCommand('dedup-src', { page: 2, origin: 'un-autre-composant' });

    expect(afterFirst).toBe(1);
    expect(refetch.mock.calls.length).toBe(afterFirst);

    internals._unsubscribeCommands?.();
    refetch.mockRestore();
  });

  it('une page réellement différente refetche bien', () => {
    // Garde-fou du garde-fou : si la dedup etait trop large, le test
    // precedent passerait pour de mauvaises raisons.
    const source = new DsfrDataSource();
    source.id = 'dedup-src';
    source.serverSide = true;
    const internals = source as unknown as SourceInternals;
    const refetch = vi.spyOn(internals, '_scheduleFetch').mockImplementation(() => {});
    internals._setupCommandListener();

    dispatchSourceCommand('dedup-src', { page: 2 });
    dispatchSourceCommand('dedup-src', { page: 3, origin: 'un-autre-composant' });

    expect(refetch.mock.calls.length).toBe(2);

    internals._unsubscribeCommands?.();
    refetch.mockRestore();
  });
});

describe('loading n’efface pas les données déjà connues', () => {
  let recorder: DataflowRecorder | undefined;
  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    purge('src');
  });

  it('un rechargement en cours garde le compte précédent, marqué « en cours »', () => {
    // Contraste avec l'erreur : un chargement n'invalide rien, il annonce
    // juste que ca bouge. Effacer ferait clignoter le volet a chaque refresh.
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    dispatchDataLoaded('src', [{ a: 1 }, { a: 2 }]);
    dispatchDataLoading('src');

    const state = recorder.snapshot().states.src;

    expect(state.status).toBe('loading');
    expect(state.rows).toBe(2);
  });
});
