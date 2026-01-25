# Agent 1: Microstructure Logger

## Mission
Create per-second microstructure logging from Coinbase order book data.

## Files to Modify/Create

### 1. Modify: `/home/clark/coinbase_price_source.py`

Add these methods to `Level2OrderBook` class:

```python
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
```

### 2. Create: `/home/clark/microstructure_logger.py`

```python
#!/usr/bin/env python3
"""
Microstructure Logger
=====================
Per-second logging of Coinbase order book microstructure.

Usage:
    python microstructure_logger.py --assets BTC ETH --duration 300
    python microstructure_logger.py --assets BTC --log micro.jsonl --stream
"""

import argparse
import json
import time
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
from typing import Optional
from collections import deque
from pathlib import Path

from coinbase_price_source import CoinbaseMidPriceSource

@dataclass
class MicrostructureRecord:
    """Per-second microstructure snapshot."""
    ts_utc: str
    asset: str
    product_id: str

    # Price levels
    bid: float
    ask: float
    mid: float
    microprice: float

    # Spread
    spread_abs: float
    spread_bps: float

    # Imbalance at different depths
    imbalance_top: float      # top of book only
    imbalance_5bps: float     # within 5 bps of mid
    imbalance_10bps: float    # within 10 bps of mid

    # Depth (total quantity)
    depth_bid_5bps: float
    depth_ask_5bps: float
    depth_bid_10bps: float
    depth_ask_10bps: float

    # Returns (None if insufficient history)
    ret_5s: Optional[float] = None
    ret_30s: Optional[float] = None
    ret_60s: Optional[float] = None


class MicrostructureLogger:
    """Logs per-second microstructure from Coinbase."""

    ASSETS = {
        "BTC": "BTC-USD",
        "ETH": "ETH-USD",
        "SOL": "SOL-USD"
    }

    def __init__(self, assets: list[str], log_path: Optional[Path] = None):
        self.assets = assets
        self.log_path = log_path
        self.source: Optional[CoinbaseMidPriceSource] = None

        # Price history for returns: {asset: deque of (timestamp, mid)}
        self.price_history: dict[str, deque] = {
            asset: deque(maxlen=120)  # 2 minutes of history
            for asset in assets
        }

    def start(self):
        """Start the Coinbase connection."""
        products = [self.ASSETS[a] for a in self.assets]
        self.source = CoinbaseMidPriceSource(products)
        self.source.start()

        # Wait for initialization
        print("Waiting for order book initialization...")
        time.sleep(3)

    def stop(self):
        """Stop the connection."""
        if self.source:
            self.source.stop()

    def _get_return(self, asset: str, seconds_ago: int) -> Optional[float]:
        """Get log return from N seconds ago."""
        history = self.price_history[asset]
        if len(history) < 2:
            return None

        now = time.time()
        current_mid = history[-1][1]

        # Find price from ~seconds_ago
        for ts, mid in reversed(history):
            if now - ts >= seconds_ago:
                if mid > 0 and current_mid > 0:
                    import math
                    return math.log(current_mid / mid)
                return None

        return None

    def get_record(self, asset: str) -> Optional[MicrostructureRecord]:
        """Get current microstructure record for asset."""
        if not self.source:
            return None

        product_id = self.ASSETS[asset]
        book = self.source.books.get(product_id)
        if not book or not book.initialized:
            return None

        # Get basic prices
        bid = book.get_best_bid()
        ask = book.get_best_ask()
        mid = book.get_mid()
        microprice = book.get_microprice()

        if None in (bid, ask, mid):
            return None

        # Store in history
        now = time.time()
        self.price_history[asset].append((now, mid))

        # Spread
        spread_abs = ask - bid
        spread_bps = (spread_abs / mid) * 10000 if mid > 0 else 0

        # Imbalance
        imbalance_top = book.get_top_imbalance()
        imbalance_5bps = book.get_imbalance_at_band(5)
        imbalance_10bps = book.get_imbalance_at_band(10)

        # Depth
        depth_bid_5bps, depth_ask_5bps = book.get_depth_at_band(5)
        depth_bid_10bps, depth_ask_10bps = book.get_depth_at_band(10)

        # Returns
        ret_5s = self._get_return(asset, 5)
        ret_30s = self._get_return(asset, 30)
        ret_60s = self._get_return(asset, 60)

        return MicrostructureRecord(
            ts_utc=datetime.now(timezone.utc).isoformat(),
            asset=asset,
            product_id=product_id,
            bid=bid,
            ask=ask,
            mid=mid,
            microprice=microprice or mid,
            spread_abs=spread_abs,
            spread_bps=spread_bps,
            imbalance_top=imbalance_top,
            imbalance_5bps=imbalance_5bps,
            imbalance_10bps=imbalance_10bps,
            depth_bid_5bps=depth_bid_5bps,
            depth_ask_5bps=depth_ask_5bps,
            depth_bid_10bps=depth_bid_10bps,
            depth_ask_10bps=depth_ask_10bps,
            ret_5s=ret_5s,
            ret_30s=ret_30s,
            ret_60s=ret_60s
        )

    def log_record(self, record: MicrostructureRecord):
        """Log record to file."""
        if self.log_path:
            with open(self.log_path, 'a') as f:
                f.write(json.dumps(asdict(record)) + '\n')

    def print_record(self, record: MicrostructureRecord):
        """Print record to console."""
        ret_str = ""
        if record.ret_5s is not None:
            ret_str = f"ret5s={record.ret_5s*100:+.3f}%"
        if record.ret_30s is not None:
            ret_str += f" ret30s={record.ret_30s*100:+.3f}%"

        print(f"[{record.ts_utc[11:19]}] {record.asset} "
              f"mid=${record.mid:,.2f} micro=${record.microprice:,.2f} "
              f"spread={record.spread_bps:.2f}bps "
              f"imbal_top={record.imbalance_top:+.2f} "
              f"imbal_5bps={record.imbalance_5bps:+.2f} "
              f"{ret_str}")

    def run(self, duration: Optional[int] = None, stream: bool = False):
        """Run logger for duration seconds or indefinitely if stream=True."""
        self.start()

        start_time = time.time()
        samples = 0

        try:
            while True:
                loop_start = time.time()

                for asset in self.assets:
                    record = self.get_record(asset)
                    if record:
                        self.print_record(record)
                        self.log_record(record)
                        samples += 1

                # Check duration
                if duration and (time.time() - start_time) >= duration:
                    break

                # Sleep to align to 1-second intervals
                elapsed = time.time() - loop_start
                sleep_time = max(0, 1.0 - elapsed)
                time.sleep(sleep_time)

        except KeyboardInterrupt:
            print("\nStopping...")
        finally:
            self.stop()
            print(f"\nLogged {samples} samples")
            if self.log_path:
                print(f"Output: {self.log_path}")


def main():
    parser = argparse.ArgumentParser(description="Microstructure Logger")
    parser.add_argument("--assets", nargs="+", choices=["BTC", "ETH", "SOL"],
                        default=["BTC", "ETH"])
    parser.add_argument("--log", type=Path, help="Output JSONL file")
    parser.add_argument("--duration", type=int, help="Run for N seconds")
    parser.add_argument("--stream", action="store_true",
                        help="Run indefinitely")

    args = parser.parse_args()

    if not args.duration and not args.stream:
        args.duration = 60  # Default 1 minute

    logger = MicrostructureLogger(args.assets, args.log)
    logger.run(duration=args.duration, stream=args.stream)


if __name__ == "__main__":
    main()
```

## Verification

```bash
# Test for 30 seconds
python microstructure_logger.py --assets BTC ETH --duration 30

# Expected output:
# [16:30:01] BTC mid=$88,000.00 micro=$88,000.05 spread=0.01bps imbal_top=+0.15 imbal_5bps=+0.08
# [16:30:01] ETH mid=$2,900.00 micro=$2,900.02 spread=0.03bps imbal_top=-0.22 imbal_5bps=-0.10
# ...

# Test with logging
python microstructure_logger.py --assets BTC --log test_micro.jsonl --duration 10
cat test_micro.jsonl | head -2 | python -m json.tool
```

## Success Criteria
- [ ] `get_depth_at_band()` returns correct bid/ask quantities
- [ ] `get_imbalance_at_band()` returns values in [-1, 1]
- [ ] `get_microprice()` differs from mid when imbalance is extreme
- [ ] Returns calculated correctly after 5s/30s/60s of data
- [ ] JSONL output is valid and contains all fields
