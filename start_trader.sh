#!/bin/bash
# Kalshi Paper Trading Startup Script
# Paste this after SSH: bash start_trader.sh

cd /home/clark

# Pull latest code
git pull

# Kill any existing trader
pkill -f "python.*kalshi_trader.py" 2>/dev/null

# Start paper trading in background
nohup python -u kalshi_trader.py \
  --models-dir ./kalshi_horizon_models \
  --paper \
  --max-position 10 \
  --daily-limit -50 \
  --interval 30 \
  > trader.log 2>&1 &

echo "Paper trader started (PID: $!)"
echo "View logs:   tail -f trader.log"
echo "View trades: python kalshi_trader.py --show-trades trades.jsonl"
echo "Stop:        pkill -f kalshi_trader.py"
