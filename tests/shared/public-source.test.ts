/**
 * Source publiée (ADR-165, #1361) : helpers d'adresse côté apps.
 */
import { describe, it, expect } from 'vitest';
import {
  authenticatedSourceRecordsPath,
  isPublishedSource,
  publicSourceRecordsUrl,
} from '../../packages/shared/src/api/public-source';
import { PROXY_BASE_URL_EMBED } from '../../packages/shared/src/api/proxy-config';
import { migrateSource, serializeSourceForServer } from '../../packages/shared/src/types/source';

const TOKEN = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';

describe('isPublishedSource', () => {
  it('vrai pour un jeton UUID, faux sinon', () => {
    expect(isPublishedSource({ publicToken: TOKEN })).toBe(true);
    expect(isPublishedSource({ publicToken: null })).toBe(false);
    expect(isPublishedSource({ publicToken: 'pas-un-uuid' })).toBe(false);
    expect(isPublishedSource({})).toBe(false);
    expect(isPublishedSource(null)).toBe(false);
  });
});

describe('publicSourceRecordsUrl', () => {
  it('est absolue, sur l’origine de l’instance, et porte le jeton', () => {
    const url = publicSourceRecordsUrl(TOKEN);
    const origin = PROXY_BASE_URL_EMBED || window.location.origin;
    expect(url).toBe(`${origin}/api/public/sources/${TOKEN}/records`);
  });

  it('la route authentifiée reste relative (jamais dans un code emporté)', () => {
    expect(authenticatedSourceRecordsPath('grist_d_T')).toBe('/api/sources/grist_d_T/records');
    expect(authenticatedSourceRecordsPath('a/b')).toBe('/api/sources/a%2Fb/records');
  });
});

describe('publicToken sur Source', () => {
  it('va et vient par config_json', () => {
    const packed = serializeSourceForServer({
      id: 's1',
      name: 'T',
      type: 'grist',
      publicToken: TOKEN,
    });
    expect((packed.configJson as Record<string, unknown>).publicToken).toBe(TOKEN);
    const back = migrateSource({
      id: 's1',
      name: 'T',
      type: 'grist',
      config_json: { publicToken: TOKEN },
    } as never);
    expect(back.publicToken).toBe(TOKEN);
  });
});
