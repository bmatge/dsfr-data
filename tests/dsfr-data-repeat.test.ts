import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DsfrDataRepeat, REPEAT_TAG } from '@/components/dsfr-data-repeat.js';
import '@/components/dsfr-data-query.js';
import '@/components/dsfr-data-kpi.js';
import '@/components/dsfr-data-chart.js';
import '@/components/dsfr-data-display.js';
import {
  clearDataCache,
  getDataCache,
  dispatchDataLoaded,
  dispatchDataError,
} from '@/utils/data-bridge.js';
import { renderTemplate } from '@/utils/template-expression.js';
import { hasSplitBlock, renderTemplateRow } from '@/utils/template-clone.js';

/**
 * `dsfr-data-repeat` — lot 1 de l'epic #887 (ADR-135). Reprend les trois
 * vérifications (a)(b)(c) du test de #877 sur `display`, puis ce que `repeat`
 * promet en plus : identité par clé, rendu transparent, `per-row`, `empty`,
 * erreurs nommées, `$uid` unique.
 *
 * happy-dom ordonne les callbacks de cycle de vie à l'envers d'un navigateur :
 * l'ordre de rehaussement et l'interpolation AVANT insertion sont vérifiés en
 * vrai Chromium par `e2e/repeat.spec.ts`. Ici, le contrat fonctionnel.
 */

const QUESTIONS = [
  { code: '001', libelle: 'Question un', pres: 'bar', long: true },
  { code: '002', libelle: 'Question deux', pres: 'line', long: false },
  { code: '003', libelle: 'Question trois', pres: 'bar', long: null },
];
const SCORES = [
  { code: '001', annee: '2023', score: 10 },
  { code: '001', annee: '2024', score: 20 },
  { code: '002', annee: '2023', score: 30 },
  { code: '002', annee: '2024', score: 40 },
  { code: '002', annee: '2025', score: 50 },
  { code: '003', annee: '2024', score: 60 },
];
const IDS = [
  'rep-questions',
  'rep-scores',
  'rep-chap',
  'q-001',
  'q-002',
  'q-003',
  'q-004',
  'qq-1',
  'qr-1',
];

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('dsfr-data-repeat', () => {
  let host: HTMLElement;

  beforeEach(() => {
    IDS.forEach(clearDataCache);
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    IDS.forEach(clearDataCache);
    vi.restoreAllMocks();
  });

  const mount = async (markup: string) => {
    host.innerHTML = markup;
    const rep = host.querySelector(REPEAT_TAG) as DsfrDataRepeat;
    await rep.updateComplete;
    return rep;
  };

  it('la balise enregistrée est REPEAT_TAG (renommage mécanique, #888)', () => {
    expect(customElements.get(REPEAT_TAG)).toBe(DsfrDataRepeat);
  });

  it('noms réservés (#888 § 4) : aucun attribut des lots 2-3 ne fait partie du lot 1', () => {
    const observed = (DsfrDataRepeat as unknown as { observedAttributes: string[] })
      .observedAttributes;
    // `scopes` et `lazy` sont livrés au lot 2 (#891) ; `lazy-margin` reste réservé.
    expect(observed.sort()).toEqual([
      'empty',
      'key-field',
      'lazy',
      'per-row',
      'scopes',
      'source',
    ]);
    for (const reserved of [
      'lazy-margin',
      'if',
      'unless',
      'else',
      'when',
      'each',
      'key',
      'template',
      'depth',
    ]) {
      expect(observed, `${reserved} est réservé`).not.toContain(reserved);
    }
    expect(observed.some((a) => a.startsWith('if-') || a.startsWith('unless-'))).toBe(false);
  });

  it('(a)(b)(c) de #877 : une instance par ligne, une query scope, type="{{champ}}"', async () => {
    dispatchDataLoaded('rep-scores', SCORES);
    dispatchDataLoaded('rep-questions', QUESTIONS);
    await mount(`
      <${REPEAT_TAG} source="rep-questions" key-field="code">
        <template>
          <h3 id="{{$uid}}">{{libelle}}</h3>
          <dsfr-data-query id="q-{{code}}" source="rep-scores" where="code:eq:{{code}}"></dsfr-data-query>
          <dsfr-data-kpi id="k-{{code}}" source="q-{{code}}" value="score:sum" label="Somme"></dsfr-data-kpi>
          <dsfr-data-chart id="c-{{code}}" source="q-{{code}}" type="{{pres}}"
            label-field="annee" value-field="score"></dsfr-data-chart>
        </template>
      </${REPEAT_TAG}>`);
    await tick();

    const queries = [...host.querySelectorAll('dsfr-data-query')];
    expect(queries.map((q) => q.id)).toEqual(['q-001', 'q-002', 'q-003']);
    expect(queries.map((q) => q.getAttribute('where'))).toEqual([
      'code:eq:001',
      'code:eq:002',
      'code:eq:003',
    ]);
    expect((getDataCache('q-001') as unknown[]).length).toBe(2);
    expect((getDataCache('q-002') as unknown[]).length).toBe(3);
    const kpiValue = (id: string) =>
      host.querySelector(`#${id} .dsfr-data-kpi__value`)?.textContent?.trim();
    expect(kpiValue('k-001')).toBe('30');
    expect(kpiValue('k-002')).toBe('120');
    expect(kpiValue('k-003')).toBe('60');
    const innerTag = (id: string) =>
      host.querySelector(`#${id} bar-chart, #${id} line-chart`)?.tagName.toLowerCase();
    expect(innerTag('c-001')).toBe('bar-chart');
    expect(innerTag('c-002')).toBe('line-chart');
    // Aucun placeholder n'a atteint le document
    expect(host.querySelector('[id*="{{"]')).toBeNull();
    expect(host.querySelectorAll('[data-dsfr-config-error]').length).toBe(0);
  });

  describe('identité par clé', () => {
    const markup = `
      <${REPEAT_TAG} source="rep-questions" key-field="code">
        <template>
          <h3 class="t">{{libelle}}</h3>
          <dsfr-data-query id="q-{{code}}" source="rep-scores" where="code:eq:{{code}}"></dsfr-data-query>
        </template>
      </${REPEAT_TAG}>`;

    it('ré-émission avec les mêmes clés : mêmes objets, texte mis à jour en place', async () => {
      dispatchDataLoaded('rep-scores', SCORES);
      dispatchDataLoaded('rep-questions', QUESTIONS);
      await mount(markup);
      await tick();
      const before = [...host.querySelectorAll('dsfr-data-query')];
      const h3Before = [...host.querySelectorAll('h3.t')];
      dispatchDataLoaded(
        'rep-questions',
        QUESTIONS.map((q) => ({ ...q, libelle: `${q.libelle} (v2)` }))
      );
      await tick();
      const after = [...host.querySelectorAll('dsfr-data-query')];
      expect(after.length).toBe(3);
      after.forEach((q, i) => expect(q).toBe(before[i]));
      [...host.querySelectorAll('h3.t')].forEach((h, i) => expect(h).toBe(h3Before[i]));
      expect([...host.querySelectorAll('h3.t')].map((h) => h.textContent)).toEqual([
        'Question un (v2)',
        'Question deux (v2)',
        'Question trois (v2)',
      ]);
      // Les queries n'ont pas été déconnectées : leur cache est intact
      expect((getDataCache('q-001') as unknown[]).length).toBe(2);
    });

    it('une clé retirée : une seule ligne retirée, les autres intactes', async () => {
      dispatchDataLoaded('rep-scores', SCORES);
      dispatchDataLoaded('rep-questions', QUESTIONS);
      await mount(markup);
      await tick();
      const q001 = host.querySelector('#q-001');
      const q003 = host.querySelector('#q-003');
      dispatchDataLoaded('rep-questions', [QUESTIONS[0], QUESTIONS[2]]);
      await tick();
      expect([...host.querySelectorAll('dsfr-data-query')].map((q) => q.id)).toEqual([
        'q-001',
        'q-003',
      ]);
      expect(host.querySelector('#q-001')).toBe(q001);
      expect(host.querySelector('#q-003')).toBe(q003);
      // La query retirée a purgé son cache (plus personne ne porte l'id)
      expect(getDataCache('q-002')).toBeUndefined();
    });

    it('une clé ajoutée au milieu : insérée à sa place, sans recréer les voisines', async () => {
      dispatchDataLoaded('rep-scores', SCORES);
      dispatchDataLoaded('rep-questions', [QUESTIONS[0], QUESTIONS[2]]);
      await mount(markup);
      await tick();
      const q001 = host.querySelector('#q-001');
      const q003 = host.querySelector('#q-003');
      dispatchDataLoaded('rep-questions', QUESTIONS);
      await tick();
      expect([...host.querySelectorAll('dsfr-data-query')].map((q) => q.id)).toEqual([
        'q-001',
        'q-002',
        'q-003',
      ]);
      expect(host.querySelector('#q-001')).toBe(q001);
      expect(host.querySelector('#q-003')).toBe(q003);
    });

    it("l'ordre du DOM suit l'ordre des données : déplacement sans recréation", async () => {
      dispatchDataLoaded('rep-questions', QUESTIONS);
      await mount(markup);
      await tick();
      const nodes = new Map([...host.querySelectorAll('h3.t')].map((h) => [h.textContent, h]));
      dispatchDataLoaded('rep-questions', [...QUESTIONS].reverse());
      await tick();
      const after = [...host.querySelectorAll('h3.t')];
      expect(after.map((h) => h.textContent)).toEqual([
        'Question trois',
        'Question deux',
        'Question un',
      ]);
      after.forEach((h) => expect(h).toBe(nodes.get(h.textContent)));
    });
  });

  it('rendu transparent : aucun role, aria-live, compteur ni pagination', async () => {
    dispatchDataLoaded('rep-questions', QUESTIONS);
    const rep = await mount(`
      <${REPEAT_TAG} source="rep-questions" key-field="code">
        <template><p>{{libelle}}</p></template>
      </${REPEAT_TAG}>`);
    await tick();
    expect(rep.querySelectorAll('p').length).toBe(3);
    expect(rep.querySelector('[role], [aria-live], [aria-label], nav')).toBeNull();
    expect(rep.textContent).not.toMatch(/resultat/i);
  });

  it('per-row : grille DSFR par échelle, sans cols ; valeur fausse → erreur nommée', async () => {
    dispatchDataLoaded('rep-questions', QUESTIONS);
    const rep = await mount(`
      <${REPEAT_TAG} source="rep-questions" key-field="code" per-row="1 md:3">
        <template><p>{{libelle}}</p></template>
      </${REPEAT_TAG}>`);
    await tick();
    const rows = rep.querySelector(`.${REPEAT_TAG}__rows`)!;
    expect(rows.classList.contains('fr-grid-row')).toBe(true);
    expect(rows.classList.contains('fr-grid-row--gutters')).toBe(true);
    const cells = [...rows.children];
    expect(cells.length).toBe(3);
    expect(cells[0].className).toContain('fr-col-12');
    expect(cells[0].className).toContain('fr-col-md-4');
    expect(rep.hasAttribute('data-dsfr-config-error')).toBe(false);

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    rep.setAttribute('per-row', '5');
    await rep.updateComplete;
    await tick();
    expect(rep.getAttribute('data-dsfr-config-error')).toContain('per-row="5"');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('empty : texte rendu sans role="status" quand zéro ligne ; rien sinon', async () => {
    dispatchDataLoaded('rep-questions', []);
    const rep = await mount(`
      <${REPEAT_TAG} source="rep-questions" empty="Aucune question">
        <template><p>{{libelle}}</p></template>
      </${REPEAT_TAG}>`);
    await tick();
    await rep.updateComplete;
    const p = rep.querySelector(`.${REPEAT_TAG}__empty`)!;
    expect(p.textContent).toBe('Aucune question');
    expect(p.hasAttribute('role')).toBe(false);
    expect(p.hasAttribute('aria-live')).toBe(false);
    dispatchDataLoaded('rep-questions', QUESTIONS);
    await tick();
    await rep.updateComplete;
    expect(rep.querySelector(`.${REPEAT_TAG}__empty`)).toBeNull();
    expect(rep.querySelectorAll('p').length).toBe(3);
  });

  it('erreur de la source : renderSourceError partagé (un échec se voit, #649)', async () => {
    const rep = await mount(`
      <${REPEAT_TAG} source="rep-questions"><template><p>{{libelle}}</p></template></${REPEAT_TAG}>`);
    dispatchDataError('rep-questions', new Error('boum'));
    await tick();
    await rep.updateComplete;
    expect(rep.textContent).toContain('boum');
  });

  describe('erreurs de configuration nommées (rien de silencieux)', () => {
    it('clés en double : erreur nommant la clé, repli sur le rang pour les doublons', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      dispatchDataLoaded('rep-questions', [
        QUESTIONS[0],
        { ...QUESTIONS[1], code: '001' },
        QUESTIONS[2],
      ]);
      const rep = await mount(`
        <${REPEAT_TAG} source="rep-questions" key-field="code">
          <template><p data-k="{{$key}}">{{libelle}}</p></template>
        </${REPEAT_TAG}>`);
      await tick();
      expect(rep.getAttribute('data-dsfr-config-error')).toContain('clé "001" portée par 2 lignes');
      expect(error).toHaveBeenCalledTimes(1);
      expect([...rep.querySelectorAll('p')].map((p) => p.getAttribute('data-k'))).toEqual([
        '001',
        '1',
        '003',
      ]);
      // Même erreur à la ré-émission : l'attribut reste, la console ne répète pas
      dispatchDataLoaded('rep-questions', [
        QUESTIONS[0],
        { ...QUESTIONS[1], code: '001' },
        QUESTIONS[2],
      ]);
      await tick();
      expect(error).toHaveBeenCalledTimes(1);
      // Corrigée : l'erreur disparaît
      dispatchDataLoaded('rep-questions', QUESTIONS);
      await tick();
      expect(rep.hasAttribute('data-dsfr-config-error')).toBe(false);
    });

    it('key-field absent des lignes : erreur nommant les champs vus, repli sur le rang', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      dispatchDataLoaded('rep-questions', QUESTIONS);
      const rep = await mount(`
        <${REPEAT_TAG} source="rep-questions" key-field="identifiant">
          <template><p>{{$key}}</p></template>
        </${REPEAT_TAG}>`);
      await tick();
      expect(rep.getAttribute('data-dsfr-config-error')).toContain(
        'key-field="identifiant" : champ absent'
      );
      expect(rep.getAttribute('data-dsfr-config-error')).toContain('code, libelle');
      expect([...rep.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['0', '1', '2']);
    });

    it('key-field nul ou vide sur UNE ligne : repli sur le rang pour elle, sans erreur', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      dispatchDataLoaded('rep-questions', [
        QUESTIONS[0],
        { ...QUESTIONS[1], code: null },
        { ...QUESTIONS[2], code: '' },
      ]);
      const rep = await mount(`
        <${REPEAT_TAG} source="rep-questions" key-field="code">
          <template><p data-k="{{$key}}">{{libelle}}</p></template>
        </${REPEAT_TAG}>`);
      await tick();
      expect(rep.hasAttribute('data-dsfr-config-error')).toBe(false);
      expect(error).not.toHaveBeenCalled();
      expect([...rep.querySelectorAll('p')].map((p) => p.getAttribute('data-k'))).toEqual([
        '001',
        '1',
        '2',
      ]);
    });

    it('source manquante : erreur au montage', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const rep = await mount(`<${REPEAT_TAG}><template><p>x</p></template></${REPEAT_TAG}>`);
      expect(rep.getAttribute('data-dsfr-config-error')).toBe('attribut "source" requis');
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('gabarit absent : erreur quand la donnée arrive après analyse', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const rep = await mount(`<${REPEAT_TAG} source="rep-questions"></${REPEAT_TAG}>`);
      dispatchDataLoaded('rep-questions', QUESTIONS);
      await tick();
      expect(rep.getAttribute('data-dsfr-config-error')).toBe('gabarit <template> enfant requis');
    });

    it('bloc {{#if}} coupé entre éléments frères : erreur, contenu rendu quelle que soit la condition', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      dispatchDataLoaded('rep-questions', QUESTIONS);
      const rep = await mount(`
        <${REPEAT_TAG} source="rep-questions" key-field="code">
          <template><div class="e">{{#if long}}<span>A</span><span>B</span>{{/if}}</div></template>
        </${REPEAT_TAG}>`);
      await tick();
      expect(rep.getAttribute('data-dsfr-config-error')).toContain('bloc « {{#if long}} »');
      expect(error).toHaveBeenCalledTimes(1);
      expect([...rep.querySelectorAll('.e')].map((e) => e.querySelectorAll('span').length)).toEqual(
        [2, 2, 2]
      );
      expect([...rep.querySelectorAll('.e')].map((e) => e.textContent)).toEqual(['AB', 'AB', 'AB']);
    });

    it('{{{brut}}} : avertissement une fois par gabarit, rendu comme texte échappé', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      dispatchDataLoaded('rep-questions', [{ code: '1', html: '<b>gras</b> & co' }]);
      const rep = await mount(`
        <${REPEAT_TAG} source="rep-questions" key-field="code">
          <template><p class="b">{{{html}}}</p></template>
        </${REPEAT_TAG}>`);
      await tick();
      const p = rep.querySelector('p.b')!;
      expect(p.querySelector('b')).toBeNull();
      expect(p.textContent).toBe('<b>gras</b> & co');
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('{{{brut}}}')).length).toBe(1);
      dispatchDataLoaded('rep-questions', [{ code: '1', html: '<i>x</i>' }]);
      await tick();
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('{{{brut}}}')).length).toBe(1);
    });
  });

  it('attributs booléens conditionnels : data-if-* / data-unless-* posent ou retirent, {{#if}} dans une valeur', async () => {
    dispatchDataLoaded('rep-questions', QUESTIONS);
    const rep = await mount(`
      <${REPEAT_TAG} source="rep-questions" key-field="code">
        <template>
          <p class="base {{#if long}}est-long{{/if}}" data-if-hidden="long" data-unless-aria-current="long">{{code}}</p>
          <dsfr-data-chart class="c" source="rep-questions" type="bar" label-field="code" value-field="code"
            data-if-horizontal="long"></dsfr-data-chart>
        </template>
      </${REPEAT_TAG}>`);
    await tick();
    const ps = [...rep.querySelectorAll('p')];
    expect(ps.map((p) => p.className.trim())).toEqual(['base est-long', 'base', 'base']);
    expect(ps.map((p) => p.hasAttribute('hidden'))).toEqual([true, false, false]);
    expect(ps.map((p) => p.hasAttribute('aria-current'))).toEqual([false, true, true]);
    expect(ps.some((p) => [...p.attributes].some((a) => a.name.startsWith('data-if')))).toBe(false);
    expect(
      [...rep.querySelectorAll('dsfr-data-chart.c')].map((c) => c.hasAttribute('horizontal'))
    ).toEqual([true, false, false]);
    // Mise à jour en place : la valeur change, l'attribut suit, le nœud reste
    dispatchDataLoaded(
      'rep-questions',
      QUESTIONS.map((q) => ({ ...q, long: !q.long }))
    );
    await tick();
    const after = [...rep.querySelectorAll('p')];
    after.forEach((p, i) => expect(p).toBe(ps[i]));
    expect(after.map((p) => p.hasAttribute('hidden'))).toEqual([false, true, true]);
    expect(after.map((p) => p.className.trim())).toEqual([
      'base',
      'base est-long',
      'base est-long',
    ]);
  });

  it('imbrication : un display dans le gabarit rend SES placeholders (le test de #877, inversé)', async () => {
    dispatchDataLoaded(
      'rep-questions',
      QUESTIONS.map((q) => ({ ...q, chapitre: 1 }))
    );
    dispatchDataLoaded('rep-chap', [{ chapitre: 1, nom: 'Chapitre un' }]);
    await mount(`
      <${REPEAT_TAG} source="rep-chap" key-field="chapitre">
        <template>
          <h2>{{nom}}</h2>
          <dsfr-data-query id="qq-{{chapitre}}" source="rep-questions" where="chapitre:eq:{{chapitre}}"></dsfr-data-query>
          <dsfr-data-display id="inner-{{chapitre}}" source="qq-{{chapitre}}">
            <template><p class="inner-item">[{{libelle}}|{{code}}]</p></template>
          </dsfr-data-display>
        </template>
      </${REPEAT_TAG}>`);
    await tick();
    const inner = host.querySelector('#inner-1') as HTMLElement & {
      updateComplete: Promise<boolean>;
    };
    expect(inner).not.toBeNull();
    await inner.updateComplete;
    await tick();
    expect((getDataCache('qq-1') as unknown[]).length).toBe(3);
    expect([...host.querySelectorAll('.inner-item')].map((e) => e.textContent)).toEqual([
      '[Question un|001]',
      '[Question deux|002]',
      '[Question trois|003]',
    ]);
    expect(host.querySelector('h2')?.textContent).toBe('Chapitre un');
  });

  it('imbrication : un répéteur dans un répéteur, $uid uniques', async () => {
    dispatchDataLoaded(
      'rep-questions',
      QUESTIONS.map((q) => ({ ...q, chapitre: 1 }))
    );
    dispatchDataLoaded('rep-chap', [{ chapitre: 1, nom: 'Chapitre un' }]);
    await mount(`
      <${REPEAT_TAG} source="rep-chap" key-field="chapitre">
        <template>
          <h2 id="{{$uid}}">{{nom}} ({{$key}})</h2>
          <dsfr-data-query id="qr-{{chapitre}}" source="rep-questions" where="chapitre:eq:{{chapitre}}"></dsfr-data-query>
          <${REPEAT_TAG} source="qr-{{chapitre}}" key-field="code">
            <template><p class="i" id="{{$uid}}">[{{libelle}}|{{code}}|{{$index}}]</p></template>
          </${REPEAT_TAG}>
        </template>
      </${REPEAT_TAG}>`);
    await tick(60);
    expect([...host.querySelectorAll('p.i')].map((e) => e.textContent)).toEqual([
      '[Question un|001|0]',
      '[Question deux|002|1]',
      '[Question trois|003|2]',
    ]);
    expect(host.querySelector('h2')?.textContent).toBe('Chapitre un (1)');
    const ids = [...host.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(host.querySelector('[id*="{{"]')).toBeNull();
  });

  it('$uid : unique sur deux répéteurs de la même page, sûr pour id=', async () => {
    dispatchDataLoaded('rep-questions', [{ code: 'a b/c' }, { code: 'x' }]);
    await mount(`
      <${REPEAT_TAG} source="rep-questions" key-field="code"><template><p id="{{$uid}}">1</p></template></${REPEAT_TAG}>
      <${REPEAT_TAG} source="rep-questions" key-field="code"><template><p id="{{$uid}}">2</p></template></${REPEAT_TAG}>`);
    await tick();
    const ids = [...host.querySelectorAll('p[id]')].map((p) => p.id);
    expect(ids.length).toBe(4);
    expect(new Set(ids).size).toBe(4);
    ids.forEach((id) => expect(id).toMatch(/^dsfr-repeat-\d+-[a-zA-Z0-9_-]+$/));
  });

  it("gabarit ajouté après la connexion et la donnée : rendu dès la fin de l'analyse (#894)", async () => {
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const rep = document.createElement(REPEAT_TAG) as DsfrDataRepeat;
    rep.setAttribute('source', 'rep-questions');
    host.appendChild(rep);
    dispatchDataLoaded('rep-questions', QUESTIONS);
    await tick();
    expect(rep.querySelectorAll('p').length).toBe(0);
    expect(rep.hasAttribute('data-dsfr-config-error')).toBe(false);
    const tpl = document.createElement('template');
    tpl.innerHTML = '<p>{{libelle}}</p>';
    rep.appendChild(tpl);
    readyState.mockReturnValue('interactive');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await tick();
    expect(rep.querySelectorAll('p').length).toBe(3);
  });
});

describe('template-clone (moteur de sortie par nœuds)', () => {
  it('renderTemplate escape:false rend du texte, {{{ }}} vaut {{ }}', () => {
    const item = { v: '<b>&</b>' };
    expect(renderTemplate('{{v}}', item)).toBe('&lt;b&gt;&amp;&lt;/b&gt;');
    expect(renderTemplate('{{v}}', item, { escape: false })).toBe('<b>&</b>');
    expect(renderTemplate('{{{v}}}', item, { escape: false })).toBe('<b>&</b>');
    expect(renderTemplate('{{{v}}}', item, { escape: false, raw: true })).toBe('<b>&</b>');
  });

  it('hasSplitBlock : un bloc complet dans le nœud non, une balise orpheline oui', () => {
    expect(hasSplitBlock('{{#if a}}oui{{/if}}')).toBe(false);
    expect(hasSplitBlock('{{#if a}}oui{{/if}}{{#unless a}}non{{/unless}}')).toBe(false);
    expect(hasSplitBlock('{{#if a}}')).toBe(true);
    expect(hasSplitBlock('{{/if}}')).toBe(true);
    expect(hasSplitBlock('{{#if a}}x{{/if}}{{/unless}}')).toBe(true);
    expect(hasSplitBlock('pas de bloc {{a}}')).toBe(false);
  });

  it('renderTemplateRow : les attributs sont résolus sur le clone, hors document, template intérieur intact', () => {
    const tpl = document.createElement('template');
    tpl.innerHTML =
      '<dsfr-data-query id="q-{{code}}" where="code:eq:{{code}}"></dsfr-data-query><template><i>{{inner}}</i></template>';
    const { fragment, bindings } = renderTemplateRow(tpl, { code: '007' }, { $index: () => '0' });
    const q = fragment.querySelector('dsfr-data-query')!;
    expect(q.isConnected).toBe(false);
    expect(q.id).toBe('q-007');
    expect(q.getAttribute('where')).toBe('code:eq:007');
    expect(fragment.querySelector('template')!.innerHTML).toBe('<i>{{inner}}</i>');
    expect(bindings.map((b) => (b.kind === 'attr' ? b.name : b.kind))).toEqual(['id', 'where']);
  });
});
