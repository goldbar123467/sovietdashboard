# Agent 2: Fixed Horizon Dataset Builder

## Mission
Modify `kalshi_stream.py` to log fixed-horizon snapshots (T-60, T-30, T-15) with settlement proxy.

## File to Modify
`/home/clark/kalshi_stream.py`

## Changes Required

### 1. Add Horizon Configuration (near top of file)

```python
# Fixed horizons for dataset building (minutes before expiry)
FIXED_HORIZONS = [60, 30, 15]
HORIZON_TOLERANCE = 0.5  # ±30 seconds window

# Track which markets have been logged at which horizons
# Key: (ticker, horizon) -> bool
_logged_horizons: dict[tuple[str, int], bool] = {}
```

### 2. Add Settlement Proxy Buffer

```python
from collections import deque
from dataclasses import dataclass, field
from typing import Optional
import statistics

@dataclass
class SettlementBuffer:
    """Track per-second mids for 60-second settlement proxy."""
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

    def get_settlement_proxy(self, strike: float) -> Optional[int]:
        """Get settlement proxy: 1 if avg60 > strike, 0 otherwise."""
        avg = self.get_avg60()
        if avg is None:
            return None
        return 1 if avg > strike else 0

# Global settlement buffers per asset
_settlement_buffers: dict[str, SettlementBuffer] = {}
```

### 3. Modify `stream_data()` Function

Find the main streaming loop and add horizon-based logging:

```python
async def stream_data(kalshi: KalshiStream, feed: BinanceFeed, assets: list[str],
                      interval: int, log_path: Optional[Path], feed_name: str):
    """Stream market data with fixed-horizon snapshots."""

    global _logged_horizons, _settlement_buffers

    # Initialize settlement buffers
    for asset in assets:
        if asset not in _settlement_buffers:
            _settlement_buffers[asset] = SettlementBuffer()

    # ... existing bootstrap code ...

    while True:
        now = datetime.now(timezone.utc)

        for asset in assets:
            try:
                # Get current spot price
                spot = await feed.get_price(asset)

                # Update settlement buffer (every tick)
                _settlement_buffers[asset].add(spot, time.time())

                # Get markets
                prefix = ASSETS[asset]["kalshi_prefix"]
                markets = await kalshi.get_markets(prefix)

                for market in markets:
                    ticker = market.get("ticker")
                    if not ticker:
                        continue

                    # Parse expiry and calculate time to expiry
                    close_str = market.get("close_time", "")
                    try:
                        close_time = datetime.fromisoformat(close_str.replace("Z", "+00:00"))
                    except:
                        continue

                    mins_to_expiry = (close_time - now).total_seconds() / 60

                    # Skip expired markets
                    if mins_to_expiry < 0:
                        continue

                    # Check each fixed horizon
                    for horizon in FIXED_HORIZONS:
                        # Check if within tolerance window
                        if abs(mins_to_expiry - horizon) <= HORIZON_TOLERANCE:
                            key = (ticker, horizon)

                            # Skip if already logged this horizon
                            if _logged_horizons.get(key, False):
                                continue

                            # Create snapshot with horizon tag
                            snapshot = await create_snapshot(
                                asset, market, spot, feed,
                                kalshi, mins_to_expiry
                            )

                            if snapshot:
                                # Add horizon-specific fields
                                snapshot_dict = snapshot.to_dict()
                                snapshot_dict['horizon'] = f"T-{horizon}"
                                snapshot_dict['horizon_mins'] = horizon

                                # Add settlement proxy
                                strike = kalshi.parse_strike(market)
                                if strike:
                                    proxy = _settlement_buffers[asset].get_settlement_proxy(strike)
                                    snapshot_dict['settlement_proxy'] = proxy
                                    avg60 = _settlement_buffers[asset].get_avg60()
                                    snapshot_dict['avg60_mid'] = avg60

                                # Log to file
                                if log_path:
                                    with open(log_path, 'a') as f:
                                        snapshot_dict['log_time'] = datetime.now(timezone.utc).isoformat()
                                        f.write(json.dumps(snapshot_dict) + '\n')

                                # Mark as logged
                                _logged_horizons[key] = True

                                print(f"  📍 {asset} {ticker} @ T-{horizon} logged")

                    # Also log regular samples if not at a horizon
                    # (keep existing behavior for backward compatibility)

            except Exception as e:
                print(f"  {asset}: Error - {e}")

        await asyncio.sleep(interval)
```

### 4. Add CLI Flag for Horizon-Only Mode

```python
# In argument parser:
parser.add_argument("--horizons-only", action="store_true",
                    help="Only log at fixed horizons (T-60, T-30, T-15)")
parser.add_argument("--horizons", nargs="+", type=int, default=[60, 30, 15],
                    help="Which horizons to log (default: 60 30 15)")
```

### 5. Add Horizon Cleanup on Market Expiry

```python
def cleanup_expired_horizons(ticker: str):
    """Remove logged horizon entries for expired market."""
    global _logged_horizons
    keys_to_remove = [k for k in _logged_horizons if k[0] == ticker]
    for k in keys_to_remove:
        del _logged_horizons[k]
```

### 6. Modify MarketSnapshot Dataclass

Add new fields:

```python
@dataclass
class MarketSnapshot:
    # ... existing fields ...

    # New horizon fields
    horizon: Optional[str] = None          # "T-60", "T-30", "T-15"
    horizon_mins: Optional[int] = None     # 60, 30, 15
    settlement_proxy: Optional[int] = None # 1 if avg60 > strike, 0 otherwise
    avg60_mid: Optional[float] = None      # 60-second average mid price
```

## Output Format

With horizons enabled, logged samples will have:

```json
{
  "asset": "BTC",
  "ticker": "KXBTC-26JAN2512-B88000",
  "spot_price": 87950.50,
  "strike": 88000.00,
  "yes_price": 0.42,
  "mins_to_expiry": 60.2,
  "horizon": "T-60",
  "horizon_mins": 60,
  "settlement_proxy": null,
  "avg60_mid": 87945.30,
  "log_time": "2026-01-25T16:00:00+00:00"
}
```

## Verification

```bash
# Run with horizon logging
python kalshi_stream.py --coinbase --interval 10 --log horizon_test.jsonl

# Wait for markets to pass T-60, T-30, T-15 windows
# Check output:
grep '"horizon":' horizon_test.jsonl | head -5

# Verify one sample per market per horizon:
cat horizon_test.jsonl | python3 -c "
import json, sys
from collections import Counter
samples = [json.loads(l) for l in sys.stdin]
horizon_samples = [s for s in samples if s.get('horizon')]
counts = Counter((s['ticker'], s['horizon']) for s in horizon_samples)
duplicates = [(k, v) for k, v in counts.items() if v > 1]
print(f'Total horizon samples: {len(horizon_samples)}')
print(f'Unique (ticker, horizon) pairs: {len(counts)}')
print(f'Duplicates: {len(duplicates)}')
if duplicates:
    print('FAIL: Found duplicates:', duplicates[:5])
else:
    print('PASS: No duplicates')
"
```

## Success Criteria
- [ ] Samples logged at T-60, T-30, T-15 (±30s window)
- [ ] Only ONE sample per market per horizon
- [ ] `horizon` field correctly populated
- [ ] `settlement_proxy` populated when 60s of data available
- [ ] `avg60_mid` shows the 60-second rolling average
- [ ] No duplicate (ticker, horizon) pairs in output
