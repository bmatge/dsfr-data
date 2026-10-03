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
 * Le calcul est refait ici en Web Mercator (tuiles de 256 px), sans Leaflet :
 * position en pixels de l'emprise et du centre au zoom du préréglage, marge
 * à chaque bord du cadre.
 */

/** Carte de l'encart par défaut : 10rem moins 0,5rem de gouttière, 160px de haut. */
const CADRE = { largeur: 152, hauteur: 160 };

/**
 * Emprise des communes de chaque territoire — `[latSud, latNord, lonOuest, lonEst]`,
 * relevée sur geo.api.gouv.fr (`/communes?codeDepartement=…&fields=bbox`) le 2026-10-03.
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

/** Plus petite marge, en pixels, entre l'emprise du territoire et un bord du cadre. */
function margeMinimale(territoire: string): number {
  const [sud, nord, ouest, est] = EMPRISES[territoire];
  const hautGauche = dansLeCadre(territoire, nord, ouest);
  const basDroite = dansLeCadre(territoire, sud, est);
  return Math.min(
    hautGauche.x,
    hautGauche.y,
    CADRE.largeur - basDroite.x,
    CADRE.hauteur - basDroite.y
  );
}

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

  /**
   * État MESURÉ des dix autres préréglages, le 2026-10-03 : tous débordent du
   * cadre par défaut, d'un niveau de zoom (douze pour la Polynésie, centrée
   * sur Tahiti). Ils ne sont pas recalés ici — AM-102 ne nomme que deux
   * territoires, et changer les autres déplace les encarts de pages
   * existantes : la décision est rendue à #1229. La liste se tient à jour
   * toute seule : recaler un préréglage fait tomber ce test, qui demande
   * alors de l'en retirer.
   */
  it('les préréglages qui débordent encore sont connus et nommés', () => {
    const debordent = Object.keys(TERRITORY_PRESETS)
      .filter((t) => margeMinimale(t) < 0)
      .sort();
    expect(debordent).toEqual([
      'corse',
      'guadeloupe',
      'guyane',
      'martinique',
      'mayotte',
      'nouvelle-caledonie',
      'polynesie-francaise',
      'saint-barthelemy',
      'saint-martin',
      'saint-pierre-et-miquelon',
    ]);
  });
});
