import { describe, it, expect } from 'vitest';
import { SAMPLE_DATASETS, isValidDeptCode, normalizeDeptCode } from '@dsfr-data/shared';

/**
 * Detection du champ de code departement dans le Builder (#610).
 *
 * CE FICHIER EXISTE A CAUSE D'UN FAUX AVERTISSEMENT. « Aucun code
 * departement detecte » apparaissait sur une source qui en contenait
 * parfaitement — des la premiere generation.
 *
 * La cause n'etait PAS la validation, contrairement a l'hypothese de
 * depart : `findDeptCodeField()` inspectait `state.data` EN PRIORITE, or
 * `code-generator.ts` y ecrit le resultat AGREGE apres chaque generation
 * (`state.data = results`). Les champs testes viennent de `state.fields`,
 * qui decrit la SOURCE : aucun ne se retrouvait dans les lignes agregees,
 * `nonEmpty` restait a 0, et la fonction rendait `null`.
 *
 * Ces tests reproduisent la logique de `findDeptCodeField` sur des donnees
 * reelles plutot que d'importer l'app (qui tire tout le DOM du Builder).
 * Le garde-fou textuel en fin de fichier verrouille le site d'appel.
 */

/** La logique de findDeptCodeField, sur des donnees fournies. */
function trouverChampCode(
  data: Record<string, unknown>[],
  fields: { name: string; type: string }[]
): string | null {
  const LOOKS_REGIONAL = /(^|[_-])(reg|region)([_-]|$)|region/i;
  const candidates = fields.filter(
    (f) => (f.type === 'string' || f.type === 'number') && !LOOKS_REGIONAL.test(f.name)
  );
  if (candidates.length === 0) return null;
  const sample = data.slice(0, 50);
  for (const field of candidates) {
    let valid = 0;
    let nonEmpty = 0;
    for (const row of sample) {
      const raw = row[field.name];
      if (raw == null || raw === '') continue;
      nonEmpty++;
      if (isValidDeptCode(normalizeDeptCode(String(raw)))) valid++;
    }
    if (nonEmpty > 0 && valid / nonEmpty >= 0.8) return field.name;
  }
  return null;
}

const champsDe = (rows: Record<string, unknown>[]) =>
  Object.keys(rows[0]).map((name) => ({ name, type: typeof rows[0][name] }));

describe('le jeu d’exemple « Régions de France » est cohérent', () => {
  const regions = SAMPLE_DATASETS.find((d) => d.id === 'regions-france')!;

  it('existe et compte 13 régions métropolitaines', () => {
    expect(regions).toBeDefined();
    expect(regions.rows).toHaveLength(13);
  });

  it('porte des codes RÉGION, pas des codes département', () => {
    // Le jeu annoncait « code departement » et portait le departement
    // chef-lieu de chaque region (75 pour l'Ile-de-France, 69 pour
    // Auvergne-Rhone-Alpes...). Incoherent : un jeu regional decrit par des
    // codes departementaux, et une carte departementale n'aurait colorie que
    // 13 departements isoles.
    const premiere = regions.rows[0] as Record<string, unknown>;

    expect(premiere).toHaveProperty('code_region');
    expect(premiere).not.toHaveProperty('code_dept');
  });

  it('utilise les codes région INSEE attendus par type="map-reg"', () => {
    // Memes codes que l'exemple `direct-map-reg` du Playground, qui rend
    // correctement (11, 84, 75, 76, 32, 93, 44, 52, 53, 28, 27, 24, 94).
    const codes = regions.rows.map((r) => (r as Record<string, unknown>).code_region);

    expect(new Set(codes).size).toBe(13);
    expect(codes).toContain('11'); // Île-de-France
    expect(codes).toContain('94'); // Corse
    expect(codes.every((c) => /^\d{2}$/.test(String(c)))).toBe(true);
  });

  it('sa description ne promet plus de code département', () => {
    expect(regions.description).not.toMatch(/departement/i);
    expect(regions.description).toMatch(/region/i);
  });
});

describe('la détection inspecte les lignes SOURCE, pas le résultat agrégé', () => {
  const source: Record<string, unknown>[] = [
    { region: 'Ile-de-France', population: 12271794, code_dept: '75' },
    { region: 'Auvergne-Rhone-Alpes', population: 8078652, code_dept: '69' },
    { region: 'Occitanie', population: 5924753, code_dept: '31' },
  ];
  const fields = champsDe(source);

  it('trouve le champ dans les lignes source', () => {
    expect(trouverChampCode(source, fields)).toBe('code_dept');
  });

  it('ne le trouve PAS dans un résultat agrégé — la panne d’origine', () => {
    // Ce que `state.data` contient apres une generation : les colonnes de
    // sortie du graphique, sans les champs de la source.
    const agrege = [
      { label: 'Ile-de-France', value: 12271794 },
      { label: 'Auvergne-Rhone-Alpes', value: 8078652 },
    ];

    expect(trouverChampCode(agrege, fields)).toBeNull();
  });

  it('écarte un champ manifestement RÉGIONAL, même à valeurs valides', () => {
    // Les 13 codes region INSEE (11, 84, 75, 76, 32, 93, 44, 52, 53, 28, 27,
    // 24, 94) sont TOUS des codes departement valides. Sans filtre sur le
    // NOM du champ, un jeu regional passait pour departemental : la carte
    // coloriait 13 departements epars, et l'avertissement qui oriente vers la
    // carte des regions ne se declenchait JAMAIS — le message existait pour
    // un scenario qu'il ne voyait pas.
    const regional = [
      { region: 'Ile-de-France', code_region: '11' },
      { region: 'Corse', code_region: '94' },
    ];

    expect(trouverChampCode(regional, champsDe(regional))).toBeNull();
  });

  it('le jeu d’exemple « Régions de France » déclenche donc l’avertissement', () => {
    // Verification de bout en bout sur les vraies donnees livrees.
    const regions = SAMPLE_DATASETS.find((d) => d.id === 'regions-france')!;
    const rows = regions.rows as Record<string, unknown>[];

    expect(trouverChampCode(rows, champsDe(rows))).toBeNull();
  });

  it('n’écarte pas un champ départemental au nom voisin', () => {
    // Le filtre doit rester chirurgical : « code_dept » ne contient pas
    // « region », il ne doit pas etre emporte.
    const dept = [
      { libelle: 'Paris', code_dept: '75' },
      { libelle: 'Rhone', code_dept: '69' },
    ];

    expect(trouverChampCode(dept, champsDe(dept))).toBe('code_dept');
  });
});

describe('les codes non padés ne déclenchent plus de faux avertissement', () => {
  it('une source aux codes 1..13 est reconnue', () => {
    // LE point de la DoD de l'issue, initialement non livre : la carte se
    // rendait parfaitement (le composant padde) pendant que la detection
    // criait « Aucun code departement detecte ».
    const rows = Array.from({ length: 13 }, (_, i) => ({
      libelle: `D${i + 1}`,
      code: String(i + 1),
    }));

    expect(trouverChampCode(rows, champsDe(rows))).toBe('code');
  });

  it('normalizeDeptCode est la source unique du padding', () => {
    expect(normalizeDeptCode('1')).toBe('01');
    expect(normalizeDeptCode(' 9 ')).toBe('09');
    expect(normalizeDeptCode(13)).toBe('13');
    // Ne touche ni a la Corse ni a l'outre-mer.
    expect(normalizeDeptCode('2A')).toBe('2A');
    expect(normalizeDeptCode('971')).toBe('971');
    expect(normalizeDeptCode(null)).toBe('');
  });

  it('la règle de rendu reste stricte — on normalise, on n’assouplit pas', () => {
    // DSFR Chart attend le format INSEE zero-pade : assouplir isValidDeptCode
    // laisserait passer des codes invalides jusqu'au rendu.
    expect(isValidDeptCode('1')).toBe(false);
    expect(isValidDeptCode(normalizeDeptCode('1'))).toBe(true);
  });
});

describe('les codes déjà normalisés restent acceptés', () => {
  it('les codes INSEE zéro-padés du jeu d’exemple sont tous valides', () => {
    // Verification de l'hypothese de depart : ces codes n'ont jamais eu
    // besoin d'etre normalises. Le probleme etait ailleurs.
    for (const code of ['75', '69', '33', '31', '59', '13', '67', '44', '35', '76', '21', '45']) {
      expect(isValidDeptCode(code), code).toBe(true);
    }
    expect(isValidDeptCode('2A')).toBe(true);
  });

  it('un code non padé reste refusé — la règle de rendu ne bouge pas', () => {
    // DSFR Chart attend le format INSEE zero-pade : assouplir ici laisserait
    // passer des codes invalides jusqu'au rendu. La normalisation, quand
    // elle est necessaire, se fait AVANT la validation (dsfr-data-chart).
    expect(isValidDeptCode('1')).toBe(false);
    expect(isValidDeptCode('9')).toBe(false);
  });
});

describe('le site d’appel inspecte bien la bonne source', () => {
  it('findDeptCodeField privilégie state.localData', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(
      join(__dirname, '../../../apps/builder/src/ui/ui-helpers.ts'),
      'utf-8'
    );

    expect(src).toContain('state.localData ?? state.data');
    // L'ordre inverse etait la panne : `state.data` porte l'agrégat.
    expect(src).not.toContain('state.data ?? state.localData');
  });
});
