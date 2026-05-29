import { describe, it, expect } from 'vitest';
import { parseGristDocRef } from '../../../apps/sources/src/connections/connection-manager';

describe('parseGristDocRef', () => {
  it('parses a gouv UI URL with /o/{org}/ prefix', () => {
    expect(
      parseGristDocRef(
        'https://grist.numerique.gouv.fr/o/planification-ecologique/jGd2ge4dy2ZM/Barometre/'
      )
    ).toEqual({ baseUrl: 'https://grist.numerique.gouv.fr', docId: 'jGd2ge4dy2ZM' });
  });

  it('parses a UI URL without org prefix (docs.getgrist.com)', () => {
    expect(parseGristDocRef('https://docs.getgrist.com/jGd2ge4dy2ZM/MonDoc')).toEqual({
      baseUrl: 'https://docs.getgrist.com',
      docId: 'jGd2ge4dy2ZM',
    });
  });

  it('parses an API records URL', () => {
    expect(
      parseGristDocRef(
        'https://grist.numerique.gouv.fr/api/docs/jGd2ge4dy2ZM/tables/Indicateurs/records'
      )
    ).toEqual({ baseUrl: 'https://grist.numerique.gouv.fr', docId: 'jGd2ge4dy2ZM' });
  });

  it('accepts a bare docId and defaults to the gouv server', () => {
    expect(parseGristDocRef('jGd2ge4dy2ZM')).toEqual({
      baseUrl: 'https://grist.numerique.gouv.fr',
      docId: 'jGd2ge4dy2ZM',
    });
  });

  it('tolerates a trailing slash on the org-prefixed URL', () => {
    expect(parseGristDocRef('https://grist.numerique.gouv.fr/o/org/abc123/')).toEqual({
      baseUrl: 'https://grist.numerique.gouv.fr',
      docId: 'abc123',
    });
  });

  it('returns null for empty or unparsable input', () => {
    expect(parseGristDocRef('')).toBeNull();
    expect(parseGristDocRef('   ')).toBeNull();
    expect(parseGristDocRef('not a url with spaces')).toBeNull();
  });
});
