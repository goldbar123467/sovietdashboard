# Kalshi Crypto Prediction System

Production-ready ML system for Kalshi crypto prediction markets (BTC, ETH, SOL) with horizon-aware models and proper probabilistic evaluation.

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

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **Separate horizon models** | T-15 microstructure patterns contaminate T-60 predictions when pooled |
| **Risk-adjusted thresholds** | `PnL/(MaxDD+ε)` prevents "3 lucky trades" overfitting |
| **Best-candidate for T-60** | Fixes systematic late-sampling bias (22s → 5s median offset) |
| **Walk-forward validation** | No ticker overlap between train/test, simulates real deployment |
| **Log loss over accuracy** | Probabilistic metric that rewards calibrated uncertainty |

## Quick Start

```bash
# Install
pip install aiohttp numpy scipy pandas scikit-learn xgboost joblib

# Collect data (let run 2-3 hours)
python kalshi_stream.py --coinbase --interval 30 --horizons-only --log data.jsonl

# Label with outcomes
python kalshi_train.py backfill --data data.jsonl

# Train separate horizon models
python kalshi_train.py separate-models \
  --data data.labeled.jsonl \
  --output-dir ./kalshi_horizon_models

# Production inference
python kalshi_inference.py --models-dir ./kalshi_horizon_models
```

## Files

### Core Pipeline

| File | Purpose |
|------|---------|
| `kalshi_stream.py` | Horizon-aware data collection with best-candidate selection for T-60 |
| `coinbase_price_source.py` | Hardened Coinbase WebSocket with microprice, imbalance, depth |
| `kalshi_train.py` | Training with separate models, walk-forward, risk-adjusted thresholds |
| `kalshi_inference.py` | Production router: `if horizon == T-15: use t_15 elif T-60: use t_60` |

### Validation

| File | Purpose |
|------|---------|
| `phase3_validate.py` | Victory gates: offset, lookahead, ECE, PnL per horizon |
| `phase3_compare.py` | Before/after scoreboard proving engineering changes work |
| `validate_dataset.py` | Data integrity: no future data, proper dedup, buffer freshness |

### Research

| File | Purpose |
|------|---------|
| `microstructure_logger.py` | Per-second JSONL logging (spread, imbalance, microprice) |

## Model Artifacts

```
kalshi_horizon_models/
├── t_15/
│   ├── model.joblib           # XGBoost classifier
│   ├── best_threshold.json    # Risk-adjusted threshold + policy
│   ├── calibration.json       # ECE + bin-wise calibration curve
│   └── feature_stats.json     # Normalization stats
├── t_60/
│   └── ...
├── pooled/                    # Baseline for comparison
│   └── ...
└── router_config.json         # Production routing logic
```

## CLI Reference

### Data Collection

```bash
# Continuous horizon snapshots
python kalshi_stream.py --coinbase --interval 30 --horizons-only --log data.jsonl

# Research: per-second microstructure
python microstructure_logger.py --assets BTC ETH --duration 300
```

### Training

```bash
# Fetch settlement outcomes
python kalshi_train.py backfill --data data.jsonl

# Train separate horizon models (recommended)
python kalshi_train.py separate-models --data data.labeled.jsonl --output-dir ./models

# Analyze T-60 offset impact
python kalshi_train.py horizon --data data.labeled.jsonl --compare-offsets
```

### Validation

```bash
# Check all victory gates
python phase3_validate.py --data data.labeled.jsonl

# Compare before/after datasets
python phase3_compare.py --before old.labeled.jsonl --after new.labeled.jsonl
```

### Inference

```bash
# Demo with test data
python kalshi_inference.py --models-dir ./kalshi_horizon_models --data test.jsonl
```

```python
# Programmatic usage
from kalshi_inference import HorizonRouter

router = HorizonRouter("./kalshi_horizon_models")
result = router.predict(features, horizon="T-60", market_price=0.55)

print(f"Probability: {result.probability:.2%}")
print(f"Trade: {result.trade} {result.direction}")  # True YES / True NO / False None
print(f"Edge: {result.edge:.3f}")
```

## Evaluation Metrics

Primary metrics compare model vs market baseline (yes_price as probability):

```
PROBABILISTIC EVALUATION
════════════════════════════════════════════════════════════════
  METRIC        │  MARKET    │  MODEL     │  DELTA
────────────────┼────────────┼────────────┼─────────────────────
  Log Loss      │  0.6534    │  0.6412    │  -0.0122 (BETTER)
  Brier Score   │  0.2341    │  0.2298    │  -0.0043 (BETTER)
  ECE           │  0.0623    │  0.0489    │  -0.0134 (BETTER)
```

Per-horizon threshold policy with robustness metrics:

```
T-60:
  Thresh │ Trades │ Avg Edge │ Avg PnL  │ Max DD  │ Total PnL │ Risk Adj
═════════╪════════╪══════════╪══════════╪═════════╪═══════════╪══════════
   0.06  │    67  │  +0.028  │ $+0.012  │ $0.51   │ $+0.80    │ 1.31
   0.08  │    45  │  +0.035  │ $+0.018  │ $0.42   │ $+0.81    │ 1.56 <<<
   0.10  │    28  │  +0.041  │ $+0.022  │ $0.38   │ $+0.62    │ 1.29

  BEST POLICY (by risk-adjusted score): threshold=0.08
    Trades:        45
    Win rate:      62.2%
    Avg edge:      3.50% per trade
    Max DD:        $0.42
    Risk-adj:      1.56 (PnL/DD)
```

## Data Quality Invariants

Enforced by `validate_dataset.py` and `phase3_validate.py`:

| Invariant | Check |
|-----------|-------|
| No future data | `max_source_ts <= sample_ts` (100% pass required) |
| No lookahead | `sample_ts >= target_ts` |
| Buffer freshness | Settlement buffer age ≤ 65s |
| Deduplication | One sample per (ticker, horizon) |
| T-60 offset | Median ≤ 10s (goal: ≤ 5s) |
| Fallback rate | T-60 fallbacks ≤ 30% |

## Why Coinbase?

Kalshi settles using **CF Benchmarks** indices calculated from constituent exchanges:
- Coinbase, Kraken, Bitstamp, Gemini, LMAX Digital, Bullish

The settlement proxy uses a 60-second rolling average of Coinbase mid price to approximate CF Benchmarks BRTI/ETHUSD_RTI.

## Configuration

### Horizon Settings (`kalshi_stream.py`)

```python
FIXED_HORIZONS = [60, 30, 15]       # Minutes before expiry
T60_TOLERANCE_SEC = 45.0            # Wider window for T-60
GOOD_ENOUGH_OFFSET_SEC = 5.0        # Finalize immediately if offset <= 5s
BEST_CANDIDATE_HORIZONS = {60}      # Only T-60 uses best-candidate
```

### Threshold Selection

```python
risk_adj_score = total_pnl / (max_drawdown + 0.10)

# Selection criteria:
# - Minimum 5 trades
# - Positive total PnL
# - Max drawdown < 80% of total PnL
# - Highest risk-adjusted score wins
```

### Walk-Forward Split

```python
train_pct = 0.70  # 70% train, 30% test by time
# Grouped by ticker - NO ticker appears in both train and test
```

## License

MIT
