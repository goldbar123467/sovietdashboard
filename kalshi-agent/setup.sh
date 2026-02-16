#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "=== Kalshi AI Agent Setup ==="

# Create venv
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

echo "Installing dependencies..."
.venv/bin/pip install -q -r requirements.txt

# Check env vars
if [ -z "$KALSHI_API_KEY" ]; then
    echo ""
    echo "WARNING: KALSHI_API_KEY not set."
    echo "  export KALSHI_API_KEY='your-kalshi-api-key'"
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo ""
    echo "WARNING: ANTHROPIC_API_KEY not set."
    echo "  export ANTHROPIC_API_KEY='your-anthropic-key'"
fi

# Ensure dirs
mkdir -p brain logs

echo ""
echo "Setup complete. To install cron jobs:"
echo ""
echo "  crontab -e"
echo ""
echo "  # Trade every 10 minutes"
echo "  */10 * * * * cd $DIR && .venv/bin/python agent.py >> logs/cron.log 2>&1"
echo ""
echo "  # Review hourly"
echo "  0 * * * * cd $DIR && .venv/bin/python reviewer.py >> logs/cron.log 2>&1"
echo ""
echo "  # Debug losses every 30 min"
echo "  */30 * * * * cd $DIR && .venv/bin/python debugger.py >> logs/cron.log 2>&1"
echo ""
echo "Quick start:"
echo "  cd $DIR"
echo "  export KALSHI_API_KEY='your-key'"
echo "  export ANTHROPIC_API_KEY='your-key'"
echo "  .venv/bin/python agent.py --dry-run    # See what it would trade"
echo "  .venv/bin/python agent.py              # Paper trade"
echo "  .venv/bin/python agent.py --live       # Real money"
