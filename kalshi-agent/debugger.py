#!/usr/bin/env python3
"""
Kalshi AI Self-Debugger
=======================
Runs after losses. Deep forensics on what went wrong.
Appends rules to strategy, lessons to lessons.md.

Usage:
    python debugger.py              # Debug latest losses
    python debugger.py --last 5     # Debug last 5 losses
"""

import argparse
import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from ai import ask
from config import BRAIN_MODEL, BRAIN_DIR, LOGS_DIR, STATE_FILE


def ts() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_brain() -> dict[str, str]:
    brain = {}
    for f in sorted(BRAIN_DIR.glob("*.md")):
        brain[f.stem] = f.read_text()
    return brain


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def load_recent_losses(n: int = 5) -> list[dict]:
    """Load only losses that haven't been debugged yet."""
    trades_file = LOGS_DIR / "trades.jsonl"
    if not trades_file.exists():
        return []

    state = load_state()
    debugged = set(state.get("debugged_losses", []))

    losses = []
    for line in trades_file.read_text().strip().split("\n"):
        if not line:
            continue
        try:
            entry = json.loads(line)
            if entry.get("type") == "settlement" and not entry.get("won"):
                # Unique key: ticker + entry_time
                key = f"{entry.get('ticker')}@{entry.get('entry_time', entry.get('ts'))}"
                if key not in debugged:
                    losses.append(entry)
        except json.JSONDecodeError:
            continue
    return losses[-n:]


def find_matching_trade(loss: dict, all_entries: list[dict]) -> dict | None:
    ticker = loss.get("ticker")
    for entry in all_entries:
        if (entry.get("type") == "trade"
                and entry.get("ticker") == ticker
                and entry.get("side") == loss.get("side")):
            return entry
    return None


async def debug_losses(last_n: int):
    losses = load_recent_losses(last_n)
    if not losses:
        print("No losses to debug.")
        return

    print(f"[{ts()}] Debugging {len(losses)} losses")

    all_entries = []
    trades_file = LOGS_DIR / "trades.jsonl"
    if trades_file.exists():
        for line in trades_file.read_text().strip().split("\n"):
            if line:
                try:
                    all_entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

    enriched_losses = []
    for loss in losses:
        original = find_matching_trade(loss, all_entries)
        enriched_losses.append({"loss": loss, "original_trade": original})

    brain = load_brain()
    brain_context = "\n\n".join(
        f"### {name}.md\n{content}" for name, content in brain.items()
    )

    text = ask(
        model=BRAIN_MODEL,
        system=f"""You are debugging your own trading losses. Be ruthlessly analytical.

YOUR CURRENT BRAIN:
{brain_context}

For each loss, analyze:
1. What was your thesis? Was it reasonable?
2. What information did you miss or misjudge?
3. Was this bad luck (thesis was right, just wrong timing) or bad analysis?
4. What specific rule or check would have prevented this loss?
5. Is there a pattern across multiple losses?

CONSTRAINTS:
- Only propose rules that use data available from the Kalshi API (prices, orderbook, volume, timestamps).
- Do NOT propose rules requiring external APIs (BRTI feed, Databento, Polymarket, etc.) — you can't access those.
- Keep proposed rules short and actionable (one sentence each).
- Max 2 new rules per debug session. Quality over quantity.

Respond with JSON:
{{
  "per_loss": [
    {{
      "ticker": "...",
      "diagnosis": "what went wrong (1-2 sentences)",
      "category": "bad_thesis|bad_timing|bad_sizing|no_edge|bad_luck",
      "preventable": true/false,
      "proposed_rule": "specific rule to add to strategy.md (or null)"
    }}
  ],
  "pattern_analysis": "overall patterns (1-2 sentences)",
  "lessons_update": "text to APPEND to lessons.md (new lessons only, max 200 chars)",
  "strategy_rules": ["max 2 new actionable rules"]
}}""",
        user=json.dumps(enriched_losses, indent=2),
        max_tokens=4096,
    )

    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```", "", text)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        print("  Could not parse debug response.")
        return

    try:
        debug = json.loads(m.group())
    except json.JSONDecodeError:
        print("  JSON parse error.")
        return

    for pl in debug.get("per_loss", []):
        status = "PREVENTABLE" if pl.get("preventable") else "bad luck"
        print(f"  {pl.get('ticker')}: [{pl.get('category')}] {status}")
        print(f"    {pl.get('diagnosis', '')[:100]}")
        if pl.get("proposed_rule"):
            print(f"    RULE: {pl['proposed_rule']}")

    print(f"\n  PATTERNS: {debug.get('pattern_analysis', 'none')[:200]}")

    new_lessons = debug.get("lessons_update", "")
    if new_lessons:
        lessons_file = BRAIN_DIR / "lessons.md"
        current = lessons_file.read_text()
        lessons_file.write_text(current + f"\n\n## Debug Session {ts()}\n{new_lessons}")
        print(f"\n  Appended {len(new_lessons)} chars to lessons.md")

    new_rules = debug.get("strategy_rules", [])
    if new_rules:
        strat_file = BRAIN_DIR / "strategy.md"
        current = strat_file.read_text()
        rules_text = "\n".join(f"- {r}" for r in new_rules)
        strat_file.write_text(current + f"\n\n## Rules Added {ts()}\n{rules_text}")
        print(f"  Added {len(new_rules)} rules to strategy.md")

    # Mark these losses as debugged so we don't re-analyze them
    state = load_state()
    debugged = state.get("debugged_losses", [])
    for loss in losses:
        key = f"{loss.get('ticker')}@{loss.get('entry_time', loss.get('ts'))}"
        if key not in debugged:
            debugged.append(key)
    state["debugged_losses"] = debugged
    save_state(state)

    LOGS_DIR.mkdir(exist_ok=True)
    with open(LOGS_DIR / "debug.jsonl", "a") as f:
        f.write(json.dumps({"ts": ts(), **debug}) + "\n")

    print(f"\n[{ts()}] Debug complete.")


def main():
    parser = argparse.ArgumentParser(description="Kalshi AI Self-Debugger")
    parser.add_argument("--last", type=int, default=5)
    args = parser.parse_args()
    asyncio.run(debug_losses(last_n=args.last))


if __name__ == "__main__":
    main()
