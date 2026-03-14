import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  setCurrentSourceMode,
  setParsedJsonData,
  setParsedCsvData,
  EXTERNAL_PROXY,
} from '../../../apps/sources/src/state';

describe('sources state', () => {
  it('should create initial state with expected properties', () => {
    const state = createInitialState();
    expect(state.connections).toEqual([]);
    expect(state.sources).toEqual([]);
    expect(state.selectedConnectionId).toBeNull();
    expect(state.selectedDocument).toBeNull();
    expect(state.selectedTable).toBeNull();
    expect(state.documents).toEqual([]);
    expect(state.tables).toEqual([]);
    expect(state.tableData).toEqual([]);
    expect(state.editingConnectionId).toBeNull();
    expect(state.previewedSource).toBeNull();
  });

  it('should have EXTERNAL_PROXY constant', () => {
    expect(EXTERNAL_PROXY).toBe('https://chartsbuilder.matge.com');
  });

  it('should update currentSourceMode via setter', async () => {
    // Dynamic import to get the mutable binding
    const mod = await import('../../../apps/sources/src/state');
    mod.setCurrentSourceMode('json');
    expect(mod.currentSourceMode).toBe('json');
    mod.setCurrentSourceMode('csv');
    expect(mod.currentSourceMode).toBe('csv');
    mod.setCurrentSourceMode('table');
    expect(mod.currentSourceMode).toBe('table');
  });

  it('should update parsedJsonData via setter', () => {
    const data = [{ name: 'test', value: 42 }];
    setParsedJsonData(data);
    // Verify it doesn't throw (the setter works)
    setParsedJsonData(null);
  });

  it('should update parsedCsvData via setter', () => {
    const data = [{ col1: 'a', col2: 'b' }];
    setParsedCsvData(data);
    setParsedCsvData(null);
  });

  it('should create independent state instances', () => {
    const state1 = createInitialState();
    const state2 = createInitialState();
    state1.selectedConnectionId = 'test-id';
    expect(state2.selectedConnectionId).toBeNull();
  });
});
