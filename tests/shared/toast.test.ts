import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast, toastSuccess, toastError, toastWarning, toastInfo } from '../../packages/shared/src/ui/toast';

describe('toast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a toast container on first call', () => {
    showToast('Hello');
    const container = document.getElementById('dsfr-data-toast-container');
    expect(container).not.toBeNull();
    expect(container!.getAttribute('aria-live')).toBe('polite');
  });

  it('should reuse the existing container', () => {
    showToast('First');
    showToast('Second');
    const containers = document.querySelectorAll('#dsfr-data-toast-container');
    expect(containers).toHaveLength(1);
    expect(containers[0].querySelectorAll('.fr-alert')).toHaveLength(2);
  });

  it('should create a toast with correct DSFR classes', () => {
    showToast('Test', 'warning');
    const toast = document.querySelector('.fr-alert');
    expect(toast).not.toBeNull();
    expect(toast!.classList.contains('fr-alert--warning')).toBe(true);
    expect(toast!.classList.contains('fr-alert--sm')).toBe(true);
  });

  it('should set role="alert" for error toasts', () => {
    showToast('Error!', 'error');
    const toast = document.querySelector('.fr-alert');
    expect(toast!.getAttribute('role')).toBe('alert');
  });

  it('should not set role="alert" for non-error toasts', () => {
    showToast('Info', 'info');
    const toast = document.querySelector('.fr-alert');
    expect(toast!.getAttribute('role')).toBeNull();
  });

  it('should display the message text', () => {
    showToast('Mon message');
    const p = document.querySelector('.fr-alert p');
    expect(p!.textContent).toBe('Mon message');
  });

  it('should have a close button', () => {
    showToast('Closeable');
    const btn = document.querySelector('.fr-alert .fr-btn--close');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-label')).toBe('Fermer le message');
  });

  it('should remove toast when close button is clicked', () => {
    showToast('To close');
    const btn = document.querySelector('.fr-alert .fr-btn--close') as HTMLElement;
    btn.click();
    expect(document.querySelectorAll('.fr-alert')).toHaveLength(0);
  });

  it('should auto-remove toast after duration', () => {
    showToast('Auto-remove', 'info', 3000);
    expect(document.querySelectorAll('.fr-alert')).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(document.querySelectorAll('.fr-alert')).toHaveLength(0);
  });

  it('should use default 5s duration', () => {
    showToast('Default duration');
    expect(document.querySelectorAll('.fr-alert')).toHaveLength(1);
    vi.advanceTimersByTime(4999);
    expect(document.querySelectorAll('.fr-alert')).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(document.querySelectorAll('.fr-alert')).toHaveLength(0);
  });

  it('toastSuccess should use success type', () => {
    toastSuccess('Done!');
    const toast = document.querySelector('.fr-alert--success');
    expect(toast).not.toBeNull();
  });

  it('toastError should use error type', () => {
    toastError('Failed!');
    const toast = document.querySelector('.fr-alert--error');
    expect(toast).not.toBeNull();
    expect(toast!.getAttribute('role')).toBe('alert');
  });

  it('toastWarning should use warning type', () => {
    toastWarning('Watch out!');
    const toast = document.querySelector('.fr-alert--warning');
    expect(toast).not.toBeNull();
  });

  it('toastInfo should use info type', () => {
    toastInfo('FYI');
    const toast = document.querySelector('.fr-alert--info');
    expect(toast).not.toBeNull();
  });
});
