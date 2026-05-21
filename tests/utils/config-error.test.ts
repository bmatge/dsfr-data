import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportConfigError, clearConfigError } from '@/utils/config-error.js';

describe('config-error utility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reportConfigError sets the data-dsfr-config-error attribute', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('div');
    reportConfigError(el, 'dsfr-data-foo', 'attribut "id" requis');
    expect(el.getAttribute('data-dsfr-config-error')).toBe('attribut "id" requis');
  });

  it('reportConfigError logs to console.error with prefixed component name', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('div');
    reportConfigError(el, 'dsfr-data-foo', 'attribut "id" requis');
    expect(errorSpy).toHaveBeenCalledWith('dsfr-data-foo: attribut "id" requis');
  });

  it('reportConfigError returns the message (for storing in component state)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('div');
    const result = reportConfigError(el, 'dsfr-data-foo', 'attribut "source" requis');
    expect(result).toBe('attribut "source" requis');
  });

  it('clearConfigError removes the data-dsfr-config-error attribute', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('div');
    reportConfigError(el, 'dsfr-data-foo', 'error');
    expect(el.hasAttribute('data-dsfr-config-error')).toBe(true);
    clearConfigError(el);
    expect(el.hasAttribute('data-dsfr-config-error')).toBe(false);
  });

  it('clearConfigError is a no-op when no error was set', () => {
    const el = document.createElement('div');
    expect(() => clearConfigError(el)).not.toThrow();
    expect(el.hasAttribute('data-dsfr-config-error')).toBe(false);
  });
});
