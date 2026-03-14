import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { appHref, navigateTo } from '../../packages/shared/src/ui/navigation';

describe('navigation', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete (window as any).location;
    (window as any).location = {
      pathname: '/apps/builder/',
      href: '',
      assign: vi.fn(),
    };
  });

  afterEach(() => {
    (window as any).location = originalLocation;
  });

  describe('appHref', () => {
    it('should return correct path from /apps/builder/', () => {
      expect(appHref('playground')).toBe('../../apps/playground/index.html');
    });

    it('should return correct path for builder-ia', () => {
      expect(appHref('builder-ia')).toBe('../../apps/builder-ia/index.html');
    });

    it('should return correct path for favorites', () => {
      expect(appHref('favorites')).toBe('../../apps/favorites/index.html');
    });

    it('should return correct path for sources', () => {
      expect(appHref('sources')).toBe('../../apps/sources/index.html');
    });

    it('should return correct path for builder', () => {
      expect(appHref('builder')).toBe('../../apps/builder/index.html');
    });

    it('should append query params', () => {
      expect(appHref('playground', { from: 'builder' })).toBe('../../apps/playground/index.html?from=builder');
    });

    it('should use ./ prefix from root-level pages', () => {
      (window as any).location.pathname = '/index.html';
      expect(appHref('playground')).toBe('./apps/playground/index.html');
    });

    it('should use ../../ prefix from nested app pages', () => {
      (window as any).location.pathname = '/apps/favorites/index.html';
      expect(appHref('builder')).toBe('../../apps/builder/index.html');
    });

    it('should return correct path for dashboard', () => {
      expect(appHref('dashboard')).toBe('../../apps/dashboard/index.html');
    });

    it('should return # for unknown app', () => {
      expect(appHref('nonexistent' as any)).toBe('#');
    });
  });

  describe('navigateTo', () => {
    it('should set window.location.href', () => {
      navigateTo('playground', { from: 'builder' });
      expect(window.location.href).toBe('../../apps/playground/index.html?from=builder');
    });

    it('should navigate without params', () => {
      navigateTo('sources');
      expect(window.location.href).toBe('../../apps/sources/index.html');
    });
  });
});
