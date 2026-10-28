#!/usr/bin/env python3
"""Tests du calcul maison du soir (breadth_soir.py) : seance du jour = cache Polygon jusqu'a la veille + clotures TradingView.

Aucun acces reseau : historique synthetique, screener simule. Verifie :
  - memes chiffres que breadth_own.compute_long quand Polygon a la seance (formules partagees) ;
  - split du jour detecte par l'ecart entre la veille TradingView et la derniere cloture en cache ;
  - veille incoherente (ni identique ni split) : titre ignore ; titre sans veille en cache : garde, comme Polygon ;
  - refus si le cache n'est pas a la veille ou si trop peu de titres sont retrouves ;
  - de bout en bout : ligne provisoire ecrite, puis remplacee (marque retiree) par breadth_own.py le lendemain matin ;
  - controle : lignes provisoires en fin de serie seulement, n borne.
Sortie : code 0 si tout est conforme.
"""
import json
import math
import sys
import tempfile
import types
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.modules.setdefault("requests", types.ModuleType("requests"))     # fetch_data l'importe ; aucun appel reel ici

import breadth_own as bo          # noqa: E402
import breadth_soir as bs         # noqa: E402
import fetch_data as fd           # noqa: E402
import fetch_history as fh        # noqa: E402
import fetch_tv_breadth as tb     # noqa: E402
import validate_data as vd        # noqa: E402

checks = {}

# ---------------------------------------------------------------- historique synthetique (70 seances, 40 titres)
N, T = bo.QUARTER + 7, 40
start = date(2026, 6, 1)
dates = []
d = start
while len(dates) < N:
    if d.weekday() < 5:
        dates.append(d.isoformat())
    d += timedelta(days=1)
U = {f"T{i:02d}" for i in range(T)}
SPL = "T07"                        # split 2-pour-1 le dernier jour
history = {}
for k, dd in enumerate(dates):
    rows = {}
    for i in range(T):
        t = f"T{i:02d}"
        trend = (i % 5 - 2) * 0.006                     # tendances differentes : hausses et baisses de 25 %
        c = 10 * math.exp(trend * k + 0.03 * math.sin(k * (i + 1) / 7))
        rows[t] = [round(c, 4), 150_000 + 1000 * ((k * 7 + i) % 13)]
    history[dd] = rows
D = dates[-1]
history[D][SPL] = [round(history[D][SPL][0] / 2, 4), history[D][SPL][1] * 2]   # le jour du split : cloture brute divisee par 2
del history[dates[-2]]["T09"]                                                 # suspendu la veille, cote le jour meme
splits = {D: {SPL: 2.0}}

ref = bo.compute_long(dates, history, U, splits)[D]                           # ce que Polygon donnera le lendemain matin
prev = history[dates[-2]]


def snap_from(day_rows, prev_rows, day_splits=None, bad=None):
    """Releve TradingView simule : (cloture, volume, cloture de la veille ajustee des splits du jour)."""
    out = {}
    for t, (c, v, *_) in day_rows.items():
        c1 = prev_rows[t][0] / (day_splits or {}).get(t, 1) if t in prev_rows else c
        out[t] = (c, v, c1 * (bad or {}).get(t, 1))
    return out


snap = snap_from(history[D], prev, splits[D])
got = bs.provisional(D, snap, dates[:-1], history, U, {})
keys = ("up25m", "down25m", "up25q", "down25q", "t2108")
checks["memes chiffres que Polygon (compute_long) : " + str({k: ref[k] for k in keys})] = {k: got.get(k) for k in keys} == {k: ref[k] for k in keys}
checks["fenetres longues non triviales (hausses et baisses de 25 %)"] = ref["up25q"] > 0 and ref["down25q"] > 0 and ref["up25m"] + ref["down25m"] > 0
checks["split du jour detecte (veille TradingView / cache = 2)"] = got["splits"] == 1
checks["n = titres de l'univers cotes la seance et la veille"] = got["n"] == bo.count_compared(history[D], prev, U) == T - 1

# veille incoherente (+10 %) : titre ignore (ni identique ni split) ; le resultat change d'au plus ce titre
odd = bs.provisional(D, snap_from(history[D], prev, splits[D], bad={"T03": 1.1}), dates[:-1], history, U, {})
checks["veille incoherente : titre ignore"] = odd["n"] == got["n"] - 1

# cache pas a la veille : refus
try:
    bs.provisional(D, snap, dates[:-2], history, U, {})
    checks["cache en retard d'une seance : refus"] = False
except bs.Stale as e:
    checks["cache en retard d'une seance : refus"] = "differente de la veille" in str(e).replace("é", "e")
try:
    bs.provisional(dates[-2], snap, dates[:-1], history, U, {})
    checks["cache deja a la seance : refus"] = False
except bs.Stale:
    checks["cache deja a la seance : refus"] = True
try:
    bs.provisional(D, {t: snap[t] for t in list(snap)[:20]}, dates[:-1], history, U, {})
    checks["trop peu de titres retrouves sur TradingView : refus"] = False
except bs.Stale as e:
    checks["trop peu de titres retrouves sur TradingView : refus"] = "retrouv" in str(e)

# ---------------------------------------------------------------- de bout en bout : soir puis matin
with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp) / "breadth_data.js"
    uni = Path(tmp) / "universe.json"
    uni.write_text(json.dumps({"tickers": sorted(U)}))
    cached = dates[:-1]
    fd.UNIVERSE_FILE = uni
    bo.OUT = out
    fh.load_splits_file = lambda: {}
    fh.load_history = lambda: (list(cached), {x: history[x] for x in cached})
    fh.HISTORY = Path(tmp) / "history"            # fichiers vides : read_day simule (historique synthetique)
    fh.HISTORY.mkdir()
    for x in cached:
        (fh.HISTORY / f"{x}.json.gz").touch()
    fh.read_day = lambda d, need_ohlc=False: history[d.isoformat()]
    tb.OUT = Path(tmp) / "tv_breadth_data.js"
    tb.write_js([[D, 41.0, 5000, 7, 3]], None, tb.OUT)
    # matin de D : Polygon jusqu'a la veille
    bo.main()
    morning = json.loads(out.read_text().split("=", 1)[1].rstrip(";\n"))
    ix = {c: i for i, c in enumerate(morning["columns"])}
    checks["breadth_own : colonnes n et provisional"] = "n" in ix and "provisional" in ix
    checks["breadth_own : n calcule, aucune ligne provisoire"] = morning["rows"][-1][ix["n"]] == T - 1 and \
        all(r[ix["provisional"]] is None for r in morning["rows"])
    # soir de D : releve TradingView (screener et measure simules : seance D close, +4 / -4 du releve)
    cols = tb.SCAN_COLS
    items = []
    for t, (c, v, c1) in snap.items():
        r = {"name": t, "close": c, "close[1]": c1, "volume": v, "volume[1]": v, "subtype": tb.CFG["subtype"],
             "type": tb.CFG["type"], "exchange": tb.CFG["exchanges"][0]}
        items.append([r.get(k) for k in cols])
    checks["--needed : seance du releve absente -> true"] = bs.needed() is True
    tb.screener = lambda: items
    tb.measure = lambda its, now: (D, (41.0, len(its), 7, 3))
    bs.main()
    evening = json.loads(out.read_text().split("=", 1)[1].rstrip(";\n"))
    last = evening["rows"][-1]
    checks["soir : seance du jour ecrite, provisoire"] = last[0] == D and last[ix["provisional"]] is True
    checks["soir : ±4 % du releve, fenetres longues du calcul"] = last[1:3] == [7, 3] and last[ix["up25q"]] == ref["up25q"] \
        and last[ix["t2108"]] == ref["t2108"] and last[ix["ratio5"]] is not None
    errs = [e for e in vd.check_breadth(evening, date.fromisoformat(D)) if "n hors bornes" not in e]   # 40 titres synthetiques
    checks["soir : controle valide " + str(errs)] = errs == []
    checks["controle : n de 40 titres hors bornes"] = any("n hors bornes" in e for e in vd.check_breadth(evening, date.fromisoformat(D)))
    before = out.read_text()
    bs.main()
    checks["soir, second passage : fichier identique"] = out.read_text() == before
    checks["--needed : seance deja ecrite -> false"] = bs.needed() is False
    # matin de D+1 : Polygon a la seance D -> ligne recalculee, marque retiree
    cached = list(dates)
    (fh.HISTORY / f"{D}.json.gz").touch()
    fh.load_splits_file = lambda: splits
    bo.main()
    final = json.loads(out.read_text().split("=", 1)[1].rstrip(";\n"))
    lf = final["rows"][-1]
    checks["matin suivant : ligne Polygon, plus provisoire"] = lf[0] == D and lf[ix["provisional"]] is None and lf[1:3] != [7, 3]
    checks["matin suivant : memes fenetres longues que le soir"] = all(lf[ix[k]] == last[ix[k]] for k in keys)
    after = out.read_text()
    bs.main()                                          # soir apres Polygon (meme seance) : rien a faire
    checks["Polygon deja passe : le soir ne reecrit pas"] = out.read_text() == after
    # controle : provisoire au milieu de la serie refuse ; n hors bornes refuse
    bad = json.loads(json.dumps(evening))
    bad["rows"][-3][ix["provisional"]] = True
    checks["controle : provisoire au milieu de la serie refuse"] = any("provisoire" in e for e in vd.check_breadth(bad, date.fromisoformat(D)))

ok = True
for name, passed in checks.items():
    print(("ok     " if passed else "ECHEC  ") + name)
    ok = ok and bool(passed)
sys.exit(0 if ok else 1)
