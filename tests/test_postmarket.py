#!/usr/bin/env python3
"""Scan post-market (fetch_postmarket.py) sans reseau : seance selon l'heure de New York, badge resultats, lendemain,
remplacement de l'instantane du soir, format compact des graphiques, fichier controle par validate_data."""
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import fetch_postmarket as fp       # noqa: E402
import validate_data                # noqa: E402

fails = 0


def check(label, cond):
    global fails
    print(("ok     " if cond else "ECHEC  ") + label)
    fails += not cond


def utc(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


# 1) seance selon l'heure (2026-10-13 = mardi, heure d'ete : New York = UTC - 4)
check("18:17 a New York : seance du jour, post-market en cours", fp.session_now(utc("2026-10-13T22:17:00")) == (date(2026, 10, 13), False))
check("20:30 a New York : seance du jour, post-market termine", fp.session_now(utc("2026-10-14T00:30:00")) == (date(2026, 10, 13), True))
check("01:43 a New York : seance de la veille, terminee", fp.session_now(utc("2026-10-14T05:43:00")) == (date(2026, 10, 13), True))
check("pendant la seance : hors fenetre", fp.session_now(utc("2026-10-13T18:00:00")) == (None, None))
check("samedi 01:00 a New York : vendredi", fp.session_now(utc("2026-10-17T05:00:00")) == (date(2026, 10, 16), True))
check("samedi soir : hors fenetre", fp.session_now(utc("2026-10-17T22:00:00")) == (None, None))
check("heure d'hiver : 20:15 UTC = 15:15 a New York, hors fenetre", fp.session_now(utc("2026-11-10T20:15:00")) == (None, None))

# 2) badge resultats (earnings_release_time : -1 avant l'ouverture, 1 apres la cloture)
d = date(2026, 10, 13)
ts = lambda s: utc(s).timestamp()
check("publie ce soir (AMC)", fp.earnings_tag({"ed": ts("2026-10-13T20:05:00"), "et": 1}, d) == "amc")
check("publie ce matin (BMO)", fp.earnings_tag({"ed": ts("2026-10-13T11:00:00"), "et": -1}, d) == "bmo")
check("prevu ce soir (date suivante)", fp.earnings_tag({"ed": ts("2026-07-14T20:00:00"), "et": 1, "en": ts("2026-10-13T20:00:00"), "ent": 1}, d) == "amc")
check("pas de resultats ce jour", fp.earnings_tag({"ed": ts("2026-07-14T20:00:00"), "et": 1}, d) == "")


# 3) passage complet sans reseau : deux soirs, remplacement de l'instantane, lendemain complete
def tv_item(sym, pch, pv):
    vals = {"s": sym, "n": sym + " Inc.", "x": "NASDAQ", "sec": "Finance", "ind": "Banks", "c": 10.0, "ch": 1.0, "pc": 10 * (1 + pch / 100),
            "pch": pch, "pv": pv, "av": 1_000_000, "cap": 2e9, "flt": 5e7, "ed": None, "et": None, "en": None, "ent": None}
    return {"s": "NASDAQ:" + sym, "d": [vals[k] for _, k in fp.TV_COLS]}


calls = []


def fake_scan(payload):
    calls.append(payload)
    if "symbols" in payload:                         # lendemain : variation et gap de la seance suivante
        return [{"s": t, "d": [3.5, 1.25]} for t in payload["symbols"]["tickers"]]
    up = payload["filter"][2]["operation"] == "greater"
    return [tv_item("AAA", 12.0, 900_000), tv_item("BBB", 5.0, 2_000_000)] if up else [tv_item("CCC", -7.0, 300_000)]


fp.scan = fake_scan
fp.fetch_hist = lambda syms, old: {s: old.get(s) or [["2026-10-12", 9, 10, 8.5, 9.5, 100], ["2026-10-13", 9.5, 10.2, 9.4, 10, 120]] for s in syms}
with tempfile.TemporaryDirectory() as tmp:
    fp.OUT = Path(tmp) / "postmarket_data.js"
    fp.datetime = type("D", (datetime,), {"now": staticmethod(lambda tz=None: utc("2026-10-13T22:17:00"))})
    fp.main.__globals__["sys"].argv = ["fetch_postmarket.py"]
    fp.main()
    fp.datetime = type("D", (datetime,), {"now": staticmethod(lambda tz=None: utc("2026-10-14T05:43:00"))})
    fp.main()                                         # meme seance, plus tard : remplace l'instantane
    data = fp.load()
    check("un seul instantane pour la seance (le plus recent)", [s["d"] for s in data["snaps"]] == ["2026-10-13"] and data["snaps"][0]["closed"])
    rows = data["snaps"][0]["rows"]
    check("tri par volume post-market, hausses et baisses", [r[1] for r in rows] == ["BBB", "AAA", "CCC"])
    check("RVol = volume post-market / volume moyen 90 j", rows[1][fp.COLS.index("rv")] == 0.9)
    fp.datetime = type("D", (datetime,), {"now": staticmethod(lambda tz=None: utc("2026-10-14T22:17:00"))})
    fp.main()                                         # seance suivante : complete le lendemain de la precedente
    data = fp.load()
    prev = data["snaps"][0]
    check("lendemain complete (variation, gap, date)", prev.get("nextd") == "2026-10-14" and prev["rows"][0][fp.COLS.index("nx")] == 3.5
          and prev["rows"][0][fp.COLS.index("ng")] == 1.25)
    check("graphiques au format compact et relus", fp.unpack_hist(data["hist"])["AAA"][-1] == ["2026-10-13", 9.5, 10.2, 9.4, 10, 120])
    errs = validate_data.validate("postmarket", fp.OUT, today=date(2026, 10, 15))
    check("fichier valide (validate_data)", errs == [])
    bad = fp.load(); bad["snaps"][0]["rows"][0][fp.COLS.index("pch")] = 1.0; fp.save(bad)
    check("ligne hors filtres : refusee", any("hors filtres" in e for e in validate_data.validate("postmarket", fp.OUT, today=date(2026, 10, 15))))
    n_before = len(calls)
    fp.datetime = type("D", (datetime,), {"now": staticmethod(lambda tz=None: utc("2026-10-14T15:00:00"))})
    fp.main()
    check("hors fenetre : aucun appel a TradingView", len(calls) == n_before)

sys.exit(1 if fails else 0)
