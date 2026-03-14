import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateAccessibleTable } from '../../../apps/builder/src/ui/accessible-table';
import { state } from '../../../apps/builder/src/state';

describe('updateAccessibleTable', () => {
  let capturedEvents: CustomEvent[];
  let handler: EventListener;

  beforeEach(() => {
    capturedEvents = [];
    // Remove previous listener if any
    if (handler) document.removeEventListener('dsfr-data-loaded', handler);
    handler = ((e: CustomEvent) => {
      capturedEvents.push(e);
    }) as EventListener;
    document.addEventListener('dsfr-data-loaded', handler);

    state.data = [];
    state.labelField = '';
    state.a11yEnabled = false;
    state.a11yTable = true;
    state.a11yDownload = true;
    state.a11yDescription = '';
    document.body.innerHTML = '<dsfr-data-a11y id="a11y-preview" source="builder-preview" no-auto-aria style="display: none;"></dsfr-data-a11y>';
  });

  it('should do nothing when element is missing', () => {
    document.body.innerHTML = '';
    state.a11yEnabled = true;
    expect(() => updateAccessibleTable()).not.toThrow();
  });

  it('should hide element when a11yEnabled is false', () => {
    state.a11yEnabled = false;
    updateAccessibleTable();
    const el = document.getElementById('a11y-preview')!;
    expect(el.style.display).toBe('none');
    expect(capturedEvents).toHaveLength(0);
  });

  it('should show element when a11yEnabled is true', () => {
    state.a11yEnabled = true;
    state.data = [{ name: 'Test', value: 10 }];
    updateAccessibleTable();
    const el = document.getElementById('a11y-preview')!;
    expect(el.style.display).toBe('');
  });

  it('should set table attribute when a11yTable is true', () => {
    state.a11yEnabled = true;
    state.a11yTable = true;
    updateAccessibleTable();
    const el = document.getElementById('a11y-preview')!;
    expect(el.hasAttribute('table')).toBe(true);
  });

  it('should remove table attribute when a11yTable is false', () => {
    state.a11yEnabled = true;
    state.a11yTable = false;
    updateAccessibleTable();
    const el = document.getElementById('a11y-preview')!;
    expect(el.hasAttribute('table')).toBe(false);
  });

  it('should set download attribute when a11yDownload is true', () => {
    state.a11yEnabled = true;
    state.a11yDownload = true;
    updateAccessibleTable();
    const el = document.getElementById('a11y-preview')!;
    expect(el.hasAttribute('download')).toBe(true);
  });

  it('should remove download attribute when a11yDownload is false', () => {
    state.a11yEnabled = true;
    state.a11yDownload = false;
    updateAccessibleTable();
    const el = document.getElementById('a11y-preview')!;
    expect(el.hasAttribute('download')).toBe(false);
  });

  it('should set description attribute when provided', () => {
    state.a11yEnabled = true;
    state.a11yDescription = 'Mon graphique montre les donnees.';
    updateAccessibleTable();
    const el = document.getElementById('a11y-preview')!;
    expect(el.getAttribute('description')).toBe('Mon graphique montre les donnees.');
  });

  it('should remove description attribute when empty', () => {
    state.a11yEnabled = true;
    state.a11yDescription = '';
    updateAccessibleTable();
    const el = document.getElementById('a11y-preview')!;
    expect(el.hasAttribute('description')).toBe(false);
  });

  it('should set label-field from state', () => {
    state.a11yEnabled = true;
    state.labelField = 'region';
    updateAccessibleTable();
    const el = document.getElementById('a11y-preview')!;
    expect(el.getAttribute('label-field')).toBe('region');
  });

  it('should dispatch data to builder-preview source', () => {
    state.a11yEnabled = true;
    state.data = [
      { region: 'Bretagne', value: 100 },
      { region: 'Normandie', value: 200 },
    ];
    updateAccessibleTable();
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0].detail.sourceId).toBe('builder-preview');
    expect(capturedEvents[0].detail.data).toEqual(state.data);
  });

  it('should dispatch empty array when no data', () => {
    state.a11yEnabled = true;
    state.data = [];
    updateAccessibleTable();
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0].detail.sourceId).toBe('builder-preview');
    expect(capturedEvents[0].detail.data).toEqual([]);
  });
});
