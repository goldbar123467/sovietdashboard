# Kalshi Crypto Prediction System

Production-ready ML system for Kalshi crypto prediction markets (BTC, ETH, SOL) with horizon-aware models and paper/live trading.

## One-Shot Setup

**Fresh install (paste into terminal):**
```bash
cd ~ && git clone https://github.com/goldbar123467/Kalshi-Crypto.git && cd Kalshi-Crypto && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && nohup python3 -u kalshi_stream.py --coinbase --interval 30 --horizons-only --log training_data.jsonl > stream.log 2>&1 & echo "Data collection started. Check: tail -f stream.log"
```

**Already cloned? Start collecting:**
```bash
cd ~/Kalshi-Crypto && source venv/bin/activate && git pull && nohup python3 -u kalshi_stream.py --coinbase --interval 30 --horizons-only --log training_data.jsonl > stream.log 2>&1 &
```

## Quick Start

### Step 1: Install
```bash
git clone https://github.com/goldbar123467/Kalshi-Crypto.git
cd Kalshi-Crypto
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Step 2: Collect Training Data (2-3 hours minimum)
```bash
nohup python3 -u kalshi_stream.py --coinbase --interval 30 --horizons-only --log training_data.jsonl > stream.log 2>&1 &

# Check progress
tail -f stream.log
wc -l training_data.jsonl
```

### Step 3: Train Models (after 500+ samples)
```bash
python3 kalshi_train.py backfill --data training_data.jsonl
python3 kalshi_train.py separate-models --data training_data.labeled.jsonl --output-dir ./kalshi_horizon_models
```

### Step 4: Start Paper Trading
```bash
bash start_trader.sh

# Or manually:
python3 kalshi_trader.py --models-dir ./kalshi_horizon_models --paper
```

## What This Does

Predicts binary crypto contracts at **fixed time horizons** (T-60, T-30, T-15 minutes before settlement) and generates threshold-based trade signals when model probability diverges from market price.

```
┌────────────────┐      ┌──────────────┐      ┌────────────────┐
│  Coinbase WS   │─────▶│  Horizon     │─────▶│  HorizonRouter │
│  (level2 book) │      │  Snapshots   │      │  (3 models)    │
└────────────────┘      └──────────────┘      └────────────────┘
        │                      │                      │
        │                      │                      ▼
        │               T-60, T-30, T-15      ┌──────────────┐
        │               labeled samples       │ Trade Signal │
        │                                     │ if |edge| >  │
        └─ Settlement proxy (60s avg) ───────▶│  threshold   │
                                              └──────────────┘
```

## Commands Reference

### Data Collection
```bash
# Start collecting (runs in background)
nohup python3 -u kalshi_stream.py --coinbase --interval 30 --horizons-only --log data.jsonl > stream.log 2>&1 &

# Check status
tail -f stream.log
wc -l data.jsonl
```

### Training
```bash
# Label with settlement outcomes
python3 kalshi_train.py backfill --data data.jsonl

# Train separate horizon models (recommended)
python3 kalshi_train.py separate-models --data data.labeled.jsonl --output-dir ./kalshi_horizon_models
```

### Trading
```bash
# Paper trading (no real money)
python3 kalshi_trader.py --models-dir ./kalshi_horizon_models --paper

# View trade history
python3 kalshi_trader.py --show-trades trades.jsonl

# Check status
python3 kalshi_trader.py --status

# Stop trading
pkill -f kalshi_trader.py
```

### Validation
```bash
python3 phase3_validate.py --data data.labeled.jsonl
python3 phase3_compare.py --before old.labeled.jsonl --after new.labeled.jsonl
```

## Trading Configuration

| Flag | Default | Description |
|------|---------|-------------|
| `--paper` | Yes | Paper trading mode (simulated) |
| `--live` | No | Real money trading |
| `--max-position` | $10 | Max USD per trade |
| `--daily-limit` | -$50 | Stop if daily loss exceeds |
| `--interval` | 30s | Seconds between market scans |

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **Separate horizon models** | T-15 microstructure patterns contaminate T-60 predictions when pooled |
| **Risk-adjusted thresholds** | `PnL/(MaxDD+ε)` prevents "3 lucky trades" overfitting |
| **Best-candidate for T-60** | Fixes systematic late-sampling bias (22s → 5s median offset) |
| **Walk-forward validation** | No ticker overlap between train/test, simulates real deployment |
| **Log loss over accuracy** | Probabilistic metric that rewards calibrated uncertainty |

## Files

| File | Purpose |
|------|---------|
| `kalshi_stream.py` | Horizon-aware data collection with best-candidate selection |
| `coinbase_price_source.py` | Coinbase WebSocket with microprice, imbalance, depth |
| `kalshi_train.py` | Training with separate models, walk-forward, risk-adjusted thresholds |
| `kalshi_inference.py` | Production router for horizon-specific predictions |
| `kalshi_trader.py` | Paper/live trade execution with position tracking |
| `phase3_validate.py` | Victory gates validation |
| `start_trader.sh` | One-command startup script |

## Model Artifacts

After training, `kalshi_horizon_models/` contains:
```
kalshi_horizon_models/
├── t_15/
│   ├── model.joblib           # XGBoost classifier
│   ├── best_threshold.json    # Risk-adjusted threshold + policy
│   ├── calibration.json       # ECE + calibration curve
│   └── feature_stats.json     # Normalization stats
├── t_60/
│   └── ...
├── pooled/                    # Baseline for comparison
│   └── ...
└── router_config.json         # Production routing logic
```

## Monitoring

```bash
# Live logs
tail -f trader.log

# Trade history
python3 kalshi_trader.py --show-trades trades.jsonl

# Current status
python3 kalshi_trader.py --status

# Data collection progress
wc -l training_data.jsonl && tail -3 stream.log
```

## Troubleshooting

**No samples collecting?**
- Samples only log at T-60, T-30, T-15 before market expiry
- Check `tail -f stream.log` for connection status
- Markets may be between horizons; wait for next cycle

**Module not found errors?**
```bash
source venv/bin/activate
pip install -r requirements.txt
```

**Models not found?**
- You need 500+ samples before training
- Run training steps in Step 3 above

## Building Your Own Model (Full Workflow)

Once paper trading is working, here's how to build and refine your own model:

### Phase 1: Collect More Data
```bash
# Let data collection run for 24-48 hours for a robust dataset
nohup python3 -u kalshi_stream.py --coinbase --interval 30 --horizons-only --log my_data.jsonl > stream.log 2>&1 &

# Check sample count (aim for 1000+ for production)
wc -l my_data.jsonl
```

### Phase 2: Label and Train
```bash
# Fetch settlement outcomes from Kalshi API
python3 kalshi_train.py backfill --data my_data.jsonl

# Train your custom models
python3 kalshi_train.py separate-models \
  --data my_data.labeled.jsonl \
  --output-dir ./my_models
```

### Phase 3: Validate Performance
```bash
# Run validation gates
python3 phase3_validate.py --data my_data.labeled.jsonl

# Expected output:
# - T-60 offset median: ≤10s (PASS)
# - All horizons beat market on log loss (PASS)
# - ECE < 0.10 per horizon (PASS)
```

### Phase 4: Paper Trade Your Model
```bash
# Test with paper trading first
python3 kalshi_trader.py \
  --models-dir ./my_models \
  --paper \
  --max-position 10 \
  --daily-limit -50

# Monitor for 1-2 weeks
python3 kalshi_trader.py --show-trades trades.jsonl
```

### Phase 5: Analyze Results
```bash
# Check win rate, P&L, edge distribution
python3 kalshi_trader.py --show-trades trades.jsonl

# Look for:
# - Win rate > 55%
# - Positive total P&L
# - Consistent edge across horizons
```

### Phase 6: Go Live (Optional)
```bash
# Only after paper trading proves profitable!
python3 kalshi_trader.py \
  --models-dir ./my_models \
  --live \
  --max-position 10 \
  --daily-limit -25
```

### Continuous Improvement
```bash
# Collect fresh data weekly
python3 kalshi_stream.py --coinbase --interval 30 --horizons-only --log week2_data.jsonl

# Retrain with combined data
cat my_data.jsonl week2_data.jsonl > combined.jsonl
python3 kalshi_train.py backfill --data combined.jsonl
python3 kalshi_train.py separate-models --data combined.labeled.jsonl --output-dir ./my_models_v2

# Compare old vs new
python3 phase3_compare.py --before my_data.labeled.jsonl --after combined.labeled.jsonl
```

### Model Quality Checklist

Before going live, verify:

| Metric | Target | Check Command |
|--------|--------|---------------|
| Sample count | ≥1000 | `wc -l data.labeled.jsonl` |
| Log loss vs market | Negative delta | `python3 phase3_validate.py --data data.labeled.jsonl` |
| ECE per horizon | <0.10 | Same as above |
| Paper P&L | Positive after 50+ trades | `python3 kalshi_trader.py --show-trades trades.jsonl` |
| Win rate | >52% | Same as above |

### Risk Management

| Setting | Conservative | Moderate | Aggressive |
|---------|--------------|----------|------------|
| `--max-position` | $5 | $10 | $25 |
| `--daily-limit` | -$25 | -$50 | -$100 |
| Min edge threshold | 0.10 | 0.08 | 0.06 |

## License

MIT
