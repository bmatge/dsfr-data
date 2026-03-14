import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toggleIAConfig, loadIAConfig, saveIAConfig, getIAConfig } from '../../../apps/builder-ia/src/ia/ia-config';
import type { IAConfig } from '../../../apps/builder-ia/src/ia/ia-config';
import * as toast from '../../../packages/shared/src/ui/toast';

describe('builder-ia ia-config', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div id="ia-config-content"></div>
      <div id="ia-config-arrow"></div>
      <input id="ia-api-url" value="https://albert.api.etalab.gouv.fr/v1" />
      <select id="ia-model"><option value="albert-small">albert-small</option></select>
      <input id="ia-token" value="" />
      <textarea id="ia-system-prompt">Tu es un assistant</textarea>
    `;
  });

  describe('IAConfig type', () => {
    it('should have expected shape', () => {
      const config: IAConfig = {
        apiUrl: 'https://example.com',
        model: 'albert-small',
        token: 'tok-123',
        systemPrompt: 'You are helpful',
      };
      expect(config.apiUrl).toBe('https://example.com');
      expect(config.model).toBe('albert-small');
      expect(config.token).toBe('tok-123');
      expect(config.systemPrompt).toBe('You are helpful');
    });
  });

  describe('toggleIAConfig', () => {
    it('should toggle the open class on config content', () => {
      const content = document.getElementById('ia-config-content')!;
      expect(content.classList.contains('open')).toBe(false);

      toggleIAConfig();
      expect(content.classList.contains('open')).toBe(true);

      toggleIAConfig();
      expect(content.classList.contains('open')).toBe(false);
    });

    it('should rotate arrow when opened', () => {
      const arrow = document.getElementById('ia-config-arrow')!;
      toggleIAConfig();
      expect(arrow.style.transform).toBe('rotate(180deg)');
    });

    it('should reset arrow when closed', () => {
      const arrow = document.getElementById('ia-config-arrow')!;
      toggleIAConfig(); // open
      toggleIAConfig(); // close
      expect(arrow.style.transform).toBe('');
    });
  });

  describe('loadIAConfig', () => {
    it('should do nothing when no saved config', () => {
      const input = document.getElementById('ia-api-url') as HTMLInputElement;
      const originalValue = input.value;
      loadIAConfig();
      expect(input.value).toBe(originalValue);
    });

    it('should load saved config into form fields', () => {
      const saved: IAConfig = {
        apiUrl: 'https://custom.api.com',
        model: 'albert-small',
        token: 'my-token-123',
        systemPrompt: 'Custom prompt',
      };
      localStorage.setItem('dsfr-data-ia-config', JSON.stringify(saved));

      loadIAConfig();

      expect((document.getElementById('ia-api-url') as HTMLInputElement).value).toBe('https://custom.api.com');
      expect((document.getElementById('ia-token') as HTMLInputElement).value).toBe('my-token-123');
      expect((document.getElementById('ia-system-prompt') as HTMLTextAreaElement).value).toBe('Custom prompt');
    });

    it('should handle partial config gracefully', () => {
      localStorage.setItem('dsfr-data-ia-config', JSON.stringify({ token: 'only-token' }));
      loadIAConfig();
      expect((document.getElementById('ia-token') as HTMLInputElement).value).toBe('only-token');
    });

    it('should handle invalid JSON gracefully', () => {
      localStorage.setItem('dsfr-data-ia-config', 'not-json');
      expect(() => loadIAConfig()).not.toThrow();
    });
  });

  describe('saveIAConfig', () => {
    it('should save form values to localStorage', () => {
      (document.getElementById('ia-api-url') as HTMLInputElement).value = 'https://test.api.com';
      (document.getElementById('ia-token') as HTMLInputElement).value = 'test-token';

      vi.spyOn(toast, 'toastSuccess').mockImplementation(() => {});
      saveIAConfig();

      const saved = JSON.parse(localStorage.getItem('dsfr-data-ia-config')!);
      expect(saved.apiUrl).toBe('https://test.api.com');
      expect(saved.token).toBe('test-token');
    });

    it('should show confirmation toast', () => {
      const successSpy = vi.spyOn(toast, 'toastSuccess').mockImplementation(() => {});
      saveIAConfig();
      expect(successSpy).toHaveBeenCalledWith('Configuration sauvegardee !');
    });
  });

  describe('getIAConfig', () => {
    it('should return current form values without saving', () => {
      (document.getElementById('ia-api-url') as HTMLInputElement).value = 'https://live.api.com';
      (document.getElementById('ia-model') as HTMLSelectElement).value = 'albert-small';
      (document.getElementById('ia-token') as HTMLInputElement).value = 'live-token';
      (document.getElementById('ia-system-prompt') as HTMLTextAreaElement).value = 'Live prompt';

      const config = getIAConfig();
      expect(config.apiUrl).toBe('https://live.api.com');
      expect(config.model).toBe('albert-small');
      expect(config.token).toBe('live-token');
      expect(config.systemPrompt).toBe('Live prompt');

      // Should NOT have saved to localStorage
      expect(localStorage.getItem('dsfr-data-ia-config')).toBeNull();
    });
  });
});
