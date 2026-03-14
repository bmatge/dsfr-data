/**
 * Favorites CRUD routes.
 */

import { createResourceRouter } from './resource-crud.js';

export default createResourceRouter({
  type: 'favorite',
  table: 'favorites',
  jsonColumns: ['builder_state_json'],
  dataColumns: ['name', 'chart_type', 'code', 'builder_state_json', 'source_app'],
});
