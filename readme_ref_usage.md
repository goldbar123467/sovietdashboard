# Kalshi Crypto Trading System - Usage Reference

## Quick Start

### Prerequisites

```bash
python --version  # 3.10+ required
pip install aiohttp numpy scipy pandas scikit-learn xgboost joblib
```

### First Data Collection

```bash
python kalshi_stream.py --coinbase --interval 30 --horizons-only --log my_data.jsonl
```

### First Model Training

```bash
python kalshi_train.py backfill --data my_data.jsonl
python kalshi_train.py train --data my_data.labeled.jsonl --output-dir ./my_model
```

## Complete Workflow

### Phase 1: Data Collection
```bash
nohup python -u kalshi_stream.py \
  --coinbase --interval 30 --horizons-only \
  --log kalshi_training_data.jsonl > stream.log 2>&1 &
```

### Phase 2: Label with Outcomes
```bash
python kalshi_train.py backfill --data kalshi_training_data.jsonl
```

### Phase 3: Train Separate Horizon Models
```bash
python kalshi_train.py separate-models \
  --data kalshi_training_data.labeled.jsonl \
  --output-dir ./kalshi_horizon_models
```

### Phase 4: Validate
```bash
python phase3_validate.py --data kalshi_training_data.labeled.jsonl
python phase3_compare.py --before old.labeled.jsonl --after new.labeled.jsonl
```

### Phase 5: Production Inference
```python
from kalshi_inference import HorizonRouter

router = HorizonRouter("./kalshi_horizon_models")
result = router.predict(features, horizon="T-15", market_price=0.55)
# result.trade, result.direction, result.probability
```

## CLI Reference

### kalshi_stream.py
| Flag | Description |
|------|-------------|
| `--coinbase` | Use Coinbase order book |
| `--interval N` | Refresh every N seconds |
| `--horizons-only` | Only log at T-60/T-30/T-15 |
| `--log FILE` | Output JSONL file |

### kalshi_train.py
| Command | Description |
|---------|-------------|
| `backfill` | Fetch settlement outcomes |
| `train` | Train pooled model |
| `separate-models` | Train per-horizon models |
| `horizon --compare-offsets` | Analyze T-60 offset impact |

### phase3_validate.py
Validates: T-60 offset, no lookahead, buffer freshness, log loss gates, ECE gates

### phase3_compare.py
Compares: sample counts, log loss delta, ECE, PnL per horizon

## Configuration

### Horizon Settings (kalshi_stream.py)
```python
FIXED_HORIZONS = [60, 30, 15]
T60_TOLERANCE_SEC = 45.0
GOOD_ENOUGH_OFFSET_SEC = 5.0
```

### Threshold Selection
- Risk-adjusted: `PnL / (MaxDD + 0.10)`
- Minimum 5 trades, positive PnL, DD < 80% of PnL

### Walk-Forward Split
- 70% train, 30% test by time
- Grouped by ticker (no overlap)

## Example Output

### Training
```
PROBABILISTIC EVALUATION
  Log Loss   |  MARKET: 0.6534  |  MODEL: 0.6412  |  DELTA: -0.0122
  Model BEATS market on log loss
```

### Validation
```
RESULT: PASS - All gates passed!
  T-60 offset median: 7.3s (target: <=10s)
  All horizons beat market on log loss
```
