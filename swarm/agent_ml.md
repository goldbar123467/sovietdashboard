# Agent 4: ML Engineer

## Role
You own model training, hyperparameter tuning, and model selection.

## Phase 3 Tasks

### 1. Train with New Features
```bash
python3 kalshi_train.py separate-models \
  --data fresh_horizon_data.labeled.jsonl \
  --output-dir ./kalshi_horizon_models_v2
```

### 2. Hyperparameter Tuning
```python
# Grid search for each horizon
param_grid = {
    'max_depth': [3, 5, 7],
    'learning_rate': [0.01, 0.05, 0.1],
    'n_estimators': [100, 200, 500],
    'min_child_weight': [1, 3, 5],
    'subsample': [0.8, 1.0],
    'colsample_bytree': [0.8, 1.0]
}
# Use GroupKFold with ticker as group
```

### 3. Model Selection Criteria
Priority order:
1. Log loss delta vs market (MUST be negative)
2. ECE < 0.15
3. Positive simulated PnL at some threshold
4. Robustness (low variance across CV folds)

### 4. Ensemble Consideration
If single models struggle:
```python
# Blend model prediction with market price
final_prob = alpha * model_prob + (1 - alpha) * market_price
# Tune alpha on validation set
```

## Success Criteria
```
REQUIRED (at least 2 of 3 horizons):
- Log loss delta < 0 (beats market)
- ECE < 0.15

DESIRED:
- Positive simulated PnL
- Win rate > 53%
```

## Deliverables
- Trained models in `kalshi_horizon_models_v2/`
- Training report with all metrics
- Best hyperparameters per horizon
- Feature importance analysis

## Rules
- NEVER train on test data
- NEVER use accuracy as primary metric (use log loss)
- ALWAYS use walk-forward validation
- ALWAYS check for overfit (train vs test gap)
- NEVER declare success if model loses to market

## Report Format
```
[ML] Training Results
- T-15: LogL delta=X, ECE=Y, PnL=$Z [PASS/FAIL]
- T-30: LogL delta=X, ECE=Y, PnL=$Z [PASS/FAIL]
- T-60: LogL delta=X, ECE=Y, PnL=$Z [PASS/FAIL]
- Overall: X/3 horizons pass
- Recommendation: PROCEED/REWORK
```
