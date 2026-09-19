import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DsfrDataRepeat, REPEAT_TAG } from '@/components/dsfr-data-repeat.js';
import '@/components/dsfr-data-kpi.js';
import '@/components/dsfr-data-chart.js';
import {
  clearDataCache,
  clearDataMeta,
  getDataCache,
  getDataMeta,
  dispatchDataLoaded,
  dispatchDataLoading,
  dispatchDataError,
  dispatchDataIdle,
} from '@/utils/data-bridge.js';
import { snapshotGraph, formatTrace, DataflowRecorder } from '@dsfr-data/shared/lib';

/**
 * `dsfr-data-repeat` — lot 2 de l'epic #887 (#891) : `scopes`, relais des
 * états, purge, `lazy`, et l'attribution des ids scopés dans le Diagnostic.
 *
 * happy-dom ordonne les callbacks de cycle de vie à l'envers d'un navigateur
 * et n'a pas d'`IntersectionObserver` : le contrat fonctionnel est ici, la
 * preuve de `lazy` sur un vrai défilement est dans `e2e/repeat.spec.ts`.
 */

const QUESTIONS = [
  { code: '001', libelle: 'Question un', pres: 'bar' },
  { code: '002', libelle: 'Question deux', pres: 'line' },
  { code: '003', libelle: 'Question trois', pres: 'bar' },
];
/** `003` n'a AUCUN score : sa ligne doit exister, son scope être vide. */
const SCORES = [
  { code: '001', annee: '2023', score: 10 },
  { code: '001', annee: '2024', score: 20 },
  { code: '002', annee: '2023', score: 30 },
  { code: '002', annee: '2024', score: 40 },
  { code: '002', annee: '2025', score: 50 },
];
const EFFECTIFS = [
  { code: '001', n: 7 },
  { code: '002', n: 9 },
];

const SCOPED = [
  'q-001',
  'q-002',
  'q-003',
  'e-001',
  'e-002',
  'e-003',
  'scores-001',
  'scores-002',
  'scores-003',
];
const IDS = ['questions', 'scores', 'effectifs', ...SCOPED];

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const purge = () =>
  IDS.forEach((id) => {
    clearDataCache(id);
    clearDataMeta(id);
  });

describe('dsfr-data-repeat — scopes, états, lazy (#891)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    purge();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    purge();
    vi.restoreAllMocks();
  });

  const mount = async (markup: string) => {
    host.innerHTML = markup;
    const rep = host.querySelector(REPEAT_TAG) as DsfrDataRepeat;
    await rep.updateComplete;
    await tick();
    return rep;
  };

  /** Les sources sont déclarées pour que le contrôle « introuvable » ne tire pas. */
  const sources = `
    <div id="questions"></div><div id="scores"></div><div id="effectifs"></div>`;

  const GABARIT_UNE_ENTREE = `${sources}
    <${REPEAT_TAG} id="rep" source="questions" key-field="code" scopes="scores:code:q">
      <template>
        <h3 class="titre">{{libelle}}</h3>
        <dsfr-data-kpi id="k-{{code}}" source="{{$scope.q}}" value="score:sum"></dsfr-data-kpi>
      </template>
    </${REPEAT_TAG}>`;

  describe('partition et émission', () => {
    it('un id scopé par ligne, avec exactement les lignes de sa clé — et un tableau VIDE pour une clé sans lignes', async () => {
      dispatchDataLoaded('scores', SCORES);
      dispatchDataLoaded('questions', QUESTIONS);
      await mount(GABARIT_UNE_ENTREE);

      // Les comptes par clé sont ceux d'un group-by sur `code`.
      expect((getDataCache('q-001') as unknown[]).length).toBe(2);
      expect((getDataCache('q-002') as unknown[]).length).toBe(3);
      expect(getDataCache('q-003')).toEqual([]);
      expect(getDataMeta('q-002')?.total).toBe(3);
      expect(getDataMeta('q-002')?.truncated).toBeUndefined();
      // Somme préservée : la partition ne perd ni ne duplique une ligne.
      const total = SCOPED.slice(0, 3)
        .map((id) => (getDataCache(id) as Array<{ score: number }>) ?? [])
        .flat()
        .reduce((s, r) => s + r.score, 0);
      expect(total).toBe(150);

      // Aucune `dsfr-data-query` dans le gabarit, et pourtant les KPI sont alimentés.
      expect(host.querySelectorAll('dsfr-data-query').length).toBe(0);
      const kpi = (id: string) =>
        host.querySelector(`#${id} .dsfr-data-kpi__value`)?.textContent?.trim();
      expect(kpi('k-001')).toBe('30');
      expect(kpi('k-002')).toBe('120');
      expect(host.querySelectorAll('[data-dsfr-config-error]').length).toBe(0);
    });

    it('deux entrées, deux familles d’ids, une seule partition par champ', async () => {
      dispatchDataLoaded('scores', SCORES);
      dispatchDataLoaded('effectifs', EFFECTIFS);
      dispatchDataLoaded('questions', QUESTIONS);
      const rep = await mount(`${sources}
        <${REPEAT_TAG} id="rep" source="questions" key-field="code"
          scopes="scores:code:q | effectifs:code:e">
          <template>
            <dsfr-data-kpi id="k-{{code}}" source="{{$scope.q}}" value="score:sum"></dsfr-data-kpi>
            <dsfr-data-kpi id="n-{{code}}" source="{{$scope.e}}" value="n:sum"></dsfr-data-kpi>
          </template>
        </${REPEAT_TAG}>`);
      expect(rep.getScopedIds().sort()).toEqual([
        'e-001',
        'e-002',
        'e-003',
        'q-001',
        'q-002',
        'q-003',
      ]);
      expect((getDataCache('e-001') as unknown[]).length).toBe(1);
      expect(getDataCache('e-003')).toEqual([]);
    });

    it('sans alias, l’id de la source sert de préfixe et `{{$scope}}` résout (entrée unique)', async () => {
      dispatchDataLoaded('scores', SCORES);
      dispatchDataLoaded('questions', QUESTIONS);
      await mount(`${sources}
        <${REPEAT_TAG} id="rep" source="questions" key-field="code" scopes="scores:code">
          <template>
            <dsfr-data-kpi id="k-{{code}}" source="{{$scope}}" value="score:sum"></dsfr-data-kpi>
          </template>
        </${REPEAT_TAG}>`);
      expect((getDataCache('scores-001') as unknown[]).length).toBe(2);
      expect(host.querySelector('#k-001')?.getAttribute('source')).toBe('scores-001');
    });
  });

  describe('grammaire — rien de silencieux', () => {
    const erreur = () => host.querySelector(REPEAT_TAG)?.getAttribute('data-dsfr-config-error');

    it('entrée mal formée : l’entrée est nommée', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      dispatchDataLoaded('questions', QUESTIONS);
      await mount(`${sources}
        <${REPEAT_TAG} source="questions" key-field="code" scopes="scores">
          <template><i>{{libelle}}</i></template>
        </${REPEAT_TAG}>`);
      expect(erreur()).toContain('« scores »');
      expect(erreur()).toContain('source:champ:alias');
    });

    it('alias en double : l’alias est nommé, aucun id n’est émis', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      dispatchDataLoaded('scores', SCORES);
      dispatchDataLoaded('questions', QUESTIONS);
      const rep = await mount(`${sources}
        <${REPEAT_TAG} source="questions" key-field="code"
          scopes="scores:code:q | effectifs:code:q">
          <template><i>{{libelle}}</i></template>
        </${REPEAT_TAG}>`);
      expect(erreur()).toContain('alias « q » déclaré deux fois');
      expect(rep.getScopedIds()).toEqual([]);
      expect(getDataCache('q-001')).toBeUndefined();
    });

    it('`scopes` sans `key-field` : la clé de partition manque, et on le dit', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      dispatchDataLoaded('scores', SCORES);
      dispatchDataLoaded('questions', QUESTIONS);
      await mount(`${sources}
        <${REPEAT_TAG} source="questions" scopes="scores:code:q">
          <template><i>{{libelle}}</i></template>
        </${REPEAT_TAG}>`);
      expect(erreur()).toContain('"key-field" requis');
    });

    it('source scopée absente de la page : panne signalée, pas un chargement éternel', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      dispatchDataLoaded('questions', QUESTIONS);
      await mount(`<div id="questions"></div>
        <${REPEAT_TAG} source="questions" key-field="code" scopes="absente:code:q">
          <template><i>{{libelle}}</i></template>
        </${REPEAT_TAG}>`);
      await tick();
      expect(erreur()).toContain('« absente » introuvable');
    });

    it('champ absent des lignes de la source scopée : les champs vus sont donnés', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      dispatchDataLoaded('scores', SCORES);
      dispatchDataLoaded('questions', QUESTIONS);
      await mount(`${sources}
        <${REPEAT_TAG} source="questions" key-field="code" scopes="scores:identifiant:q">
          <template><i>{{libelle}}</i></template>
        </${REPEAT_TAG}>`);
      expect(erreur()).toContain('« identifiant » absent des lignes');
      expect(erreur()).toContain('champs vus : code, annee, score');
    });
  });

  describe('relais des états sur les ids scopés', () => {
    const ligne = (id: string) => host.querySelector(`#${id}`)?.textContent ?? '';

    it('chargement : la ligne affiche « Chargement… », pas un vide', async () => {
      dispatchDataLoaded('questions', QUESTIONS);
      dispatchDataLoading('scores');
      await mount(GABARIT_UNE_ENTREE);
      expect(ligne('k-001')).toContain('Chargement');
      expect(host.querySelectorAll('#rep .dsfr-data-kpi__loading').length).toBe(3);
    });

    it('erreur : le message de la source scopée est rendu dans chaque ligne', async () => {
      dispatchDataLoaded('questions', QUESTIONS);
      await mount(GABARIT_UNE_ENTREE);
      dispatchDataError('scores', new Error('502 du portail'));
      await tick();
      expect(ligne('k-002')).toContain('502 du portail');
      expect(host.querySelectorAll('#rep [role="alert"]').length).toBe(3);
    });

    it('attente d’un filtre (`require-where`) : le message d’attente, pas « aucune donnée »', async () => {
      dispatchDataLoaded('questions', QUESTIONS);
      await mount(GABARIT_UNE_ENTREE);
      dispatchDataIdle('scores');
      await tick();
      expect(ligne('k-003')).toContain('Choisissez un filtre');
      // L'attente purge le cache de l'id scopé : rien de périmé derrière le message.
      expect(getDataCache('q-003')).toBeUndefined();
    });

    it('ré-émission de la source scopée : re-partition, ids à jour, MÊMES instances', async () => {
      dispatchDataLoaded('scores', SCORES);
      dispatchDataLoaded('questions', QUESTIONS);
      await mount(GABARIT_UNE_ENTREE);
      const avant = [...host.querySelectorAll('dsfr-data-kpi')];
      dispatchDataLoaded('scores', [...SCORES, { code: '003', annee: '2024', score: 99 }]);
      await tick();
      const apres = [...host.querySelectorAll('dsfr-data-kpi')];
      expect(apres.length).toBe(3);
      expect(apres.every((el, i) => el === avant[i])).toBe(true);
      expect((getDataCache('q-003') as unknown[]).length).toBe(1);
      expect(host.querySelector('#k-003 .dsfr-data-kpi__value')?.textContent?.trim()).toBe('99');
    });
  });

  describe('purge', () => {
    it('une ligne qui disparaît emporte ses ids scopés', async () => {
      dispatchDataLoaded('scores', SCORES);
      dispatchDataLoaded('questions', QUESTIONS);
      await mount(GABARIT_UNE_ENTREE);
      expect(getDataCache('q-002')).toBeDefined();
      dispatchDataLoaded('questions', [QUESTIONS[0]]);
      await tick();
      expect(getDataCache('q-001')).toBeDefined();
      expect(getDataCache('q-002')).toBeUndefined();
      expect(getDataMeta('q-002')).toBeUndefined();
    });

    it('la déconnexion du répéteur purge tous ses ids scopés', async () => {
      dispatchDataLoaded('scores', SCORES);
      dispatchDataLoaded('questions', QUESTIONS);
      const rep = await mount(GABARIT_UNE_ENTREE);
      rep.remove();
      await tick();
      expect(rep.getScopedIds()).toEqual([]);
      for (const id of ['q-001', 'q-002', 'q-003']) {
        expect(getDataCache(id), id).toBeUndefined();
      }
    });
  });

  describe('Diagnostic : d’où vient q-001 ?', () => {
    it('le graphe ne compte aucun amont introuvable et attribue chaque id à son répéteur', async () => {
      dispatchDataLoaded('scores', SCORES);
      dispatchDataLoaded('questions', QUESTIONS);
      await mount(GABARIT_UNE_ENTREE);

      const graphe = snapshotGraph(host);
      const rep = graphe.nodes.find((n) => n.tag === REPEAT_TAG)!;
      expect(rep.emits).toEqual(['q-001', 'q-002', 'q-003']);
      expect(rep.attrs.scopes).toBe('scores:code:q');
      // Sans `emits`, chaque KPI déclarerait un amont fantôme.
      expect(graphe.dangling.filter((d) => d.missing.startsWith('q-'))).toEqual([]);

      const recorder = new DataflowRecorder({ root: host });
      const texte = formatTrace(recorder.snapshot());
      recorder.stop();
      expect(texte).toContain('Ids scopés');
      expect(texte).toContain(`q-001 ← ${REPEAT_TAG}#rep`);
    });
  });

  describe('lazy', () => {
    /**
     * happy-dom n'a pas d'`IntersectionObserver` : on en pose un factice qui
     * ne déclenche RIEN tant que le test ne le demande pas — ce qui est
     * précisément la situation d'une ligne hors écran.
     */
    const installerObservateur = () => {
      const cibles: Element[] = [];
      let rappel: IntersectionObserverCallback = () => {};
      class Faux {
        constructor(cb: IntersectionObserverCallback) {
          rappel = cb;
        }
        observe(el: Element) {
          cibles.push(el);
        }
        unobserve(el: Element) {
          const i = cibles.indexOf(el);
          if (i >= 0) cibles.splice(i, 1);
        }
        disconnect() {
          cibles.length = 0;
        }
      }
      const avant = (globalThis as Record<string, unknown>).IntersectionObserver;
      (globalThis as Record<string, unknown>).IntersectionObserver = Faux;
      return {
        cibles,
        montrer: (n = cibles.length) => {
          const vues = cibles.slice(0, n);
          rappel(
            vues.map((target) => ({ target, isIntersecting: true })) as never,
            null as never
          );
        },
        restaurer: () => {
          (globalThis as Record<string, unknown>).IntersectionObserver = avant;
        },
      };
    };

    it('les titres sont rendus d’emblée, les composants non — et les ids scopés le sont tous', async () => {
      const io = installerObservateur();
      try {
        dispatchDataLoaded('scores', SCORES);
        dispatchDataLoaded('questions', QUESTIONS);
        const rep = await mount(`${sources}
          <${REPEAT_TAG} id="rep" source="questions" key-field="code" scopes="scores:code:q" lazy>
            <template>
              <h3 class="titre">{{libelle}}</h3>
              <dsfr-data-kpi id="k-{{code}}" source="{{$scope.q}}" value="score:sum"></dsfr-data-kpi>
            </template>
          </${REPEAT_TAG}>`);

        // La structure est là : trois conteneurs, trois titres, le plan de la page.
        expect([...host.querySelectorAll('#rep .titre')].map((h) => h.textContent)).toEqual([
          'Question un',
          'Question deux',
          'Question trois',
        ]);
        // Les composants, eux, ne sont pas dans le document : rien n'est abonné.
        expect(host.querySelectorAll('dsfr-data-kpi').length).toBe(0);
        expect(io.cibles.length).toBe(3);
        // Mais le cache scopé est prêt pour quand la ligne s'estampera.
        expect(rep.getScopedIds().length).toBe(3);
        expect((getDataCache('q-002') as unknown[]).length).toBe(3);

        io.montrer(1);
        await tick();
        expect(host.querySelectorAll('dsfr-data-kpi').length).toBe(1);
        expect(host.querySelector('#k-001 .dsfr-data-kpi__value')?.textContent?.trim()).toBe('30');

        io.montrer();
        await tick();
        expect(host.querySelectorAll('dsfr-data-kpi').length).toBe(3);
        expect(host.querySelector('#k-002 .dsfr-data-kpi__value')?.textContent?.trim()).toBe('120');
        expect(host.querySelectorAll('[data-dsfr-config-error]').length).toBe(0);
      } finally {
        io.restaurer();
      }
    });

    it('sans `lazy`, tout est estampé d’emblée (comportement du lot 1)', async () => {
      const io = installerObservateur();
      try {
        dispatchDataLoaded('scores', SCORES);
        dispatchDataLoaded('questions', QUESTIONS);
        await mount(GABARIT_UNE_ENTREE);
        expect(host.querySelectorAll('dsfr-data-kpi').length).toBe(3);
        expect(io.cibles.length).toBe(0);
      } finally {
        io.restaurer();
      }
    });
  });
});
