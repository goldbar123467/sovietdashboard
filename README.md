# Kalshi AI Trading Agent

AI-powered trading agent for Kalshi prediction markets. Runs on cron every 10 minutes.

## How It Works

- **Scout model** (Haiku) scans open markets for opportunities
- **Brain model** (Opus) makes final trade decisions with reasoning
- **Reviewer** audits positions hourly
- **Debugger** runs health checks every 30 minutes

BTC 15-min NO markets are the home market, plus anything else the AI likes. 2 trades/hour hard cap.

## Setup

```bash
cd kalshi-agent
./setup.sh
cp .env.example .env  # Fill in API keys
```

## Usage

```bash
python agent.py              # Paper mode (default)
python agent.py --live       # Real money
python agent.py --dry-run    # Just scan, no trades
```

## Cron Schedule

```
*/10 * * * * cd ~/kalshi-agent && .venv/bin/python agent.py --live >> logs/cron.log 2>&1
0 * * * *    cd ~/kalshi-agent && .venv/bin/python reviewer.py >> logs/cron.log 2>&1
*/30 * * * * cd ~/kalshi-agent && .venv/bin/python debugger.py >> logs/cron.log 2>&1
```

## Files

- `agent.py` — Main trading loop
- `reviewer.py` — Position auditor
- `debugger.py` — Health checker
- `kalshi_api.py` — Kalshi REST API client
- `ai.py` — LLM interface (OpenRouter/Anthropic)
- `config.py` — Configuration & env vars
- `brain/` — Market knowledge & strategy docs
