#!/usr/bin/env python3
"""Test : vue TradingView de l'onglet Secteurs (fetch_industries.py), sur des données fabriquées, sans réseau.

Vérifie : ajustement des splits, filtres des actions retenues, indice équipondéré (variations moyennes chaînées, plafond),
TI65 et % de titres au-dessus de 1, fichiers écrits (un par industrie, fichiers disparus retirés, fichier inchangé non
réécrit) et contrôle de cohérence (validate_data.check_industries).
"""
import json
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import fetch_industries as fi    # noqa: E402
import validate_data             # noqa: E402

checks = {}


def check(label, cond):
    checks[label] = bool(cond)


# --- 80 séances ouvrées ; 8 actions dans 2 secteurs, 3 industries
d0 = date(2026, 6, 1)
dates = []
while len(dates) < 80:
    if d0.weekday() < 5:
        dates.append(d0.isoformat())
    d0 += timedelta(days=1)
n = len(dates)
price = {
    "AAA": [10 * 1.01 ** k for k in range(n)],                # +1 %/jour
    "BBB": [20 * 0.99 ** k for k in range(n)],                # -1 %/jour
    "CCC": [50.0] * n,                                        # stable
    "DDD": [30.0] * n,
    "EEE": [40.0] * n,
    "SPL": [100.0] * 40 + [50.0] * 40,                        # split 2-pour-1 à la séance 40 : stable une fois ajusté
    "PNY": [2.0] * n,                                         # prix < 3 $ : écarté
    "JMP": [10.0] * 50 + [40.0] * 30,                         # +300 % en un jour : plafonné à +50 % dans l'indice
}
history = {d: {t: [p[k], 500_000] for t, p in price.items()} for k, d in enumerate(dates)}
for k, d in enumerate(dates[60:], 60):                     # OHLC sur les 20 dernières séances seulement (cache en transition)
    for t, p in price.items():
        c = p[k]
        history[d][t] = [c, 500_000, c * 0.99, c * 1.03, c * 0.97]
history[dates[10]]["DDD"] = [30.0, 500]                      # un jour de faible volume ne suffit pas à l'écarter
for k in range(n - 50, n):
    history[dates[k]]["EEE"] = [40.0, 1_000]                  # volume moyen 50 j trop faible : écarté
splits = {dates[40]: {"SPL": 2.0}}
universe = set(price)
close, vol, ohlc = fi.series(dates, history, universe, splits)
check("split : clôtures avant le split divisées par le ratio", close["SPL"][0] == 50.0 and close["SPL"][-1] == 50.0)
check("split : volumes avant le split multipliés par le ratio", vol["SPL"][0] == 1_000_000)
check("OHLC lu seulement où il existe", ohlc["AAA"][0][59] is None and abs(ohlc["AAA"][1][70] - close["AAA"][70] * 1.03) < 1e-9)

cap = 1e9
tv = [
    {"name": "AAA", "description": "Alpha", "subtype": "common", "sector": "Tech", "industry": "Soft", "market_cap_basic": cap},
    {"name": "BBB", "description": "Bravo", "subtype": "common", "sector": "Tech", "industry": "Soft", "market_cap_basic": cap},
    {"name": "CCC", "description": "Charlie", "subtype": "common", "sector": "Tech", "industry": "Soft", "market_cap_basic": cap},
    {"name": "JMP", "description": "Jump", "subtype": "common", "sector": "Tech", "industry": "Chips & Co", "market_cap_basic": cap},
    {"name": "SPL", "description": "Split", "subtype": "common", "sector": "Tech", "industry": "Chips/Co", "market_cap_basic": cap},
    {"name": "DDD", "description": "Delta", "subtype": "common", "sector": "Finance", "industry": "Banks", "market_cap_basic": cap},
    {"name": "EEE", "description": "Echo", "subtype": "common", "sector": "Finance", "industry": "Banks", "market_cap_basic": cap},
    {"name": "PNY", "description": "Penny", "subtype": "common", "sector": "Finance", "industry": "Banks", "market_cap_basic": cap},
    {"name": "SML", "description": "Small", "subtype": "common", "sector": "Finance", "industry": "Banks", "market_cap_basic": 1e8},
    {"name": "PRF", "description": "Pref", "subtype": "preferred", "sector": "Finance", "industry": "Banks", "market_cap_basic": cap},
]
close["SML"], vol["SML"] = [10.0] * n, [500_000] * n
members = fi.select(tv, close, vol)
kept = sorted(m["s"] for m in members)
check("filtres : prix, volume moyen, capitalisation, sous-type", kept == ["AAA", "BBB", "CCC", "DDD", "JMP", "SPL"])

idx = fi.build_index(["AAA", "BBB"], close, n)
exp = 100.0
for _ in range(1, n):
    exp *= 1 + (0.01 - 0.01) / 2
check("indice équipondéré : moyenne des variations (+1 % et -1 % -> 100)", abs(idx[-1] - exp) < 1e-9 and idx[0] == 100)
j = fi.build_index(["JMP"], close, n)
check("plafond : +300 % compté +50 %", abs(j[50] / j[49] - 1.5) < 1e-9)
cc = fi.build_index(["CCC", "DDD"], close, n)
o, h, l = fi.build_candles(["CCC", "DDD"], close, ohlc, cc)
check("bougies d'indice : ouverture -1 %, plus haut +3 %, plus bas -3 % (titres stables)", o[59] is None
      and abs(o[70] / cc[69] - 0.99) < 1e-9 and abs(h[70] / cc[69] - 1.03) < 1e-9 and abs(l[70] / cc[69] - 0.97) < 1e-9)
check("indice : titre absent un jour ignoré ce jour-là", fi.build_index(["AAA"], {"AAA": [None] * 5 + close["AAA"][5:]}, n)[5] == 100)

ti_a = fi.ti65(close["AAA"], n - 1)
ref = (sum(close["AAA"][-7:]) / 7) / (sum(close["AAA"][-65:]) / 65)
check("TI65 = moyenne 7 / moyenne 65", abs(ti_a - ref) < 1e-12 and fi.ti65(close["AAA"], 63) is None)
scores = {t: fi.ti65_series(close[t]) for t in ["AAA", "BBB", "CCC"]}
b = fi.breadth(["AAA", "BBB", "CCC"], scores, n, min_members=3)
check("% > 1 : 1 titre sur 3 (AAA monte, BBB baisse, CCC stable)", abs(b[-1] - 33.3) < 0.1 and b[63] is None)

payload, files = fi.compute(dates, close, vol, members, keep=70, ohlc=ohlc)
inds = {i["k"]: i for i in payload["industries"]}
check("industries et secteurs : effectifs", inds["Soft"]["n"] == 3 and inds["Banks"]["n"] == 1
      and {s["k"]: s["n"] for s in payload["sectors"]} == {"Finance": 1, "Tech": 5})
check("noms de fichiers uniques (Chips & Co / Chips/Co)", len({i["f"] for i in payload["industries"]}) == 4
      and {inds["Chips & Co"]["f"], inds["Chips/Co"]["f"]} == {"chips-co", "chips-co-2"})
soft = files[inds["Soft"]["f"]]
check("fichier d'industrie : 70 dernières séances, une ligne par action", len(soft["dates"]) == 70 and soft["dates"][-1] == dates[-1]
      and [r[0] for r in soft["rows"]] == ["AAA", "BBB", "CCC"] and len(soft["rows"][0][3]) == 70 and soft["rows"][0][4][0] == 500)
check("fichier d'industrie : OHLC des actions (null avant le cache OHLC)", len(soft["rows"][0]) == 8
      and soft["rows"][0][5][0] is None and soft["rows"][0][6][-1] == fi.num(close["AAA"][-1] * 1.03))
check("indices : bougies présentes et cohérentes", all(len(x["o"]) == n for x in payload["sectors"] + payload["industries"]))
p2, _ = fi.compute(dates, close, vol, members, keep=70)
check("sans OHLC en cache : ni bougies d'indice ni colonnes OHLC", "o" not in p2["sectors"][0] and len(_[inds["Soft"]["f"]]["rows"][0]) == 5)

with tempfile.TemporaryDirectory() as tmp:
    fi.OUT, fi.FOLDER = Path(tmp) / "industries_data.js", Path(tmp) / "industries"
    fi.FOLDER.mkdir()
    (fi.FOLDER / "ancienne-industrie.js").write_text("x")
    fi.write(payload, files)
    names = sorted(p.name for p in fi.FOLDER.glob("*.js"))
    check("écriture : un fichier par industrie, industrie disparue retirée", names == sorted(f + ".js" for f in files))
    p = fi.FOLDER / (inds["Soft"]["f"] + ".js")
    p.touch()
    t0 = p.stat().st_mtime_ns
    fi.write(payload, files)
    check("fichier inchangé : pas réécrit", p.stat().st_mtime_ns == t0)
    text = p.read_text()
    check("format : window.TV_STOCKS[<fichier>]", text.startswith('(window.TV_STOCKS = window.TV_STOCKS || {})["soft"] = '))
    data = json.loads(fi.OUT.read_text().split("=", 1)[1].strip().rstrip(";"))
    f = dict(validate_data.fresh("industries"), min_sectors=2, min_industries=4, min_stocks=6)
    validate_data.fresh = lambda name: f                      # seuils réduits aux données fabriquées
    today = date.fromisoformat(dates[-1])
    check("contrôle : fichiers valides acceptés", validate_data.check_industries(data, today, fi.FOLDER) == [])
    p.unlink()
    errs = validate_data.check_industries(data, today, fi.FOLDER)
    check("contrôle : fichier d'industrie manquant refusé", any("fichier(s) d'industrie" in e for e in errs))
    data["sectors"][0]["h"][70] = data["sectors"][0]["l"][70] / 2
    check("contrôle : bougie d'indice incohérente refusée", any("bougies" in e for e in validate_data.check_industries(data, today)))
    data["sectors"][0]["c"][3] = None
    check("contrôle : indice incomplet refusé", any("incomplet" in e for e in validate_data.check_industries(data, today)))

for label, good in checks.items():
    print(("ok     " if good else "ECHEC  ") + label)
sys.exit(0 if all(checks.values()) else 1)
