#!/bin/sh
# Docker entrypoint: periodic beacon log parsing + nginx
# Parses beacon logs every 5 minutes OR immediately when triggered via
# /api/refresh-monitoring (nginx writes to /tmp/beacon-refresh as trigger)

PARSE_SCRIPT="/usr/local/bin/parse-beacon-logs.sh"
TRIGGER="/tmp/beacon-refresh"
INTERVAL=300  # 5 minutes
CHECK=3       # check trigger every 3 seconds

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

# Start backend Express server in database mode
if [ "$GOUV_WIDGETS_MODE" = "database" ] && [ -f /app/server/dist/index.js ]; then
  echo "[entrypoint] Database mode detected, starting Express backend on port 3002..."
  cd /app/server && node dist/index.js 2>&1 &
  EXPRESS_PID=$!
  # Wait briefly and check if it survived startup
  sleep 2
  if kill -0 "$EXPRESS_PID" 2>/dev/null; then
    echo "[entrypoint] Express backend started (PID $EXPRESS_PID)"
  else
    echo "[entrypoint] ERROR: Express backend crashed on startup (PID $EXPRESS_PID)"
  fi
fi

# Start MCP server in background (reads skills from local file, no network dependency)
SKILLS_FILE="/usr/share/nginx/html/dist/skills.json"
if [ -f "$SKILLS_FILE" ]; then
  node /app/mcp-server/dist/index.js --http --skills-file "$SKILLS_FILE" &
  echo "[entrypoint] MCP server started on port 3001"
else
  echo "[entrypoint] WARNING: $SKILLS_FILE not found, MCP server not started"
fi

# Start nginx in foreground
exec nginx -g "daemon off;"
