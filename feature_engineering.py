#!/usr/bin/env python3
"""
Feature Engineering Module
==========================
Advanced features for Kalshi crypto prediction.

Features:
1. Volatility Regime - vol_1min, vol_5min, vol_ratio, regime
2. Cross-Asset - correlations, divergence, lead/lag
3. Order Flow - pressure, depth ratio, microprice deviation
4. Time-of-Day - hour, market hours, cyclical encoding

All features use ONLY data from BEFORE the sample timestamp (no lookahead).
"""

import numpy as np
from datetime import datetime, timezone, time as dt_time
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Tuple
from collections import deque
import math


# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class PricePoint:
    """Single price observation with timestamp."""
    timestamp: float  # Unix timestamp
    price: float

@dataclass
class VolatilityFeatures:
    """Volatility-based features."""
    vol_1min: float          # 1-minute realized volatility (annualized)
    vol_5min: float          # 5-minute realized volatility (annualized)
    vol_ratio: float         # vol_1min / vol_5min (regime indicator)
    vol_regime: str          # 'low', 'normal', 'high'
    vol_percentile: float    # Current vol vs historical (0-1)

@dataclass
class CrossAssetFeatures:
    """Cross-asset relationship features."""
    btc_eth_corr_5m: float    # 5-minute rolling correlation
    btc_sol_corr_5m: float    # BTC-SOL correlation
    eth_sol_corr_5m: float    # ETH-SOL correlation
    asset_vs_btc_ret: float   # This asset's return vs BTC return (divergence)
    btc_leads: bool           # Did BTC move first in last 30s?
    correlation_regime: str   # 'high_corr', 'normal', 'divergent'

@dataclass
class OrderFlowFeatures:
    """Order book microstructure features."""
    imbalance_top: float       # Top of book imbalance [-1, 1]
    imbalance_5bps: float      # Imbalance within 5bps of mid
    imbalance_10bps: float     # Imbalance within 10bps of mid
    depth_ratio: float         # bid_depth / ask_depth
    microprice_dev: float      # (microprice - mid) / spread
    spread_bps: float          # Current spread in basis points
    book_pressure: float       # Rate of change in imbalance (last 5s)
    depth_imbalance_momentum: float  # Change in depth ratio over 10s

@dataclass
class TimeFeatures:
    """Time-based features."""
    hour_utc: int              # 0-23
    minute_of_hour: int        # 0-59
    day_of_week: int           # 0=Monday, 6=Sunday
    is_weekend: bool
    is_us_market_hours: bool   # 9:30-16:00 ET
    is_asia_hours: bool        # 00:00-08:00 UTC (roughly)
    is_europe_hours: bool      # 07:00-16:00 UTC (roughly)
    time_sin: float            # sin(2*pi*hour/24)
    time_cos: float            # cos(2*pi*hour/24)
    minutes_since_midnight: int


# ============================================================================
# PRICE HISTORY BUFFER
# ============================================================================

class PriceHistoryBuffer:
    """
    Maintains rolling price history for multiple assets.
    Used for volatility and cross-asset calculations.
    """

    def __init__(self, max_seconds: int = 600):
        """
        Args:
            max_seconds: Maximum history to keep (default 10 minutes)
        """
        self.max_seconds = max_seconds
        self.histories: Dict[str, deque] = {}

    def add_price(self, asset: str, timestamp: float, price: float):
        """Add a price observation."""
        if asset not in self.histories:
            self.histories[asset] = deque()

        self.histories[asset].append(PricePoint(timestamp, price))
        self._cleanup(asset, timestamp)

    def _cleanup(self, asset: str, current_ts: float):
        """Remove old observations."""
        cutoff = current_ts - self.max_seconds
        while self.histories[asset] and self.histories[asset][0].timestamp < cutoff:
            self.histories[asset].popleft()

    def get_prices(self, asset: str, last_n_seconds: float,
                   as_of: float = None) -> List[PricePoint]:
        """Get price history for last N seconds."""
        if asset not in self.histories:
            return []

        as_of = as_of or datetime.now(timezone.utc).timestamp()
        cutoff = as_of - last_n_seconds

        return [p for p in self.histories[asset]
                if cutoff <= p.timestamp <= as_of]

    def get_returns(self, asset: str, last_n_seconds: float,
                    as_of: float = None) -> np.ndarray:
        """Get log returns for last N seconds."""
        prices = self.get_prices(asset, last_n_seconds, as_of)
        if len(prices) < 2:
            return np.array([])

        price_values = np.array([p.price for p in prices])
        return np.diff(np.log(price_values))


# ============================================================================
# IMBALANCE HISTORY BUFFER
# ============================================================================

class ImbalanceHistoryBuffer:
    """Tracks order book imbalance over time for momentum features."""

    def __init__(self, max_seconds: int = 60):
        self.max_seconds = max_seconds
        self.histories: Dict[str, deque] = {}  # asset -> [(timestamp, imbalance)]

    def add_imbalance(self, asset: str, timestamp: float, imbalance: float):
        if asset not in self.histories:
            self.histories[asset] = deque()

        self.histories[asset].append((timestamp, imbalance))

        # Cleanup old
        cutoff = timestamp - self.max_seconds
        while self.histories[asset] and self.histories[asset][0][0] < cutoff:
            self.histories[asset].popleft()

    def get_pressure(self, asset: str, lookback_seconds: float = 5.0,
                     as_of: float = None) -> float:
        """
        Calculate rate of change in imbalance (book pressure).
        Positive = buying pressure increasing
        Negative = selling pressure increasing
        """
        if asset not in self.histories or len(self.histories[asset]) < 2:
            return 0.0

        as_of = as_of or datetime.now(timezone.utc).timestamp()
        cutoff = as_of - lookback_seconds

        recent = [(ts, imb) for ts, imb in self.histories[asset]
                  if cutoff <= ts <= as_of]

        if len(recent) < 2:
            return 0.0

        # Linear regression slope
        times = np.array([r[0] - recent[0][0] for r in recent])
        imbalances = np.array([r[1] for r in recent])

        if times[-1] - times[0] < 0.1:  # Less than 0.1 second span
            return 0.0

        # Simple slope: (last - first) / time_span
        slope = (imbalances[-1] - imbalances[0]) / (times[-1] - times[0] + 1e-6)
        return float(np.clip(slope, -1, 1))


# ============================================================================
# VOLATILITY FEATURES
# ============================================================================

def compute_volatility_features(
    price_history: PriceHistoryBuffer,
    asset: str,
    as_of: float = None,
    vol_percentiles: Dict[str, Tuple[float, float]] = None
) -> VolatilityFeatures:
    """
    Compute volatility-based features.

    Args:
        price_history: Buffer with price history
        asset: Asset symbol (BTC, ETH, SOL)
        as_of: Timestamp to compute as of (for avoiding lookahead)
        vol_percentiles: Dict of asset -> (low_threshold, high_threshold)
                         for regime classification

    Returns:
        VolatilityFeatures dataclass
    """
    as_of = as_of or datetime.now(timezone.utc).timestamp()

    # Default percentile thresholds (annualized vol)
    if vol_percentiles is None:
        vol_percentiles = {
            'BTC': (0.3, 0.8),   # 30-80% annualized
            'ETH': (0.4, 1.0),   # 40-100% annualized
            'SOL': (0.5, 1.2),   # 50-120% annualized
        }

    # Get returns
    returns_1min = price_history.get_returns(asset, 60, as_of)
    returns_5min = price_history.get_returns(asset, 300, as_of)

    # Calculate realized volatility (annualized)
    # Assuming ~1 sample per second, 525600 minutes per year
    if len(returns_1min) >= 2:
        vol_1min = float(np.std(returns_1min) * np.sqrt(525600 * 60))
    else:
        vol_1min = 0.5  # Default

    if len(returns_5min) >= 2:
        vol_5min = float(np.std(returns_5min) * np.sqrt(525600 * 12))
    else:
        vol_5min = vol_1min

    # Volatility ratio (regime indicator)
    vol_ratio = vol_1min / (vol_5min + 1e-6)

    # Classify regime
    low_thresh, high_thresh = vol_percentiles.get(asset, (0.3, 0.8))
    if vol_5min < low_thresh:
        vol_regime = 'low'
    elif vol_5min > high_thresh:
        vol_regime = 'high'
    else:
        vol_regime = 'normal'

    # Percentile (simplified - just normalize to expected range)
    vol_percentile = np.clip((vol_5min - low_thresh) / (high_thresh - low_thresh + 1e-6), 0, 1)

    return VolatilityFeatures(
        vol_1min=vol_1min,
        vol_5min=vol_5min,
        vol_ratio=vol_ratio,
        vol_regime=vol_regime,
        vol_percentile=vol_percentile
    )


# ============================================================================
# CROSS-ASSET FEATURES
# ============================================================================

def compute_cross_asset_features(
    price_history: PriceHistoryBuffer,
    asset: str,
    as_of: float = None
) -> CrossAssetFeatures:
    """
    Compute cross-asset relationship features.

    Args:
        price_history: Buffer with price history for all assets
        asset: Current asset being predicted
        as_of: Timestamp to compute as of

    Returns:
        CrossAssetFeatures dataclass
    """
    as_of = as_of or datetime.now(timezone.utc).timestamp()

    # Get 5-minute returns for correlation
    btc_ret = price_history.get_returns('BTC', 300, as_of)
    eth_ret = price_history.get_returns('ETH', 300, as_of)
    sol_ret = price_history.get_returns('SOL', 300, as_of)

    # Compute correlations (need aligned data)
    min_len = min(len(btc_ret), len(eth_ret), len(sol_ret))

    if min_len >= 10:
        btc_ret = btc_ret[-min_len:]
        eth_ret = eth_ret[-min_len:]
        sol_ret = sol_ret[-min_len:]

        btc_eth_corr = float(np.corrcoef(btc_ret, eth_ret)[0, 1])
        btc_sol_corr = float(np.corrcoef(btc_ret, sol_ret)[0, 1])
        eth_sol_corr = float(np.corrcoef(eth_ret, sol_ret)[0, 1])
    else:
        btc_eth_corr = 0.8  # Default high correlation
        btc_sol_corr = 0.7
        eth_sol_corr = 0.7

    # Handle NaN correlations
    btc_eth_corr = 0.0 if np.isnan(btc_eth_corr) else btc_eth_corr
    btc_sol_corr = 0.0 if np.isnan(btc_sol_corr) else btc_sol_corr
    eth_sol_corr = 0.0 if np.isnan(eth_sol_corr) else eth_sol_corr

    # Asset vs BTC divergence (last 30 seconds)
    asset_ret_30s = price_history.get_returns(asset, 30, as_of)
    btc_ret_30s = price_history.get_returns('BTC', 30, as_of)

    if len(asset_ret_30s) > 0 and len(btc_ret_30s) > 0:
        asset_total_ret = np.sum(asset_ret_30s)
        btc_total_ret = np.sum(btc_ret_30s)
        asset_vs_btc_ret = asset_total_ret - btc_total_ret
    else:
        asset_vs_btc_ret = 0.0

    # Did BTC move first? (check if BTC had larger move in first 10s of last 30s)
    btc_ret_first_10s = price_history.get_returns('BTC', 10, as_of - 20)
    btc_ret_last_10s = price_history.get_returns('BTC', 10, as_of)

    btc_leads = (abs(np.sum(btc_ret_first_10s)) > abs(np.sum(btc_ret_last_10s))
                 if len(btc_ret_first_10s) > 0 and len(btc_ret_last_10s) > 0
                 else False)

    # Correlation regime
    avg_corr = (btc_eth_corr + btc_sol_corr + eth_sol_corr) / 3
    if avg_corr > 0.7:
        correlation_regime = 'high_corr'
    elif avg_corr < 0.3:
        correlation_regime = 'divergent'
    else:
        correlation_regime = 'normal'

    return CrossAssetFeatures(
        btc_eth_corr_5m=btc_eth_corr,
        btc_sol_corr_5m=btc_sol_corr,
        eth_sol_corr_5m=eth_sol_corr,
        asset_vs_btc_ret=asset_vs_btc_ret,
        btc_leads=btc_leads,
        correlation_regime=correlation_regime
    )


# ============================================================================
# ORDER FLOW FEATURES
# ============================================================================

def compute_order_flow_features(
    book,  # Level2OrderBook from coinbase_price_source
    imbalance_history: ImbalanceHistoryBuffer,
    asset: str,
    as_of: float = None
) -> OrderFlowFeatures:
    """
    Compute order book microstructure features.

    Args:
        book: Level2OrderBook instance
        imbalance_history: Buffer tracking imbalance over time
        asset: Asset symbol
        as_of: Timestamp to compute as of

    Returns:
        OrderFlowFeatures dataclass
    """
    as_of = as_of or datetime.now(timezone.utc).timestamp()

    # Basic imbalances
    imbalance_top = book.get_top_imbalance() if hasattr(book, 'get_top_imbalance') else 0.0
    imbalance_5bps = book.get_imbalance_at_band(5) if hasattr(book, 'get_imbalance_at_band') else 0.0
    imbalance_10bps = book.get_imbalance_at_band(10) if hasattr(book, 'get_imbalance_at_band') else 0.0

    # Depth ratio
    bid_depth_10bps, ask_depth_10bps = (0.0, 0.0)
    if hasattr(book, 'get_depth_at_band'):
        bid_depth_10bps, ask_depth_10bps = book.get_depth_at_band(10)
    depth_ratio = bid_depth_10bps / (ask_depth_10bps + 1e-6)

    # Microprice deviation
    mid = book.get_mid() if hasattr(book, 'get_mid') else None
    microprice = book.get_microprice() if hasattr(book, 'get_microprice') else mid
    spread = book.get_spread() if hasattr(book, 'get_spread') else 0.0

    if mid and microprice and spread and spread > 0:
        microprice_dev = (microprice - mid) / spread
    else:
        microprice_dev = 0.0

    # Spread in bps
    spread_bps = book.get_spread_bps() if hasattr(book, 'get_spread_bps') else 0.0

    # Book pressure (rate of change in imbalance)
    # Record current imbalance for history
    imbalance_history.add_imbalance(asset, as_of, imbalance_top)
    book_pressure = imbalance_history.get_pressure(asset, 5.0, as_of)

    # Depth imbalance momentum (10 second lookback)
    # This is simplified - in production you'd track depth_ratio history
    depth_imbalance_momentum = 0.0  # Would need historical tracking

    return OrderFlowFeatures(
        imbalance_top=imbalance_top,
        imbalance_5bps=imbalance_5bps,
        imbalance_10bps=imbalance_10bps,
        depth_ratio=np.clip(depth_ratio, 0.1, 10.0),
        microprice_dev=np.clip(microprice_dev, -2.0, 2.0),
        spread_bps=spread_bps or 0.0,
        book_pressure=book_pressure,
        depth_imbalance_momentum=depth_imbalance_momentum
    )


# ============================================================================
# TIME FEATURES
# ============================================================================

def compute_time_features(timestamp: datetime = None) -> TimeFeatures:
    """
    Compute time-based features.

    Args:
        timestamp: Datetime to compute features for (default: now)

    Returns:
        TimeFeatures dataclass
    """
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)

    # Ensure timezone aware
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)

    hour_utc = timestamp.hour
    minute_of_hour = timestamp.minute
    day_of_week = timestamp.weekday()
    is_weekend = day_of_week >= 5

    # US market hours: 9:30-16:00 ET (14:30-21:00 UTC, roughly)
    # Simplified: 13:30-21:00 UTC for EST, 14:30-21:00 for EDT
    is_us_market_hours = 13 <= hour_utc < 21

    # Asia hours: roughly 00:00-08:00 UTC
    is_asia_hours = 0 <= hour_utc < 8

    # Europe hours: roughly 07:00-16:00 UTC
    is_europe_hours = 7 <= hour_utc < 16

    # Cyclical encoding
    time_sin = math.sin(2 * math.pi * hour_utc / 24)
    time_cos = math.cos(2 * math.pi * hour_utc / 24)

    minutes_since_midnight = hour_utc * 60 + minute_of_hour

    return TimeFeatures(
        hour_utc=hour_utc,
        minute_of_hour=minute_of_hour,
        day_of_week=day_of_week,
        is_weekend=is_weekend,
        is_us_market_hours=is_us_market_hours,
        is_asia_hours=is_asia_hours,
        is_europe_hours=is_europe_hours,
        time_sin=time_sin,
        time_cos=time_cos,
        minutes_since_midnight=minutes_since_midnight
    )


# ============================================================================
# COMBINED FEATURE BUILDER
# ============================================================================

class FeatureBuilder:
    """
    Centralized feature computation.
    Maintains all necessary buffers and computes all features.
    """

    def __init__(self):
        self.price_history = PriceHistoryBuffer(max_seconds=600)
        self.imbalance_history = ImbalanceHistoryBuffer(max_seconds=60)

    def update_price(self, asset: str, timestamp: float, price: float):
        """Record a price observation."""
        self.price_history.add_price(asset, timestamp, price)

    def compute_all_features(
        self,
        asset: str,
        book,  # Level2OrderBook
        timestamp: datetime = None
    ) -> Dict:
        """
        Compute all features for a prediction.

        Returns dict that can be merged into MarketSnapshot fields.
        """
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)

        ts_float = timestamp.timestamp()

        # Compute each feature group
        vol_features = compute_volatility_features(
            self.price_history, asset, ts_float
        )

        cross_features = compute_cross_asset_features(
            self.price_history, asset, ts_float
        )

        flow_features = compute_order_flow_features(
            book, self.imbalance_history, asset, ts_float
        )

        time_features = compute_time_features(timestamp)

        # Flatten to dict
        return {
            # Volatility
            'vol_1min': vol_features.vol_1min,
            'vol_5min': vol_features.vol_5min,
            'vol_ratio': vol_features.vol_ratio,
            'vol_regime': vol_features.vol_regime,
            'vol_percentile': vol_features.vol_percentile,

            # Cross-asset
            'btc_eth_corr': cross_features.btc_eth_corr_5m,
            'btc_sol_corr': cross_features.btc_sol_corr_5m,
            'eth_sol_corr': cross_features.eth_sol_corr_5m,
            'asset_vs_btc_ret': cross_features.asset_vs_btc_ret,
            'btc_leads': cross_features.btc_leads,
            'correlation_regime': cross_features.correlation_regime,

            # Order flow
            'imbalance_top': flow_features.imbalance_top,
            'imbalance_5bps': flow_features.imbalance_5bps,
            'imbalance_10bps': flow_features.imbalance_10bps,
            'depth_ratio': flow_features.depth_ratio,
            'microprice_dev': flow_features.microprice_dev,
            'spread_bps': flow_features.spread_bps,
            'book_pressure': flow_features.book_pressure,

            # Time
            'hour_utc': time_features.hour_utc,
            'minute_of_hour': time_features.minute_of_hour,
            'day_of_week': time_features.day_of_week,
            'is_weekend': time_features.is_weekend,
            'is_us_market_hours': time_features.is_us_market_hours,
            'is_asia_hours': time_features.is_asia_hours,
            'is_europe_hours': time_features.is_europe_hours,
            'time_sin': time_features.time_sin,
            'time_cos': time_features.time_cos,
        }


# ============================================================================
# TESTS
# ============================================================================

def test_volatility_features():
    """Test volatility feature computation."""
    buffer = PriceHistoryBuffer()

    # Add some price data
    base_time = datetime.now(timezone.utc).timestamp()
    for i in range(100):
        # Simulate random walk
        price = 100000 + np.random.randn() * 100
        buffer.add_price('BTC', base_time - 100 + i, price)

    features = compute_volatility_features(buffer, 'BTC', base_time)

    assert features.vol_1min > 0, "vol_1min should be positive"
    assert features.vol_5min > 0, "vol_5min should be positive"
    assert features.vol_regime in ('low', 'normal', 'high'), "Invalid regime"
    assert 0 <= features.vol_percentile <= 1, "Percentile out of range"

    print("✓ Volatility features test passed")
    return features


def test_time_features():
    """Test time feature computation."""
    # Test with known time
    test_time = datetime(2024, 1, 15, 15, 30, 0, tzinfo=timezone.utc)  # Monday 3:30 PM UTC
    features = compute_time_features(test_time)

    assert features.hour_utc == 15
    assert features.minute_of_hour == 30
    assert features.day_of_week == 0  # Monday
    assert not features.is_weekend
    assert features.is_us_market_hours  # 15:30 UTC is during US hours
    assert features.is_europe_hours
    assert not features.is_asia_hours

    print("✓ Time features test passed")
    return features


def test_cross_asset_features():
    """Test cross-asset feature computation."""
    buffer = PriceHistoryBuffer()

    base_time = datetime.now(timezone.utc).timestamp()

    # Add correlated price data
    for i in range(100):
        t = base_time - 100 + i
        btc = 100000 + i * 10 + np.random.randn() * 50
        eth = 3000 + i * 0.3 + np.random.randn() * 5
        sol = 100 + i * 0.01 + np.random.randn() * 1

        buffer.add_price('BTC', t, btc)
        buffer.add_price('ETH', t, eth)
        buffer.add_price('SOL', t, sol)

    features = compute_cross_asset_features(buffer, 'ETH', base_time)

    assert -1 <= features.btc_eth_corr_5m <= 1, "Correlation out of range"
    assert features.correlation_regime in ('high_corr', 'normal', 'divergent')

    print("✓ Cross-asset features test passed")
    return features


def test_feature_builder():
    """Test the combined feature builder."""
    builder = FeatureBuilder()

    # Mock order book
    class MockBook:
        def get_top_imbalance(self): return 0.2
        def get_imbalance_at_band(self, bps): return 0.15
        def get_depth_at_band(self, bps): return (100.0, 80.0)
        def get_mid(self): return 100000
        def get_microprice(self): return 100005
        def get_spread(self): return 10
        def get_spread_bps(self): return 1.0

    # Add some price history
    base_time = datetime.now(timezone.utc)
    for i in range(100):
        t = base_time.timestamp() - 100 + i
        builder.update_price('BTC', t, 100000 + np.random.randn() * 100)
        builder.update_price('ETH', t, 3000 + np.random.randn() * 10)
        builder.update_price('SOL', t, 100 + np.random.randn() * 1)

    features = builder.compute_all_features('BTC', MockBook(), base_time)

    # Check all expected keys
    expected_keys = [
        'vol_1min', 'vol_5min', 'vol_ratio', 'vol_regime',
        'btc_eth_corr', 'asset_vs_btc_ret',
        'imbalance_top', 'depth_ratio', 'microprice_dev',
        'hour_utc', 'is_us_market_hours', 'time_sin'
    ]

    for key in expected_keys:
        assert key in features, f"Missing feature: {key}"

    print("✓ Feature builder test passed")
    print(f"  Generated {len(features)} features")
    return features


if __name__ == "__main__":
    print("Running feature engineering tests...\n")

    test_volatility_features()
    test_time_features()
    test_cross_asset_features()
    test_feature_builder()

    print("\n✓ All tests passed!")
