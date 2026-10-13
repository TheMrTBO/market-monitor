#!/usr/bin/env python3
"""Telecharge les bougies daily de QQQ, IWM et BTC et ecrit prices_data.js pour le dashboard.

Sources (--source) :
  free     (defaut) QQQ et IWM : Yahoo Finance via yfinance (gratuit, sans cle, historique long) ;
                    BTC : API publique de Coinbase Exchange (BTC-USD, sans cle, historique long).
                    Binance est refuse depuis les serveurs americains (GitHub Actions) ; Kraken ne
                    renvoie que ~720 bougies : Coinbase est donc la source par defaut (--btc-source).
  polygon           Polygon.io / Massive (cle POLYGON_API_KEY) ; le plan gratuit est limite a 2 ans d'historique.
                    BTC : X:BTCUSD, ou Binance avec --btc-source binance.

Les prix de QQQ / IWM sont ceux de la seance (non ajustes des dividendes), comme dans Polygon.
Le debut par defaut (2019-01-01) laisse de la marge pour calculer les moyennes mobiles longues des 2020.
"""
import argparse
import json
import math
import os
import sys
import time
from datetime import date, datetime, time as dtime, timedelta, timezone
from pathlib import Path

import requests

import fetch_data as fd  # client Polygon (cadence, 429, 403) et parseurs de bougies Polygon / Binance

HERE = Path(__file__).resolve().parent
OUT = HERE / "prices_data.js"
YAHOO = {"QQQ": "QQQ", "IWM": "IWM"}
POLYGON = {"QQQ": "QQQ", "IWM": "IWM", "BTC": "X:BTCUSD"}


def yahoo_candles(symbol, start):
    """Bougies daily de Yahoo Finance : [{time, open, high, low, close, volume}], tri chronologique."""
    try:
        import yfinance as yf
    except ImportError:
        sys.exit("Le module yfinance manque : pip install -r requirements.txt (dans le venv du projet).")
    df = yf.Ticker(symbol).history(start=start.isoformat(), interval="1d", auto_adjust=False)
    out = []
    for ts, r in df.iterrows():
        vals = [r["Open"], r["High"], r["Low"], r["Close"]]
        if any(v is None or (isinstance(v, float) and math.isnan(v)) for v in vals):
            continue  # seance sans cotation
        out.append({"time": ts.date().isoformat(), "open": round(float(vals[0]), 4), "high": round(float(vals[1]), 4),
                    "low": round(float(vals[2]), 4), "close": round(float(vals[3]), 4), "volume": float(r["Volume"] or 0)})
    return out


COINBASE = "https://api.exchange.coinbase.com/products/BTC-USD/candles"


def coinbase_candles(start, end):
    """Bougies daily BTC-USD de Coinbase Exchange (API publique) : fenetres de 299 jours (limite : 300 bougies par appel).
    Lignes renvoyees : [time, low, high, open, close, volume], plus recentes d'abord, jours sans echange omis."""
    out = {}
    cur = datetime.combine(start, dtime.min, timezone.utc)
    stop = datetime.combine(end, dtime.min, timezone.utc)
    while cur < stop:
        nxt = min(cur + timedelta(days=299), stop)
        for attempt in range(4):
            r = requests.get(COINBASE, params={"granularity": 86400, "start": cur.isoformat(), "end": nxt.isoformat()},
                             headers={"User-Agent": "market-monitor/1.0"}, timeout=30)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(2 * (attempt + 1))
                continue
            r.raise_for_status()
            break
        else:
            raise RuntimeError("Coinbase : trop d'echecs successifs")
        for t, low, high, op, close, vol in r.json():
            d = datetime.fromtimestamp(t, timezone.utc).date().isoformat()
            out[d] = {"time": d, "open": float(op), "high": float(high), "low": float(low), "close": float(close), "volume": float(vol)}
        cur = nxt
        time.sleep(0.4)                       # reste loin de la limite publique (10 requetes / s)
    return [out[d] for d in sorted(out)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", choices=("free", "polygon"), default="free")
    ap.add_argument("--start", default="2019-01-01", help="premiere date (2019-01-01 : marge pour les MM longues des 2020)")
    ap.add_argument("--rate", type=float, default=5, help="Polygon : appels/min (5 = plan gratuit, 0 = illimite)")
    ap.add_argument("--btc-source", choices=("coinbase", "binance", "polygon"), default=None,
                    help="BTC : coinbase (defaut avec --source free), binance, polygon (defaut avec --source polygon)")
    args = ap.parse_args()
    start, end = date.fromisoformat(args.start), date.today() + timedelta(days=1)
    btc_source = args.btc_source or ("coinbase" if args.source == "free" else "polygon")

    api = None
    if args.source == "polygon":
        fd.load_env()
        key = os.environ.get("POLYGON_API_KEY")
        if not key:
            sys.exit("Cle API manquante : definis POLYGON_API_KEY (voir fetch_data.py).")
        api = fd.Polygon(key, args.rate)

    out = {}
    for name in ("QQQ", "IWM", "BTC"):
        try:
            if name == "BTC" and btc_source == "coinbase":
                bars = coinbase_candles(start, end)
            elif name == "BTC" and btc_source == "binance":
                bars = fd.binance_candles(start, end)
            elif args.source == "free":
                bars = yahoo_candles(YAHOO[name], start)
            else:
                bars = fd.polygon_candles(api, POLYGON[name], start, end)
        except fd.PlanError as e:
            print(f"{name}: acces refuse par ton plan Polygon ({e})")
            bars = []
        # format compact : [date, open, high, low, close, volume]
        out[name] = [[b["time"], b["open"], b["high"], b["low"], b["close"], b["volume"]] for b in bars]
        first = out[name][0][0] if out[name] else "-"
        print(f"{name}: {len(out[name])} bougies (depuis {first})", flush=True)

    empty = [n for n, v in out.items() if not v]
    if empty:                                 # on n'ecrase pas les anciennes donnees avec une serie vide
        sys.exit(f"Series vides ({', '.join(empty)}) : {OUT.name} non modifie.")
    OUT.write_text("window.PRICES = " + json.dumps(out, separators=(",", ":")) + ";\n")
    print(f"Ecrit : {OUT.name} (QQQ/IWM : {'yahoo' if args.source == 'free' else 'polygon'} ; BTC : {btc_source})")


if __name__ == "__main__":
    main()
