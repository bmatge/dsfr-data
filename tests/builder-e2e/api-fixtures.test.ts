/**
 * Les faux serveurs de la recette des variantes API (#625).
 *
 * CE FICHIER EXISTE POUR QUE LE HARNAIS NE MENTE PAS. Une fixture fausse ne
 * se signale pas : elle produit un composant vide, et l'echec accuse alors le
 * code teste. On eprouve donc ici, hors navigateur et en quelques
 * millisecondes, ce que les faux serveurs promettent — enveloppes, pagination,
 * agregation, tri, facettes — avant de s'en servir comme reference.
 *
 * Il tourne en CI avec le reste de la suite vitest ; la moitie Playwright,
 * elle, se lance a la main (voir tests/builder-e2e/README.md).
 */
import { describe, it, expect } from 'vitest';
import {
  CHAMP_PIEGE,
  HOTES,
  JEU,
  NOMBRE_DE_LIGNES,
  ODS_PAGE_SIZE,
  RESSOURCES,
  TABULAR_PAGE_SIZE,
  filtrerOdsql,
  repondreGenerique,
  repondreOdsExport,
  repondreOdsFacets,
  repondreOdsRecords,
  repondreTabular,
} from './api-fixtures';

const RECORDS = `${HOTES.ods}/api/explore/v2.1/catalog/datasets/${RESSOURCES.datasetId}/records`;
const EXPORT = `${HOTES.ods}/api/explore/v2.1/catalog/datasets/${RESSOURCES.datasetId}/exports/json`;
const FACETS = `${HOTES.ods}/api/explore/v2.1/catalog/datasets/${RESSOURCES.datasetId}/facets`;
const TABULAR = `${HOTES.tabular}/api/resources/${RESSOURCES.resourceId}/data/`;

const url = (base: string, query = '') => new URL(query ? `${base}?${query}` : base);

const SOMME_TOTALE = JEU.reduce((total, l) => total + l.population, 0);

describe('le jeu de recette', () => {
  it('depasse la taille de page ODS — sinon la pagination ne serait jamais exercee', () => {
    expect(NOMBRE_DE_LIGNES).toBeGreaterThan(ODS_PAGE_SIZE);
    expect(JEU).toHaveLength(NOMBRE_DE_LIGNES);
  });

  it('porte les etiquettes et le nom de colonne piegeux (#615)', () => {
    const etiquettes = JEU.map((l) => l.region);
    expect(etiquettes).toContain("Val-d'Oise");
    expect(etiquettes.some((e) => e.includes('&'))).toBe(true);
    expect(Object.keys(JEU[0])).toContain(CHAMP_PIEGE);
  });

  it('classe Val-d’Oise en tete du tri descendant', () => {
    // La recette verifie sa presence sur la premiere page : elle doit y etre.
    const trie = [...JEU].sort((a, b) => b.population - a.population);
    expect(trie[0].region).toBe("Val-d'Oise");
  });
});

describe('OpenDataSoft — /records', () => {
  it('rend l’enveloppe { total_count, results } bornee par limit', () => {
    const reponse = repondreOdsRecords(url(RECORDS, `limit=${ODS_PAGE_SIZE}`));
    expect(reponse.total_count).toBe(NOMBRE_DE_LIGNES);
    expect(reponse.results).toHaveLength(ODS_PAGE_SIZE);
  });

  it('pagine par offset', () => {
    const seconde = repondreOdsRecords(
      url(RECORDS, `limit=${ODS_PAGE_SIZE}&offset=${ODS_PAGE_SIZE}`)
    );
    expect(seconde.results).toHaveLength(NOMBRE_DE_LIGNES - ODS_PAGE_SIZE);
    expect(seconde.results[0]).toEqual(JEU[ODS_PAGE_SIZE]);
  });

  it('agrege select/group_by et rend les alias demandes', () => {
    const reponse = repondreOdsRecords(
      url(
        RECORDS,
        'select=sum(population) as population__sum, code_reg&group_by=code_reg&limit=100'
      )
    );
    const total = reponse.results.reduce((t, l) => t + Number(l.population__sum), 0);
    expect(total).toBe(SOMME_TOTALE);
    expect(Object.keys(reponse.results[0]).sort()).toEqual(['code_reg', 'population__sum']);
  });

  it('accepte un identifiant backquote (#289)', () => {
    const reponse = repondreOdsRecords(
      url(
        RECORDS,
        `select=sum(\`${CHAMP_PIEGE}\`) as \`${CHAMP_PIEGE}__sum\`, region&group_by=region&limit=100`
      )
    );
    expect(reponse.results[0][`${CHAMP_PIEGE}__sum`]).toBe(JEU[0][CHAMP_PIEGE]);
  });

  it('ment sur total_count quand il y a un group_by — comme le vrai ODS (#641)', () => {
    // 137 groupes distincts, mais total_count vaut la taille de PAGE.
    // L'adaptateur a raison de l'ignorer ; la fixture doit donc mentir aussi,
    // sans quoi la recette validerait un comportement que la production n'a pas.
    const reponse = repondreOdsRecords(
      url(RECORDS, 'select=sum(population) as population__sum, region&group_by=region&limit=100')
    );
    expect(reponse.results).toHaveLength(100);
    expect(reponse.total_count).toBe(100);
    expect(reponse.total_count).not.toBe(NOMBRE_DE_LIGNES);
  });

  it('trie selon order_by', () => {
    const reponse = repondreOdsRecords(url(RECORDS, 'order_by=population DESC&limit=3'));
    expect(reponse.results.map((l) => l.region)).toEqual(
      [...JEU]
        .sort((a, b) => b.population - a.population)
        .slice(0, 3)
        .map((l) => l.region)
    );
  });

  it('filtre un where ODSQL simple, et refuse une clause qu’il ne sait pas lire', () => {
    const egalite = repondreOdsRecords(url(RECORDS, 'where=region = "Val-d\'Oise"&limit=100'));
    expect(egalite.results).toHaveLength(1);

    const seuil = repondreOdsRecords(url(RECORDS, 'where=population > 999000&limit=100'));
    expect(seuil.results).toHaveLength(1);

    // Une fixture qui ignorerait une clause inconnue rendrait le jeu ENTIER :
    // le composant afficherait « trop » de lignes et le test accuserait le
    // pipeline. Mieux vaut echouer bruyamment ici.
    expect(() => filtrerOdsql(JEU, 'region LIKE "Val%"')).toThrow(/non geree/);
  });
});

describe('OpenDataSoft — /exports/json (#689, ADR-106)', () => {
  it('rend un tableau NU, sans enveloppe', () => {
    const reponse = repondreOdsExport(url(EXPORT));
    expect(Array.isArray(reponse)).toBe(true);
    expect(reponse).toHaveLength(NOMBRE_DE_LIGNES);
  });

  it('borne la requete ENTIERE par limit, pas une page', () => {
    // Le mode export demande `plafond + 1` : la reponse compte le plafond
    // plus une ligne, c'est ce depassement qui signale la troncature en
    // l'absence de total_count.
    const plafond = 100;
    const reponse = repondreOdsExport(url(EXPORT, `limit=${plafond + 1}`));
    expect(reponse).toHaveLength(plafond + 1);

    const complet = repondreOdsExport(url(EXPORT, `limit=${NOMBRE_DE_LIGNES + 1}`));
    expect(complet.length).toBe(NOMBRE_DE_LIGNES);
  });

  it('accepte les memes clauses que /records', () => {
    const reponse = repondreOdsExport(
      url(EXPORT, 'select=sum(population) as population__sum, code_reg&group_by=code_reg')
    );
    const total = reponse.reduce((t, l) => t + Number(l.population__sum), 0);
    expect(total).toBe(SOMME_TOTALE);
  });
});

describe('OpenDataSoft — /facets', () => {
  it('rend les valeurs distinctes et leurs comptes', () => {
    const reponse = repondreOdsFacets(url(FACETS, 'facet=code_reg'));
    expect(reponse.facets).toHaveLength(1);
    expect(reponse.facets[0].name).toBe('code_reg');
    const total = reponse.facets[0].facets.reduce((t, v) => t + v.count, 0);
    expect(total).toBe(NOMBRE_DE_LIGNES);
  });

  it('respecte le where de cascade', () => {
    const reponse = repondreOdsFacets(url(FACETS, 'facet=region&where=code_reg = "11"'));
    const total = reponse.facets[0].facets.reduce((t, v) => t + v.count, 0);
    expect(total).toBe(JEU.filter((l) => l.code_reg === '11').length);
  });
});

describe('Tabular', () => {
  it('rend l’enveloppe { data, links, meta }', () => {
    const reponse = repondreTabular(url(TABULAR, `page=1&page_size=${TABULAR_PAGE_SIZE}`));
    expect(reponse.data).toHaveLength(TABULAR_PAGE_SIZE);
    expect(reponse.meta).toEqual({
      page: 1,
      page_size: TABULAR_PAGE_SIZE,
      total: NOMBRE_DE_LIGNES,
    });
    expect(reponse.links.next).toContain('page=2');
  });

  it('ferme la pagination sur la derniere page', () => {
    const derniere = Math.ceil(NOMBRE_DE_LIGNES / TABULAR_PAGE_SIZE);
    const reponse = repondreTabular(
      url(TABULAR, `page=${derniere}&page_size=${TABULAR_PAGE_SIZE}`)
    );
    expect(reponse.links.next).toBeNull();
  });

  it('lit les flags nus colonne__groupby / colonne__sum (#596)', () => {
    // Emis SANS `=` : l'API rejette la forme valuee. `URLSearchParams` les
    // rend avec une valeur vide, ce qui les distingue des parametres values.
    const reponse = repondreTabular(
      url(TABULAR, 'page=1&page_size=50&code_reg__groupby&population__sum')
    );
    expect(reponse.data.length).toBeLessThan(NOMBRE_DE_LIGNES);
    const total = reponse.data.reduce((t, l) => t + Number(l.population__sum), 0);
    expect(total).toBe(SOMME_TOTALE);
  });

  it('trie via colonne__sort', () => {
    const reponse = repondreTabular(url(TABULAR, 'page=1&page_size=3&population__sort=desc'));
    expect(reponse.data[0].region).toBe("Val-d'Oise");
  });

  it('filtre via colonne__operateur', () => {
    const reponse = repondreTabular(url(TABULAR, 'page=1&page_size=50&code_reg__exact=11'));
    expect(reponse.meta.total).toBe(JEU.filter((l) => l.code_reg === '11').length);
  });
});

describe('API generique', () => {
  it('rend un tableau nu, sans enveloppe ni pagination', () => {
    const reponse = repondreGenerique();
    expect(Array.isArray(reponse)).toBe(true);
    expect(reponse).toHaveLength(NOMBRE_DE_LIGNES);
  });
});
