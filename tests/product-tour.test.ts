import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  shouldShowTour,
  markTourComplete,
  resetTour,
  getToursState,
  isToursDisabled,
  setToursDisabled,
} from '@dsfr-data/shared';
import { STORAGE_KEYS } from '@dsfr-data/shared';

// The product-tour module keeps a `_legacyMigrated` latch that we need to
// reset between tests to re-exercise the legacy-key migration path.
async function freshImport(): Promise<typeof import('@dsfr-data/shared')> {
  vi.resetModules();
  return await import('@dsfr-data/shared');
}

describe('product-tour state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shouldShowTour returns true when no state exists', () => {
    expect(shouldShowTour('builder')).toBe(true);
  });

  it('markTourComplete + shouldShowTour (same version) returns false', () => {
    markTourComplete('builder', 1);
    expect(shouldShowTour('builder', 1)).toBe(false);
  });

  it('shouldShowTour returns true when stored version is lower than requested', () => {
    markTourComplete('builder', 1);
    expect(shouldShowTour('builder', 2)).toBe(true);
  });

  it('shouldShowTour returns false when stored version is greater or equal', () => {
    markTourComplete('builder', 3);
    expect(shouldShowTour('builder', 2)).toBe(false);
    expect(shouldShowTour('builder', 3)).toBe(false);
  });

  it('resetTour removes the entry and makes shouldShowTour true again', () => {
    markTourComplete('builder', 1);
    resetTour('builder');
    expect(shouldShowTour('builder', 1)).toBe(true);
  });

  it('setToursDisabled(true) blocks shouldShowTour even for unseen tours', () => {
    setToursDisabled(true);
    expect(shouldShowTour('builder')).toBe(false);
    expect(isToursDisabled()).toBe(true);
  });

  it('setToursDisabled(false) re-enables auto-start', () => {
    setToursDisabled(true);
    setToursDisabled(false);
    expect(shouldShowTour('builder')).toBe(true);
    expect(isToursDisabled()).toBe(false);
  });

  it('disabled flag persists alongside seen tours', () => {
    markTourComplete('builder', 1);
    setToursDisabled(true);
    const state = getToursState();
    expect(state.disabled).toBe(true);
    expect(state.tours.builder).toBeTruthy();
    expect(state.tours.builder.version).toBe(1);
  });

  it('migrates legacy flat format { tourId: ISO } on first read', async () => {
    localStorage.setItem(
      STORAGE_KEYS.TOURS,
      JSON.stringify({ builder: '2026-04-10T12:00:00.000Z' })
    );
    const mod = await freshImport();
    expect(mod.shouldShowTour('builder', 1)).toBe(false);
    const state = mod.getToursState();
    expect(state.tours.builder.version).toBe(1);
    expect(state.tours.builder.at).toBe('2026-04-10T12:00:00.000Z');
  });

  it('migrates legacy per-tour keys (dsfr-data-tour-*) into the unified state', async () => {
    localStorage.setItem('dsfr-data-tour-sources', '2026-04-10T09:00:00.000Z');
    const mod = await freshImport();
    expect(mod.shouldShowTour('sources', 1)).toBe(false);
    expect(localStorage.getItem('dsfr-data-tour-sources')).toBeNull();
  });
});
