import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataUnpivot } from '@/components/dsfr-data-unpivot.js';
import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import type { SourceElement } from '@/utils/source-element.js';

/**
 * AC de #274 (A6) : les composants aval atteignent les paramètres adapter
 * RÉSOLUS de la source (headers api-key-ref inclus) via la délégation
 * SourceElement, y compris derrière unpivot/join — plus de re-parsing des
 * attributs DOM (cause du 401 des facettes serveur sur source authentifiée).
 */
describe('SourceElement.getAdapterParams (#274)', () => {
  const elements: HTMLElement[] = [];

  function mount<T extends HTMLElement>(el: T, id: string): T {
    el.id = id;
    document.body.appendChild(el);
    elements.push(el);
    return el;
  }

  beforeEach(() => {
    (window as Record<string, unknown>).DSFR_DATA_KEYS = {
      'ma-cle': 'Bearer SECRET-TOKEN',
    };
  });

  afterEach(() => {
    delete (window as Record<string, unknown>).DSFR_DATA_KEYS;
    elements.splice(0).forEach((el) => el.remove());
  });

  function makeSource(): DsfrDataSource {
    const source = new DsfrDataSource();
    source.apiType = 'grist';
    source.baseUrl = 'https://grist.example.org/api/docs/d/tables/t/records';
    source.datasetId = 'ds-1';
    source.apiKeyRef = 'ma-cle';
    return mount(source, 'ses-src');
  }

  it('la source expose ses params résolus avec le header api-key-ref', () => {
    const source = makeSource();
    const params = source.getAdapterParams();
    expect(params.baseUrl).toBe('https://grist.example.org/api/docs/d/tables/t/records');
    expect(params.headers).toEqual({ Authorization: 'Bearer SECRET-TOKEN' });
  });

  it('query délègue getAdapterParams à sa source', () => {
    makeSource();
    const query = mount(new DsfrDataQuery(), 'ses-query');
    query.source = 'ses-src';
    const params = query.getAdapterParams();
    expect(params?.headers).toEqual({ Authorization: 'Bearer SECRET-TOKEN' });
  });

  it('proxy-url remonte dans les params adapter et traverse la délégation (#340)', () => {
    const source = makeSource();
    source.proxyUrl = 'https://mon-proxy.fr';
    expect(source.getAdapterParams().proxyUrl).toBe('https://mon-proxy.fr');

    const query = mount(new DsfrDataQuery(), 'ses-proxy-q');
    query.source = 'ses-src';
    expect(query.getAdapterParams()?.proxyUrl).toBe('https://mon-proxy.fr');
  });

  it('proxy-url vide → proxyUrl undefined dans les params (résolution globale)', () => {
    const source = makeSource();
    expect(source.getAdapterParams().proxyUrl).toBeUndefined();
  });

  it('unpivot délègue getAdapter / getEffectiveWhere / getAdapterParams', () => {
    makeSource();
    const unpivot = mount(new DsfrDataUnpivot(), 'ses-unpivot');
    unpivot.source = 'ses-src';
    expect(unpivot.getAdapter()?.type).toBe('grist');
    expect(unpivot.getEffectiveWhere()).toBe('');
    expect(unpivot.getAdapterParams()?.headers).toEqual({
      Authorization: 'Bearer SECRET-TOKEN',
    });
  });

  it('join délègue vers la source GAUCHE', () => {
    makeSource();
    const join = mount(new DsfrDataJoin(), 'ses-join');
    join.left = 'ses-src';
    join.right = 'autre-source-inexistante';
    expect(join.getAdapter()?.type).toBe('grist');
    expect(join.getAdapterParams()?.datasetId).toBe('ds-1');
  });

  it('chaîne complète source → query → unpivot : les params traversent', () => {
    makeSource();
    const query = mount(new DsfrDataQuery(), 'ses-q2');
    query.source = 'ses-src';
    const unpivot = mount(new DsfrDataUnpivot(), 'ses-u2');
    unpivot.source = 'ses-q2';

    const el = unpivot as unknown as SourceElement;
    expect(el.getAdapterParams?.()?.headers).toEqual({
      Authorization: 'Bearer SECRET-TOKEN',
    });
  });
});
