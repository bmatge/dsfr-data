/**
 * Dashboards CRUD routes.
 */

import { createResourceRouter } from './resource-crud.js';

export default createResourceRouter({
  type: 'dashboard',
  table: 'dashboards',
  jsonColumns: ['layout_json', 'widgets_json'],
  dataColumns: ['name', 'description', 'layout_json', 'widgets_json'],
});
