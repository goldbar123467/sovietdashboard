# Phase 3: Victory Criteria

## Overview

After streaming `new_data.jsonl` with best-candidate selection enabled, these gates must pass to declare the T-60 late-sampling fix successful.

---

## Data Quality Gates

| Check | Metric | Pass Threshold | Notes |
|-------|--------|----------------|-------|
| T-60 Offset | `chosen_offset_sec` median | ≤ 10s (goal: ≤ 5s) | Best-candidate should hit target |
| No Lookahead | `max_source_ts_utc <= sample_ts_utc` | 100% pass | Zero tolerance for future data |
| Buffer Freshness | Settlement buffer age | ≤ 65s (100% pass) | All samples use recent data |
| T-60 Fallback Rate | `is_fallback` fraction | ≤ 30% | Low fallback = good sample quality |

---

## Model Gates

### Log Loss Delta vs Market (lower = better)

| Horizon | Target | Rationale |
|---------|--------|-----------|
| T-15 | < 0 | Already good, maintain edge |
| T-30 | ≤ 0 | Fine, no regression |
| T-60 | ≤ 0 | **This is the whole point** |

### Calibration (ECE)

| Horizon | Target | Notes |
|---------|--------|-------|
| All | < 0.06 | T-60 should improve most |

### Trade Simulation

| Horizon | Target |
|---------|--------|
| T-15 | Best-threshold PnL ≥ 0 |
| T-30 | Best-threshold PnL ≥ 0 |
| T-60 | Best-threshold PnL ≥ 0 |

---

## Validation Commands

### Single Dataset Validation
```bash
# After collecting new data
python phase3_validate.py \
  --data new_data.labeled.jsonl \
  --model-dir ./kalshi_model_v3

# Output: PASS/FAIL per gate with summary
```

### Before/After Comparison (The Ritual)
```bash
# Compare old vs new to prove the engineering change mattered
python phase3_compare.py \
  --before old_data.labeled.jsonl \
  --after new_data.labeled.jsonl

# Output includes:
# - Δ sample counts per horizon (watch for T-60 drop)
# - Δ log loss delta per horizon
# - Δ ECE per horizon
# - Δ best-threshold PnL per horizon
# - T-60 offset median improvement
# - T-60 fallback rate
# - VERDICT: ENGINEERING CHANGE VALIDATED / NEEDS ATTENTION
```

---

## Success Declaration

All gates pass → **Phase 3 Complete**

The systemic T-60 late-sampling weakness is fixed. The model now beats market baseline across all horizons.

---

## Failure Modes

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| T-60 offset still > 10s | Best-candidate not triggering | Check `BEST_CANDIDATE_HORIZONS` includes 60 |
| T-60 LogL delta still > 0 | Not enough data | Collect more samples |
| ECE > 0.06 | Calibration drift | Recalibrate thresholds |
| Negative PnL all thresholds | Edge too small for costs | Need more signal, not a bug |
| T-60 sample count collapsed | Best-candidate too selective | See mitigations below |
| High fallback rate (>30%) | Markets don't provide good candidates | Widen tolerance or accept quality tradeoff |

---

## T-60 Sample Count Mitigation

Best-candidate selection can reduce logged samples if some markets never provide a valid in-window candidate. Quality over quantity is fine, but if sample count collapses (>50% drop):

### Option 1: Widen Tolerance (Current Setting)
In `kalshi_stream.py`:
```python
T60_TOLERANCE_SEC = 45.0  # Default 45s, can increase to 60s
```

### Option 2: Reduce Polling Interval During T-60 Window
More frequent checks = better chance of catching ideal offset.

### Option 3: Fallback with Labeling (Implemented)
Keep best-candidate but allow "first in window" as fallback when no good candidate found.
The `is_fallback=True` flag marks these samples for analysis:
```python
# Filter out fallbacks in training if needed
df_quality = df[df['is_fallback'] == False]
```

### Monitoring
```bash
# Check fallback rate in new data
python phase3_validate.py --data new_data.jsonl --data-only
# Look for: T-60 fallback rate gate
```

---

## Next Edge Move: Separate Horizon Models

Once Phase 3 gates pass, the natural next step is to train 3 separate models (one per horizon).
This often improves T-60 stability because it stops the model from learning short-horizon
microstructure patterns that don't generalize to 60m.

### Training Separate Models
```bash
python kalshi_train.py separate-models \
  --data new_data.labeled.jsonl \
  --output-dir ./kalshi_horizon_models

# Creates:
#   ./kalshi_horizon_models/pooled/     (baseline for comparison)
#   ./kalshi_horizon_models/t_15/
#   ./kalshi_horizon_models/t_30/
#   ./kalshi_horizon_models/t_60/
#   ./kalshi_horizon_models/horizon_models_summary.json
```

### Comparison Output
```
COMPARISON: POOLED vs SEPARATE MODELS

  LogL Delta vs Market (negative = model beats market)
  Horizon       Pooled     Separate    Improvement
  T-15        -0.0123      -0.0145       +0.0022 ^
  T-30        -0.0089      -0.0091       +0.0002 =
  T-60        +0.0078      -0.0034       +0.0112 ^

  Recommendations:
    + Use separate model for: T-15, T-60
    = No significant difference for: T-30
```

### Per-Horizon Threshold Policy
Each horizon model now outputs robust policy metrics:
- Number of trades at best threshold
- Average edge per trade (expected value proxy)
- Max drawdown (prevents "3 lucky trades" fooling you)
- Win rate

```
T-60:
  Thresh | Trades | Avg Edge | Avg PnL  | Max DD  | Total PnL
   0.08  |    45  |  +0.032  | $+0.018 | $0.42 | $+0.81  <<<

  BEST POLICY: threshold=0.08
    Trades:      45
    Win rate:    62.2%
    Avg edge:    3.20% per trade
    Avg PnL:     $0.018 per trade
    Max DD:      $0.42
    Total PnL:   $0.81
```
