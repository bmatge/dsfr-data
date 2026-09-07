import { describe, it, expect } from 'vitest';
import { lintMarkup, formatLintFindings, lireBalises } from '@dsfr-data/shared';
import type { ComponentContract } from '@dsfr-data/shared';

/**
 * Analyse STATIQUE d'un balisage (#608).
 *
 * Complementaire du collecteur : elle lit du code sans rien executer. Moins
 * riche — elle ne verra jamais qu'une source renvoie zero ligne — mais
 * utilisable la ou le code vit, dans un editeur, via le serveur MCP.
 *
 * Principe directeur teste ici : ne rendre QUE ce qui est certain. Un linter
 * qui crie au loup apprend a etre ignore, et celui-ci s'adresse autant a un
 * agent qu'a un humain.
 */

const CONTRAT: ComponentContract = {
  'dsfr-data-source': {
    attributes: ['api-type', 'base-url', 'dataset-id', 'url', 'where', 'group-by'],
    deprecated: { 'server-side': 'la pagination serveur se configure autrement' },
  },
  'dsfr-data-query': { attributes: ['source', 'group-by', 'aggregate', 'order-by', 'filter'] },
  'dsfr-data-join': { attributes: ['left', 'right', 'on', 'type'] },
  'dsfr-data-chart': { attributes: ['source', 'type', 'label-field', 'value-field'] },
};

describe('lireBalises', () => {
  it('relève les balises dsfr-data et leurs attributs', () => {
    const balises = lireBalises(
      `<div><dsfr-data-source id="s" api-type="tabular"></dsfr-data-source>
       <dsfr-data-chart id="c" source="s" type='bar'></dsfr-data-chart></div>`
    );

    expect(balises.map((b) => b.tag)).toEqual(['dsfr-data-source', 'dsfr-data-chart']);
    expect(balises[0].attrs).toEqual({ id: 's', 'api-type': 'tabular' });
    expect(balises[1].attrs.type).toBe('bar');
  });

  it('ignore les balises qui ne sont pas des composants', () => {
    expect(lireBalises('<div><p>texte</p><span data-x="1"></span></div>')).toEqual([]);
  });

  it('gère un attribut booléen sans valeur', () => {
    expect(lireBalises('<dsfr-data-source id="s" paginate></dsfr-data-source>')[0].attrs).toEqual({
      id: 's',
      paginate: '',
    });
  });
});

describe('lintMarkup', () => {
  const messages = (html: string) =>
    lintMarkup(html, CONTRAT)
      .map((f) => f.message)
      .join(' | ');

  it('ne signale rien sur un balisage correct', () => {
    const findings = lintMarkup(
      `<dsfr-data-source id="s" api-type="tabular"></dsfr-data-source>
       <dsfr-data-chart id="c" source="s" type="bar"></dsfr-data-chart>`,
      CONTRAT
    );

    expect(findings).toEqual([]);
  });

  it('attrape l’attribut inconnu — la faute la plus silencieuse', () => {
    // Un attribut mal orthographie est simplement ignore : aucune erreur,
    // aucun effet, et l'integrateur cherche ailleurs pendant une heure.
    expect(messages(`<dsfr-data-source id="s" datasetid="x"></dsfr-data-source>`)).toContain(
      'Attribut inconnu "datasetid"'
    );
  });

  it('suggère l’attribut proche quand il y en a un', () => {
    expect(messages(`<dsfr-data-source id="s" dataset-i="x"></dsfr-data-source>`)).toContain(
      'dataset-id'
    );
  });

  it('signale un attribut déprécié avec la conduite à tenir', () => {
    const findings = lintMarkup(
      `<dsfr-data-source id="s" server-side></dsfr-data-source>`,
      CONTRAT
    );

    expect(findings[0].severity).toBe('avertissement');
    expect(findings[0].message).toContain('a ete retire');
  });

  it('signale un composant qui réémet sans id', () => {
    // Sans id, rien ne parvient a l'aval — et rien ne le dit.
    expect(messages(`<dsfr-data-query source="s"></dsfr-data-query>`)).toContain(
      'Attribut "id" manquant'
    );
  });

  it('signale un amont déclaré mais absent', () => {
    expect(messages(`<dsfr-data-chart id="c" source="fantome"></dsfr-data-chart>`)).toContain(
      "n'existe pas dans ce code"
    );
  });

  it('signale les deux amonts manquants d’un join', () => {
    expect(messages(`<dsfr-data-join id="j" left="a"></dsfr-data-join>`)).toContain(
      'exige "left" ET "right"'
    );
  });

  it('signale un id dupliqué', () => {
    // Deux composants sous le meme id s'ecrasent mutuellement dans le cache.
    expect(
      messages(`<dsfr-data-query id="q" source="s"></dsfr-data-query>
                <dsfr-data-query id="q" source="s"></dsfr-data-query>`)
    ).toContain('declare plusieurs fois');
  });

  it('signale une balise inconnue et liste les balises valides', () => {
    const msg = messages(`<dsfr-data-graphique id="g"></dsfr-data-graphique>`);

    expect(msg).toContain('Balise inconnue');
    expect(msg).toContain('dsfr-data-chart');
  });

  it('ne signale ni class, ni style, ni data-*', () => {
    // Un linter qui crie au loup apprend a etre ignore.
    expect(
      lintMarkup(
        `<dsfr-data-source id="s" class="x" style="color:red" data-test="1"></dsfr-data-source>`,
        CONTRAT
      )
    ).toEqual([]);
  });

  it('ne signale pas la syntaxe de liaison des frameworks', () => {
    expect(
      lintMarkup(
        `<dsfr-data-source id="s"></dsfr-data-source>
         <dsfr-data-chart id="c" source="s" :type="t" @click="f"></dsfr-data-chart>`,
        CONTRAT
      )
    ).toEqual([]);
  });

  it('le dit quand il n’y a rien à analyser', () => {
    expect(messages('<div><p>bonjour</p></div>')).toContain('Aucune balise dsfr-data');
  });
});

describe('formatLintFindings', () => {
  it('ne promet pas plus que ce que l’analyse statique peut voir', () => {
    // Honnetete du diagnostic : « rien detecte » ne veut pas dire « ca marche ».
    const texte = formatLintFindings([]);

    expect(texte).toContain('aucun probleme detecte');
    expect(texte).toContain('ne garantit pas');
  });

  it('sépare erreurs et avertissements, et renvoie vers l’exécution', () => {
    const texte = formatLintFindings(
      lintMarkup(`<dsfr-data-source id="s" inconnu="x" server-side></dsfr-data-source>`, CONTRAT)
    );

    expect(texte).toContain('1 erreur(s), 1 avertissement(s)');
    expect(texte.indexOf('ERREUR')).toBeLessThan(texte.indexOf('ATTENTION'));
    expect(texte).toContain('volet Diagnostic');
  });
});
