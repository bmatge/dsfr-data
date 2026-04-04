import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @dsfr-data/shared
vi.mock('@dsfr-data/shared', () => ({
  loadFromStorage: vi.fn(() => []),
  STORAGE_KEYS: { SOURCES: 'dsfr-data-sources' },
}));

// Import after mock
import { NODE_CONFIGS } from '../../../apps/pipeline-helper/src/nodes/node-configs';
import { NODE_FACTORIES } from '../../../apps/pipeline-helper/src/nodes/pipeline-nodes';

describe('pipeline-helper: node configs', () => {
  it('should define all expected node types', () => {
    const expectedTypes = ['source', 'normalize', 'query', 'join', 'search', 'facets', 'output', 'a11y'];
    for (const type of expectedTypes) {
      expect(NODE_CONFIGS[type]).toBeDefined();
      expect(NODE_CONFIGS[type].component).toBeTruthy();
      expect(NODE_CONFIGS[type].category).toBeTruthy();
    }
  });

  it('should not include display-specific configs (chart, list, kpi, etc.)', () => {
    expect(NODE_CONFIGS['chart']).toBeUndefined();
    expect(NODE_CONFIGS['list']).toBeUndefined();
    expect(NODE_CONFIGS['kpi']).toBeUndefined();
    expect(NODE_CONFIGS['display']).toBeUndefined();
    expect(NODE_CONFIGS['podium']).toBeUndefined();
  });

  it('output node should use __output__ virtual component', () => {
    expect(NODE_CONFIGS.output.component).toBe('__output__');
    expect(NODE_CONFIGS.output.category).toBe('display');
  });

  it('source config should have api-type, base-url, dataset-id attributes', () => {
    const attrs = NODE_CONFIGS.source.attributes.map(a => a.name);
    expect(attrs).toContain('api-type');
    expect(attrs).toContain('base-url');
    expect(attrs).toContain('dataset-id');
  });

  it('query config should have group-by, order-by, filter (aggregate is a special control)', () => {
    const attrs = NODE_CONFIGS.query.attributes.map(a => a.name);
    expect(attrs).toContain('group-by');
    expect(attrs).toContain('order-by');
    expect(attrs).toContain('filter');
  });

  it('query node should have an AggregateControl', () => {
    const node = NODE_FACTORIES.query();
    expect(node.controls['aggregate']).toBeDefined();
    expect(node.controls['aggregate'].constructor.name).toBe('AggregateControl');
  });

  it('normalize config should have numeric, rename, flatten, trim attributes', () => {
    const attrs = NODE_CONFIGS.normalize.attributes.map(a => a.name);
    expect(attrs).toContain('numeric');
    expect(attrs).toContain('rename');
    expect(attrs).toContain('flatten');
    expect(attrs).toContain('trim');
  });

  it('join config should have on, type, prefix-left, prefix-right', () => {
    const attrs = NODE_CONFIGS.join.attributes.map(a => a.name);
    expect(attrs).toContain('on');
    expect(attrs).toContain('type');
    expect(attrs).toContain('prefix-left');
    expect(attrs).toContain('prefix-right');
  });
});

describe('pipeline-helper: node factories', () => {
  it('should have a factory for each config', () => {
    for (const type of Object.keys(NODE_CONFIGS)) {
      expect(NODE_FACTORIES[type], `factory missing for ${type}`).toBeDefined();
    }
  });

  it('source node should have data output and command input', () => {
    const node = NODE_FACTORIES.source();
    expect(node.outputs['data']).toBeDefined();
    expect(node.inputs['command']).toBeDefined();
  });

  it('query node should have data input and data output', () => {
    const node = NODE_FACTORIES.query();
    expect(node.inputs['data']).toBeDefined();
    expect(node.outputs['data']).toBeDefined();
  });

  it('normalize node should have data input and data output', () => {
    const node = NODE_FACTORIES.normalize();
    expect(node.inputs['data']).toBeDefined();
    expect(node.outputs['data']).toBeDefined();
  });

  it('join node should have left and right inputs and data output', () => {
    const node = NODE_FACTORIES.join();
    expect(node.inputs['left']).toBeDefined();
    expect(node.inputs['right']).toBeDefined();
    expect(node.outputs['data']).toBeDefined();
  });

  it('output node should have data input only', () => {
    const node = NODE_FACTORIES.output();
    expect(node.inputs['data']).toBeDefined();
    expect(Object.keys(node.outputs)).toHaveLength(0);
  });

  it('search and facets should have data input and command output', () => {
    for (const type of ['search', 'facets']) {
      const node = NODE_FACTORIES[type]();
      expect(node.inputs['data']).toBeDefined();
      expect(node.outputs['command']).toBeDefined();
    }
  });

  it('source node should have SavedSourceSelector control', () => {
    const node = NODE_FACTORIES.source();
    expect(node.controls['__saved-source__']).toBeDefined();
  });

  it('all nodes should have a StatusControl', () => {
    for (const type of Object.keys(NODE_FACTORIES)) {
      const node = NODE_FACTORIES[type]();
      expect(node.controls['__status__'], `${type} missing StatusControl`).toBeDefined();
    }
  });
});
