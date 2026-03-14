import { describe, it, expect } from 'vitest';
import { getPreviewHTML } from '../../../apps/favorites/src/preview';

describe('getPreviewHTML', () => {
  it('should wrap code in a complete HTML document', () => {
    const result = getPreviewHTML('<div>Test</div>');
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<div>Test</div>');
  });

  it('should include DSFR stylesheet', () => {
    const result = getPreviewHTML('');
    expect(result).toContain('dsfr.min.css');
    expect(result).toContain('dsfr@1.11.2');
  });

  it('should include Chart.js', () => {
    const result = getPreviewHTML('');
    expect(result).toContain('chart.js@4.4.1');
  });

  it('should include DSFR Chart', () => {
    const result = getPreviewHTML('');
    expect(result).toContain('DSFRChart.css');
    expect(result).toContain('DSFRChart.js');
  });

  it('should set French language', () => {
    const result = getPreviewHTML('');
    expect(result).toContain('lang="fr"');
  });

  it('should include the code in the body', () => {
    const code = '<dsfr-data-chart type="bar" source="data"></dsfr-data-chart>';
    const result = getPreviewHTML(code);
    expect(result).toContain(code);
  });
});
