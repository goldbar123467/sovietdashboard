# Agent 3: Evaluation Upgrade

## Mission
Modify `kalshi_train.py` to use log loss / Brier score as primary metrics and add trade simulation.

## File to Modify
`/home/clark/kalshi_train.py`

## Changes Required

### 1. Add Imports (near top)

```python
from sklearn.metrics import log_loss, brier_score_loss
```

### 2. Replace/Enhance `compute_baselines()` Function

```python
def compute_probabilistic_baselines(df_test: pd.DataFrame, y_test: pd.Series, y_prob: np.ndarray):
    """Compare model vs market using proper probabilistic metrics.

    This is THE key evaluation: do we predict better than yes_price?
    """
    print("\n" + "=" * 60)
    print("PROBABILISTIC EVALUATION (Primary Metrics)")
    print("=" * 60)

    # Market baseline: use yes_price as probability estimate
    market_prob = df_test['yes_price'].values

    # Clip probabilities to avoid log(0)
    eps = 1e-7
    y_prob_clipped = np.clip(y_prob, eps, 1 - eps)
    market_prob_clipped = np.clip(market_prob, eps, 1 - eps)

    # Log Loss (lower is better)
    model_logloss = log_loss(y_test, y_prob_clipped)
    market_logloss = log_loss(y_test, market_prob_clipped)
    logloss_delta = model_logloss - market_logloss

    # Brier Score (lower is better)
    model_brier = brier_score_loss(y_test, y_prob)
    market_brier = brier_score_loss(y_test, market_prob)
    brier_delta = model_brier - market_brier

    print("\n┌─────────────────────────────────────────────────────────┐")
    print("│  METRIC        │  MARKET    │  MODEL     │  DELTA      │")
    print("├─────────────────────────────────────────────────────────┤")
    print(f"│  Log Loss      │  {market_logloss:.4f}    │  {model_logloss:.4f}    │  {logloss_delta:+.4f}     │")
    print(f"│  Brier Score   │  {market_brier:.4f}    │  {model_brier:.4f}    │  {brier_delta:+.4f}     │")
    print("└─────────────────────────────────────────────────────────┘")

    # Interpretation
    print("\nInterpretation:")
    if logloss_delta < -0.01:
        print("  ✅ Model BEATS market on log loss (negative delta = better)")
    elif logloss_delta > 0.01:
        print("  ❌ Model LOSES to market on log loss")
    else:
        print("  ⚖️  Model roughly EQUAL to market on log loss")

    if brier_delta < -0.005:
        print("  ✅ Model BEATS market on Brier score")
    elif brier_delta > 0.005:
        print("  ❌ Model LOSES to market on Brier score")
    else:
        print("  ⚖️  Model roughly EQUAL to market on Brier score")

    return {
        'model_logloss': model_logloss,
        'market_logloss': market_logloss,
        'logloss_delta': logloss_delta,
        'model_brier': model_brier,
        'market_brier': market_brier,
        'brier_delta': brier_delta
    }
```

### 3. Add Trade Simulation Function

```python
def simulate_trades(df_test: pd.DataFrame, y_test: pd.Series, y_prob: np.ndarray,
                    thresholds: list[float] = None):
    """Simulate trading with different edge thresholds.

    Trade only when |model_prob - market_prob| > threshold.
    Account for spread costs by using ask for buys, bid for sells.
    """
    if thresholds is None:
        thresholds = [0.02, 0.05, 0.08, 0.10, 0.15, 0.20]

    print("\n" + "=" * 60)
    print("TRADE SIMULATION (with spread costs)")
    print("=" * 60)

    market_prob = df_test['yes_price'].values
    edge = y_prob - market_prob

    results = []

    for thresh in thresholds:
        # Identify tradeable opportunities
        buy_yes = edge > thresh   # Model says higher than market
        buy_no = edge < -thresh   # Model says lower than market
        tradeable = buy_yes | buy_no

        n_trades = tradeable.sum()
        if n_trades == 0:
            results.append({
                'threshold': thresh,
                'n_trades': 0,
                'win_rate': None,
                'avg_pnl': None,
                'total_pnl': None,
                'selective_logloss': None
            })
            continue

        # Calculate PnL with spread costs
        pnl = []
        for i, idx in enumerate(df_test.index):
            if not tradeable.iloc[i] if isinstance(tradeable, pd.Series) else not tradeable[i]:
                continue

            row = df_test.loc[idx]
            outcome = y_test.loc[idx] if isinstance(y_test, pd.Series) else y_test[i]

            if buy_yes[i] if isinstance(buy_yes, np.ndarray) else buy_yes.iloc[i]:
                # Buy YES: pay the ask, win $1 if outcome=1
                entry_price = row['yes_ask']
                profit = outcome - entry_price  # Win: 1-ask, Lose: 0-ask = -ask
                pnl.append(profit)
            elif buy_no[i] if isinstance(buy_no, np.ndarray) else buy_no.iloc[i]:
                # Buy NO: pay (1 - yes_bid), win $1 if outcome=0
                entry_price = 1 - row['yes_bid']
                profit = (1 - outcome) - entry_price  # Win: 1-entry, Lose: 0-entry
                pnl.append(profit)

        # Selective log loss (only on traded samples)
        traded_mask = tradeable if isinstance(tradeable, np.ndarray) else tradeable.values
        if traded_mask.sum() > 0:
            traded_y = y_test.values[traded_mask] if isinstance(y_test, pd.Series) else y_test[traded_mask]
            traded_prob = y_prob[traded_mask]
            selective_logloss = log_loss(traded_y, np.clip(traded_prob, 1e-7, 1-1e-7))
        else:
            selective_logloss = None

        results.append({
            'threshold': thresh,
            'n_trades': n_trades,
            'win_rate': np.mean([p > 0 for p in pnl]) if pnl else None,
            'avg_pnl': np.mean(pnl) if pnl else None,
            'total_pnl': np.sum(pnl) if pnl else None,
            'selective_logloss': selective_logloss
        })

    # Print results table
    print("\n┌────────────┬──────────┬──────────┬──────────┬──────────┬──────────────┐")
    print("│ Threshold  │ N Trades │ Win Rate │ Avg PnL  │ Total PnL│ Select LogL  │")
    print("├────────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤")

    for r in results:
        thresh = f"{r['threshold']:.2f}"
        n = f"{r['n_trades']:>6d}" if r['n_trades'] else "     -"
        wr = f"{r['win_rate']*100:>5.1f}%" if r['win_rate'] is not None else "     -"
        avg = f"${r['avg_pnl']:>+.3f}" if r['avg_pnl'] is not None else "      -"
        tot = f"${r['total_pnl']:>+.2f}" if r['total_pnl'] is not None else "      -"
        sll = f"{r['selective_logloss']:.4f}" if r['selective_logloss'] is not None else "      -"
        print(f"│   {thresh}    │ {n} │ {wr}  │ {avg} │ {tot:>8s}│   {sll:>8s}   │")

    print("└────────────┴──────────┴──────────┴──────────┴──────────┴──────────────┘")

    # Summary
    profitable = [r for r in results if r['total_pnl'] is not None and r['total_pnl'] > 0]
    if profitable:
        best = max(profitable, key=lambda x: x['total_pnl'])
        print(f"\n  Best threshold: {best['threshold']:.2f} with ${best['total_pnl']:.2f} total PnL")
    else:
        print("\n  ⚠️  No profitable threshold found")

    return results
```

### 4. Add Horizon-Stratified Metrics

```python
def evaluate_by_horizon(df_test: pd.DataFrame, y_test: pd.Series, y_prob: np.ndarray):
    """Evaluate model separately for each horizon (T-60, T-30, T-15)."""

    if 'horizon' not in df_test.columns:
        print("\n  (No horizon field in data - skipping horizon analysis)")
        return {}

    print("\n" + "=" * 60)
    print("HORIZON-STRATIFIED EVALUATION")
    print("=" * 60)

    horizons = df_test['horizon'].dropna().unique()
    if len(horizons) == 0:
        print("  No horizon data available")
        return {}

    results = {}

    print("\n┌──────────┬─────────┬────────────┬────────────┬────────────┐")
    print("│ Horizon  │ Samples │ Model LogL │ Market LogL│   Delta    │")
    print("├──────────┼─────────┼────────────┼────────────┼────────────┤")

    for horizon in sorted(horizons):
        mask = df_test['horizon'] == horizon
        if mask.sum() < 10:
            continue

        h_y = y_test[mask].values if isinstance(y_test, pd.Series) else y_test[mask]
        h_prob = y_prob[mask]
        h_market = df_test.loc[mask, 'yes_price'].values

        eps = 1e-7
        h_model_ll = log_loss(h_y, np.clip(h_prob, eps, 1-eps))
        h_market_ll = log_loss(h_y, np.clip(h_market, eps, 1-eps))
        delta = h_model_ll - h_market_ll

        results[horizon] = {
            'n_samples': mask.sum(),
            'model_logloss': h_model_ll,
            'market_logloss': h_market_ll,
            'delta': delta
        }

        print(f"│  {horizon:<6s}  │  {mask.sum():>5d}  │   {h_model_ll:.4f}   │   {h_market_ll:.4f}   │  {delta:+.4f}    │")

    print("└──────────┴─────────┴────────────┴────────────┴────────────┘")

    return results
```

### 5. Update `train_model()` to Call New Functions

In the `train_model()` function, after computing predictions, add:

```python
    # After y_pred and y_prob are computed...

    # Primary evaluation: probabilistic metrics vs market
    prob_metrics = compute_probabilistic_baselines(
        df_test, y_test, y_prob
    )

    # Trade simulation
    trade_results = simulate_trades(df_test, y_test, y_prob)

    # Horizon-stratified analysis (if available)
    horizon_metrics = evaluate_by_horizon(df_test, y_test, y_prob)

    # Update metrics dict
    metrics.update({
        'model_logloss': prob_metrics['model_logloss'],
        'market_logloss': prob_metrics['market_logloss'],
        'logloss_delta': prob_metrics['logloss_delta'],
        'model_brier': prob_metrics['model_brier'],
        'market_brier': prob_metrics['market_brier'],
        'brier_delta': prob_metrics['brier_delta'],
        'trade_simulation': trade_results,
        'horizon_metrics': horizon_metrics
    })
```

### 6. Update Metrics JSON Output

The metrics.json should now include:

```json
{
  "model_logloss": 0.5234,
  "market_logloss": 0.5156,
  "logloss_delta": 0.0078,
  "model_brier": 0.1823,
  "market_brier": 0.1798,
  "brier_delta": 0.0025,
  "trade_simulation": [
    {"threshold": 0.05, "n_trades": 45, "win_rate": 0.62, "avg_pnl": 0.023, "total_pnl": 1.04},
    ...
  ],
  "horizon_metrics": {
    "T-60": {"n_samples": 50, "model_logloss": 0.54, "market_logloss": 0.52, "delta": 0.02},
    ...
  }
}
```

## Verification

```bash
# Retrain with new metrics
python kalshi_train.py train \
  --data kalshi_training_data.labeled.jsonl \
  --output-dir ./kalshi_model_v2 \
  --purge-mins 5

# Check output includes:
# 1. PROBABILISTIC EVALUATION section
# 2. TRADE SIMULATION table
# 3. HORIZON-STRATIFIED EVALUATION (if horizon data exists)

# Verify metrics.json has new fields
cat kalshi_model_v2/metrics.json | python -m json.tool | grep -E "logloss|brier"
```

## Success Criteria
- [ ] Log loss printed as PRIMARY metric (above accuracy)
- [ ] Market baseline log loss computed from `yes_price`
- [ ] Delta shows model vs market (negative = model better)
- [ ] Brier score also printed
- [ ] Trade simulation table with spread-adjusted PnL
- [ ] Horizon metrics (if data has `horizon` field)
- [ ] All new metrics saved to metrics.json

## Key Insight

The PRIMARY question is now:
> "Does the model's log loss beat yes_price's log loss?"

If not, the model provides no value over just trusting the market.

Accuracy is secondary. A 60% accurate model that beats market log loss by 0.02 is more valuable than a 75% accurate model that loses to market log loss.
