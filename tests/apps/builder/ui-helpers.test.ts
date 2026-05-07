import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toggleSection, switchTab, saveFavorite } from '../../../apps/builder/src/ui/ui-helpers';
import { state, FAVORITES_KEY } from '../../../apps/builder/src/state';

describe('builder ui-helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('toggleSection', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="section-chart" class="config-section collapsed">
          <div class="config-section-header">Chart Type</div>
          <div class="config-section-body">content</div>
        </div>
        <div id="section-data" class="config-section">
          <div class="config-section-header">Data</div>
          <div class="config-section-body">content</div>
        </div>
        <div id="section-style" class="config-section collapsed">
          <div class="config-section-header">Style</div>
          <div class="config-section-body">content</div>
        </div>
        <div id="section-actions" class="config-section">
          <div class="config-section-body">no header here</div>
        </div>
      `;
    });

    it('should open a collapsed section', () => {
      const section = document.getElementById('section-chart')!;
      expect(section.classList.contains('collapsed')).toBe(true);

      toggleSection('section-chart');
      expect(section.classList.contains('collapsed')).toBe(false);
    });

    it('should close an open section', () => {
      const section = document.getElementById('section-data')!;
      expect(section.classList.contains('collapsed')).toBe(false);

      toggleSection('section-data');
      expect(section.classList.contains('collapsed')).toBe(true);
    });

    it('should close other sections when opening one (accordion behavior)', () => {
      const chartSection = document.getElementById('section-chart')!;
      const dataSection = document.getElementById('section-data')!;
      const styleSection = document.getElementById('section-style')!;

      // section-data is open, section-chart and section-style are collapsed
      expect(dataSection.classList.contains('collapsed')).toBe(false);
      expect(chartSection.classList.contains('collapsed')).toBe(true);

      // Open section-chart (currently collapsed) -> should close others
      toggleSection('section-chart');

      expect(chartSection.classList.contains('collapsed')).toBe(false);
      expect(dataSection.classList.contains('collapsed')).toBe(true);
      expect(styleSection.classList.contains('collapsed')).toBe(true);
    });

    it('should not close sections without a header', () => {
      const actionsSection = document.getElementById('section-actions')!;
      expect(actionsSection.classList.contains('collapsed')).toBe(false);

      // Open a collapsed section, triggering accordion close of others
      toggleSection('section-chart');

      // section-actions has no .config-section-header, so it should stay open
      expect(actionsSection.classList.contains('collapsed')).toBe(false);
    });

    it('should do nothing if section does not exist', () => {
      expect(() => toggleSection('nonexistent')).not.toThrow();

      // Verify no DOM changes occurred
      const sections = document.querySelectorAll('.config-section');
      const collapsedCount = document.querySelectorAll('.config-section.collapsed').length;
      expect(sections.length).toBe(4);
      expect(collapsedCount).toBe(2);
    });
  });

  describe('switchTab', () => {
    it('should call setActiveTab on the preview panel element', () => {
      const mockSetActiveTab = vi.fn();
      const el = document.createElement('app-preview-panel');
      (el as any).setActiveTab = mockSetActiveTab;
      document.body.appendChild(el);

      switchTab('code');
      expect(mockSetActiveTab).toHaveBeenCalledWith('code');
    });

    it('should do nothing if preview panel element is missing', () => {
      expect(() => switchTab('code')).not.toThrow();
    });
  });

  describe('saveFavorite payload (issue #149)', () => {
    beforeEach(() => {
      localStorage.clear();
      document.body.innerHTML = `
        <pre id="generated-code"></pre>
        <button class="preview-panel-save-btn">Save</button>
      `;
      document.getElementById('generated-code')!.textContent =
        '<dsfr-data-chart type="bar"></dsfr-data-chart>';
      state.title = 'Test chart';
      state.chartType = 'bar';
      // happy-dom does not provide window.prompt by default
      (window as unknown as { prompt: (msg?: string, def?: string) => string | null }).prompt = vi
        .fn()
        .mockReturnValue('My favorite');
    });

    it('writes sourceApp and builderStateJson (not the legacy field names)', () => {
      saveFavorite();

      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      expect(stored).toHaveLength(1);
      const fav = stored[0];

      // New names (server-aligned)
      expect(fav.sourceApp).toBe('builder');
      expect(fav.builderStateJson).toBeDefined();
      expect(fav.builderStateJson.chartType).toBe('bar');

      // Legacy names must NOT be written anymore
      expect(fav.source).toBeUndefined();
      expect(fav.builderState).toBeUndefined();
    });

    it('does not save when generated code is the placeholder', () => {
      document.getElementById('generated-code')!.textContent =
        '// Le code sera g\u00e9n\u00e9r\u00e9 ici...';

      saveFavorite();

      expect(localStorage.getItem(FAVORITES_KEY)).toBeNull();
    });
  });
});
