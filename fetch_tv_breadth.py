#!/usr/bin/env python3
"""Breadth relevé sur le screener public TradingView (sans compte ni clé) -> tv_breadth_data.js : T2108 et ±4 % du jour.

T2108 = part (en %) des actions dont la clôture dépasse leur moyenne mobile simple 40 jours (champ SMA40 du screener,
clôture du jour incluse). ±4 % = formule TC2000 de breadth_own.count_breadth, appliquée telle quelle (même fonction) aux
champs close / close[1] / volume / volume[1] du screener (déjà ajustés des splits) : disponible le soir même, alors que
Polygon ne publie la séance que le lendemain matin (décision du 20/10/2026 ; 19/10 : TradingView +161 / −173, Polygon
+161 / −172). Univers : config/sources.toml [tv_breadth] (actions ordinaires NYSE / Nasdaq / AMEX).
TradingView ne fournit aucun historique de cet agrégat : la série se construit un relevé par séance, et sert de seconde
source maison, comparée à Stockbee (et au calcul Polygon de breadth_own.py) dans le dashboard.

Séance relevée = date (heure de New York) de la bougie journalière en cours dans le screener (champ `time`), donc juste
même un jour férié. Le relevé n'est retenu que hors séance régulière (champ `current_session`) et au moins
`delay_minutes` après la clôture (données différées de 15 min sans compte) ; sinon le script ne touche à rien.
Un nouveau relevé de la même séance remplace le précédent ; les séances déjà relevées sont toutes conservées.

Même relevé, liste « 9M +4 % » de l'onglet Secteurs (scan TC2000 de l'utilisateur, config/sources.toml
[tv_breadth.breakouts], exception au gel du 27/10/2026) : tickers par séance (clé `breakouts`), `keep_sessions` séances gardées.

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
from breadth_own import count_breadth       # formule TC2000 (une seule définition, voir breadth_own.py)

HERE = Path(__file__).resolve().parent
OUT = HERE / "tv_breadth_data.js"
MARKET = mmconfig.load("market")
CFG = mmconfig.load("sources")["tv_breadth"]
NY = ZoneInfo(MARKET["timezone"])
BO = CFG["breakouts"]
COLUMNS = ["date", "t2108", "n", "up4", "down4"]   # n = actions avec clôture et SMA40 ; up4 / down4 : ±4 % du jour (TC2000)
BO_COLUMNS = ["ticker", "pct", "volume", "vol_ratio", "dvol"]   # liste 9M +4 % : % du jour, volume, volume ÷ veille, clôture × volume ($)
SCAN_COLS = ["close", f"SMA{CFG['sma']}", "subtype", "time", "current_session", "close[1]", "volume", "volume[1]", "name", "type", "exchange"]


def load_existing(path):
    try:
        text = Path(path).read_text()
        return {r[0]: r for r in json.loads(text[text.index("=") + 1:].strip().rstrip(";"))["rows"]}
    except (OSError, ValueError, KeyError, IndexError):
        return {}


def load_breakouts(path):
    """{séance: [[ticker, pct, volume, vol_ratio], ...]} déjà publiés (fichier d'avant la liste : {})."""
    try:
        text = Path(path).read_text()
        return json.loads(text[text.index("=") + 1:].strip().rstrip(";")).get("breakouts", {})
    except (OSError, ValueError, AttributeError):
        return {}


def write_js(rows, scanned, path, breakouts=None):
    rows = [list(r) + [None] * (len(COLUMNS) - len(r)) for r in rows]   # lignes d'avant le ±4 % (3 colonnes) : complétées
    payload = {"columns": COLUMNS, "rows": rows, "asof": rows[-1][0] if rows else None, "scanned": scanned,
               "bo_columns": BO_COLUMNS, "breakouts": breakouts or {}}
    Path(path).write_text("window.TV_BREADTH = " + json.dumps(payload, separators=(",", ":")) + ";\n")


def common(r):
    """Action ordinaire des bourses de [tv_breadth] (T2108, ±4 %) ; colonnes absentes (réponse d'avant) : sous-type seul."""
    return (r.get("subtype") == CFG["subtype"] and r.get("type") in (None, CFG["type"])
            and r.get("exchange") in (None, *CFG["exchanges"]))


def extra(r):
    """ADR, ETF… ajoutés à la liste 9M seulement ([tv_breadth.breakouts] extra : "type" ou "type/sous-type")."""
    return r.get("type") in BO["extra"] or f"{r.get('type')}/{r.get('subtype')}" in BO["extra"]


def measure(items, now_utc):
    """(séance, t2108, n) du relevé, ou (None, raison) s'il ne doit pas être retenu. items = lignes `d` du screener."""
    rows = [dict(zip(SCAN_COLS, d)) for d in items]                         # champs absents d'une réponse : None
    rows = [r for r in rows if common(r)]                                   # ADR, ETF, CBOE (liste 9M seulement) : exclus
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
    valid = [r for r in rows if r["close"] is not None and r.get(sma) is not None]
    above = sum(r["close"] > r[sma] for r in valid)
    # ±4 % : clé = rang de la ligne (le screener ne répète pas un symbole) ; titres sans clôture ou volume de la veille ignorés
    full = {i: r for i, r in enumerate(rows) if None not in (r["close"], r.get("close[1]"), r.get("volume"), r.get("volume[1]"))}
    up4, down4 = count_breadth({i: [r["close"], r["volume"]] for i, r in full.items()},
                               {i: [r["close[1]"], r["volume[1]"]] for i, r in full.items()}, set(full), {}) if full else (None, None)
    return day.isoformat(), (round(100 * above / len(valid), 2), len(valid), up4, down4)


def breakouts(items):
    """Liste 9M +4 % d'un relevé (formule TC2000 de l'utilisateur, seuils dans [tv_breadth.breakouts]) : lignes BO_COLUMNS,
    du plus fort volume en dollars au plus faible (sort = "dvol") ou de la plus forte hausse (sort = "pct"). Titres sans clôture,
    volume ou ticker de la veille ignorés (comme le ±4 %)."""
    out = []
    for d in items:
        r = dict(zip(SCAN_COLS, d))
        c, c1, v, v1, sym = (r.get(k) for k in ("close", "close[1]", "volume", "volume[1]", "name"))
        if not (common(r) or extra(r)) or None in (c, c1, v, v1, sym) or c1 <= 0:
            continue
        if (c / c1 >= (100 + BO["pct"]) / 100 and v > BO["min_volume"] and (v > v1 or not BO["volume_up"])
                and c > BO["min_price"]):
            out.append([sym, round(100 * (c / c1 - 1), 2), int(v), round(v / v1, 2) if v1 > 0 else None, int(round(c * v))])
    return sorted(out, key=lambda x: (-x[4], x[0]) if BO["sort"] == "dvol" else (-x[1], x[0]))


def main():
    from fetch_postmarket import scan            # même client (en-têtes, essais) que le scan post-market
    now = datetime.now(timezone.utc)
    existing = load_existing(OUT)          # OUT lu à l'appel (les tests le redirigent vers un dossier temporaire)
    lists = load_breakouts(OUT)
    raw = scan({"columns": SCAN_COLS, "markets": [CFG["market"]], "range": [0, CFG["scan_limit"]],
                "filter": [{"left": "type", "operation": "in_range", "right": [CFG["type"], *{t.split("/")[0] for t in BO["extra"]}]},
                           {"left": "exchange", "operation": "in_range", "right": [*CFG["exchanges"], *BO["extra_exchanges"]]}]})
    if len(raw) >= CFG["scan_limit"]:
        sys.exit(f"TradingView : {len(raw)} lignes = limite scan_limit atteinte (config/sources.toml) ; fichier non modifié.")
    day, res = measure([x["d"] for x in raw], now)
    if day is None:
        print(f"T2108 TradingView : rien à relever ({res}).")
        if not OUT.exists():                     # premier passage hors fenêtre : fichier vide, pour que le site le charge
            write_js([], None, OUT)
        return
    row, bo = [day, *res], breakouts([x["d"] for x in raw])
    if existing.get(day) == row and lists.get(day) == bo:   # relevé identique : fichier inchangé (pas de commit à chaque passage)
        print(f"T2108 TradingView : séance {day} déjà relevée à l'identique ({res[0]} %).")
        return
    existing[day], lists[day] = row, bo
    lists = {d: lists[d] for d in sorted(lists)[-BO["keep_sessions"]:]}
    write_js([existing[d] for d in sorted(existing)], now.isoformat(timespec="seconds"), OUT, lists)
    print(f"Ecrit : {OUT.name} | séance {day} : T2108 {res[0]} % sur {res[1]} actions, ±4 % +{res[2]} / -{res[3]} ({len(existing)} séances)"
          f" | {BO['label']} : {len(bo)} ({', '.join(x[0] for x in bo[:10])}{' …' if len(bo) > 10 else ''})")


if __name__ == "__main__":
    main()
