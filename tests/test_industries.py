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
check("actions TI65 > 1 : toutes les actions retenues, une valeur par séance",
      payload["stocks"]["n"] == len(members) and len(payload["stocks"]["b"]) == len(dates)
      and payload["stocks"]["b"] == fi.breadth([m["s"] for m in members], {m["s"]: fi.ti65_series(close[m["s"]]) for m in members}, len(dates)))
rvs = payload["stocks"]["rv"]
dvs = [sum(close[m["s"]][k] * vol[m["s"]][k] for m in members if close[m["s"]][k] and vol[m["s"]][k]) for k in range(len(dates))]
k = len(dates) - 1
exp_rv = round((sum(dvs[k - 4:k + 1]) / 5) / (sum(dvs[k - 49:k + 1]) / 50), 2)
check("volume en dollars relatif : 5 dernières séances ÷ 50 dernières (None avant 50 séances), secteurs et industries aussi",
      rvs[-1] == exp_rv and rvs[48] is None and rvs[49] is not None and all(len(x["rv"]) == len(dates) for x in payload["sectors"] + payload["industries"]))
check("marché de la carte de rotation : indice équipondéré de toutes les actions retenues",
      payload["stocks"]["c"] == [None if v is None else round(v, 3) for v in fi.build_index([m["s"] for m in members], close, len(dates))])
check("indices : courbe seulement (pas de bougie d'indice)", all("o" not in x for x in payload["sectors"] + payload["industries"]))
# --- groupes actifs (refonte du 27/10/2026) : leaders (+25 % sur 21 séances), grappe, thèmes, liste des leaders
fl = fi.leader_flags(close["JMP"])
check("leader : +25 % sur 21 séances (JMP ×4 à la séance 50, plus leader 21 séances après) ; AAA +23 % : non ; avant 21 séances : None",
      fl[50] == 1 and fl[70] == 1 and fl[71] == 0 and fl[49] == 0 and fl[10] is None and set(fi.leader_flags(close["AAA"])[21:]) == {0})
chips = inds["Chips & Co"]
check("leaders par industrie et de l'univers, une valeur par séance",
      chips["l"][50] == 1 and chips["l"][49] == 0 and len(chips["l"]) == len(dates) and payload["stocks"]["l"][60] == 1
      and payload["stocks"]["v"][60] == len(members) and payload["stocks"]["v"][5] == 0)
check("grappe : au moins grappe_min leaders et part ≥ grappe_ratio × celle de l'univers (« 1 » / « 0 » par séance)",
      fi.grappe([3, 3, 2], [10, 10, 2], [6, 3, 2], [100, 10, 100]) == "100" and fi.grappe([3], [10], [0], [0]) == "0"
      and set(chips["g"]) == {"0"} and len(chips["g"]) == len(dates))
lead = payload["leaders"]
ix_chips = [i["k"] for i in payload["industries"]].index("Chips & Co")
check("liste des leaders : list_sessions dernières séances (pas avant `sessions`), [symbole, industrie, gain %]",
      lead["start"] == max(fi.LD["sessions"], len(dates) - fi.LD["list_sessions"]) and lead["start"] + len(lead["days"]) == len(dates)
      and lead["days"][60 - lead["start"]] == [["JMP", ix_chips, 300]] and lead["days"][-1] == [])
_, th, _ = fi.leaders(dates, close, members, [dict(x) for x in payload["industries"]],
                      themes=[{"name": "Thème", "tickers": ["AAA", "JMP", "ZZZ", "PNY"], "etf": "XLK"}])
t0 = th[0]
check("thème : actions retenues seulement, indice et leaders comme une industrie, signal = moitié du panier leader",
      t0["m"] == ["AAA", "JMP"] and t0["n"] == 2 and t0["etf"] == "XLK" and len(t0["c"]) == len(dates) and t0["c"][0] == 100
      and t0["h"][60] == "1" and t0["h"][75] == "0" and t0["l"][60] == 1 and all(v is None for v in t0["b"]))
check("thèmes de la config : un par entrée de config/themes.toml", [t["k"] for t in payload["themes"]] == [t["name"] for t in fi.mmconfig.themes()])
_, f2 = fi.compute(dates, close, vol, members, keep=70)
check("sans OHLC en cache : pas de colonnes OHLC pour les actions", len(f2[inds["Soft"]["f"]]["rows"][0]) == 5)

with tempfile.TemporaryDirectory() as tmp:
    fi.OUT, fi.FOLDER, fi.TICKERS_OUT = Path(tmp) / "industries_data.js", Path(tmp) / "industries", Path(tmp) / "tickers_data.js"
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
    tk = fi.tickers(dates, close, vol, tv, members, dates[-1], False, ohlc=ohlc)
    fi.write(payload, files, tk)
    col = {k: i for i, k in enumerate(tk["cols"])}
    row = {r[0]: r for r in tk["rows"]}
    check("index des tickers : toutes les actions ordinaires, retenues ou non", sorted(row) == sorted(
          r["name"] for r in tv if r["subtype"] == "common") and row["PNY"][col["kept"]] == 0 and row["AAA"][col["kept"]] == 1)
    check("index des tickers : TI65, rang dans l'industrie, industrie → secteur",
          abs(row["AAA"][col["ti"]] - round(fi.ti65(close["AAA"], n - 1), 4)) < 1e-9 and row["AAA"][col["rank_ind"]] == 1
          and tk["secs"][tk["inds"][row["DDD"][col["ind"]]][1]] == "Finance" and row["PNY"][col["rank_ind"]] is None)
    nA = fi.ADR["sessions"]
    hA, lA = ohlc["AAA"][1], ohlc["AAA"][2]
    expA = round(100 * (sum(hA[k] / lA[k] for k in range(n - nA, n)) / nA - 1), 2)
    check("index des tickers : ADR " + str(nA) + " j = 100 × (moyenne(haut ÷ bas) − 1) ; sans OHLC : None",
          row["AAA"][col["adr"]] == expA and fi.adr(None, n - 1) is None and fi.adr(ohlc["AAA"][1:], 10) is None)
    scan_d, rows_back = fi.published_universe()
    check("composition publiée relue (date du scan, mêmes actions)", scan_d == dates[-1]
          and sorted(r["name"] for r in rows_back) == sorted(row) and sorted(m["s"] for m in fi.select(rows_back, close, vol)) == kept)
    check("index illisible : pas de composition", fi.published_universe(Path(tmp) / "absent.js") == (None, None))
    xf, xn = fi.extras(dates, close, vol, ohlc, tv, members, keep=70)
    check("actions hors filtres : un fichier par industrie, suffixe --hors, actions sans cours exclues",
          xn.get("Banks", "").endswith(fi.CFG["output"]["extra_suffix"]) and [r[0] for r in xf[xn["Banks"]]["rows"]] == ["EEE", "PNY", "SML"]
          and "PRF" not in str(xf) and all("AAA" != r[0] for f in xf.values() for r in f["rows"]))
    tk2 = fi.tickers(dates, close, vol, tv, members, dates[-1], False, xn)
    check("index des tickers : fichier hors filtres de l'industrie", dict((i[0], i[2]) for i in tk2["inds"])["Banks"] == xn["Banks"])
    def boom():
        raise RuntimeError("TradingView injoignable")
    called = []
    check("même séance : composition reprise, TradingView non interrogé",
          fi.composition(dates[-1], dates[-1], rows_back, scanner=lambda: called.append(1) or tv) == (rows_back, dates[-1], False) and not called)
    check("nouvelle séance : nouveau scan", fi.composition("2099-01-02", dates[-1], rows_back, scanner=lambda: tv) == (tv, "2099-01-02", False))
    check("TradingView muet : secours = dernière composition, signalé", fi.composition("2099-01-02", dates[-1], rows_back, scanner=boom)
          == (rows_back, dates[-1], True))
    try:
        fi.composition("2099-01-02", None, None, scanner=boom); stopped = False
    except SystemExit:
        stopped = True
    check("TradingView muet sans composition publiée : arrêt, fichiers non modifiés", stopped)
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
    data["sectors"][0]["c"][3] = None
    check("contrôle : indice incomplet refusé", any("incomplet" in e for e in validate_data.check_industries(data, today)))
    data["leaders"]["days"][-11] = [["JMP", 99, 300]]
    check("contrôle : liste des leaders incohérente (industrie inconnue) refusée",
          any("groupes actifs" in e for e in validate_data.check_industries(data, today)))

# --- scanner TradingView : paramètres de la config ; liste qui atteint scan_limit (tronquée) refusée
import types
seen = {}
fake = types.ModuleType("fetch_postmarket")
fake.scan = lambda payload: seen.setdefault("p", payload) and [{"d": ["AAA", "Alpha", "NYSE", "common", "Tech", "Soft", 1e9]}]
sys.modules["fetch_postmarket"] = fake
u = fi.CFG["universe"]
rows = fi.scan_tradingview()
check("scanner : marché, type, bourses et limite lus dans config/industries.toml",
      seen["p"]["markets"] == [u["market"]] and seen["p"]["range"] == [0, u["scan_limit"]]
      and seen["p"]["filter"][0]["right"] == u["type"] and seen["p"]["filter"][1]["right"] == u["exchanges"] and rows[0]["name"] == "AAA")
fake.scan = lambda payload: [{"d": ["T%d" % i, "", "NYSE", "common", "S", "I", 1e9]} for i in range(u["scan_limit"])]
try:
    fi.scan_tradingview(); truncated = False
except SystemExit:
    truncated = True
check("scanner : liste tronquée (limite atteinte) refusée, fichiers non modifiés", truncated)
del sys.modules["fetch_postmarket"]

for label, good in checks.items():
    print(("ok     " if good else "ECHEC  ") + label)
sys.exit(0 if all(checks.values()) else 1)
