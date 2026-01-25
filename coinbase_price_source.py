#!/usr/bin/env python3
"""
Coinbase Advanced Trade WebSocket Price Source (Hardened)
=========================================================
Phase 1: Order book mid-price from level2 channel.
Uses official Coinbase SDK with overnight hardening.

Features:
- Heartbeat/watchdog with stale detection
- Exponential backoff reconnect with jitter
- Crossed book / bad spread detection
- Price jump detection
- Line-buffered logging with flush
- 1-minute monitoring stats
"""

import asyncio
import json
import threading
import time
import random
from datetime import datetime, timezone
from dataclasses import dataclass, asdict, field
from typing import Optional, Callable
from collections import defaultdict, deque
import argparse
import sys

from coinbase.websocket import WSClient

# ============================================================================
# CONFIG
# ============================================================================

PRODUCTS = {
    "BTC": "BTC-USD",
    "ETH": "ETH-USD",
    "SOL": "SOL-USD",
}

ASSETS_BY_PRODUCT = {v: k for k, v in PRODUCTS.items()}

# Hardening thresholds
STALE_THRESHOLD_SECONDS = 10.0      # Mark stale after no updates
FORCE_RECONNECT_SECONDS = 60.0      # Force reconnect after prolonged stale
MAX_SPREAD_BPS = 100.0              # Flag if spread > 100 bps
PRICE_JUMP_PCT = 2.0                # Flag if price moves > 2% in one tick
RECONNECT_BASE_DELAY = 1.0          # Initial reconnect delay
RECONNECT_MAX_DELAY = 30.0          # Max reconnect delay
RECONNECT_JITTER = 0.5              # Jitter factor (0-1)

# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class PriceRecord:
    ts_utc: str
    asset: str
    product_id: str
    best_bid: float
    best_ask: float
    mid: float
    spread: float           # Absolute spread
    spread_bps: float       # Spread in basis points
    venue: str = "coinbase"
    stale_flag: bool = False
    data_quality: str = "ok"  # ok, stale, crossed, wide_spread, price_jump


@dataclass
class MonitoringStats:
    timestamp: str
    last_tick_age_sec: float
    reconnect_count: int
    stale_seconds: int
    avg_spread_bps: float
    max_spread_bps: float
    bad_tick_skips: int
    samples: int


# ============================================================================
# ORDER BOOK (Hardened)
# ============================================================================

class Level2OrderBook:
    """Maintains order book state with validation"""

    def __init__(self, product_id: str):
        self.product_id = product_id
        self.bids: dict[float, float] = {}
        self.asks: dict[float, float] = {}
        self.last_update: Optional[datetime] = None
        self.last_sequence: int = 0
        self.initialized = False
        self.last_mid: Optional[float] = None

    def apply_snapshot(self, updates: list[dict]):
        """Apply initial snapshot - clears existing state"""
        self.bids.clear()
        self.asks.clear()
        for update in updates:
            self._apply_update(update)
        self.initialized = True
        self.last_update = datetime.now(timezone.utc)
        self.last_mid = self.get_mid()

    def apply_update(self, updates: list[dict]):
        """Apply incremental updates"""
        for update in updates:
            self._apply_update(update)
        self.last_update = datetime.now(timezone.utc)

    def _apply_update(self, update: dict):
        """Apply single price level update"""
        side = update.get("side")
        price = float(update.get("price_level", 0))
        quantity = float(update.get("new_quantity", 0))

        if price <= 0:
            return

        if side == "bid":
            if quantity == 0:
                self.bids.pop(price, None)
            else:
                self.bids[price] = quantity
        elif side == "offer":
            if quantity == 0:
                self.asks.pop(price, None)
            else:
                self.asks[price] = quantity

    def get_best_bid(self) -> Optional[float]:
        return max(self.bids.keys()) if self.bids else None

    def get_best_ask(self) -> Optional[float]:
        return min(self.asks.keys()) if self.asks else None

    def get_mid(self) -> Optional[float]:
        bid = self.get_best_bid()
        ask = self.get_best_ask()
        if bid is not None and ask is not None:
            return (bid + ask) / 2
        return None

    def get_spread(self) -> Optional[float]:
        bid = self.get_best_bid()
        ask = self.get_best_ask()
        if bid is not None and ask is not None:
            return ask - bid
        return None

    def get_spread_bps(self) -> Optional[float]:
        mid = self.get_mid()
        spread = self.get_spread()
        if mid and spread is not None and mid > 0:
            return (spread / mid) * 10000
        return None

    def is_stale(self, max_age_seconds: float = STALE_THRESHOLD_SECONDS) -> bool:
        if not self.last_update:
            return True
        age = (datetime.now(timezone.utc) - self.last_update).total_seconds()
        return age > max_age_seconds

    def get_stale_age(self) -> float:
        """Get seconds since last update"""
        if not self.last_update:
            return float('inf')
        return (datetime.now(timezone.utc) - self.last_update).total_seconds()

    def is_crossed(self) -> bool:
        """Check if book is crossed (bid >= ask)"""
        bid = self.get_best_bid()
        ask = self.get_best_ask()
        if bid is not None and ask is not None:
            return bid >= ask
        return False

    def is_wide_spread(self, max_bps: float = MAX_SPREAD_BPS) -> bool:
        """Check if spread is abnormally wide"""
        spread_bps = self.get_spread_bps()
        return spread_bps is not None and spread_bps > max_bps

    def is_price_jump(self, max_pct: float = PRICE_JUMP_PCT) -> bool:
        """Check if price jumped significantly from last tick"""
        if self.last_mid is None:
            return False
        mid = self.get_mid()
        if mid is None:
            return False
        pct_change = abs(mid - self.last_mid) / self.last_mid * 100
        return pct_change > max_pct

    def validate_and_get_quality(self) -> str:
        """Validate book state and return quality flag"""
        if not self.initialized:
            return "uninitialized"
        if self.is_stale():
            return "stale"
        if self.is_crossed():
            return "crossed"
        if self.is_wide_spread():
            return "wide_spread"
        if self.is_price_jump():
            return "price_jump"
        return "ok"

    def get_price_record(self, asset: str) -> Optional[PriceRecord]:
        if not self.initialized:
            return None

        bid = self.get_best_bid()
        ask = self.get_best_ask()
        mid = self.get_mid()
        spread = self.get_spread()
        spread_bps = self.get_spread_bps()

        if None in (bid, ask, mid, spread, spread_bps):
            return None

        quality = self.validate_and_get_quality()

        record = PriceRecord(
            ts_utc=datetime.now(timezone.utc).isoformat(),
            asset=asset,
            product_id=self.product_id,
            best_bid=bid,
            best_ask=ask,
            mid=mid,
            spread=spread,
            spread_bps=spread_bps,
            stale_flag=self.is_stale(),
            data_quality=quality,
        )

        # Update last_mid for next tick's jump detection
        if quality == "ok":
            self.last_mid = mid

        return record

    def get_depth_at_band(self, band_bps: float) -> tuple[float, float]:
        """Get total bid/ask quantity within band_bps of mid price.

        Args:
            band_bps: Basis points from mid (e.g., 5 = within 0.05% of mid)

        Returns:
            (bid_depth, ask_depth) - total quantities
        """
        mid = self.get_mid()
        if mid is None:
            return (0.0, 0.0)

        band_pct = band_bps / 10000
        lower_bound = mid * (1 - band_pct)
        upper_bound = mid * (1 + band_pct)

        bid_depth = sum(qty for price, qty in self.bids.items()
                        if price >= lower_bound)
        ask_depth = sum(qty for price, qty in self.asks.items()
                        if price <= upper_bound)

        return (bid_depth, ask_depth)

    def get_imbalance_at_band(self, band_bps: float) -> float:
        """Get order book imbalance within band.

        Returns: (bid_depth - ask_depth) / (bid_depth + ask_depth)
                 Range: [-1, 1] where 1 = all bids, -1 = all asks
        """
        bid_depth, ask_depth = self.get_depth_at_band(band_bps)
        total = bid_depth + ask_depth
        if total == 0:
            return 0.0
        return (bid_depth - ask_depth) / total

    def get_top_imbalance(self) -> float:
        """Get imbalance at top of book only."""
        best_bid = self.get_best_bid()
        best_ask = self.get_best_ask()
        if best_bid is None or best_ask is None:
            return 0.0

        bid_qty = self.bids.get(best_bid, 0)
        ask_qty = self.asks.get(best_ask, 0)
        total = bid_qty + ask_qty
        if total == 0:
            return 0.0
        return (bid_qty - ask_qty) / total

    def get_microprice(self) -> Optional[float]:
        """Get volume-weighted microprice.

        microprice = (ask * bid_qty + bid * ask_qty) / (bid_qty + ask_qty)

        This leads the mid when imbalance is extreme.
        """
        best_bid = self.get_best_bid()
        best_ask = self.get_best_ask()
        if best_bid is None or best_ask is None:
            return None

        bid_qty = self.bids.get(best_bid, 0)
        ask_qty = self.asks.get(best_ask, 0)
        total = bid_qty + ask_qty
        if total == 0:
            return self.get_mid()

        return (best_ask * bid_qty + best_bid * ask_qty) / total


# ============================================================================
# COINBASE PRICE SOURCE (Hardened)
# ============================================================================

class CoinbaseMidPriceSource:
    """
    WebSocket client with overnight hardening:
    - Heartbeat watchdog
    - Exponential backoff reconnect with jitter
    - Data quality validation
    - Monitoring stats
    """

    def __init__(
        self,
        assets: list[str] = None,
        on_price: Optional[Callable[[PriceRecord], None]] = None,
    ):
        self.assets = assets or ["BTC", "ETH"]
        self.product_ids = [PRODUCTS[a] for a in self.assets if a in PRODUCTS]
        self.on_price = on_price

        self.books: dict[str, Level2OrderBook] = {}
        for product_id in self.product_ids:
            self.books[product_id] = Level2OrderBook(product_id)

        self.client: Optional[WSClient] = None
        self.running = False
        self._lock = threading.Lock()
        self._watchdog_thread: Optional[threading.Thread] = None

        # Monitoring counters
        self.reconnect_count = 0
        self.stale_seconds = 0
        self.bad_tick_skips = 0
        self.spread_samples: list[float] = []
        self.last_monitor_time = time.time()

    def _on_message(self, msg):
        """Handle incoming WebSocket message from SDK"""
        if isinstance(msg, str):
            try:
                msg = json.loads(msg)
            except:
                return

        channel = msg.get("channel")
        if channel != "l2_data":
            return

        events = msg.get("events", [])
        for event in events:
            event_type = event.get("type")
            product_id = event.get("product_id")
            updates = event.get("updates", [])

            if product_id not in self.books:
                continue

            with self._lock:
                book = self.books[product_id]
                if event_type == "snapshot":
                    book.apply_snapshot(updates)
                elif event_type == "update":
                    book.apply_update(updates)

    def _get_reconnect_delay(self) -> float:
        """Calculate reconnect delay with exponential backoff + jitter"""
        delay = min(
            RECONNECT_BASE_DELAY * (2 ** (self.reconnect_count - 1)),
            RECONNECT_MAX_DELAY
        )
        jitter = delay * RECONNECT_JITTER * random.random()
        return delay + jitter

    def _watchdog_loop(self):
        """Background thread to monitor connection health"""
        while self.running:
            time.sleep(5)

            # Check for prolonged staleness
            max_stale = 0
            for book in self.books.values():
                stale_age = book.get_stale_age()
                max_stale = max(max_stale, stale_age)

            if max_stale > FORCE_RECONNECT_SECONDS:
                print(f"[WATCHDOG] Stale for {max_stale:.0f}s, forcing reconnect",
                      file=sys.stderr, flush=True)
                self._force_reconnect()

    def _force_reconnect(self):
        """Force a reconnection"""
        self.reconnect_count += 1
        try:
            if self.client:
                self.client.close()
        except:
            pass

        # Clear book state
        with self._lock:
            for book in self.books.values():
                book.initialized = False

        delay = self._get_reconnect_delay()
        print(f"[RECONNECT] Attempt {self.reconnect_count}, waiting {delay:.1f}s",
              file=sys.stderr, flush=True)
        time.sleep(delay)

        try:
            self.client = WSClient(on_message=self._on_message)
            self.client.open()
            self.client.subscribe(product_ids=self.product_ids, channels=["level2"])
            print(f"[RECONNECT] Success", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"[RECONNECT] Failed: {e}", file=sys.stderr, flush=True)

    def start(self):
        """Start the WebSocket connection"""
        self.running = True
        self.client = WSClient(on_message=self._on_message)
        self.client.open()
        self.client.subscribe(product_ids=self.product_ids, channels=["level2"])
        print(f"Coinbase WebSocket connected: {self.product_ids}", flush=True)

        # Start watchdog
        self._watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self._watchdog_thread.start()

    def stop(self):
        """Stop the WebSocket connection"""
        self.running = False
        if self.client:
            try:
                self.client.close()
            except:
                pass

    def get_mid(self, asset: str) -> Optional[float]:
        """Get current mid price for an asset"""
        product_id = PRODUCTS.get(asset)
        if product_id and product_id in self.books:
            with self._lock:
                return self.books[product_id].get_mid()
        return None

    def get_price_record(self, asset: str) -> Optional[PriceRecord]:
        """Get current price record with validation"""
        product_id = PRODUCTS.get(asset)
        if product_id and product_id in self.books:
            with self._lock:
                record = self.books[product_id].get_price_record(asset)
                if record:
                    # Track for monitoring
                    self.spread_samples.append(record.spread_bps)
                    if record.stale_flag:
                        self.stale_seconds += 1
                    if record.data_quality not in ("ok", "stale"):
                        self.bad_tick_skips += 1
                return record
        return None

    def get_monitoring_stats(self) -> MonitoringStats:
        """Get current monitoring stats and reset counters"""
        now = time.time()

        # Find max stale age
        max_stale = 0
        for book in self.books.values():
            max_stale = max(max_stale, book.get_stale_age())

        stats = MonitoringStats(
            timestamp=datetime.now(timezone.utc).strftime("%H:%M:%S"),
            last_tick_age_sec=max_stale,
            reconnect_count=self.reconnect_count,
            stale_seconds=self.stale_seconds,
            avg_spread_bps=sum(self.spread_samples) / len(self.spread_samples) if self.spread_samples else 0,
            max_spread_bps=max(self.spread_samples) if self.spread_samples else 0,
            bad_tick_skips=self.bad_tick_skips,
            samples=len(self.spread_samples),
        )

        # Reset counters
        self.stale_seconds = 0
        self.bad_tick_skips = 0
        self.spread_samples = []
        self.last_monitor_time = now

        return stats

    def print_monitoring_line(self):
        """Print 1-line monitoring status"""
        stats = self.get_monitoring_stats()
        print(f"[{stats.timestamp}] tick_age={stats.last_tick_age_sec:.1f}s "
              f"reconnects={stats.reconnect_count} stale={stats.stale_seconds}s "
              f"spread_avg={stats.avg_spread_bps:.2f}bps spread_max={stats.max_spread_bps:.2f}bps "
              f"bad_ticks={stats.bad_tick_skips} samples={stats.samples}",
              flush=True)


# ============================================================================
# ASYNC WRAPPER FOR KALSHI INTEGRATION
# ============================================================================

class CoinbaseFeed:
    """
    Async-compatible wrapper for CoinbaseMidPriceSource.
    Drop-in replacement for BinanceFeed in kalshi_stream.py.
    """

    def __init__(self):
        self.source: Optional[CoinbaseMidPriceSource] = None
        self.prices: dict[str, deque] = {}
        self._price_buffer_size = 120
        self._monitor_interval = 60
        self._last_monitor = 0

    async def __aenter__(self):
        self.source = CoinbaseMidPriceSource(assets=["BTC", "ETH", "SOL"])
        self.source.start()
        await asyncio.sleep(2)  # Wait for initial snapshot

        for asset in ["BTC", "ETH", "SOL"]:
            self.prices[asset] = deque(maxlen=self._price_buffer_size)
        return self

    async def __aexit__(self, *args):
        if self.source:
            self.source.stop()

    async def get_price(self, asset: str) -> float:
        """Get current mid price, with monitoring"""
        if not self.source:
            raise RuntimeError("Feed not started")

        # Periodic monitoring
        now = time.time()
        if now - self._last_monitor > self._monitor_interval:
            self.source.print_monitoring_line()
            self._last_monitor = now

        record = self.source.get_price_record(asset)
        if record is None:
            raise ValueError(f"No price for {asset}")

        # Skip bad ticks for price history (but still return current mid)
        if record.data_quality == "ok":
            self.prices[asset].append(record.mid)

        return record.mid

    async def bootstrap(self, asset: str):
        """Bootstrap price history"""
        await asyncio.sleep(1)
        for _ in range(10):
            try:
                mid = self.source.get_mid(asset)
                if mid:
                    self.prices[asset].append(mid)
            except:
                pass
            await asyncio.sleep(0.1)

    def get_vol(self, asset: str) -> float:
        """Calculate volatility from price history"""
        import numpy as np
        prices = list(self.prices.get(asset, []))
        if len(prices) < 2:
            return 0.5
        returns = np.diff(np.log(prices))
        vol_1min = np.std(returns)
        return max(vol_1min * np.sqrt(525600), 0.01)


# ============================================================================
# STANDALONE TEST
# ============================================================================

def run_test(duration: int = 60, assets: list[str] = None):
    """Run standalone test with monitoring"""
    assets = assets or ["BTC", "ETH"]

    print(f"Starting {duration}s test for {assets}...")
    print(f"Spread columns: spread_abs (dollars), spread_bps (basis points)")
    print("=" * 80)

    source = CoinbaseMidPriceSource(assets=assets)
    source.start()

    start = time.time()
    last_monitor = 0

    try:
        while time.time() - start < duration:
            time.sleep(1)

            for asset in assets:
                record = source.get_price_record(asset)
                if record:
                    quality_flag = f"[{record.data_quality}]" if record.data_quality != "ok" else ""
                    print(f"[{record.ts_utc[11:19]}] {record.asset} "
                          f"bid=${record.best_bid:,.2f} ask=${record.best_ask:,.2f} "
                          f"mid=${record.mid:,.2f} "
                          f"spread=${record.spread:.2f} ({record.spread_bps:.3f}bps) "
                          f"{quality_flag}", flush=True)

            # Monitoring every 60s
            elapsed = int(time.time() - start)
            if elapsed > 0 and elapsed % 60 == 0 and elapsed != last_monitor:
                last_monitor = elapsed
                source.print_monitoring_line()

    except KeyboardInterrupt:
        print("\nInterrupted")
    finally:
        source.stop()

    print("=" * 80)
    print("Test complete")


def main():
    parser = argparse.ArgumentParser(description="Coinbase Mid Price Source (Hardened)")
    parser.add_argument("--duration", type=int, default=60)
    parser.add_argument("--assets", nargs="+", default=["BTC", "ETH"])
    args = parser.parse_args()

    run_test(args.duration, args.assets)


if __name__ == "__main__":
    main()
