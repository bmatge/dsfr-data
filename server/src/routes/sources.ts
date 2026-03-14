/**
 * Sources CRUD routes.
 */

import { createResourceRouter } from './resource-crud.js';

export default createResourceRouter({
  type: 'source',
  table: 'sources',
  jsonColumns: ['config_json', 'data_json'],
  dataColumns: ['name', 'type', 'config_json', 'data_json', 'record_count'],
});
