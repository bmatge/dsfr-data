import { describe, it, expect } from 'vitest';
import { lintMarkup, formatLintFindings, lireBalises } from '@dsfr-data/shared';
import type { ComponentContract } from '@dsfr-data/shared';
import { COMPONENT_CONTRACT } from '../../mcp-server/src/component-contract.generated.js';

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

/**
 * Regles cartographiques (#995, ADR-143) : ce qui se voit dans le balisage
 * d'une carte sans l'executer. Le contrat est le VRAI, genere depuis le
 * manifeste : si un attribut de dsfr-data-map-layer change de nom, ces tests
 * le disent (un exemple « correct » se mettrait a signaler un attribut inconnu).
 *
 * Une table par regle : chaque ligne donne un balisage et dit si le constat
 * est attendu. Les constats portent un code `regle` stable, lu par le moteur
 * de constats (#996).
 */
describe('lintMarkup — règles cartographiques', () => {
  const CONTRAT_REEL = COMPONENT_CONTRACT as unknown as ComponentContract;
  const SOURCE = '<dsfr-data-source id="s" url="/x"></dsfr-data-source>';
  const carte = (interieur: string) => `${SOURCE}<dsfr-data-map>${interieur}</dsfr-data-map>`;
  const regles = (html: string) =>
    lintMarkup(html, CONTRAT_REEL)
      .map((f) => f.regle)
      .filter((r): r is string => !!r);

  interface Cas {
    nom: string;
    html: string;
    attendu: boolean;
  }
  const verifier = (regle: string, cas: Cas[]) => {
    it.each(cas)('$nom', ({ html, attendu }) => {
      expect(regles(html).includes(regle)).toBe(attendu);
    });
  };

  it('un balisage de carte correct ne produit aucun constat', () => {
    const html = carte(
      `<dsfr-data-map-layer id="l" source="s" lat-field="lat" lon-field="lon" max-items="1000" popup-fields="nom"></dsfr-data-map-layer>
       <dsfr-data-map-popup for="l" mode="panel-right"><template>{{nom}}</template></dsfr-data-map-popup>`
    );
    expect(lintMarkup(html, CONTRAT_REEL)).toEqual([]);
  });

  it('le constat porte la balise, l’id, la sévérité et le code de règle', () => {
    const [f] = lintMarkup(
      `${SOURCE}<dsfr-data-map></dsfr-data-map><dsfr-data-map-layer id="l" source="s" geo-field="g"></dsfr-data-map-layer>`,
      CONTRAT_REEL
    );
    expect(f).toEqual({
      severity: 'erreur',
      tag: 'dsfr-data-map-layer',
      id: 'l',
      message: expect.stringContaining('<dsfr-data-map>'),
      regle: 'carte/couche-hors-carte',
    });
  });

  it('les règles historiques ne portent pas de code', () => {
    const [f] = lintMarkup('<dsfr-data-query></dsfr-data-query>', CONTRAT_REEL);
    expect(f.regle).toBeUndefined();
  });

  describe('carte/couche-hors-carte', () => {
    verifier('carte/couche-hors-carte', [
      {
        nom: 'couche sans carte',
        html: `${SOURCE}<dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer>`,
        attendu: true,
      },
      {
        nom: 'couche après la fermeture de la carte',
        html: `${SOURCE}<dsfr-data-map></dsfr-data-map><dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer>`,
        attendu: true,
      },
      {
        nom: 'couche dans la carte, même à travers un div',
        html: carte(
          '<div><dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer></div>'
        ),
        attendu: false,
      },
      {
        nom: 'couche dans la carte d’un encart',
        html: carte(
          '<dsfr-data-map-inset><dsfr-data-map><dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer></dsfr-data-map></dsfr-data-map-inset>'
        ),
        attendu: false,
      },
      {
        nom: 'carte jamais fermée (fragment) : la couche est dedans',
        html: `${SOURCE}<dsfr-data-map><dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer>`,
        attendu: false,
      },
    ]);

    it('erreur si une carte existe ailleurs, avertissement si le code n’en a aucune (extrait)', () => {
      const gravite = (html: string) =>
        lintMarkup(html, CONTRAT_REEL).find((f) => f.regle === 'carte/couche-hors-carte')?.severity;
      const couche = '<dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer>';
      expect(gravite(`${SOURCE}<dsfr-data-map></dsfr-data-map>${couche}`)).toBe('erreur');
      expect(gravite(`${SOURCE}${couche}`)).toBe('avertissement');
    });
  });

  describe('carte/lat-sans-lon', () => {
    verifier('carte/lat-sans-lon', [
      {
        nom: 'lat-field seul',
        html: carte('<dsfr-data-map-layer source="s" lat-field="lat"></dsfr-data-map-layer>'),
        attendu: true,
      },
      {
        nom: 'lon-field seul, même avec geo-field',
        html: carte(
          '<dsfr-data-map-layer source="s" lon-field="lon" geo-field="g"></dsfr-data-map-layer>'
        ),
        attendu: true,
      },
      {
        nom: 'lat-field renseigné, lon-field vide',
        html: carte(
          '<dsfr-data-map-layer source="s" lat-field="lat" lon-field=""></dsfr-data-map-layer>'
        ),
        attendu: true,
      },
      {
        nom: 'les deux',
        html: carte(
          '<dsfr-data-map-layer source="s" lat-field="lat" lon-field="lon"></dsfr-data-map-layer>'
        ),
        attendu: false,
      },
    ]);
  });

  describe('carte/geoshape-sans-geo-field', () => {
    verifier('carte/geoshape-sans-geo-field', [
      {
        nom: 'geoshape sans geo-field',
        html: carte('<dsfr-data-map-layer source="s" type="geoshape"></dsfr-data-map-layer>'),
        attendu: true,
      },
      {
        nom: 'geoshape avec seulement lat/lon (ignorés par geoshape)',
        html: carte(
          '<dsfr-data-map-layer source="s" type="geoshape" lat-field="a" lon-field="b"></dsfr-data-map-layer>'
        ),
        attendu: true,
      },
      {
        nom: 'geoshape avec geo-field',
        html: carte(
          '<dsfr-data-map-layer source="s" type="geoshape" geo-field="geo_shape"></dsfr-data-map-layer>'
        ),
        attendu: false,
      },
    ]);
  });

  describe('carte/sans-coordonnees (avertissement : la couche devine geo_point_2d…)', () => {
    verifier('carte/sans-coordonnees', [
      {
        nom: 'marqueurs sans aucun champ géographique',
        html: carte('<dsfr-data-map-layer source="s"></dsfr-data-map-layer>'),
        attendu: true,
      },
      {
        nom: 'heatmap sans aucun champ géographique',
        html: carte('<dsfr-data-map-layer source="s" type="heatmap"></dsfr-data-map-layer>'),
        attendu: true,
      },
      {
        nom: 'geo-field posé',
        html: carte('<dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer>'),
        attendu: false,
      },
      {
        nom: 'lat-field seul : déjà signalé par lat-sans-lon, pas en double',
        html: carte('<dsfr-data-map-layer source="s" lat-field="lat"></dsfr-data-map-layer>'),
        attendu: false,
      },
    ]);

    it('est un avertissement, pas une erreur', () => {
      const f = lintMarkup(
        carte('<dsfr-data-map-layer source="s"></dsfr-data-map-layer>'),
        CONTRAT_REEL
      ).find((x) => x.regle === 'carte/sans-coordonnees');
      expect(f?.severity).toBe('avertissement');
    });
  });

  describe('carte/max-items-invalide', () => {
    const couche = (v: string) =>
      carte(
        `<dsfr-data-map-layer source="s" geo-field="g" max-items="${v}"></dsfr-data-map-layer>`
      );
    verifier('carte/max-items-invalide', [
      { nom: 'texte', html: couche('beaucoup'), attendu: true },
      { nom: 'vide', html: couche(''), attendu: true },
      { nom: 'unité collée', html: couche('500px'), attendu: true },
      { nom: 'nombre', html: couche('20000'), attendu: false },
      { nom: 'nombre entouré d’espaces', html: couche(' 1000 '), attendu: false },
      { nom: 'zéro : relève de max-items-nul', html: couche('0'), attendu: false },
    ]);
  });

  describe('carte/max-items-nul (avertissement)', () => {
    const couche = (v: string) =>
      carte(
        `<dsfr-data-map-layer source="s" geo-field="g" max-items="${v}"></dsfr-data-map-layer>`
      );
    verifier('carte/max-items-nul', [
      { nom: 'zéro', html: couche('0'), attendu: true },
      { nom: 'négatif', html: couche('-1'), attendu: true },
      { nom: 'positif', html: couche('1'), attendu: false },
      {
        nom: 'absent (défaut 5000)',
        html: carte('<dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer>'),
        attendu: false,
      },
    ]);
  });

  describe('carte/popup-sans-effet (avertissement)', () => {
    verifier('carte/popup-sans-effet', [
      {
        nom: 'popup-fields sur un geoshape no-interactive',
        html: carte(
          '<dsfr-data-map-layer source="s" type="geoshape" geo-field="g" no-interactive popup-fields="nom"></dsfr-data-map-layer>'
        ),
        attendu: true,
      },
      {
        nom: 'tooltip-field sur des cercles no-interactive',
        html: carte(
          '<dsfr-data-map-layer source="s" type="circle" geo-field="g" no-interactive tooltip-field="nom"></dsfr-data-map-layer>'
        ),
        attendu: true,
      },
      {
        nom: 'popup ciblée par for sur un geoshape no-interactive',
        html: carte(
          `<dsfr-data-map-layer id="l" source="s" type="geoshape" geo-field="g" no-interactive></dsfr-data-map-layer>
           <dsfr-data-map-popup for="l"></dsfr-data-map-popup>`
        ),
        attendu: true,
      },
      {
        nom: 'popup-template sur une heatmap',
        html: carte(
          '<dsfr-data-map-layer source="s" type="heatmap" geo-field="g" popup-template="{nom}"></dsfr-data-map-layer>'
        ),
        attendu: true,
      },
      {
        nom: 'marqueurs no-interactive : la popup reste branchée',
        html: carte(
          '<dsfr-data-map-layer source="s" geo-field="g" no-interactive popup-fields="nom"></dsfr-data-map-layer>'
        ),
        attendu: false,
      },
      {
        nom: 'geoshape interactif',
        html: carte(
          '<dsfr-data-map-layer source="s" type="geoshape" geo-field="g" popup-fields="nom"></dsfr-data-map-layer>'
        ),
        attendu: false,
      },
      {
        nom: 'geoshape no-interactive sans popup (habillage)',
        html: carte(
          '<dsfr-data-map-layer source="s" type="geoshape" geo-field="g" no-interactive></dsfr-data-map-layer>'
        ),
        attendu: false,
      },
    ]);
  });

  describe('carte/popup-mal-placee', () => {
    verifier('carte/popup-mal-placee', [
      {
        nom: 'popup hors de la carte',
        html: `${carte('<dsfr-data-map-layer id="l" source="s" geo-field="g"></dsfr-data-map-layer>')}<dsfr-data-map-popup for="l"></dsfr-data-map-popup>`,
        attendu: true,
      },
      {
        nom: 'popup enfant de la carte',
        html: carte(
          '<dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer><dsfr-data-map-popup></dsfr-data-map-popup>'
        ),
        attendu: false,
      },
      {
        nom: 'popup dans la couche',
        html: carte(
          '<dsfr-data-map-layer source="s" geo-field="g"><dsfr-data-map-popup mode="modal"></dsfr-data-map-popup></dsfr-data-map-layer>'
        ),
        attendu: false,
      },
    ]);
  });

  describe('carte/popup-mode-invalide', () => {
    const popup = (mode: string) =>
      carte(
        `<dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer><dsfr-data-map-popup mode="${mode}"></dsfr-data-map-popup>`
      );
    verifier('carte/popup-mode-invalide', [
      { nom: 'tooltip (mode du builder, pas du composant)', html: popup('tooltip'), attendu: true },
      { nom: 'panel (incomplet)', html: popup('panel'), attendu: true },
      { nom: 'popup', html: popup('popup'), attendu: false },
      { nom: 'modal', html: popup('modal'), attendu: false },
      { nom: 'panel-right', html: popup('panel-right'), attendu: false },
      { nom: 'panel-left', html: popup('panel-left'), attendu: false },
    ]);
  });

  describe('carte/popup-cible-absente', () => {
    verifier('carte/popup-cible-absente', [
      {
        nom: 'for vers une couche inexistante',
        html: carte(
          '<dsfr-data-map-layer id="l" source="s" geo-field="g"></dsfr-data-map-layer><dsfr-data-map-popup for="autre"></dsfr-data-map-popup>'
        ),
        attendu: true,
      },
      {
        nom: 'for vers la source d’une couche qui a un id (seul l’id compte)',
        html: carte(
          '<dsfr-data-map-layer id="l" source="s" geo-field="g"></dsfr-data-map-layer><dsfr-data-map-popup for="s"></dsfr-data-map-popup>'
        ),
        attendu: true,
      },
      {
        nom: 'for vers l’id de la couche',
        html: carte(
          '<dsfr-data-map-layer id="l" source="s" geo-field="g"></dsfr-data-map-layer><dsfr-data-map-popup for="l"></dsfr-data-map-popup>'
        ),
        attendu: false,
      },
      {
        nom: 'for vers la source d’une couche sans id',
        html: carte(
          '<dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer><dsfr-data-map-popup for="s"></dsfr-data-map-popup>'
        ),
        attendu: false,
      },
      {
        nom: 'popup dans la couche : for ignoré',
        html: carte(
          '<dsfr-data-map-layer id="l" source="s" geo-field="g"><dsfr-data-map-popup for="x"></dsfr-data-map-popup></dsfr-data-map-layer>'
        ),
        attendu: false,
      },
    ]);
  });
});

describe('lireBalises — imbrication', () => {
  it('donne les balises dsfr-data ouvertes autour de chaque balise', () => {
    const b = lireBalises(
      `<dsfr-data-map><div><dsfr-data-map-layer><dsfr-data-map-popup></dsfr-data-map-popup></dsfr-data-map-layer></div></dsfr-data-map><dsfr-data-chart></dsfr-data-chart>`
    );
    expect(b.map((x) => [x.tag, x.parents])).toEqual([
      ['dsfr-data-map', []],
      ['dsfr-data-map-layer', ['dsfr-data-map']],
      ['dsfr-data-map-popup', ['dsfr-data-map', 'dsfr-data-map-layer']],
      ['dsfr-data-chart', []],
    ]);
  });

  it('une balise auto-fermante n’ouvre rien, une fermante orpheline ne dépile rien', () => {
    const b = lireBalises(
      `</dsfr-data-map><dsfr-data-map><dsfr-data-map-layer /><dsfr-data-map-popup></dsfr-data-map-popup>`
    );
    expect(b.map((x) => x.parents)).toEqual([[], ['dsfr-data-map'], ['dsfr-data-map']]);
  });
});
