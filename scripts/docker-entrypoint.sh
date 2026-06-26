#!/bin/sh
# Docker entrypoint: supervised background services + periodic beacon parsing + nginx.
#
# Express, MCP server et IA default proxy tournent dans le meme conteneur que
# nginx ; ils sont superviseur-restartes en cas de crash (le restart natif
# `unless-stopped` du compose ne s'applique qu'a PID 1 = nginx). Sans cette
# boucle, un crash d'Express au boot — typiquement MariaDB pas encore prete —
# laisse l'API morte indefiniment (cf. incident 2026-06-23 chartsbuilder).

PARSE_SCRIPT="/usr/local/bin/parse-beacon-logs.sh"
TRIGGER="/tmp/beacon-refresh"
INTERVAL=300  # 5 minutes
CHECK=3       # check trigger every 3 seconds

# Restart un service en boucle. Backoff progressif (5s, 10s, ..., cap 60s) si
# le service crashe en moins de MIN_UPTIME secondes — evite le flap rapide
# qui sature les logs quand une dependance (DB) n'est pas encore joignable.
MIN_UPTIME=5
MAX_BACKOFF=60
supervise() {
  label="$1"
  shift
  fast_restarts=0
  while true; do
    start=$(date +%s)
    "$@"
    rc=$?
    end=$(date +%s)
    uptime=$((end - start))
    if [ "$uptime" -lt "$MIN_UPTIME" ]; then
      fast_restarts=$((fast_restarts + 1))
      backoff=$((fast_restarts * 5))
      [ "$backoff" -gt "$MAX_BACKOFF" ] && backoff="$MAX_BACKOFF"
      echo "[entrypoint] $label exited (code $rc) after ${uptime}s, restart #${fast_restarts} in ${backoff}s..."
      sleep "$backoff"
    else
      fast_restarts=0
      echo "[entrypoint] $label exited (code $rc) after ${uptime}s, restarting..."
    fi
  done
}

# Parse immediately on startup (restore monitoring-data.json from persisted logs)
sh "$PARSE_SCRIPT" 2>&1

# Background loop: parse periodically or on trigger
(
  last_parse=0
  while true; do
    now=$(date +%s)
    elapsed=$((now - last_parse))

    if [ -s "$TRIGGER" ] || [ "$elapsed" -ge "$INTERVAL" ]; then
      : > "$TRIGGER" 2>/dev/null  # truncate trigger
      sh "$PARSE_SCRIPT" 2>&1
      last_parse=$(date +%s)
    fi

    sleep "$CHECK"
  done
) &

# Express backend (mode DB seulement). Supervise plutot que best-effort :
# si MariaDB n'est pas encore healthy au boot, Express crashe avec
# ECONNREFUSED — la boucle re-essaie jusqu'a ce que la DB reponde.
if [ "$GOUV_WIDGETS_MODE" = "database" ] && [ -f /app/server/dist/index.js ]; then
  echo "[entrypoint] Database mode detected, starting Express backend on port 3002 (supervised)..."
  (cd /app/server && supervise "Express" node dist/index.js) &
fi

# IA default proxy (port 3003) — actif uniquement si IA_DEFAULT_TOKEN fourni.
if [ -n "$IA_DEFAULT_TOKEN" ]; then
  echo "[entrypoint] Starting IA default proxy on port 3003 (supervised)..."
  supervise "IA-default" node /app/scripts/ia-default-server.js &
fi

# MCP server (port 3001) — lecture skills locale, pas de dependance reseau.
SKILLS_FILE="/usr/share/nginx/html/dist/skills.json"
if [ -f "$SKILLS_FILE" ]; then
  echo "[entrypoint] Starting MCP server on port 3001 (supervised)..."
  supervise "MCP" node /app/mcp-server/dist/index.js --http --skills-file "$SKILLS_FILE" &
else
  echo "[entrypoint] WARNING: $SKILLS_FILE not found, MCP server not started"
fi

# Start nginx in foreground (PID 1)
exec nginx -g "daemon off;"
