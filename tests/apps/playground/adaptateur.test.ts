/**
 * Adaptateur de révélation du Playground (#1009) : repères de CODE (ligne,
 * balise, attribut → curseur + marque CodeMirror) et repères d'INTERFACE
 * (registre généré → volet, éditeur, barre d'actions).
 *
 * CodeMirror 5 est un global chargé par <script> : on le remplace par un faux
 * éditeur qui enregistre curseur, marques et défilement.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  CLASSE_MARQUE_CODE,
  creerAdaptateurPlayground,
  effacerMarqueCode,
  estRepereCode,
  lireRepereCode,
  montrerCode,
  plageAttribut,
  repereCodeVersId,
} from '../../../apps/playground/src/assistant/adaptateur';
import { REGISTRE, REPERES } from '../../../apps/playground/src/assistant/reperes.generated';
import type { CodeMirrorEditor, PositionCode } from '../../../apps/playground/src/editor';
import { montrer } from '@dsfr-data/shared';

interface Marque {
  de: PositionCode;
  a: PositionCode;
  className: string;
  effacee: boolean;
}

interface FauxEditeur extends CodeMirrorEditor {
  marques: Marque[];
  curseur: PositionCode | null;
  defile: PositionCode | null;
  modifier(code: string): void;
}

function fauxEditeur(code: string): FauxEditeur {
  let texte = code;
  const lignes = () => texte.split('\n');
  const auChangement: (() => void)[] = [];
  const wrapper = document.createElement('div');
  wrapper.className = 'CodeMirror';
  const ed: FauxEditeur = {
    marques: [],
    curseur: null,
    defile: null,
    getValue: () => texte,
    setValue: (v: string) => ed.modifier(v),
    modifier(v: string) {
      texte = v;
      auChangement.forEach((f) => f());
    },
    on(evenement: string, handler: (cm: CodeMirrorEditor, e: KeyboardEvent) => void) {
      // Le vrai `change` passe (cm, changement) ; l'adaptateur n'en lit rien.
      if (evenement === 'change') auChangement.push(() => handler(ed, new KeyboardEvent('keyup')));
    },
    setSize: () => undefined,
    getWrapperElement: () => wrapper,
    getScrollerElement: () => wrapper,
    refresh: () => undefined,
    lineCount: () => lignes().length,
    getLine: (n: number) => lignes()[n] ?? '',
    setCursor(pos: PositionCode) {
      ed.curseur = pos;
    },
    markText(de: PositionCode, a: PositionCode, options: { className: string }) {
      const m: Marque = { de, a, className: options.className, effacee: false };
      ed.marques.push(m);
      return {
        clear() {
          m.effacee = true;
        },
      };
    },
    scrollIntoView(pos: PositionCode) {
      ed.defile = pos;
    },
  };
  return ed;
}

const CODE = [
  '<dsfr-data-source id="s" api-type="tabular"></dsfr-data-source>',
  '<dsfr-data-query id="q"',
  '  data-source="x"',
  '  source="absent"',
  '  group-by="region">',
  '</dsfr-data-query>',
  '<dsfr-data-chart source="q" typo="1" type="bar"></dsfr-data-chart>',
].join('\n');

const actives = (ed: FauxEditeur) => ed.marques.filter((m) => !m.effacee);

describe('repères de code : sérialisation', () => {
  it('aller-retour avec et sans attribut', () => {
    const avec = { ligne: 12, tag: 'dsfr-data-query', attribut: 'group-by' };
    const id = repereCodeVersId(avec);
    expect(id).toBe('playground.ligne.12.dsfr-data-query.group-by');
    expect(lireRepereCode(id!)).toEqual(avec);
    const sans = { ligne: 3, tag: 'dsfr-data-map-layer' };
    expect(lireRepereCode(repereCodeVersId(sans)!)).toEqual(sans);
  });

  it('refuse une ligne invalide et une balise non représentable', () => {
    expect(repereCodeVersId({ ligne: 0, tag: 'dsfr-data-query' })).toBeNull();
    expect(repereCodeVersId({ ligne: 1.5, tag: 'dsfr-data-query' })).toBeNull();
    expect(repereCodeVersId({ ligne: 2, tag: '-' })).toBeNull();
    expect(repereCodeVersId({ ligne: 2, tag: 'DSFR"x' })).toBeNull();
  });

  it('omet un attribut hors grammaire mais garde la ligne', () => {
    expect(repereCodeVersId({ ligne: 4, tag: 'dsfr-data-query', attribut: 'foo_bar' })).toBe(
      'playground.ligne.4.dsfr-data-query'
    );
  });

  it('lireRepereCode refuse tout autre identifiant', () => {
    for (const id of [
      'playground.editeur.code',
      'playground.ligne.0.dsfr-data-query',
      'playground.ligne.01.dsfr-data-query',
      'playground.ligne.x.dsfr-data-query',
      'playground.ligne.3',
      'playground.ligne.3.a.b.c',
      'playground.ligne.3.-a',
      'builder.ligne.3.dsfr-data-query',
      '[data-repere]',
    ]) {
      expect(lireRepereCode(id), id).toBeNull();
      expect(estRepereCode(id)).toBe(false);
    }
  });

  it('aucun repère de code ne collisionne avec le registre', () => {
    expect(REPERES.some((r) => r.id.startsWith('playground.ligne'))).toBe(false);
  });
});

describe('plageAttribut', () => {
  it('couvre le nom et la valeur entre guillemets', () => {
    const t = '<x source="q" typo="1">';
    expect(plageAttribut(t, 'typo')).toEqual({ debut: 14, fin: 22 });
    expect(t.slice(14, 22)).toBe('typo="1"');
  });

  it('ne confond pas data-source ni sources avec source', () => {
    expect(plageAttribut('<x data-source="a" sources="b">', 'source')).toBeNull();
    expect(plageAttribut('<x data-source="a" source="b">', 'source')).toEqual({
      debut: 19,
      fin: 29,
    });
  });

  it('attribut booléen et valeur nue', () => {
    expect(plageAttribut('<x paginate>', 'paginate')).toEqual({ debut: 3, fin: 11 });
    expect(plageAttribut('<x limit=10 y>', 'limit')).toEqual({ debut: 3, fin: 11 });
  });
});

describe('montrerCode : la marque est posée sur la bonne ligne', () => {
  it('ligne entière sans attribut, curseur et défilement au début', () => {
    const ed = fauxEditeur(CODE);
    const r = montrerCode(ed, { ligne: 2, tag: 'dsfr-data-query' });
    expect(r.ok).toBe(true);
    const [m] = actives(ed);
    expect(m.className).toBe(CLASSE_MARQUE_CODE);
    expect(m.de).toEqual({ line: 1, ch: 0 });
    expect(m.a).toEqual({ line: 1, ch: CODE.split('\n')[1].length });
    expect(ed.curseur).toEqual({ line: 1, ch: 0 });
    expect(ed.defile).toEqual({ line: 1, ch: 0 });
  });

  it('attribut sur une ligne suivante d’une balise multi-ligne : il est couvert', () => {
    const ed = fauxEditeur(CODE);
    const r = montrerCode(ed, { ligne: 2, tag: 'dsfr-data-query', attribut: 'source' });
    expect(r.attributTrouve).toBe(true);
    const [m] = actives(ed);
    // Ligne 4 (index 3), pas `data-source` de la ligne 3.
    expect(m.de).toEqual({ line: 3, ch: 2 });
    expect(CODE.split('\n')[3].slice(m.de.ch, m.a.ch)).toBe('source="absent"');
    expect(ed.curseur).toEqual({ line: 3, ch: 2 });
  });

  it('attribut sur la ligne de la balise, cherché après son nom', () => {
    const ed = fauxEditeur(CODE);
    montrerCode(ed, { ligne: 7, tag: 'dsfr-data-chart', attribut: 'typo' });
    const [m] = actives(ed);
    expect(m.de.line).toBe(6);
    expect(CODE.split('\n')[6].slice(m.de.ch, m.a.ch)).toBe('typo="1"');
  });

  it('attribut introuvable : la ligne est marquée', () => {
    const ed = fauxEditeur(CODE);
    const r = montrerCode(ed, { ligne: 1, tag: 'dsfr-data-source', attribut: 'absent' });
    expect(r.attributTrouve).toBe(false);
    expect(actives(ed)[0].de).toEqual({ line: 0, ch: 0 });
  });

  it('une seule marque à la fois, retirée au changement du code', () => {
    const ed = fauxEditeur(CODE);
    montrerCode(ed, { ligne: 1, tag: 'dsfr-data-source' });
    montrerCode(ed, { ligne: 7, tag: 'dsfr-data-chart' });
    expect(actives(ed)).toHaveLength(1);
    expect(actives(ed)[0].de.line).toBe(6);
    ed.modifier(CODE + '\n');
    expect(actives(ed)).toHaveLength(0);
    montrerCode(ed, { ligne: 1, tag: 'dsfr-data-source' });
    effacerMarqueCode(ed);
    expect(actives(ed)).toHaveLength(0);
  });

  it('ligne hors du code : rien n’est marqué', () => {
    const ed = fauxEditeur(CODE);
    expect(montrerCode(ed, { ligne: 99, tag: 'dsfr-data-source' }).ok).toBe(false);
    expect(ed.marques).toHaveLength(0);
    expect(ed.curseur).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Repères d'interface : le vrai index.html
// ---------------------------------------------------------------------------

const RACINE = resolve(import.meta.dirname, '../../..');

function corpsIndex(): string {
  const html = readFileSync(join(RACINE, 'apps/playground/index.html'), 'utf-8');
  const ouverture = html.indexOf('>', html.indexOf('<body')) + 1;
  let corps = html.slice(ouverture, html.indexOf('</body>'));
  for (let debut = corps.indexOf('<script'); debut !== -1; debut = corps.indexOf('<script')) {
    const fin = corps.indexOf('</script>', debut);
    corps = corps.slice(0, debut) + corps.slice(fin + '</script>'.length);
  }
  return corps;
}

describe('repères d’interface : reveler()', () => {
  let ed: FauxEditeur;

  beforeEach(() => {
    document.body.innerHTML = corpsIndex();
    ed = fauxEditeur(CODE);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('chaque repère du registre est posé une fois dans index.html', () => {
    for (const r of REPERES) {
      const attr = r.genre === 'zone' ? 'data-zone' : 'data-repere';
      expect(document.querySelectorAll(`[${attr}="${r.id}"]`), r.id).toHaveLength(1);
    }
  });

  it('un contrôle du volet fermé (inert) : le volet est ouvert d’abord', async () => {
    const ouvrirVolet = vi.fn(() => {
      document.getElementById('volet-exemples')!.removeAttribute('inert');
    });
    const adaptateur = creerAdaptateurPlayground(ed, { ouvrirVolet });
    const el = await adaptateur.reveler('playground.exemples.source');
    expect(ouvrirVolet).toHaveBeenCalledTimes(1);
    expect(el?.id).toBe('filtre-source');
  });

  it('le volet fermé et non ouvrable : null, pas un contrôle invisible', async () => {
    const adaptateur = creerAdaptateurPlayground(ed, { ouvrirVolet: () => undefined });
    expect(await adaptateur.reveler('playground.exemples.exemple')).toBeNull();
  });

  it('sans ouvrirVolet : clic sur la bascule de la barre', async () => {
    const bascule = document.getElementById('volet-btn')!;
    bascule.addEventListener('click', () =>
      document.getElementById('volet-exemples')!.removeAttribute('inert')
    );
    const adaptateur = creerAdaptateurPlayground(ed);
    expect((await adaptateur.reveler('playground.exemples.voir'))?.id).toBe('voir-exemple-btn');
  });

  it('l’éditeur : le rendu CodeMirror, pas le textarea masqué', async () => {
    const adaptateur = creerAdaptateurPlayground(ed);
    expect(await adaptateur.reveler('playground.editeur.code')).toBe(ed.getWrapperElement());
  });

  it('cibles de la visite guidée : bascule, éditeur, Exécuter, aperçu', async () => {
    const adaptateur = creerAdaptateurPlayground(ed);
    expect((await adaptateur.reveler('playground.actions.exemples'))?.id).toBe('volet-btn');
    expect(
      (await adaptateur.reveler('playground.editeur'))?.querySelector('#code-editor')
    ).not.toBeNull();
    expect((await adaptateur.reveler('playground.actions.executer'))?.id).toBe('run-btn');
    expect(
      (await adaptateur.reveler('playground.apercu'))?.querySelector('#preview-frame')
    ).not.toBeNull();
  });

  it('un repère de code passé à reveler est montré dans l’éditeur', async () => {
    const adaptateur = creerAdaptateurPlayground(ed);
    const el = await adaptateur.reveler('playground.ligne.7.dsfr-data-chart.typo');
    expect(el).toBe(ed.getWrapperElement());
    expect(actives(ed)[0].de.line).toBe(6);
  });

  it('identifiant hors grammaire ou inconnu : null', async () => {
    const adaptateur = creerAdaptateurPlayground(ed);
    expect(await adaptateur.reveler('"]<x')).toBeNull();
    expect(await adaptateur.reveler('playground.actions.inexistant')).toBeNull();
  });

  it('montrer() de bout en bout : chemin annoncé, code inchangé', async () => {
    const adaptateur = creerAdaptateurPlayground(ed);
    const r = await montrer('playground.actions.executer', {
      registre: REGISTRE,
      adaptateur,
      mode: 'dire',
    });
    expect(r.ok).toBe(true);
    expect(r.chemin).toEqual(["Barre d'actions", 'Exécuter']);
    expect(ed.getValue()).toBe(CODE);
    expect(adaptateur.etat()).toEqual({ code: CODE });
  });

  it('onEtatChange suit les modifications du code et se désabonne', () => {
    const adaptateur = creerAdaptateurPlayground(ed);
    const cb = vi.fn();
    const stop = adaptateur.onEtatChange!(cb);
    ed.modifier('<p></p>');
    expect(cb).toHaveBeenCalledTimes(1);
    stop();
    ed.modifier('<div></div>');
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('mise en page de la zone éditeur', () => {
  it('la zone relaie le flex de la colonne vers CodeMirror', () => {
    const css = readFileSync(join(RACINE, 'apps/playground/src/styles/playground.css'), 'utf-8');
    const debut = css.indexOf('.pg-editeur {');
    expect(debut).toBeGreaterThan(-1);
    const corps = css.slice(debut, css.indexOf('}', debut));
    expect(corps).toMatch(/display:\s*flex/);
    expect(corps).toMatch(/flex-direction:\s*column/);
    expect(corps).toMatch(/min-height:\s*0/);
  });
});
