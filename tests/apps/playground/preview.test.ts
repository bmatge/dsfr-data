import { describe, it, expect } from 'vitest';
import { getPreviewHTML } from '../../../apps/playground/src/preview';

describe('playground preview', () => {
  it('should wrap code in a complete HTML document', () => {
    const result = getPreviewHTML('<div>Test</div>');
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<div>Test</div>');
  });

  it('should include DSFR styles', () => {
    const result = getPreviewHTML('');
    expect(result).toContain('dsfr.min.css');
  });

  it('ne charge pas Chart.js a part — DSFR Chart l’embarque (#656)', () => {
    const result = getPreviewHTML('');
    expect(result).not.toMatch(/chart\.js@|chart\.umd/);
  });

  it('should include DSFR Chart', () => {
    const result = getPreviewHTML('');
    expect(result).toContain('DSFRChart');
  });

  it('should set French language', () => {
    const result = getPreviewHTML('');
    expect(result).toContain('lang="fr"');
  });
});
