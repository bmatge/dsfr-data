/**
 * Product tour state — per-user singleton stored in `users.tour_state` (JSON).
 * GET  /api/tour-state  → current state (empty `{ tours: {} }` if never set)
 * PUT  /api/tour-state  → replace the full state for the authenticated user
 *
 * The state is a singleton per user (not a list), so we don't reuse
 * createResourceRouter here — a 2-route custom router is simpler.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { queryOne, execute } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

interface StoredTourEntry {
  at: string;
  version: number;
}

interface TourState {
  disabled?: boolean;
  tours: Record<string, StoredTourEntry>;
}

function emptyState(): TourState {
  return { tours: {} };
}

// Guarde contre l'injection de propriété (__proto__, constructor…) en filtrant
// les IDs de tour à un alphanumérique simple. Cf. CodeQL js/remote-property-injection.
const SAFE_TOUR_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/**
 * Accept loose shapes coming from the client and coerce them into a clean
 * TourState. Returns null if the payload is unusable (non-object).
 */
function validate(body: unknown): TourState | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;

  const state: TourState = { tours: {} };
  if (obj.disabled === true) state.disabled = true;

  if (obj.tours && typeof obj.tours === 'object') {
    for (const [id, entry] of Object.entries(obj.tours as Record<string, unknown>)) {
      if (!SAFE_TOUR_ID.test(id)) continue;
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const at = typeof e.at === 'string' ? e.at : new Date().toISOString();
      const version = typeof e.version === 'number' ? e.version : 1;
      state.tours[id] = { at, version };
    }
  }

  return state;
}

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.userId;

    const row = await queryOne<{ tour_state: string | null }>(
      'SELECT tour_state FROM users WHERE id = ?',
      [userId]
    );
    if (!row || !row.tour_state) {
      res.json(emptyState());
      return;
    }

    try {
      const parsed =
        typeof row.tour_state === 'string' ? JSON.parse(row.tour_state) : row.tour_state;
      const state = validate(parsed) ?? emptyState();
      res.json(state);
    } catch {
      res.json(emptyState());
    }
  } catch (err) {
    console.error('[tour-state] GET failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.userId;

    const state = validate(req.body);
    if (!state) {
      res.status(400).json({ error: 'Invalid tour state payload' });
      return;
    }

    await execute('UPDATE users SET tour_state = ? WHERE id = ?', [JSON.stringify(state), userId]);
    res.json(state);
  } catch (err) {
    console.error('[tour-state] PUT failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
