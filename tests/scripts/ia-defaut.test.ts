/**
 * Cle IA serveur desactivable (`IA_DEFAULT_ENABLED`) : `scripts/lib/ia-defaut.cjs`,
 * partage par `scripts/ia-default-server.js` (prod) et les middlewares
 * `/ia-server-config` + `/ia-proxy-default` de `vite.config.ts` (dev).
 */
import { describe, expect, it } from 'vitest';
import { estDesactivee, lireConfigDefaut } from '../../scripts/lib/ia-defaut.cjs';

const DEFAUTS = { apiUrl: 'https://albert.example/v1/chat/completions', model: 'openweight-large' };

describe('estDesactivee', () => {
  it('ne desactive que sur une valeur explicitement fausse', () => {
    for (const v of ['false', 'FALSE', ' 0 ', 'off', 'no', 'non'])
      expect(estDesactivee(v)).toBe(true);
    for (const v of [undefined, '', 'true', '1', 'on', 'oui', 'yes', 'faux', 'disabled'])
      expect(estDesactivee(v)).toBe(false);
  });
});

describe('lireConfigDefaut', () => {
  it('sans flag : comportement inchange, le jeton sert et la config est annoncee', () => {
    const c = lireConfigDefaut({ IA_DEFAULT_TOKEN: 'sk-serveur', IA_DEFAULT_MODEL: 'm' }, DEFAUTS);
    expect(c.desactivee).toBe(false);
    expect(c.token).toBe('sk-serveur');
    expect(c.reponse).toEqual({ available: true, apiUrl: DEFAUTS.apiUrl, model: 'm' });
    expect(c.reponse).not.toHaveProperty('disabled');
  });

  it('sans flag ni jeton : indisponible, sans pretendre a une desactivation', () => {
    expect(lireConfigDefaut({}, DEFAUTS).reponse).toEqual({ available: false });
  });

  it('IA_DEFAULT_ENABLED=false : le jeton present n’est PAS lu, la reponse dit disabled', () => {
    const c = lireConfigDefaut(
      { IA_DEFAULT_ENABLED: 'false', IA_DEFAULT_TOKEN: 'sk-serveur' },
      DEFAUTS
    );
    expect(c.desactivee).toBe(true);
    expect(c.token).toBe('');
    expect(c.reponse).toEqual({ available: false, disabled: true });
    expect(JSON.stringify(c.reponse)).not.toContain('sk-serveur');
  });

  it('IA_DEFAULT_ENABLED=false sans jeton : desactivee quand meme (le Studio guide vers la cle perso)', () => {
    expect(lireConfigDefaut({ IA_DEFAULT_ENABLED: '0' }, DEFAUTS).reponse).toEqual({
      available: false,
      disabled: true,
    });
  });

  it('IA_DEFAULT_ENABLED=true : identique a l’absence du flag', () => {
    const avec = lireConfigDefaut({ IA_DEFAULT_ENABLED: 'true', IA_DEFAULT_TOKEN: 't' }, DEFAUTS);
    const sans = lireConfigDefaut({ IA_DEFAULT_TOKEN: 't' }, DEFAUTS);
    expect(avec).toEqual(sans);
  });
});
