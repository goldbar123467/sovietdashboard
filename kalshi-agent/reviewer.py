#!/usr/bin/env python3
"""
Kalshi AI Self-Reviewer
=======================
Runs on cron (hourly). Reads trade logs, checks outcomes, sends everything
to Opus for analysis, and lets the AI rewrite its own brain files.

Usage:
    python reviewer.py                # Review last 24h
    python reviewer.py --hours 48     # Review last 48h
    python reviewer.py --full         # Review all history
"""

import argparse
import asyncio
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

from ai import ask
from config import BRAIN_MODEL, BRAIN_DIR, LOGS_DIR


def ts() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_brain() -> dict[str, str]:
    brain = {}
    for f in sorted(BRAIN_DIR.glob("*.md")):
        brain[f.stem] = f.read_text()
    return brain


def load_trades(hours: int = 24, full: bool = False) -> list[dict]:
    trades_file = LOGS_DIR / "trades.jsonl"
    if not trades_file.exists():
        return []
    cutoff = None
    if not full:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    entries = []
    for line in trades_file.read_text().strip().split("\n"):
        if not line:
            continue
        try:
            entry = json.loads(line)
            if cutoff and entry.get("ts", "") < cutoff:
                continue
            entries.append(entry)
        except json.JSONDecodeError:
            continue
    return entries


def log_review(entry: dict):
    LOGS_DIR.mkdir(exist_ok=True)
    with open(LOGS_DIR / "reviews.jsonl", "a") as f:
        f.write(json.dumps({"ts": ts(), **entry}) + "\n")


def compute_stats(entries: list[dict]) -> dict:
    settlements = [e for e in entries if e.get("type") == "settlement"]
    trades = [e for e in entries if e.get("type") == "trade"]
    skips = [e for e in entries if e.get("type") == "skip"]
    errors = [e for e in entries if e.get("type") == "error"]
    wins = [s for s in settlements if s.get("won")]
    losses = [s for s in settlements if not s.get("won")]
    total_pnl = sum(s.get("pnl_cents", 0) for s in settlements)
    return {
        "total_trades": len(trades),
        "total_settled": len(settlements),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": f"{len(wins)/len(settlements)*100:.1f}%" if settlements else "N/A",
        "total_pnl_cents": total_pnl,
        "total_pnl_dollars": f"${total_pnl/100:.2f}",
        "avg_win_cents": (sum(w.get("pnl_cents", 0) for w in wins) // max(len(wins), 1)),
        "avg_loss_cents": (sum(l.get("pnl_cents", 0) for l in losses) // max(len(losses), 1)),
        "skips": len(skips),
        "errors": len(errors),
        "biggest_win": max((w.get("pnl_cents", 0) for w in wins), default=0),
        "biggest_loss": min((l.get("pnl_cents", 0) for l in losses), default=0),
    }


async def run_review(hours: int, full: bool):
    print(f"[{ts()}] Reviewer starting ({'full history' if full else f'last {hours}h'})")

    entries = load_trades(hours=hours, full=full)
    if not entries:
        print("  No trade data to review.")
        return

    brain = load_brain()
    stats = compute_stats(entries)
    print(f"  Entries: {len(entries)}  Settled: {stats['total_settled']}  "
          f"W/L: {stats['wins']}/{stats['losses']}  P&L: {stats['total_pnl_dollars']}")

    settlements = [e for e in entries if e.get("type") == "settlement"]
    recent_trades = [e for e in entries if e.get("type") == "trade"]

    brain_context = "\n\n".join(
        f"### {name}.md\n{content}" for name, content in brain.items()
    )

    text = ask(
        model=BRAIN_MODEL,
        system=f"""You are reviewing your own trading performance to improve.
You are an autonomous AI trader that controls its own memory via markdown files.

YOUR CURRENT BRAIN FILES:
{brain_context}

YOUR PERFORMANCE STATS:
{json.dumps(stats, indent=2)}

YOUR JOB:
1. Analyze the settled trades below. What patterns do you see in wins vs losses?
2. Identify specific mistakes and what you should do differently.
3. Update your brain files with what you've learned.
4. Be BRUTALLY honest. If you're losing, say why. No copium.
5. If you see a market type you're consistently bad at, add a rule to avoid it.
6. If you see a pattern in your wins, double down on that pattern.

RESPOND WITH A JSON OBJECT containing the full updated contents of each brain file you want to change:
{{
  "analysis": "Your free-form analysis of the review period",
  "brain_updates": {{
    "strategy": "FULL new content for strategy.md (or null to leave unchanged)",
    "lessons": "FULL new content for lessons.md (or null to leave unchanged)",
    "performance": "FULL new content for performance.md (or null to leave unchanged)",
    "market-types": "FULL new content for market-types.md (or null to leave unchanged)"
  }}
}}

IMPORTANT:
- Keep each brain file CONCISE — under 2000 chars. Summarize older data, don't repeat it.
- Focus on actionable rules, not analysis paralysis. The goal is to trade, not to write essays.
- Only reference data sources you actually have (market data from Kalshi API). Don't add rules
  requiring external APIs you can't access.
- When updating, distill old lessons into concise takeaways. Drop redundant entries.""",
        user=(
            f"Here are the settled trades and recent activity to review:\n\n"
            f"SETTLEMENTS:\n{json.dumps(settlements, indent=2)}\n\n"
            f"RECENT TRADES (may not be settled yet):\n"
            f"{json.dumps(recent_trades[-30:], indent=2)}"
        ),
        max_tokens=8192,
    )

    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```", "", text)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        print("  Could not parse review response. Logging raw.")
        log_review({"type": "review_raw", "output": text, "stats": stats})
        return

    try:
        review = json.loads(m.group())
    except json.JSONDecodeError:
        print("  JSON parse error. Logging raw.")
        log_review({"type": "review_raw", "output": text, "stats": stats})
        return

    analysis = review.get("analysis", "")
    print(f"\n  ANALYSIS:\n  {analysis[:200]}...")

    updates = review.get("brain_updates", {})
    files_updated = []
    for name, content in updates.items():
        if content is None:
            continue
        (BRAIN_DIR / f"{name}.md").write_text(content)
        files_updated.append(name)
        print(f"  Updated brain/{name}.md ({len(content)} chars)")

    log_review({
        "type": "review", "stats": stats, "analysis": analysis,
        "files_updated": files_updated, "entries_reviewed": len(entries),
    })
    print(f"\n[{ts()}] Review complete. Updated {len(files_updated)} brain files.")


def main():
    parser = argparse.ArgumentParser(description="Kalshi AI Self-Reviewer")
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()
    asyncio.run(run_review(hours=args.hours, full=args.full))


if __name__ == "__main__":
    main()
