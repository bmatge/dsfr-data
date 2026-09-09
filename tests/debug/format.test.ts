import { describe, it, expect, afterEach } from 'vitest';
import { DataflowRecorder, formatTrace, summarizeTrace } from '@dsfr-data/shared';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchSourceCommand,
  setDataMeta,
  clearDataCache,
  clearDataMeta,
} from '@/utils/data-bridge.js';

/**
 * `formatTrace()` — la fonction pivot (#604).
 *
 * Le meme texte est consomme par « Copier le diagnostic », par « Envoyer a
 * l'assistant » et par l'outil `trace_pipeline`. Ce qu'on verifie ici, c'est
 * donc autant le contrat de l'interface que celui du modele.
 *
 * Le test central est `reproduit le cas #596` : si ce bloc ne rend pas la
 * panne evidente, tout le chantier rate sa cible.
 */

function mount(html: string): () => void {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return () => host.remove();
}

function freshRecorder(clock: () => number = () => Date.now()) {
  const recorder = new DataflowRecorder({ root: document.body, now: clock });
  recorder.start();
  return recorder;
}

describe('formatTrace', () => {
  let unmount: (() => void) | undefined;
  let recorder: DataflowRecorder | undefined;

  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    unmount?.();
    unmount = undefined;
    for (const id of ['src', 'q1', 'c1', 'n1']) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  it('le dit franchement quand il n’y a rien à diagnostiquer', () => {
    recorder = freshRecorder();

    expect(formatTrace(recorder.snapshot())).toContain('Aucun composant dsfr-data');
  });

  it('rend une chaîne saine en ordre amont → aval', () => {
    unmount = mount(`
      <dsfr-data-source id="src" api-type="tabular"></dsfr-data-source>
      <dsfr-data-query id="q1" source="src" group-by="dept"></dsfr-data-query>
      <dsfr-data-chart id="c1" source="q1" type="bar"></dsfr-data-chart>
    `);
    recorder = freshRecorder();
    dispatchDataLoaded('src', [
      { dept: 'A', montant: 10 },
      { dept: 'A', montant: 5 },
    ]);
    dispatchDataLoaded('q1', [{ dept: 'A', montant__sum: 15 }]);

    const text = formatTrace(recorder.snapshot());

    expect(text.indexOf('src')).toBeLessThan(text.indexOf('q1'));
    expect(text).toContain('→ 2 lignes');
    expect(text).toContain('reçoit 2 lignes ← src');
    expect(text).toContain('→ 1 ligne,');
  });

  it('nomme les champs apparus et disparus sur l’arête', () => {
    unmount = mount(`
      <dsfr-data-source id="src"></dsfr-data-source>
      <dsfr-data-query id="q1" source="src"></dsfr-data-query>
    `);
    recorder = freshRecorder();
    dispatchDataLoaded('src', [{ dept: 'A', montant: 10 }]);
    dispatchDataLoaded('q1', [{ dept: 'A', montant__sum: 10 }]);

    const text = formatTrace(recorder.snapshot());

    expect(text).toContain('montant__sum');
    expect(text).toMatch(/champs\s*:.*montant/);
  });

  it('reproduit le cas #596 — la délégation retombée côté client se voit', () => {
    // Le cas d'ecole du chantier : un group-by delegue au serveur, refuse par
    // l'API, retombe cote client sur les seules lignes rapatriees. Les totaux
    // sont faux et rien ne le dit.
    unmount = mount(`
      <dsfr-data-source id="src" api-type="tabular"></dsfr-data-source>
      <dsfr-data-query id="q1" source="src" group-by="dept" aggregate="sum:montant"></dsfr-data-query>
    `);
    recorder = freshRecorder();

    setDataMeta('src', {
      page: 1,
      pageSize: 0,
      total: 500000,
      serverSide: false,
      needsClientProcessing: true,
    });
    dispatchDataLoaded(
      'src',
      Array.from({ length: 100 }, (_, i) => ({ dept: 'A', montant: i }))
    );
    dispatchDataLoaded('q1', [{ dept: 'A', montant__sum: 4950 }]);
    dispatchSourceCommand('src', { groupBy: 'dept', aggregate: 'sum:montant', origin: 'q1' });

    const text = formatTrace(recorder.snapshot());

    expect(text).toContain("la source n'a pas pu traiter group-by/aggregate côté serveur");
    expect(text).toContain('Repli client');
    expect(text).toContain('Commandes remontées');
    expect(text).toContain('q1 → src');
    expect(text).toContain('"groupBy":"dept"');
  });

  it('rend l’échec HTTP avec l’URL réellement appelée (#603)', () => {
    unmount = mount(`<dsfr-data-source id="src" api-type="tabular"></dsfr-data-source>`);
    recorder = freshRecorder();

    dispatchDataError(
      'src',
      new Error('HTTP 400: Bad Request'),
      'https://tabular-api.data.gouv.fr/api/resources/xxx/data/?dept__groupby=yes'
    );

    const text = formatTrace(recorder.snapshot());

    expect(text).toContain('✗ ÉCHEC — HTTP 400: Bad Request');
    expect(text).toContain('URL appelée : https://tabular-api.data.gouv.fr');
    expect(text).toContain('dept__groupby');
  });

  it('alerte sur zéro ligne — la panne la plus silencieuse', () => {
    unmount = mount(`
      <dsfr-data-source id="src"></dsfr-data-source>
      <dsfr-data-chart id="c1" source="src"></dsfr-data-chart>
    `);
    recorder = freshRecorder();
    dispatchDataLoaded('src', []);

    const text = formatTrace(recorder.snapshot());

    expect(text).toContain('zéro ligne');
    expect(text).toContain("l'aval ne rendra rien");
  });

  it('alerte sur une charge non déroulable', () => {
    unmount = mount(`<dsfr-data-source id="src"></dsfr-data-source>`);
    recorder = freshRecorder();
    dispatchDataLoaded('src', { total: 3, payload: { nested: true } });

    expect(formatTrace(recorder.snapshot())).toContain('objet non déroulable');
  });

  it('signale un amont introuvable', () => {
    unmount = mount(`<dsfr-data-chart id="c1" source="fantome"></dsfr-data-chart>`);
    recorder = freshRecorder();

    const text = formatTrace(recorder.snapshot());

    expect(text).toContain('Amonts introuvables');
    expect(text).toContain('c1 déclare source="fantome"');
  });

  it('signale une erreur de configuration', () => {
    unmount = mount(
      `<dsfr-data-query id="q1" source="src" data-dsfr-config-error="attribut &quot;source&quot; requis"></dsfr-data-query>`
    );
    recorder = freshRecorder();

    expect(formatTrace(recorder.snapshot())).toContain('✗ CONFIGURATION');
  });

  it('prévient quand l’instantané est pris en plein vol', () => {
    unmount = mount(`<dsfr-data-source id="src"></dsfr-data-source>`);
    recorder = freshRecorder();
    dispatchDataLoaded('src', [{ a: 1 }]);

    // Un etat intermediaire presente comme final est pire que pas
    // d'information : le lecteur conclurait sur des chiffres provisoires.
    expect(formatTrace(recorder.snapshot())).toContain('tourne encore');
  });

  describe('confidentialité', () => {
    it('rend les échantillons quand on les demande', () => {
      unmount = mount(`<dsfr-data-source id="src"></dsfr-data-source>`);
      recorder = freshRecorder();
      dispatchDataLoaded('src', [{ nom: 'Dupont', salaire: 42000 }]);

      expect(formatTrace(recorder.snapshot(), { sampleRows: 2 })).toContain('Dupont');
    });

    it('masque les valeurs mais garde champs et comptes', () => {
      unmount = mount(`<dsfr-data-source id="src"></dsfr-data-source>`);
      recorder = freshRecorder();
      dispatchDataLoaded('src', [{ nom: 'Dupont', salaire: 42000 }]);

      const text = formatTrace(recorder.snapshot(), { sampleRows: 2, redactValues: true });

      expect(text).not.toContain('Dupont');
      expect(text).not.toContain('42000');
      expect(text).toContain('nom');
      expect(text).toContain('→ 1 ligne,');
      expect(text).toContain('valeurs masquées');
    });

    it('ne rend aucun échantillon par défaut', () => {
      unmount = mount(`<dsfr-data-source id="src"></dsfr-data-source>`);
      recorder = freshRecorder();
      dispatchDataLoaded('src', [{ nom: 'Dupont' }]);

      expect(formatTrace(recorder.snapshot())).not.toContain('Dupont');
    });
  });
});

describe('summarizeTrace — le rail replié', () => {
  let unmount: (() => void) | undefined;
  let recorder: DataflowRecorder | undefined;

  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    unmount?.();
    unmount = undefined;
    clearDataCache('src');
    clearDataCache('q1');
    clearDataMeta('src');
  });

  it('rend le premier et le dernier compte de lignes', () => {
    unmount = mount(`
      <dsfr-data-source id="src"></dsfr-data-source>
      <dsfr-data-query id="q1" source="src"></dsfr-data-query>
    `);
    recorder = freshRecorder();
    dispatchDataLoaded(
      'src',
      Array.from({ length: 100 }, () => ({ a: 1 }))
    );
    dispatchDataLoaded(
      'q1',
      Array.from({ length: 8 }, () => ({ a: 1 }))
    );

    const summary = summarizeTrace(recorder.snapshot());

    expect(summary.stages).toBe(2);
    expect(summary.firstRows).toBe(100);
    expect(summary.lastRows).toBe(8);
  });

  it('compte les alertes qui méritent d’ouvrir le volet', () => {
    unmount = mount(`
      <dsfr-data-source id="src"></dsfr-data-source>
      <dsfr-data-chart id="c1" source="fantome"></dsfr-data-chart>
    `);
    recorder = freshRecorder();
    dispatchDataLoaded('src', []);

    // 1 amont introuvable + 1 source a zero ligne + 1 afficheur non alimente
    expect(summarizeTrace(recorder.snapshot()).alerts).toBe(3);
  });

  it('ne compte aucune alerte sur une chaîne saine', () => {
    unmount = mount(`
      <dsfr-data-source id="src"></dsfr-data-source>
      <dsfr-data-chart id="c1" source="src"></dsfr-data-chart>
    `);
    recorder = freshRecorder();
    dispatchDataLoaded('src', [{ a: 1 }]);

    expect(summarizeTrace(recorder.snapshot()).alerts).toBe(0);
  });
});

describe('les afficheurs, qui ne réémettent jamais', () => {
  let unmount: (() => void) | undefined;
  let recorder: DataflowRecorder | undefined;

  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    unmount?.();
    unmount = undefined;
    clearDataCache('src');
  });

  it('se lit « alimenté » quand l’amont a livré', () => {
    // Faux negatif a eviter : un afficheur n'a jamais d'etat « loaded » sur le
    // bus. Le declarer sans donnees alors que son amont vient de livrer
    // enverrait chercher une panne inexistante.
    unmount = mount(`
      <dsfr-data-source id="src"></dsfr-data-source>
      <dsfr-data-chart id="c1" source="src"></dsfr-data-chart>
    `);
    recorder = freshRecorder();
    dispatchDataLoaded('src', [{ a: 1 }]);

    const text = formatTrace(recorder.snapshot());

    expect(text).toContain('✓ alimenté');
    expect(text).not.toContain('aucune donnée reçue');
  });

  it('alerte quand l’amont n’a rien livré', () => {
    unmount = mount(`
      <dsfr-data-source id="src"></dsfr-data-source>
      <dsfr-data-chart id="c1" source="src"></dsfr-data-chart>
    `);
    recorder = freshRecorder();

    expect(formatTrace(recorder.snapshot())).toContain('aucune donnée reçue');
  });
});

describe('la fraîcheur du diagnostic ne ment pas', () => {
  let unmount: (() => void) | undefined;
  let recorder: DataflowRecorder | undefined;

  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    unmount?.();
    unmount = undefined;
    clearDataCache('src');
  });

  it('recalcule l’écart au rendu, pas à la prise de l’instantané', () => {
    // `sinceLastEventMs` est fige dans la trace. Un diagnostic copie dix
    // minutes plus tard annoncerait « a l'instant » — dans un module dont
    // toute la doctrine est de ne pas presenter un etat perime comme frais.
    unmount = mount(`<dsfr-data-source id="src"></dsfr-data-source>`);
    const horloge = 1_000_000;
    recorder = new DataflowRecorder({ root: document.body, now: () => horloge });
    recorder.start();
    dispatchDataLoaded('src', [{ a: 1 }]);
    const trace = recorder.snapshot();

    expect(formatTrace(trace, { now: () => horloge })).toContain("à l'instant");
    // Dix minutes plus tard, la MEME trace doit se dater honnetement.
    expect(formatTrace(trace, { now: () => horloge + 600_000 })).toContain('il y a 10 min');
  });

  it('reste correct sur une trace sans horodatage absolu', () => {
    unmount = mount(`<dsfr-data-source id="src"></dsfr-data-source>`);
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();

    expect(formatTrace(recorder.snapshot())).toContain('aucune exécution observée');
  });
});
