/**
 * Sources CRUD routes.
 */

import { queryOne } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAccess } from '../middleware/rbac.js';
import { createResourceRouter } from './resource-crud.js';
import { serveSourceRecords } from './public-source.js';

const router = createResourceRouter({
  type: 'source',
  table: 'sources',
  jsonColumns: ['config_json', 'data_json'],
  dataColumns: ['name', 'type', 'config_json', 'data_json', 'record_count'],
});

/**
 * GET /:id/records — lecture authentifiée de l'amont d'une source Grist à
 * connexion (ADR-165). Même lecture que la route publique, réservée au
 * propriétaire et aux partages `user` / `group` : c'est l'aperçu des apps
 * avant publication, la clé restant côté serveur.
 */
router.get('/:id/records', requireAuth, requireAccess('source', 'read'), async (req, res) => {
  try {
    const source = await queryOne<{
      id: string;
      owner_id: string;
      type: string;
      config_json: unknown;
    }>('SELECT id, owner_id, type, config_json FROM sources WHERE id = ?', [req.params.id]);
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }
    await serveSourceRecords(source, res, `source:${source.id}`);
  } catch (err) {
    console.error('Source records error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
