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

describe('les valeurs d’attribut contenant « > » — syntaxe ODSQL officielle', () => {
  it('ne tronque pas une balise sur un « > » entre guillemets', () => {
    // `where="population > 5000"` est documente tel quel dans
    // skills/dsfr-data/references/dsfr-data-query.md. Un motif [^>]* s'y
    // arreterait, perdrait les attributs suivants, et le linter signalerait
    // un id manquant sur du code parfaitement valide.
    const balises = lireBalises(
      `<dsfr-data-source where="population > 5000" id="src" api-type="tabular"></dsfr-data-source>`
    );

    expect(balises).toHaveLength(1);
    expect(balises[0].attrs.where).toBe('population > 5000');
    expect(balises[0].attrs.id).toBe('src');
    expect(balises[0].attrs['api-type']).toBe('tabular');
  });

  it('ne produit AUCUN faux diagnostic sur ce balisage', () => {
    // Le docstring du module promet « au pire une balise n'est pas analysee,
    // jamais un faux diagnostic ». Ce test le verrouille.
    const findings = lintMarkup(
      `<dsfr-data-source where="population > 5000" id="src"></dsfr-data-source>
       <dsfr-data-chart id="c" source="src" type="bar"></dsfr-data-chart>`,
      CONTRAT
    );

    expect(findings).toEqual([]);
  });

  it('gère plusieurs « > » et des guillemets simples', () => {
    const balises = lireBalises(
      `<dsfr-data-query id="q" source="src" filter='a > 1, b > 2'></dsfr-data-query>`
    );

    expect(balises[0].attrs.filter).toBe('a > 1, b > 2');
    expect(balises[0].attrs.id).toBe('q');
  });

  it('n’avale plus les attributs qui suivent', () => {
    // Avant : `group-by` etait perdu en silence sur l'extrait officiel.
    const balises = lireBalises(
      `<dsfr-data-query id="q" where="pop > 10" group-by="region"></dsfr-data-query>`
    );

    expect(balises[0].attrs['group-by']).toBe('region');
  });
});

describe('robustesse du scan de balises (N1, N2)', () => {
  it('survit à un caractère dont la minuscule change de longueur', () => {
    // `html.toLowerCase()` n'a pas la meme longueur que `html` quand un
    // caractere change de taille en minuscule (İ -> i̇, deux points de code).
    // Chercher dans la version minuscule puis decouper l'ORIGINALE decalait
    // les index et tronquait les balises : « Balise inconnue » sur du code
    // parfaitement valide.
    const html = `<p title="İ"></p>
      <dsfr-data-source id="s" url="/x"></dsfr-data-source>
      <dsfr-data-query id="q" source="s"></dsfr-data-query>`;

    const balises = lireBalises(html);

    expect(balises.map((b) => b.tag)).toEqual(['dsfr-data-source', 'dsfr-data-query']);
    expect(lintMarkup(html, CONTRAT)).toEqual([]);
  });

  it('reconnaît les balises quelle que soit la casse', () => {
    expect(lireBalises('<DSFR-DATA-SOURCE id="s"></DSFR-DATA-SOURCE>')[0].tag).toBe(
      'dsfr-data-source'
    );
  });

  it('reste linéaire — un gros document ne doit pas exploser', () => {
    // Le parcours etait quadratique : `toLowerCase()` du document entier a
    // chaque tour. Ce module tourne cote serveur MCP sur du HTML recu de
    // l'exterieur, le cout doit rester borne.
    const balise = '<dsfr-data-source id="s" url="/x"></dsfr-data-source>\n';
    const mesurer = (n: number) => {
      const html = balise.repeat(n);
      const t0 = performance.now();
      lireBalises(html);
      return performance.now() - t0;
    };

    mesurer(500); // chauffe
    const petit = Math.max(mesurer(1000), 0.5);
    const grand = mesurer(4000);

    // Quadratique : x4 d'entree -> x16 de temps. Lineaire : ~x4. On laisse
    // une marge large pour ne pas rendre le test instable en CI.
    expect(grand / petit).toBeLessThan(10);
  });

  it('n’est pas troublé par un « < » dans une valeur', () => {
    const balises = lireBalises(`<dsfr-data-query id="q" filter="a < 5"></dsfr-data-query>`);

    expect(balises).toHaveLength(1);
    expect(balises[0].attrs.filter).toBe('a < 5');
  });
});
