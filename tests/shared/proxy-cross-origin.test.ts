import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Le proxy bake au build doit etre sur l'origine de la page (#signalement CSP).
 *
 * CE FICHIER EXISTE PARCE QUE LE SYMPTOME DESIGNAIT LE MAUVAIS COUPABLE.
 * Une instance servie depuis `chartsbeta.lab.miweb.run` avait
 * `VITE_PROXY_URL=https://chartsbeta.miweb.run` — un `.lab` oublie. Chaque
 * connexion de source partait donc vers une autre origine, sortait de
 * « connect-src 'self' » et se faisait bloquer. La console n'affichait que des
 * erreurs de Content-Security-Policy, si bien que la CSP a ete soupconnee et
 * comparee a celle de la production — ou elle etait rigoureusement identique.
 *
 * Le garde-fou ne corrige pas : il NOMME la cause. Basculer d'autorite sur
 * l'origine de la page masquerait une configuration fausse, et casserait le
 * deploiement ou l'operateur a separe les domaines a dessein.
 */

const ORIGINE_PAGE = 'https://chartsbeta.lab.miweb.run';

/** Charge le module avec un VITE_PROXY_URL donne, sur une origine donnee. */
async function chargerAvec(proxyUrl: string, origine = ORIGINE_PAGE) {
  vi.resetModules();
  vi.stubEnv('VITE_PROXY_URL', proxyUrl);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { origin: origine, href: `${origine}/apps/sources/` },
  });
  return import('../../packages/shared/src/api/proxy-config');
}

describe('proxy bake au build sur une autre origine que la page', () => {
  let avertissements: string[];
  let espion: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    avertissements = [];
    espion = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      avertissements.push(args.join(' '));
    });
  });

  afterEach(() => {
    espion.mockRestore();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('avertit, en nommant les DEUX origines', async () => {
    // Le cas reel, au sous-domaine pres.
    const mod = await chargerAvec('https://chartsbeta.miweb.run');
    mod.getProxyConfig();

    expect(avertissements).toHaveLength(1);
    expect(avertissements[0]).toContain('https://chartsbeta.miweb.run');
    expect(avertissements[0]).toContain(ORIGINE_PAGE);
  });

  it('dit quoi corriger, pas seulement ce qui ne va pas', async () => {
    // Un avertissement qui ne nomme pas la variable a changer laisse
    // l'operateur devant le meme mur d'erreurs CSP.
    const mod = await chargerAvec('https://chartsbeta.miweb.run');
    mod.getProxyConfig();

    expect(avertissements[0]).toContain('VITE_PROXY_URL');
    expect(avertissements[0]).toContain('VITE_PROXY_URL_EMBED');
    expect(avertissements[0]).toMatch(/connect-src|CSP/);
  });

  it('se tait quand le proxy est sur l’origine de la page', async () => {
    const mod = await chargerAvec(ORIGINE_PAGE);
    mod.getProxyConfig();

    expect(avertissements).toEqual([]);
  });

  it('se tait sur un port ou un protocole identiques mais un chemin different', async () => {
    // L'origine seule compte : un chemin de base ne change rien a la CSP.
    const mod = await chargerAvec(`${ORIGINE_PAGE}/sous-chemin`);
    mod.getProxyConfig();

    expect(avertissements).toEqual([]);
  });

  it('n’avertit qu’une fois, quel que soit le nombre d’appels', async () => {
    // `getProxyConfig` est appele a chaque requete : une console noyee est
    // une console qu'on n'ouvre plus.
    const mod = await chargerAvec('https://chartsbeta.miweb.run');
    for (let i = 0; i < 20; i++) mod.getProxyConfig();

    expect(avertissements).toHaveLength(1);
  });

  it('se tait quand aucun proxy n’est bake — bundle npm/CDN', async () => {
    // Depuis #319 les bundles publies n'ont aucune URL bakee : la branche
    // build-time n'est meme pas atteinte.
    const mod = await chargerAvec('');
    mod.getProxyConfig();

    expect(avertissements).toEqual([]);
  });

  it('se tait pour un widget embarque qui vise un autre domaine — c’est le but', async () => {
    // Branche 0 : l'attribut `proxy-url` d'une source. Sur un site tiers, le
    // cross-origin est LA configuration voulue, pas un defaut.
    const mod = await chargerAvec('https://chartsbeta.miweb.run');
    mod.getProxyConfig('https://proxy-public.exemple.fr');

    expect(avertissements).toEqual([]);
  });

  it('ne jette pas sur une URL malformee', async () => {
    const mod = await chargerAvec('pas une url');

    expect(() => mod.getProxyConfig()).not.toThrow();
  });
});
