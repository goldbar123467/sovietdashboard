#!/usr/bin/env python3
"""
Kalshi AI Trading Agent
=======================
Runs on cron. BTC 15-min NO markets first, then anything else the AI likes.
Haiku scouts. Opus decides. 2 trades/hour hard cap.

Usage:
    python agent.py              # Paper mode (default)
    python agent.py --live       # Real money
    python agent.py --dry-run    # Just scan, no trades
"""

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

from ai import ask
from kalshi_api import KalshiAPI
from config import (
    BRAIN_MODEL, SCOUT_MODEL, MAX_CONTRACTS, MAX_DAILY_LOSS_CENTS,
    MAX_OPEN_POSITIONS, SCAN_LIMIT, BRAIN_DIR, LOGS_DIR, STATE_FILE,
    KALSHI_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY,
    HOME_PREFIX, HOME_MAX_MINS, HOME_SIDE, MAX_TRADES_PER_HOUR,
)


# ── Helpers ──────────────────────────────────────────────────────────────

def ts() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_brain() -> dict[str, str]:
    brain = {}
    for f in sorted(BRAIN_DIR.glob("*.md")):
        brain[f.stem] = f.read_text()
    return brain


def log(entry: dict):
    LOGS_DIR.mkdir(exist_ok=True)
    with open(LOGS_DIR / "trades.jsonl", "a") as f:
        f.write(json.dumps({"ts": ts(), **entry}) + "\n")


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"daily_pnl_cents": 0, "last_reset": "", "open_positions": [],
            "hourly_trades": []}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def reset_daily(state: dict) -> dict:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if state.get("last_reset") != today:
        state["daily_pnl_cents"] = 0
        state["last_reset"] = today
    return state


def trades_this_hour(state: dict) -> int:
    """Count trades placed in the current hour."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = [t for t in state.get("hourly_trades", []) if t > cutoff]
    state["hourly_trades"] = recent  # prune old entries
    return len(recent)


def record_trade_time(state: dict):
    state.setdefault("hourly_trades", []).append(ts())


def extract_json_array(text: str) -> list | None:
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = re.sub(r"```", "", cleaned)
    m = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    print(f"  WARN: could not parse AI response ({len(text)} chars)")
    return None


def mins_to_close(market: dict) -> float | None:
    """Minutes until market closes. None if unparseable."""
    close_time = market.get("close_time") or market.get("expected_expiration_time")
    if not close_time:
        return None
    try:
        if close_time.endswith("Z"):
            close_time = close_time[:-1] + "+00:00"
        close_dt = datetime.fromisoformat(close_time)
        if close_dt.tzinfo is None:
            close_dt = close_dt.replace(tzinfo=timezone.utc)
        delta = (close_dt - datetime.now(timezone.utc)).total_seconds() / 60
        return delta
    except (ValueError, TypeError):
        return None


def is_home_market(market: dict) -> bool:
    """Is this a BTC market closing within 15 min?"""
    ticker = market.get("ticker", "")
    if not ticker.startswith(HOME_PREFIX):
        return False
    mins = mins_to_close(market)
    return mins is not None and 0 < mins <= HOME_MAX_MINS


# ── Scout: Haiku picks from pre-filtered markets ────────────────────────

async def scout_markets(api: KalshiAPI, home_markets: list[dict],
                        other_markets: list[dict]) -> list[dict]:
    """Scout gets home markets (BTC <15m) + others. Picks best candidates."""
    # Always include all home markets — they're the priority
    # Scout filters the "other" pool for anything else interesting
    if not other_markets:
        return home_markets

    summaries = []
    for m in other_markets:
        summaries.append({
            "ticker": m.get("ticker"),
            "title": m.get("title"),
            "yes_price": m.get("yes_price"),
            "volume": m.get("volume"),
            "close_time": m.get("close_time"),
            "category": m.get("category", ""),
        })

    text = ask(
        model=SCOUT_MODEL,
        system=(
            "You are a market scanner for a prediction market trading bot. "
            "The bot already has its priority markets (BTC 15-min). "
            "From this OTHER pool, pick any markets worth a look — liquid, "
            "closing soon-ish, prices not at extremes, and where you can form a thesis. "
            "Return ONLY a JSON array of ticker strings. Max 10. No explanation."
        ),
        user=json.dumps(summaries),
        max_tokens=1500,
    )

    tickers = extract_json_array(text) or []
    ticker_set = set(tickers)
    scouted = [m for m in other_markets if m.get("ticker") in ticker_set]

    # Home markets first, then scouted others
    return home_markets + scouted


# ── Brain: Opus makes trade decisions ────────────────────────────────────

async def brain_decide(api: KalshiAPI, candidates: list[dict],
                       brain: dict, state: dict,
                       slots_left: int) -> list[dict]:
    enriched = []
    home_tickers = set()
    for m in candidates:
        ob = await api.get_orderbook(m["ticker"])
        is_home = is_home_market(m)
        if is_home:
            home_tickers.add(m.get("ticker"))
        enriched.append({
            "ticker": m.get("ticker"),
            "title": m.get("title"),
            "subtitle": m.get("subtitle", ""),
            "yes_price": m.get("yes_price"),
            "no_price": m.get("no_price"),
            "volume": m.get("volume"),
            "open_interest": m.get("open_interest"),
            "close_time": m.get("close_time"),
            "mins_to_close": mins_to_close(m),
            "category": m.get("category", ""),
            "is_btc_15min": is_home,
            "orderbook": ob,
        })

    brain_context = "\n\n".join(
        f"### {name}.md\n{content}" for name, content in brain.items()
    )
    open_pos = state.get("open_positions", [])
    daily_pnl = state.get("daily_pnl_cents", 0)

    text = ask(
        model=BRAIN_MODEL,
        system=f"""You are an autonomous AI trader on Kalshi prediction markets.

YOUR DIRECTIVE:
Your home base is BTC 15-minute crypto markets. For these (is_btc_15min=true),
you ONLY bet NO. This is your bread and butter — scan them first, trade them
if the setup is right. For any other market, you can bet YES or NO freely.

You have {slots_left} trade slot(s) left this hour (hard cap: {MAX_TRADES_PER_HOUR}/hr).
Prioritize BTC 15-min NO trades. Use remaining slots on other markets only if
you see clear edge.

YOUR BRAIN (accumulated knowledge):
{brain_context}

CURRENT STATE:
- Open positions: {json.dumps(open_pos)}
- Daily P&L: {daily_pnl} cents (${daily_pnl/100:.2f})
- Daily loss limit: {MAX_DAILY_LOSS_CENTS} cents
- Max open positions: {MAX_OPEN_POSITIONS}
- Current open count: {len(open_pos)}
- Max contracts per trade: {MAX_CONTRACTS}
- Trades left this hour: {slots_left}
- Current time (UTC): {ts()}

RULES:
- Prices are in cents. 50 = 50% implied probability = $0.50 per contract.
- BUY NO means you profit when the event does NOT happen.
- BUY YES means you profit when the event DOES happen.
- For BTC 15-min markets: NO ONLY. Do not output buy_yes for these.
- For other markets: buy_yes or buy_no are both fine.
- Be SELECTIVE. Skipping is always fine. Explain every decision.

Respond with ONLY a JSON array:
[
  {{
    "ticker": "TICKER",
    "action": "buy_yes" | "buy_no" | "skip",
    "contracts": 1-{MAX_CONTRACTS},
    "price_cents": <your limit price 1-99>,
    "reasoning": "why"
  }}
]""",
        user=(
            f"Analyze these {len(enriched)} markets. "
            f"You have {slots_left} trade(s) left this hour.\n\n"
            f"{json.dumps(enriched, indent=2)}"
        ),
        max_tokens=4096,
    )

    decisions = extract_json_array(text) or []

    # ── Hard enforcement: NO-only on BTC 15-min, price floor, cap trades ──
    enforced = []
    trade_count = 0
    for d in decisions:
        ticker = d.get("ticker", "")
        action = d.get("action", "skip")
        price = d.get("price_cents", 0)

        # BTC 15-min: block buy_yes, force skip if AI tried it
        if ticker in home_tickers and action == "buy_yes":
            d["action"] = "skip"
            d["reasoning"] = f"[BLOCKED] buy_yes not allowed on BTC 15-min. " + d.get("reasoning", "")
            print(f"  BLOCKED buy_yes on {ticker} — NO only on home markets")

        # Hard price floor: never buy NO under 10¢ on home markets
        if ticker in home_tickers and action == "buy_no" and price < 10:
            d["action"] = "skip"
            d["reasoning"] = f"[FLOOR] NO price {price}¢ < 10¢ minimum. " + d.get("reasoning", "")
            print(f"  FLOOR {ticker} — NO@{price}¢ too cheap, consensus too strong")

        # Enforce hourly cap
        if d.get("action") != "skip":
            if trade_count >= slots_left:
                d["action"] = "skip"
                d["reasoning"] = f"[CAPPED] hourly limit reached. " + d.get("reasoning", "")
                print(f"  CAPPED {ticker} — {MAX_TRADES_PER_HOUR}/hr limit hit")
            else:
                trade_count += 1

        enforced.append(d)

    return enforced


# ── Execute ──────────────────────────────────────────────────────────────

async def execute(api: KalshiAPI, decisions: list[dict], state: dict,
                  live: bool) -> dict:
    results = {"trades": 0, "skips": 0, "errors": 0}

    for d in decisions:
        action = d.get("action", "skip")
        ticker = d.get("ticker", "?")
        reasoning = d.get("reasoning", "")

        if action == "skip":
            log({"type": "skip", "ticker": ticker, "reasoning": reasoning})
            results["skips"] += 1
            continue

        side = "yes" if action == "buy_yes" else "no"
        count = min(d.get("contracts", 1), MAX_CONTRACTS)
        price = d.get("price_cents", 50)

        if live:
            try:
                order = await api.place_order(ticker, side, count, price)
                log({
                    "type": "trade", "mode": "live",
                    "ticker": ticker, "side": side,
                    "contracts": count, "price_cents": price,
                    "reasoning": reasoning, "order": order,
                })
                state.setdefault("open_positions", []).append({
                    "ticker": ticker, "side": side,
                    "contracts": count, "price_cents": price,
                    "entry_time": ts(), "reasoning": reasoning,
                })
                record_trade_time(state)
                results["trades"] += 1
            except Exception as e:
                log({"type": "error", "ticker": ticker, "error": str(e)})
                results["errors"] += 1
        else:
            log({
                "type": "trade", "mode": "paper",
                "ticker": ticker, "side": side,
                "contracts": count, "price_cents": price,
                "reasoning": reasoning,
            })
            state.setdefault("open_positions", []).append({
                "ticker": ticker, "side": side,
                "contracts": count, "price_cents": price,
                "entry_time": ts(), "reasoning": reasoning,
            })
            record_trade_time(state)
            results["trades"] += 1

    return results


# ── Settlement check ─────────────────────────────────────────────────────

async def check_settlements(api: KalshiAPI, state: dict):
    open_pos = state.get("open_positions", [])
    if not open_pos:
        return

    still_open = []
    for pos in open_pos:
        market = await api.get_market(pos["ticker"])
        if not market:
            still_open.append(pos)
            continue

        result = market.get("result", "")
        if result in ("yes", "no"):
            won = (pos["side"] == result)
            pnl_cents = (100 - pos["price_cents"]) if won else -pos["price_cents"]
            total_pnl = pnl_cents * pos["contracts"]
            state["daily_pnl_cents"] = state.get("daily_pnl_cents", 0) + total_pnl

            log({
                "type": "settlement",
                "ticker": pos["ticker"], "side": pos["side"],
                "result": result, "won": won,
                "pnl_cents": total_pnl, "price_cents": pos["price_cents"],
                "contracts": pos["contracts"],
                "reasoning": pos.get("reasoning", ""),
                "entry_time": pos.get("entry_time", ""),
            })
            print(f"  {'WIN' if won else 'LOSS'} {pos['ticker']} "
                  f"side={pos['side']} result={result} "
                  f"pnl={total_pnl}c (${total_pnl/100:.2f})")
        else:
            still_open.append(pos)

    state["open_positions"] = still_open


# ── Main ─────────────────────────────────────────────────────────────────

async def run(live: bool, dry_run: bool):
    if not KALSHI_API_KEY:
        print("FATAL: KALSHI_API_KEY not set.")
        sys.exit(1)
    if not OPENROUTER_API_KEY and not ANTHROPIC_API_KEY:
        print("FATAL: No AI key set. Need OPENROUTER_API_KEY or ANTHROPIC_API_KEY.")
        sys.exit(1)

    api = KalshiAPI()
    state = reset_daily(load_state())

    print(f"[{ts()}] Agent starting ({'LIVE' if live else 'PAPER'}"
          f"{', DRY-RUN' if dry_run else ''})")

    if live:
        bal = await api.get_balance()
        if bal:
            balance_cents = bal.get("balance", 0)
            print(f"  Kalshi balance: ${balance_cents/100:.2f}")
            if balance_cents < 100:
                print("  STOPPED: balance too low.")
                await api.close()
                return
        else:
            print("  WARNING: could not fetch balance. Check API key.")
            await api.close()
            return

    # Hourly rate limit
    hourly = trades_this_hour(state)
    slots_left = MAX_TRADES_PER_HOUR - hourly
    print(f"  Daily P&L: {state.get('daily_pnl_cents', 0)}c  "
          f"Open: {len(state.get('open_positions', []))}  "
          f"Trades this hour: {hourly}/{MAX_TRADES_PER_HOUR}")

    if slots_left <= 0:
        print(f"  STOPPED: hourly trade limit ({MAX_TRADES_PER_HOUR}/hr)")
        save_state(state)
        await api.close()
        return

    if state.get("daily_pnl_cents", 0) <= MAX_DAILY_LOSS_CENTS:
        print(f"  STOPPED: daily loss limit ({state['daily_pnl_cents']}c)")
        save_state(state)
        await api.close()
        return

    try:
        if live:
            real_positions = await api.get_positions()
            real_tickers = {p.get("ticker") for p in real_positions
                           if p.get("position", 0) != 0}
            local_tickers = {p["ticker"] for p in state.get("open_positions", [])}
            if real_tickers - local_tickers:
                print(f"  WARNING: untracked positions: {real_tickers - local_tickers}")

        print("  Checking settlements...")
        await check_settlements(api, state)

        open_count = len(state.get("open_positions", []))
        if open_count >= MAX_OPEN_POSITIONS:
            print(f"  STOPPED: max positions ({open_count})")
            save_state(state)
            await api.close()
            return

        # ── Fetch home markets (targeted) + general markets ─────────
        print("  Fetching markets...")
        home_raw = await api.list_markets(
            status="open", limit=50, series_ticker=HOME_PREFIX
        )
        home_markets = [m for m in home_raw if is_home_market(m)]
        home_tickers_set = {m.get("ticker") for m in home_markets}

        all_markets = await api.list_markets(status="open", limit=SCAN_LIMIT)
        other_markets = [m for m in all_markets
                         if m.get("ticker") not in home_tickers_set]
        print(f"  Found {len(home_markets)} BTC <15min | {len(other_markets)} other")

        if not home_markets and not other_markets:
            print("  No markets. Done.")
            save_state(state)
            await api.close()
            return

        # ── Scout: home markets auto-included, Haiku picks others ────
        print(f"  Scouting with {SCOUT_MODEL}...")
        candidates = await scout_markets(api, home_markets, other_markets)
        print(f"  Total candidates: {len(candidates)} "
              f"({len(home_markets)} home + {len(candidates) - len(home_markets)} scouted)")

        if not candidates:
            print("  Nothing to analyze. Done.")
            save_state(state)
            await api.close()
            return

        # ── Brain decides ────────────────────────────────────────────
        brain = load_brain()
        slots_left = MAX_TRADES_PER_HOUR - trades_this_hour(state)
        print(f"  Deciding with {BRAIN_MODEL} ({slots_left} slots left)...")
        decisions = await brain_decide(api, candidates, brain, state, slots_left)

        trades = [d for d in decisions if d.get("action") != "skip"]
        skips = [d for d in decisions if d.get("action") == "skip"]
        print(f"  Decisions: {len(trades)} trades, {len(skips)} skips")

        if dry_run:
            for d in decisions:
                action = d.get("action", "skip")
                marker = "*" if d.get("ticker", "").startswith(HOME_PREFIX) else " "
                print(f"  {marker} {action:8s} {d.get('ticker', '?'):30s} "
                      f"{d.get('reasoning', '')[:50]}")
            save_state(state)
            await api.close()
            return

        if trades:
            results = await execute(api, decisions, state, live=live)
            print(f"  Executed: {results}")

    except Exception as e:
        log({"type": "crash", "error": str(e)})
        print(f"  CRASH: {e}")
        raise
    finally:
        save_state(state)
        await api.close()

    print(f"[{ts()}] Done. P&L today: {state.get('daily_pnl_cents', 0)}c")


def main():
    parser = argparse.ArgumentParser(description="Kalshi AI Trading Agent")
    parser.add_argument("--live", action="store_true", help="Real money mode")
    parser.add_argument("--dry-run", action="store_true",
                        help="Scan and decide but don't execute")
    args = parser.parse_args()
    asyncio.run(run(live=args.live, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
