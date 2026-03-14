import { describe, it, expect, beforeEach, vi } from 'vitest';
import { switchTab, toggleSection, copyCode, openInPlayground } from '../../../apps/builder-ia/src/ui/ui-helpers';
import * as toast from '../../../packages/shared/src/ui/toast';

describe('builder-ia ui-helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('toggleSection', () => {
    it('should toggle collapsed class on the section', () => {
      document.body.innerHTML = '<div id="my-section"></div>';
      const section = document.getElementById('my-section')!;
      expect(section.classList.contains('collapsed')).toBe(false);

      toggleSection('my-section');
      expect(section.classList.contains('collapsed')).toBe(true);

      toggleSection('my-section');
      expect(section.classList.contains('collapsed')).toBe(false);
    });

    it('should do nothing for non-existent section', () => {
      expect(() => toggleSection('nonexistent')).not.toThrow();
    });
  });

  describe('copyCode', () => {
    it('should copy generated code to clipboard', async () => {
      document.body.innerHTML = '<pre id="generated-code">const x = 42;</pre>';

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });
      vi.spyOn(window, 'alert').mockImplementation(() => {});

      copyCode();
      expect(writeTextMock).toHaveBeenCalledWith('const x = 42;');
    });
  });

  describe('openInPlayground', () => {
    it('should show warning toast when no code is generated', () => {
      document.body.innerHTML = '<pre id="generated-code">// Le code sera genere</pre>';
      const warnSpy = vi.spyOn(toast, 'toastWarning').mockImplementation(() => {});

      openInPlayground();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should store code in sessionStorage when valid code present', () => {
      document.body.innerHTML = '<pre id="generated-code">valid chart code here</pre>';

      // Mock location to prevent jsdom navigation error
      const originalLocation = window.location;
      delete (window as any).location;
      (window as any).location = { href: '', pathname: '/apps/builder-ia/', assign: vi.fn() };

      openInPlayground();
      expect(sessionStorage.getItem('playground-code')).toBe('valid chart code here');

      // Restore
      (window as any).location = originalLocation;
    });
  });

  describe('switchTab', () => {
    it('should call setActiveTab on preview panel element', () => {
      const mockSetActiveTab = vi.fn();
      const el = document.createElement('app-preview-panel');
      (el as any).setActiveTab = mockSetActiveTab;
      document.body.appendChild(el);

      switchTab('code');
      expect(mockSetActiveTab).toHaveBeenCalledWith('code');
    });

    it('should do nothing when no preview panel', () => {
      expect(() => switchTab('code')).not.toThrow();
    });
  });
});
