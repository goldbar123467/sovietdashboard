#!/usr/bin/env python3
"""
Phase 3 Before/After Scoreboard
===============================
Compare old vs new dataset to prove engineering change mattered.

Usage:
    python phase3_compare.py \
        --before old_data.labeled.jsonl \
        --after new_data.labeled.jsonl

Output: Single diff table showing deltas per horizon.
"""

import argparse
import json
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.metrics import log_loss


@dataclass
class HorizonMetrics:
    """Metrics for a single horizon."""
    horizon: str
    n_samples: int
    model_logloss: float
    market_logloss: float
    logloss_delta: float  # model - market (negative = model better)
    ece: float
    best_thresh: Optional[float]
    best_pnl: float
    offset_median: Optional[float]  # T-60 only
    fallback_rate: Optional[float]  # Fraction of samples marked as fallback


def load_data(path: Path) -> pd.DataFrame:
    """Load JSONL data."""
    records = []
    with open(path) as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))
    return pd.DataFrame(records)


def compute_ece(y_true: np.ndarray, y_pred: np.ndarray, n_bins: int = 10) -> float:
    """Compute Expected Calibration Error."""
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        mask = (y_pred >= bin_boundaries[i]) & (y_pred < bin_boundaries[i + 1])
        if mask.sum() > 0:
            avg_conf = y_pred[mask].mean()
            avg_acc = y_true[mask].mean()
            ece += mask.sum() * abs(avg_conf - avg_acc)
    return ece / len(y_true) if len(y_true) > 0 else 0.0


def compute_slippage(row) -> float:
    """Compute slippage cost."""
    spread = row.get('spread', 0.05)
    imbalance = abs(row.get('orderbook_imbalance', 0))
    return spread * 0.5 + 0.02 * imbalance * spread


def compute_best_threshold_pnl(df: pd.DataFrame, y_true: np.ndarray,
                                y_prob: np.ndarray) -> tuple[Optional[float], float]:
    """Find best threshold and its PnL."""
    thresholds = [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15]
    market_prob = df['yes_price'].values

    best_thresh = None
    best_pnl = float('-inf')

    for thresh in thresholds:
        edge = y_prob - market_prob
        buy_yes = edge > thresh
        buy_no = edge < -thresh

        pnl = 0.0
        n_trades = 0

        for i in range(len(df)):
            if not (buy_yes[i] or buy_no[i]):
                continue
            row = df.iloc[i]
            outcome = y_true[i]
            slippage = compute_slippage(row)
            latency = 0.005

            if buy_yes[i]:
                entry = row['yes_ask'] + latency + slippage
                pnl += outcome - min(entry, 0.99)
            elif buy_no[i]:
                entry = (1 - row['yes_bid']) + latency + slippage
                pnl += (1 - outcome) - min(entry, 0.99)
            n_trades += 1

        if n_trades >= 5 and pnl > best_pnl:
            best_pnl = pnl
            best_thresh = thresh

    return best_thresh, best_pnl if best_thresh else 0.0


def analyze_dataset(df: pd.DataFrame, name: str) -> dict[str, HorizonMetrics]:
    """Compute metrics per horizon for a dataset."""

    if 'label' not in df.columns:
        raise ValueError(f"{name}: No 'label' column - run labeling first")

    # Check for model predictions
    if 'y_prob' not in df.columns:
        # Try to use a simple baseline: use yes_price as model prob (will show no edge)
        print(f"  Warning: {name} has no y_prob - using yes_price as proxy")
        df['y_prob'] = df['yes_price']

    results = {}
    eps = 1e-7

    for horizon in ['T-15', 'T-30', 'T-60']:
        mask = df['horizon'] == horizon
        if mask.sum() < 5:
            continue

        h_df = df[mask].copy()
        y_true = h_df['label'].values
        y_prob = np.clip(h_df['y_prob'].values, eps, 1 - eps)
        market_prob = np.clip(h_df['yes_price'].values, eps, 1 - eps)

        # Log loss
        model_ll = log_loss(y_true, y_prob)
        market_ll = log_loss(y_true, market_prob)
        ll_delta = model_ll - market_ll

        # ECE
        ece = compute_ece(y_true, y_prob)

        # Best threshold PnL
        best_thresh, best_pnl = compute_best_threshold_pnl(h_df, y_true, y_prob)

        # Offset median (T-60 only)
        offset_median = None
        if horizon == 'T-60' and 'chosen_offset_sec' in h_df.columns:
            offsets = h_df['chosen_offset_sec'].dropna()
            if len(offsets) > 0:
                offset_median = offsets.median()

        # Fallback rate (fraction of samples marked as fallback)
        fallback_rate = None
        if 'is_fallback' in h_df.columns:
            fallback_vals = h_df['is_fallback'].dropna()
            if len(fallback_vals) > 0:
                fallback_rate = fallback_vals.mean()

        results[horizon] = HorizonMetrics(
            horizon=horizon,
            n_samples=mask.sum(),
            model_logloss=model_ll,
            market_logloss=market_ll,
            logloss_delta=ll_delta,
            ece=ece,
            best_thresh=best_thresh,
            best_pnl=best_pnl,
            offset_median=offset_median,
            fallback_rate=fallback_rate
        )

    return results


def print_comparison(before: dict[str, HorizonMetrics],
                     after: dict[str, HorizonMetrics],
                     before_name: str, after_name: str):
    """Print the before/after diff table."""

    print("\n" + "=" * 90)
    print("PHASE 3 BEFORE/AFTER SCOREBOARD")
    print("=" * 90)
    print(f"\n  BEFORE: {before_name}")
    print(f"  AFTER:  {after_name}")

    # Horizons to compare
    horizons = ['T-15', 'T-30', 'T-60']

    # Sample counts
    print("\n" + "-" * 90)
    print("SAMPLE COUNTS")
    print("-" * 90)
    print(f"{'Horizon':<10} {'Before':>12} {'After':>12} {'Delta':>12} {'Change':>15}")
    print("-" * 61)

    for h in horizons:
        b_n = before[h].n_samples if h in before else 0
        a_n = after[h].n_samples if h in after else 0
        delta = a_n - b_n
        pct = ((a_n / b_n) - 1) * 100 if b_n > 0 else 0

        flag = ""
        if h == 'T-60' and delta < -b_n * 0.3:
            flag = " !! DROP"

        print(f"{h:<10} {b_n:>12d} {a_n:>12d} {delta:>+12d} {pct:>+14.1f}%{flag}")

    # Log Loss Delta (model - market)
    print("\n" + "-" * 90)
    print("LOG LOSS DELTA vs MARKET  (negative = model beats market)")
    print("-" * 90)
    print(f"{'Horizon':<10} {'Before':>12} {'After':>12} {'Improvement':>14} {'Status':>20}")
    print("-" * 68)

    for h in horizons:
        if h not in before or h not in after:
            print(f"{h:<10} {'N/A':>12} {'N/A':>12}")
            continue

        b_delta = before[h].logloss_delta
        a_delta = after[h].logloss_delta
        improvement = b_delta - a_delta  # positive = got better

        # Status assessment
        if a_delta < 0:
            status = "BEATS MARKET"
        elif a_delta <= 0.005:
            status = "~TIED"
        else:
            status = "LOSES TO MARKET"

        arrow = "^" if improvement > 0.005 else ("v" if improvement < -0.005 else "=")

        print(f"{h:<10} {b_delta:>+12.4f} {a_delta:>+12.4f} {improvement:>+12.4f} {arrow} {status:>18}")

    # ECE
    print("\n" + "-" * 90)
    print("EXPECTED CALIBRATION ERROR  (lower = better calibrated)")
    print("-" * 90)
    print(f"{'Horizon':<10} {'Before':>12} {'After':>12} {'Improvement':>14} {'Pass (<0.06)':>15}")
    print("-" * 63)

    for h in horizons:
        if h not in before or h not in after:
            continue

        b_ece = before[h].ece
        a_ece = after[h].ece
        improvement = b_ece - a_ece
        passed = "YES" if a_ece < 0.06 else "NO"

        print(f"{h:<10} {b_ece:>12.4f} {a_ece:>12.4f} {improvement:>+12.4f}   {passed:>15}")

    # Best Threshold PnL
    print("\n" + "-" * 90)
    print("BEST-THRESHOLD PnL  (positive = profitable)")
    print("-" * 90)
    print(f"{'Horizon':<10} {'Before':>12} {'After':>12} {'Improvement':>14} {'Best Thresh':>12}")
    print("-" * 60)

    for h in horizons:
        if h not in before or h not in after:
            continue

        b_pnl = before[h].best_pnl
        a_pnl = after[h].best_pnl
        improvement = a_pnl - b_pnl
        thresh = f"{after[h].best_thresh:.2f}" if after[h].best_thresh else "N/A"

        print(f"{h:<10} ${b_pnl:>+11.2f} ${a_pnl:>+11.2f} ${improvement:>+11.2f}   {thresh:>12}")

    # T-60 Offset (the key fix metric)
    print("\n" + "-" * 90)
    print("T-60 OFFSET MEDIAN  (the fix target)")
    print("-" * 90)

    if 'T-60' in before and 'T-60' in after:
        b_off = before['T-60'].offset_median
        a_off = after['T-60'].offset_median

        b_str = f"{b_off:.1f}s" if b_off else "N/A"
        a_str = f"{a_off:.1f}s" if a_off else "N/A"

        if b_off and a_off:
            improvement = b_off - a_off
            status = "FIXED" if a_off <= 10 else "IMPROVED" if improvement > 5 else "NO CHANGE"
            print(f"  Before: {b_str:>10}")
            print(f"  After:  {a_str:>10}")
            print(f"  Delta:  {improvement:>+10.1f}s")
            print(f"  Status: {status}")
        else:
            print(f"  Before: {b_str}")
            print(f"  After:  {a_str}")
            print("  (Missing offset data)")

    # Fallback Rate (T-60 quality indicator)
    if 'T-60' in after and after['T-60'].fallback_rate is not None:
        print("\n" + "-" * 90)
        print("T-60 FALLBACK RATE  (lower = better sample quality)")
        print("-" * 90)

        a_rate = after['T-60'].fallback_rate
        b_rate = before['T-60'].fallback_rate if 'T-60' in before and before['T-60'].fallback_rate else None

        print(f"  After fallback rate: {a_rate*100:.1f}%")
        if b_rate is not None:
            print(f"  Before fallback rate: {b_rate*100:.1f}%")

        if a_rate > 0.3:
            print("  WARNING: >30% fallback suggests best-candidate is struggling")
            print("           Consider widening T60_TOLERANCE_SEC")

    # Overall verdict
    print("\n" + "=" * 90)
    print("VERDICT")
    print("=" * 90)

    issues = []
    wins = []

    # Check T-60 LogL delta
    if 'T-60' in after:
        if after['T-60'].logloss_delta <= 0:
            wins.append("T-60 now beats or ties market on log loss")
        else:
            issues.append("T-60 still loses to market on log loss")

    # Check sample count
    if 'T-60' in before and 'T-60' in after:
        if after['T-60'].n_samples < before['T-60'].n_samples * 0.5:
            issues.append(f"T-60 sample count dropped >50% ({before['T-60'].n_samples} -> {after['T-60'].n_samples})")

    # Check fallback rate
    if 'T-60' in after and after['T-60'].fallback_rate is not None:
        if after['T-60'].fallback_rate > 0.3:
            issues.append(f"T-60 fallback rate is {after['T-60'].fallback_rate*100:.0f}% (target: <30%)")
        elif after['T-60'].fallback_rate < 0.1:
            wins.append(f"T-60 fallback rate is low ({after['T-60'].fallback_rate*100:.0f}%)")

    # Check offset improvement
    if 'T-60' in after and after['T-60'].offset_median:
        if after['T-60'].offset_median <= 10:
            wins.append(f"T-60 offset median is {after['T-60'].offset_median:.1f}s (target: <=10s)")
        elif 'T-60' in before and before['T-60'].offset_median:
            if after['T-60'].offset_median < before['T-60'].offset_median:
                wins.append(f"T-60 offset improved ({before['T-60'].offset_median:.1f}s -> {after['T-60'].offset_median:.1f}s)")

    # Check PnL
    for h in horizons:
        if h in after and after[h].best_pnl > 0:
            wins.append(f"{h} has positive best-threshold PnL (${after[h].best_pnl:.2f})")

    if wins:
        print("\n  WINS:")
        for w in wins:
            print(f"    + {w}")

    if issues:
        print("\n  ISSUES:")
        for i in issues:
            print(f"    - {i}")

    if not issues and len(wins) >= 2:
        print("\n  >>> ENGINEERING CHANGE VALIDATED <<<")
    elif issues:
        print("\n  >>> NEEDS ATTENTION <<<")
    else:
        print("\n  >>> INCONCLUSIVE - need more data <<<")

    print()


def main():
    parser = argparse.ArgumentParser(description="Phase 3 Before/After Comparison")
    parser.add_argument("--before", type=Path, required=True,
                        help="Old dataset (before best-candidate)")
    parser.add_argument("--after", type=Path, required=True,
                        help="New dataset (with best-candidate)")

    args = parser.parse_args()

    for path, name in [(args.before, "before"), (args.after, "after")]:
        if not path.exists():
            print(f"Error: {name} file not found: {path}")
            sys.exit(1)

    print(f"Loading BEFORE: {args.before}")
    df_before = load_data(args.before)
    print(f"  {len(df_before)} samples")

    print(f"Loading AFTER: {args.after}")
    df_after = load_data(args.after)
    print(f"  {len(df_after)} samples")

    print("\nAnalyzing BEFORE dataset...")
    metrics_before = analyze_dataset(df_before, str(args.before))

    print("Analyzing AFTER dataset...")
    metrics_after = analyze_dataset(df_after, str(args.after))

    print_comparison(metrics_before, metrics_after,
                     str(args.before.name), str(args.after.name))


if __name__ == "__main__":
    main()
