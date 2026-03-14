/**
 * Parse beacon.log (nginx) and produce monitoring-data.json
 *
 * Log format (pipe-delimited, one line per beacon hit):
 *   $time_iso8601|$http_referer|$arg_c|$arg_t|$remote_addr|$arg_r
 *
 * Field 6 ($arg_r) = explicit origin sent by JS (preferred over $http_referer).
 * Old logs (5 fields) are still supported via fallback to $http_referer.
 *
 * Example:
 *   2026-02-07T10:23:45+00:00|https://ministere.gouv.fr/stats|dsfr-data-chart|bar|1.2.3.4|https://ministere.gouv.fr
 *
 * Usage:
 *   node scripts/parse-beacon-logs.js [beacon.log] [output.json]
 *
 * Defaults:
 *   beacon.log  -> /var/log/nginx/beacon.log
 *   output.json -> /usr/share/nginx/html/public/monitoring-data.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

const DEFAULT_LOG = '/var/log/nginx/beacon.log';
const DEFAULT_OUT = '/usr/share/nginx/html/public/monitoring-data.json';

const logPath = process.argv[2] || DEFAULT_LOG;
const outPath = process.argv[3] || DEFAULT_OUT;

if (!existsSync(logPath)) {
  console.error(`Log file not found: ${logPath}`);
  process.exit(1);
}

console.log(`Parsing ${logPath} ...`);
const raw = readFileSync(logPath, 'utf-8');
const lines = raw.split('\n').filter((l) => l.trim());

// Aggregate: key = referer|component|chartType
const agg = new Map();

for (const line of lines) {
  const parts = line.split('|');
  if (parts.length < 4) continue;

  const [timestamp, httpReferer, component, chartType, _remoteAddr, argR] = parts;

  // Prefer explicit JS origin ($arg_r) over HTTP Referer
  const referer = (argR && argR !== '-') ? argR : httpReferer;

  if (!referer || referer === '-' || !component) continue;

  const key = `${referer}|${component}|${chartType || ''}`;
  const existing = agg.get(key);

  if (existing) {
    existing.callCount++;
    if (timestamp < existing.firstSeen) existing.firstSeen = timestamp;
    if (timestamp > existing.lastSeen) existing.lastSeen = timestamp;
  } else {
    agg.set(key, {
      referer,
      component,
      chartType: chartType || null,
      firstSeen: timestamp,
      lastSeen: timestamp,
      callCount: 1,
    });
  }
}

const entries = [...agg.values()].sort((a, b) => b.callCount - a.callCount);

// Build summary
const sites = new Set(entries.map((e) => {
  try { return new URL(e.referer).hostname; } catch { return e.referer; }
}));

const byComponent = {};
const byChartType = {};
for (const e of entries) {
  byComponent[e.component] = (byComponent[e.component] || 0) + 1;
  if (e.chartType) {
    byChartType[e.chartType] = (byChartType[e.chartType] || 0) + 1;
  }
}

const data = {
  generated: new Date().toISOString(),
  entries,
  summary: {
    totalSites: sites.size,
    totalComponents: entries.length,
    byComponent,
    byChartType,
  },
};

// Ensure output directory exists
const outDir = dirname(outPath);
mkdirSync(outDir, { recursive: true });

writeFileSync(outPath, JSON.stringify(data, null, 2));
console.log(`Written ${entries.length} entries to ${outPath}`);
console.log(`  Sites: ${sites.size}`);
console.log(`  Components: ${Object.keys(byComponent).join(', ')}`);
console.log(`  Chart types: ${Object.keys(byChartType).join(', ') || '(none)'}`);
