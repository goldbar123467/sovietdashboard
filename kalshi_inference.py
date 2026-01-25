#!/usr/bin/env python3
"""
Kalshi Production Inference
===========================
Loads model + policy artifacts as a unit for production inference.

Usage:
    from kalshi_inference import HorizonRouter

    router = HorizonRouter("./kalshi_horizon_models")

    # Single prediction
    result = router.predict(features, horizon="T-15")
    # Returns: {'prob': 0.65, 'threshold': 0.08, 'trade': True, 'direction': 'YES'}

    # Batch prediction
    results = router.predict_batch(df)
"""

import json
import joblib
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Dict, Any, List

import numpy as np
import pandas as pd


@dataclass
class PredictionResult:
    """Result of a single prediction."""
    horizon: str
    probability: float
    threshold: float
    edge: float  # prob - market_price
    trade: bool  # |edge| > threshold
    direction: Optional[str]  # 'YES' or 'NO' or None
    expected_pnl: Optional[float]  # Simplified expected value
    model_used: str  # Which model made this prediction


class HorizonModel:
    """Single horizon model with policy artifacts."""

    def __init__(self, model_dir: Path):
        self.model_dir = Path(model_dir)
        self.model = None
        self.threshold = 0.05  # Default
        self.policy = {}
        self.calibration = {}
        self.feature_stats = {}
        self.feature_names = []

        self._load()

    def _load(self):
        """Load model and policy artifacts."""
        # Load model
        model_path = self.model_dir / 'model.joblib'
        if model_path.exists():
            self.model = joblib.load(model_path)
        else:
            raise FileNotFoundError(f"Model not found: {model_path}")

        # Load threshold policy
        thresh_path = self.model_dir / 'best_threshold.json'
        if thresh_path.exists():
            with open(thresh_path) as f:
                data = json.load(f)
                self.threshold = data.get('threshold', 0.05)
                self.policy = data.get('policy', {})

        # Load calibration
        calib_path = self.model_dir / 'calibration.json'
        if calib_path.exists():
            with open(calib_path) as f:
                self.calibration = json.load(f)

        # Load feature stats
        stats_path = self.model_dir / 'feature_stats.json'
        if stats_path.exists():
            with open(stats_path) as f:
                self.feature_stats = json.load(f)
                self.feature_names = self.feature_stats.get('features', [])

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Get probability predictions."""
        # Ensure feature alignment
        if self.feature_names:
            # Add missing features with 0
            for col in self.feature_names:
                if col not in X.columns:
                    X[col] = 0
            X = X[self.feature_names]

        # Handle NaN/inf
        X = X.fillna(0).replace([np.inf, -np.inf], 0)

        return self.model.predict_proba(X)[:, 1]

    def should_trade(self, prob: float, market_price: float) -> tuple[bool, Optional[str], float]:
        """Determine if we should trade and in which direction.

        Returns:
            (trade, direction, edge)
        """
        edge = prob - market_price

        if abs(edge) > self.threshold:
            direction = 'YES' if edge > 0 else 'NO'
            return True, direction, edge
        return False, None, edge


class HorizonRouter:
    """Routes predictions to appropriate horizon model."""

    def __init__(self, models_dir: Path):
        """Load all horizon models and router config.

        Args:
            models_dir: Base directory containing horizon subdirectories
                       (t_15/, t_30/, t_60/, pooled/, router_config.json)
        """
        self.models_dir = Path(models_dir)
        self.models: Dict[str, HorizonModel] = {}
        self.router_config = {}

        self._load_router()
        self._load_models()

    def _load_router(self):
        """Load router configuration."""
        config_path = self.models_dir / 'router_config.json'
        if config_path.exists():
            with open(config_path) as f:
                self.router_config = json.load(f)

    def _load_models(self):
        """Load all available models."""
        # Standard horizon directories
        for horizon_dir in ['t_15', 't_30', 't_60', 'pooled']:
            path = self.models_dir / horizon_dir
            if path.exists() and (path / 'model.joblib').exists():
                horizon_key = horizon_dir.replace('_', '-').upper() if horizon_dir != 'pooled' else 'pooled'
                try:
                    self.models[horizon_key] = HorizonModel(path)
                    print(f"  Loaded {horizon_key} model from {path}")
                except Exception as e:
                    print(f"  Warning: Failed to load {horizon_key}: {e}")

    def _select_model(self, horizon: str) -> HorizonModel:
        """Select appropriate model for horizon.

        Routing logic:
            - T-15: use t_15 if available, else pooled
            - T-60: use t_60 if available, else pooled
            - T-30: use pooled (or t_30 if you prefer)
            - Other: use pooled
        """
        horizon_upper = horizon.upper() if horizon else ''

        # Check for dedicated model
        if horizon_upper in self.models:
            return self.models[horizon_upper]

        # Fallback to pooled
        if 'pooled' in self.models:
            return self.models['pooled']

        # Last resort: use any available model
        if self.models:
            return next(iter(self.models.values()))

        raise RuntimeError("No models loaded!")

    def predict(self, features: pd.DataFrame, horizon: str,
                market_price: float) -> PredictionResult:
        """Make a single prediction.

        Args:
            features: DataFrame with feature columns (single row)
            horizon: "T-15", "T-30", or "T-60"
            market_price: Current yes_price for edge calculation

        Returns:
            PredictionResult with prediction and trade decision
        """
        model = self._select_model(horizon)

        # Get probability
        if len(features) == 1:
            prob = float(model.predict_proba(features)[0])
        else:
            prob = float(model.predict_proba(features.iloc[[0]])[0])

        # Trade decision
        trade, direction, edge = model.should_trade(prob, market_price)

        # Expected PnL (simplified)
        expected_pnl = None
        if trade and direction:
            # Assume we pay market price + ~2% spread/costs
            cost = 0.02
            if direction == 'YES':
                expected_pnl = prob - (market_price + cost)
            else:
                expected_pnl = (1 - prob) - ((1 - market_price) + cost)

        return PredictionResult(
            horizon=horizon,
            probability=prob,
            threshold=model.threshold,
            edge=edge,
            trade=trade,
            direction=direction,
            expected_pnl=expected_pnl,
            model_used=type(model).__name__
        )

    def predict_batch(self, df: pd.DataFrame,
                      horizon_col: str = 'horizon',
                      market_price_col: str = 'yes_price') -> List[PredictionResult]:
        """Make batch predictions, routing each row to appropriate model.

        Args:
            df: DataFrame with features and horizon column
            horizon_col: Name of horizon column
            market_price_col: Name of market price column

        Returns:
            List of PredictionResult objects
        """
        results = []

        for idx, row in df.iterrows():
            horizon = row.get(horizon_col, 'pooled')
            market_price = row.get(market_price_col, 0.5)

            # Convert row to single-row DataFrame for prediction
            features = pd.DataFrame([row])

            result = self.predict(features, horizon, market_price)
            results.append(result)

        return results

    def get_trade_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        """Get trade signals for a batch of samples.

        Returns DataFrame with added columns:
            - model_prob: Model's probability
            - edge: prob - market_price
            - trade: Boolean trade signal
            - direction: 'YES', 'NO', or None
        """
        results = self.predict_batch(df)

        df = df.copy()
        df['model_prob'] = [r.probability for r in results]
        df['edge'] = [r.edge for r in results]
        df['trade'] = [r.trade for r in results]
        df['direction'] = [r.direction for r in results]
        df['expected_pnl'] = [r.expected_pnl for r in results]

        return df

    def summary(self):
        """Print summary of loaded models and policies."""
        print("\n" + "=" * 60)
        print("HORIZON ROUTER SUMMARY")
        print("=" * 60)

        print(f"\n  Models directory: {self.models_dir}")
        print(f"  Loaded models: {list(self.models.keys())}")

        for horizon, model in self.models.items():
            print(f"\n  {horizon}:")
            print(f"    Threshold: {model.threshold:.2f}")
            if model.policy:
                print(f"    Policy risk-adj: {model.policy.get('risk_adj_score', 'N/A')}")
                print(f"    Policy trades: {model.policy.get('n_trades', 'N/A')}")
            if model.calibration:
                print(f"    ECE: {model.calibration.get('ece', 'N/A'):.4f}")


def main():
    """Demo usage."""
    import argparse

    parser = argparse.ArgumentParser(description="Kalshi Inference Demo")
    parser.add_argument("--models-dir", type=Path, required=True,
                        help="Directory containing horizon models")
    parser.add_argument("--data", type=Path,
                        help="Optional: JSONL file to make predictions on")

    args = parser.parse_args()

    # Load router
    print("Loading models...")
    router = HorizonRouter(args.models_dir)
    router.summary()

    # Demo predictions
    if args.data:
        print(f"\nMaking predictions on {args.data}...")

        # Load data
        records = []
        with open(args.data) as f:
            for line in f:
                if line.strip():
                    records.append(json.loads(line))
        df = pd.DataFrame(records)

        # Get signals
        df_signals = router.get_trade_signals(df)

        # Summary
        trades = df_signals[df_signals['trade'] == True]
        print(f"\n  Total samples: {len(df_signals)}")
        print(f"  Trade signals: {len(trades)}")

        if len(trades) > 0:
            print(f"  YES trades: {(trades['direction'] == 'YES').sum()}")
            print(f"  NO trades: {(trades['direction'] == 'NO').sum()}")
            print(f"  Avg edge on trades: {trades['edge'].abs().mean():.3f}")

            # By horizon
            print("\n  Trades by horizon:")
            for h in trades['horizon'].unique():
                h_trades = trades[trades['horizon'] == h]
                print(f"    {h}: {len(h_trades)} trades, avg edge {h_trades['edge'].abs().mean():.3f}")


if __name__ == "__main__":
    main()
