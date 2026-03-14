/**
 * Connections CRUD routes.
 */

import { createResourceRouter } from './resource-crud.js';

export default createResourceRouter({
  type: 'connection',
  table: 'connections',
  jsonColumns: ['config_json'],
  dataColumns: ['name', 'type', 'config_json', 'api_key_encrypted', 'status'],
});
