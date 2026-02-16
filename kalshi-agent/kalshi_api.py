"""Kalshi API client with RSA key-pair authentication."""

import base64
import time
from pathlib import Path

import aiohttp
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from config import KALSHI_API_KEY, BASE_DIR

KALSHI_BASE = "https://api.elections.kalshi.com"
API_PREFIX = "/trade-api/v2"

# Load RSA private key once at import
_KEY_FILE = BASE_DIR / "kalshi_private_key.pem"
_PRIVATE_KEY = None
if _KEY_FILE.exists():
    _PRIVATE_KEY = serialization.load_pem_private_key(
        _KEY_FILE.read_bytes(), password=None
    )


def _sign(method: str, full_path: str, timestamp_ms: str) -> str:
    """Sign: timestamp_ms + METHOD + /trade-api/v2/path (no query params)."""
    path_clean = full_path.split("?")[0]
    message = f"{timestamp_ms}{method}{path_clean}".encode("utf-8")
    signature = _PRIVATE_KEY.sign(
        message,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.DIGEST_LENGTH,
        ),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("utf-8")


class KalshiAPI:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or KALSHI_API_KEY
        self._session = None

    def _auth_headers(self, method: str, full_path: str) -> dict:
        ts_ms = str(int(time.time() * 1000))
        sig = _sign(method.upper(), full_path, ts_ms)
        return {
            "KALSHI-ACCESS-KEY": self.api_key,
            "KALSHI-ACCESS-SIGNATURE": sig,
            "KALSHI-ACCESS-TIMESTAMP": ts_ms,
            "Content-Type": "application/json",
        }

    async def _sess(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def _get(self, endpoint: str, params: dict = None) -> dict | None:
        """endpoint is relative, e.g. '/markets' or '/portfolio/balance'."""
        full_path = f"{API_PREFIX}{endpoint}"
        s = await self._sess()
        headers = self._auth_headers("GET", full_path)
        url = f"{KALSHI_BASE}{full_path}"
        async with s.get(url, headers=headers, params=params) as r:
            if r.status == 200:
                return await r.json()
            else:
                body = await r.text()
                print(f"  API GET {endpoint} → {r.status}: {body[:150]}")
                return None

    async def _post(self, endpoint: str, json_body: dict) -> dict | None:
        full_path = f"{API_PREFIX}{endpoint}"
        s = await self._sess()
        headers = self._auth_headers("POST", full_path)
        url = f"{KALSHI_BASE}{full_path}"
        async with s.post(url, headers=headers, json=json_body) as r:
            if r.status in (200, 201):
                return await r.json()
            else:
                body = await r.text()
                raise RuntimeError(f"POST {endpoint} → {r.status}: {body[:200]}")

    # ── Markets ──────────────────────────────────────────────────────────

    async def list_markets(self, status="open", limit=200, cursor=None,
                           series_ticker=None) -> list[dict]:
        params = {"status": status, "limit": limit}
        if cursor:
            params["cursor"] = cursor
        if series_ticker:
            params["series_ticker"] = series_ticker
        data = await self._get("/markets", params=params)
        return data.get("markets", []) if data else []

    async def get_market(self, ticker: str) -> dict | None:
        data = await self._get(f"/markets/{ticker}")
        return data.get("market") if data else None

    async def get_orderbook(self, ticker: str) -> dict | None:
        return await self._get(f"/markets/{ticker}/orderbook")

    # ── Portfolio ────────────────────────────────────────────────────────

    async def get_balance(self) -> dict | None:
        return await self._get("/portfolio/balance")

    async def get_positions(self) -> list[dict]:
        data = await self._get("/portfolio/positions")
        return data.get("market_positions", []) if data else []

    async def place_order(self, ticker: str, side: str, count: int,
                          price_cents: int) -> dict | None:
        order = {
            "ticker": ticker,
            "action": "buy",
            "side": side,
            "count": count,
            "type": "limit",
        }
        if side == "yes":
            order["yes_price"] = price_cents
        else:
            order["no_price"] = price_cents

        data = await self._post("/portfolio/orders", order)
        return data.get("order") if data else None

    # ── Settlements ─────────────────────────────────────────────────────

    async def get_settlements(self, limit=100) -> list[dict]:
        data = await self._get("/portfolio/settlements", {"limit": limit})
        return data.get("settlements", []) if data else []
