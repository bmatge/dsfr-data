#!/bin/sh
# Parse beacon.log (nginx) and produce monitoring-data.json
# Runs in alpine (no Node.js needed) - uses only awk/sh
#
# Log format: $time_iso8601|$http_referer|$arg_c|$arg_t|$remote_addr|$arg_r
# Field 6 ($arg_r) = explicit origin sent by JS (preferred over $http_referer)
# Old logs (5 fields) are still supported via fallback to $http_referer
# Example:    2026-02-07T10:23:45+00:00|https://site.gouv.fr/page|dsfr-data-chart|bar|1.2.3.4|https://site.gouv.fr

LOG_FILE="${1:-/var/log/nginx/beacon.log}"
OUT_FILE="${2:-/usr/share/nginx/html/public/monitoring-data.json}"

# If no log file yet, write empty JSON
if [ ! -f "$LOG_FILE" ] || [ ! -s "$LOG_FILE" ]; then
  cat > "$OUT_FILE" <<'EMPTY'
{"generated":null,"entries":[],"summary":{"totalSites":0,"totalComponents":0,"byComponent":{},"byChartType":{}}}
EMPTY
  echo "[parse-beacon] No log file or empty, wrote empty JSON"
  exit 0
fi

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

awk -F'|' -v now="$NOW" '
NF >= 4 {
  # Prefer $6 (explicit JS origin) over $2 (HTTP Referer)
  eff_ref = ""
  if (NF >= 6 && $6 != "-" && $6 != "") {
    eff_ref = $6
  } else if ($2 != "-" && $2 != "") {
    eff_ref = $2
  }
  if (eff_ref == "" || $3 == "") next

  key = eff_ref "|" $3 "|" $4
  count[key]++
  if (!(key in first) || $1 < first[key]) first[key] = $1
  if (!(key in last)  || $1 > last[key])  last[key] = $1
  referer[key] = eff_ref
  component[key] = $3
  charttype[key] = $4
}
END {
  # Sort keys by count descending
  n = 0
  for (k in count) {
    keys[n++] = k
  }
  # Simple bubble sort by count desc
  for (i = 0; i < n-1; i++) {
    for (j = i+1; j < n; j++) {
      if (count[keys[j]] > count[keys[i]]) {
        tmp = keys[i]; keys[i] = keys[j]; keys[j] = tmp
      }
    }
  }

  # Collect unique sites and counts
  delete comp_count
  delete type_count
  delete sites
  for (i = 0; i < n; i++) {
    k = keys[i]
    # Extract hostname from referer
    r = referer[k]
    sub(/^https?:\/\//, "", r)
    sub(/\/.*/, "", r)
    sites[r] = 1
    comp_count[component[k]]++
    if (charttype[k] != "") type_count[charttype[k]]++
  }
  total_sites = 0
  for (s in sites) total_sites++

  # Build JSON
  printf "{\"generated\":\"%s\",\"entries\":[", now

  for (i = 0; i < n; i++) {
    k = keys[i]
    if (i > 0) printf ","
    ct = charttype[k]
    ct_json = (ct == "") ? "null" : "\"" ct "\""
    printf "{\"referer\":\"%s\",\"component\":\"%s\",\"chartType\":%s,\"firstSeen\":\"%s\",\"lastSeen\":\"%s\",\"callCount\":%d}", \
      referer[k], component[k], ct_json, first[k], last[k], count[k]
  }

  printf "],\"summary\":{\"totalSites\":%d,\"totalComponents\":%d,\"byComponent\":{", total_sites, n

  first_c = 1
  for (c in comp_count) {
    if (!first_c) printf ","
    printf "\"%s\":%d", c, comp_count[c]
    first_c = 0
  }

  printf "},\"byChartType\":{"

  first_t = 1
  for (t in type_count) {
    if (!first_t) printf ","
    printf "\"%s\":%d", t, type_count[t]
    first_t = 0
  }

  printf "}}}\n"
}
' "$LOG_FILE" > "$OUT_FILE"

entries=$(awk -F'|' 'NF>=4{r="";if(NF>=6&&$6!="-"&&$6!="")r=$6;else if($2!="-"&&$2!="")r=$2;if(r!=""&&$3!="")n++}END{print n+0}' "$LOG_FILE")
echo "[parse-beacon] Parsed $entries log lines -> $OUT_FILE"
