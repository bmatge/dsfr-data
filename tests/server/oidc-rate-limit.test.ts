/**
 * Limiteur du parcours OIDC : compteur distinct de celui des mots de passe,
 * et refus SILENCIEUX pour la connexion automatique (#365). Avant, la
 * connexion silencieuse consommait le quota anti force brute (10 / 15 min) et
 * l'usager tombait sur « Trop de tentatives, reessayez dans 15 minutes ».
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createOidcLimiter } from '../../server/src/middleware/rate-limit.js';
import { OIDC_STATE_COOKIE } from '../../server/src/utils/oidc.js';

function appAvecLimite(max: number): express.Express {
  const app = express();
  app.use(cookieParser());
  const limiter = createOidcLimiter({ max });
  app.get('/login', limiter, (_req, res) => {
    res.status(204).end();
  });
  app.get('/callback', limiter, (_req, res) => {
    res.status(204).end();
  });
  return app;
}

describe('limiteur OIDC', () => {
  it('laisse passer sous le seuil', async () => {
    const app = appAvecLimite(2);
    await request(app).get('/login').expect(204);
    await request(app).get('/login').expect(204);
  });

  it('tentative silencieuse refusée : retour sans bruit vers la page d’origine', async () => {
    const app = appAvecLimite(1);
    await request(app).get('/login').expect(204);
    const res = await request(app).get('/login?silent=1&return_to=%2Fapps%2Fbuilder%2Findex.html');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/apps/builder/index.html');
  });

  it('refus silencieux : un return_to externe retombe sur /', async () => {
    const app = appAvecLimite(1);
    await request(app).get('/login').expect(204);
    const res = await request(app).get('/login?silent=1&return_to=%2F%2Fevil.example.com');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('retour « pas de session » refusé : redirection vers la page du cookie d’état', async () => {
    const app = appAvecLimite(1);
    await request(app).get('/callback').expect(204);
    const res = await request(app)
      .get('/callback?error=login_required')
      .set(
        'Cookie',
        `${OIDC_STATE_COOKIE}=${encodeURIComponent(JSON.stringify({ returnTo: '/apps/studio/' }))}`
      );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/apps/studio/');
  });

  it('connexion explicite refusée : 429 avec un message en français', async () => {
    const app = appAvecLimite(1);
    await request(app).get('/login').expect(204);
    const res = await request(app).get('/login');
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/Trop de tentatives de connexion/);
  });
});
