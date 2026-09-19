import { describe, it, expect } from 'vitest';
import { readChildTemplate, readChildTemplateHtml } from '@/utils/child-template.js';

/**
 * Helper partagé de lecture du `<template>` enfant (#894) : un seul contrat
 * pour `display`, `map-popup` et `repeat`, identique à l'ancien
 * `querySelector('template')` de chacun.
 */
describe('readChildTemplate', () => {
  it('rend le premier <template> descendant, et son innerHTML', () => {
    const host = document.createElement('div');
    host.innerHTML = '<p>avant</p><template><b>{{a}}</b></template><template><i>2</i></template>';
    const tpl = readChildTemplate(host)!;
    expect(tpl.innerHTML).toBe('<b>{{a}}</b>');
    expect(readChildTemplateHtml(host)).toBe('<b>{{a}}</b>');
  });

  it("rend null / chaîne vide quand le gabarit n'est pas (encore) là", () => {
    const host = document.createElement('div');
    expect(readChildTemplate(host)).toBeNull();
    expect(readChildTemplateHtml(host)).toBe('');
  });
});
