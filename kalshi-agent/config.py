import os
from pathlib import Path

# Kalshi API
KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2"
KALSHI_API_KEY = os.environ.get("KALSHI_API_KEY", "")

# AI — OpenRouter primary, Anthropic fallback
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# OpenRouter model IDs
BRAIN_MODEL = "anthropic/claude-opus-4-6"
SCOUT_MODEL = "anthropic/claude-haiku-4-5"

# Anthropic-direct model IDs (fallback)
BRAIN_MODEL_ANTHROPIC = "claude-opus-4-6"
SCOUT_MODEL_ANTHROPIC = "claude-haiku-4-5-20251001"

# ── Hard filters ─────────────────────────────────────────────────────────
# BTC 15-min NO is the priority — always scanned first, NO-only enforced
HOME_PREFIX = "KXBTC15M"    # BTC 15-min price up/down markets
HOME_MAX_MINS = 15          # Only BTC markets closing within 15 min
HOME_SIDE = "no"            # NO only on BTC 15-min markets
MAX_TRADES_PER_HOUR = 2     # Hard cap: 2 plays per hour total

# Trading limits
MAX_CONTRACTS = 2           # max contracts per trade
MAX_DAILY_LOSS_CENTS = -1000  # -$10 hard stop
MAX_OPEN_POSITIONS = 5
SCAN_LIMIT = 200

# Paths
BASE_DIR = Path(__file__).parent
BRAIN_DIR = BASE_DIR / "brain"
LOGS_DIR = BASE_DIR / "logs"
STATE_FILE = BASE_DIR / "state.json"
