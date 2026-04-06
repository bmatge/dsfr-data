/**
 * Filter translation utilities.
 * Converts dsfr-data-query colon-syntax filters to ODSQL where clauses
 * and applies filters to local data arrays.
 */

/**
 * Convert a dsfr-data-query filter expression (field:operator:value) to an ODSQL where clause.
 * Supports 12 operators: eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin, isnull, isnotnull.
 */
export function filterToOdsql(filterExpr: string): string {
  const opMap: Record<string, string> = {
    eq: '=',
    neq: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
  };
  return filterExpr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const segs = part.split(':');
      if (segs.length < 3) return '';
      const field = segs[0];
      const op = segs[1];
      const val = segs.slice(2).join(':');
      if (op === 'contains') return `${field} like "%${val}%"`;
      if (op === 'notcontains') return `NOT ${field} like "%${val}%"`;
      if (op === 'in')
        return `${field} in (${val
          .split('|')
          .map((v) => `"${v}"`)
          .join(', ')})`;
      if (op === 'notin')
        return `NOT ${field} in (${val
          .split('|')
          .map((v) => `"${v}"`)
          .join(', ')})`;
      if (op === 'isnull') return `${field} is null`;
      if (op === 'isnotnull') return `${field} is not null`;
      const sqlOp = opMap[op];
      if (!sqlOp) return '';
      return `${field} ${sqlOp} "${val}"`;
    })
    .filter(Boolean)
    .join(' AND ');
}

/**
 * Apply a dsfr-data-query style filter (field:operator:value) to local data rows.
 * Supports 10 operators: eq, neq, gt, gte, lt, lte, contains, notcontains, isnull, isnotnull.
 */
export function applyLocalFilter(
  data: Record<string, unknown>[],
  filterExpr: string
): Record<string, unknown>[] {
  const filters = filterExpr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const segs = part.split(':');
      if (segs.length < 2) return null;
      return { field: segs[0], op: segs[1], value: segs.slice(2).join(':') };
    })
    .filter(Boolean) as { field: string; op: string; value: string }[];

  return data.filter((row) =>
    filters.every((f) => {
      const v = row[f.field];
      switch (f.op) {
        case 'eq':
          // eslint-disable-next-line eqeqeq -- loose equality intentional (string/number coercion)
          return v == f.value;
        case 'neq':
          // eslint-disable-next-line eqeqeq -- loose equality intentional (string/number coercion)
          return v != f.value;
        case 'gt':
          return Number(v) > Number(f.value);
        case 'gte':
          return Number(v) >= Number(f.value);
        case 'lt':
          return Number(v) < Number(f.value);
        case 'lte':
          return Number(v) <= Number(f.value);
        case 'contains':
          return String(v).toLowerCase().includes(f.value.toLowerCase());
        case 'notcontains':
          return !String(v).toLowerCase().includes(f.value.toLowerCase());
        case 'isnull':
          return v === null || v === undefined;
        case 'isnotnull':
          return v !== null && v !== undefined;
        default:
          return true;
      }
    })
  );
}
