import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LitElement } from 'lit';
import { DataflowRecorder, formatTrace, snapshotGraph, summarizeTrace } from '@dsfr-data/shared';
import { SourceSubscriberMixin } from '@/utils/source-subscriber.js';
import { TransformerMixin } from '@/utils/transformer-mixin.js';
import {
  UNKNOWN_ATTRS_MARKER,
  checkUnknownAttributes,
  resetUnknownAttributeWarnings,
} from '@/utils/unknown-attributes.js';
import { clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';

/**
 * L'attribut inconnu du bundle CHARGE se voit (#727, volet 2).
 *
 * Le lint statique compare au manifeste du depot : il confirmera qu'un
 * attribut est valide, ce qui est vrai dans le depot et faux dans la page.
 * Seul `observedAttributes`, lu sur la classe reellement enregistree, dit ce
 * que la bibliotheque servie sait faire — c'est cette lecture-la qu'on
 * verrouille ici, avec son revers : ne rien dire sur les attributs
 * parfaitement legitimes qu'aucun composant ne declare jamais.
 */

class SondeAfficheur extends SourceSubscriberMixin(LitElement) {
  static properties = {
    source: { type: String },
    labelField: { type: String, attribute: 'label-field' },
  };
  protected createRenderRoot() {
    return this;
  }
}
customElements.define('sonde-afficheur-727', SondeAfficheur);

class SondeTuyau extends TransformerMixin(LitElement) {
  static properties = {
    source: { type: String },
    groupBy: { type: String, attribute: 'group-by' },
  };
  protected createRenderRoot() {
    return this;
  }
}
customElements.define('sonde-tuyau-727', SondeTuyau);

function poser(tag: string, attrs: Record<string, string>): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe('attribut inconnu de la version chargee', () => {
  let avertir: ReturnType<typeof vi.spyOn>;
  const aRetirer: HTMLElement[] = [];

  beforeEach(() => {
    resetUnknownAttributeWarnings();
    avertir = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    avertir.mockRestore();
    for (const el of aRetirer.splice(0)) el.remove();
    clearDataCache('sonde');
    clearDataMeta('sonde');
  });

  it('signale l’attribut inconnu, une seule fois, et pose le marqueur', () => {
    const un = poser('sonde-afficheur-727', { source: 'sonde', 'titre-field': 'nom' });
    const deux = poser('sonde-afficheur-727', { source: 'sonde', 'titre-field': 'autre' });
    aRetirer.push(un, deux);

    expect(un.getAttribute(UNKNOWN_ATTRS_MARKER)).toBe('titre-field');
    expect(deux.getAttribute(UNKNOWN_ATTRS_MARKER)).toBe('titre-field');

    const messages = (avertir.mock.calls as unknown[][]).map((c) => String(c[0]));
    const sur = messages.filter((m) => m.includes('titre-field'));
    expect(sur).toHaveLength(1);
    expect(sur[0]).toContain('inconnu de la version chargée');
  });

  it('ne signale pas un attribut que la classe chargee declare', () => {
    const el = poser('sonde-afficheur-727', { source: 'sonde', 'label-field': 'nom' });
    aRetirer.push(el);

    expect(el.hasAttribute(UNKNOWN_ATTRS_MARKER)).toBe(false);
    expect(avertir).not.toHaveBeenCalled();
  });

  it('ne signale aucun attribut legitime non declare', () => {
    // Attributs globaux du HTML, ARIA, gestionnaires en ligne, et directives
    // des frameworks hotes qui SURVIVENT dans le DOM (Vue in-DOM, Angular,
    // Alpine, htmx, Svelte, Astro, Angular encapsulation).
    const el = poser('sonde-afficheur-727', {
      source: 'sonde',
      id: 'x1',
      class: 'fr-col',
      style: 'color:red',
      slot: 'contenu',
      hidden: '',
      title: 'infobulle',
      lang: 'fr',
      dir: 'ltr',
      role: 'img',
      tabindex: '0',
      part: 'racine',
      exportparts: 'racine',
      inert: '',
      popover: 'auto',
      translate: 'no',
      'aria-label': 'Carte',
      'data-fr-js': 'true',
      onclick: 'return false',
      '@click': 'ouvrir()',
      ':titre': 'x',
      '.prop': 'x',
      '?attr': 'x',
      'v-if': 'ok',
      'x-data': '{}',
      'hx-get': '/x',
      'ng-if': 'ok',
      '[valeur]': 'x',
      '(clic)': 'f()',
      '*ngIf': 'ok',
      '#ref': '',
      '_ngcontent-c0': '',
      'bind:value': 'v',
      'on:click': 'f',
      'use:action': '',
      'class:actif': 'vrai',
      'client:load': '',
      'wire:model': 'x',
    });
    aRetirer.push(el);

    expect(el.getAttribute(UNKNOWN_ATTRS_MARKER)).toBeNull();
    expect(avertir).not.toHaveBeenCalled();
  });

  it('vaut aussi pour un transformateur', () => {
    const el = poser('sonde-tuyau-727', { id: 'sonde-t', source: 'sonde', 'grup-by': 'dept' });
    aRetirer.push(el);

    expect(el.getAttribute(UNKNOWN_ATTRS_MARKER)).toBe('grup-by');
  });

  it('se tait sur une classe qui ne declare aucun attribut', () => {
    class Muette extends LitElement {}
    customElements.define('sonde-muette-727', Muette);
    const el = poser('sonde-muette-727', { 'nimporte-quoi': 'x' });
    aRetirer.push(el);

    expect(checkUnknownAttributes(el)).toEqual([]);
    expect(el.hasAttribute(UNKNOWN_ATTRS_MARKER)).toBe(false);
  });

  it('remonte dans le graphe, la trace et le compte d’alertes', () => {
    // Le marqueur porte le meme nom de balise qu'un vrai composant : c'est
    // `snapshotGraph` qui doit le relire, quel que soit l'element.
    const host = document.createElement('div');
    host.innerHTML =
      '<dsfr-data-chart id="c1" source="src" label-field="nom"' +
      ' data-dsfr-unknown-attrs="titre-field, couleur-champ"></dsfr-data-chart>';
    document.body.appendChild(host);
    aRetirer.push(host);

    const node = snapshotGraph(document.body).nodes.find((n) => n.id === 'c1');
    expect(node?.unknownAttrs).toEqual(['titre-field', 'couleur-champ']);

    const recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    const t = recorder.snapshot();
    recorder.stop();

    const texte = formatTrace(t);
    expect(texte).toContain('2 attributs inconnus de la version chargée');
    expect(texte).toContain('titre-field, couleur-champ');
    expect(summarizeTrace(t).alerts).toBeGreaterThanOrEqual(2);
  });
});
