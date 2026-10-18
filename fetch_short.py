#!/usr/bin/env python3
"""Short interest de l'onglet Tickers (flottant, actions à découvert, % du flottant, days to cover) -> short_data.js.

Source : Yahoo Finance via yfinance (gratuit, sans clé ; déjà utilisé pour les ETF). Univers : les actions de tickers_data.js
(fetch_industries.py). Rafraîchi par lots (config/short.toml) : à chaque passage, au plus `batch` actions, les tickers du dernier scan post-market
d'abord, puis les jamais vues, puis les plus anciennes ; trop d'erreurs consécutives (Yahoo limite les appels) = arrêt du lot, la suite au passage suivant.
Les valeurs déjà connues ne sont jamais effacées par un échec.

Sortie : window.SHORT = {updated, cols:["flt","sh","pct","dtc","date","at"], rows:{symbole:[...]}}
  date = date du relevé du short interest (AAAA-MM-JJ), at = date du rafraîchissement.
Usage : python fetch_short.py [--batch N] [--symbols AAPL,NVDA]   (--symbols : rafraîchis en premier)
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import mmconfig

HERE = Path(__file__).resolve().parent
OUT = HERE / mmconfig.step("short")["output"]
CFG = mmconfig.load("short")
TICKERS = HERE / mmconfig.load("industries")["output"]["tickers_file"]
COLS = ["flt", "sh", "pct", "dtc", "date", "at"]


def load_js(path):
    text = Path(path).read_text()
    return json.loads(text[text.index("=") + 1:].strip().rstrip(";"))


def universe():
    """Symboles de l'index des tickers (fetch_industries.py)."""
    d = load_js(TICKERS)
    i = d["cols"].index("s")
    return [r[i] for r in d["rows"]]


def previous():
    try:
        d = load_js(OUT)
        return {s: dict(zip(d["cols"], v)) for s, v in d["rows"].items()}
    except (OSError, ValueError, KeyError):
        return {}


def to_row(info, today):
    """Ligne du fichier depuis Ticker.info ; None si Yahoo ne donne ni flottant ni short interest."""
    f = CFG["fields"]
    num = lambda k: info.get(f[k]) if isinstance(info.get(f[k]), (int, float)) and info.get(f[k]) >= 0 else None
    row = {"flt": num("flt"), "sh": num("sh"), "pct": num("pct"), "dtc": num("dtc"), "date": None, "at": today}
    ts = info.get(f["date"])
    if isinstance(ts, (int, float)) and ts > 0:
        row["date"] = datetime.fromtimestamp(ts, timezone.utc).date().isoformat()
    for k in ("flt", "sh"):
        row[k] = int(row[k]) if row[k] is not None else None
    for k in ("pct", "dtc"):
        row[k] = round(row[k], 4) if row[k] is not None else None
    return row if any(row[k] is not None for k in ("flt", "sh", "dtc")) else None


def postmarket_symbols(path=None):
    """Tickers du dernier relevé post-market (postmarket_data.js), à rafraîchir en premier ; [] si absent."""
    try:
        d = load_js(path or HERE / mmconfig.step("postmarket")["output"])
        snap, i = d["snaps"][-1], d["cols"].index("s")
        return [r[i] for r in snap.get("rows", [])]
    except (OSError, ValueError, KeyError, IndexError):
        return []


def pick(symbols, known, n, first=()):
    """Les `n` symboles à rafraîchir : `first` (demandés) d'abord, puis jamais vus, puis du plus ancien au plus récent."""
    first = [s for s in dict.fromkeys(first) if s in set(symbols)]
    rest = sorted((s for s in symbols if s not in set(first)), key=lambda s: (s in known, (known.get(s) or {}).get("at") or ""))
    return (first + rest)[:n]


def yahoo_symbol(sym):
    """Symbole Yahoo : classe d'action avec un tiret (BRK.B -> BRK-B)."""
    return sym.replace(".", "-")


def fetch_info(sym):
    import yfinance as yf
    return yf.Ticker(yahoo_symbol(sym)).info or {}


def run(symbols, known, batch, fetch=fetch_info, sleep=time.sleep, today=None, first=()):
    """Rafraîchit un lot ; renvoie (lignes, nb mises à jour, nb erreurs, arrêté ?)."""
    today = today or datetime.now(timezone.utc).date().isoformat()
    rows, ok, errs, streak, stopped = dict(known), 0, 0, 0, False
    for s in pick(symbols, known, batch, first):
        try:
            r = to_row(fetch(s), today)
            streak = 0
            if r:
                rows[s] = r
                ok += 1
            elif s in rows:
                rows[s]["at"] = today                        # rien chez Yahoo : on note le passage, on garde les valeurs
            else:
                rows[s] = {k: None for k in COLS} | {"at": today}
        except Exception as e:                               # réseau, 429, réponse inattendue : on garde l'ancien
            errs += 1
            streak += 1
            if streak >= CFG["max_errors"]:
                print(f"  {streak} erreurs de suite (dernière : {type(e).__name__}) : arrêt du lot, la suite au prochain passage")
                stopped = True
                break
        sleep(CFG["pause"])
    return {s: v for s, v in rows.items() if s in set(symbols)}, ok, errs, stopped


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--batch", type=int, default=CFG["batch"], help=f"actions rafraîchies au plus ({CFG['batch']})")
    ap.add_argument("--symbols", default="", help="symboles à rafraîchir en premier, séparés par des virgules")
    args = ap.parse_args()
    try:
        symbols = universe()
    except (OSError, ValueError, KeyError):
        sys.exit(f"{TICKERS.name} introuvable : lance python fetch_industries.py.")
    known = previous()
    first = [x.strip().upper() for x in args.symbols.split(",") if x.strip()]
    if CFG.get("postmarket_first"):
        first += postmarket_symbols()            # scan post-market de la veille : fiche complète dans l'onglet Post-market
    rows, ok, errs, stopped = run(symbols, known, args.batch, first=first)
    if ok == 0 and errs:
        sys.exit(f"Yahoo : aucune action rafraîchie ({errs} erreurs) ; {OUT.name} non modifié.")
    payload = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "cols": COLS,
               "rows": {s: [v.get(k) for k in COLS] for s, v in sorted(rows.items())}}
    OUT.write_text("window.SHORT = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n")
    have = sum(1 for v in rows.values() if v.get("dtc") is not None)
    print(f"{ok} actions rafraîchies, {errs} erreurs{' (lot arrêté)' if stopped else ''} ; {len(rows)}/{len(symbols)} connues, "
          f"dont {have} avec days to cover")
    print(f"Écrit : {OUT.name}")


if __name__ == "__main__":
    main()
