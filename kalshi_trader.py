#!/usr/bin/env python3
"""
Kalshi Trade Execution Module
=============================
Paper and live trading with the HorizonRouter prediction model.

Usage:
    # Paper trading (default)
    python kalshi_trader.py --models-dir ./kalshi_horizon_models --paper

    # Live trading (real money)
    python kalshi_trader.py --models-dir ./kalshi_horizon_models --live

    # View trade log
    python kalshi_trader.py --show-trades trades.jsonl
"""

import argparse
import asyncio
import json
import time
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Optional, Dict, List
from enum import Enum

import aiohttp
import numpy as np
import pandas as pd

from kalshi_inference import HorizonRouter, PredictionResult


class TradingMode(Enum):
    PAPER = "paper"
    LIVE = "live"


@dataclass
class Position:
    """An open position."""
    ticker: str
    side: str  # 'yes' or 'no'
    quantity: int  # Number of contracts
    entry_price: float  # Price paid per contract
    entry_time: str
    horizon: str
    model_prob: float
    market_prob: float
    edge: float
    order_id: Optional[str] = None


@dataclass
class Trade:
    """A completed trade (entry + exit)."""
    ticker: str
    side: str
    quantity: int
    entry_price: float
    entry_time: str
    exit_price: float  # 1.0 if won, 0.0 if lost
    exit_time: str
    outcome: str  # 'yes' or 'no'
    pnl: float  # Profit/loss in dollars
    horizon: str
    model_prob: float
    market_prob: float
    edge: float
    mode: str  # 'paper' or 'live'


@dataclass
class TraderState:
    """Persistent trader state."""
    positions: Dict[str, Position] = field(default_factory=dict)
    daily_pnl: float = 0.0
    total_pnl: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    daily_trades: int = 0
    last_reset_date: str = ""

    def reset_daily(self):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if self.last_reset_date != today:
            self.daily_pnl = 0.0
            self.daily_trades = 0
            self.last_reset_date = today


class KalshiTrader:
    """Trade execution with paper/live modes."""

    KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2"

    def __init__(
        self,
        router: HorizonRouter,
        mode: TradingMode = TradingMode.PAPER,
        api_key: str = None,
        max_position_usd: float = 10.0,  # Max per trade
        daily_loss_limit: float = -50.0,  # Stop trading if hit
        max_daily_trades: int = 50,
        trade_log_path: Path = None,
        state_path: Path = None
    ):
        self.router = router
        self.mode = mode
        self.api_key = api_key or "bd1735b6-5c51-4043-a1df-4172a5eb8580"
        self.max_position_usd = max_position_usd
        self.daily_loss_limit = daily_loss_limit
        self.max_daily_trades = max_daily_trades
        self.trade_log_path = trade_log_path or Path("trades.jsonl")
        self.state_path = state_path or Path("trader_state.json")

        self.state = self._load_state()
        self.session: Optional[aiohttp.ClientSession] = None

    def _load_state(self) -> TraderState:
        """Load persisted state."""
        if self.state_path.exists():
            try:
                with open(self.state_path) as f:
                    data = json.load(f)
                state = TraderState(
                    positions={k: Position(**v) for k, v in data.get('positions', {}).items()},
                    daily_pnl=data.get('daily_pnl', 0.0),
                    total_pnl=data.get('total_pnl', 0.0),
                    total_trades=data.get('total_trades', 0),
                    winning_trades=data.get('winning_trades', 0),
                    losing_trades=data.get('losing_trades', 0),
                    daily_trades=data.get('daily_trades', 0),
                    last_reset_date=data.get('last_reset_date', "")
                )
                state.reset_daily()
                return state
            except Exception as e:
                print(f"Warning: Could not load state: {e}")
        return TraderState()

    def _save_state(self):
        """Persist state to disk."""
        data = {
            'positions': {k: asdict(v) for k, v in self.state.positions.items()},
            'daily_pnl': self.state.daily_pnl,
            'total_pnl': self.state.total_pnl,
            'total_trades': self.state.total_trades,
            'winning_trades': self.state.winning_trades,
            'losing_trades': self.state.losing_trades,
            'daily_trades': self.state.daily_trades,
            'last_reset_date': self.state.last_reset_date
        }
        with open(self.state_path, 'w') as f:
            json.dump(data, f, indent=2)

    def _log_trade(self, trade: Trade):
        """Append trade to log file."""
        with open(self.trade_log_path, 'a') as f:
            f.write(json.dumps(asdict(trade)) + '\n')

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session."""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            })
        return self.session

    async def close(self):
        """Close HTTP session."""
        if self.session and not self.session.closed:
            await self.session.close()
        self._save_state()

    # =========================================================================
    # KALSHI API METHODS
    # =========================================================================

    async def get_market(self, ticker: str) -> Optional[dict]:
        """Fetch market details."""
        session = await self._get_session()
        try:
            async with session.get(f"{self.KALSHI_API_BASE}/markets/{ticker}") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get('market')
        except Exception as e:
            print(f"Error fetching market {ticker}: {e}")
        return None

    async def get_orderbook(self, ticker: str) -> Optional[dict]:
        """Fetch orderbook for a market."""
        session = await self._get_session()
        try:
            async with session.get(f"{self.KALSHI_API_BASE}/markets/{ticker}/orderbook") as resp:
                if resp.status == 200:
                    return await resp.json()
        except Exception as e:
            print(f"Error fetching orderbook {ticker}: {e}")
        return None

    async def place_order_live(self, ticker: str, side: str, quantity: int, price: float) -> Optional[str]:
        """Place a real order on Kalshi. Returns order_id if successful."""
        session = await self._get_session()

        # Kalshi order format
        order = {
            "ticker": ticker,
            "action": "buy",
            "side": side,  # 'yes' or 'no'
            "count": quantity,
            "type": "limit",
            "yes_price" if side == 'yes' else "no_price": int(price * 100),  # Cents
        }

        try:
            async with session.post(f"{self.KALSHI_API_BASE}/portfolio/orders", json=order) as resp:
                if resp.status in (200, 201):
                    data = await resp.json()
                    return data.get('order', {}).get('order_id')
                else:
                    error = await resp.text()
                    print(f"Order failed: {resp.status} - {error}")
        except Exception as e:
            print(f"Error placing order: {e}")
        return None

    async def get_positions_live(self) -> List[dict]:
        """Get current positions from Kalshi."""
        session = await self._get_session()
        try:
            async with session.get(f"{self.KALSHI_API_BASE}/portfolio/positions") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get('market_positions', [])
        except Exception as e:
            print(f"Error fetching positions: {e}")
        return []

    # =========================================================================
    # TRADING LOGIC
    # =========================================================================

    def can_trade(self) -> tuple[bool, str]:
        """Check if trading is allowed."""
        self.state.reset_daily()

        if self.state.daily_pnl <= self.daily_loss_limit:
            return False, f"Daily loss limit hit (${self.state.daily_pnl:.2f})"

        if self.state.daily_trades >= self.max_daily_trades:
            return False, f"Max daily trades hit ({self.state.daily_trades})"

        return True, "OK"

    async def evaluate_signal(
        self,
        ticker: str,
        horizon: str,
        features: pd.DataFrame,
        market_price: float,
        yes_ask: float,
        no_ask: float
    ) -> Optional[Position]:
        """Evaluate a trading signal and potentially open a position.

        Returns Position if trade was opened, None otherwise.
        """
        # Check if we can trade
        can, reason = self.can_trade()
        if not can:
            return None

        # Check if already have position
        if ticker in self.state.positions:
            return None

        # Get model prediction
        result = self.router.predict(features, horizon, market_price)

        if not result.trade:
            return None

        # Determine entry price based on direction
        if result.direction == 'YES':
            side = 'yes'
            entry_price = yes_ask
        else:
            side = 'no'
            entry_price = no_ask

        # Calculate quantity (contracts are $1 each if won)
        # entry_price is in [0, 1], cost = entry_price per contract
        quantity = max(1, int(self.max_position_usd / entry_price))

        # Execute trade
        order_id = None
        if self.mode == TradingMode.LIVE:
            order_id = await self.place_order_live(ticker, side, quantity, entry_price)
            if order_id is None:
                print(f"  [LIVE] Order failed for {ticker}")
                return None

        # Create position
        position = Position(
            ticker=ticker,
            side=side,
            quantity=quantity,
            entry_price=entry_price,
            entry_time=datetime.now(timezone.utc).isoformat(),
            horizon=horizon,
            model_prob=result.probability,
            market_prob=market_price,
            edge=result.edge,
            order_id=order_id
        )

        self.state.positions[ticker] = position
        self.state.daily_trades += 1
        self._save_state()

        mode_str = "PAPER" if self.mode == TradingMode.PAPER else "LIVE"
        cost = entry_price * quantity
        print(f"  [{mode_str}] OPENED {side.upper()} {ticker} x{quantity} @ ${entry_price:.2f} "
              f"(cost=${cost:.2f}, edge={result.edge:.3f})")

        return position

    async def check_settlements(self):
        """Check for settled markets and close positions."""
        if not self.state.positions:
            return

        closed = []

        for ticker, position in list(self.state.positions.items()):
            market = await self.get_market(ticker)
            if not market:
                continue

            status = market.get('status')
            result = market.get('result')

            if status == 'settled' and result in ('yes', 'no'):
                # Calculate P&L
                won = (position.side == result)
                exit_price = 1.0 if won else 0.0
                pnl = (exit_price - position.entry_price) * position.quantity

                # Update state
                self.state.daily_pnl += pnl
                self.state.total_pnl += pnl
                self.state.total_trades += 1
                if won:
                    self.state.winning_trades += 1
                else:
                    self.state.losing_trades += 1

                # Log trade
                trade = Trade(
                    ticker=ticker,
                    side=position.side,
                    quantity=position.quantity,
                    entry_price=position.entry_price,
                    entry_time=position.entry_time,
                    exit_price=exit_price,
                    exit_time=datetime.now(timezone.utc).isoformat(),
                    outcome=result,
                    pnl=pnl,
                    horizon=position.horizon,
                    model_prob=position.model_prob,
                    market_prob=position.market_prob,
                    edge=position.edge,
                    mode=self.mode.value
                )
                self._log_trade(trade)
                closed.append(ticker)

                mode_str = "PAPER" if self.mode == TradingMode.PAPER else "LIVE"
                outcome_str = "WON" if won else "LOST"
                print(f"  [{mode_str}] CLOSED {ticker}: {outcome_str} ${pnl:+.2f} "
                      f"(daily=${self.state.daily_pnl:+.2f}, total=${self.state.total_pnl:+.2f})")

        # Remove closed positions
        for ticker in closed:
            del self.state.positions[ticker]

        if closed:
            self._save_state()

    def print_status(self):
        """Print current trading status."""
        self.state.reset_daily()

        win_rate = (self.state.winning_trades / self.state.total_trades * 100
                    if self.state.total_trades > 0 else 0)

        print("\n" + "=" * 60)
        print(f"TRADER STATUS [{self.mode.value.upper()}]")
        print("=" * 60)
        print(f"  Open positions:  {len(self.state.positions)}")
        print(f"  Daily trades:    {self.state.daily_trades}/{self.max_daily_trades}")
        print(f"  Daily P&L:       ${self.state.daily_pnl:+.2f} (limit: ${self.daily_loss_limit})")
        print(f"  Total P&L:       ${self.state.total_pnl:+.2f}")
        print(f"  Total trades:    {self.state.total_trades}")
        print(f"  Win rate:        {win_rate:.1f}% ({self.state.winning_trades}W/{self.state.losing_trades}L)")

        if self.state.positions:
            print("\n  Open Positions:")
            for ticker, pos in self.state.positions.items():
                print(f"    {ticker}: {pos.side.upper()} x{pos.quantity} @ ${pos.entry_price:.2f}")
        print()


class TradingLoop:
    """Main trading loop that integrates streaming and execution."""

    def __init__(self, trader: KalshiTrader, interval: int = 30):
        self.trader = trader
        self.interval = interval
        self.running = False

    async def run(self):
        """Run the trading loop."""
        from kalshi_stream import MarketStreamer, KalshiClient
        from coinbase_price_source import CoinbaseMidPriceSource

        self.running = True

        print(f"\nStarting trading loop ({self.trader.mode.value} mode)...")
        print(f"  Interval: {self.interval}s")
        print(f"  Max position: ${self.trader.max_position_usd}")
        print(f"  Daily loss limit: ${self.trader.daily_loss_limit}")

        self.trader.print_status()

        # Initialize data sources
        assets = ["BTC", "ETH", "SOL"]
        price_source = CoinbaseMidPriceSource(assets=assets)
        price_source.start()

        kalshi = KalshiClient()

        # Wait for initialization
        print("Waiting for price feed...")
        await asyncio.sleep(5)

        try:
            while self.running:
                loop_start = time.time()

                # Check settlements first
                await self.trader.check_settlements()

                # Get current markets
                for asset in assets:
                    markets = await kalshi.get_markets(asset)
                    if not markets:
                        continue

                    for market in markets:
                        ticker = market.get('ticker', '')

                        # Skip if already have position
                        if ticker in self.trader.state.positions:
                            continue

                        # Get market details
                        close_time_str = market.get('close_time', '')
                        if not close_time_str:
                            continue

                        try:
                            close_time = datetime.fromisoformat(close_time_str.replace('Z', '+00:00'))
                        except:
                            continue

                        now = datetime.now(timezone.utc)
                        mins_to_expiry = (close_time - now).total_seconds() / 60

                        # Check if at a horizon we trade
                        horizon = None
                        for h in [60, 30, 15]:
                            if h - 1 <= mins_to_expiry <= h + 1:
                                horizon = f"T-{h}"
                                break

                        if not horizon:
                            continue

                        # Get orderbook
                        orderbook = await kalshi.get_orderbook(ticker)
                        if not orderbook:
                            continue

                        yes_bid = orderbook.get('yes', {}).get('bid', 0.5)
                        yes_ask = orderbook.get('yes', {}).get('ask', 0.5)
                        no_ask = 1.0 - yes_bid  # NO ask = 1 - YES bid
                        market_price = (yes_bid + yes_ask) / 2

                        # Get spot price
                        product_id = {"BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD"}.get(asset)
                        book = price_source.books.get(product_id)
                        if not book or not book.initialized:
                            continue

                        spot_price = book.get_mid()
                        if not spot_price:
                            continue

                        # Build features
                        strike = kalshi.parse_strike(market)
                        if not strike:
                            continue

                        features = pd.DataFrame([{
                            'spot_price': spot_price,
                            'strike': strike,
                            'mins_to_expiry': mins_to_expiry,
                            'yes_price': market_price,
                            'yes_bid': yes_bid,
                            'yes_ask': yes_ask,
                            'spread': yes_ask - yes_bid,
                            'orderbook_imbalance': book.get_top_imbalance(),
                            'horizon': horizon
                        }])

                        # Evaluate signal
                        await self.trader.evaluate_signal(
                            ticker=ticker,
                            horizon=horizon,
                            features=features,
                            market_price=market_price,
                            yes_ask=yes_ask,
                            no_ask=no_ask
                        )

                # Sleep until next interval
                elapsed = time.time() - loop_start
                sleep_time = max(1, self.interval - elapsed)
                await asyncio.sleep(sleep_time)

        except KeyboardInterrupt:
            print("\nShutting down...")
        finally:
            self.running = False
            price_source.stop()
            await self.trader.close()
            self.trader.print_status()


def show_trades(log_path: Path):
    """Display trade history with statistics."""
    if not log_path.exists():
        print(f"No trades found at {log_path}")
        return

    trades = []
    with open(log_path) as f:
        for line in f:
            if line.strip():
                trades.append(json.loads(line))

    if not trades:
        print("No trades in log")
        return

    df = pd.DataFrame(trades)

    print("\n" + "=" * 70)
    print("TRADE HISTORY")
    print("=" * 70)

    print(f"\nTotal trades: {len(df)}")
    print(f"Total P&L: ${df['pnl'].sum():+.2f}")
    print(f"Win rate: {(df['pnl'] > 0).mean() * 100:.1f}%")
    print(f"Avg P&L per trade: ${df['pnl'].mean():+.2f}")
    print(f"Best trade: ${df['pnl'].max():+.2f}")
    print(f"Worst trade: ${df['pnl'].min():+.2f}")

    # By horizon
    print("\nBy Horizon:")
    for horizon in df['horizon'].unique():
        h_df = df[df['horizon'] == horizon]
        print(f"  {horizon}: {len(h_df)} trades, ${h_df['pnl'].sum():+.2f} P&L, "
              f"{(h_df['pnl'] > 0).mean() * 100:.1f}% win rate")

    # By mode
    print("\nBy Mode:")
    for mode in df['mode'].unique():
        m_df = df[df['mode'] == mode]
        print(f"  {mode}: {len(m_df)} trades, ${m_df['pnl'].sum():+.2f} P&L")

    # Recent trades
    print("\nRecent Trades:")
    print("-" * 70)
    for _, trade in df.tail(10).iterrows():
        outcome = "WON" if trade['pnl'] > 0 else "LOST"
        print(f"  {trade['entry_time'][:19]} {trade['ticker']} {trade['side'].upper()} "
              f"${trade['pnl']:+.2f} ({outcome}) [{trade['horizon']}]")


def main():
    parser = argparse.ArgumentParser(description="Kalshi Trade Execution")
    parser.add_argument("--models-dir", type=Path, default=Path("./kalshi_horizon_models"),
                        help="Directory containing horizon models")
    parser.add_argument("--paper", action="store_true", default=True,
                        help="Paper trading mode (default)")
    parser.add_argument("--live", action="store_true",
                        help="Live trading mode (real money!)")
    parser.add_argument("--max-position", type=float, default=10.0,
                        help="Max position size in USD (default: $10)")
    parser.add_argument("--daily-limit", type=float, default=-50.0,
                        help="Daily loss limit in USD (default: -$50)")
    parser.add_argument("--interval", type=int, default=30,
                        help="Trading loop interval in seconds")
    parser.add_argument("--show-trades", type=Path,
                        help="Show trade history from log file")
    parser.add_argument("--status", action="store_true",
                        help="Show current trader status and exit")

    args = parser.parse_args()

    # Show trades mode
    if args.show_trades:
        show_trades(args.show_trades)
        return

    # Determine mode
    mode = TradingMode.LIVE if args.live else TradingMode.PAPER

    if mode == TradingMode.LIVE:
        print("\n" + "!" * 60)
        print("WARNING: LIVE TRADING MODE - REAL MONEY AT RISK")
        print("!" * 60)
        confirm = input("Type 'yes' to confirm: ")
        if confirm.lower() != 'yes':
            print("Aborted.")
            return

    # Load router
    print(f"\nLoading models from {args.models_dir}...")
    router = HorizonRouter(args.models_dir)

    # Status mode
    if args.status:
        trader = KalshiTrader(router, mode)
        trader.print_status()
        return

    # Create trader
    trader = KalshiTrader(
        router=router,
        mode=mode,
        max_position_usd=args.max_position,
        daily_loss_limit=args.daily_limit
    )

    # Run trading loop
    loop = TradingLoop(trader, interval=args.interval)
    asyncio.run(loop.run())


if __name__ == "__main__":
    main()
