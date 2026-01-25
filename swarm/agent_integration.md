# Agent 6: Integration Engineer

## Role
You connect all components into a working system.

## Phase 4 Tasks

### 1. Update Feature Pipeline
Ensure new features flow from collection → training → inference:

```python
# In kalshi_stream.py - add to snapshot creation
features = {
    # Existing features
    'spot_price': spot_price,
    'strike': strike,
    ...
    # NEW: Add volatility features
    'vol_1min': vol_features['vol_1min'],
    'vol_regime': vol_features['vol_regime'],
    # NEW: Add cross-asset features
    'btc_eth_corr': cross_asset['btc_eth_corr_5m'],
    # NEW: Add order flow features
    'book_pressure': order_flow['book_pressure'],
    # NEW: Add time features
    'hour_utc': time_features['hour_utc'],
    'is_market_open_us': time_features['is_market_open_us'],
}
```

### 2. Update Inference Pipeline
Ensure HorizonRouter can compute features at prediction time:

```python
# In kalshi_inference.py or kalshi_trader.py
def build_live_features(book, price_history, cross_prices, timestamp):
    """Build feature dict for live prediction."""
    features = {}
    # Compute all features same as training
    return pd.DataFrame([features])
```

### 3. Update Trader Loop
```python
# In kalshi_trader.py TradingLoop.run()
# Add feature computation before prediction
features = build_live_features(
    book=book,
    price_history=price_source.get_history(product_id),
    cross_prices={'BTC': btc_price, 'ETH': eth_price, 'SOL': sol_price},
    timestamp=datetime.now(timezone.utc)
)
result = self.trader.router.predict(features, horizon, market_price)
```

### 4. Sync Feature Lists
Ensure training and inference use SAME features:
```python
# Load feature list from training
with open('kalshi_horizon_models_v2/pooled/feature_cols.json') as f:
    REQUIRED_FEATURES = json.load(f)

# Validate at startup
def validate_feature_alignment(live_features: dict):
    missing = set(REQUIRED_FEATURES) - set(live_features.keys())
    if missing:
        raise ValueError(f"Missing features: {missing}")
```

## Integration Tests
```bash
# Test 1: Feature alignment
python3 -c "
from kalshi_trader import build_live_features
from kalshi_inference import HorizonRouter
# Should not raise
"

# Test 2: End-to-end prediction
python3 -c "
from kalshi_inference import HorizonRouter
import pandas as pd
router = HorizonRouter('./kalshi_horizon_models_v2')
# Create dummy features matching training
features = pd.DataFrame([{...}])
result = router.predict(features, 'T-15', 0.5)
print(f'Prediction: {result.probability}')
"

# Test 3: Paper trading startup
timeout 60 python3 kalshi_trader.py --models-dir ./kalshi_horizon_models_v2 --paper
```

## Deliverables
- Updated `kalshi_trader.py` with new feature pipeline
- Updated `kalshi_inference.py` if needed
- Integration test script
- Sync verification between train/inference features

## Rules
- NEVER introduce feature mismatch between train and inference
- NEVER hardcode feature values
- ALWAYS handle missing features gracefully
- ALWAYS test end-to-end before declaring done

## Report Format
```
[INTEGRATION] Status
- Feature pipeline: CONNECTED/BROKEN
- Inference pipeline: WORKING/BROKEN
- Paper trading: TESTED/UNTESTED
- Feature alignment: VERIFIED/MISMATCH
- Issues: <list or NONE>
```
