import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DataflowRecorder,
  snapshotGraph,
  topoOrder,
  downstreamOf,
  summarizeStage,
  diffFields,
  fieldMatrix,
  extractRows,
} from '@dsfr-data/shared';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  dispatchSourceCommand,
  setDataMeta,
  clearDataMeta,
  clearDataCache,
} from '@/utils/data-bridge.js';

/**
 * Le collecteur (#604) : un seul ecouteur, tout le flux.
 *
 * Ces tests exercent le collecteur contre le VRAI data-bridge du coeur —
 * pas contre des evenements fabriques a la main. C'est le seul moyen de
 * verifier qu'il observe bien ce que les composants emettent reellement.
 */

/** Pose un pipeline dans le DOM et rend une fonction de nettoyage. */
function mountPipeline(html: string): () => void {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return () => host.remove();
}

describe('snapshotGraph — topologie depuis le DOM', () => {
  let unmount: () => void;
  afterEach(() => unmount?.());

  it('reconstruit une chaîne source → query → chart', () => {
    unmount = mountPipeline(`
      <dsfr-data-source id="src" api-type="tabular" base-url="https://x.fr"></dsfr-data-source>
      <dsfr-data-query id="q1" source="src" group-by="dept"></dsfr-data-query>
      <dsfr-data-chart id="c1" source="q1" type="bar"></dsfr-data-chart>
    `);

    const graph = snapshotGraph(document.body);

    expect(graph.nodes.map((n) => n.id)).toEqual(['src', 'q1', 'c1']);
    expect(graph.nodes.map((n) => n.role)).toEqual(['source', 'transform', 'display']);
    expect(graph.nodes[1].upstream).toEqual(['src']);
    expect(graph.nodes[2].upstream).toEqual(['q1']);
    expect(graph.dangling).toEqual([]);
  });

  it('retient les attributs de forme, pas tout le DOM', () => {
    unmount = mountPipeline(
      `<dsfr-data-query id="q1" source="src" group-by="dept" class="x" style="color:red"></dsfr-data-query>`
    );

    const [node] = snapshotGraph(document.body).nodes;

    expect(node.attrs).toEqual({ 'group-by': 'dept' });
    expect(node.attrs).not.toHaveProperty('class');
  });

  it('lit les deux amonts d’un join', () => {
    unmount = mountPipeline(
      `<dsfr-data-join id="j" left="a" right="b" on="code"></dsfr-data-join>`
    );

    const [node] = snapshotGraph(document.body).nodes;

    expect(node.upstream).toEqual(['a', 'b']);
  });

  it('donne une clé synthétique à un afficheur sans id', () => {
    // Un afficheur sans id n'emet rien sur le bus, mais c'est souvent LUI que
    // l'utilisateur regarde : il ne doit pas disparaitre du graphe.
    unmount = mountPipeline(`<dsfr-data-chart source="q1" type="bar"></dsfr-data-chart>`);

    const [node] = snapshotGraph(document.body).nodes;

    expect(node.synthetic).toBe(true);
    expect(node.id).toContain('chart');
    expect(node.upstream).toEqual(['q1']);
  });

  it('désambiguïse deux composants qui partagent un id', () => {
    unmount = mountPipeline(`
      <dsfr-data-query id="dup" source="src"></dsfr-data-query>
      <dsfr-data-query id="dup" source="src"></dsfr-data-query>
    `);

    const ids = snapshotGraph(document.body).nodes.map((n) => n.id);

    expect(new Set(ids).size).toBe(2);
  });

  it('signale un amont déclaré mais absent — la panne silencieuse', () => {
    unmount = mountPipeline(`<dsfr-data-chart id="c1" source="fantome"></dsfr-data-chart>`);

    expect(snapshotGraph(document.body).dangling).toEqual([{ node: 'c1', missing: 'fantome' }]);
  });

  it('remonte une erreur de configuration posée par reportConfigError', () => {
    unmount = mountPipeline(
      `<dsfr-data-query id="q1" source="src" data-dsfr-config-error="attribut &quot;id&quot; requis"></dsfr-data-query>`
    );

    expect(snapshotGraph(document.body).nodes[0].configError).toContain('requis');
  });

  it('ignore les balises qui ne portent pas de données', () => {
    unmount = mountPipeline(`
      <dsfr-data-source id="src"></dsfr-data-source>
      <dsfr-data-context id="ctx"></dsfr-data-context>
      <div id="pas-un-composant"></div>
    `);

    expect(snapshotGraph(document.body).nodes.map((n) => n.id)).toEqual(['src']);
  });
});

describe('topoOrder — lecture amont → aval', () => {
  let unmount: () => void;
  afterEach(() => unmount?.());

  it('ordonne même quand le DOM est écrit à l’envers', () => {
    unmount = mountPipeline(`
      <dsfr-data-chart id="c1" source="q1"></dsfr-data-chart>
      <dsfr-data-query id="q1" source="src"></dsfr-data-query>
      <dsfr-data-source id="src"></dsfr-data-source>
    `);

    const graph = snapshotGraph(document.body);

    expect(topoOrder(graph).map((n) => n.id)).toEqual(['src', 'q1', 'c1']);
  });

  it('n’omet aucun nœud sur un cycle — une page cassée reste affichable', () => {
    unmount = mountPipeline(`
      <dsfr-data-query id="a" source="b"></dsfr-data-query>
      <dsfr-data-query id="b" source="a"></dsfr-data-query>
    `);

    const graph = snapshotGraph(document.body);

    expect(topoOrder(graph)).toHaveLength(2);
  });

  it('downstreamOf trouve les consommateurs', () => {
    unmount = mountPipeline(`
      <dsfr-data-source id="src"></dsfr-data-source>
      <dsfr-data-chart id="c1" source="src"></dsfr-data-chart>
      <dsfr-data-list id="l1" source="src"></dsfr-data-list>
    `);

    const graph = snapshotGraph(document.body);

    expect(downstreamOf(graph, 'src').map((n) => n.id)).toEqual(['c1', 'l1']);
  });
});

describe('summarizeStage — le résumé borné', () => {
  it('compte, type et échantillonne', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ dept: `d${i}`, montant: i }));

    const summary = summarizeStage(rows, 3);

    expect(summary.rows).toBe(50);
    expect(summary.fields.map((f) => f.name)).toEqual(['dept', 'montant']);
    expect(summary.fields[1].type).toBe('numérique');
    expect(summary.sample).toHaveLength(3);
    expect(summary.shape).toBe('array');
  });

  it('ne garde JAMAIS le payload complet', () => {
    const rows = Array.from({ length: 50000 }, (_, i) => ({ i }));

    // Le garde-fou memoire du chantier : une source volumineuse qui repagine
    // ne doit faire exploser ni le volet ni le contexte de l'assistant.
    expect(summarizeStage(rows, 5).sample).toHaveLength(5);
  });

  it('déroule les enveloppes results et records', () => {
    expect(extractRows({ results: [{ a: 1 }] }).shape).toBe('wrapped');
    expect(extractRows({ records: [{ a: 1 }] }).shape).toBe('wrapped');
    expect(extractRows({ results: [{ a: 1 }] }).rows).toHaveLength(1);
  });

  it('signale un objet non déroulable plutôt que de le taire', () => {
    // Savoir qu'on a recu un objet non deroulable EST l'information utile :
    // c'est presque toujours un attribut `transform` manquant.
    const summary = summarizeStage({ meta: { total: 3 } });

    expect(summary.shape).toBe('object');
    expect(summary.rows).toBe(0);
  });
});

describe('diffFields et fieldMatrix — ce que l’étape a fait aux champs', () => {
  const before = [
    { name: 'dept', type: 'texte', sample: 'a' },
    { name: 'montant', type: 'numérique', sample: 1 },
  ];
  const after = [
    { name: 'dept', type: 'texte', sample: 'a' },
    { name: 'montant__sum', type: 'numérique', sample: 10 },
  ];

  it('nomme les champs apparus et disparus', () => {
    const diff = diffFields(before, after);

    expect(diff.removed).toEqual(['montant']);
    expect(diff.added).toEqual(['montant__sum']);
    expect(diff.kept).toEqual(['dept']);
  });

  it('la matrice rend visible un champ absent dès la source', () => {
    // Le mode de panne le plus couteux (proto-annuaire-cyber) : une colonne
    // renommee en amont, aucune erreur levee, une dataviz vide.
    const matrix = fieldMatrix([
      { id: 'src', fields: before },
      { id: 'q1', fields: after },
    ]);

    expect(matrix.map((m) => m.field)).toEqual(['dept', 'montant', 'montant__sum']);
    expect(matrix.find((m) => m.field === 'montant')?.byStage).toEqual(['numérique', null]);
    expect(matrix.find((m) => m.field === 'montant__sum')?.byStage).toEqual([null, 'numérique']);
  });
});

describe('DataflowRecorder — observation du vrai bus', () => {
  let recorder: DataflowRecorder;
  let unmount: (() => void) | undefined;
  let clock = 0;

  beforeEach(() => {
    clock = 1000;
    clearDataCache('src');
    clearDataCache('q1');
    clearDataMeta('src');
    recorder = new DataflowRecorder({ root: document.body, now: () => clock });
    recorder.start();
  });

  afterEach(() => {
    recorder.stop();
    unmount?.();
    unmount = undefined;
  });

  it('capture une émission réelle du data-bridge', () => {
    dispatchDataLoaded('src', [{ dept: 'A', montant: 1 }]);

    const trace = recorder.snapshot();

    expect(trace.states.src.status).toBe('loaded');
    expect(trace.states.src.rows).toBe(1);
    expect(trace.states.src.fields?.map((f) => f.name)).toEqual(['dept', 'montant']);
  });

  it('capture une erreur avec son URL effective (#603)', () => {
    dispatchDataError('src', new Error('HTTP 400: Bad Request'), 'https://api.fr/data?x=1');

    const trace = recorder.snapshot();

    expect(trace.states.src.status).toBe('error');
    expect(trace.states.src.message).toBe('HTTP 400: Bad Request');
    expect(trace.states.src.attemptedUrl).toBe('https://api.fr/data?x=1');
  });

  it('capture les commandes remontantes avec leur origine (#603)', () => {
    dispatchSourceCommand('src', { groupBy: 'dept', origin: 'q1' });

    const [event] = recorder.snapshot().events;

    expect(event.kind).toBe('command');
    if (event.kind === 'command') {
      expect(event.node).toBe('src');
      expect(event.from).toBe('q1');
      expect(event.cmd).toEqual({ groupBy: 'dept' });
    }
  });

  it('relève la meta de pagination posée avant l’émission', () => {
    setDataMeta('src', { page: 1, pageSize: 0, total: 100, needsClientProcessing: true });
    dispatchDataLoaded('src', [{ a: 1 }]);

    expect(recorder.snapshot().states.src.meta?.needsClientProcessing).toBe(true);
  });

  it('compte les émissions — révèle les rechargements en boucle', () => {
    for (let i = 0; i < 5; i++) dispatchDataLoaded('src', [{ a: i }]);

    expect(recorder.snapshot().states.src.emissions).toBe(5);
  });

  it('garde sa propre copie : la trace survit au vidage du cache global', () => {
    // TransformerMixin.disconnectedCallback appelle clearDataCache(this.id) :
    // une etape retiree du DOM perd son entree de cache. La trace, elle, doit
    // rester — c'est souvent celle-la qu'on cherche.
    dispatchDataLoaded('q1', [{ a: 1 }, { a: 2 }]);
    clearDataCache('q1');

    expect(recorder.snapshot().states.q1.rows).toBe(2);
  });

  it('borne le journal', () => {
    const bounded = new DataflowRecorder({ root: document.body, maxEvents: 10, now: () => clock });
    bounded.start();
    for (let i = 0; i < 40; i++) dispatchDataLoaded('src', [{ i }]);
    const events = bounded.snapshot().events;
    bounded.stop();

    expect(events).toHaveLength(10);
    // On garde la FIN, pas le debut : c'est l'etat recent qui diagnostique.
    expect(events[events.length - 1].seq).toBe(40);
  });

  it('stop() détache réellement les écouteurs', () => {
    recorder.stop();
    dispatchDataLoaded('src', [{ a: 1 }]);

    expect(recorder.snapshot().events).toHaveLength(0);
  });

  it('notifie les abonnés — rendu vivant', () => {
    let calls = 0;
    const off = recorder.onChange(() => (calls += 1));

    dispatchDataLoaded('src', [{ a: 1 }]);
    off();
    dispatchDataLoaded('src', [{ a: 2 }]);

    expect(calls).toBe(1);
  });

  it('rend les étapes en ordre topologique', () => {
    unmount = mountPipeline(`
      <dsfr-data-chart id="c1" source="q1"></dsfr-data-chart>
      <dsfr-data-query id="q1" source="src"></dsfr-data-query>
      <dsfr-data-source id="src"></dsfr-data-source>
    `);

    expect(Object.keys(recorder.snapshot().states)).toEqual(['src', 'q1', 'c1']);
  });

  describe('quiescence', () => {
    it('est vraie tant que rien ne s’est produit', () => {
      expect(recorder.isQuiescent()).toBe(true);
    });

    it('est fausse juste après un événement', () => {
      dispatchDataLoaded('src', [{ a: 1 }]);

      expect(recorder.isQuiescent()).toBe(false);
    });

    it('redevient vraie après le délai de silence', () => {
      dispatchDataLoaded('src', [{ a: 1 }]);
      clock += 400;

      expect(recorder.isQuiescent()).toBe(true);
    });

    it('reste fausse tant qu’une étape charge, même après le délai', () => {
      // Le piege : le silence ne suffit pas. Une source lente n'emet rien
      // pendant son fetch — la declarer calme afficherait un etat final faux.
      dispatchDataLoading('src');
      clock += 5000;

      expect(recorder.isQuiescent()).toBe(false);
    });

    it('waitForQuiescence rend false au plafond plutôt qu’un faux calme', async () => {
      const impatient = new DataflowRecorder({
        root: document.body,
        quiescenceMs: 50,
        maxWaitMs: 120,
      });
      impatient.start();
      dispatchDataLoading('src');

      const settled = await impatient.waitForQuiescence();
      impatient.stop();

      expect(settled).toBe(false);
    });

    it('waitForQuiescence rend true quand tout se calme', async () => {
      const patient = new DataflowRecorder({
        root: document.body,
        quiescenceMs: 40,
        maxWaitMs: 2000,
      });
      patient.start();
      dispatchDataLoaded('src', [{ a: 1 }]);

      expect(await patient.waitForQuiescence()).toBe(true);
      patient.stop();
    });
  });
});
