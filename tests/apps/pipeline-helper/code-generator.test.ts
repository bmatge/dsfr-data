import { describe, it, expect, vi } from 'vitest';

vi.mock('@dsfr-data/shared', () => ({
  loadFromStorage: vi.fn(() => []),
  STORAGE_KEYS: { SOURCES: 'dsfr-data-sources' },
}));

import { ClassicPreset } from 'rete';
import { generateCode } from '../../../apps/pipeline-helper/src/code-generator';
import { NODE_FACTORIES } from '../../../apps/pipeline-helper/src/nodes/pipeline-nodes';
import { AttributeControl } from '../../../apps/pipeline-helper/src/nodes/base-node';

describe('pipeline-helper: code generator', () => {
  it('should return placeholder for empty graph', () => {
    const result = generateCode([], []);
    expect(result).toContain('Ajoutez des composants');
  });

  it('should generate HTML for a single source node', () => {
    const source = NODE_FACTORIES.source();
    const apiType = source.controls['api-type'] as AttributeControl;
    apiType.value = 'opendatasoft';
    const baseUrl = source.controls['base-url'] as AttributeControl;
    baseUrl.value = 'https://data.economie.gouv.fr';
    const datasetId = source.controls['dataset-id'] as AttributeControl;
    datasetId.value = 'mon-dataset';

    const code = generateCode([source], []);
    expect(code).toContain('dsfr-data-source');
    expect(code).toContain('api-type="opendatasoft"');
    expect(code).toContain('base-url="https://data.economie.gouv.fr"');
    expect(code).toContain('dataset-id="mon-dataset"');
  });

  it('should generate source= attribute for connected nodes', () => {
    const source = NODE_FACTORIES.source();
    const query = NODE_FACTORIES.query();

    const conn = new ClassicPreset.Connection(source, 'data', query, 'data');

    const code = generateCode([source, query], [conn]);
    expect(code).toContain('source="');
  });

  it('should not generate __output__ components in code', () => {
    const source = NODE_FACTORIES.source();
    const output = NODE_FACTORIES.output();

    const conn = new ClassicPreset.Connection(source, 'data', output, 'data');

    const code = generateCode([source, output], [conn]);
    expect(code).not.toContain('__output__');
  });

  it('should sort nodes by category (source before transform before display)', () => {
    const query = NODE_FACTORIES.query();
    const source = NODE_FACTORIES.source();
    const output = NODE_FACTORIES.output();

    // Pass in wrong order
    const code = generateCode([output, query, source], []);
    const sourceIdx = code.indexOf('dsfr-data-source');
    const queryIdx = code.indexOf('dsfr-data-query');
    expect(sourceIdx).toBeLessThan(queryIdx);
  });

  it('should handle boolean attributes correctly', () => {
    const source = NODE_FACTORIES.source();
    const serverSide = source.controls['server-side'] as AttributeControl;
    serverSide.value = 'true';

    const code = generateCode([source], []);
    // Boolean attrs should appear without value
    expect(code).toMatch(/server-side[^=]/);
  });
});
