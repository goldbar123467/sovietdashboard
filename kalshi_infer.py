#!/usr/bin/env python3
"""
Kalshi Model Inference
======================
Use trained model for live predictions.

Usage:
    python kalshi_infer.py --model ./kalshi_model --stream
    python kalshi_infer.py --model ./kalshi_model --once
"""

import argparse
import asyncio
import json
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone, timedelta

EST = timezone(timedelta(hours=-5))

# Import from the streamer
from kalshi_stream import KalshiStream, BinanceFeed, ASSETS, calc_edge, calc_imbalance, calc_volatility

def load_model(model_dir: Path):
    """Load trained model and feature list"""
    model_path = model_dir / 'kalshi_model.pkl'
    features_path = model_dir / 'feature_cols.json'
    
    with open(model_path, 'rb') as f:
        model = pickle.load(f)
    
    with open(features_path, 'r') as f:
        feature_cols = json.load(f)
    
    return model, feature_cols

def engineer_features_row(row: dict) -> dict:
    """Engineer features for a single row"""
    row = row.copy()
    
    row['moneyness'] = row['spot_price'] / row['strike']
    row['log_moneyness'] = np.log(row['moneyness'])
    row['time_scaled_vol'] = row['vol_annual'] * np.sqrt(row['mins_to_expiry'] / 525600)
    row['bid_ask_mid'] = (row['yes_bid'] + row['yes_ask']) / 2
    row['model_vs_mid'] = row['p_model'] - row['bid_ask_mid']
    row['edge_per_min'] = row['edge'] / max(row['mins_to_expiry'], 0.1)
    row['vol_adjusted_edge'] = row['edge'] / max(row['vol_annual'], 0.01)
    row['spread_pct'] = row['spread'] / max(row['yes_price'], 0.01)
    row['strike_distance_vol'] = row['log_moneyness'] / max(row['time_scaled_vol'], 0.001)
    
    return row

async def get_live_features(asset: str, kalshi: KalshiStream, binance: BinanceFeed) -> dict:
    """Get current features for an asset"""
    now = datetime.now(timezone.utc)
    
    # Spot price and vol
    spot = await binance.get_price(asset)
    vol = binance.get_vol(asset)
    
    # Kalshi markets
    prefix = ASSETS[asset]["kalshi_prefix"]
    markets = await kalshi.get_markets(prefix)
    
    if not markets:
        return None
    
    # Find best market (closest to spot)
    valid = []
    for m in markets:
        strike = kalshi.parse_strike(m)
        if not strike:
            continue
        close_str = m.get("close_time", "")
        try:
            close_time = datetime.fromisoformat(close_str.replace("Z", "+00:00"))
        except:
            continue
        if close_time > now:
            valid.append((m, strike, close_time))

    if not valid:
        return None

    valid.sort(key=lambda x: abs(x[1] - spot))
    market, strike, close_time = valid[0]
    
    # Prices
    yes_price = market.get("yes_bid", 50) / 100
    yes_bid = market.get("yes_bid", 0) / 100
    yes_ask = market.get("yes_ask", 100) / 100
    spread = yes_ask - yes_bid
    
    # Orderbook
    orderbook = await kalshi.get_orderbook(market["ticker"])
    imbalance = calc_imbalance(orderbook.get("yes", []), orderbook.get("no", []))
    
    # Time to expiry
    mins = max((close_time - now).total_seconds() / 60, 0.1)
    
    # Edge
    raw_edge, logit_edge, p_model = calc_edge(spot, strike, yes_price, vol, mins)
    
    features = {
        'asset': asset,
        'ticker': market['ticker'],
        'spot_price': spot,
        'strike': strike,
        'mins_to_expiry': mins,
        'vol_annual': vol,
        'yes_price': yes_price,
        'yes_bid': yes_bid,
        'yes_ask': yes_ask,
        'spread': spread,
        'orderbook_imbalance': imbalance,
        'p_model': p_model,
        'edge': raw_edge,
        'logit_edge': logit_edge,
    }
    
    return engineer_features_row(features)

def predict(model, feature_cols: list, features: dict) -> tuple[float, str]:
    """Get model prediction"""
    # Build feature vector
    X = pd.DataFrame([features])[feature_cols].fillna(0).replace([np.inf, -np.inf], 0)
    
    prob = model.predict_proba(X)[0, 1]
    pred = "UP" if prob > 0.5 else "DOWN"
    
    return prob, pred

async def run_inference(model_dir: Path, assets: list[str], interval: int, once: bool):
    """Run live inference loop"""
    model, feature_cols = load_model(model_dir)
    print(f"Loaded model with {len(feature_cols)} features")
    
    async with KalshiStream() as kalshi, BinanceFeed() as binance:
        # Bootstrap
        print("Bootstrapping price data...")
        for asset in assets:
            try:
                await binance.bootstrap(asset)
            except:
                pass
        
        print(f"Running inference: {', '.join(assets)}")
        print("=" * 70)
        
        while True:
            now = datetime.now(EST).strftime("%H:%M:%S")
            print(f"\n[{now} EST]")
            
            for asset in assets:
                try:
                    features = await get_live_features(asset, kalshi, binance)
                    if not features:
                        print(f"  {asset}: No active markets")
                        continue
                    
                    prob, pred = predict(model, feature_cols, features)
                    
                    # Compare to baseline
                    baseline = features['yes_price']
                    edge_vs_market = prob - baseline
                    
                    icon = "🟢" if pred == "UP" else "🔴"
                    conf_bar = "█" * int(abs(prob - 0.5) * 40)
                    
                    print(f"  {asset} | {features['ticker']}")
                    print(f"    Spot: ${features['spot_price']:,.2f} | Strike: ${features['strike']:,.2f} | Exp: {features['mins_to_expiry']:.1f}m")
                    print(f"    Market P(up): {baseline:.1%} | Model P(up): {prob:.1%} | Edge: {edge_vs_market:+.1%}")
                    print(f"    {icon} {pred} {conf_bar}")
                    
                except Exception as e:
                    print(f"  {asset}: Error - {e}")
            
            if once:
                break
            
            await asyncio.sleep(interval)

def main():
    parser = argparse.ArgumentParser(description="Kalshi Model Inference")
    parser.add_argument("--model", type=Path, default=Path("./kalshi_model"),
                       help="Model directory")
    parser.add_argument("--assets", nargs="+", choices=["BTC", "ETH", "SOL"],
                       default=["BTC", "ETH", "SOL"])
    parser.add_argument("--interval", type=int, default=60, help="Refresh interval (sec)")
    parser.add_argument("--once", action="store_true", help="Single prediction then exit")
    
    args = parser.parse_args()
    
    asyncio.run(run_inference(args.model, args.assets, args.interval, args.once))

if __name__ == "__main__":
    main()
