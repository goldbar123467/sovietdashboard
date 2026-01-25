#!/usr/bin/env python3
"""
Dataset Validation & Leak Detection
====================================
Validates dataset integrity and checks for data leakage.

Usage:
    python validate_dataset.py --data training_data.jsonl
    python validate_dataset.py --data training_data.jsonl --verbose
"""

import argparse
import json
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict
import sys


def load_jsonl(path: Path) -> pd.DataFrame:
    """Load JSONL file to dataframe."""
    records = []
    with open(path, 'r') as f:
        for i, line in enumerate(f):
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f"  Warning: Invalid JSON at line {i+1}: {e}")
                    continue

    if not records:
        raise ValueError(f"No valid records found in {path}")

    df = pd.DataFrame(records)
    print(f"Loaded {len(df)} records from {path}")
    return df


def check_horizon_alignment(df: pd.DataFrame, verbose: bool = False) -> dict:
    """
    Audit #1: Horizon Alignment Sanity

    For each horizon sample, verify:
    - sample_ts <= target_ts + tolerance
    - Samples are taken ON or AFTER the target time (no lookahead)
    """
    print("\n" + "=" * 60)
    print("AUDIT #1: Horizon Alignment")
    print("=" * 60)

    if 'horizon' not in df.columns:
        print("  No horizon field found - skipping")
        return {'status': 'skipped', 'reason': 'no horizon field'}

    horizon_df = df[df['horizon'].notna()].copy()
    if len(horizon_df) == 0:
        print("  No horizon samples found - skipping")
        return {'status': 'skipped', 'reason': 'no horizon samples'}

    results = {
        'total_horizon_samples': len(horizon_df),
        'issues': [],
        'delta_stats': {}
    }

    # Check for audit fields
    has_audit_fields = all(col in horizon_df.columns for col in
                           ['sample_ts_utc', 'target_ts_utc', 'max_source_ts_utc'])

    if has_audit_fields:
        print("  Audit fields present (sample_ts_utc, target_ts_utc, max_source_ts_utc)")

        # Parse timestamps
        horizon_df['sample_ts'] = pd.to_datetime(horizon_df['sample_ts_utc'])
        horizon_df['target_ts'] = pd.to_datetime(horizon_df['target_ts_utc'])
        horizon_df['max_source_ts'] = pd.to_datetime(horizon_df['max_source_ts_utc'])

        # =====================================================================
        # CRITICAL CHECK #1: max_source_ts <= sample_ts (NO FUTURE DATA)
        # This is the strongest invariant - features never depend on data
        # from after the sample moment
        # =====================================================================
        future_data = horizon_df[horizon_df['max_source_ts'] > horizon_df['sample_ts']]
        if len(future_data) > 0:
            results['issues'].append({
                'type': 'FUTURE_DATA',
                'count': len(future_data),
                'description': 'max_source_ts > sample_ts (CRITICAL: features use future data)'
            })
            print(f"  ❌ FUTURE DATA: {len(future_data)} samples use data from AFTER sample time")
            if verbose:
                for _, row in future_data.head(3).iterrows():
                    leak_sec = (row['max_source_ts'] - row['sample_ts']).total_seconds()
                    print(f"     {row['ticker']}: max_source is {leak_sec:.1f}s AFTER sample_ts")
        else:
            print("  ✓ max_source_ts <= sample_ts (no future data in features)")

        # =====================================================================
        # CRITICAL CHECK #2: sample_ts >= target_ts (NO LOOKAHEAD)
        # We must be ON or AFTER the target horizon time
        # =====================================================================
        lookahead = horizon_df[horizon_df['sample_ts'] < horizon_df['target_ts']]
        if len(lookahead) > 0:
            results['issues'].append({
                'type': 'LOOKAHEAD',
                'count': len(lookahead),
                'description': 'sample_ts < target_ts (logged before horizon target)'
            })
            print(f"  ❌ LOOKAHEAD: {len(lookahead)} samples taken BEFORE target time")
            if verbose:
                for _, row in lookahead.head(3).iterrows():
                    delta = (row['sample_ts'] - row['target_ts']).total_seconds()
                    print(f"     {row['ticker']} @ {row['horizon']}: {delta:.1f}s before target")
        else:
            print("  ✓ sample_ts >= target_ts (all samples on/after target)")

        # =====================================================================
        # CHECK #3: Settlement buffer temporal validity
        # sample_ts - min_source_ts <= 60s + epsilon
        # This catches "buffer never prunes" bugs that change feature meaning
        # =====================================================================
        BUFFER_MAX_AGE_SEC = 65.0  # 60s buffer + 5s epsilon

        # Check if min_source_ts is available
        if 'min_source_ts_utc' in horizon_df.columns:
            horizon_df['min_source_ts'] = pd.to_datetime(horizon_df['min_source_ts_utc'])
            horizon_df['buffer_age_sec'] = (
                horizon_df['sample_ts'] - horizon_df['min_source_ts']
            ).dt.total_seconds()

            stale_buffer = horizon_df[horizon_df['buffer_age_sec'] > BUFFER_MAX_AGE_SEC]
            if len(stale_buffer) > 0:
                results['issues'].append({
                    'type': 'STALE_BUFFER',
                    'count': len(stale_buffer),
                    'description': f'Settlement buffer contains data older than {BUFFER_MAX_AGE_SEC}s'
                })
                print(f"  ⚠ STALE BUFFER: {len(stale_buffer)} samples have buffer data > {BUFFER_MAX_AGE_SEC:.0f}s old")
                if verbose:
                    for _, row in stale_buffer.head(3).iterrows():
                        print(f"     {row['ticker']}: buffer age = {row['buffer_age_sec']:.1f}s")
            else:
                print(f"  ✓ Settlement buffer age <= {BUFFER_MAX_AGE_SEC:.0f}s (buffer properly pruned)")
        else:
            print("  ⚠ min_source_ts_utc not available - cannot verify buffer pruning")

        # =====================================================================
        # BIAS CHECK: Offset from target (sample_ts - target_ts)
        # If we enforce sample_ts >= target_ts, offset should be in [0, tolerance]
        #
        # Interpretation:
        #   - median offset near 0-10s: effectively deterministic, no bias
        #   - median offset 25-30s: systematically late, potential feature shift
        #   - high p90: occasional stragglers, usually OK
        # =====================================================================
        horizon_df['offset_sec'] = (horizon_df['sample_ts'] - horizon_df['target_ts']).dt.total_seconds()

        print("\n  Offset bias check (sample_ts - target_ts):")
        print("  Horizon  |  Mean  | Median |  P90   |  Max   | Bias?")
        print("  " + "-" * 55)

        for h in sorted(horizon_df['horizon'].unique()):
            h_df = horizon_df[horizon_df['horizon'] == h]
            offsets = h_df['offset_sec']

            mean_off = offsets.mean()
            median_off = offsets.median()
            p90_off = offsets.quantile(0.90)
            max_off = offsets.max()

            # Bias assessment
            if median_off <= 10:
                bias = "OK"
            elif median_off <= 20:
                bias = "mild"
            else:
                bias = "LATE"

            results['delta_stats'][h] = {
                'mean_sec': float(mean_off),
                'median_sec': float(median_off),
                'p90_sec': float(p90_off),
                'max_sec': float(max_off),
                'bias': bias
            }

            print(f"  {h:<8} | {mean_off:>5.1f}s | {median_off:>5.1f}s | {p90_off:>5.1f}s | {max_off:>5.1f}s | {bias}")

        # Overall bias warning
        late_horizons = [h for h, stats in results['delta_stats'].items()
                        if stats.get('bias') == 'LATE']
        if late_horizons:
            print(f"\n  ⚠ Systematic late sampling detected for: {', '.join(late_horizons)}")
            print("    Consider reducing polling interval or implementing 'closest to target' selection")
            results['issues'].append({
                'type': 'LATE_SAMPLING_BIAS',
                'horizons': late_horizons,
                'description': 'Median offset > 20s indicates systematic late sampling'
            })

    else:
        print("  ⚠ Audit fields missing (sample_ts_utc, target_ts_utc, max_source_ts_utc)")
        print("    Cannot perform precise leak detection. Add audit fields to kalshi_stream.py")
        results['issues'].append({
            'type': 'MISSING_AUDIT_FIELDS',
            'description': 'Cannot verify timing without audit fields'
        })

    results['status'] = 'pass' if len(results['issues']) == 0 else 'fail'
    return results


def check_dedup_correctness(df: pd.DataFrame, verbose: bool = False) -> dict:
    """
    Audit #2: Deduplication Correctness

    Verify one sample per market per horizon.
    """
    print("\n" + "=" * 60)
    print("AUDIT #2: Deduplication Correctness")
    print("=" * 60)

    if 'horizon' not in df.columns:
        print("  No horizon field - skipping")
        return {'status': 'skipped'}

    horizon_df = df[df['horizon'].notna()].copy()
    if len(horizon_df) == 0:
        print("  No horizon samples - skipping")
        return {'status': 'skipped'}

    # Check for duplicates
    dupes = horizon_df.groupby(['ticker', 'horizon']).size()
    duplicates = dupes[dupes > 1]

    results = {
        'total_pairs': len(dupes),
        'unique_pairs': len(dupes[dupes == 1]),
        'duplicate_pairs': len(duplicates),
        'duplicates': []
    }

    if len(duplicates) > 0:
        print(f"  ❌ DUPLICATES: {len(duplicates)} (ticker, horizon) pairs have >1 sample")
        for (ticker, horizon), count in duplicates.head(5).items():
            print(f"     {ticker} @ {horizon}: {count} samples")
            results['duplicates'].append({
                'ticker': ticker,
                'horizon': horizon,
                'count': int(count)
            })
        results['status'] = 'fail'
    else:
        print(f"  ✓ All {len(dupes)} (ticker, horizon) pairs are unique")
        results['status'] = 'pass'

    return results


def check_feature_label_gap(df: pd.DataFrame, min_gap_sec: float = 1.0, verbose: bool = False) -> dict:
    """
    Audit #3: Feature-Label Gap

    Assert feature_ts <= label_ts - min_gap.
    This prevents features from "seeing" the outcome.
    """
    print("\n" + "=" * 60)
    print("AUDIT #3: Feature-Label Gap")
    print("=" * 60)

    results = {'status': 'unknown', 'issues': []}

    # The label is determined at close_time. Features should be from before.
    if 'close_time' not in df.columns:
        print("  No close_time field - cannot verify")
        return {'status': 'skipped'}

    if 'log_time' in df.columns or 'sample_ts_utc' in df.columns:
        ts_col = 'sample_ts_utc' if 'sample_ts_utc' in df.columns else 'log_time'
        df['_feature_ts'] = pd.to_datetime(df[ts_col])
        df['_label_ts'] = pd.to_datetime(df['close_time'])

        # Calculate gap
        df['_gap_sec'] = (df['_label_ts'] - df['_feature_ts']).dt.total_seconds()

        # Check minimum gap
        violations = df[df['_gap_sec'] < min_gap_sec]
        if len(violations) > 0:
            print(f"  ❌ {len(violations)} samples have gap < {min_gap_sec}s (feature too close to label)")
            results['issues'].append({
                'type': 'INSUFFICIENT_GAP',
                'count': len(violations),
                'min_gap_found': float(df['_gap_sec'].min())
            })
            results['status'] = 'fail'
        else:
            print(f"  ✓ All samples have gap >= {min_gap_sec}s between features and label")
            results['status'] = 'pass'

        # Gap statistics
        results['gap_stats'] = {
            'min_sec': float(df['_gap_sec'].min()),
            'mean_sec': float(df['_gap_sec'].mean()),
            'max_sec': float(df['_gap_sec'].max())
        }
        print(f"  Gap stats: min={df['_gap_sec'].min():.0f}s, "
              f"mean={df['_gap_sec'].mean():.0f}s, max={df['_gap_sec'].max():.0f}s")

        # Cleanup
        df.drop(columns=['_feature_ts', '_label_ts', '_gap_sec'], inplace=True, errors='ignore')
    else:
        print("  No timestamp field found - cannot verify")
        results['status'] = 'skipped'

    return results


def check_missingness(df: pd.DataFrame, verbose: bool = False) -> dict:
    """
    Audit #4: Missingness Map

    Check % missing per feature per horizon.
    """
    print("\n" + "=" * 60)
    print("AUDIT #4: Missingness Map")
    print("=" * 60)

    feature_cols = [
        'spot_price', 'strike', 'mins_to_expiry', 'vol_annual',
        'yes_price', 'yes_bid', 'yes_ask', 'spread',
        'orderbook_imbalance', 'p_model', 'edge', 'logit_edge',
        'settlement_proxy', 'avg60_mid'
    ]

    existing_cols = [c for c in feature_cols if c in df.columns]

    results = {'overall': {}, 'by_horizon': {}}

    # Overall missingness
    print("\n  Overall missingness:")
    for col in existing_cols:
        pct_missing = df[col].isna().mean() * 100
        results['overall'][col] = pct_missing
        if pct_missing > 10:
            print(f"  ⚠ {col}: {pct_missing:.1f}% missing")
        elif pct_missing > 0:
            print(f"    {col}: {pct_missing:.1f}% missing")

    # By horizon (if available)
    if 'horizon' in df.columns:
        print("\n  Missingness by horizon:")
        for horizon in df['horizon'].dropna().unique():
            h_df = df[df['horizon'] == horizon]
            results['by_horizon'][horizon] = {}
            high_missing = []
            for col in existing_cols:
                pct = h_df[col].isna().mean() * 100
                results['by_horizon'][horizon][col] = pct
                if pct > 10:
                    high_missing.append(f"{col}={pct:.0f}%")
            if high_missing:
                print(f"    {horizon}: " + ", ".join(high_missing))
            else:
                print(f"    {horizon}: OK (all <10% missing)")

    results['status'] = 'info'
    return results


def check_feature_stability(df: pd.DataFrame, verbose: bool = False) -> dict:
    """
    Audit #5: Feature Stability

    Check for constant or nan-heavy features.
    """
    print("\n" + "=" * 60)
    print("AUDIT #5: Feature Stability")
    print("=" * 60)

    feature_cols = [
        'spot_price', 'strike', 'yes_price', 'spread',
        'orderbook_imbalance', 'vol_annual', 'settlement_proxy'
    ]

    existing_cols = [c for c in feature_cols if c in df.columns]
    results = {'issues': []}

    for col in existing_cols:
        series = df[col].dropna()
        if len(series) == 0:
            print(f"  ⚠ {col}: 100% NaN")
            results['issues'].append({'col': col, 'issue': 'all_nan'})
            continue

        # Check for constant
        if series.nunique() == 1:
            print(f"  ⚠ {col}: CONSTANT (value={series.iloc[0]})")
            results['issues'].append({'col': col, 'issue': 'constant', 'value': series.iloc[0]})
            continue

        # Check coefficient of variation
        mean_val = series.mean()
        std_val = series.std()
        if mean_val != 0:
            cv = std_val / abs(mean_val)
            if cv < 0.001:
                print(f"  ⚠ {col}: Very low variance (CV={cv:.6f})")
                results['issues'].append({'col': col, 'issue': 'low_variance', 'cv': cv})
            elif verbose:
                print(f"    {col}: CV={cv:.4f}")

    if not results['issues']:
        print("  ✓ All features have reasonable variance")
        results['status'] = 'pass'
    else:
        results['status'] = 'warn'

    return results


def check_cross_asset_contamination(df: pd.DataFrame, verbose: bool = False) -> dict:
    """
    Audit #6: Cross-Asset Contamination

    Ensure BTC features don't attach to ETH rows.
    """
    print("\n" + "=" * 60)
    print("AUDIT #6: Cross-Asset Contamination")
    print("=" * 60)

    if 'asset' not in df.columns or 'ticker' not in df.columns:
        print("  No asset/ticker fields - skipping")
        return {'status': 'skipped'}

    results = {'issues': []}

    # Check ticker prefix matches asset
    asset_prefixes = {'BTC': 'KXBTC', 'ETH': 'KXETH', 'SOL': 'KXSOL'}

    for asset, prefix in asset_prefixes.items():
        asset_df = df[df['asset'] == asset]
        if len(asset_df) == 0:
            continue

        wrong_prefix = asset_df[~asset_df['ticker'].str.startswith(prefix)]
        if len(wrong_prefix) > 0:
            print(f"  ❌ {asset}: {len(wrong_prefix)} rows have wrong ticker prefix")
            results['issues'].append({
                'asset': asset,
                'wrong_prefix_count': len(wrong_prefix),
                'examples': wrong_prefix['ticker'].head(3).tolist()
            })

    if not results['issues']:
        print("  ✓ All asset/ticker pairs are consistent")
        results['status'] = 'pass'
    else:
        results['status'] = 'fail'

    return results


def run_all_audits(df: pd.DataFrame, verbose: bool = False) -> dict:
    """Run all validation audits."""
    print("\n" + "=" * 60)
    print("DATASET VALIDATION REPORT")
    print("=" * 60)
    print(f"Records: {len(df)}")
    print(f"Columns: {len(df.columns)}")

    results = {
        'horizon_alignment': check_horizon_alignment(df, verbose),
        'dedup_correctness': check_dedup_correctness(df, verbose),
        'feature_label_gap': check_feature_label_gap(df, verbose=verbose),
        'missingness': check_missingness(df, verbose),
        'feature_stability': check_feature_stability(df, verbose),
        'cross_asset': check_cross_asset_contamination(df, verbose)
    }

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    failed = [k for k, v in results.items() if v.get('status') == 'fail']
    warned = [k for k, v in results.items() if v.get('status') == 'warn']
    passed = [k for k, v in results.items() if v.get('status') == 'pass']

    if failed:
        print(f"  ❌ FAILED: {', '.join(failed)}")
    if warned:
        print(f"  ⚠ WARNINGS: {', '.join(warned)}")
    if passed:
        print(f"  ✓ PASSED: {', '.join(passed)}")

    if not failed:
        print("\n  ✓ Dataset passed critical checks")
    else:
        print("\n  ❌ Dataset has critical issues - DO NOT USE FOR TRAINING")

    return results


def main():
    parser = argparse.ArgumentParser(description="Dataset Validation & Leak Detection")
    parser.add_argument("--data", type=Path, required=True, help="JSONL data file")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--output", type=Path, help="Save validation report as JSON")

    args = parser.parse_args()

    df = load_jsonl(args.data)
    results = run_all_audits(df, verbose=args.verbose)

    if args.output:
        # Convert any non-serializable values
        def convert(obj):
            if isinstance(obj, (np.integer, np.floating)):
                return float(obj)
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            return obj

        with open(args.output, 'w') as f:
            json.dump(results, f, indent=2, default=convert)
        print(f"\nReport saved: {args.output}")

    # Exit with error code if failed
    failed = [k for k, v in results.items() if v.get('status') == 'fail']
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
