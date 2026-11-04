/**
 * Tests purs de `server/src/utils/source-upstream.ts` (ADR-165, #1361) :
 * sans MariaDB, joués par `npm run test:run`.
 *
 * Ce que l'on garde : l'URL amont est FIXÉE par la configuration enregistrée,
 * jamais par un paramètre ; la clé va dans l'en-tête Authorization, jamais
 * dans l'URL ; rien d'autre que `https` ; un jeton est un UUID.
 */
import { describe, it, expect } from 'vitest';
import {
  isPublishableSource,
  isWellFormedToken,
  resolveGristUpstream,
} from '../../server/src/utils/source-upstream';

describe('isPublishableSource', () => {
  it('publie une table Grist à clé, à connexion ou déclarée non publique', () => {
    expect(isPublishableSource('grist', { apiKey: 'k' })).toBe(true);
    expect(isPublishableSource('grist', { connectionId: 'c1' })).toBe(true);
    expect(isPublishableSource('grist', { isPublic: false })).toBe(true);
  });

  it('refuse ce qui est déjà lisible sans l’instance', () => {
    expect(isPublishableSource('grist', { isPublic: true })).toBe(false);
    expect(isPublishableSource('grist', { apiKey: '   ' })).toBe(false);
    expect(isPublishableSource('api', { apiKey: 'k' })).toBe(false);
    expect(isPublishableSource('manual', { apiKey: 'k' })).toBe(false);
    expect(isPublishableSource('grist', null)).toBe(false);
  });
});

describe('resolveGristUpstream', () => {
  const config = { documentId: 'doc1', tableId: 'Table1', apiKey: 'cle-source' };

  it('rebâtit l’URL depuis la connexion (document + table), clé de la connexion en Bearer', () => {
    const up = resolveGristUpstream(config, {
      url: 'https://grist.numerique.gouv.fr',
      apiKey: 'cle-connexion',
    });
    expect(up?.url).toBe('https://grist.numerique.gouv.fr/api/docs/doc1/tables/Table1/records');
    expect(up?.headers.Authorization).toBe('Bearer cle-connexion');
    expect(up?.url).not.toContain('cle-');
  });

  it('retombe sur la clé de la source quand la connexion n’en a pas', () => {
    const up = resolveGristUpstream(config, {
      url: 'https://grist.numerique.gouv.fr',
      apiKey: null,
    });
    expect(up?.headers.Authorization).toBe('Bearer cle-source');
  });

  it('sans clé du tout : pas d’en-tête Authorization (document public)', () => {
    const up = resolveGristUpstream(
      { documentId: 'doc1', tableId: 'Table1' },
      { url: 'https://grist.numerique.gouv.fr' }
    );
    expect(up?.headers.Authorization).toBeUndefined();
  });

  it('sans connexion : lit apiUrl de la source, chemin Grist seulement, requête ignorée', () => {
    const up = resolveGristUpstream(
      { apiUrl: 'https://docs.getgrist.com/api/docs/d/tables/T/records?limit=5#x', apiKey: 'k' },
      null
    );
    expect(up?.url).toBe('https://docs.getgrist.com/api/docs/d/tables/T/records');
  });

  it('refuse une apiUrl qui n’est pas une table Grist, ou hors https', () => {
    expect(resolveGristUpstream({ apiUrl: 'https://docs.getgrist.com/api/orgs' }, null)).toBeNull();
    expect(
      resolveGristUpstream({ apiUrl: 'http://docs.getgrist.com/api/docs/d/tables/T/records' }, null)
    ).toBeNull();
    expect(
      resolveGristUpstream(
        { apiUrl: 'https://u:p@docs.getgrist.com/api/docs/d/tables/T/records' },
        null
      )
    ).toBeNull();
  });

  it('refuse une connexion hors https même avec document et table', () => {
    expect(resolveGristUpstream(config, { url: 'http://grist.interne' })).toBeNull();
    expect(resolveGristUpstream(config, { url: 'https://grist.interne:8484' })).toBeNull();
  });

  it('encode document et table dans le chemin', () => {
    const up = resolveGristUpstream(
      { documentId: 'a/b', tableId: 'T 1' },
      { url: 'https://grist.numerique.gouv.fr' }
    );
    expect(up?.url).toBe('https://grist.numerique.gouv.fr/api/docs/a%2Fb/tables/T%201/records');
  });

  it('rend null sans configuration', () => {
    expect(resolveGristUpstream(null, null)).toBeNull();
    expect(resolveGristUpstream({}, null)).toBeNull();
  });
});

describe('isWellFormedToken', () => {
  it('accepte un UUID v4, refuse le reste', () => {
    expect(isWellFormedToken('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isWellFormedToken('3F2A9C1E-5B7D-4E8A-9C21-7D4E5F6A8B90')).toBe(true);
    expect(isWellFormedToken('abc')).toBe(false);
    expect(isWellFormedToken('3f2a9c1e5b7d4e8a9c217d4e5f6a8b90')).toBe(false);
    expect(isWellFormedToken("' OR 1=1 --")).toBe(false);
    expect(isWellFormedToken(undefined)).toBe(false);
  });
});
