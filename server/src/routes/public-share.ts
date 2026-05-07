/**
 * Anonymous public-share endpoints (issue #148).
 *
 * Routes mounted under /api/public/share. No auth required — the share row id
 * (UUID v4, ~122 bits of entropy) is the capability token. The token is
 * non-revocable except by the owner via DELETE /api/shares/:id.
 *
 * Currently only `favorite` resources are exposed publicly. Favorites whose
 * saved source needs server-side credentials are refused at share-creation
 * time (see shares.ts:favoriteNeedsPrivateProxy) — so a public link is always
 * safe to render client-side, no proxy involved.
 *
 * Returns minimum data : nothing about the owner identity, just the
 * favorite's name + chartType + code (the embedded HTML/JS that the public
 * view page renders inside an iframe).
 */

import { Router } from 'express';
import { queryOne } from '../db/database.js';
import { publicShareRateLimiter } from '../middleware/rate-limit.js';

const router = Router();

router.use(publicShareRateLimiter);

interface ShareRow {
  id: string;
  resource_type: string;
  resource_id: string;
  target_type: string;
  expires_at: string | null;
  revoked_at: string | null;
}

interface FavoriteRow {
  id: string;
  name: string;
  chart_type: string | null;
  code: string;
}

/**
 * GET /api/public/share/:token
 * Anonymous resolution of a public share.
 *
 * Responses:
 *  - 200 { resourceType, name, chartType, code }
 *  - 404 if the token does not exist or does not match a public share
 *  - 410 Gone if revoked or expired
 */
router.get('/:token', async (req, res) => {
  // Discourage indexing of public share URLs even if they leak into a sitemap
  // or get crawled. Caching is short — the owner can revoke at any time.
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'private, max-age=30, must-revalidate');

  try {
    const token = req.params.token;
    // UUID v4 sanity check : 36 chars, hyphenated. Cheap pre-filter to avoid
    // hitting the DB on obvious garbage.
    if (!/^[0-9a-f-]{32,40}$/i.test(token)) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    const share = await queryOne<ShareRow>(
      `SELECT id, resource_type, resource_id, target_type, expires_at, revoked_at
       FROM shares
       WHERE id = ? AND target_type = 'public'`,
      [token]
    );
    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    if (share.revoked_at) {
      res.status(410).json({ error: 'This share has been revoked', code: 'REVOKED' });
      return;
    }
    if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
      res.status(410).json({ error: 'This share has expired', code: 'EXPIRED' });
      return;
    }

    if (share.resource_type !== 'favorite') {
      // Schema allows other resource types to be shared publicly in the future;
      // until those code paths exist, refuse rather than leak something we can
      // not safely render.
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    const fav = await queryOne<FavoriteRow>(
      'SELECT id, name, chart_type, code FROM favorites WHERE id = ?',
      [share.resource_id]
    );
    if (!fav) {
      // The favorite was deleted but the share row was not — treat as gone.
      res.status(410).json({ error: 'The shared favorite no longer exists', code: 'GONE' });
      return;
    }

    res.json({
      resourceType: 'favorite',
      name: fav.name,
      chartType: fav.chart_type,
      code: fav.code,
    });
  } catch (err) {
    console.error('Get public share error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
