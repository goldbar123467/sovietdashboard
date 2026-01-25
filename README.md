# Kalshi Crypto Trading System

ML-powered trading system for Kalshi crypto prediction markets (BTC, ETH, SOL).

## Overview

This system predicts outcomes of Kalshi's 15-minute crypto price contracts by:
1. Streaming real-time price data from **Coinbase** (a CF Benchmarks constituent exchange)
2. Fetching Kalshi market data and orderbooks
3. Computing Black-Scholes implied probabilities and edge vs market prices
4. Training XGBoost models on historical outcomes
5. Generating live trade signals

### Why Coinbase?

Kalshi settles crypto contracts using **CF Benchmarks** indices (BRTI for BTC, ETHUSD_RTI for ETH). These indices are calculated from order book data from constituent exchanges:
- Coinbase
- Kraken
- Bitstamp
- Gemini
- LMAX Digital
- Bullish

By using Coinbase as our price source, the model trains on data that directly contributes to settlement prices.

## Files

| File | Description |
|------|-------------|
| `kalshi_stream.py` | Real-time market data streamer and logger |
| `coinbase_price_source.py` | Hardened Coinbase WebSocket level2 order book client |
| `kalshi_train.py` | Model training with outcome backfill |
| `kalshi_infer.py` | Live inference for trade signals |
| `kalshi_model/` | Pre-trained model artifacts |

## Setup

```bash
# Create virtual environment
python -m venv kalshi_venv
source kalshi_venv/bin/activate

# Install dependencies
pip install aiohttp numpy pandas scikit-learn xgboost coinbase-advanced-py
```

## Usage

### 1. Collect Training Data

```bash
# Stream and log market data (runs continuously)
python kalshi_stream.py --coinbase --interval 30 --log kalshi_data.jsonl

# Run in background for overnight collection
nohup python -u kalshi_stream.py --coinbase --interval 30 --log kalshi_data.jsonl > stream.log 2>&1 &
```

### 2. Train Model

```bash
# Backfill outcomes and train
python kalshi_train.py all --data kalshi_data.jsonl --out ./kalshi_model

# Or step by step:
python kalshi_train.py backfill --data kalshi_data.jsonl  # Add outcomes
python kalshi_train.py train --data kalshi_data.jsonl --out ./kalshi_model
```

### 3. Run Inference

```bash
# Continuous predictions
python kalshi_infer.py --model ./kalshi_model --interval 60

# Single prediction
python kalshi_infer.py --model ./kalshi_model --once
```

## Model Performance

Current model metrics (trained on ~3000 samples):

| Metric | Value |
|--------|-------|
| Test Accuracy | 98.8% |
| Test AUC | 0.999 |
| Test F1 | 0.990 |
| CV AUC (5-fold) | 0.998 ± 0.002 |

### Features (22 total)

Core features:
- `spot_price`, `strike`, `mins_to_expiry`
- `vol_annual` (realized volatility)
- `yes_price`, `yes_bid`, `yes_ask`, `spread`
- `orderbook_imbalance`
- `p_model` (Black-Scholes probability)
- `edge`, `logit_edge`

Engineered features:
- `moneyness`, `log_moneyness`
- `time_scaled_vol`
- `bid_ask_mid`, `model_vs_mid`
- `edge_per_min`, `vol_adjusted_edge`
- `spread_pct`, `strike_distance_vol`

## Hardening Features

The Coinbase feed includes overnight reliability features:
- **Watchdog**: Monitors connection health, forces reconnect if stale >60s
- **Exponential backoff**: Reconnect delay with jitter (1-30s)
- **Data quality validation**: Detects crossed books, wide spreads, price jumps
- **Monitoring stats**: Tracks reconnects, stale periods, bad ticks

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Coinbase WS    │     │   Kalshi API    │
│  (level2 book)  │     │  (markets/ob)   │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│           kalshi_stream.py              │
│  - Compute mid-price from order book    │
│  - Fetch Kalshi contracts & orderbooks  │
│  - Calculate edge vs market price       │
│  - Log samples to JSONL                 │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│           kalshi_train.py               │
│  - Backfill outcomes from Kalshi API    │
│  - Engineer features                    │
│  - Train XGBoost classifier             │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│           kalshi_infer.py               │
│  - Load trained model                   │
│  - Generate live predictions            │
│  - Display trade signals                │
└─────────────────────────────────────────┘
```

## License

MIT
