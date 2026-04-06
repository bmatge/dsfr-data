#!/bin/bash
# Wrapper — redirige vers docker/deploy-server.sh
exec "$(dirname "$0")/docker/deploy-server.sh" "$@"
