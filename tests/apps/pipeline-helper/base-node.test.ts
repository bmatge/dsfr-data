import { describe, it, expect, vi } from 'vitest';

vi.mock('@dsfr-data/shared', () => ({
  loadFromStorage: vi.fn(() => []),
  STORAGE_KEYS: { SOURCES: 'dsfr-data-sources' },
}));

import { PipelineNode, AttributeControl, StatusControl, SavedSourceSelector } from '../../../apps/pipeline-helper/src/nodes/base-node';
import { NODE_CONFIGS } from '../../../apps/pipeline-helper/src/nodes/node-configs';

describe('AttributeControl', () => {
  it('should initialize with default value', () => {
    const ctrl = new AttributeControl({ name: 'test', label: 'Test', type: 'text', default: 'hello' });
    expect(ctrl.value).toBe('hello');
  });

  it('should initialize with empty string when no default', () => {
    const ctrl = new AttributeControl({ name: 'test', label: 'Test', type: 'text' });
    expect(ctrl.value).toBe('');
  });

  it('setValue should update value and call onChange', () => {
    const ctrl = new AttributeControl({ name: 'test', label: 'Test', type: 'text' });
    const onChange = vi.fn();
    ctrl.onChange = onChange;

    ctrl.setValue('world');
    expect(ctrl.value).toBe('world');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('setOptions should switch to select type and notify', () => {
    const ctrl = new AttributeControl({ name: 'test', label: 'Test', type: 'text' });
    const onChange = vi.fn();
    ctrl.onChange = onChange;

    ctrl.setOptions([{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]);
    expect(ctrl.def.type).toBe('select');
    expect(ctrl.def.options).toHaveLength(2);
    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe('StatusControl', () => {
  it('should start idle', () => {
    const ctrl = new StatusControl();
    expect(ctrl.result.status).toBe('idle');
  });

  it('update should set result and call onChange', () => {
    const ctrl = new StatusControl();
    const onChange = vi.fn();
    ctrl.onChange = onChange;

    ctrl.update({ status: 'success', fields: ['a', 'b'], rowCount: 10 });
    expect(ctrl.result.status).toBe('success');
    expect(ctrl.result.fields).toEqual(['a', 'b']);
    expect(ctrl.result.rowCount).toBe(10);
    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe('SavedSourceSelector', () => {
  it('should initialize with empty value', () => {
    const ctrl = new SavedSourceSelector();
    expect(ctrl.value).toBe('');
  });

  it('setValue should update and notify', () => {
    const ctrl = new SavedSourceSelector();
    const onChange = vi.fn();
    ctrl.onChange = onChange;

    ctrl.setValue('source-1');
    expect(ctrl.value).toBe('source-1');
    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe('PipelineNode', () => {
  it('should create controls from config attributes', () => {
    const node = new PipelineNode(NODE_CONFIGS.source);
    expect(node.controls['api-type']).toBeInstanceOf(AttributeControl);
    expect(node.controls['base-url']).toBeInstanceOf(AttributeControl);
    expect(node.controls['dataset-id']).toBeInstanceOf(AttributeControl);
  });

  it('should always have a StatusControl', () => {
    const node = new PipelineNode(NODE_CONFIGS.query);
    expect(node.controls['__status__']).toBeInstanceOf(StatusControl);
  });

  it('getAttributes should return only non-empty values', () => {
    const node = new PipelineNode(NODE_CONFIGS.source);
    (node.controls['api-type'] as AttributeControl).value = 'opendatasoft';
    (node.controls['base-url'] as AttributeControl).value = '';

    const attrs = node.getAttributes();
    expect(attrs['api-type']).toBe('opendatasoft');
    expect(attrs['base-url']).toBeUndefined();
  });

  it('should set width and height for Rete layout', () => {
    const node = new PipelineNode(NODE_CONFIGS.output);
    expect(node.width).toBeGreaterThan(0);
    expect(node.height).toBeGreaterThan(0);
  });
});
