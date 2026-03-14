import { describe, it, expect, beforeEach } from 'vitest';
import { openModal, closeModal, setupModalOverlayClose } from '../../packages/shared/src/ui/modal';

describe('modal helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('openModal', () => {
    it('should add active class to element', () => {
      document.body.innerHTML = '<div id="test-modal"></div>';
      openModal('test-modal');
      expect(document.getElementById('test-modal')!.classList.contains('active')).toBe(true);
    });

    it('should not throw when element does not exist', () => {
      expect(() => openModal('nonexistent')).not.toThrow();
    });
  });

  describe('closeModal', () => {
    it('should remove active class from element', () => {
      document.body.innerHTML = '<div id="test-modal" class="active"></div>';
      closeModal('test-modal');
      expect(document.getElementById('test-modal')!.classList.contains('active')).toBe(false);
    });

    it('should not throw when element does not exist', () => {
      expect(() => closeModal('nonexistent')).not.toThrow();
    });
  });

  describe('setupModalOverlayClose', () => {
    it('should close modal when clicking on overlay', () => {
      document.body.innerHTML = '<div id="test-modal" class="active"><div class="content">inner</div></div>';
      setupModalOverlayClose('test-modal');

      const modal = document.getElementById('test-modal')!;
      modal.click();

      expect(modal.classList.contains('active')).toBe(false);
    });

    it('should not close modal when clicking on inner content', () => {
      document.body.innerHTML = '<div id="test-modal" class="active"><div class="content">inner</div></div>';
      setupModalOverlayClose('test-modal');

      const inner = document.querySelector('.content') as HTMLElement;
      inner.click();

      expect(document.getElementById('test-modal')!.classList.contains('active')).toBe(true);
    });
  });
});
