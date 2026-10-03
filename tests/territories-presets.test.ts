import { describe, it, expect } from 'vitest';
import { TERRITORY_PRESETS } from '@/utils/territories.js';

/**
 * AM-102 (banc d'essai open-data-viz, #1229) — un préréglage d'encart promet
 * un « cadrage territoire entier » : son emprise RÉELLE doit tenir dans la
 * carte de l'encart par défaut, au centre et au zoom qu'il donne.
 *
 * Constat d'origine : `la-reunion` (zoom 9) coupait le sud de l'île —
 * Saint-Pierre hors cadre —, `wallis-et-futuna` (zoom 7) laissait Wallis ET
 * Futuna hors cadre, dans un encart de 160 px.
 *
 * #1245 a étendu le contrôle aux neuf autres préréglages, qui débordaient
 * tous d'un niveau de zoom, et les a recalés par la même méthode : centre au
 * milieu de l'emprise en Mercator, plus grand zoom entier où elle tient.
 * `polynesie-francaise` est l'exception voulue (arbitrage du 2026-10-04).
 *
 * Le calcul est refait ici en Web Mercator (tuiles de 256 px), sans Leaflet :
 * position en pixels de l'emprise et du centre au zoom du préréglage, marge
 * à chaque bord du cadre.
 */

/** Carte de l'encart par défaut : 10rem moins 0,5rem de gouttière, 160px de haut. */
const CADRE = { largeur: 152, hauteur: 160 };

/**
 * Emprise des communes de chaque territoire — `[latSud, latNord, lonOuest, lonEst]`,
 * relevée sur geo.api.gouv.fr (`/communes?codeDepartement=…&fields=bbox`) le 2026-10-03,
 * relevée à nouveau à l'identique le 2026-10-04 (#1245).
 */
const EMPRISES: Record<string, [number, number, number, number]> = {
  guadeloupe: [15.832, 16.514, -61.81, -61.002],
  martinique: [14.389, 14.879, -61.229, -60.81],
  guyane: [2.111, 5.749, -54.602, -51.619],
  'la-reunion': [-21.39, -20.872, 55.217, 55.837],
  mayotte: [-13.005, -12.637, 45.018, 45.3],
  'saint-pierre-et-miquelon': [46.749, 47.144, -56.519, -56.119],
  'saint-martin': [18.046, 18.125, -63.153, -62.971],
  'saint-barthelemy': [17.871, 17.974, -62.927, -62.789],
  'nouvelle-caledonie': [-22.882, -19.525, 163.57, 168.134],
  'polynesie-francaise': [-27.9, -7.859, -154.723, -134.452],
  'wallis-et-futuna': [-14.362, -13.217, -178.182, -176.162],
  corse: [41.334, 43.028, 8.535, 9.56],
};

function versPixels(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const monde = 256 * 2 ** zoom;
  const phi = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * monde,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * monde,
  };
}

/** Position d'un point dans le cadre du préréglage, origine en haut à gauche. */
function dansLeCadre(territoire: string, lat: number, lon: number): { x: number; y: number } {
  const { center, zoom } = TERRITORY_PRESETS[territoire];
  const [clat, clon] = center.split(',').map(Number);
  const centre = versPixels(clat, clon, zoom);
  const point = versPixels(lat, lon, zoom);
  return {
    x: point.x - centre.x + CADRE.largeur / 2,
    y: point.y - centre.y + CADRE.hauteur / 2,
  };
}

/** Marges, en pixels, entre l'emprise du territoire et chaque bord du cadre. */
function marges(
  territoire: string,
  zoom = TERRITORY_PRESETS[territoire].zoom
): { gauche: number; droite: number; haut: number; bas: number } {
  const [sud, nord, ouest, est] = EMPRISES[territoire];
  const [clat, clon] = TERRITORY_PRESETS[territoire].center.split(',').map(Number);
  const centre = versPixels(clat, clon, zoom);
  const hautGauche = versPixels(nord, ouest, zoom);
  const basDroite = versPixels(sud, est, zoom);
  return {
    gauche: hautGauche.x - centre.x + CADRE.largeur / 2,
    droite: CADRE.largeur / 2 - (basDroite.x - centre.x),
    haut: hautGauche.y - centre.y + CADRE.hauteur / 2,
    bas: CADRE.hauteur / 2 - (basDroite.y - centre.y),
  };
}

/** Plus petite marge, en pixels, entre l'emprise du territoire et un bord du cadre. */
function margeMinimale(territoire: string, zoom?: number): number {
  const m = marges(territoire, zoom);
  return Math.min(m.gauche, m.droite, m.haut, m.bas);
}

/**
 * L'exception VOULUE (arbitrage du 2026-10-04, #1245) : la Polynésie française
 * cadre Tahiti et Moorea, pas le territoire.
 */
const EXCEPTION_VOULUE = 'polynesie-francaise';

/** Les neuf préréglages recalés par #1245. */
const RECALES_1245 = [
  'corse',
  'guadeloupe',
  'guyane',
  'martinique',
  'mayotte',
  'nouvelle-caledonie',
  'saint-barthelemy',
  'saint-martin',
  'saint-pierre-et-miquelon',
];

describe('AM-102 — préréglages d’encart : le territoire tient dans 160 px', () => {
  it('chaque préréglage a une emprise de référence', () => {
    expect(Object.keys(EMPRISES).sort()).toEqual(Object.keys(TERRITORY_PRESETS).sort());
  });

  it.each(['la-reunion', 'wallis-et-futuna'])(
    '%s : toute l’emprise est dans le cadre, avec au moins 10 px de marge',
    (territoire) => {
      expect(margeMinimale(territoire)).toBeGreaterThanOrEqual(10);
    }
  );

  it('La Réunion : un point à Saint-Pierre est dans le cadre', () => {
    const p = dansLeCadre('la-reunion', -21.3393, 55.4781);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(CADRE.largeur);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(CADRE.hauteur);
  });

  it.each([
    ['Mata-Utu (Wallis)', -13.2825, -176.1736],
    ['Leava (Futuna)', -14.2933, -178.1583],
  ])('Wallis-et-Futuna : %s est dans le cadre', (_nom, lat, lon) => {
    const p = dansLeCadre('wallis-et-futuna', lat, lon);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(CADRE.largeur);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(CADRE.hauteur);
  });

  it.each(RECALES_1245)('%s : toute l’emprise est dans le cadre (#1245)', (territoire) => {
    expect(margeMinimale(territoire)).toBeGreaterThanOrEqual(0);
  });

  /**
   * Le zoom est le PLUS GRAND qui cadre : un cran de plus, et l'emprise
   * déborde. Sans cette moitié, un préréglage dézoomé de trois crans — un
   * territoire réduit à un point — passerait le contrôle précédent.
   */
  it.each([...RECALES_1245, 'la-reunion', 'wallis-et-futuna'])(
    '%s : au zoom supérieur, l’emprise déborde',
    (territoire) => {
      expect(margeMinimale(territoire, TERRITORY_PRESETS[territoire].zoom + 1)).toBeLessThan(0);
    }
  );

  /** Le centre est le milieu de l'emprise : les marges opposées sont égales, à l'arrondi du centre près. */
  it.each(RECALES_1245)('%s : l’emprise est centrée dans le cadre', (territoire) => {
    const m = marges(territoire);
    expect(Math.abs(m.gauche - m.droite)).toBeLessThanOrEqual(4);
    expect(Math.abs(m.haut - m.bas)).toBeLessThanOrEqual(4);
  });

  /**
   * Deux préréglages tiennent de JUSTESSE, mesuré : la Guadeloupe (Basse-Terre
   * à l'ouest, La Désirade à l'est) à 2 px des bords latéraux, Saint-Martin à
   * 8 px. Le zoom inférieur diviserait le territoire par deux pour quelques
   * pixels de marge : la méthode garde le plus grand zoom qui cadre. Les sept
   * autres ont au moins 10 px.
   */
  it('les préréglages à marge mince sont connus et nommés', () => {
    const minces = RECALES_1245.filter((t) => margeMinimale(t) < 10).sort();
    expect(minces).toEqual(['guadeloupe', 'saint-martin']);
  });

  /**
   * Un seul préréglage déborde, et c'est un CHOIX (arbitrage du 2026-10-04,
   * #1245) : `polynesie-francaise` cadre Tahiti et Moorea. Le territoire
   * s'étend sur vingt degrés de latitude et de longitude ; entier, il demande
   * le zoom 3, où aucune île n'est lisible dans 160 px, alors que Tahiti et
   * Moorea portent l'essentiel de la population. La liste se tient à jour
   * toute seule : un préréglage ajouté ou recalé de travers la fait tomber.
   */
  it('le seul préréglage qui déborde est l’exception voulue', () => {
    const debordent = Object.keys(TERRITORY_PRESETS)
      .filter((t) => margeMinimale(t) < 0)
      .sort();
    expect(debordent).toEqual([EXCEPTION_VOULUE]);
  });

  it('Polynésie française : Tahiti et Moorea sont dans le cadre, le territoire entier demanderait le zoom 3', () => {
    // Papeete, Taravao (isthme), Teahupoo (presqu'île), Moorea (Haapiti, à l'ouest)
    for (const [lat, lon] of [
      [-17.535, -149.5696],
      [-17.733, -149.303],
      [-17.847, -149.267],
      [-17.56, -149.87],
    ]) {
      const p = dansLeCadre(EXCEPTION_VOULUE, lat, lon);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(CADRE.largeur);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(CADRE.hauteur);
    }
    // Le territoire entier : plus grand zoom où son emprise tient, autour de son milieu.
    const [sud, nord, ouest, est] = EMPRISES[EXCEPTION_VOULUE];
    const tient = (zoom: number): boolean => {
      const hg = versPixels(nord, ouest, zoom);
      const bd = versPixels(sud, est, zoom);
      return bd.x - hg.x <= CADRE.largeur && bd.y - hg.y <= CADRE.hauteur;
    };
    expect(tient(3)).toBe(true);
    expect(tient(4)).toBe(false);
  });
});
