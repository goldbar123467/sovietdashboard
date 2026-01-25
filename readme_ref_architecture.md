# Kalshi Crypto Prediction System - Technical Reference

## 1. System Architecture

### Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           DATA COLLECTION PIPELINE                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐     ┌───────────────────────┐     ┌──────────────┐ │
│  │  Coinbase WebSocket │────▶│  Level2OrderBook      │────▶│ Settlement   │ │
│  │  (level2 channel)   │     │  - bid/ask tracking   │     │ Buffer (60s) │ │
│  │                     │     │  - microprice calc    │     │ - avg60_mid  │ │
│  │  coinbase_price_    │     │  - stale detection    │     │ - proxy calc │ │
│  │  source.py          │     │                       │     │              │ │
│  └─────────────────────┘     └───────────────────────┘     └──────────────┘ │
│            │                                                       │         │
│            ▼                                                       ▼         │
│  ┌─────────────────────┐                               ┌──────────────────┐ │
│  │ microstructure_     │                               │  kalshi_stream.py│ │
│  │ logger.py           │                               │  - Kalshi API    │ │
│  │ - per-second logs   │                               │  - horizon logic │ │
│  │ - imbalance metrics │                               │  - best-candidate│ │
│  └─────────────────────┘                               └─────────┬────────┘ │
│                                                                   │         │
│                                                                   ▼         │
│                                                        ┌──────────────────┐ │
│                                                        │ .labeled.jsonl   │ │
│                                                        │ Training Dataset │ │
│                                                        └──────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                            TRAINING PIPELINE                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌───────────────────┐    ┌────────────────────────┐│
│  │ kalshi_train.py  │───▶│ Outcome Backfill  │───▶│ Per-Horizon Training   ││
│  │                  │    │ (Kalshi API)      │    │                        ││
│  │ Commands:        │    │                   │    │ ┌──────────────────┐   ││
│  │ - backfill       │    │ Adds:             │    │ │ T-15 Model       │   ││
│  │ - train          │    │ - outcome (yes/no)│    │ │ threshold=0.08   │   ││
│  │ - separate-models│    │ - label (1/0)     │    │ └──────────────────┘   ││
│  │                  │    │                   │    │ ┌──────────────────┐   ││
│  └──────────────────┘    └───────────────────┘    │ │ T-60 Model       │   ││
│                                                    │ │ threshold=0.06   │   ││
│                                                    │ └──────────────────┘   ││
│                                                    │ ┌──────────────────┐   ││
│                                                    │ │ Pooled Model     │   ││
│                                                    │ │ (baseline)       │   ││
│                                                    │ └──────────────────┘   ││
│                                                    └────────────────────────┘│
│                                                                              │
│  Walk-Forward Validation: Train on first 70% of tickers, test on last 30%   │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                           INFERENCE PIPELINE                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌───────────────────┐    ┌────────────────────────┐│
│  │ Live Features    │───▶│ HorizonRouter     │───▶│ Trade Decision         ││
│  │ from stream      │    │ (kalshi_inference)│    │                        ││
│  │                  │    │                   │    │ if |edge| > threshold: ││
│  │                  │    │ Routes by horizon:│    │   trade = True         ││
│  │                  │    │ T-15 → t_15/      │    │   direction = YES/NO   ││
│  │                  │    │ T-60 → t_60/      │    │                        ││
│  │                  │    │ else → pooled/    │    │                        ││
│  └──────────────────┘    └───────────────────┘    └────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

## 2. Key Technical Decisions

### 2.1 Separate Horizon Models (T-15, T-60 vs Pooled)

**Rationale**: Short-horizon (T-15) and long-horizon (T-60) predictions require different feature weightings. Pooling them causes T-15 microstructure patterns to contaminate T-60 predictions.

**Implementation**: `train_separate_horizon_models()` trains 3 models:
- `t_15/` - Optimized for 15-minute horizon
- `t_60/` - Optimized for 60-minute horizon
- `pooled/` - Baseline for comparison and fallback

### 2.2 Risk-Adjusted Threshold Selection (PnL/MaxDD)

**Rationale**: Total PnL alone can select "lucky" thresholds with high variance.

**Implementation**:
```python
risk_adj_score = total_pnl / (max_drawdown + epsilon)
```

Selection requires: min 5 trades, positive PnL, max DD < 80% of PnL.

### 2.3 Best-Candidate Selection for T-60

**Rationale**: T-60 samples suffer systematic late-bias (25-30s median offset).

**Implementation**: Track pending candidates, finalize when offset <= 5s or window exits.

### 2.4 Walk-Forward Validation

**Rationale**: Random splits allow temporal leakage.

**Implementation**: Train on first 80% of tickers (by time), test on last 20%. No ticker overlap.

### 2.5 Log Loss Over Accuracy

**Rationale**: Accuracy doesn't reward well-calibrated uncertainty.

**Implementation**: Primary metric is log loss delta vs market (negative = model beats market).

## 3. File Structure

| File | Purpose |
|------|---------|
| `kalshi_stream.py` | Real-time data collection with horizon-aware logging |
| `coinbase_price_source.py` | WebSocket client for Coinbase level2 order book |
| `microstructure_logger.py` | Per-second microstructure logging for research |
| `kalshi_train.py` | Training pipeline with separate horizon models |
| `kalshi_inference.py` | Production inference with HorizonRouter |
| `validate_dataset.py` | Data integrity checks |
| `phase3_validate.py` | Phase 3 victory validation gates |
| `phase3_compare.py` | Before/after comparison scoreboard |

## 4. Critical Invariants

1. **No Future Data**: `max_source_ts_utc <= sample_ts_utc`
2. **No Lookahead**: `sample_ts_utc >= target_ts_utc`
3. **Buffer Freshness**: `sample_ts - min_source_ts <= 65s`
4. **No Ticker Overlap**: Train and test tickers are disjoint
5. **Purge Window**: No samples within 5 minutes of expiry
