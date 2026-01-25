#!/usr/bin/env python3
"""
Kalshi Model Training Pipeline
==============================
1. Backfills outcomes for expired markets
2. Joins features with labels
3. Trains XGBoost classifier
4. Outputs model + performance metrics

Usage:
    python kalshi_train.py backfill --data /home/clark/kalshi_training_data.jsonl
    python kalshi_train.py train --data /home/clark/kalshi_training_data.jsonl
    python kalshi_train.py all --data /home/clark/kalshi_training_data.jsonl
"""

import argparse
import asyncio
import aiohttp
import json
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import pickle
import warnings
warnings.filterwarnings('ignore')

# ============================================================================
# CONFIG
# ============================================================================

KALSHI_API_KEY = "bd1735b6-5c51-4043-a1df-4172a5eb8580"
KALSHI_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2"

FEATURE_COLS = [
    'spot_price', 'strike', 'mins_to_expiry', 'vol_annual',
    'yes_price', 'yes_bid', 'yes_ask', 'spread',
    'orderbook_imbalance', 'p_model', 'edge', 'logit_edge'
]

# Derived features we'll engineer
DERIVED_FEATURES = [
    'moneyness',           # spot / strike
    'log_moneyness',       # log(spot / strike)
    'time_scaled_vol',     # vol * sqrt(mins / 525600)
    'bid_ask_mid',         # (yes_bid + yes_ask) / 2
    'model_vs_mid',        # p_model - bid_ask_mid
    'edge_per_min',        # edge / mins_to_expiry
    'vol_adjusted_edge',   # edge / vol_annual
]

# ============================================================================
# OUTCOME FETCHER
# ============================================================================

class OutcomeFetcher:
    def __init__(self, api_key: str = KALSHI_API_KEY):
        self.api_key = api_key
        self.session: Optional[aiohttp.ClientSession] = None
        self.cache: dict[str, Optional[str]] = {}
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, *args):
        if self.session:
            await self.session.close()
    
    async def get_outcome(self, ticker: str) -> Optional[str]:
        """Fetch settlement result for a market. Returns 'yes', 'no', or None if not settled."""
        if ticker in self.cache:
            return self.cache[ticker]
        
        url = f"{KALSHI_BASE_URL}/markets/{ticker}"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        
        try:
            async with self.session.get(url, headers=headers) as resp:
                if resp.status != 200:
                    self.cache[ticker] = None
                    return None
                
                data = await resp.json()
                market = data.get("market", {})
                result = market.get("result")  # 'yes', 'no', or None
                
                self.cache[ticker] = result
                return result
        except Exception as e:
            print(f"Error fetching {ticker}: {e}")
            self.cache[ticker] = None
            return None
    
    async def backfill_outcomes(self, df: pd.DataFrame, ticker_col: str = 'ticker') -> pd.DataFrame:
        """Add outcome column to dataframe"""
        unique_tickers = df[ticker_col].unique()
        print(f"Fetching outcomes for {len(unique_tickers)} unique tickers...")
        
        # Batch fetch with rate limiting
        outcomes = {}
        for i, ticker in enumerate(unique_tickers):
            outcome = await self.get_outcome(ticker)
            outcomes[ticker] = outcome
            
            if (i + 1) % 50 == 0:
                print(f"  Fetched {i + 1}/{len(unique_tickers)}")
                await asyncio.sleep(0.5)  # Rate limit
        
        df['outcome'] = df[ticker_col].map(outcomes)
        df['label'] = df['outcome'].map({'yes': 1, 'no': 0})
        
        settled = df['label'].notna().sum()
        print(f"Settled markets: {settled}/{len(df)} ({settled/len(df)*100:.1f}%)")
        
        return df

# ============================================================================
# FEATURE ENGINEERING
# ============================================================================

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add derived features"""
    df = df.copy()
    
    # Moneyness
    df['moneyness'] = df['spot_price'] / df['strike']
    df['log_moneyness'] = np.log(df['moneyness'])
    
    # Time-scaled volatility
    df['time_scaled_vol'] = df['vol_annual'] * np.sqrt(df['mins_to_expiry'] / 525600)
    
    # Mid price
    df['bid_ask_mid'] = (df['yes_bid'] + df['yes_ask']) / 2
    df['model_vs_mid'] = df['p_model'] - df['bid_ask_mid']
    
    # Edge scaling
    df['edge_per_min'] = df['edge'] / df['mins_to_expiry'].clip(lower=0.1)
    df['vol_adjusted_edge'] = df['edge'] / df['vol_annual'].clip(lower=0.01)
    
    # Spread as % of price
    df['spread_pct'] = df['spread'] / df['yes_price'].clip(lower=0.01)
    
    # Distance to strike (in vol units)
    df['strike_distance_vol'] = df['log_moneyness'] / df['time_scaled_vol'].clip(lower=0.001)
    
    return df

def prepare_training_data(df: pd.DataFrame, purge_mins: int = 5, min_samples_per_ticker: int = 3) -> tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    """Prepare X and y for training

    Args:
        df: Raw dataframe with label column
        purge_mins: Exclude samples within N minutes of expiry (prevents late-market leakage)
        min_samples_per_ticker: Require minimum samples per ticker for statistical validity

    Returns:
        X: Feature dataframe
        y: Label series
        df_settled: Processed dataframe (needed for walk-forward split by ticker)
    """
    # Only use settled markets
    df_settled = df[df['label'].notna()].copy()

    if len(df_settled) == 0:
        raise ValueError("No settled markets found! Need to wait for markets to expire.")

    print(f"Settled markets: {len(df_settled)}")

    # PURGE WINDOW: Remove samples too close to expiry (price ≈ outcome)
    if purge_mins > 0:
        before_purge = len(df_settled)
        df_settled = df_settled[df_settled['mins_to_expiry'] >= purge_mins]
        print(f"After purging <{purge_mins}min samples: {len(df_settled)} (removed {before_purge - len(df_settled)})")

    # Filter tickers with too few samples
    if min_samples_per_ticker > 1:
        ticker_counts = df_settled['ticker'].value_counts()
        valid_tickers = ticker_counts[ticker_counts >= min_samples_per_ticker].index
        before_filter = len(df_settled)
        df_settled = df_settled[df_settled['ticker'].isin(valid_tickers)]
        print(f"After filtering tickers with <{min_samples_per_ticker} samples: {len(df_settled)} (removed {before_filter - len(df_settled)})")

    if len(df_settled) == 0:
        raise ValueError("No samples remaining after filtering! Try reducing purge_mins or min_samples_per_ticker.")

    # Engineer features
    df_settled = engineer_features(df_settled)

    # Define feature columns
    feature_cols = FEATURE_COLS + [
        'moneyness', 'log_moneyness', 'time_scaled_vol', 'bid_ask_mid',
        'model_vs_mid', 'edge_per_min', 'vol_adjusted_edge', 'spread_pct',
        'strike_distance_vol'
    ]

    # Filter to available columns
    available_cols = [c for c in feature_cols if c in df_settled.columns]

    X = df_settled[available_cols].copy()
    y = df_settled['label'].astype(int)

    # Handle missing values
    X = X.fillna(X.median())

    # Remove infinities
    X = X.replace([np.inf, -np.inf], np.nan).fillna(X.median())

    print(f"Training data: {len(X)} samples, {len(available_cols)} features")
    print(f"Class balance: {y.mean():.1%} positive (price above strike)")
    print(f"Unique tickers: {df_settled['ticker'].nunique()}")
    print(f"Samples per ticker: mean={df_settled.groupby('ticker').size().mean():.1f}, median={df_settled.groupby('ticker').size().median():.0f}")

    return X, y, df_settled

# ============================================================================
# MODEL TRAINING
# ============================================================================

def compute_baselines(df_test: pd.DataFrame, y_test: pd.Series):
    """Compare model against dumb baselines to verify we're not just memorizing"""
    print("\n" + "="*50)
    print("BASELINE COMPARISON (Sanity Check)")
    print("="*50)
    print("If model barely beats these, we have no real edge.\n")

    results = {}

    # Baseline 1: Market price > 0.5
    if 'yes_price' in df_test.columns:
        baseline_market = (df_test['yes_price'] > 0.5).astype(int)
        acc_market = (baseline_market.values == y_test.values).mean()
        results['market_price'] = acc_market
        print(f"Market price > 0.5:     {acc_market:.1%}")

    # Baseline 2: Spot > Strike (moneyness)
    if 'spot_price' in df_test.columns and 'strike' in df_test.columns:
        baseline_moneyness = (df_test['spot_price'] > df_test['strike']).astype(int)
        acc_moneyness = (baseline_moneyness.values == y_test.values).mean()
        results['moneyness'] = acc_moneyness
        print(f"Spot > Strike:          {acc_moneyness:.1%}")

    # Baseline 3: p_model > 0.5 (Black-Scholes)
    if 'p_model' in df_test.columns:
        baseline_bs = (df_test['p_model'] > 0.5).astype(int)
        acc_bs = (baseline_bs.values == y_test.values).mean()
        results['black_scholes'] = acc_bs
        print(f"Black-Scholes > 0.5:    {acc_bs:.1%}")

    # Baseline 4: Always predict majority class
    majority_class = int(y_test.mean() > 0.5)
    acc_majority = (y_test == majority_class).mean()
    results['majority_class'] = acc_majority
    print(f"Majority class ({majority_class}):       {acc_majority:.1%}")

    return results


def train_model(X: pd.DataFrame, y: pd.Series, df_settled: pd.DataFrame, output_dir: Path):
    """Train XGBoost model with walk-forward split grouped by ticker.

    CRITICAL: Uses walk-forward validation to prevent data leakage:
    - Tickers are ordered by first observation time
    - First 80% of tickers (by time) used for training
    - Last 20% of tickers (by time) used for testing
    - NO ticker appears in both train and test sets
    """
    from sklearn.model_selection import cross_val_score, GroupKFold
    from sklearn.metrics import (
        accuracy_score, precision_score, recall_score, f1_score,
        roc_auc_score, classification_report, confusion_matrix
    )

    try:
        import xgboost as xgb
        use_xgb = True
    except ImportError:
        from sklearn.ensemble import GradientBoostingClassifier
        use_xgb = False
        print("XGBoost not found, using sklearn GradientBoosting")

    # =========================================================================
    # WALK-FORWARD SPLIT BY TICKER (prevents data leakage)
    # =========================================================================
    print("\n" + "="*50)
    print("WALK-FORWARD SPLIT (Ticker-Grouped)")
    print("="*50)

    # Get ticker info - align indices
    tickers = df_settled.loc[X.index, 'ticker']

    # Parse log_time for ordering (handle both string and datetime)
    if 'log_time' in df_settled.columns:
        time_col = 'log_time'
    elif 'timestamp' in df_settled.columns:
        time_col = 'timestamp'
    else:
        raise ValueError("No timestamp column found (log_time or timestamp)")

    # Group by ticker - get first timestamp per ticker for ordering
    ticker_first_seen = df_settled.groupby('ticker')[time_col].min().sort_values()

    # Walk-forward: train on first 80% of tickers (by time), test on last 20%
    n_train_tickers = int(len(ticker_first_seen) * 0.8)
    train_tickers = set(ticker_first_seen.index[:n_train_tickers])
    test_tickers = set(ticker_first_seen.index[n_train_tickers:])

    train_mask = tickers.isin(train_tickers)
    test_mask = tickers.isin(test_tickers)

    X_train, X_test = X[train_mask], X[test_mask]
    y_train, y_test = y[train_mask], y[test_mask]

    # Get df_test for baseline comparisons
    df_test = df_settled.loc[X_test.index]

    print(f"Train tickers: {len(train_tickers)} (first 80% by time)")
    print(f"Test tickers:  {len(test_tickers)} (last 20% by time)")
    print(f"Train samples: {len(X_train)}")
    print(f"Test samples:  {len(X_test)}")
    print(f"Train class balance: {y_train.mean():.1%} positive")
    print(f"Test class balance:  {y_test.mean():.1%} positive")

    # Verify no ticker overlap (sanity check)
    overlap = train_tickers & test_tickers
    if overlap:
        raise ValueError(f"Data leakage! {len(overlap)} tickers in both train and test: {list(overlap)[:5]}")
    print("Verified: NO ticker overlap between train/test")
    
    # Model
    if use_xgb:
        model = xgb.XGBClassifier(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=3,
            reg_alpha=0.1,
            reg_lambda=1.0,
            random_state=42,
            eval_metric='logloss'
        )
    else:
        model = GradientBoostingClassifier(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            min_samples_leaf=10,
            random_state=42
        )

    # Cross-validation with GroupKFold (groups by ticker to prevent leakage)
    print("\nCross-validation (5-fold, grouped by ticker)...")
    train_tickers_series = tickers[train_mask]
    group_kfold = GroupKFold(n_splits=5)
    cv_scores = cross_val_score(
        model, X_train, y_train,
        cv=group_kfold,
        groups=train_tickers_series,
        scoring='roc_auc'
    )
    print(f"CV AUC: {cv_scores.mean():.3f} (+/- {cv_scores.std()*2:.3f})")
    
    # Fit on full training set
    model.fit(X_train, y_train)
    
    # Predictions
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    
    # Metrics
    print("\n" + "="*50)
    print("TEST SET PERFORMANCE")
    print("="*50)
    print(f"Accuracy:  {accuracy_score(y_test, y_pred):.3f}")
    print(f"Precision: {precision_score(y_test, y_pred):.3f}")
    print(f"Recall:    {recall_score(y_test, y_pred):.3f}")
    print(f"F1 Score:  {f1_score(y_test, y_pred):.3f}")
    print(f"ROC AUC:   {roc_auc_score(y_test, y_prob):.3f}")
    
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=['Below Strike', 'Above Strike']))
    
    print("Confusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(f"  TN={cm[0,0]:4d}  FP={cm[0,1]:4d}")
    print(f"  FN={cm[1,0]:4d}  TP={cm[1,1]:4d}")

    # BASELINE COMPARISON - critical for honest evaluation
    baseline_results = compute_baselines(df_test, y_test)

    # Calculate edge over best baseline
    best_baseline = max(baseline_results.values()) if baseline_results else 0.5
    model_accuracy = accuracy_score(y_test, y_pred)
    edge_over_baseline = (model_accuracy - best_baseline) * 100

    print(f"\n>>> MODEL EDGE: {edge_over_baseline:+.1f} pp over best baseline ({best_baseline:.1%})")
    if edge_over_baseline < 2.0:
        print(">>> WARNING: Model edge < 2pp - may not be tradeable after fees")
    elif edge_over_baseline < 5.0:
        print(">>> CAUTION: Model edge is marginal - careful position sizing needed")
    else:
        print(">>> Model shows meaningful edge - proceed with live testing")

    # Feature importance
    print("\nFeature Importance (top 15):")
    if use_xgb:
        importance = pd.DataFrame({
            'feature': X.columns,
            'importance': model.feature_importances_
        }).sort_values('importance', ascending=False)
    else:
        importance = pd.DataFrame({
            'feature': X.columns,
            'importance': model.feature_importances_
        }).sort_values('importance', ascending=False)
    
    for _, row in importance.head(15).iterrows():
        bar = '█' * int(row['importance'] * 50)
        print(f"  {row['feature']:25s} {row['importance']:.3f} {bar}")
    
    # Save model
    output_dir.mkdir(parents=True, exist_ok=True)
    
    model_path = output_dir / 'kalshi_model.pkl'
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
    print(f"\nModel saved: {model_path}")
    
    # Save feature list
    features_path = output_dir / 'feature_cols.json'
    with open(features_path, 'w') as f:
        json.dump(list(X.columns), f, indent=2)
    print(f"Features saved: {features_path}")
    
    # Save metrics
    metrics = {
        'cv_auc_mean': float(cv_scores.mean()),
        'cv_auc_std': float(cv_scores.std()),
        'test_accuracy': float(accuracy_score(y_test, y_pred)),
        'test_precision': float(precision_score(y_test, y_pred)),
        'test_recall': float(recall_score(y_test, y_pred)),
        'test_f1': float(f1_score(y_test, y_pred)),
        'test_auc': float(roc_auc_score(y_test, y_prob)),
        'train_samples': len(X_train),
        'test_samples': len(X_test),
        'train_tickers': len(train_tickers),
        'test_tickers': len(test_tickers),
        'positive_rate_train': float(y_train.mean()),
        'positive_rate_test': float(y_test.mean()),
        'baselines': {k: float(v) for k, v in baseline_results.items()},
        'best_baseline': float(best_baseline),
        'edge_over_baseline_pp': float(edge_over_baseline),
        'split_method': 'walk_forward_by_ticker',
        'trained_at': datetime.now().isoformat()
    }
    
    metrics_path = output_dir / 'metrics.json'
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f, indent=2)
    print(f"Metrics saved: {metrics_path}")
    
    return model, importance

# ============================================================================
# EDGE ANALYSIS
# ============================================================================

def analyze_edge(df: pd.DataFrame, model, feature_cols: list):
    """Analyze model edge vs baseline"""
    df_settled = df[df['label'].notna()].copy()
    df_settled = engineer_features(df_settled)
    
    # Model predictions
    X = df_settled[feature_cols].fillna(0).replace([np.inf, -np.inf], 0)
    df_settled['model_prob'] = model.predict_proba(X)[:, 1]
    df_settled['model_pred'] = (df_settled['model_prob'] > 0.5).astype(int)
    
    print("\n" + "="*50)
    print("EDGE ANALYSIS")
    print("="*50)
    
    # Baseline: just use market price as probability
    baseline_pred = (df_settled['yes_price'] > 0.5).astype(int)
    baseline_correct = (baseline_pred == df_settled['label']).mean()
    
    model_correct = (df_settled['model_pred'] == df_settled['label']).mean()
    
    print(f"Baseline accuracy (market price):  {baseline_correct:.1%}")
    print(f"Model accuracy:                    {model_correct:.1%}")
    print(f"Edge over baseline:                {(model_correct - baseline_correct)*100:+.1f}pp")
    
    # Calibration by confidence
    print("\nCalibration by model confidence:")
    df_settled['confidence_bin'] = pd.cut(df_settled['model_prob'], bins=[0, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0])
    calib = df_settled.groupby('confidence_bin').agg({
        'label': ['mean', 'count'],
        'model_prob': 'mean'
    }).round(3)
    print(calib)
    
    # Expected value analysis
    print("\nExpected Value Analysis (per $1 bet):")
    for threshold in [0.55, 0.60, 0.65, 0.70]:
        high_conf = df_settled[df_settled['model_prob'] > threshold]
        if len(high_conf) > 10:
            win_rate = high_conf['label'].mean()
            # Simplified EV assuming we buy at yes_price
            avg_price = high_conf['yes_price'].mean()
            ev = win_rate * (1 - avg_price) - (1 - win_rate) * avg_price
            print(f"  P(model) > {threshold:.0%}: n={len(high_conf):4d}, win={win_rate:.1%}, EV=${ev:.3f}")

# ============================================================================
# CLI
# ============================================================================

def load_jsonl(path: Path) -> pd.DataFrame:
    """Load JSONL file to dataframe"""
    records = []
    with open(path, 'r') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    
    if not records:
        raise ValueError(f"No valid records found in {path}")
    
    df = pd.DataFrame(records)
    print(f"Loaded {len(df)} records from {path}")
    return df

async def run_backfill(data_path: Path, output_path: Optional[Path] = None):
    """Backfill outcomes for all tickers in data"""
    df = load_jsonl(data_path)
    
    async with OutcomeFetcher() as fetcher:
        df = await fetcher.backfill_outcomes(df)
    
    # Save with outcomes
    if output_path is None:
        output_path = data_path.with_suffix('.labeled.jsonl')
    
    with open(output_path, 'w') as f:
        for _, row in df.iterrows():
            f.write(json.dumps(row.to_dict()) + '\n')
    
    print(f"Saved labeled data: {output_path}")
    return df

def run_train(data_path: Path, output_dir: Path, purge_mins: int = 5, min_samples_per_ticker: int = 3):
    """Train model on labeled data with proper walk-forward validation"""
    df = load_jsonl(data_path)

    # Check if already has labels
    if 'label' not in df.columns:
        raise ValueError("Data not labeled! Run 'backfill' first.")

    print("\n" + "="*50)
    print("DATA PREPARATION")
    print("="*50)

    X, y, df_settled = prepare_training_data(
        df,
        purge_mins=purge_mins,
        min_samples_per_ticker=min_samples_per_ticker
    )
    model, importance = train_model(X, y, df_settled, output_dir)

    # Edge analysis on full settled data (informational only)
    analyze_edge(df, model, list(X.columns))

    return model

async def run_all(data_path: Path, output_dir: Path, purge_mins: int = 5, min_samples_per_ticker: int = 3):
    """Backfill + train in one shot"""
    df = await run_backfill(data_path)

    labeled_path = data_path.with_suffix('.labeled.jsonl')
    run_train(labeled_path, output_dir, purge_mins=purge_mins, min_samples_per_ticker=min_samples_per_ticker)

def main():
    parser = argparse.ArgumentParser(description="Kalshi Model Training Pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # Backfill command
    bf_parser = subparsers.add_parser("backfill", help="Fetch outcomes for expired markets")
    bf_parser.add_argument("--data", type=Path, required=True, help="Input JSONL file")
    bf_parser.add_argument("--output", type=Path, help="Output file (default: input.labeled.jsonl)")
    
    # Train command
    tr_parser = subparsers.add_parser("train", help="Train model on labeled data")
    tr_parser.add_argument("--data", type=Path, required=True, help="Labeled JSONL file")
    tr_parser.add_argument("--output-dir", type=Path, default=Path("./kalshi_model"),
                          help="Output directory for model")
    tr_parser.add_argument("--purge-mins", type=int, default=5,
                          help="Exclude samples within N minutes of expiry (prevents late-market leakage, default: 5)")
    tr_parser.add_argument("--min-samples-per-ticker", type=int, default=3,
                          help="Require minimum samples per ticker (default: 3)")

    # All-in-one command
    all_parser = subparsers.add_parser("all", help="Backfill + train")
    all_parser.add_argument("--data", type=Path, required=True, help="Input JSONL file")
    all_parser.add_argument("--output-dir", type=Path, default=Path("./kalshi_model"),
                           help="Output directory for model")
    all_parser.add_argument("--purge-mins", type=int, default=5,
                          help="Exclude samples within N minutes of expiry (default: 5)")
    all_parser.add_argument("--min-samples-per-ticker", type=int, default=3,
                          help="Require minimum samples per ticker (default: 3)")
    
    # Stats command
    st_parser = subparsers.add_parser("stats", help="Show data statistics")
    st_parser.add_argument("--data", type=Path, required=True, help="JSONL file")
    
    args = parser.parse_args()
    
    if args.command == "backfill":
        asyncio.run(run_backfill(args.data, args.output))
    
    elif args.command == "train":
        run_train(
            args.data,
            args.output_dir,
            purge_mins=args.purge_mins,
            min_samples_per_ticker=args.min_samples_per_ticker
        )

    elif args.command == "all":
        asyncio.run(run_all(
            args.data,
            args.output_dir,
            purge_mins=args.purge_mins,
            min_samples_per_ticker=args.min_samples_per_ticker
        ))
    
    elif args.command == "stats":
        df = load_jsonl(args.data)
        print(f"\nDataset Statistics:")
        print(f"  Records: {len(df)}")
        print(f"  Unique tickers: {df['ticker'].nunique()}")
        print(f"  Assets: {df['asset'].value_counts().to_dict()}")
        print(f"  Date range: {df['timestamp'].min()} to {df['timestamp'].max()}")
        if 'label' in df.columns:
            labeled = df['label'].notna().sum()
            print(f"  Labeled: {labeled} ({labeled/len(df)*100:.1f}%)")
            print(f"  Positive rate: {df['label'].mean():.1%}")
        print(f"\nFeature summary:")
        for col in ['spot_price', 'yes_price', 'edge', 'vol_annual', 'mins_to_expiry']:
            if col in df.columns:
                print(f"  {col}: mean={df[col].mean():.4f}, std={df[col].std():.4f}")

if __name__ == "__main__":
    main()
