#!/bin/bash
# Wrapper — redirige vers docker/deploy.sh
exec "$(dirname "$0")/docker/deploy.sh" "$@"
