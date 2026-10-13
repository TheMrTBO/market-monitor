#!/usr/bin/env python3
"""Market Monitor : telecharge les donnees, calcule le breadth +4% / -4% et ecrit monitor_data.js.

Formules TC2000 (ne pas modifier sans accord) :
    Haussier : ( 100 * (C - C1) / C1 ) >= 4   AND  V >= 100000  AND  V > V1
    Baissier : C / C1 <= 96 / 100              AND  V >= 100000  AND  V > V1

Univers : common stocks (type CS) NYSE / Nasdaq / AMEX, radies inclus.
Source  : Polygon.io (cle dans POLYGON_API_KEY ou dans .env). BTC : Polygon X:BTCUSD ou Binance.
Reprise : l'etat est sauvegarde dans cache/ ; relancer ne telecharge que les nouvelles seances.
"""
import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
STATE_FILE = CACHE / "state.json"
UNIVERSE_FILE = CACHE / "universe.json"
OUT_JS = HERE / "monitor_data.js"
OUT_JSON = HERE / "monitor_data.json"

POLYGON = "https://api.polygon.io"
BINANCE = "https://api.binance.com/api/v3/klines"
EXCHANGES = ("XNYS", "XNAS", "XASE")  # NYSE, Nasdaq, AMEX
UNIVERSE_MAX_AGE_DAYS = 7
NY = ZoneInfo("America/New_York")


class PlanError(Exception):
    """Acces refuse par le plan Polygon (403)."""


# --------------------------------------------------------------------------- client Polygon

class Polygon:
    def __init__(self, key, rate):
        self.key = key
        self.gap = 60.0 / rate if rate > 0 else 0.0
        self.last = 0.0
        self.session = requests.Session()

    def get(self, url, params=None):
        params = dict(params or {})
        params["apiKey"] = self.key
        for attempt in range(6):
            wait = self.last + self.gap - time.monotonic()
            if wait > 0:
                if wait > 5:
                    print(f"  pause {wait:.0f}s (limite d'appels du plan)...", flush=True)
                time.sleep(wait)
            self.last = time.monotonic()
            try:
                r = self.session.get(url, params=params, timeout=60)
            except requests.RequestException as e:
                print(f"  erreur reseau ({e}), nouvel essai...", flush=True)
                time.sleep(5 * (attempt + 1))
                continue
            if r.status_code == 429:
                print("  429 : trop d'appels, pause 60s...", flush=True)
                time.sleep(60)
                continue
            if r.status_code == 401:
                sys.exit("Cle API refusee (401) : verifie POLYGON_API_KEY.")
            if r.status_code == 403:
                raise PlanError(r.text[:200])
            if r.status_code >= 500:
                time.sleep(5 * (attempt + 1))
                continue
            r.raise_for_status()
            return r.json()
        raise RuntimeError(f"Echec apres 6 essais : {url}")

    def pages(self, url, params=None):
        """Itere sur les resultats d'un endpoint pagine (next_url)."""
        data = self.get(url, params)
        while True:
            yield from data.get("results") or []
            nxt = data.get("next_url")
            if not nxt:
                return
            data = self.get(nxt)


# --------------------------------------------------------------------------- utilitaires

def load_env():
    f = HERE / ".env"
    if not f.exists():
        return
    for line in f.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


def save_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, separators=(",", ":")))
    tmp.replace(path)


def last_session_end():
    """Dernier jour dont la cloture US est passee (apres 17h New York)."""
    now = datetime.now(NY)
    d = now.date()
    return d if now.hour >= 17 else d - timedelta(days=1)


def weekdays(start, end):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


# --------------------------------------------------------------------------- univers et splits

def load_universe(api, refresh):
    if UNIVERSE_FILE.exists() and not refresh:
        d = json.loads(UNIVERSE_FILE.read_text())
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(d["fetched"])).days
        if age < UNIVERSE_MAX_AGE_DAYS:
            return set(d["tickers"])
    print("Univers : telechargement des common stocks NYSE/Nasdaq/AMEX (actifs + radies)...", flush=True)
    tickers = set()
    for exchange in EXCHANGES:
        for active in ("true", "false"):
            params = {"market": "stocks", "type": "CS", "exchange": exchange,
                      "active": active, "limit": 1000}
            for t in api.pages(f"{POLYGON}/v3/reference/tickers", params):
                tickers.add(t["ticker"])
    save_json(UNIVERSE_FILE, {"fetched": datetime.now(timezone.utc).isoformat(),
                              "tickers": sorted(tickers)})
    print(f"Univers : {len(tickers)} tickers", flush=True)
    return tickers


def load_splits(api, start, end):
    """{date: {ticker: ratio}} ; ratio = split_to / split_from (2-pour-1 -> 2.0)."""
    out = {}
    params = {"execution_date.gte": start.isoformat(), "execution_date.lte": end.isoformat(),
              "limit": 1000}
    for s in api.pages(f"{POLYGON}/v3/reference/splits", params):
        if s.get("split_from") and s.get("split_to"):
            out.setdefault(s["execution_date"], {})[s["ticker"]] = s["split_to"] / s["split_from"]
    return out


# --------------------------------------------------------------------------- breadth

def grouped(api, d):
    """Barres daily non ajustees de tous les titres US pour la date d : {ticker: (close, volume)}."""
    data = api.get(f"{POLYGON}/v2/aggs/grouped/locale/us/market/stocks/{d.isoformat()}",
                   {"adjusted": "false", "include_otc": "false"})
    return {r["T"]: (r["c"], r["v"]) for r in data.get("results") or []}


def count_breadth(today, prev, universe, splits, threshold, min_vol):
    """Retourne (nb haussiers, nb baissiers) selon les formules TC2000."""
    up = down = 0
    for t, (c, v) in today.items():
        if t not in universe or t not in prev:
            continue
        c1, v1 = prev[t]
        ratio = splits.get(t)
        if ratio:  # split le jour J : veille ajustee (prix / ratio, volume * ratio)
            c1, v1 = c1 / ratio, v1 * ratio
        if c1 <= 0 or v < min_vol or v <= v1:
            continue
        if 100 * (c - c1) / c1 >= threshold:
            up += 1
        elif c / c1 <= (100 - threshold) / 100:
            down += 1
    return up, down


def update_breadth(api, universe, state, start, end, threshold, min_vol):
    """Complete state['breadth'] pour les seances manquantes. Sauvegarde l'etat apres chaque jour."""
    first = date.fromisoformat(state["last_date"]) + timedelta(days=1) if state["last_date"] else start
    days = list(weekdays(first, end))
    if not days:
        print("Breadth : deja a jour.")
        return
    print(f"Breadth : {len(days)} jours ouvres a traiter ({days[0]} -> {days[-1]})", flush=True)
    splits = load_splits(api, days[0], days[-1])
    prev = {t: tuple(x) for t, x in state["prev"].items()}
    try:
        for d in days:
            today = grouped(api, d)
            if not today:  # ferie ou donnees pas encore disponibles
                print(f"{d}  pas de donnees (ferie ?)", flush=True)
                continue
            if prev:
                up, down = count_breadth(today, prev, universe, splits.get(d.isoformat(), {}),
                                         threshold, min_vol)
                state["breadth"][d.isoformat()] = [up, down]
                print(f"{d}  +{threshold:g}%: {up:5d}   -{threshold:g}%: {down:5d}", flush=True)
            else:
                print(f"{d}  seance de depart (sert de veille)", flush=True)
            prev = {t: (c, v) for t, (c, v) in today.items() if t in universe}
            state["prev"] = {t: list(x) for t, x in prev.items()}
            state["last_date"] = d.isoformat()
            save_json(STATE_FILE, state)
    except PlanError as e:
        print(f"\nAcces refuse par ton plan Polygon (403) a la date {d} : {e}\n"
              f"Progression gardee ; reduis --days si la date est trop ancienne.", flush=True)


# --------------------------------------------------------------------------- instruments

def candle(ms, o, h, l, c, v):
    day = datetime.fromtimestamp(ms / 1000, timezone.utc).date().isoformat()
    return {"time": day, "open": o, "high": h, "low": l, "close": c, "volume": v}


def polygon_candles(api, ticker, start, end):
    url = f"{POLYGON}/v2/aggs/ticker/{ticker}/range/1/day/{start.isoformat()}/{end.isoformat()}"
    data = api.get(url, {"adjusted": "true", "sort": "asc", "limit": 50000})
    return [candle(r["t"], r["o"], r["h"], r["l"], r["c"], r["v"]) for r in data.get("results") or []]


def binance_candles(start, end):
    out, since = [], int(datetime.combine(start, datetime.min.time(), timezone.utc).timestamp() * 1000)
    stop = int(datetime.combine(end + timedelta(days=1), datetime.min.time(), timezone.utc).timestamp() * 1000)
    while since < stop:
        r = requests.get(BINANCE, params={"symbol": "BTCUSDT", "interval": "1d",
                                          "startTime": since, "limit": 1000}, timeout=60)
        r.raise_for_status()
        rows = r.json()
        if not rows:
            break
        out += [candle(k[0], float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5])) for k in rows]
        since = rows[-1][0] + 86_400_000
    return out


def fetch_instruments(api, start, end, btc_source):
    out = {}
    for name, ticker in (("IWM", "IWM"), ("QQQ", "QQQ"), ("BTC", "X:BTCUSD")):
        try:
            if name == "BTC" and btc_source == "binance":
                out[name] = binance_candles(start, end)
            else:
                out[name] = polygon_candles(api, ticker, start, end)
            print(f"{name}: {len(out[name])} bougies", flush=True)
        except PlanError as e:
            print(f"{name}: acces refuse par ton plan Polygon ({e})", flush=True)
            out[name] = []
        except requests.RequestException as e:
            print(f"{name}: erreur ({e})", flush=True)
            out[name] = []
    return out


# --------------------------------------------------------------------------- sortie

def build_rows(breadth, start):
    rows, history = [], []
    for d in sorted(k for k in breadth if k >= start.isoformat()):
        up, down = breadth[d]
        history.append((up, down))
        row = {"date": d, "up": up, "down": down, "net": up - down}
        for n in (5, 10):
            window = history[-n:]
            u, dn = sum(x[0] for x in window), sum(x[1] for x in window)
            row[f"ratio{n}"] = round(u / dn, 2) if dn else None
        rows.append(row)
    return rows


def write_outputs(instruments, rows, params):
    payload = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "params": params, "instruments": instruments, "breadth": rows}
    save_json(OUT_JSON, payload)
    OUT_JS.write_text("window.MONITOR_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n")
    print(f"\nEcrit : {OUT_JS.name} et {OUT_JSON.name} ({len(rows)} seances de breadth)")


# --------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=365, help="historique en jours calendaires (365)")
    ap.add_argument("--rate", type=float, default=5, help="appels/min (5 = plan gratuit, 0 = illimite)")
    ap.add_argument("--min-vol", type=int, default=100_000, help="volume minimum (100000)")
    ap.add_argument("--threshold", type=float, default=4, help="seuil en %% (4)")
    ap.add_argument("--btc-source", choices=("polygon", "binance"), default="polygon")
    ap.add_argument("--rebuild", action="store_true", help="repart de zero (ignore le cache)")
    args = ap.parse_args()

    load_env()
    key = os.environ.get("POLYGON_API_KEY")
    if not key:
        sys.exit("Cle API manquante : definis POLYGON_API_KEY (voir .env.example).")

    end = last_session_end()
    start = end - timedelta(days=args.days)
    params = {"threshold": args.threshold, "min_vol": args.min_vol}
    api = Polygon(key, args.rate)

    state = {"params": params, "last_date": None, "breadth": {}, "prev": {}}
    if STATE_FILE.exists() and not args.rebuild:
        old = json.loads(STATE_FILE.read_text())
        if old.get("params") == params:
            state = old
        else:
            print("Parametres changes : reconstruction complete.")

    try:
        universe = load_universe(api, refresh=args.rebuild)
        update_breadth(api, universe, state, start, end, args.threshold, args.min_vol)
        instruments = fetch_instruments(api, start, end, args.btc_source)
    except PlanError as e:
        sys.exit(f"Acces refuse par ton plan Polygon (403) : {e}")
    except KeyboardInterrupt:
        print("\nInterrompu : progression sauvegardee dans cache/, relance pour reprendre.")
        return

    write_outputs(instruments, build_rows(state["breadth"], start), params)


if __name__ == "__main__":
    main()
