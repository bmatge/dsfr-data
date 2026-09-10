import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Fonds administratifs livres dans le paquet npm (#688) : `dsfr-data/geo/*`
 * hors bundle. Verifie le contrat de publication (exports/files), la forme
 * des GeoJSON (18 regions, 101 departements, proprietes `code`/`nom`) et la
 * presence de la licence dans le README du dossier.
 */

const CORE = resolve(__dirname, '../packages/core');
const GEO = resolve(CORE, 'geo');

interface FeatureCollection {
  type: string;
  features: Array<{
    type: string;
    properties: Record<string, string>;
    geometry: { type: string; coordinates: unknown };
  }>;
}

const load = (file: string): FeatureCollection =>
  JSON.parse(readFileSync(resolve(GEO, file), 'utf8')) as FeatureCollection;

describe('paquet npm : dsfr-data/geo (#688)', () => {
  const pkg = JSON.parse(readFileSync(resolve(CORE, 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>;
    files: string[];
  };

  it('expose ./geo/* dans exports (import.meta.resolve("dsfr-data/geo/regions.json"))', () => {
    expect(pkg.exports['./geo/*']).toBe('./geo/*');
  });

  it('publie le dossier geo/ (files)', () => {
    expect(pkg.files).toContain('geo/');
  });

  it('le README du dossier cite la source Etalab et la Licence Ouverte 2.0', () => {
    const readme = readFileSync(resolve(GEO, 'README.md'), 'utf8');
    expect(readme).toContain('Etalab');
    expect(readme).toContain('Licence Ouverte');
    expect(readme).toContain('2.0');
    expect(readme).toContain('scripts/fetch-geo.mjs');
  });

  it('les GeoJSON sont exclus de prettier (une ligne, compares octet a octet)', () => {
    const ignore = readFileSync(resolve(__dirname, '../.prettierignore'), 'utf8');
    expect(ignore).toContain('packages/core/geo/*.json');
    expect(existsSync(resolve(__dirname, '../scripts/fetch-geo.mjs'))).toBe(true);
  });
});

describe('regions.json', () => {
  const geo = load('regions.json');

  it('FeatureCollection des 18 regions, triees par code', () => {
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features).toHaveLength(18);
    const codes = geo.features.map((f) => f.properties.code);
    expect(codes).toEqual([...codes].sort());
    expect(codes).toContain('01'); // Guadeloupe
    expect(codes).toContain('11'); // Ile-de-France
    expect(codes).toContain('94'); // Corse
    expect(codes).not.toContain('975'); // COM ecartees
  });

  it('chaque entite porte code + nom et une geometrie surfacique', () => {
    for (const f of geo.features) {
      expect(f.type).toBe('Feature');
      expect(Object.keys(f.properties).sort()).toEqual(['code', 'nom']);
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry.type);
    }
  });

  it('reste leger : moins de 200 Ko', () => {
    expect(readFileSync(resolve(GEO, 'regions.json')).length).toBeLessThan(200 * 1024);
  });
});

describe('departements.json', () => {
  const geo = load('departements.json');

  it('FeatureCollection des 101 departements (2A/2B, DROM inclus)', () => {
    expect(geo.features).toHaveLength(101);
    const codes = geo.features.map((f) => f.properties.code);
    for (const c of ['01', '2A', '2B', '75', '95', '971', '974', '976']) expect(codes).toContain(c);
    expect(codes).not.toContain('975');
  });

  it('chaque entite porte code, nom et region', () => {
    for (const f of geo.features) {
      expect(Object.keys(f.properties).sort()).toEqual(['code', 'nom', 'region']);
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry.type);
    }
  });

  it('reste leger : moins de 400 Ko', () => {
    expect(readFileSync(resolve(GEO, 'departements.json')).length).toBeLessThan(400 * 1024);
  });
});
