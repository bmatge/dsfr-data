/**
 * Reconnaissance d'une URL de jeu (#1140) — la voie UNIQUE partagee par la
 * creation d'une connexion (app Sources) et l'outil `charger_source_url` du
 * Studio IA. Pure : aucun reseau.
 */
import { describe, it, expect } from 'vitest';
import {
  reconnaitreUrlSource,
  parseGristDocRef,
  estHoteGrist,
  FORMATS_URL_RECONNUS,
} from '../../packages/shared/src/providers/reconnaissance-url.js';

describe('reconnaitreUrlSource', () => {
  it('Opendatasoft sur domaine propre : page explore → URL d’API records', () => {
    const r = reconnaitreUrlSource(
      'https://data.economie.gouv.fr/explore/dataset/les-jeunes-entreprises-innovantes/table/'
    );
    expect(r.kind).toBe('api');
    if (r.kind !== 'api') return;
    expect(r.resolved.provider.id).toBe('opendatasoft');
    expect(r.resolved.ids).toEqual({ datasetId: 'les-jeunes-entreprises-innovantes' });
    expect(r.resolved.apiUrl).toBe(
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/les-jeunes-entreprises-innovantes/records'
    );
  });

  it('Opendatasoft : URL d’API déjà formée sur *.opendatasoft.com', () => {
    const r = reconnaitreUrlSource(
      'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/geonames/records?limit=5'
    );
    expect(r.kind).toBe('api');
    if (r.kind === 'api') expect(r.resolved.ids).toEqual({ datasetId: 'geonames' });
  });

  it('data.gouv.fr : permalien de ressource → API tabulaire', () => {
    const r = reconnaitreUrlSource(
      'https://www.data.gouv.fr/fr/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503'
    );
    expect(r.kind).toBe('api');
    if (r.kind !== 'api') return;
    expect(r.resolved.provider.id).toBe('tabular');
    expect(r.resolved.apiUrl).toBe(
      'https://tabular-api.data.gouv.fr/api/resources/2876a346-d50c-4911-934e-19ee07b0e503/data/'
    );
  });

  it('data.gouv.fr : page d’un jeu → aiguillage vers ses ressources', () => {
    expect(reconnaitreUrlSource('https://www.data.gouv.fr/fr/datasets/prenoms-de-france/')).toEqual(
      { kind: 'datagouv-jeu', slug: 'prenoms-de-france' }
    );
  });

  it('data.gouv.fr sans jeu : racine', () => {
    expect(reconnaitreUrlSource('https://www.data.gouv.fr/fr/').kind).toBe('datagouv-racine');
  });

  it('Grist : page de partage → document, sans table', () => {
    const r = reconnaitreUrlSource(
      'https://grist.numerique.gouv.fr/o/mon-org/jGd2ge4dy2ZM/Barometre/'
    );
    expect(r.kind).toBe('grist');
    if (r.kind !== 'grist') return;
    expect(r.ref).toEqual({ baseUrl: 'https://grist.numerique.gouv.fr', docId: 'jGd2ge4dy2ZM' });
    expect(r.tableId).toBeNull();
  });

  it('Grist : URL d’API → document ET table', () => {
    const r = reconnaitreUrlSource(
      'https://docs.getgrist.com/api/docs/abc123/tables/Indicateurs/records'
    );
    expect(r.kind).toBe('grist');
    if (r.kind === 'grist') expect(r.tableId).toBe('Indicateurs');
  });

  it('INSEE Melodi', () => {
    const r = reconnaitreUrlSource('https://api.insee.fr/melodi/data/DS_RP_POPULATION_PRINC');
    expect(r.kind).toBe('api');
    if (r.kind === 'api') expect(r.resolved.provider.id).toBe('insee');
  });

  it('URL quelconque : inconnue', () => {
    expect(reconnaitreUrlSource('https://exemple.fr/donnees.csv').kind).toBe('inconnue');
    expect(reconnaitreUrlSource('pas une url').kind).toBe('inconnue');
  });

  it('parseGristDocRef et estHoteGrist restent exposés', () => {
    expect(parseGristDocRef('jGd2ge4dy2ZM')?.docId).toBe('jGd2ge4dy2ZM');
    expect(estHoteGrist('docs.getgrist.com')).toBe(true);
    expect(estHoteGrist('data.economie.gouv.fr')).toBe(false);
  });

  it('chaque format annoncé est reconnu (sauf ses gabarits <…>)', () => {
    expect(FORMATS_URL_RECONNUS.length).toBeGreaterThanOrEqual(5);
    for (const f of FORMATS_URL_RECONNUS) expect(f.exemple).toMatch(/^https:\/\//);
  });
});
