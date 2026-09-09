import { describe, it, expect, afterEach } from 'vitest';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DataflowRecorder, formatTrace } from '@dsfr-data/shared';
import {
  dispatchDataLoaded,
  setDataMeta,
  clearDataCache,
  clearDataMeta,
} from '@/utils/data-bridge.js';

/**
 * La COUTURE entre #603 et #604 : `getDelegation()` cote coeur, `delegation`
 * dans la trace, et la ligne de diagnostic qui en decoule.
 *
 * Ce fichier existe parce que cette jonction etait aveugle. Dans les autres
 * tests de trace, `dsfr-data-query` n'etait jamais importe en position de
 * VALEUR : le custom element n'etait donc pas enregistre, les balises du DOM
 * restaient des HTMLElement nus, `readDelegation()` rendait `{}` — et toute
 * la branche delegation de `formatTrace` etait silencieusement morte.
 *
 * D'ou le premier test, structurel : il force l'evaluation du module.
 */

/** Vue interne du query, plutot que des casts disperses (CLAUDE.md). */
interface QueryInternals {
  _serverDelegated: { groupBy: boolean; aggregate: boolean; orderBy: boolean; where: boolean };
}

function internals(query: DsfrDataQuery): QueryInternals {
  return query as unknown as QueryInternals;
}

function mount(html: string): () => void {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return () => host.remove();
}

describe('délégation serveur dans la trace (#603 × #604)', () => {
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

  it('dsfr-data-query est enregistré comme custom element', () => {
    // Structurel : sans cet usage en position de valeur, l'import serait
    // elide et les <dsfr-data-query> du DOM ne seraient jamais rehausses.
    expect(customElements.get('dsfr-data-query')).toBe(DsfrDataQuery);
  });

  it('le collecteur relève la délégation d’un query rehaussé', () => {
    unmount = mount(
      `<dsfr-data-query id="q1" source="src" group-by="dept" aggregate="sum:montant"></dsfr-data-query>`
    );
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();

    const query = document.getElementById('q1') as DsfrDataQuery;
    internals(query)._serverDelegated.groupBy = true;

    expect(recorder.snapshot().delegation.q1).toEqual({
      groupBy: true,
      aggregate: false,
      orderBy: false,
      where: false,
    });
  });

  it('ne relève rien pour un query sans id — il ne parle pas sur le bus', () => {
    unmount = mount(`<dsfr-data-query source="src" group-by="dept"></dsfr-data-query>`);
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();

    expect(recorder.snapshot().delegation).toEqual({});
  });

  it('avertit du repli client quand une agrégation est demandée', () => {
    unmount = mount(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-query id="q1" source="src" group-by="dept" aggregate="sum:montant"></dsfr-data-query>`
    );
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    setDataMeta('src', { page: 1, pageSize: 0, total: 500000, needsClientProcessing: true });
    dispatchDataLoaded(
      'src',
      Array.from({ length: 100 }, () => ({ dept: 'A', montant: 1 }))
    );
    dispatchDataLoaded('q1', [{ dept: 'A', montant__sum: 100 }]);

    const text = formatTrace(recorder.snapshot());

    expect(text).toContain('délégation serveur : groupBy=non');
    expect(text).toContain('agrégation exécutée CÔTÉ CLIENT');
  });

  it('N’AVERTIT PAS un query qui ne fait que filtrer', () => {
    // Le cas majoritaire. Coller l'alerte a un query sans group-by ni
    // aggregate apprendrait au lecteur — humain comme modele — a ignorer la
    // ligne la plus importante du diagnostic.
    unmount = mount(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-query id="q1" source="src" filter="dept:eq:A"></dsfr-data-query>`
    );
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    dispatchDataLoaded('src', [{ dept: 'A' }]);
    dispatchDataLoaded('q1', [{ dept: 'A' }]);

    const text = formatTrace(recorder.snapshot());

    expect(text).toContain('délégation serveur');
    expect(text).not.toContain('CÔTÉ CLIENT');
  });

  it('n’avertit pas non plus quand l’agrégation est bien partie au serveur', () => {
    unmount = mount(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-query id="q1" source="src" group-by="dept"></dsfr-data-query>`
    );
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    const query = document.getElementById('q1') as DsfrDataQuery;
    internals(query)._serverDelegated.groupBy = true;
    dispatchDataLoaded('src', [{ dept: 'A' }]);
    dispatchDataLoaded('q1', [{ dept: 'A' }]);

    expect(formatTrace(recorder.snapshot())).not.toContain('CÔTÉ CLIENT');
  });

  it('accorde le nombre — « 1 ligne reçue », pas « 1 lignes »', () => {
    unmount = mount(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-query id="q1" source="src" group-by="dept"></dsfr-data-query>`
    );
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    dispatchDataLoaded('src', [{ dept: 'A' }]);
    dispatchDataLoaded('q1', [{ dept: 'A' }]);

    const text = formatTrace(recorder.snapshot());

    expect(text).toContain('sur 1 ligne reçue');
    expect(text).not.toContain('1 lignes reçues');
  });

  it('survit à un composant non rehaussé sans casser la trace', () => {
    // Un getDelegation() absent ne doit jamais faire echouer un diagnostic :
    // c'est precisement quand la page est cassee qu'on en a besoin.
    unmount = mount(`<dsfr-data-query id="q1" source="src"></dsfr-data-query>`);
    const el = document.getElementById('q1') as unknown as { getDelegation: () => never };
    el.getDelegation = () => {
      throw new Error('composant en vrac');
    };
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();

    expect(() => recorder!.snapshot()).not.toThrow();
    expect(recorder.snapshot().delegation.q1).toBeUndefined();
  });
});
