/**
 * Parité des tests : le CODE que le Studio IA livre (#1081).
 *
 * L'ancien Assistant IA avait une recette de son générateur
 * (`tests/apps/builder-ia/code-generator-recette.test.ts`, 867 lignes), partie
 * avec lui. Son générateur à gabarits n'existe plus : le Studio fait écrire un
 * document par des outils, et l'export partagé (`generateDashboardHTML`) en
 * tire la page. Les tests ne se recopient donc pas. Ce fichier garde, sur le
 * chemin du Studio, les comportements que la recette tenait pour l'usager :
 *
 *   - les 16 types × les 4 façons dont une source alimente la page donnent un
 *     code bien formé, câblé, sans gabarit non substitué ;
 *   - un nom de colonne à apostrophe ou à guillemet traverse jusqu'au composant ;
 *   - un titre malveillant n'atteint pas la page ;
 *   - un tableau ne naît pas déprécié, et ne promet pas une recherche locale
 *     là où elle n'opère pas ;
 *   - un filtre et une URL arrivent entiers dans leur attribut ;
 *   - le multi-séries.
 *
 * Le chemin exercé est celui d'un tour de chat (`apps/studio/src/main.ts`) :
 * `appliquerSource` (sélecteur de source) → `addBlocks` (outil `add_blocks`)
 * → `currentExportHtml` (onglet Code, presse-papier, favoris, Playground).
 *
 * Tout se lit APRÈS parsage du HTML : c'est ce que le composant recevra. Une
 * assertion sur le texte brut passe au vert avec un attribut disloqué.
 *
 * Trois comportements étaient rouges à l'écriture de ce fichier et y sont
 * restés en `it.skip` ; ils sont corrigés et actifs. Leur commentaire garde les
 * deux faits (ce que le Studio écrivait, ce qu'il écrit). Le rendu, lui, est
 * l'affaire de
 * `tests/builder-e2e/studio-recette.spec.ts` et `studio-parite-recette.spec.ts`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CHART_CONFIG_TYPES, createEmptyDashboard, migrateSource } from '@dsfr-data/shared';
import type { ChartConfig, Source } from '@dsfr-data/shared';
import { state } from '../../../apps/studio/src/state';
import { appliquerSource } from '../../../apps/studio/src/sources';
import { addBlocks, setPage, type BlockSpec } from '../../../apps/studio/src/document';
import { currentExportHtml } from '../../../apps/studio/src/ui/preview';

type TypeDeBloc = ChartConfig['type'];
type Ligne = Record<string, unknown>;

/** Étiquettes ordinaires en français : apostrophe, esperluette, chevron, guillemets (#615). */
const LIGNES: Ligne[] = [
  { region: "Provence-Alpes-Cote d'Azur", code_dept: '13', population: 5098666, pop2025: 5127840 },
  { region: "Val-d'Oise", code_dept: '95', population: 1249674, pop2025: 1256607 },
  { region: 'Recherche & Developpement', code_dept: '75', population: 2161000, pop2025: 2133111 },
  { region: 'Nord <59>', code_dept: '59', population: 2604000, pop2025: 2607746 },
  { region: 'Lieu-dit "Le Bourg"', code_dept: '29', population: 909028, pop2025: 915090 },
];

/**
 * Les quatre façons dont une source alimente la page exportée. Toutes portent
 * leurs lignes : le Studio ne propose que des sources chargées, et c'est
 * l'export qui choisit entre requête déclarative et données embarquées.
 */
const SOURCES: Record<string, (lignes?: Ligne[]) => Source> = {
  'embarquée (données saisies)': (data = LIGNES) => ({
    id: 'src',
    name: 'Saisie',
    type: 'manual',
    data,
  }),
  'API Opendatasoft': (data = LIGNES) =>
    migrateSource({
      id: 'src',
      name: 'ODS',
      type: 'api',
      apiUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/jeu-test/records',
      data,
      recordCount: 5000,
    }),
  'API Tabular': (data = LIGNES) =>
    migrateSource({
      id: 'src',
      name: 'Tabular',
      type: 'api',
      apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
      data,
      recordCount: 5000,
    }),
  'API générique': (data = LIGNES) =>
    migrateSource({
      id: 'src',
      name: 'API',
      type: 'api',
      apiUrl: 'https://exemple.gouv.fr/api/records',
      data,
      recordCount: 5000,
    }),
};
const VARIANTES = Object.keys(SOURCES);
const DECLARATIVES = ['API Opendatasoft', 'API Tabular'];

/** Configuration minimale valide d'un type, telle qu'un modèle l'enverrait. */
function configPour(type: TypeDeBloc): Partial<ChartConfig> {
  if (type === 'datalist') return { type, colonnes: 'region:Région, population:Population' };
  const base: Partial<ChartConfig> = {
    type,
    labelField: 'region',
    valueField: 'population',
    aggregation: 'sum',
  };
  return type.startsWith('map') ? { ...base, codeField: 'code_dept' } : base;
}

interface PageComposee {
  /** Compte-rendu rendu au modèle par `add_blocks`. */
  compteRendu: string;
  /** Le code que l'usager copie. */
  code: string;
  /** Ce code, tel qu'un navigateur le lit. */
  page: Document;
}

/** Un tour du Studio : source choisie, blocs ajoutés par l'outil, code exporté. */
function composer(source: Source, blocs: BlockSpec[]): PageComposee {
  state.document = createEmptyDashboard();
  appliquerSource(source);
  const { summary } = addBlocks(state.document, blocs, {
    data: state.localData ?? [],
    fields: state.fields,
    sourceId: state.document.sources[0]?.id ?? '',
  });
  const code = currentExportHtml();
  return { compteRendu: summary, code, page: lirePage(code) };
}

/**
 * La page telle qu'un navigateur la lit. Les feuilles et les scripts EXTERNES
 * de l'en-tête (DSFR, bibliothèque) sont retirés avant le parsage : le DOM de
 * test irait les chercher sur le réseau. Tout le reste — corps de la page,
 * scripts en ligne s'il y en avait — est parsé tel quel.
 */
function lirePage(code: string): Document {
  const sansRessources = code
    .replace(/<link\b[^>]*>/g, '')
    .replace(/<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/g, '');
  return new DOMParser().parseFromString(sansRessources, 'text/html');
}

const bloc = (config: Partial<ChartConfig>, title?: string): BlockSpec => ({
  kind: 'chart',
  config,
  ...(title ? { title } : {}),
});

/** Les composants dsfr-data de la page parsée. */
function composants(page: Document): Element[] {
  return [...page.querySelectorAll('*')].filter((el) => el.localName.startsWith('dsfr-data-'));
}

const AFFICHAGES = 'dsfr-data-chart, dsfr-data-kpi, dsfr-data-list, dsfr-data-podium';

/** Attribut d'un élément de la page parsée : ce que le composant recevra. */
function attributLu(page: Document, selecteur: string, nom: string): string | null {
  return page.querySelector(selecteur)?.getAttribute(nom) ?? null;
}

/** Scripts en ligne (hors `src=`) : la page du Studio n'en écrit aucun. */
function scriptsEnLigne(page: Document): string[] {
  return [...page.querySelectorAll('script')]
    .filter((s) => !s.getAttribute('src'))
    .map((s) => s.textContent ?? '');
}

/** Éléments porteurs d'un gestionnaire d'événement en ligne (`onerror`, `onclick`…). */
function gestionnairesEnLigne(page: Document): string[] {
  return [...page.querySelectorAll('*')].flatMap((el) =>
    el
      .getAttributeNames()
      .filter((n) => n.startsWith('on'))
      .map((n) => `${el.localName}[${n}]`)
  );
}

beforeEach(() => {
  state.source = null;
  state.localData = null;
  state.fields = [];
  state.document = createEmptyDashboard();
});

describe('recette — les 16 types × les 4 variantes de source', () => {
  it('la recette couvre tous les types déclarés', () => {
    // Un type ajouté à ChartConfig sans passer par ici serait manqué en silence.
    expect(CHART_CONFIG_TYPES).toHaveLength(16);
  });

  for (const type of CHART_CONFIG_TYPES) {
    for (const variante of VARIANTES) {
      it(`${type} — source ${variante} : bloc accepté, code bien formé et câblé`, () => {
        const { compteRendu, code, page } = composer(SOURCES[variante](), [bloc(configPour(type))]);

        // L'outil accepte le bloc : sinon le modèle paie un tour pour rien.
        expect(compteRendu).toContain('+ b1 (chart)');
        expect(compteRendu).not.toContain('refusé');

        // Aucun gabarit non substitué (il s'afficherait tel quel dans la page).
        expect(code.trim(), 'aucun code produit').not.toBe('');
        expect(code).not.toContain('${');
        expect(code).not.toContain('="undefined"');
        expect(code).not.toContain('[object Object]');

        // Un attribut mal clos avale la suite du document : le parseur rend
        // alors moins d'éléments que le code n'en déclare.
        expect(page.querySelector('.fr-container'), 'conteneur DSFR absent').not.toBeNull();
        const declares = (code.match(/<dsfr-data-[a-z-]+/g) ?? []).length;
        expect(composants(page), 'des éléments ont été avalés par le parseur').toHaveLength(
          declares
        );

        // Un seul composant d'affichage, et chaque `source=` vise un id présent.
        expect(page.querySelectorAll(AFFICHAGES)).toHaveLength(1);
        const ids = new Set(composants(page).map((el) => el.getAttribute('id')));
        for (const el of composants(page)) {
          const amont = el.getAttribute('source');
          if (amont !== null) expect(ids, `${el.localName} lit #${amont}`).toContain(amont);
        }

        // Pas de JavaScript concaténé : rien qu'une donnée puisse casser.
        expect(scriptsEnLigne(page)).toEqual([]);

        // La source : lignes embarquées intactes, ou requête déclarative qui
        // ne fige pas ses lignes.
        const source = page.querySelector('dsfr-data-source');
        expect(source, 'balise de source absente').not.toBeNull();
        if (variante === 'embarquée (données saisies)') {
          expect(JSON.parse(source?.getAttribute('data') ?? 'null')).toEqual(LIGNES);
        } else {
          expect(source?.hasAttribute('data'), 'lignes figées dans la page').toBe(false);
        }
      });
    }
  }
});

describe('un nom de colonne à apostrophe ou à guillemet ne casse pas le code', () => {
  // Un en-tête de colonne français ordinaire (« Nombre d'habitants ») fermait
  // une chaîne dans le script généré par l'ancien Assistant. Le Studio n'écrit
  // plus de script : le nom passe par des ATTRIBUTS, où c'est le guillemet
  // double qui disloque. Les deux sont éprouvés, sur les 16 types.
  const ETIQUETTE = "Region d'origine";
  const VALEUR = "Nombre d'habitants";
  const CODE = 'Code "INSEE"';
  const PIEGES: Ligne[] = [
    { [ETIQUETTE]: 'Bretagne', [VALEUR]: 3300000, [CODE]: '35' },
    { [ETIQUETTE]: "Cote-d'Or", [VALEUR]: 534000, [CODE]: '21' },
  ];
  const COLONNES = `${ETIQUETTE}:Région, ${CODE}:Code`;

  const configPiegee = (type: TypeDeBloc): Partial<ChartConfig> => {
    if (type === 'datalist') return { type, colonnes: COLONNES };
    return {
      type,
      labelField: ETIQUETTE,
      valueField: VALEUR,
      aggregation: 'sum',
      ...(type.startsWith('map') ? { codeField: CODE } : {}),
    };
  };

  for (const type of CHART_CONFIG_TYPES) {
    it(`${type} — les noms de champs arrivent intacts au composant`, () => {
      const { compteRendu, page } = composer(SOURCES['embarquée (données saisies)'](PIEGES), [
        bloc(configPiegee(type)),
      ]);
      expect(compteRendu).toContain('+ b1 (chart)');

      const lus = composants(page).flatMap((el) =>
        el
          .getAttributeNames()
          .filter((n) => n !== 'data')
          .map((n) => ({ el: el.localName, nom: n, valeur: el.getAttribute(n) ?? '' }))
      );
      // Une entité qui survit au parsage, c'est un double échappement : le
      // composant chercherait une colonne « Nombre d&#039;habitants ».
      for (const { el, nom, valeur } of lus) {
        expect(valeur, `${el}[${nom}]`).not.toMatch(/&(#0?39|quot|amp|lt|gt);/);
      }
      const valeursDe = (nom: string) => lus.filter((a) => a.nom === nom).map((a) => a.valeur);

      if (type === 'datalist') {
        expect(valeursDe('columns')).toEqual([COLONNES]);
        return;
      }
      if (type === 'kpi') {
        expect(valeursDe('value')).toEqual([`${VALEUR}:sum`]);
        return;
      }
      // Tous les autres agrègent par une requête, lue par l'affichage.
      const codeGroupe = type.startsWith('map') ? `,${CODE}` : '';
      expect(valeursDe('group-by')).toEqual([`${ETIQUETTE}${codeGroupe}`]);
      expect(valeursDe('aggregate')).toEqual([`${VALEUR}:sum`]);
      expect(valeursDe('label-field')).toEqual([ETIQUETTE]);
      expect(valeursDe('value-field')).toEqual([`${VALEUR}__sum`]);
      if (type.startsWith('map')) expect(valeursDe('code-field')).toEqual([CODE]);
    });
  }

  it('les lignes embarquées gardent leurs clés à apostrophe et à guillemet', () => {
    const { page } = composer(SOURCES['embarquée (données saisies)'](PIEGES), [
      bloc(configPiegee('bar')),
    ]);
    const brut = attributLu(page, 'dsfr-data-source', 'data');
    expect(brut, 'attribut data absent — la balise a été disloquée').not.toBeNull();
    expect(JSON.parse(brut ?? 'null')).toEqual(PIEGES);
  });

  it('un bloc de filtres sur ces champs les nomme sans les altérer', () => {
    const { compteRendu, page } = composer(SOURCES['embarquée (données saisies)'](PIEGES), [
      bloc(configPiegee('bar')),
      { kind: 'filters', fields: [ETIQUETTE, CODE] },
    ]);
    expect(compteRendu).toContain('+ b2 (filters)');
    const filtres = [...page.querySelectorAll('dsfr-data-context-filter')];
    expect(filtres.map((f) => f.getAttribute('field'))).toEqual([ETIQUETTE, CODE]);
    // Chaque filtre vise un select qui existe, et les valeurs à apostrophe
    // sont proposées telles quelles.
    for (const f of filtres) {
      expect(page.getElementById(f.getAttribute('ui') ?? '')?.localName).toBe('select');
    }
    const options = [...page.querySelectorAll('option')].map((o) => o.getAttribute('value'));
    expect(options).toContain("Cote-d'Or");
  });
});

describe('un titre malveillant n’atteint pas la page', () => {
  const SCRIPT = '<script>alert(1)</script>';
  const RUPTURE = '"><img src=x onerror=alert(1)>';

  it('titre et chapô de la page, titre de bloc, libellé et unité d’un indicateur', () => {
    state.document = createEmptyDashboard();
    appliquerSource(SOURCES['embarquée (données saisies)']());
    setPage(state.document, { name: SCRIPT, description: RUPTURE });
    addBlocks(
      state.document,
      [
        bloc({ type: 'bar', labelField: 'region', valueField: 'population' }, SCRIPT),
        bloc({ type: 'kpi', valueField: 'population', title: RUPTURE, unit: RUPTURE }),
        bloc({ type: 'podium', labelField: 'region', valueField: 'population', unit: RUPTURE }),
      ],
      { data: LIGNES, fields: state.fields, sourceId: 'src' }
    );
    const page = lirePage(currentExportHtml());

    expect(state.document.widgets).toHaveLength(3);
    expect(scriptsEnLigne(page)).toEqual([]);
    expect(page.querySelector('img')).toBeNull();
    expect(gestionnairesEnLigne(page)).toEqual([]);
    // Le texte, lui, est rendu tel que saisi : échappé, pas supprimé.
    expect(page.querySelector('h1')?.textContent).toBe(SCRIPT);
    expect(page.querySelector('h3')?.textContent).toBe(SCRIPT);
    expect(attributLu(page, 'dsfr-data-kpi', 'label')).toBe(RUPTURE);
    expect(attributLu(page, 'dsfr-data-kpi', 'unit')).toBe(RUPTURE);
    expect(attributLu(page, 'dsfr-data-podium', 'value-unit')).toBe(RUPTURE);
  });

  // DÉFAUT DU STUDIO, CORRIGÉ (#1081) : le contenu est NETTOYÉ à l'écriture dans
  // le document (`buildTextWidget` → `nettoyerGabarit`), pas échappé — le HTML
  // simple reste. L'export partagé n'est pas touché : l'app Tableau de bord y
  // passe un HTML saisi par l'usager. Le défaut, tel qu'il était :
  //
  // Le contenu d'un bloc `text` est écrit TEL QUEL dans la page dès qu'il
  // contient une balise (`buildTextWidget`, apps/studio/src/document.ts : « HTML
  // simple laissé tel quel »), puis émis sans filtre par l'export
  // (`case 'text'` de `generateWidgetHTML`, packages/shared/src/dashboard/
  // export-html.ts). Un titre de section — `style: "title"` — est donc le seul
  // titre du Studio qui atteint la page non échappé :
  //
  //   Studio écrit   : <h2><script>alert(1)</script></h2>
  //                    <p><img src=x onerror=alert(1)></p>
  //   attendu        : aucun script en ligne, aucun gestionnaire `on*`.
  //
  // Le contenu vient du modèle, qui peut le tenir d'une valeur du jeu de
  // données. Les autres textes écrits par le modèle sont filtrés
  // (`nettoyerGabarit` pour les gabarits de carte et les blocs libres) : le
  // bloc `text` est le seul à ne pas l'être. La page sert de code copié, et
  // d'aperçu dans une iframe `srcdoc` dont le bac à sable laisse passer scripts
  // et même origine (`sandbox="allow-scripts allow-same-origin"`).
  it('le contenu d’un bloc text ne porte ni script ni gestionnaire d’événement', () => {
    const { page } = composer(SOURCES['embarquée (données saisies)'](), [
      { kind: 'text', style: 'title', content: SCRIPT },
      { kind: 'text', content: '<img src=x onerror=alert(1)>' },
      { kind: 'text', content: '<p>Texte <strong>légitime</strong></p>' },
    ]);
    expect(scriptsEnLigne(page)).toEqual([]);
    expect(gestionnairesEnLigne(page)).toEqual([]);
    // Le HTML simple annoncé au modèle reste rendu.
    expect(page.querySelector('strong')?.textContent).toBe('légitime');
  });
});

describe('le tableau généré ne naît pas déprécié', () => {
  // `dsfr-data-list` accepte encore les alias français, dépréciés depuis #300 :
  // ils existent pour le code déjà publié, pas pour un générateur.
  const ALIAS_DEPRECIES = ['colonnes', 'recherche', 'filtres', 'tri', 'server-tri'];
  const liste = (variante: string) =>
    composer(SOURCES[variante](), [bloc(configPour('datalist'))]).page;
  const attributs = (page: Document) =>
    page.querySelector('dsfr-data-list')?.getAttributeNames().sort() ?? [];

  for (const variante of VARIANTES) {
    it(`aucun alias déprécié, source ${variante}`, () => {
      const noms = attributs(liste(variante));
      for (const alias of ALIAS_DEPRECIES) expect(noms, alias).not.toContain(alias);
      expect(noms).toContain('columns');
      expect(noms).toContain('pagination');
    });
  }

  it('la recherche locale est offerte là où elle opère : jeu entier dans le navigateur', () => {
    for (const variante of ['embarquée (données saisies)', 'API générique']) {
      const page = liste(variante);
      expect(attributs(page), variante).toEqual(['columns', 'pagination', 'search', 'source']);
      expect(page.querySelector('dsfr-data-source')?.hasAttribute('server-side')).toBe(false);
    }
  });

  it('elle n’est pas promise en pagination serveur, où le tri part au serveur', () => {
    // En pagination serveur, `search` ne verrait que la page chargée : le
    // composant la désactive et écrit un avertissement dans la console de la
    // page de l'usager (#304).
    for (const variante of DECLARATIVES) {
      const page = liste(variante);
      expect(attributs(page), variante).toEqual(['columns', 'pagination', 'server-sort', 'source']);
      expect(attributLu(page, 'dsfr-data-source', 'page-size')).toBe('10');
      expect(page.querySelector('dsfr-data-source')?.hasAttribute('server-side')).toBe(true);
    }
  });
});

describe('le code reste cohérent avec la configuration', () => {
  it('le titre demandé par le modèle titre le bloc, dans config.title comme dans title', () => {
    const { page, compteRendu } = composer(SOURCES['embarquée (données saisies)'](), [
      bloc({ ...configPour('bar'), title: 'Mon titre à moi' }),
      bloc(configPour('line'), 'Titre du bloc'),
    ]);
    const titres = [...page.querySelectorAll('h3')].map((h) => h.textContent);
    expect(titres).toEqual(['Mon titre à moi', 'Titre du bloc']);
    // Et le modèle lit le même titre dans le compte-rendu de l'outil.
    expect(compteRendu).toContain('« Mon titre à moi »');
  });

  it('un filtre à valeur chaîne arrive entier à la requête, sans traduction', () => {
    // Le Studio pose le filtre du bloc sur `dsfr-data-query`, dans la syntaxe
    // du pipeline : c'est la requête qui le délègue à la source. L'attribut
    // est double-quoté : c'est un guillemet double dans la valeur qui le
    // tronquerait (`where="region:eq:Lieu-dit "` au lieu du filtre entier).
    for (const variante of VARIANTES) {
      for (const filtre of ["region:eq:Val-d'Oise", 'region:eq:Lieu-dit "Le Bourg"']) {
        const { page, compteRendu } = composer(SOURCES[variante](), [
          bloc({ ...configPour('bar'), where: filtre }),
        ]);
        expect(compteRendu, variante).toContain('+ b1 (chart)');
        expect(attributLu(page, 'dsfr-data-query', 'where'), variante).toBe(filtre);
        expect(attributLu(page, 'dsfr-data-source', 'where'), variante).toBeNull();
      }
    }
  });

  it('le filtre d’un indicateur Opendatasoft est traduit en ODSQL, valeur quotée', () => {
    // Seul cas où le Studio écrit de l'ODSQL (#810) : l'indicateur a sa source
    // dédiée, qui fait calculer l'agrégat par le serveur. La valeur est
    // entourée de guillemets DOUBLES dans un attribut lui-même double-quoté :
    // sans échappement, `where="region = "Nord""` se lirait `region = `.
    const kpi = (where: string) =>
      composer(SOURCES['API Opendatasoft'](), [
        bloc({ type: 'kpi', valueField: 'population', aggregation: 'sum', where }),
      ]);

    const chaine = kpi("region:eq:Val-d'Oise");
    expect(chaine.compteRendu).toContain('+ b1 (chart)');
    expect(attributLu(chaine.page, 'dsfr-data-source', 'where')).toBe('region = "Val-d\'Oise"');
    expect(chaine.code, 'la syntaxe du pipeline a fui dans le code').not.toContain(':eq:');
    expect(chaine.page.querySelector('dsfr-data-query')).toBeNull();

    // `eq` quote aussi une valeur numérique : même piège.
    const nombre = kpi('code_dept:eq:95');
    expect(attributLu(nombre.page, 'dsfr-data-source', 'where')).toBe('code_dept = "95"');
    // Une comparaison d'ordre, elle, sort nue.
    const ordre = kpi('population:gt:2000000');
    expect(attributLu(ordre.page, 'dsfr-data-source', 'where')).toBe('population > 2000000');
  });

  it('une URL à entité historique traverse l’attribut entière', () => {
    // `&copy` et `&reg` sans point-virgule sont décodés en « © » et « ® » dans
    // une valeur d'attribut, sauf si un `=` suit : la page appellerait une
    // autre URL que celle de la source.
    const url = 'https://exemple.gouv.fr/api?a=1&copy&b=2&reg';
    const source = migrateSource({
      id: 'src',
      name: 'API',
      type: 'api',
      apiUrl: url,
      data: LIGNES,
    });
    const { page } = composer(source, [bloc(configPour('map'))]);

    expect(attributLu(page, 'dsfr-data-source', 'url')).toBe(url);
  });
});

describe('multi-séries', () => {
  const AVEC_SERIE: Partial<ChartConfig> = {
    type: 'bar',
    labelField: 'region',
    valueField: 'population',
    valueFields: ['pop2025'],
  };

  /** Colonnes que la requête rend à l'affichage : groupes et alias `champ__fn`. */
  function colonnesProduites(page: Document): string[] {
    const requete = page.querySelector('dsfr-data-query');
    const liste = (nom: string) =>
      (requete?.getAttribute(nom) ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return [...liste('group-by'), ...liste('aggregate').map((a) => a.replace(':', '__'))];
  }

  /** Colonne lue par une entrée de `value-fields` (`colonne` ou `colonne:libellé`). */
  const colonneLue = (entree: string) => entree.split(':')[0].trim();

  it('sans agrégation, la série supplémentaire est lue sur la source', () => {
    for (const variante of VARIANTES) {
      const { page, compteRendu } = composer(SOURCES[variante](), [bloc(AVEC_SERIE)]);
      expect(compteRendu, variante).toContain('+ b1 (chart)');
      expect(page.querySelector('dsfr-data-query'), variante).toBeNull();
      expect(attributLu(page, 'dsfr-data-chart', 'source'), variante).toBe('src');
      expect(attributLu(page, 'dsfr-data-chart', 'value-field'), variante).toBe('population');
      expect(attributLu(page, 'dsfr-data-chart', 'value-fields'), variante).toBe('pop2025');
    }
  });

  it('une série qui n’existe pas dans la source est refusée, avec les champs disponibles', () => {
    const { compteRendu } = composer(SOURCES['embarquée (données saisies)'](), [
      bloc({ ...AVEC_SERIE, valueFields: ['pop2030'] }),
    ]);
    expect(compteRendu).toContain('refusé');
    expect(compteRendu).toContain('pop2030');
    expect(compteRendu).toContain('pop2025');
    expect(state.document.widgets).toHaveLength(0);
  });

  // DÉFAUT DU STUDIO, CORRIGÉ (#1081) : chaque série est agrégée, et le
  // graphique désigne les colonnes agrégées, sous l'alias inline
  // `pop2025__sum:pop2025` (#668) qui garde le nom du champ en légende. Le
  // défaut, tel qu'il était :
  //
  // Avec une agrégation, l'export n'agrège QUE `valueField`
  // (`generateBuilderChartHTML`, packages/shared/src/dashboard/export-html.ts :
  // `aggregate="${valueField}:${aggregation}"`), mais émet `value-fields` avec
  // les noms bruts des séries supplémentaires. Or `dsfr-data-query` ne rend,
  // pour un `group-by`, que les champs de groupe et les agrégats
  // (`_applyGroupByAndAggregate`) : la colonne désignée n'existe plus.
  //
  //   Studio écrit : <dsfr-data-query group-by="region" aggregate="population:sum">
  //                  <dsfr-data-chart value-field="population__sum" value-fields="pop2025">
  //   attendu      : aggregate="population:sum, pop2025:sum"
  //                  value-fields="pop2025__sum" (ou "pop2025__sum:pop2025")
  //
  // L'ancien Assistant agrégeait la colonne supplémentaire sous l'alias que
  // `value-fields` désigne, sur ses variantes à composant (#624). Le schéma des
  // outils du Studio propose `valueFields` et `aggregation` ensemble, et
  // `diagnoseConfig` accepte le bloc.
  it('avec une agrégation, la série supplémentaire est agrégée elle aussi', () => {
    for (const variante of VARIANTES) {
      const { page, compteRendu } = composer(SOURCES[variante](), [
        bloc({ ...AVEC_SERIE, aggregation: 'sum' }),
      ]);
      expect(compteRendu, variante).toContain('+ b1 (chart)');
      const produites = colonnesProduites(page);
      const lues = (attributLu(page, 'dsfr-data-chart', 'value-fields') ?? '')
        .split(',')
        .map(colonneLue);
      expect(lues, variante).toHaveLength(1);
      for (const colonne of lues) expect(produites, variante).toContain(colonne);
    }
  });

  // DÉFAUT DU STUDIO, CORRIGÉ — même cause que le précédent, pour `valueField2`
  // (seconde mesure d'un `bar-line`) :
  //
  //   Studio écrivait : aggregate="population:sum" … value-field-2="pop2025"
  //   il écrit        : aggregate="population:sum, pop2025:sum"
  //                     … value-field-2="pop2025__sum:pop2025"
  //
  // `value-field-2` accepte l'alias inline comme `value-fields` : la colonne
  // lue est ce qui précède le `:` (`colonneLue`).
  it('avec une agrégation, la seconde mesure d’un bar-line est agrégée elle aussi', () => {
    const { page, compteRendu } = composer(SOURCES['embarquée (données saisies)'](), [
      bloc({
        type: 'bar-line',
        labelField: 'region',
        valueField: 'population',
        valueField2: 'pop2025',
        aggregation: 'sum',
      }),
    ]);
    expect(compteRendu).toContain('+ b1 (chart)');
    expect(colonnesProduites(page)).toContain(
      colonneLue(attributLu(page, 'dsfr-data-chart', 'value-field-2') ?? '')
    );
    expect(colonnesProduites(page)).toContain(
      colonneLue(attributLu(page, 'dsfr-data-chart', 'value-field') ?? '')
    );
  });
});
