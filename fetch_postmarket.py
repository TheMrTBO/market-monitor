#!/usr/bin/env python3
"""Scan post-market (after-hours) des actions US via le screener public de TradingView -> postmarket_data.js.

Meme scan que le preset TradingView de l'utilisateur : prix > 3 $, volume post-market > 100 000, variation post-market
> +4 % (et, en plus, < -4 % : le dashboard filtre Hausses / Baisses / Les deux), tri par volume post-market.
Donnees TradingView sans compte = differees de 15 minutes. Aucune cle API.

Un instantane par seance (date de la seance reguliere, heure de New York) ; un nouveau passage le meme soir remplace
l'instantane de la seance. On garde les KEEP dernieres seances. A chaque nouvelle seance, on complete l'instantane
precedent par la seance suivante (variation et gap du lendemain : le mouvement post-market a-t-il tenu ?).
Bougies journalieres (3 mois, Yahoo Finance) pour les titres du dernier instantane : graphique de la fiche detail.

Fenetre utile : de 16 h (cloture) a 4 h du matin (debut du pre-market), heure de New York. En dehors, TradingView vide
les champs post-market : le script ne touche a rien et sort sans erreur.
Usage : python fetch_postmarket.py [--force-session AAAA-MM-JJ]   (--force-session : tests manuels hors fenetre)
"""
import argparse
import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import mmconfig

HERE = Path(__file__).resolve().parent
OUT = HERE / "postmarket_data.js"
MARKET = mmconfig.load("market")
PM = mmconfig.load("postmarket")      # filtres du scan, limites : config/postmarket.toml
NY = ZoneInfo(MARKET["timezone"])
URL = "https://scanner.tradingview.com/america/scan"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (market-monitor; +github.com/TheMrTBO/market-monitor)"}
KEEP = PM["keep_sessions"]     # seances conservees
LIMIT = PM["max_per_side"]     # titres par sens (hausses, baisses) ; limite atteinte = liste tronquee, signalee ("trunc")
FILTERS = {"price": PM["min_price"], "vol": PM["min_volume"], "chg": PM["min_change"]}   # cles courtes ecrites dans le fichier
HIST_BARS = PM["chart_bars"]   # bougies journalieres pour la fiche detail

# colonnes TradingView -> cle courte dans le fichier
TV_COLS = [
    ("name", "s"), ("description", "n"), ("exchange", "x"), ("sector", "sec"), ("industry", "ind"),
    ("close", "c"), ("change", "ch"), ("postmarket_close", "pc"), ("postmarket_change", "pch"), ("postmarket_volume", "pv"),
    ("average_volume_90d_calc", "av"), ("market_cap_basic", "cap"), ("float_shares_outstanding", "flt"),
    ("earnings_release_date", "ed"), ("earnings_release_time", "et"),
    ("earnings_release_next_date", "en"), ("earnings_release_next_time", "ent"),
]
COLS = ["t", "s", "n", "sec", "ind", "c", "ch", "pc", "pch", "pv", "rv", "cap", "flt", "er", "nx", "ng"]


def session_now(now_utc):
    """(seance, close) : seance reguliere dont le post-market est disponible, ou (None, None) hors fenetre."""
    t = now_utc.astimezone(NY)
    if t.hour >= MARKET["close_hour"]:
        d, closed = t.date(), t.hour >= MARKET["postmarket_end_hour"]
    elif t.hour < MARKET["premarket_start_hour"]:
        d, closed = t.date() - timedelta(days=1), True
        while d.weekday() >= 5:
            d -= timedelta(days=1)
    else:
        return None, None
    return (d, closed) if d.weekday() < 5 else (None, None)


def next_weekday(d):
    d += timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def scan(payload):
    import requests                           # importe ici : les tests tournent sans requests
    n = PM["request_attempts"]               # essais et attentes : config/postmarket.toml
    for i in range(n):
        try:
            r = requests.post(URL, json=payload, headers=HEADERS, timeout=PM["request_timeout"])
            r.raise_for_status()
            return r.json().get("data", [])
        except (requests.RequestException, ValueError) as e:
            if i == n - 1:
                raise RuntimeError(f"TradingView injoignable : {e}")
            time.sleep(PM["request_waits"][i])
    return []


def movers(direction):
    flt = [
        {"left": "close", "operation": "greater", "right": FILTERS["price"]},
        {"left": "postmarket_volume", "operation": "greater", "right": FILTERS["vol"]},
        {"left": "postmarket_change", "operation": "greater" if direction > 0 else "less", "right": FILTERS["chg"] * direction},
        {"left": "type", "operation": "equal", "right": "stock"},
    ]
    return scan({"columns": [c for c, _ in TV_COLS], "filter": flt, "markets": ["america"],
                 "sort": {"sortBy": "postmarket_volume", "sortOrder": "desc"}, "range": [0, LIMIT]})


def ny_date(ts):
    return datetime.fromtimestamp(ts, timezone.utc).astimezone(NY).date() if ts else None


def earnings_tag(r, d):
    """'amc' : resultats publies (ou attendus) ce soir apres la cloture ; 'bmo' : publies ce matin ; '' sinon.
    earnings_release_time de TradingView : -1 = avant l'ouverture, 1 = apres la cloture, 0 = inconnu."""
    for ts, tm in ((r.get("ed"), r.get("et")), (r.get("en"), r.get("ent"))):
        if ny_date(ts) == d:
            hour = datetime.fromtimestamp(ts, timezone.utc).astimezone(NY).hour
            if tm == 1 or (tm != -1 and hour >= MARKET["close_hour"]):
                return "amc"
            if tm == -1 or hour < 10:
                return "bmo"
            return "amc"
    return ""


def rnd(v, n):
    return None if v is None else round(v, n)


def build_rows(raw, d):
    rows = []
    for item in raw:
        r = {k: v for (_, k), v in zip(TV_COLS, item["d"])}
        if r.get("pch") is None or r.get("pv") is None:
            continue
        rows.append([
            item["s"], r["s"], r.get("n") or "", r.get("sec") or "", r.get("ind") or "",
            rnd(r.get("c"), 4), rnd(r.get("ch"), 2), rnd(r.get("pc"), 4), rnd(r.get("pch"), 2), int(r["pv"]),
            rnd(r["pv"] / r["av"], 2) if r.get("av") else None,
            int(r["cap"]) if r.get("cap") else None, int(r["flt"]) if r.get("flt") else None,
            earnings_tag(r, d), None, None,
        ])
    rows.sort(key=lambda x: -x[COLS.index("pv")])
    return rows


def fill_next(prev, d):
    """Complete l'instantane `prev` avec la seance `d` (variation et gap du lendemain), si d est bien la seance suivante."""
    if prev.get("nextd") or next_weekday(date.fromisoformat(prev["d"])) != d:
        return
    tickers = [r[0] for r in prev["rows"]]
    if not tickers:
        return
    data = scan({"symbols": {"tickers": tickers}, "columns": ["change", "gap"]})
    got = {it["s"]: it["d"] for it in data}
    ix, ig = COLS.index("nx"), COLS.index("ng")
    for r in prev["rows"]:
        v = got.get(r[0])
        if v:
            r[ix], r[ig] = rnd(v[0], 2), rnd(v[1], 2)
    prev["nextd"] = d.isoformat()


def yahoo_symbol(sym):
    return sym.replace(".", "-")


def px(v):
    return round(float(v), 2 if v >= 1 else 4)


def fetch_hist(symbols, old):
    """Bougies journalieres (Yahoo) des titres demandes, {symbole: [[date, o, h, l, c, v], ...]} ; on reprend celles du
    cache `old` quand elles existent (un seul telechargement par titre et par seance)."""
    out = {s: old[s] for s in symbols if s in old}
    want = [s for s in symbols if s not in out]
    if not want:
        return out
    try:
        import yfinance as yf
        df = yf.download([yahoo_symbol(s) for s in want], period="6mo", interval="1d", auto_adjust=False,
                         group_by="ticker", progress=False, threads=True)
    except Exception as e:                     # graphique facultatif : le scan reste publie
        print(f"  Yahoo indisponible ({e.__class__.__name__}) : fiches sans graphique pour {len(want)} titres")
        return out
    for s in want:
        try:
            sub = df[yahoo_symbol(s)] if len(want) > 1 else df
            sub = sub.dropna(subset=["Open", "High", "Low", "Close"]).tail(HIST_BARS)
        except (KeyError, TypeError):
            continue
        if len(sub):
            out[s] = [[i.strftime("%Y-%m-%d"), px(b.Open), px(b.High), px(b.Low), px(b.Close), int(b.Volume or 0)]
                      for i, b in sub.iterrows()]
    return out


def pack_hist(h):
    """Format compact : dates communes une seule fois ; par titre [index de la 1re date, [o, h, l, c, v], ...]."""
    dates = sorted({b[0] for bars in h.values() for b in bars})
    ix = {d: i for i, d in enumerate(dates)}
    return {"dates": dates, "bars": {s: [ix[bars[0][0]]] + [b[1:] for b in bars] for s, bars in h.items() if bars}}


def unpack_hist(p):
    dates = p.get("dates", []) if isinstance(p, dict) else []
    out = {}
    for s, v in (p.get("bars", {}) if isinstance(p, dict) else {}).items():
        i0, bars = v[0], v[1:]
        if i0 + len(bars) <= len(dates):
            out[s] = [[dates[i0 + k]] + b for k, b in enumerate(bars)]
    return out


def load():
    try:
        text = OUT.read_text()
        return json.loads(text[text.index("=") + 1:].strip().rstrip(";"))
    except (OSError, ValueError):
        return {"cols": COLS, "filters": FILTERS, "snaps": [], "hist": {}}


def save(data):
    OUT.write_text("window.POSTMARKET = " + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n")
    stamp_status(data)


def stamp_status(data):
    """Note l'heure du dernier releve dans status_data.js (cle "pm") : le bouton « Actualiser » du dashboard compare ce
    fichier a la version affichee, et le workflow du soir ne lance pas update_all.py (qui ecrit les autres cles)."""
    path = OUT.parent / "status_data.js"
    if not path.exists():
        return
    try:
        text = path.read_text()
        st = json.loads(text[text.index("=") + 1:].strip().rstrip(";"))
    except (OSError, ValueError):
        return
    st["pm"] = data["snaps"][-1]["at"] if data.get("snaps") else None
    path.write_text("window.STATUS = " + json.dumps(st, separators=(",", ":"), ensure_ascii=False) + ";\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force-session", help="AAAA-MM-JJ : ignore l'heure (test manuel)")
    a = ap.parse_args()
    now = datetime.now(timezone.utc)
    data = load()
    if a.force_session:
        d, closed = date.fromisoformat(a.force_session), True
    else:
        d, closed = session_now(now)
    if d is None:
        print(f"Hors fenetre post-market ({now.astimezone(NY):%a %H:%M} a New York) : rien a faire.")
        if not OUT.exists():
            save(data)
        return 0

    up_raw, down_raw = movers(+1), movers(-1)
    trunc = len(up_raw) >= LIMIT or len(down_raw) >= LIMIT
    rows = build_rows(up_raw + down_raw, d)
    if not rows:                                # jour ferie, champs deja vides : on ne cree pas d'instantane vide
        print(f"Seance {d} : aucun titre post-market (jour ferie ou donnees videes) ; fichier inchange.")
        if not OUT.exists():
            save(data)
        return 0

    snaps = [s for s in data.get("snaps", []) if s["d"] != d.isoformat()]
    prev = [s for s in snaps if s["d"] < d.isoformat()]
    if prev:
        try:
            fill_next(prev[-1], d)
        except RuntimeError as e:
            print(f"  Lendemain non complete : {e}")
    snap = {"d": d.isoformat(), "at": now.isoformat(timespec="seconds"), "closed": closed, "rows": rows}
    if trunc:                                   # ne devrait pas arriver (150 titres par sens) : signale dans l'onglet
        snap["trunc"] = True
        print(f"  ATTENTION : {LIMIT} titres atteints dans un sens, liste tronquee")
    snaps.append(snap)
    snaps = sorted(snaps, key=lambda s: s["d"])[-KEEP:]
    last = snaps[-1]
    syms = [r[1] for r in last["rows"]]
    cached = {k: v for k, v in unpack_hist(data.get("hist")).items() if v[-1][0] >= last["d"]}   # a jour pour la seance
    hist = fetch_hist(syms, cached)
    save({"cols": COLS, "filters": FILTERS, "snaps": snaps, "hist": pack_hist(hist)})
    up = sum(1 for r in rows if r[COLS.index("pch")] > 0)
    print(f"Seance {d} ({'close' if closed else 'en cours'}) : {up} hausses, {len(rows) - up} baisses, {len(hist)} graphiques")
    return 0


if __name__ == "__main__":
    sys.exit(main())
