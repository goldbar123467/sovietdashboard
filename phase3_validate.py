#!/usr/bin/env python3
"""
Phase 3 Victory Validation
==========================
Checks all gates to declare T-60 late-sampling fix successful.

Usage:
    python phase3_validate.py --data new_data.labeled.jsonl --model-dir ./kalshi_model_v3
    python phase3_validate.py --data new_data.labeled.jsonl  # Data gates only
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd


class Gate:
    """Single validation gate."""
    def __init__(self, name: str, category: str):
        self.name = name
        self.category = category
        self.passed: Optional[bool] = None
        self.value: Optional[float] = None
        self.threshold: Optional[float] = None
        self.message: str = ""

    def check(self, value: float, threshold: float, op: str = "<=") -> bool:
        self.value = value
        self.threshold = threshold
        if op == "<=":
            self.passed = value <= threshold
        elif op == "<":
            self.passed = value < threshold
        elif op == ">=":
            self.passed = value >= threshold
        elif op == "==":
            self.passed = value == threshold
        return self.passed

    def __str__(self):
        status = "PASS" if self.passed else "FAIL"
        return f"[{status}] {self.name}: {self.value:.4f} (threshold: {self.threshold})"


def load_data(path: Path) -> pd.DataFrame:
    """Load JSONL data."""
    records = []
    with open(path) as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))
    return pd.DataFrame(records)


def parse_ts(ts_str: str) -> datetime:
    """Parse ISO timestamp."""
    if ts_str is None:
        return None
    # Handle various formats
    ts_str = ts_str.replace('Z', '+00:00')
    try:
        return datetime.fromisoformat(ts_str)
    except:
        return None


def validate_data_quality(df: pd.DataFrame) -> list[Gate]:
    """Check data quality gates."""
    gates = []

    # Gate 1: T-60 chosen_offset_sec median
    t60_mask = df['horizon'] == 'T-60'
    if t60_mask.sum() > 0 and 'chosen_offset_sec' in df.columns:
        t60_offsets = df.loc[t60_mask, 'chosen_offset_sec'].dropna()
        if len(t60_offsets) > 0:
            g = Gate("T-60 offset median", "Data Quality")
            median = t60_offsets.median()
            g.check(median, 10.0, "<=")
            if median <= 5.0:
                g.message = "Excellent (goal achieved)"
            elif median <= 10.0:
                g.message = "Acceptable"
            else:
                g.message = f"Too high - best-candidate may not be working"
            gates.append(g)
        else:
            g = Gate("T-60 offset median", "Data Quality")
            g.passed = False
            g.message = "No chosen_offset_sec values for T-60"
            gates.append(g)
    else:
        g = Gate("T-60 offset median", "Data Quality")
        g.passed = None
        g.message = "No T-60 samples or missing chosen_offset_sec field"
        gates.append(g)

    # Gate 2: No lookahead (max_source_ts <= sample_ts)
    if 'max_source_ts_utc' in df.columns and 'sample_ts_utc' in df.columns:
        violations = 0
        checked = 0
        for _, row in df.iterrows():
            max_src = parse_ts(row.get('max_source_ts_utc'))
            sample = parse_ts(row.get('sample_ts_utc'))
            if max_src and sample:
                checked += 1
                if max_src > sample:
                    violations += 1

        g = Gate("No lookahead (max_source <= sample)", "Data Quality")
        if checked > 0:
            pass_rate = (checked - violations) / checked
            g.check(pass_rate, 1.0, "==")
            g.message = f"{violations} violations in {checked} samples"
        else:
            g.passed = None
            g.message = "No timestamps to check"
        gates.append(g)
    else:
        g = Gate("No lookahead", "Data Quality")
        g.passed = None
        g.message = "Missing timestamp audit fields"
        gates.append(g)

    # Gate 3: Buffer freshness (age <= 65s)
    if 'max_source_ts_utc' in df.columns and 'min_source_ts_utc' in df.columns:
        violations = 0
        checked = 0
        for _, row in df.iterrows():
            max_src = parse_ts(row.get('max_source_ts_utc'))
            min_src = parse_ts(row.get('min_source_ts_utc'))
            if max_src and min_src:
                checked += 1
                age = (max_src - min_src).total_seconds()
                if age > 65:
                    violations += 1

        g = Gate("Buffer freshness (age <= 65s)", "Data Quality")
        if checked > 0:
            pass_rate = (checked - violations) / checked
            g.check(pass_rate, 1.0, "==")
            g.message = f"{violations} violations in {checked} samples"
        else:
            g.passed = None
            g.message = "No buffer age data"
        gates.append(g)

    # Gate 4: T-60 fallback rate (quality indicator, not hard fail)
    t60_mask = df['horizon'] == 'T-60'
    if t60_mask.sum() > 0 and 'is_fallback' in df.columns:
        fallback_vals = df.loc[t60_mask, 'is_fallback'].dropna()
        if len(fallback_vals) > 0:
            fallback_rate = fallback_vals.mean()
            g = Gate("T-60 fallback rate", "Data Quality")
            g.check(fallback_rate, 0.30, "<=")
            g.message = f"{fallback_rate*100:.1f}% of T-60 samples are fallbacks"
            if fallback_rate > 0.30:
                g.message += " (consider widening T60_TOLERANCE_SEC)"
            gates.append(g)

    return gates


def validate_model_gates(df: pd.DataFrame) -> list[Gate]:
    """Check model performance gates."""
    from sklearn.metrics import log_loss

    gates = []

    if 'label' not in df.columns:
        g = Gate("Model validation", "Model")
        g.passed = None
        g.message = "No labels - run labeling first"
        gates.append(g)
        return gates

    # Need model predictions - check if y_prob column exists
    if 'y_prob' not in df.columns:
        g = Gate("Model predictions", "Model")
        g.passed = None
        g.message = "No y_prob column - run inference first"
        gates.append(g)
        return gates

    y_test = df['label'].values
    y_prob = df['y_prob'].values
    market_prob = df['yes_price'].values

    eps = 1e-7
    y_prob_clipped = np.clip(y_prob, eps, 1 - eps)
    market_clipped = np.clip(market_prob, eps, 1 - eps)

    # Per-horizon log loss delta
    horizons = {'T-15': '<', 'T-30': '<=', 'T-60': '<='}

    for horizon, op in horizons.items():
        mask = df['horizon'] == horizon
        if mask.sum() < 10:
            g = Gate(f"{horizon} LogL delta", "Model")
            g.passed = None
            g.message = f"Insufficient samples ({mask.sum()})"
            gates.append(g)
            continue

        h_y = y_test[mask]
        h_model = y_prob_clipped[mask]
        h_market = market_clipped[mask]

        model_ll = log_loss(h_y, h_model)
        market_ll = log_loss(h_y, h_market)
        delta = model_ll - market_ll

        g = Gate(f"{horizon} LogL delta", "Model")
        g.check(delta, 0.0, op)
        g.message = f"Model: {model_ll:.4f}, Market: {market_ll:.4f}"
        gates.append(g)

    # ECE per horizon
    def compute_ece(y_true, y_pred, n_bins=10):
        bin_boundaries = np.linspace(0, 1, n_bins + 1)
        ece = 0.0
        for i in range(n_bins):
            mask = (y_pred >= bin_boundaries[i]) & (y_pred < bin_boundaries[i + 1])
            if mask.sum() > 0:
                avg_conf = y_pred[mask].mean()
                avg_acc = y_true[mask].mean()
                ece += mask.sum() * abs(avg_conf - avg_acc)
        return ece / len(y_true)

    for horizon in ['T-15', 'T-30', 'T-60']:
        mask = df['horizon'] == horizon
        if mask.sum() < 10:
            continue

        h_y = y_test[mask]
        h_prob = y_prob[mask]
        ece = compute_ece(h_y, h_prob)

        g = Gate(f"{horizon} ECE", "Model")
        g.check(ece, 0.06, "<")
        gates.append(g)

    # Trade sim: best-threshold PnL >= 0 per horizon
    thresholds = [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15]

    for horizon in ['T-15', 'T-30', 'T-60']:
        mask = df['horizon'] == horizon
        if mask.sum() < 10:
            continue

        h_df = df[mask].copy()
        h_y = y_test[mask]
        h_prob = y_prob[mask]
        h_market = market_prob[mask]

        best_pnl = float('-inf')
        best_thresh = None

        for thresh in thresholds:
            edge = h_prob - h_market
            buy_yes = edge > thresh
            buy_no = edge < -thresh

            pnl = 0.0
            n_trades = 0
            for i in range(len(h_df)):
                if not (buy_yes[i] or buy_no[i]):
                    continue
                row = h_df.iloc[i]
                outcome = h_y[i]
                # Simplified cost model
                spread = row.get('spread', 0.05)
                cost = spread * 0.5 + 0.005  # slippage + latency

                if buy_yes[i]:
                    entry = row['yes_ask'] + cost
                    pnl += outcome - min(entry, 0.99)
                elif buy_no[i]:
                    entry = (1 - row['yes_bid']) + cost
                    pnl += (1 - outcome) - min(entry, 0.99)
                n_trades += 1

            if n_trades >= 5 and pnl > best_pnl:
                best_pnl = pnl
                best_thresh = thresh

        g = Gate(f"{horizon} best-threshold PnL", "Trade Sim")
        if best_thresh is not None:
            g.check(best_pnl, 0.0, ">=")
            g.message = f"Best thresh: {best_thresh:.2f} with {best_pnl:.2f} PnL"
        else:
            g.passed = None
            g.message = "No valid threshold found"
        gates.append(g)

    return gates


def print_report(gates: list[Gate]):
    """Print validation report."""
    print("\n" + "=" * 70)
    print("PHASE 3 VICTORY VALIDATION")
    print("=" * 70)

    categories = {}
    for g in gates:
        if g.category not in categories:
            categories[g.category] = []
        categories[g.category].append(g)

    all_passed = True
    all_checked = True

    for category, cat_gates in categories.items():
        print(f"\n{category}")
        print("-" * 40)
        for g in cat_gates:
            if g.passed is None:
                status = "SKIP"
                all_checked = False
            elif g.passed:
                status = "PASS"
            else:
                status = "FAIL"
                all_passed = False

            if g.value is not None:
                print(f"  [{status}] {g.name}: {g.value:.4f} (threshold: {g.threshold})")
            else:
                print(f"  [{status}] {g.name}")
            if g.message:
                print(f"         {g.message}")

    print("\n" + "=" * 70)

    if not all_checked:
        print("RESULT: INCOMPLETE - Some gates could not be checked")
        print("        Run model inference to populate y_prob column")
        return 2
    elif all_passed:
        print("RESULT: PASS - All gates passed!")
        print("        Phase 3 Complete: T-60 late-sampling fix successful")
        return 0
    else:
        failed = [g for g in gates if g.passed is False]
        print(f"RESULT: FAIL - {len(failed)} gate(s) failed")
        for g in failed:
            print(f"        - {g.name}")
        return 1


def main():
    parser = argparse.ArgumentParser(description="Phase 3 Victory Validation")
    parser.add_argument("--data", type=Path, required=True,
                        help="Labeled JSONL data file")
    parser.add_argument("--model-dir", type=Path,
                        help="Model directory (optional, for inference)")
    parser.add_argument("--data-only", action="store_true",
                        help="Only run data quality checks")

    args = parser.parse_args()

    if not args.data.exists():
        print(f"Error: Data file not found: {args.data}")
        sys.exit(1)

    print(f"Loading data from {args.data}...")
    df = load_data(args.data)
    print(f"Loaded {len(df)} samples")

    gates = []

    # Data quality gates
    gates.extend(validate_data_quality(df))

    # Model gates (if not data-only)
    if not args.data_only:
        gates.extend(validate_model_gates(df))

    exit_code = print_report(gates)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
