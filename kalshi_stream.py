#!/usr/bin/env python3
"""
Kalshi Crypto Market Streamer
=============================
Streams BTC/ETH/SOL contract data with signal analysis.
Logs data for ML training.

Usage:
    python kalshi_stream.py                     # Stream all assets (Binance)
    python kalshi_stream.py --coinbase         # Use Coinbase (CF constituent)
    python kalshi_stream.py --assets BTC ETH   # Specific assets
    python kalshi_stream.py --interval 30      # Check every 30 sec
    python kalshi_stream.py --json             # JSON output for piping
    python kalshi_stream.py --log data.jsonl   # Log to file for training
"""

import argparse
import asyncio
import aiohttp
import numpy as np
from scipy.stats import norm
from datetime import datetime, timezone, timedelta

# EST timezone (UTC-5)
EST = timezone(timedelta(hours=-5))
from dataclasses import dataclass, asdict, field
from typing import Optional, Literal
import json
import sys
from collections import deque
import statistics
import time

# Coinbase feed (CF Benchmarks constituent)
try:
    from coinbase_price_source import CoinbaseFeed
    COINBASE_AVAILABLE = True
except ImportError:
    COINBASE_AVAILABLE = False

# Feature engineering
try:
    from feature_engineering import FeatureBuilder
    FEATURES_AVAILABLE = True
except ImportError:
    FEATURES_AVAILABLE = False
    FeatureBuilder = None

# Global feature builder instance
_feature_builder = None

# Fixed horizons for dataset building (minutes before expiry)
FIXED_HORIZONS = [60, 30, 15]
HORIZON_TOLERANCE = 0.5  # ±30 seconds window (in minutes)
GOOD_ENOUGH_OFFSET_SEC = 5.0  # Finalize immediately if offset <= this

# Horizons that use best-candidate selection (others use immediate logging)
# T-60 has systematic late-bias, so we use best-candidate there
# T-15/T-30 are already near-deterministic, so immediate logging is fine
BEST_CANDIDATE_HORIZONS = {60}  # Only T-60 uses best-candidate selection

# T-60 tolerance settings (wider to prevent sample count collapse)
T60_TOLERANCE_SEC = 45.0  # Wider window for T-60 (default HORIZON_TOLERANCE * 60 = 30s)
T60_FALLBACK_ENABLED = True  # If no good candidate, use first-in-window with fallback flag

# Best-candidate tracking for deterministic "closest to target" selection
# Key: (ticker, horizon) -> {'snapshot': MarketSnapshot, 'offset_sec': float, 'target_ts': datetime, 'is_fallback': bool}
_pending_candidates: dict[tuple[str, int], dict] = {}

# Track finalized (already logged) horizons
# Key: (ticker, horizon) -> bool
_logged_horizons: dict[tuple[str, int], bool] = {}

# ============================================================================
# CONFIG
# ============================================================================

KALSHI_API_KEY = "bd1735b6-5c51-4043-a1df-4172a5eb8580"
KALSHI_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2"
BINANCE_API_KEY = "5IGwdyQ1fponh90OOIjsUmV7IfydXH7gMyrHNEBzQpXAAO53FHbCUF6ytMUxBjiF"
BINANCE_BASE_URL = "https://api.binance.us/api/v3"
BINANCE_WS_URL = "wss://stream.binance.us:9443/ws"

ASSETS = {
    "BTC": {"binance_symbol": "BTCUSDT", "kalshi_prefix": "KXBTC"},
    "ETH": {"binance_symbol": "ETHUSDT", "kalshi_prefix": "KXETH"},
    "SOL": {"binance_symbol": "SOLUSDT", "kalshi_prefix": "KXSOL"},
}

VOL_LOOKBACK_MINUTES = 60
PRICE_BUFFER_SIZE = 120

# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class SettlementBuffer:
    """Track per-second mids for 60-second settlement proxy.

    IMPORTANT: This buffer is strictly BACKWARD-LOOKING.
    All data in the buffer is from timestamps <= current time.
    """
    mids: deque = field(default_factory=lambda: deque(maxlen=60))
    timestamps: deque = field(default_factory=lambda: deque(maxlen=60))

    def add(self, mid: float, ts: float):
        """Add a mid price observation."""
        self.mids.append(mid)
        self.timestamps.append(ts)

    def get_avg60(self) -> Optional[float]:
        """Get 60-second average (settlement proxy)."""
        if len(self.mids) < 30:  # Require at least 30 seconds
            return None
        return statistics.mean(self.mids)

    def get_max_source_ts(self) -> Optional[float]:
        """Get the most recent timestamp used in the buffer (for leak auditing)."""
        if len(self.timestamps) == 0:
            return None
        return max(self.timestamps)

    def get_min_source_ts(self) -> Optional[float]:
        """Get the oldest timestamp in the buffer."""
        if len(self.timestamps) == 0:
            return None
        return min(self.timestamps)

    def get_settlement_proxy(self, strike: float) -> Optional[int]:
        """Get settlement proxy: 1 if avg60 > strike, 0 otherwise."""
        avg = self.get_avg60()
        if avg is None:
            return None
        return 1 if avg > strike else 0

# Global settlement buffers per asset
_settlement_buffers: dict[str, SettlementBuffer] = {}

@dataclass
class MarketSnapshot:
    asset: str
    ticker: str
    title: str
    spot_price: float
    strike: float
    yes_price: float
    no_price: float
    yes_bid: float
    yes_ask: float
    spread: float
    p_model: float
    edge: float
    logit_edge: float
    signal: Literal["UP", "DOWN", "HOLD"]
    vol_annual: float
    mins_to_expiry: float
    orderbook_imbalance: float
    timestamp: str
    # Extra fields for training
    volume_24h: int = 0
    open_interest: int = 0
    liquidity: float = 0.0
    last_price: float = 0.0
    close_time: str = ""
    # Horizon-specific fields
    horizon: Optional[str] = None          # "T-60", "T-30", "T-15"
    horizon_mins: Optional[int] = None     # 60, 30, 15
    settlement_proxy: Optional[int] = None # 1 if avg60 > strike, 0 otherwise
    avg60_mid: Optional[float] = None      # 60-second average mid price
    # Audit fields for leak detection
    sample_ts_utc: Optional[str] = None      # When this sample was taken
    target_ts_utc: Optional[str] = None      # When the horizon target was (close_time - horizon)
    max_source_ts_utc: Optional[str] = None  # Latest data timestamp used (must be <= sample_ts)
    min_source_ts_utc: Optional[str] = None  # Oldest data timestamp used (for buffer age check)
    chosen_offset_sec: Optional[float] = None  # Final offset for best-candidate selection (T-60)
    is_fallback: bool = False  # True if this was a fallback sample (no good candidate found)
    # Advanced features (Phase 2)
    # Volatility features
    vol_1min: Optional[float] = None
    vol_5min: Optional[float] = None
    vol_ratio: Optional[float] = None
    vol_regime: Optional[str] = None
    vol_percentile: Optional[float] = None
    # Cross-asset features
    btc_eth_corr: Optional[float] = None
    btc_sol_corr: Optional[float] = None
    eth_sol_corr: Optional[float] = None
    asset_vs_btc_ret: Optional[float] = None
    btc_leads: Optional[bool] = None
    correlation_regime: Optional[str] = None
    # Order flow features
    imbalance_top: Optional[float] = None
    imbalance_5bps: Optional[float] = None
    imbalance_10bps: Optional[float] = None
    depth_ratio: Optional[float] = None
    microprice_dev: Optional[float] = None
    spread_bps: Optional[float] = None
    book_pressure: Optional[float] = None
    # Time features
    hour_utc: Optional[int] = None
    minute_of_hour: Optional[int] = None
    day_of_week: Optional[int] = None
    is_weekend: Optional[bool] = None
    is_us_market_hours: Optional[bool] = None
    is_asia_hours: Optional[bool] = None
    is_europe_hours: Optional[bool] = None
    time_sin: Optional[float] = None
    time_cos: Optional[float] = None

# ============================================================================
# MATH
# ============================================================================

def logit(p: float) -> float:
    p = np.clip(p, 0.001, 0.999)
    return np.log(p / (1 - p))

def calc_volatility(prices: list[float]) -> float:
    if len(prices) < 2:
        return 0.5
    returns = np.diff(np.log(prices))
    vol_1min = np.std(returns)
    return max(vol_1min * np.sqrt(525600), 0.01)

def spot_implied_prob(price: float, strike: float, mins: float, vol: float) -> float:
    if mins <= 0:
        return 1.0 if price > strike else 0.0
    T = mins / 525600
    if vol * np.sqrt(T) < 1e-10:
        return 1.0 if price > strike else 0.0
    d2 = (np.log(price / strike) - 0.5 * vol**2 * T) / (vol * np.sqrt(T))
    return float(norm.cdf(d2))

def calc_edge(spot: float, strike: float, p_market: float, vol: float, mins: float):
    p_model = spot_implied_prob(spot, strike, mins, vol)
    raw_edge = p_model - p_market
    logit_edge = logit(p_model) - logit(p_market)
    return raw_edge, logit_edge, p_model

def calc_imbalance(yes_orders: list, no_orders: list) -> float:
    """Calculate orderbook imbalance from [price, qty] pairs"""
    yes_sz = sum(order[1] for order in (yes_orders or [])[:5]) if yes_orders else 0
    no_sz = sum(order[1] for order in (no_orders or [])[:5]) if no_orders else 0
    total = yes_sz + no_sz
    return (yes_sz - no_sz) / total if total > 0 else 0.0

# ============================================================================
# KALSHI CLIENT (API KEY AUTH)
# ============================================================================

class KalshiStream:
    def __init__(self, api_key: str = KALSHI_API_KEY):
        self.api_key = api_key
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, *args):
        if self.session:
            await self.session.close()

    @property
    def headers(self):
        return {"Authorization": f"Bearer {self.api_key}"}

    async def get_events(self, series_ticker: str) -> list[dict]:
        """Get events for a series (e.g., KXBTC)"""
        url = f"{KALSHI_BASE_URL}/events"
        params = {"status": "open", "series_ticker": series_ticker, "limit": 10}

        try:
            async with self.session.get(url, headers=self.headers, params=params) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                return data.get("events", [])
        except Exception:
            return []

    async def get_event_markets(self, event_ticker: str) -> list[dict]:
        """Get all markets for a specific event"""
        url = f"{KALSHI_BASE_URL}/events/{event_ticker}"

        try:
            async with self.session.get(url, headers=self.headers) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                return data.get("markets", [])
        except Exception:
            return []

    async def get_markets(self, prefix: str) -> list[dict]:
        """Get markets by first fetching events, then getting their markets"""
        events = await self.get_events(prefix)
        if not events:
            return []

        # Get nearest event (sorted by strike_date)
        now = datetime.now(timezone.utc)
        valid_events = []
        for e in events:
            try:
                strike = datetime.fromisoformat(e["strike_date"].replace("Z", "+00:00"))
                if strike > now:
                    valid_events.append((e, strike))
            except:
                pass

        if not valid_events:
            return []

        valid_events.sort(key=lambda x: x[1])
        nearest_event = valid_events[0][0]

        return await self.get_event_markets(nearest_event["event_ticker"])

    async def get_orderbook(self, ticker: str) -> dict:
        url = f"{KALSHI_BASE_URL}/markets/{ticker}/orderbook"

        try:
            async with self.session.get(url, headers=self.headers) as resp:
                if resp.status != 200:
                    return {"yes": [], "no": []}
                data = await resp.json()
                return data.get("orderbook", {"yes": [], "no": []})
        except:
            return {"yes": [], "no": []}

    def parse_strike(self, market: dict) -> Optional[float]:
        """Extract strike price from market data"""
        # Try cap_strike first (from API)
        if "cap_strike" in market:
            return float(market["cap_strike"])
        # Try floor_strike
        if "floor_strike" in market:
            return float(market["floor_strike"])
        # Fallback: parse from ticker (e.g., KXBTC-26JAN2517-T79750)
        import re
        ticker = market.get("ticker", "")
        match = re.search(r'-T(\d+(?:\.\d+)?)$', ticker)
        if match:
            return float(match.group(1))
        return None

# ============================================================================
# BINANCE FEED (WebSocket + REST)
# ============================================================================

class BinanceFeed:
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self.prices: dict[str, deque] = {a: deque(maxlen=PRICE_BUFFER_SIZE) for a in ASSETS}
        self.current_prices: dict[str, float] = {}
        self.ws_task: Optional[asyncio.Task] = None
        self.running = False

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        self.running = True
        await self._connect_websocket()
        return self

    async def __aexit__(self, *args):
        self.running = False
        if self.ws_task:
            self.ws_task.cancel()
            try:
                await self.ws_task
            except asyncio.CancelledError:
                pass
        if self.ws and not self.ws.closed:
            await self.ws.close()
        if self.session:
            await self.session.close()

    async def _connect_websocket(self):
        """Connect to Binance.US combined stream for all assets"""
        streams = "/".join(f"{ASSETS[a]['binance_symbol'].lower()}@trade" for a in ASSETS)
        ws_url = f"{BINANCE_WS_URL}/{streams}"

        try:
            self.ws = await self.session.ws_connect(ws_url)
            self.ws_task = asyncio.create_task(self._ws_listener())
        except Exception as e:
            print(f"WebSocket connection failed: {e}, falling back to REST")

    async def _ws_listener(self):
        """Listen for websocket price updates"""
        while self.running and self.ws and not self.ws.closed:
            try:
                msg = await asyncio.wait_for(self.ws.receive(), timeout=30)
                if msg.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    symbol = data.get("s", "")
                    price = float(data.get("p", 0))

                    for asset, info in ASSETS.items():
                        if info["binance_symbol"] == symbol:
                            self.current_prices[asset] = price
                            self.prices[asset].append(price)
                            break
                elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    break
            except asyncio.TimeoutError:
                # Send ping to keep alive
                if self.ws and not self.ws.closed:
                    await self.ws.ping()
            except Exception:
                break

        # Attempt reconnect if still running
        if self.running:
            await asyncio.sleep(1)
            await self._connect_websocket()

    async def get_price(self, asset: str) -> float:
        """Get current price - prefer websocket, fallback to REST"""
        if asset in self.current_prices:
            return self.current_prices[asset]

        # REST fallback
        symbol = ASSETS[asset]["binance_symbol"]
        url = f"{BINANCE_BASE_URL}/ticker/price"
        headers = {"X-MBX-APIKEY": BINANCE_API_KEY}

        async with self.session.get(url, params={"symbol": symbol}, headers=headers) as resp:
            data = await resp.json()
            price = float(data["price"])
            self.current_prices[asset] = price
            self.prices[asset].append(price)
            return price

    async def bootstrap(self, asset: str):
        """Load historical prices for volatility calculation"""
        symbol = ASSETS[asset]["binance_symbol"]
        url = f"{BINANCE_BASE_URL}/klines"
        params = {"symbol": symbol, "interval": "1m", "limit": VOL_LOOKBACK_MINUTES}
        headers = {"X-MBX-APIKEY": BINANCE_API_KEY}

        async with self.session.get(url, params=params, headers=headers) as resp:
            data = await resp.json()
            if isinstance(data, list):
                self.prices[asset].clear()
                for k in data:
                    close_price = float(k[4])
                    self.prices[asset].append(close_price)
                if self.prices[asset]:
                    self.current_prices[asset] = self.prices[asset][-1]

    def get_vol(self, asset: str) -> float:
        return calc_volatility(list(self.prices[asset]))

# ============================================================================
# STREAMER
# ============================================================================

class MarketStreamer:
    def __init__(self, assets: list[str], interval: int = 60, json_output: bool = False, log_file: str = None, horizons_only: bool = False, horizons: list[int] = None):
        self.assets = assets
        self.interval = interval
        self.json_output = json_output
        self.log_file = log_file
        self.horizons_only = horizons_only
        self.horizons = horizons if horizons else FIXED_HORIZONS
        self.running = False

    def _finalize_candidate(self, key: tuple, snapshots: list, force_fallback: bool = False):
        """Finalize and log a pending horizon candidate.

        This is called when:
        1. Offset is <= GOOD_ENOUGH_OFFSET_SEC (early finalization), or
        2. We've exited the tolerance window (must commit what we have)

        Args:
            key: (ticker, horizon) tuple
            snapshots: List to append the finalized snapshot to
            force_fallback: If True, mark as fallback even if offset looks good
        """
        global _pending_candidates, _logged_horizons

        if key not in _pending_candidates:
            return

        candidate = _pending_candidates.pop(key)
        snapshot = candidate['snapshot']
        offset_sec = candidate['offset_sec']
        is_fallback = candidate.get('is_fallback', False) or force_fallback

        # Record the winning offset for validation
        snapshot.chosen_offset_sec = offset_sec

        # Mark as fallback if offset is poor (>15s) or explicitly marked
        # A "fallback" sample means best-candidate didn't find an ideal candidate
        if is_fallback or offset_sec > 15.0:
            snapshot.is_fallback = True

        # Log to file
        if self.log_file:
            with open(self.log_file, "a") as f:
                record = asdict(snapshot)
                record['log_time'] = datetime.now(timezone.utc).isoformat()
                f.write(json.dumps(record) + '\n')

        # Mark as finalized
        _logged_horizons[key] = True

        if not self.json_output:
            ticker, horizon = key
            fallback_str = " [FALLBACK]" if snapshot.is_fallback else ""
            print(f"  📍 {snapshot.asset} {ticker} @ T-{horizon} FINALIZED "
                  f"(chosen_offset={offset_sec:.1f}s, settlement_proxy={snapshot.settlement_proxy}){fallback_str}")

        snapshots.append(snapshot)

    async def run_with_feed(self, kalshi, price_feed):
        """Run with externally provided feeds"""
        self.running = True

        if not self.json_output:
            print(f"Streaming: {', '.join(self.assets)} | Interval: {self.interval}s")
            print("=" * 80)

        while self.running:
            await self.tick(kalshi, price_feed)
            await asyncio.sleep(self.interval)

    async def run(self):
        """Legacy run method using BinanceFeed"""
        self.running = True

        async with KalshiStream() as kalshi, BinanceFeed() as binance:
            if not self.json_output:
                print("Bootstrapping price data...")

            for asset in self.assets:
                try:
                    await binance.bootstrap(asset)
                except Exception as e:
                    if not self.json_output:
                        print(f"Warning: Could not bootstrap {asset}: {e}")

            if not self.json_output:
                print(f"Streaming: {', '.join(self.assets)} | Interval: {self.interval}s")
                print("=" * 80)

            while self.running:
                await self.tick(kalshi, binance)
                await asyncio.sleep(self.interval)

    async def tick(self, kalshi: KalshiStream, price_feed):
        global _settlement_buffers, _logged_horizons

        now = datetime.now(timezone.utc)
        now_est = now.astimezone(EST)
        snapshots = []

        # Initialize settlement buffers
        for asset in self.assets:
            if asset not in _settlement_buffers:
                _settlement_buffers[asset] = SettlementBuffer()

        for asset in self.assets:
            try:
                # Get current spot price
                spot = await price_feed.get_price(asset)

                # Update settlement buffer (every tick)
                _settlement_buffers[asset].add(spot, time.time())

                # Update feature builder with price (for cross-asset features)
                if _feature_builder is not None:
                    _feature_builder.update_price(asset, now.timestamp(), spot)

                # Get Kalshi markets
                prefix = ASSETS[asset]["kalshi_prefix"]
                markets = await kalshi.get_markets(prefix)

                if not markets:
                    continue

                # Process each market for horizon-based logging
                for market in markets:
                    ticker = market.get("ticker", "")
                    if not ticker:
                        continue

                    # Parse expiry and calculate time to expiry
                    close_str = market.get("close_time", "")
                    try:
                        close_time = datetime.fromisoformat(close_str.replace("Z", "+00:00"))
                    except:
                        continue

                    mins_to_expiry = max((close_time - now).total_seconds() / 60, 0.1)

                    # Skip expired markets
                    if mins_to_expiry < 0:
                        continue

                    # Check each fixed horizon
                    for horizon in self.horizons:
                        key = (ticker, horizon)

                        # Skip if already finalized
                        if _logged_horizons.get(key, False):
                            continue

                        # Calculate target time and offset
                        target_ts = close_time - timedelta(minutes=horizon)
                        offset_sec = (now - target_ts).total_seconds()

                        # Check if in valid window: past target but within tolerance
                        # offset_sec >= 0 means we're at or after target (no lookahead)
                        # offset_sec <= tolerance means we're within the window
                        # T-60 uses wider tolerance to prevent sample count collapse
                        tolerance_sec = T60_TOLERANCE_SEC if horizon in BEST_CANDIDATE_HORIZONS else HORIZON_TOLERANCE * 60
                        in_window = 0 <= offset_sec <= tolerance_sec

                        if not in_window:
                            # Check if we've EXITED the window (finalize pending candidate)
                            if offset_sec > tolerance_sec and key in _pending_candidates:
                                self._finalize_candidate(key, snapshots)
                            continue

                        # Decide: best-candidate (T-60) or immediate logging (T-15/T-30)
                        use_best_candidate = horizon in BEST_CANDIDATE_HORIZONS

                        # Create snapshot
                        snapshot = await self.get_snapshot(asset, kalshi, price_feed, now, now_est)
                        if not snapshot:
                            continue

                        # Add horizon-specific fields
                        snapshot.horizon = f"T-{horizon}"
                        snapshot.horizon_mins = horizon

                        # Add settlement proxy from buffer
                        strike = kalshi.parse_strike(market)
                        if strike and asset in _settlement_buffers:
                            snapshot.settlement_proxy = _settlement_buffers[asset].get_settlement_proxy(strike)
                            snapshot.avg60_mid = _settlement_buffers[asset].get_avg60()

                        # AUDIT FIELDS
                        snapshot.sample_ts_utc = now.isoformat()
                        snapshot.target_ts_utc = target_ts.isoformat()
                        max_ts = _settlement_buffers[asset].get_max_source_ts()
                        min_ts = _settlement_buffers[asset].get_min_source_ts()
                        if max_ts:
                            snapshot.max_source_ts_utc = datetime.fromtimestamp(max_ts, timezone.utc).isoformat()
                        if min_ts:
                            snapshot.min_source_ts_utc = datetime.fromtimestamp(min_ts, timezone.utc).isoformat()

                        if use_best_candidate:
                            # BEST-CANDIDATE SELECTION (for T-60)
                            # Store if better than existing, finalize when good enough
                            existing = _pending_candidates.get(key)
                            if existing is None or offset_sec < existing['offset_sec']:
                                # Mark as NOT fallback if offset is good (<=10s)
                                # Mark as fallback if this is just the first sample we could get
                                is_fallback = existing is None and offset_sec > 10.0
                                _pending_candidates[key] = {
                                    'snapshot': snapshot,
                                    'offset_sec': offset_sec,
                                    'target_ts': target_ts,
                                    'close_time': close_time,
                                    'is_fallback': is_fallback
                                }

                                if not self.json_output:
                                    action = "new best" if existing else "first"
                                    fallback_note = " (fallback)" if is_fallback else ""
                                    print(f"  ⏳ {asset} {ticker} @ T-{horizon} candidate ({action}, offset={offset_sec:.1f}s){fallback_note}")

                            # EARLY FINALIZATION: If offset is "good enough", finalize immediately
                            if offset_sec <= GOOD_ENOUGH_OFFSET_SEC and key in _pending_candidates:
                                self._finalize_candidate(key, snapshots)

                        else:
                            # IMMEDIATE LOGGING (for T-15/T-30)
                            # These horizons don't have late-bias, so log immediately
                            if self.log_file:
                                with open(self.log_file, "a") as f:
                                    record = asdict(snapshot)
                                    record['log_time'] = now.isoformat()
                                    f.write(json.dumps(record) + '\n')

                            _logged_horizons[key] = True

                            if not self.json_output:
                                print(f"  📍 {asset} {ticker} @ T-{horizon} logged (offset={offset_sec:.1f}s)")

                            snapshots.append(snapshot)

                # If not in horizons-only mode, get regular snapshot
                if not self.horizons_only:
                    snapshot = await self.get_snapshot(asset, kalshi, price_feed, now, now_est)
                    if snapshot:
                        snapshots.append(snapshot)

            except Exception as e:
                if not self.json_output:
                    print(f"Error {asset}: {e}")

        # Log regular snapshots to file for training (only in non-horizon mode)
        if self.log_file and snapshots and not self.horizons_only:
            with open(self.log_file, "a") as f:
                for s in snapshots:
                    if s.horizon is None:  # Only log non-horizon snapshots here
                        record = asdict(s)
                        record["log_time"] = now.isoformat()
                        f.write(json.dumps(record) + "\n")

        if self.json_output:
            for s in snapshots:
                print(json.dumps(asdict(s)))
                sys.stdout.flush()
        elif not self.horizons_only:
            self.print_snapshots(snapshots)
    
    async def get_snapshot(
        self, asset: str, kalshi: KalshiStream, price_feed, now: datetime, now_est: datetime
    ) -> Optional[MarketSnapshot]:
        global _feature_builder

        # Initialize feature builder on first use
        if _feature_builder is None and FEATURES_AVAILABLE:
            _feature_builder = FeatureBuilder()

        # Get spot price from feed (Binance or Coinbase)
        spot = await price_feed.get_price(asset)
        vol = price_feed.get_vol(asset)

        # Update feature builder with current price
        if _feature_builder is not None:
            _feature_builder.update_price(asset, now.timestamp(), spot)
        
        # Get Kalshi markets
        prefix = ASSETS[asset]["kalshi_prefix"]
        markets = await kalshi.get_markets(prefix)
        
        if not markets:
            return None
        
        # Find market closest to spot price
        valid = []
        for m in markets:
            strike = kalshi.parse_strike(m)
            if not strike:
                continue

            close_str = m.get("close_time", "")
            try:
                close_time = datetime.fromisoformat(close_str.replace("Z", "+00:00"))
            except:
                continue

            if close_time > now:
                valid.append((m, strike, close_time))
        
        if not valid:
            return None

        # Find market with strike closest to spot price
        valid.sort(key=lambda x: abs(x[1] - spot))
        market, strike, close_time = valid[0]
        
        # Prices (Kalshi returns cents)
        yes_price = market.get("yes_bid", 50) / 100
        no_price = market.get("no_bid", 50) / 100
        yes_bid = market.get("yes_bid", 0) / 100
        yes_ask = market.get("yes_ask", 100) / 100
        spread = yes_ask - yes_bid
        
        # Orderbook
        orderbook = await kalshi.get_orderbook(market["ticker"])
        imbalance = calc_imbalance(orderbook.get("yes", []), orderbook.get("no", []))
        
        # Time to expiry
        mins = max((close_time - now).total_seconds() / 60, 0.1)
        
        # Edge calculation
        raw_edge, logit_edge, p_model = calc_edge(spot, strike, yes_price, vol, mins)
        
        # Signal
        if logit_edge > 0.15 and raw_edge > 0.08:
            signal = "UP"
        elif logit_edge < -0.15 and raw_edge < -0.08:
            signal = "DOWN"
        else:
            signal = "HOLD"
        
        # Compute advanced features if available
        advanced_features = {}
        if _feature_builder is not None and hasattr(price_feed, 'source') and price_feed.source:
            try:
                # Get the order book for order flow features
                product_id = {"BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD"}.get(asset)
                book = price_feed.source.books.get(product_id) if product_id else None

                if book:
                    advanced_features = _feature_builder.compute_all_features(asset, book, now)
            except Exception as e:
                pass  # Features are optional, don't fail if computation errors

        return MarketSnapshot(
            asset=asset,
            ticker=market["ticker"],
            title=market.get("title", "")[:50],
            spot_price=spot,
            strike=strike,
            yes_price=yes_price,
            no_price=no_price,
            yes_bid=yes_bid,
            yes_ask=yes_ask,
            spread=spread,
            p_model=p_model,
            edge=raw_edge,
            logit_edge=logit_edge,
            signal=signal,
            vol_annual=vol,
            mins_to_expiry=mins,
            orderbook_imbalance=imbalance,
            timestamp=now_est.strftime("%H:%M:%S"),
            volume_24h=market.get("volume_24h", 0),
            open_interest=market.get("open_interest", 0),
            liquidity=market.get("liquidity", 0) / 100,
            last_price=market.get("last_price", 0) / 100,
            close_time=market.get("close_time", ""),
            # Advanced features (may be None if not computed)
            vol_1min=advanced_features.get('vol_1min'),
            vol_5min=advanced_features.get('vol_5min'),
            vol_ratio=advanced_features.get('vol_ratio'),
            vol_regime=advanced_features.get('vol_regime'),
            vol_percentile=advanced_features.get('vol_percentile'),
            btc_eth_corr=advanced_features.get('btc_eth_corr'),
            btc_sol_corr=advanced_features.get('btc_sol_corr'),
            eth_sol_corr=advanced_features.get('eth_sol_corr'),
            asset_vs_btc_ret=advanced_features.get('asset_vs_btc_ret'),
            btc_leads=advanced_features.get('btc_leads'),
            correlation_regime=advanced_features.get('correlation_regime'),
            imbalance_top=advanced_features.get('imbalance_top'),
            imbalance_5bps=advanced_features.get('imbalance_5bps'),
            imbalance_10bps=advanced_features.get('imbalance_10bps'),
            depth_ratio=advanced_features.get('depth_ratio'),
            microprice_dev=advanced_features.get('microprice_dev'),
            spread_bps=advanced_features.get('spread_bps'),
            book_pressure=advanced_features.get('book_pressure'),
            hour_utc=advanced_features.get('hour_utc'),
            minute_of_hour=advanced_features.get('minute_of_hour'),
            day_of_week=advanced_features.get('day_of_week'),
            is_weekend=advanced_features.get('is_weekend'),
            is_us_market_hours=advanced_features.get('is_us_market_hours'),
            is_asia_hours=advanced_features.get('is_asia_hours'),
            is_europe_hours=advanced_features.get('is_europe_hours'),
            time_sin=advanced_features.get('time_sin'),
            time_cos=advanced_features.get('time_cos'),
        )
    
    def print_snapshots(self, snapshots: list[MarketSnapshot]):
        if not snapshots:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] No active markets found")
            return
        
        print(f"\n{'─'*80}")
        print(f"  {snapshots[0].timestamp} EST")
        print(f"{'─'*80}")
        
        for s in snapshots:
            sig_icon = {"UP": "🟢", "DOWN": "🔴", "HOLD": "⚪"}[s.signal]
            
            print(f"\n  {s.asset} | {s.ticker}")
            print(f"  Spot: ${s.spot_price:,.2f}  Strike: ${s.strike:,.2f}  Exp: {s.mins_to_expiry:.1f}m")
            print(f"  Yes: {s.yes_price:.0%} (bid {s.yes_bid:.0%} / ask {s.yes_ask:.0%})  Spread: {s.spread:.1%}")
            print(f"  P(model): {s.p_model:.1%}  Edge: {s.edge:+.1%}  Logit: {s.logit_edge:+.2f}")
            print(f"  Vol: {s.vol_annual:.0%}  OB Imbal: {s.orderbook_imbalance:+.2f}")
            print(f"  {sig_icon} {s.signal}")
        
        print(f"\n{'─'*80}")
    
    def stop(self):
        self.running = False

# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Kalshi Crypto Market Streamer",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--assets", nargs="+", choices=["BTC", "ETH", "SOL"],
                       default=["BTC", "ETH", "SOL"], help="Assets to stream")
    parser.add_argument("--interval", type=int, default=60,
                       help="Refresh interval in seconds (default: 60)")
    parser.add_argument("--json", action="store_true",
                       help="Output JSON lines (for piping)")
    parser.add_argument("--once", action="store_true",
                       help="Single snapshot then exit")
    parser.add_argument("--log", type=str, default=None,
                       help="Log snapshots to JSONL file for ML training")
    parser.add_argument("--coinbase", action="store_true",
                       help="Use Coinbase order book mid (CF constituent) instead of Binance")
    parser.add_argument("--horizons-only", action="store_true",
                       help="Only log at fixed horizons (T-60, T-30, T-15)")
    parser.add_argument("--horizons", nargs="+", type=int, default=[60, 30, 15],
                       help="Which horizons to log (default: 60 30 15)")

    args = parser.parse_args()

    streamer = MarketStreamer(
        assets=args.assets,
        interval=args.interval,
        json_output=args.json,
        log_file=args.log,
        horizons_only=args.horizons_only,
        horizons=args.horizons
    )
    
    async def run():
        # Choose price feed
        if args.coinbase:
            if not COINBASE_AVAILABLE:
                print("Error: Coinbase feed not available. Install coinbase-advanced-py")
                return
            feed_class = CoinbaseFeed
            feed_name = "Coinbase (CF constituent)"
        else:
            feed_class = BinanceFeed
            feed_name = "Binance.US"

        async with KalshiStream() as kalshi, feed_class() as price_feed:
            if not args.json:
                print(f"Price feed: {feed_name}")
                print("Bootstrapping...")
            for asset in args.assets:
                try:
                    await price_feed.bootstrap(asset)
                except:
                    pass

            if args.once:
                await streamer.tick(kalshi, price_feed)
            else:
                await streamer.run_with_feed(kalshi, price_feed)
    
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("\nStopped")

if __name__ == "__main__":
    main()
