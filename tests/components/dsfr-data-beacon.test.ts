import { describe, it, expect, afterEach } from 'vitest';
import { DsfrDataBeacon } from '@/components/dsfr-data-beacon.js';

/**
 * #345 : <dsfr-data-beacon> est un element de configuration invisible. Il ne
 * declenche aucun beacon lui-meme — il expose seulement `url`, que beacon.ts lit
 * en lookup paresseux via getAttribute('url') au moment de l'envoi.
 */
describe('<dsfr-data-beacon> (#345)', () => {
  afterEach(() => {
    document.querySelectorAll('dsfr-data-beacon').forEach((e) => e.remove());
  });

  it('est enregistre comme custom element', () => {
    expect(customElements.get('dsfr-data-beacon')).toBe(DsfrDataBeacon);
  });

  it('expose url en propriete ET via getAttribute (le canal lu par beacon.ts)', async () => {
    const el = document.createElement('dsfr-data-beacon') as DsfrDataBeacon;
    el.setAttribute('url', 'https://collecte.ministere.fr');
    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.url).toBe('https://collecte.ministere.fr');
    expect(el.getAttribute('url')).toBe('https://collecte.ministere.fr');
  });

  it('est invisible et ne rend aucun contenu', async () => {
    const el = document.createElement('dsfr-data-beacon') as DsfrDataBeacon;
    el.setAttribute('url', 'https://x.fr');
    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.style.display).toBe('none');
    expect(el.textContent?.trim()).toBe('');
  });

  it('url vaut "" par defaut', () => {
    const el = new DsfrDataBeacon();
    expect(el.url).toBe('');
  });
});
