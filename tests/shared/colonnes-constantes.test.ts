/**
 * Total repete par entite (#1123) : `inspect_data` signale les colonnes
 * numeriques constantes pour chaque valeur d'une colonne entite.
 *
 * Constat du banc de pertinence : la consigne seule (« verifie si elle est
 * constante ») n'a jamais suffi (0/2 sur « Aides nationales »). Le detecteur
 * donne le FAIT au modele ; ces tests en fixent la portee (cas positif,
 * negatifs, jeu vide, colonnes nombreuses) et les bornes.
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeDataFields,
  constantColumnsByEntity,
  describeConstantColumns,
  estColonneCoordonnee,
  inspectData,
  type Row,
} from '../../packages/shared/src/ia/data-tools';
import {
  AIDES_NATIONALES,
  ETABLISSEMENTS,
  MUSEES,
  POPULATION_REGIONS,
} from '../../tools/banc-studio/fixtures';

function detecter(data: Row[]) {
  return constantColumnsByEntity(data, analyzeDataFields(data));
}

describe('constantColumnsByEntity — cas positif', () => {
  it('« Nombre total d’actions » est constant pour chaque Ville (Aides nationales)', () => {
    const constantes = detecter(AIDES_NATIONALES);
    expect(constantes).toContainEqual({ field: "Nombre total d'actions", entity: 'Ville' });
  });

  it('une entite equivalente (Departement, en bijection avec Ville) n’est pas rapportee deux fois', () => {
    const constantes = detecter(AIDES_NATIONALES);
    expect(constantes.map((c) => c.entity)).not.toContain('Département');
    // Ordre des colonnes : resultat deterministe.
    expect(constantes).toEqual(detecter(AIDES_NATIONALES));
  });

  it('inspect_data porte le signal, en une ligne lisible par colonne', () => {
    const texte = inspectData(AIDES_NATIONALES, analyzeDataFields(AIDES_NATIONALES));
    expect(texte).toContain('Valeurs répétées par entité');
    expect(texte).toContain(
      "« Nombre total d'actions » est constant pour chaque « Ville » : attribut de l'entité Ville, pas de la ligne."
    );
    expect(texte).toContain('ni les sommer');
  });

  it('sans types analyses, la detection numerique prend le relais', () => {
    const constantes = constantColumnsByEntity(AIDES_NATIONALES, []);
    expect(constantes).toContainEqual({ field: "Nombre total d'actions", entity: 'Ville' });
  });
});

describe('constantColumnsByEntity — cas negatifs', () => {
  it('rien sur les autres jeux du banc (valeurs propres a chaque ligne)', () => {
    for (const jeu of [ETABLISSEMENTS, MUSEES, POPULATION_REGIONS]) {
      expect(detecter(jeu)).toEqual([]);
      expect(inspectData(jeu, analyzeDataFields(jeu))).not.toContain('Valeurs répétées');
    }
  });

  it('une colonne qui varie dans une meme ville n’est pas signalee', () => {
    const data = AIDES_NATIONALES.map((r, i) => ({ ...r, "Nombre total d'actions": i }));
    expect(detecter(data).map((c) => c.field)).not.toContain("Nombre total d'actions");
  });

  it('une constante GLOBALE ne dit rien d’une entite', () => {
    const data = AIDES_NATIONALES.map((r) => ({ ...r, "Nombre total d'actions": 7 }));
    expect(detecter(data).map((c) => c.field)).not.toContain("Nombre total d'actions");
  });

  it('une seule entite repetee ne suffit pas (preuve trop mince)', () => {
    const data: Row[] = [
      { Ville: 'A', total: 3 },
      { Ville: 'A', total: 3 },
      { Ville: 'B', total: 1 },
      { Ville: 'C', total: 2 },
    ];
    expect(detecter(data)).toEqual([]);
  });

  it('une colonne presque unique n’est pas une entite (constance triviale)', () => {
    const data: Row[] = Array.from({ length: 10 }, (_, i) => ({
      Nom: i < 2 ? 'X' : `N${i}`,
      mesure: i < 2 ? 5 : i * 10,
    }));
    expect(detecter(data)).toEqual([]);
  });
});

describe('constantColumnsByEntity — bornes', () => {
  it('jeu vide ou trop petit : rien, et inspect_data inchange', () => {
    expect(constantColumnsByEntity([], [])).toEqual([]);
    expect(detecter([{ Ville: 'A', total: 1 }])).toEqual([]);
    expect(inspectData([], [])).toMatch(/Aucune donnee/);
    expect(describeConstantColumns([])).toBe('');
  });

  it('colonnes nombreuses : calcul borne, signal plafonne a 8 lignes', () => {
    // 200 colonnes numeriques, toutes constantes par Ville : le signal ne
    // doit ni exploser le prompt ni parcourir sans fin.
    const villes = ['A', 'B', 'C', 'D'];
    const data: Row[] = Array.from({ length: 40 }, (_, i) => {
      const ville = villes[i % villes.length];
      const ligne: Row = { Ville: ville };
      for (let c = 0; c < 200; c++) ligne[`col${c}`] = villes.indexOf(ville) * 10 + c;
      return ligne;
    });
    const debut = Date.now();
    const constantes = detecter(data);
    expect(Date.now() - debut).toBeLessThan(1000);
    expect(constantes).toHaveLength(8);
    expect(constantes.every((c) => c.entity === 'Ville')).toBe(true);
    const texte = inspectData(data, analyzeDataFields(data));
    expect(texte.split('\n').filter((l) => l.includes('est constant pour chaque'))).toHaveLength(8);
  });

  it('entites nombreuses : au plus 12 colonnes texte examinees', () => {
    // 30 colonnes texte candidates ; seule `t<position>` groupe les lignes de
    // sorte que `mesure` y soit constante. Examinee en 6e position, elle est
    // signalee ; en 21e, au-dela de la borne, elle ne l'est pas.
    const jeu = (position: number): Row[] =>
      Array.from({ length: 8 }, (_, i) => {
        const ligne: Row = {};
        for (let c = 0; c < 30; c++) {
          ligne[`t${c}`] = c === position ? `g${i % 2}` : `v${Math.floor(i / 2) % 2}`;
        }
        ligne.mesure = (i % 2) + 1;
        return ligne;
      });
    expect(detecter(jeu(5))).toEqual([{ field: 'mesure', entity: 't5' }]);
    expect(detecter(jeu(20))).toEqual([]);
  });
});

describe('constantColumnsByEntity — coordonnees exclues', () => {
  it('Latitude et Longitude, constantes par ville par nature, ne sont jamais signalees', () => {
    // Mutation : retirer le filtre `estColonneCoordonnee` → Latitude/Longitude
    // reviennent dans le signal et dans la note « À noter » hors carte.
    const champs = detecter(AIDES_NATIONALES).map((c) => c.field);
    expect(champs).not.toContain('Latitude');
    expect(champs).not.toContain('Longitude');
    expect(champs).toContain("Nombre total d'actions");
  });

  it.each([
    ['Latitude', true],
    ['Longitude (WGS84)', true],
    ['consolidated_latitude', true],
    ['lon_wgs84', true],
    ['lng', true],
    ['LAT', true],
    ['coord_x', true],
    ['Nombre total d’actions', false],
    ['Population', false],
    ['Longueur', false],
    ['Plateau', false],
  ])('estColonneCoordonnee(%j) = %s', (nom, attendu) => {
    expect(estColonneCoordonnee(nom)).toBe(attendu);
  });
});
