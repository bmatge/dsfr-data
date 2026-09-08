import { describe, it, expect, beforeEach } from 'vitest';
import { CHART_CONFIG_TYPES } from '@dsfr-data/shared';
import type { ChartConfig, AggregatedResult, Source } from '@dsfr-data/shared';
import { generateCode } from '../../../apps/builder-ia/src/ui/code-generator.js';
import { state } from '../../../apps/builder-ia/src/state.js';

/**
 * Recette du generateur de l'Assistant IA (#615).
 *
 * CE FICHIER EXISTE PARCE QUE PERSONNE N'AVAIT JAMAIS EPROUVE CE CODE. Tant
 * que `chart-renderer.ts` dessinait un apercu EN PARALLELE, il masquait le
 * generateur : l'utilisateur voyait un graphique correct et copiait un code
 * jamais execute. Le podium en etait la preuve (#617) — casse de bout en bout
 * sans que rien ne le signale.
 *
 * Depuis #609 la parite apercu/export est acquise par CONSTRUCTION : il n'y a
 * plus deux rendus a comparer. Reste a eprouver le code lui-meme, sur les
 * 16 types x les 4 facons dont une source l'alimente — 64 combinaisons dont
 * aucune n'etait couverte.
 *
 * Ce fichier tient la FORME du code. Le RENDU est l'affaire de
 * `tests/builder-e2e/builder-ia-recette.spec.ts` : les deux defauts les plus
 * couteux (podium vide, datalist pilotee par script) produisaient un code
 * parfaitement bien forme, et aucune assertion de chaine ne pouvait les voir.
 *
 * Ces tests ne joignent aucun reseau : ils tiennent les invariants verifiables
 * hors ligne, et ce sont ceux qui attrapent les defauts reels — un attribut
 * casse par une apostrophe, un `${'$'}{…}` non substitue, un script invalide.
 */

const DONNEES: AggregatedResult[] = [
  { label: 'Ile-de-France', value: 12271794, code: '75' },
  { label: 'Occitanie', value: 5924753, code: '31' },
];

const LIGNES = [
  { region: 'Ile-de-France', population: 12271794, code_dept: '75' },
  { region: 'Occitanie', population: 5924753, code_dept: '31' },
];

/** Config minimale valide pour un type donne. */
function configPour(type: ChartConfig['type']): ChartConfig {
  const base: ChartConfig = {
    type,
    labelField: 'region',
    valueField: 'population',
    aggregation: 'sum',
    title: 'Population par region',
  };
  if (type.startsWith('map')) return { ...base, codeField: 'code_dept' };
  if (type === 'datalist') return { ...base, colonnes: 'region:Region, population:Population' };
  return base;
}

/**
 * Les quatre facons dont une source alimente le code genere.
 *
 * `recordCount` au-dela des lignes locales est ce qui fait basculer les
 * generateurs ODS/Tabular vers les composants (`needsPagination()`) : sans
 * lui, la recette ne testerait que la moitie basse du tableau de #616.
 */
const VARIANTES: Record<string, () => Source> = {
  'embarquee (donnees inline)': () => ({ id: 's', name: 'Manuel', type: 'manual' }),
  'API OpenDataSoft': () => ({
    id: 's',
    name: 'ODS',
    type: 'api',
    apiUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/jeu-test/records',
    recordCount: 5000,
  }),
  'API Tabular': () => ({
    id: 's',
    name: 'Tabular',
    type: 'api',
    apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
    recordCount: 5000,
  }),
  'API generique': () => ({
    id: 's',
    name: 'API',
    type: 'api',
    apiUrl: 'https://exemple.gouv.fr/api/records',
    recordCount: 5000,
  }),
};

/** Genere le code d'une config et rend le texte produit. */
function genererCode(config: ChartConfig, data: AggregatedResult[] = DONNEES): string {
  const pre = document.createElement('pre');
  pre.id = 'generated-code';
  document.body.appendChild(pre);
  try {
    generateCode(config, data);
    return pre.textContent ?? '';
  } finally {
    pre.remove();
  }
}

/** Les blocs `<script>` inline du code genere (hors `src=`). */
function scriptsInline(code: string): string[] {
  const doc = new DOMParser().parseFromString(code, 'text/html');
  return [...doc.querySelectorAll('script')]
    .filter((s) => !s.getAttribute('src'))
    .map((s) => s.textContent ?? '')
    .filter((t) => t.trim() !== '');
}

beforeEach(() => {
  state.localData = LIGNES;
  state.fields = [
    { name: 'region', type: 'string', sample: 'Ile-de-France' },
    { name: 'population', type: 'number', sample: 12271794 },
    { name: 'code_dept', type: 'string', sample: '75' },
  ];
  state.source = VARIANTES['embarquee (donnees inline)']();
});

describe('recette — les 16 types x les 4 variantes de source', () => {
  it('la recette couvre bien tous les types declares', () => {
    // Un type ajoute a ChartConfig sans passer par ici serait manque en
    // silence : la boucle ci-dessous se contenterait de l'ignorer.
    expect(CHART_CONFIG_TYPES.length).toBe(16);
  });

  for (const type of CHART_CONFIG_TYPES) {
    for (const [nomVariante, source] of Object.entries(VARIANTES)) {
      describe(`${type} — source ${nomVariante}`, () => {
        beforeEach(() => {
          state.source = source();
        });

        it('produit du code, sans lever', () => {
          const code = genererCode(configPour(type));

          expect(code.trim(), 'aucun code produit').not.toBe('');
        });

        it('ne laisse aucun gabarit non substitue', () => {
          // Un `${'$'}{…}` survivant s'afficherait tel quel dans la page de
          // l'utilisateur ; `undefined` en position d'attribut casse le rendu.
          const code = genererCode(configPour(type));

          expect(code).not.toContain('${');
          expect(code).not.toContain('="undefined"');
          expect(code).not.toContain('[object Object]');
        });

        it('emet un HTML dont les elements survivent au parsage', () => {
          // Un attribut mal clos avale la suite du document : le parseur rend
          // alors moins d'elements que la source n'en declare.
          const code = genererCode(configPour(type));
          const doc = new DOMParser().parseFromString(code, 'text/html');

          expect(doc.querySelector('.fr-container'), 'conteneur DSFR absent').not.toBeNull();
          const balisesDeclarees = (
            code.match(/<(dsfr-data-[a-z-]+|canvas|map-chart|gauge-chart)/g) ?? []
          ).length;
          const balisesParsees = doc.querySelectorAll(
            'dsfr-data-source, dsfr-data-query, dsfr-data-chart, dsfr-data-list, dsfr-data-podium, canvas, map-chart, gauge-chart'
          ).length;

          expect(balisesParsees, 'des elements ont ete avales par le parseur').toBe(
            balisesDeclarees
          );
        });

        it('embarque un JavaScript syntaxiquement valide', () => {
          // Les variantes Chart.js injectent des valeurs dans des chaines JS.
          // Une apostrophe ou un saut de ligne y produirait un script mort,
          // que seul un navigateur signalerait — trop tard.
          for (const script of scriptsInline(genererCode(configPour(type)))) {
            expect(() => new Function(script), script.slice(0, 200)).not.toThrow();
          }
        });
      });
    }
  }
});

describe('les etiquettes francaises ne cassent pas le code genere', () => {
  // Provence-Alpes-Cote d'Azur, Val-d'Oise, Cote-d'Or : l'apostrophe est
  // ordinaire dans les libelles francais, et le generateur emettait les
  // donnees dans un attribut a guillemets SIMPLES sans les echapper. La
  // premiere apostrophe fermait l'attribut — donnees tronquees, balise
  // disloquee, et une carte ou un podium vide sans le moindre message.
  const AVEC_APOSTROPHE: AggregatedResult[] = [
    { label: "Provence-Alpes-Cote d'Azur", value: 5098666, code: '93' },
    { label: "Val-d'Oise", value: 1249674, code: '95' },
  ];

  it('le podium embarque restitue les etiquettes intactes', () => {
    const code = genererCode(configPour('podium'), AVEC_APOSTROPHE);
    const doc = new DOMParser().parseFromString(code, 'text/html');
    const brut = doc.querySelector('dsfr-data-source')?.getAttribute('data');

    expect(brut, 'attribut data absent — la balise a ete disloquee').not.toBeNull();
    const lignes = JSON.parse(brut!) as Record<string, unknown>[];
    expect(lignes.map((l) => l.region)).toEqual(["Provence-Alpes-Cote d'Azur", "Val-d'Oise"]);
  });

  it('la carte embarquee restitue les codes intacts', () => {
    const code = genererCode(configPour('map'), AVEC_APOSTROPHE);
    const doc = new DOMParser().parseFromString(code, 'text/html');
    const brut = doc.querySelector('map-chart')?.getAttribute('data');

    expect(brut).not.toBeNull();
    expect(JSON.parse(brut!)).toEqual({ '93': 5098666, '95': 1249674 });
  });

  it('une esperluette n’est pas decodee au passage', () => {
    // `&amp;` dans une donnee redevient `&` a la lecture de l'attribut si on
    // n'echappe pas l'esperluette a l'ecriture : corruption silencieuse.
    const code = genererCode(configPour('podium'), [
      { label: 'Recherche &amp; Developpement', value: 1, code: null },
    ]);
    const doc = new DOMParser().parseFromString(code, 'text/html');
    const lignes = JSON.parse(
      doc.querySelector('dsfr-data-source')!.getAttribute('data')!
    ) as Record<string, unknown>[];

    expect(lignes[0].region).toBe('Recherche &amp; Developpement');
  });

  it('un titre malveillant n’atteint pas la page', () => {
    const code = genererCode({ ...configPour('bar'), title: '<script>alert(1)</script>' });

    expect(code).not.toContain('<script>alert(1)</script>');
  });
});

describe('inventaire d’observabilite — ce que le volet Diagnostic peut voir', () => {
  /**
   * Cet inventaire N'EST PAS une specification de ce qui DEVRAIT etre : c'est
   * l'etat constate, verrouille. #616 arbitre s'il faut le faire evoluer ;
   * tant qu'il n'a pas tranche, ce test empeche une derive silencieuse dans un
   * sens comme dans l'autre.
   *
   * Le volet Diagnostic n'observe que le bus dsfr-data. Un `new Chart()` ne
   * publie rien : le volet reste muet, et c'est normal — il n'y a pas de
   * pipeline a diagnostiquer sur une serie inline.
   */
  const observable = (type: ChartConfig['type'], variante: keyof typeof VARIANTES): boolean => {
    state.source = VARIANTES[variante]();
    return /<dsfr-data-(source|query|chart|list|podium)/.test(genererCode(configPour(type)));
  };

  it('les sources paginees passent par les composants', () => {
    for (const variante of ['API OpenDataSoft', 'API Tabular'] as const) {
      for (const type of ['bar', 'line', 'pie', 'map', 'map-reg', 'podium', 'datalist'] as const) {
        expect(observable(type, variante), `${type} / ${variante}`).toBe(true);
      }
    }
  });

  it('le podium et la datalist passent par les composants meme en embarque', () => {
    for (const type of ['podium', 'datalist'] as const) {
      expect(observable(type, 'embarquee (donnees inline)'), type).toBe(true);
    }
  });

  it('les series inline restent du Chart.js — constat, pas objectif', () => {
    for (const type of [
      'bar',
      'line',
      'pie',
      'doughnut',
      'radar',
      'horizontalBar',
      'scatter',
    ] as const) {
      expect(observable(type, 'embarquee (donnees inline)'), type).toBe(false);
    }
  });

  it('le KPI et la jauge n’utilisent pas encore leurs composants', () => {
    // `dsfr-data-kpi` existe et n'est pas emis ; la jauge passe par
    // `<gauge-chart>` de dsfr-chart. C'est le coeur de l'arbitrage #616.
    for (const variante of Object.keys(VARIANTES) as (keyof typeof VARIANTES)[]) {
      expect(observable('kpi', variante), `kpi / ${variante}`).toBe(false);
      expect(observable('gauge', variante), `gauge / ${variante}`).toBe(false);
    }
  });
});

describe('le code genere ne nait pas deprecie', () => {
  // `dsfr-data-list` accepte encore les alias francais (`colonnes`,
  // `recherche`, `tri`, `filtres`, `server-tri`), @deprecated depuis #300. Ils
  // existent pour ne pas casser le code deja publie par les utilisateurs —
  // pas pour etre emis par un generateur en 2026. Deux des quatre variantes
  // datalist les emettaient encore.
  const ALIAS_DEPRECIES = ['colonnes=', 'recherche', 'filtres=', 'tri=', 'server-tri'];

  /** Le balisage seul : les commentaires expliquent, ils ne configurent pas. */
  const baliseSeule = (code: string) => code.replace(/<!--[\s\S]*?-->/g, '');

  for (const variante of Object.keys(VARIANTES) as (keyof typeof VARIANTES)[]) {
    it(`datalist — aucun alias deprecie, source ${variante}`, () => {
      state.source = VARIANTES[variante]();
      const balises = baliseSeule(genererCode(configPour('datalist')));

      for (const alias of ALIAS_DEPRECIES) {
        expect(balises, `alias deprecie « ${alias} »`).not.toContain(alias);
      }
      expect(balises).toContain('columns=');
    });
  }

  it('les quatre variantes parlent le MEME vocabulaire', () => {
    // L'incoherence etait la vraie faute : ODS/Tabular disaient `columns`,
    // l'API generique et l'embarquee `colonnes`. Meme composant, meme
    // configuration, deux dialectes.
    const vocabulaires = (Object.keys(VARIANTES) as (keyof typeof VARIANTES)[]).map((v) => {
      state.source = VARIANTES[v]();
      const code = genererCode(configPour('datalist'));
      return ['columns', 'sort', 'pagination', 'export'].filter((attr) =>
        code.includes(`${attr}=`)
      );
    });

    for (const vocab of vocabulaires) {
      expect(vocab).toEqual(vocabulaires[0]);
    }
  });

  it('la recherche locale n’est pas promise la ou elle n’opere pas', () => {
    // En pagination serveur, `search` n'agit que sur la page chargee : le
    // composant la desactive et loggue un avertissement dans la page de
    // l'utilisateur (#304). L'emettre, c'est promettre un controle absent et
    // salir sa console.
    for (const variante of ['API OpenDataSoft', 'API Tabular'] as const) {
      state.source = VARIANTES[variante]();
      const code = genererCode(configPour('datalist'));

      expect(baliseSeule(code), `${variante} : search inoperant emis`).not.toMatch(
        /^\s*search\s*$/m
      );
      expect(code, `${variante} : l'alternative n'est pas indiquee`).toContain(
        'dsfr-data-search server-search'
      );
    }
  });

  it('mais elle l’est la ou elle opere', () => {
    for (const variante of ['embarquee (donnees inline)', 'API generique'] as const) {
      state.source = VARIANTES[variante]();

      expect(genererCode(configPour('datalist')), variante).toMatch(/^\s*search\s*$/m);
    }
  });
});

describe('les deux defauts trouves par la recette E2E', () => {
  // Ces deux-la ne se voyaient qu'au rendu : le code produit etait bien
  // forme dans les deux cas. C'est la raison d'etre de la moitie Playwright
  // de #615 — et voici la moitie qui tourne en CI.

  it('la datalist embarquee ne pilote plus le composant par un script', () => {
    // Elle appelait `document.getElementById('my-table').onSourceData(data)`
    // depuis un script CLASSIQUE. Dans le code exporte cela marchait — le
    // script UMD qui precede enregistre le composant de facon synchrone. Dans
    // l'apercu, `getPreviewHTML` remplace cet UMD par un module DIFFERE : le
    // script s'executait donc AVANT l'enregistrement, sur un element non
    // rehausse, et mourait sur `onSourceData is not a function`. Tableau vide,
    // aucun message. La forme declarative n'a plus d'ordre a respecter.
    const code = genererCode(configPour('datalist'));

    expect(code).not.toContain('onSourceData');
    expect(code).toContain('<dsfr-data-source');
    expect(code).toMatch(/<dsfr-data-list[\s\S]*source="table-data"/);
  });

  it('la datalist embarquee emporte les lignes source', () => {
    const doc = new DOMParser().parseFromString(genererCode(configPour('datalist')), 'text/html');
    const lignes = JSON.parse(
      doc.querySelector('dsfr-data-source')!.getAttribute('data')!
    ) as Record<string, unknown>[];

    expect(lignes).toEqual(LIGNES);
  });

  it('applyChartConfig alimente reellement le podium', async () => {
    // Le garde-fou qui compte : le generateur savait deja faire, c'est
    // l'appelant qui lui passait un tableau vide. Tester le generateur seul
    // aurait laisse le defaut entier en place.
    const { applyChartConfig } = await import('../../../apps/builder-ia/src/ui/preview.js');
    const pre = document.createElement('pre');
    pre.id = 'generated-code';
    document.body.appendChild(pre);
    try {
      applyChartConfig(configPour('podium'));
      const doc = new DOMParser().parseFromString(pre.textContent ?? '', 'text/html');
      const lignes = JSON.parse(
        doc.querySelector('dsfr-data-source')!.getAttribute('data')!
      ) as Record<string, unknown>[];

      expect(lignes.length, 'podium alimente par un agregat vide').toBeGreaterThan(0);
      expect(lignes[0]).toHaveProperty('region');
      expect(lignes[0]).toHaveProperty('population');
    } finally {
      pre.remove();
    }
  });

  it('le podium embarque refuse un agregat vide', () => {
    // `applyChartConfig` passait `[]` au generateur pour le podium comme pour
    // la datalist. La datalist s'en moque (elle lit `state.localData`), le
    // podium non : il fabrique son attribut `data` A PARTIR de cet argument.
    // Resultat, `data='[]'` et un podium vide, quelle que soit la source.
    const vide = genererCode(configPour('podium'), []);
    const garni = genererCode(configPour('podium'));

    expect(vide).toContain("data='[]'");
    expect(garni).not.toContain("data='[]'");
  });
});

describe('le code genere reste coherent avec la configuration', () => {
  it('reprend le titre demande', () => {
    expect(genererCode({ ...configPour('bar'), title: 'Mon titre a moi' })).toContain(
      'Mon titre a moi'
    );
  });

  it('les cartes portent le champ de CODE, pas le champ d’etiquette', () => {
    state.source = VARIANTES['API generique']();
    const code = genererCode(configPour('map'));

    expect(code).toContain('code-field="code_dept"');
  });

  it('horizontalBar devient un bar horizontal, pas un type inconnu', () => {
    // Chart.js n'a plus de type `horizontalBar` depuis la v3, et
    // `dsfr-data-chart` ne le connait pas davantage.
    state.source = VARIANTES['API OpenDataSoft']();
    const code = genererCode(configPour('horizontalBar'));

    expect(code).toContain('type="bar"');
    expect(code).toContain('horizontal');
    expect(code).not.toContain('type="horizontalBar"');
  });

  it('un filtre where est TRADUIT en ODSQL, pas recopie tel quel', () => {
    // Premiere version de ce test : `where: 'population > 5000'` et
    // `expect(code).toContain('where=')`. Deux fautes qui se masquaient
    // l'une l'autre — la syntaxe attendue est celle du pipeline
    // (`champ:op:valeur`), donc `filterToOdsql` rendait une chaine VIDE, et
    // l'assertion se satisfaisait d'un `where=""`. Elle restait verte avec le
    // traducteur remplace par l'identite.
    state.source = VARIANTES['API OpenDataSoft']();
    const code = genererCode({ ...configPour('bar'), where: 'population:gt:5000' });

    expect(code).toContain('where="population > 5000"');
    expect(code, 'la syntaxe pipeline a fuite dans le code livre').not.toContain(':gt:');
  });

  it('un filtre where traverse aussi la variante Tabular, sans traduction', () => {
    // Tabular consomme la syntaxe pipeline telle quelle : le traduire ici
    // serait le defaut symetrique.
    state.source = VARIANTES['API Tabular']();
    const code = genererCode({ ...configPour('bar'), where: 'population:gt:5000' });

    expect(code).toContain('filter="population:gt:5000"');
  });
});
