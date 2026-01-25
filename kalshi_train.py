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

from sklearn.metrics import log_loss, brier_score_loss

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

    print("\n  METRIC        |  MARKET    |  MODEL     |  DELTA")
    print("  " + "-" * 50)
    print(f"  Log Loss      |  {market_logloss:.4f}    |  {model_logloss:.4f}    |  {logloss_delta:+.4f}")
    print(f"  Brier Score   |  {market_brier:.4f}    |  {model_brier:.4f}    |  {brier_delta:+.4f}")

    # Interpretation
    print("\nInterpretation:")
    if logloss_delta < -0.01:
        print("  Model BEATS market on log loss (negative delta = better)")
    elif logloss_delta > 0.01:
        print("  Model LOSES to market on log loss")
    else:
        print("  Model roughly EQUAL to market on log loss")

    return {
        'model_logloss': model_logloss,
        'market_logloss': market_logloss,
        'logloss_delta': logloss_delta,
        'model_brier': model_brier,
        'market_brier': market_brier,
        'brier_delta': brier_delta
    }


def compute_calibration_ece(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10):
    """Compute Expected Calibration Error (ECE) and calibration curve.

    ECE = sum(|accuracy_bin - confidence_bin| * n_bin / n_total)

    Returns:
        ece: Expected Calibration Error (lower is better, 0 = perfectly calibrated)
        calibration: dict with bin details
    """
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    bin_lowers = bin_boundaries[:-1]
    bin_uppers = bin_boundaries[1:]

    ece = 0.0
    calibration = []

    for bin_lower, bin_upper in zip(bin_lowers, bin_uppers):
        in_bin = (y_prob >= bin_lower) & (y_prob < bin_upper)
        prop_in_bin = in_bin.mean()

        if prop_in_bin > 0:
            avg_confidence = y_prob[in_bin].mean()
            avg_accuracy = y_true[in_bin].mean()
            ece += np.abs(avg_accuracy - avg_confidence) * prop_in_bin
            calibration.append({
                'bin': f"{bin_lower:.1f}-{bin_upper:.1f}",
                'count': int(in_bin.sum()),
                'avg_confidence': float(avg_confidence),
                'avg_accuracy': float(avg_accuracy),
                'gap': float(avg_accuracy - avg_confidence)
            })

    return ece, calibration


def compute_slippage(row: pd.Series) -> float:
    """Compute slippage based on liquidity conditions.

    Model: extra_cost = 0.5*spread + 0.02*|imbalance|*spread

    - Base slippage: pay ~half the spread on average
    - Imbalance penalty: tied to spread regime (wide markets punish imbalance more)
    - Uses abs(imbalance) so negative imbalance doesn't reduce cost

    Args:
        row: DataFrame row with spread and orderbook_imbalance

    Returns:
        Extra cost in probability units (e.g., 0.01 = 1%)
    """
    # Get spread (Kalshi spreads typically 0.01-0.10 in probability units)
    spread = row.get('spread', 0.05)

    # Use MAGNITUDE of imbalance (both directions increase cost)
    imbalance = abs(row.get('orderbook_imbalance', 0))

    # Base slippage from spread (wider spread = worse fills)
    base_slippage = spread * 0.5

    # Imbalance penalty tied to spread regime
    # In wide markets, extreme imbalance hurts more
    imbalance_penalty = 0.02 * imbalance * spread

    return base_slippage + imbalance_penalty


def simulate_trades(df_test: pd.DataFrame, y_test: pd.Series, y_prob: np.ndarray,
                    thresholds: list[float] = None,
                    latency_penalty: float = 0.005,
                    enable_slippage: bool = True):
    """Simulate trading with different edge thresholds.

    Trade only when |model_prob - market_prob| > threshold.
    Account for:
    - Spread costs (ask for buys, 1-bid for sells)
    - Latency penalty (price moves against you during execution)
    - Slippage (depth-dependent execution costs)

    Args:
        df_test: Test dataframe with yes_ask, yes_bid columns
        y_test: True outcomes
        y_prob: Model predicted probabilities
        thresholds: Edge thresholds to test
        latency_penalty: Fixed penalty for execution delay (default 0.5%)
        enable_slippage: Whether to apply depth-based slippage
    """
    if thresholds is None:
        thresholds = [0.02, 0.05, 0.08, 0.10, 0.15, 0.20]

    print("\n" + "=" * 60)
    print("TRADE SIMULATION (spread + latency + slippage)")
    print("=" * 60)
    print(f"  Latency penalty: {latency_penalty*100:.1f}%")
    print(f"  Slippage model: {'enabled' if enable_slippage else 'disabled'}")

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
                'threshold': thresh, 'n_trades': 0, 'win_rate': None,
                'avg_pnl': None, 'total_pnl': None, 'selective_logloss': None
            })
            continue

        # Calculate PnL with all costs
        pnl = []
        y_test_values = y_test.values if isinstance(y_test, pd.Series) else y_test

        for i in range(len(df_test)):
            if not tradeable[i]:
                continue

            row = df_test.iloc[i]
            outcome = y_test_values[i]

            # Compute slippage for this trade
            slippage = compute_slippage(row) if enable_slippage else 0.0

            if buy_yes[i]:
                # Buy YES: pay the ask + latency + slippage
                entry_price = row['yes_ask'] + latency_penalty + slippage
                entry_price = min(entry_price, 0.99)  # Cap at 99%
                profit = outcome - entry_price
                pnl.append(profit)
            elif buy_no[i]:
                # Buy NO: pay (1 - yes_bid) + latency + slippage
                entry_price = (1 - row['yes_bid']) + latency_penalty + slippage
                entry_price = min(entry_price, 0.99)  # Cap at 99%
                profit = (1 - outcome) - entry_price
                pnl.append(profit)

        # Selective log loss on traded subset
        traded_y = y_test_values[tradeable]
        traded_prob = y_prob[tradeable]
        selective_logloss = log_loss(traded_y, np.clip(traded_prob, 1e-7, 1-1e-7)) if len(traded_y) > 0 else None

        results.append({
            'threshold': thresh,
            'n_trades': n_trades,
            'win_rate': np.mean([p > 0 for p in pnl]) if pnl else None,
            'avg_pnl': np.mean(pnl) if pnl else None,
            'total_pnl': np.sum(pnl) if pnl else None,
            'selective_logloss': selective_logloss
        })

    # Print results
    print("\n  Threshold | N Trades | Win Rate | Avg PnL  | Total PnL")
    print("  " + "-" * 55)
    for r in results:
        wr = f"{r['win_rate']*100:.1f}%" if r['win_rate'] is not None else "   -"
        avg = f"${r['avg_pnl']:+.3f}" if r['avg_pnl'] is not None else "    -"
        tot = f"${r['total_pnl']:+.2f}" if r['total_pnl'] is not None else "    -"
        print(f"    {r['threshold']:.2f}    |  {r['n_trades']:>5}   |  {wr:>6}  | {avg:>7} | {tot:>8}")

    # Summary
    profitable = [r for r in results if r['total_pnl'] is not None and r['total_pnl'] > 0]
    if profitable:
        best = max(profitable, key=lambda x: x['total_pnl'])
        print(f"\n  Best threshold: {best['threshold']:.2f} with ${best['total_pnl']:.2f} total PnL")
    else:
        print("\n  WARNING: No profitable threshold found after costs")

    return results


def evaluate_by_horizon(df_test: pd.DataFrame, y_test: pd.Series, y_prob: np.ndarray):
    """Evaluate model separately for each horizon (T-60, T-30, T-15).

    Reports: Log Loss delta, ECE, and PnL per horizon.
    """

    if 'horizon' not in df_test.columns:
        print("\n  (No horizon field - skipping horizon analysis)")
        return {}

    print("\n" + "=" * 60)
    print("HORIZON-STRATIFIED EVALUATION")
    print("=" * 60)

    horizons = df_test['horizon'].dropna().unique()
    if len(horizons) == 0:
        return {}

    results = {}
    y_test_values = y_test.values if isinstance(y_test, pd.Series) else y_test

    # Header
    print("\n  Horizon  | Samples | LogL Delta |   ECE   | PnL@0.05 | Winner")
    print("  " + "-" * 65)

    for horizon in sorted(horizons):
        mask = (df_test['horizon'] == horizon).values
        if mask.sum() < 10:
            continue

        h_y = y_test_values[mask]
        h_prob = y_prob[mask]
        h_df = df_test[mask].copy()
        h_market = h_df['yes_price'].values

        eps = 1e-7

        # Log Loss
        h_model_ll = log_loss(h_y, np.clip(h_prob, eps, 1-eps))
        h_market_ll = log_loss(h_y, np.clip(h_market, eps, 1-eps))
        delta = h_model_ll - h_market_ll

        # ECE
        h_ece, _ = compute_calibration_ece(h_y, h_prob)

        # PnL at threshold 0.05
        edge = h_prob - h_market
        buy_yes = edge > 0.05
        buy_no = edge < -0.05
        tradeable = buy_yes | buy_no

        pnl_sum = 0.0
        n_trades = 0
        for i in range(len(h_df)):
            if not tradeable[i]:
                continue
            row = h_df.iloc[i]
            outcome = h_y[i]
            slippage = compute_slippage(row)
            if buy_yes[i]:
                entry = row['yes_ask'] + 0.005 + slippage
                pnl_sum += outcome - min(entry, 0.99)
            elif buy_no[i]:
                entry = (1 - row['yes_bid']) + 0.005 + slippage
                pnl_sum += (1 - outcome) - min(entry, 0.99)
            n_trades += 1

        # Determine winner
        if delta < -0.01:
            winner = "MODEL"
        elif delta > 0.01:
            winner = "MARKET"
        else:
            winner = "tie"

        results[horizon] = {
            'n_samples': int(mask.sum()),
            'model_logloss': float(h_model_ll),
            'market_logloss': float(h_market_ll),
            'delta': float(delta),
            'ece': float(h_ece),
            'pnl_at_005': float(pnl_sum),
            'n_trades_at_005': n_trades,
            'winner': winner
        }

        pnl_str = f"${pnl_sum:+.2f}" if n_trades > 0 else "   -"
        print(f"  {horizon:<8} |  {mask.sum():>5}  |  {delta:+.4f}   | {h_ece:.4f} | {pnl_str:>8} | {winner}")

    # Summary
    print("\n  Interpretation:")
    losers = [h for h, r in results.items() if r['winner'] == 'MARKET']
    winners = [h for h, r in results.items() if r['winner'] == 'MODEL']
    if losers:
        print(f"    Model LOSES to market on: {', '.join(losers)}")
    if winners:
        print(f"    Model BEATS market on: {', '.join(winners)}")
    if not losers and not winners:
        print(f"    Model roughly tied with market on all horizons")

    # Per-horizon threshold optimization with full policy metrics
    print("\n" + "=" * 60)
    print("PER-HORIZON THRESHOLD POLICY")
    print("=" * 60)
    print("\n  (Best threshold with robustness metrics)")

    thresholds = [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15]

    for horizon in sorted(horizons):
        mask = (df_test['horizon'] == horizon).values
        if mask.sum() < 20:
            continue

        h_y = y_test_values[mask]
        h_prob = y_prob[mask]
        h_df = df_test[mask].copy()
        h_market = h_df['yes_price'].values

        best_thresh = None
        best_pnl = float('-inf')
        best_policy = None
        thresh_results = []

        for thresh in thresholds:
            edge = h_prob - h_market
            buy_yes = edge > thresh
            buy_no = edge < -thresh
            tradeable = buy_yes | buy_no

            trade_pnls = []  # Individual trade PnLs for drawdown
            trade_edges = []  # Pre-cost edge for each trade

            for i in range(len(h_df)):
                if not tradeable[i]:
                    continue
                row = h_df.iloc[i]
                outcome = h_y[i]
                slippage = compute_slippage(row)

                if buy_yes[i]:
                    entry = row['yes_ask'] + 0.005 + slippage
                    pnl = outcome - min(entry, 0.99)
                    pre_cost_edge = h_prob[i] - row['yes_ask']  # Model prob - market ask
                elif buy_no[i]:
                    entry = (1 - row['yes_bid']) + 0.005 + slippage
                    pnl = (1 - outcome) - min(entry, 0.99)
                    pre_cost_edge = (1 - h_prob[i]) - (1 - row['yes_bid'])  # Model NO prob - market NO price

                trade_pnls.append(pnl)
                trade_edges.append(pre_cost_edge)

            n_trades = len(trade_pnls)
            pnl_sum = sum(trade_pnls)

            # Compute metrics
            avg_edge = np.mean(trade_edges) if trade_edges else 0.0
            avg_pnl = np.mean(trade_pnls) if trade_pnls else 0.0

            # Max drawdown (cumulative PnL low point)
            max_dd = 0.0
            if trade_pnls:
                cumsum = np.cumsum(trade_pnls)
                running_max = np.maximum.accumulate(cumsum)
                drawdowns = running_max - cumsum
                max_dd = np.max(drawdowns) if len(drawdowns) > 0 else 0.0

            # Risk-adjusted score: TotalPnL / (MaxDD + epsilon)
            # This avoids "one lucky run" thresholds
            epsilon = 0.10  # Minimum DD floor to prevent division issues
            risk_adj_score = pnl_sum / (max_dd + epsilon) if pnl_sum > 0 else 0.0

            # Alternative: AvgPnL * sqrt(Trades) with DD cap
            # Rewards consistent small wins over lucky big ones
            consistency_score = avg_pnl * np.sqrt(n_trades) if n_trades > 0 else 0.0

            policy = {
                'thresh': thresh,
                'n_trades': n_trades,
                'total_pnl': pnl_sum,
                'avg_pnl': avg_pnl,
                'avg_edge': avg_edge,
                'max_drawdown': max_dd,
                'win_rate': np.mean([p > 0 for p in trade_pnls]) if trade_pnls else 0.0,
                'risk_adj_score': risk_adj_score,
                'consistency_score': consistency_score
            }

            # Select by risk-adjusted score, not just total PnL
            # Require: min 5 trades, positive PnL, DD < 80% of PnL
            dd_ok = max_dd < pnl_sum * 0.8 if pnl_sum > 0 else True
            if n_trades >= 5 and pnl_sum > 0 and dd_ok and risk_adj_score > best_pnl:
                best_pnl = risk_adj_score  # Now tracking best risk-adjusted score
                best_thresh = thresh
                best_policy = policy

            thresh_results.append(policy)

        # Print grid for this horizon
        print(f"\n  {horizon}:")
        print(f"    Thresh | Trades | Avg Edge | Avg PnL  | Max DD  | Total PnL | Risk Adj")
        print(f"    " + "-" * 72)
        for p in thresh_results:
            marker = " <<<" if p['thresh'] == best_thresh else ""
            if p['n_trades'] > 0:
                print(f"     {p['thresh']:.2f}  |  {p['n_trades']:>4}  |  {p['avg_edge']:>+.3f}  | "
                      f"${p['avg_pnl']:>+.3f} | ${p['max_drawdown']:>.2f} | ${p['total_pnl']:>+.2f}  | "
                      f"{p['risk_adj_score']:>.2f}{marker}")
            else:
                print(f"     {p['thresh']:.2f}  |     0  |     -    |     -    |    -    |     -     |    -")

        # Print policy summary
        if best_policy:
            print(f"\n    BEST POLICY (by risk-adjusted score): threshold={best_thresh:.2f}")
            print(f"      Trades:        {best_policy['n_trades']}")
            print(f"      Win rate:      {best_policy['win_rate']*100:.1f}%")
            print(f"      Avg edge:      {best_policy['avg_edge']*100:.2f}% per trade")
            print(f"      Avg PnL:       ${best_policy['avg_pnl']:.3f} per trade")
            print(f"      Max DD:        ${best_policy['max_drawdown']:.2f}")
            print(f"      Total PnL:     ${best_policy['total_pnl']:.2f}")
            print(f"      Risk-adj:      {best_policy['risk_adj_score']:.2f} (PnL/DD)")
            print(f"      Consistency:   {best_policy['consistency_score']:.2f} (AvgPnL*sqrt(N))")

            # Robustness warning
            if best_policy['n_trades'] < 10:
                print(f"      WARNING: Only {best_policy['n_trades']} trades - may be lucky variance")
            if best_policy['max_drawdown'] > best_policy['total_pnl'] * 0.5:
                print(f"      WARNING: Max DD is >{50}% of total PnL - fragile")

            results[horizon]['best_threshold'] = best_thresh
            results[horizon]['best_pnl'] = best_pnl
            results[horizon]['policy'] = best_policy

    return results


def train_per_horizon(df: pd.DataFrame, output_dir: Path, target_horizon: str = None,
                      max_offset_sec: float = None):
    """Train separate models per horizon, or filter by offset.

    Args:
        df: Labeled dataframe with horizon field
        output_dir: Where to save models
        target_horizon: If specified, train only on this horizon (e.g., "T-60")
        max_offset_sec: If specified, filter to samples with offset <= this value
    """
    print("\n" + "=" * 60)
    print("PER-HORIZON TRAINING")
    print("=" * 60)

    if 'horizon' not in df.columns:
        print("  No horizon field - cannot do per-horizon training")
        return {}

    if 'label' not in df.columns:
        print("  No labels - run backfill first")
        return {}

    # Filter by target horizon if specified
    if target_horizon:
        df = df[df['horizon'] == target_horizon].copy()
        print(f"  Filtered to {target_horizon}: {len(df)} samples")

    # Filter by offset if specified (requires sample_ts_utc and target_ts_utc)
    if max_offset_sec and 'sample_ts_utc' in df.columns and 'target_ts_utc' in df.columns:
        df['_sample_ts'] = pd.to_datetime(df['sample_ts_utc'])
        df['_target_ts'] = pd.to_datetime(df['target_ts_utc'])
        df['_offset_sec'] = (df['_sample_ts'] - df['_target_ts']).dt.total_seconds()
        before = len(df)
        df = df[df['_offset_sec'] <= max_offset_sec].copy()
        print(f"  Filtered to offset <= {max_offset_sec}s: {len(df)} samples (removed {before - len(df)})")
        df.drop(columns=['_sample_ts', '_target_ts', '_offset_sec'], inplace=True, errors='ignore')

    if len(df) < 50:
        print(f"  Not enough samples ({len(df)}) for training")
        return {}

    # Use existing training pipeline
    X, y, df_settled = prepare_training_data(df, purge_mins=5, min_samples_per_ticker=2)
    model, importance = train_model(X, y, df_settled, output_dir)

    return {'model': model, 'importance': importance}


def walk_forward_eval(df: pd.DataFrame, train_pct: float = 0.7) -> dict:
    """Walk-forward evaluation: train on first N% of time, eval on rest.

    This is the "is it real?" test - simulates actual deployment.

    Args:
        df: Labeled dataframe with timestamp field
        train_pct: Fraction of time to use for training (default 70%)

    Returns:
        Dict with train/eval metrics per horizon
    """
    from sklearn.metrics import log_loss

    print("\n" + "=" * 70)
    print("WALK-FORWARD EVALUATION")
    print("=" * 70)
    print(f"\n  Train on first {train_pct*100:.0f}% of time, eval on last {(1-train_pct)*100:.0f}%")

    if 'label' not in df.columns:
        print("  ERROR: No labels")
        return {}

    # Parse timestamps and sort
    if 'timestamp' in df.columns:
        df['_ts'] = pd.to_datetime(df['timestamp'])
    elif 'sample_ts_utc' in df.columns:
        df['_ts'] = pd.to_datetime(df['sample_ts_utc'])
    else:
        print("  ERROR: No timestamp field")
        return {}

    df = df.sort_values('_ts').copy()

    # Split by time
    split_idx = int(len(df) * train_pct)
    split_time = df.iloc[split_idx]['_ts']

    df_train = df.iloc[:split_idx].copy()
    df_eval = df.iloc[split_idx:].copy()

    print(f"\n  Train: {len(df_train)} samples (up to {split_time})")
    print(f"  Eval:  {len(df_eval)} samples (after {split_time})")

    results = {}
    eps = 1e-7

    # Per-horizon walk-forward
    horizons = df['horizon'].dropna().unique() if 'horizon' in df.columns else ['all']

    for horizon in sorted(horizons):
        if horizon == 'all':
            h_train = df_train
            h_eval = df_eval
        else:
            h_train = df_train[df_train['horizon'] == horizon]
            h_eval = df_eval[df_eval['horizon'] == horizon]

        if len(h_train) < 30 or len(h_eval) < 10:
            print(f"\n  {horizon}: Skipped (train={len(h_train)}, eval={len(h_eval)})")
            continue

        try:
            # Train on historical data
            X_train, y_train, df_train_settled = prepare_training_data(
                h_train, purge_mins=5, min_samples_per_ticker=1
            )

            # Build features for eval set
            X_eval, y_eval, df_eval_settled = prepare_training_data(
                h_eval, purge_mins=5, min_samples_per_ticker=1
            )

            if len(X_train) < 20 or len(X_eval) < 10:
                print(f"\n  {horizon}: Skipped after filtering")
                continue

            # Train model
            try:
                import xgboost as xgb
                model = xgb.XGBClassifier(
                    n_estimators=100,
                    max_depth=4,
                    learning_rate=0.1,
                    random_state=42,
                    use_label_encoder=False,
                    eval_metric='logloss'
                )
            except ImportError:
                from sklearn.ensemble import GradientBoostingClassifier
                model = GradientBoostingClassifier(n_estimators=100, max_depth=4)

            model.fit(X_train, y_train)

            # Eval predictions
            y_prob = model.predict_proba(X_eval)[:, 1]
            y_prob_clipped = np.clip(y_prob, eps, 1 - eps)
            market_prob = np.clip(df_eval_settled['yes_price'].values, eps, 1 - eps)

            model_ll = log_loss(y_eval, y_prob_clipped)
            market_ll = log_loss(y_eval, market_prob)
            delta = model_ll - market_ll

            results[horizon] = {
                'train_samples': len(X_train),
                'eval_samples': len(X_eval),
                'model_logloss': model_ll,
                'market_logloss': market_ll,
                'logloss_delta': delta,
                'beats_market': delta < 0
            }

            status = "BEATS MARKET" if delta < 0 else "LOSES TO MARKET"
            print(f"\n  {horizon}:")
            print(f"    Train: {len(X_train)} samples")
            print(f"    Eval:  {len(X_eval)} samples")
            print(f"    LogL delta: {delta:+.4f} ({status})")

        except Exception as e:
            print(f"\n  {horizon}: ERROR - {e}")
            results[horizon] = {'error': str(e)}

    # Summary
    print("\n" + "-" * 70)
    print("WALK-FORWARD SUMMARY")
    print("-" * 70)

    beats = [h for h, r in results.items() if r.get('beats_market')]
    loses = [h for h, r in results.items() if 'logloss_delta' in r and not r.get('beats_market')]

    if beats:
        print(f"  Beats market:  {', '.join(beats)}")
    if loses:
        print(f"  Loses market:  {', '.join(loses)}")

    if beats and not loses:
        print("\n  >>> WALK-FORWARD VALIDATED: Model generalizes across time <<<")
    elif beats:
        print("\n  >>> PARTIAL: Some horizons generalize, some don't <<<")
    else:
        print("\n  >>> WARNING: Model may not generalize - check for overfit <<<")

    return results


def save_policy_artifacts(output_dir: Path, best_threshold: float, policy: dict,
                          calibration: dict, feature_stats: dict):
    """Save policy artifacts alongside model for production use.

    Creates:
        - best_threshold.json: Chosen threshold with risk metrics
        - calibration.json: ECE and bin-wise calibration curve
        - feature_stats.json: Feature means/stds for normalization
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Best threshold
    thresh_artifact = {
        'threshold': best_threshold,
        'selection_method': 'risk_adjusted_score',
        'policy': policy
    }
    with open(output_dir / 'best_threshold.json', 'w') as f:
        json.dump(thresh_artifact, f, indent=2)

    # Calibration
    with open(output_dir / 'calibration.json', 'w') as f:
        json.dump(calibration, f, indent=2)

    # Feature stats
    with open(output_dir / 'feature_stats.json', 'w') as f:
        json.dump(feature_stats, f, indent=2)

    print(f"  Policy artifacts saved to {output_dir}/")


def train_separate_horizon_models(df: pd.DataFrame, output_dir: Path,
                                   horizons: list[str] = None,
                                   compare_to_pooled: bool = True,
                                   run_walk_forward: bool = True):
    """Train 3 separate models, one per horizon.

    This often improves T-60 stability because it stops the model from learning
    short-horizon microstructure patterns that don't generalize to 60m.

    Args:
        df: Labeled dataframe with horizon field
        output_dir: Base output directory (models saved to output_dir/<horizon>/)
        horizons: Which horizons to train (default: T-15, T-30, T-60)
        compare_to_pooled: If True, also train a pooled model for comparison
        run_walk_forward: If True, run walk-forward validation after training

    Returns:
        Dict with per-horizon results and comparison metrics
    """
    from sklearn.metrics import log_loss

    print("\n" + "=" * 70)
    print("SEPARATE HORIZON MODEL TRAINING")
    print("=" * 70)
    print("\nRationale: Separate models prevent short-horizon microstructure patterns")
    print("from contaminating long-horizon predictions (especially T-60).")

    if 'horizon' not in df.columns:
        print("\n  ERROR: No horizon field - cannot train per-horizon models")
        return {}

    if 'label' not in df.columns:
        print("\n  ERROR: No labels - run backfill first")
        return {}

    if horizons is None:
        horizons = ['T-15', 'T-30', 'T-60']

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    results = {}
    eps = 1e-7

    # =========================================================================
    # Train pooled model first (for comparison)
    # =========================================================================
    pooled_metrics = None
    if compare_to_pooled:
        print("\n" + "-" * 70)
        print("POOLED MODEL (baseline)")
        print("-" * 70)

        pooled_dir = output_dir / "pooled"
        pooled_dir.mkdir(exist_ok=True)

        try:
            X, y, df_settled = prepare_training_data(df, purge_mins=5, min_samples_per_ticker=2)
            model, importance = train_model(X, y, df_settled, pooled_dir)

            # Compute per-horizon metrics for pooled model
            pooled_metrics = {'per_horizon': {}}
            for horizon in horizons:
                h_mask = df_settled['horizon'] == horizon
                if h_mask.sum() < 10:
                    continue

                h_X = X[h_mask]
                h_y = y[h_mask]
                h_df = df_settled[h_mask]

                y_prob = model.predict_proba(h_X)[:, 1]
                y_prob_clipped = np.clip(y_prob, eps, 1 - eps)
                market_prob = np.clip(h_df['yes_price'].values, eps, 1 - eps)

                model_ll = log_loss(h_y, y_prob_clipped)
                market_ll = log_loss(h_y, market_prob)

                pooled_metrics['per_horizon'][horizon] = {
                    'n_samples': h_mask.sum(),
                    'model_logloss': model_ll,
                    'market_logloss': market_ll,
                    'logloss_delta': model_ll - market_ll
                }

            results['pooled'] = pooled_metrics
            print(f"\n  Pooled model saved to: {pooled_dir}")

        except Exception as e:
            print(f"\n  ERROR training pooled model: {e}")

    # =========================================================================
    # Train separate model per horizon
    # =========================================================================
    for horizon in horizons:
        print("\n" + "-" * 70)
        print(f"HORIZON: {horizon}")
        print("-" * 70)

        h_df = df[df['horizon'] == horizon].copy()
        n_samples = len(h_df)

        if n_samples < 50:
            print(f"  Skipping {horizon}: only {n_samples} samples (need 50+)")
            results[horizon] = {'skipped': True, 'reason': f'insufficient samples ({n_samples})'}
            continue

        # Create horizon-specific output directory
        h_dir = output_dir / horizon.replace('-', '_').lower()
        h_dir.mkdir(exist_ok=True)

        try:
            X, y, df_settled = prepare_training_data(h_df, purge_mins=5, min_samples_per_ticker=2)
            model, importance = train_model(X, y, df_settled, h_dir)

            # Compute metrics
            y_prob = model.predict_proba(X)[:, 1]
            y_prob_clipped = np.clip(y_prob, eps, 1 - eps)
            market_prob = np.clip(df_settled['yes_price'].values, eps, 1 - eps)

            model_ll = log_loss(y, y_prob_clipped)
            market_ll = log_loss(y, market_prob)

            # Compute calibration curve
            n_bins = 10
            bin_boundaries = np.linspace(0, 1, n_bins + 1)
            calibration_bins = []
            ece = 0.0
            for i in range(n_bins):
                mask = (y_prob >= bin_boundaries[i]) & (y_prob < bin_boundaries[i + 1])
                if mask.sum() > 0:
                    avg_conf = float(y_prob[mask].mean())
                    avg_acc = float(y.values[mask].mean())
                    ece += mask.sum() * abs(avg_conf - avg_acc)
                    calibration_bins.append({
                        'bin': i,
                        'lower': float(bin_boundaries[i]),
                        'upper': float(bin_boundaries[i + 1]),
                        'count': int(mask.sum()),
                        'avg_confidence': avg_conf,
                        'avg_accuracy': avg_acc,
                        'gap': avg_conf - avg_acc
                    })
            ece = ece / len(y)

            calibration = {
                'ece': float(ece),
                'n_bins': n_bins,
                'bins': calibration_bins
            }

            # Compute feature stats
            feature_stats = {
                'features': list(X.columns),
                'means': {col: float(X[col].mean()) for col in X.columns},
                'stds': {col: float(X[col].std()) for col in X.columns},
                'mins': {col: float(X[col].min()) for col in X.columns},
                'maxs': {col: float(X[col].max()) for col in X.columns}
            }

            # Find best threshold using risk-adjusted selection
            thresholds = [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15]
            best_thresh = None
            best_score = float('-inf')
            best_policy = None

            for thresh in thresholds:
                edge = y_prob - market_prob
                buy_yes = edge > thresh
                buy_no = edge < -thresh

                trade_pnls = []
                for i in range(len(df_settled)):
                    if not (buy_yes[i] or buy_no[i]):
                        continue
                    row = df_settled.iloc[i]
                    outcome = y.iloc[i]
                    spread = row.get('spread', 0.05)
                    imbalance = abs(row.get('orderbook_imbalance', 0))
                    slippage = spread * 0.5 + 0.02 * imbalance * spread

                    if buy_yes[i]:
                        entry = row['yes_ask'] + 0.005 + slippage
                        pnl = outcome - min(entry, 0.99)
                    else:
                        entry = (1 - row['yes_bid']) + 0.005 + slippage
                        pnl = (1 - outcome) - min(entry, 0.99)
                    trade_pnls.append(pnl)

                n_trades = len(trade_pnls)
                if n_trades < 5:
                    continue

                total_pnl = sum(trade_pnls)
                cumsum = np.cumsum(trade_pnls)
                max_dd = float(np.max(np.maximum.accumulate(cumsum) - cumsum))

                # Risk-adjusted score
                risk_adj = total_pnl / (max_dd + 0.10) if total_pnl > 0 else 0

                if total_pnl > 0 and max_dd < total_pnl * 0.8 and risk_adj > best_score:
                    best_score = risk_adj
                    best_thresh = thresh
                    best_policy = {
                        'threshold': float(thresh),
                        'n_trades': n_trades,
                        'total_pnl': float(total_pnl),
                        'avg_pnl': float(np.mean(trade_pnls)),
                        'max_drawdown': float(max_dd),
                        'win_rate': float(np.mean([p > 0 for p in trade_pnls])),
                        'risk_adj_score': float(risk_adj)
                    }

            # Save policy artifacts
            if best_policy:
                save_policy_artifacts(h_dir, best_thresh, best_policy, calibration, feature_stats)

            results[horizon] = {
                'n_samples': n_samples,
                'n_train': len(X),
                'model_logloss': float(model_ll),
                'market_logloss': float(market_ll),
                'logloss_delta': float(model_ll - market_ll),
                'ece': float(ece),
                'best_threshold': best_thresh,
                'policy': best_policy,
                'model_path': str(h_dir / 'model.joblib'),
                'importance': importance
            }

            print(f"\n  Model saved to: {h_dir}")
            print(f"  Samples: {n_samples} → {len(X)} after filtering")
            print(f"  LogL delta vs market: {model_ll - market_ll:+.4f}")
            print(f"  ECE: {ece:.4f}")
            if best_policy:
                print(f"  Best threshold: {best_thresh:.2f} (risk-adj: {best_policy['risk_adj_score']:.2f})")

        except Exception as e:
            print(f"\n  ERROR training {horizon} model: {e}")
            import traceback
            traceback.print_exc()
            results[horizon] = {'error': str(e)}

    # =========================================================================
    # Comparison summary
    # =========================================================================
    print("\n" + "=" * 70)
    print("COMPARISON: POOLED vs SEPARATE MODELS")
    print("=" * 70)

    print("\n  LogL Delta vs Market (negative = model beats market)")
    print("  " + "-" * 55)
    print(f"  {'Horizon':<10} {'Pooled':>12} {'Separate':>12} {'Improvement':>15}")
    print("  " + "-" * 55)

    for horizon in horizons:
        pooled_delta = None
        sep_delta = None

        if pooled_metrics and horizon in pooled_metrics.get('per_horizon', {}):
            pooled_delta = pooled_metrics['per_horizon'][horizon]['logloss_delta']

        if horizon in results and 'logloss_delta' in results[horizon]:
            sep_delta = results[horizon]['logloss_delta']

        if pooled_delta is not None and sep_delta is not None:
            improvement = pooled_delta - sep_delta  # positive = separate is better
            status = "^" if improvement > 0.005 else ("v" if improvement < -0.005 else "=")
            print(f"  {horizon:<10} {pooled_delta:>+12.4f} {sep_delta:>+12.4f} {improvement:>+12.4f} {status}")
        elif sep_delta is not None:
            print(f"  {horizon:<10} {'N/A':>12} {sep_delta:>+12.4f}")
        else:
            print(f"  {horizon:<10} {'N/A':>12} {'N/A':>12}")

    # Recommendations
    print("\n  Recommendations:")
    improved = []
    regressed = []
    for horizon in horizons:
        if pooled_metrics and horizon in pooled_metrics.get('per_horizon', {}) and horizon in results:
            if 'logloss_delta' in results[horizon]:
                pooled_d = pooled_metrics['per_horizon'][horizon]['logloss_delta']
                sep_d = results[horizon]['logloss_delta']
                if sep_d < pooled_d - 0.005:
                    improved.append(horizon)
                elif sep_d > pooled_d + 0.005:
                    regressed.append(horizon)

    if improved:
        print(f"    + Use separate model for: {', '.join(improved)}")
    if regressed:
        print(f"    - Keep pooled model for: {', '.join(regressed)}")
    if not improved and not regressed:
        print("    = No significant difference - either approach works")

    # =========================================================================
    # Walk-forward validation (the "is it real?" test)
    # =========================================================================
    if run_walk_forward:
        print("\n")
        wf_results = walk_forward_eval(df, train_pct=0.7)
        results['walk_forward'] = wf_results

    # Save summary
    summary_path = output_dir / "horizon_models_summary.json"
    with open(summary_path, 'w') as f:
        # Convert any non-serializable items
        summary = {k: v for k, v in results.items() if k != 'pooled'}
        if pooled_metrics:
            summary['pooled'] = pooled_metrics
        json.dump(summary, f, indent=2, default=str)
    print(f"\n  Summary saved to: {summary_path}")

    # Save production router config
    router_config = {
        'routing_logic': 'if horizon == "T-15": use t_15 elif horizon == "T-60": use t_60 else: use pooled',
        'models': {}
    }
    for horizon in horizons:
        if horizon in results and 'model_path' in results[horizon]:
            h_key = horizon.replace('-', '_').lower()
            router_config['models'][horizon] = {
                'path': results[horizon]['model_path'],
                'threshold': results[horizon].get('best_threshold'),
                'policy': results[horizon].get('policy')
            }
    if 'pooled' in results:
        router_config['models']['pooled'] = {
            'path': str(output_dir / 'pooled' / 'model.joblib')
        }

    router_path = output_dir / "router_config.json"
    with open(router_path, 'w') as f:
        json.dump(router_config, f, indent=2)
    print(f"  Router config saved to: {router_path}")

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

    # PRIMARY EVALUATION: probabilistic metrics vs market
    prob_metrics = compute_probabilistic_baselines(df_test, y_test, y_prob)

    # CALIBRATION: ECE and calibration curve
    y_test_values = y_test.values if isinstance(y_test, pd.Series) else y_test
    ece, calibration = compute_calibration_ece(y_test_values, y_prob)

    print("\n" + "=" * 60)
    print("CALIBRATION (Expected Calibration Error)")
    print("=" * 60)
    print(f"  ECE: {ece:.4f} (lower is better, 0 = perfect)")
    if ece > 0.10:
        print("  WARNING: ECE > 0.10 - model is poorly calibrated for threshold trading")
    elif ece > 0.05:
        print("  CAUTION: ECE > 0.05 - consider Platt scaling or isotonic calibration")
    else:
        print("  Model is reasonably well-calibrated")

    print("\n  Calibration curve (avg confidence vs avg accuracy):")
    print("  Bin         | Count | Confidence | Accuracy | Gap")
    print("  " + "-" * 55)
    for c in calibration:
        gap_str = f"{c['gap']:+.3f}"
        print(f"  {c['bin']:<10}  | {c['count']:>5} |   {c['avg_confidence']:.3f}    |  {c['avg_accuracy']:.3f}   | {gap_str}")

    # Trade simulation (with latency and slippage)
    trade_results = simulate_trades(df_test, y_test, y_prob)

    # Horizon-stratified analysis (if available)
    horizon_metrics = evaluate_by_horizon(df_test, y_test, y_prob)

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
        'model_logloss': float(prob_metrics['model_logloss']),
        'market_logloss': float(prob_metrics['market_logloss']),
        'logloss_delta': float(prob_metrics['logloss_delta']),
        'model_brier': float(prob_metrics['model_brier']),
        'market_brier': float(prob_metrics['market_brier']),
        'brier_delta': float(prob_metrics['brier_delta']),
        'ece': float(ece),
        'calibration': calibration,
        'trade_simulation': trade_results,
        'horizon_metrics': horizon_metrics,
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

    # Per-horizon training command
    hz_parser = subparsers.add_parser("horizon", help="Train per-horizon or with offset filter")
    hz_parser.add_argument("--data", type=Path, required=True, help="Labeled JSONL file")
    hz_parser.add_argument("--output-dir", type=Path, default=Path("./kalshi_model_horizon"),
                          help="Output directory for model")
    hz_parser.add_argument("--horizon", type=str, default=None,
                          help="Train only on specific horizon (e.g., T-60, T-30, T-15)")
    hz_parser.add_argument("--max-offset", type=float, default=None,
                          help="Filter to samples with offset <= N seconds (for bias testing)")
    hz_parser.add_argument("--compare-offsets", action="store_true",
                          help="Compare T-60 at different offset filters")

    # Separate horizon models command
    sep_parser = subparsers.add_parser("separate-models",
                                        help="Train 3 separate models (one per horizon)")
    sep_parser.add_argument("--data", type=Path, required=True, help="Labeled JSONL file")
    sep_parser.add_argument("--output-dir", type=Path, default=Path("./kalshi_horizon_models"),
                            help="Base output directory (models saved to <dir>/<horizon>/)")
    sep_parser.add_argument("--horizons", nargs="+", default=["T-15", "T-30", "T-60"],
                            help="Which horizons to train (default: T-15 T-30 T-60)")
    sep_parser.add_argument("--no-pooled", action="store_true",
                            help="Skip training pooled model for comparison")
    sep_parser.add_argument("--no-walk-forward", action="store_true",
                            help="Skip walk-forward validation")

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

    elif args.command == "horizon":
        df = load_jsonl(args.data)

        if 'label' not in df.columns:
            raise ValueError("Data not labeled! Run 'backfill' first.")

        if args.compare_offsets:
            # Compare T-60 at different offset filters
            print("\n" + "=" * 60)
            print("T-60 OFFSET COMPARISON (proving late-bias impact)")
            print("=" * 60)

            offsets_to_test = [None, 15.0, 10.0, 5.0]
            results = []

            for max_off in offsets_to_test:
                label = f"offset<={max_off:.0f}s" if max_off else "all samples"
                print(f"\n--- Training T-60 with {label} ---")

                out_dir = args.output_dir / f"t60_offset_{max_off or 'all'}"
                result = train_per_horizon(
                    df.copy(),
                    out_dir,
                    target_horizon="T-60",
                    max_offset_sec=max_off
                )
                if result:
                    # Load metrics
                    metrics_path = out_dir / 'metrics.json'
                    if metrics_path.exists():
                        with open(metrics_path) as f:
                            m = json.load(f)
                            results.append({
                                'filter': label,
                                'samples': m.get('test_samples', 0),
                                'logloss_delta': m.get('logloss_delta', 0),
                                'ece': m.get('ece', 0)
                            })

            # Summary table
            if results:
                print("\n" + "=" * 60)
                print("T-60 OFFSET COMPARISON SUMMARY")
                print("=" * 60)
                print("\n  Filter        | Samples | LogL Delta |  ECE")
                print("  " + "-" * 50)
                for r in results:
                    print(f"  {r['filter']:<14} | {r['samples']:>7} | {r['logloss_delta']:+.4f}    | {r['ece']:.4f}")

                # Interpretation
                if len(results) >= 2:
                    all_delta = results[0]['logloss_delta']
                    best_filtered = min(r['logloss_delta'] for r in results[1:] if r['samples'] > 20)
                    improvement = all_delta - best_filtered
                    print(f"\n  Improvement from filtering: {improvement:+.4f} log loss")
                    if improvement > 0.005:
                        print("  >>> Late-bias IS hurting T-60 performance")
                    else:
                        print("  >>> Late-bias impact is minimal")

        else:
            # Single horizon training
            train_per_horizon(
                df,
                args.output_dir,
                target_horizon=args.horizon,
                max_offset_sec=args.max_offset
            )

    elif args.command == "separate-models":
        df = load_jsonl(args.data)

        if 'label' not in df.columns:
            raise ValueError("Data not labeled! Run 'backfill' first.")

        train_separate_horizon_models(
            df,
            args.output_dir,
            horizons=args.horizons,
            compare_to_pooled=not args.no_pooled,
            run_walk_forward=not args.no_walk_forward
        )


if __name__ == "__main__":
    main()
