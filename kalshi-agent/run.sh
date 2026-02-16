#!/bin/bash
# Wrapper for cron — loads env and runs agent
DIR="$(cd "$(dirname "$0")" && pwd)"

# Load env vars from .env if it exists
if [ -f "$DIR/.env" ]; then
    set -a
    source "$DIR/.env"
    set +a
fi

cd "$DIR"
exec .venv/bin/python "$@"
