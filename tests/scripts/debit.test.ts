/**
 * Plafond global d'appels IA cote serveur (#999) : `scripts/lib/debit.cjs`,
 * partage par `scripts/ia-default-server.js` (prod) et le middleware
 * `/ia-proxy-default` de `vite.config.ts` et `apps/builder-ia/vite.config.ts` (dev).
 */
import { describe, expect, it } from 'vitest';
import { creerDebit, lireMaxRpm, reponseRefus } from '../../scripts/lib/debit.cjs';

function horloge(depart = 1_000_000) {
  let t = depart;
  return {
    now: () => t,
    avancer: (ms: number) => {
      t += ms;
    },
  };
}

describe('creerDebit — seau a jetons sur fenetre glissante', () => {
  it('10 appels passent, le 11e est refuse avec retryAfter > 0, puis la fenetre se libere', () => {
    const h = horloge();
    const debit = creerDebit({ maxParMinute: 10, now: h.now });

    for (let i = 0; i < 10; i++) {
      expect(debit.tenter()).toEqual({ ok: true, retryAfter: 0 });
      h.avancer(1000);
    }
    // t = depart + 10 s : le premier jeton sera rendu a depart + 60 s.
    const refus = debit.tenter();
    expect(refus.ok).toBe(false);
    expect(refus.retryAfter).toBe(50);

    // Un refus ne consomme rien : juste avant l'echeance, toujours refuse.
    h.avancer(49_999);
    expect(debit.tenter()).toEqual({ ok: false, retryAfter: 1 });

    // Echeance atteinte : le plus ancien jeton est rendu, un seul appel passe.
    h.avancer(1);
    expect(debit.tenter().ok).toBe(true);
    expect(debit.tenter().ok).toBe(false);

    // Une fenetre complete plus tard, tout le seau est libre.
    h.avancer(60_000);
    for (let i = 0; i < 10; i++) expect(debit.tenter().ok).toBe(true);
    expect(debit.tenter().ok).toBe(false);
  });

  it('retryAfter est un nombre entier de secondes, jamais inferieur a 1 (RFC 9110)', () => {
    const h = horloge();
    const debit = creerDebit({ maxParMinute: 1, now: h.now });
    expect(debit.tenter().ok).toBe(true);

    // 58,5 s d'attente restante : arrondi au-dessus, pas au plus proche.
    h.avancer(1_500);
    expect(debit.tenter()).toEqual({ ok: false, retryAfter: 59 });

    // Quelques millisecondes restantes : 1 s, pas 0 (un 0 inviterait a reessayer tout de suite).
    h.avancer(58_497);
    expect(debit.tenter()).toEqual({ ok: false, retryAfter: 1 });
  });

  it('plafond par defaut : 10 appels par minute', () => {
    const h = horloge();
    const debit = creerDebit({ now: h.now });
    for (let i = 0; i < 10; i++) expect(debit.tenter().ok).toBe(true);
    expect(debit.tenter()).toEqual({ ok: false, retryAfter: 60 });
  });

  it('deux instances ne partagent pas leur seau', () => {
    const h = horloge();
    const a = creerDebit({ maxParMinute: 1, now: h.now });
    const b = creerDebit({ maxParMinute: 1, now: h.now });
    expect(a.tenter().ok).toBe(true);
    expect(b.tenter().ok).toBe(true);
    expect(a.tenter().ok).toBe(false);
  });
});

describe('lireMaxRpm — variable IA_MAX_RPM', () => {
  it.each([
    [undefined, 10],
    ['', 10],
    ['  ', 10],
    ['25', 25],
    [' 3 ', 3],
    ['1', 1],
    ['0', 10],
    ['-5', 10],
    ['2.5', 10],
    ['abc', 10],
  ])('%j -> %i', (valeur, attendu) => {
    expect(lireMaxRpm(valeur)).toBe(attendu);
  });
});

describe('reponseRefus — reponse 429 commune prod et dev', () => {
  it('Retry-After en secondes entieres, expose au client, corps rate_limit_exceeded', () => {
    const refus = reponseRefus(42);
    expect(refus.status).toBe(429);
    expect(refus.headers['Retry-After']).toBe('42');
    expect(refus.headers['Access-Control-Expose-Headers']).toBe('Retry-After');
    const corps = JSON.parse(refus.body) as { error: { type: string; message: string } };
    expect(corps.error.type).toBe('rate_limit_exceeded');
    expect(corps.error.message).toContain('réessayez dans 42 s');
  });
});
