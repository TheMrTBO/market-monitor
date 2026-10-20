#!/usr/bin/env python3
"""T2108 relevé sur le screener public TradingView (sans compte ni clé) -> tv_breadth_data.js.

T2108 = part (en %) des actions dont la clôture dépasse leur moyenne mobile simple 40 jours (champ SMA40 du screener,
clôture du jour incluse). Univers : config/sources.toml [tv_breadth] (actions ordinaires NYSE / Nasdaq / AMEX).
TradingView ne fournit aucun historique de cet agrégat : la série se construit un relevé par séance, et sert de seconde
source maison, comparée à Stockbee (et au calcul Polygon de breadth_own.py) dans le dashboard.

Séance relevée = date (heure de New York) de la bougie journalière en cours dans le screener (champ `time`), donc juste
même un jour férié. Le relevé n'est retenu que hors séance régulière (champ `current_session`) et au moins
`delay_minutes` après la clôture (données différées de 15 min sans compte) ; sinon le script ne touche à rien.
Un nouveau relevé de la même séance remplace le précédent ; les séances déjà relevées sont toutes conservées.

Lancé par update_all.py (update.yml) et, pour l'avoir dès la fin de séance, par postmarket.yml.
Usage : python fetch_tv_breadth.py
"""
import json
import statistics
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import mmconfig

HERE = Path(__file__).resolve().parent
OUT = HERE / "tv_breadth_data.js"
MARKET = mmconfig.load("market")
CFG = mmconfig.load("sources")["tv_breadth"]
NY = ZoneInfo(MARKET["timezone"])
COLUMNS = ["date", "t2108", "n"]          # n = actions retenues (clôture et SMA40 renseignées)
SCAN_COLS = ["close", f"SMA{CFG['sma']}", "subtype", "time", "current_session"]


def load_existing(path):
    try:
        text = Path(path).read_text()
        return {r[0]: r for r in json.loads(text[text.index("=") + 1:].strip().rstrip(";"))["rows"]}
    except (OSError, ValueError, KeyError, IndexError):
        return {}


def write_js(rows, scanned, path):
    payload = {"columns": COLUMNS, "rows": rows, "asof": rows[-1][0] if rows else None, "scanned": scanned}
    Path(path).write_text("window.TV_BREADTH = " + json.dumps(payload, separators=(",", ":")) + ";\n")


def measure(items, now_utc):
    """(séance, t2108, n) du relevé, ou (None, raison) s'il ne doit pas être retenu. items = lignes `d` du screener."""
    rows = [dict(zip(SCAN_COLS, d)) for d in items]
    rows = [r for r in rows if r["subtype"] == CFG["subtype"]]
    if len(rows) < CFG["min_stocks"]:
        return None, f"{len(rows)} actions seulement (minimum {CFG['min_stocks']})"
    status = Counter(r["current_session"] for r in rows).most_common(1)[0][0]
    if status not in CFG["sessions_ok"]:
        return None, f"état « {status} » (relevé seulement hors séance régulière)"
    bar = statistics.median(r["time"] for r in rows if r["time"])          # ouverture de la bougie journalière en cours (UTC)
    day = datetime.fromtimestamp(bar, timezone.utc).astimezone(NY).date()
    close_at = datetime(day.year, day.month, day.day, int(MARKET["close_hour"]), round(MARKET["close_hour"] % 1 * 60), tzinfo=NY)
    if now_utc < close_at + timedelta(minutes=CFG["delay_minutes"]):
        return None, f"séance du {day} pas encore close (+{CFG['delay_minutes']} min de différé)"
    sma = f"SMA{CFG['sma']}"
    valid = [r for r in rows if r["close"] is not None and r[sma] is not None]
    above = sum(r["close"] > r[sma] for r in valid)
    return day.isoformat(), (round(100 * above / len(valid), 2), len(valid))


def main():
    from fetch_postmarket import scan            # même client (en-têtes, essais) que le scan post-market
    now = datetime.now(timezone.utc)
    existing = load_existing(OUT)          # OUT lu à l'appel (les tests le redirigent vers un dossier temporaire)
    raw = scan({"columns": SCAN_COLS, "markets": [CFG["market"]], "range": [0, CFG["scan_limit"]],
                "filter": [{"left": "type", "operation": "equal", "right": CFG["type"]},
                           {"left": "exchange", "operation": "in_range", "right": CFG["exchanges"]}]})
    if len(raw) >= CFG["scan_limit"]:
        sys.exit(f"TradingView : {len(raw)} lignes = limite scan_limit atteinte (config/sources.toml) ; fichier non modifié.")
    day, res = measure([x["d"] for x in raw], now)
    if day is None:
        print(f"T2108 TradingView : rien à relever ({res}).")
        if not OUT.exists():                     # premier passage hors fenêtre : fichier vide, pour que le site le charge
            write_js([], None, OUT)
        return
    row = [day, *res]
    if existing.get(day) == row:                 # relevé identique : fichier inchangé (pas de commit ni de déploiement à chaque passage)
        print(f"T2108 TradingView : séance {day} déjà relevée à l'identique ({res[0]} %).")
        return
    existing[day] = row
    write_js([existing[d] for d in sorted(existing)], now.isoformat(timespec="seconds"), OUT)
    print(f"Ecrit : {OUT.name} | séance {day} : T2108 {res[0]} % sur {res[1]} actions ({len(existing)} séances)")


if __name__ == "__main__":
    main()
