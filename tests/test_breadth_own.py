#!/usr/bin/env python3
"""Tests du calcul maison du breadth (breadth_own.py), de l'historique (fetch_history.py) et du controle croise.

Aucun acces reseau, aucune cle : les appels Polygon sont simules. Verifie :
  - les formules +4 % / -4 % (volume minimal, volume croissant, split) et leur equivalence avec fetch_data.count_breadth ;
  - les ratios 5 / 10 j (fenetre incomplete = absent, division par zero = absent) ;
  - la conservation des lignes deja publiees quand le cache d'historique est glissant ;
  - le telechargement : reprise sans retelechargement, jour ferie, jour non publie, ancien format, elagage, splits ;
  - le controle de coherence : une seance partielle (ecart anormal avec Stockbee) est refusee.
Sortie : code 0 si tout est conforme.
"""
import gzip
import json
import sys
import tempfile
import types
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.modules.setdefault("requests", types.ModuleType("requests"))     # fetch_data l'importe ; aucun appel reel ici

import breadth_own as bo          # noqa: E402
import fetch_data as fd           # noqa: E402
import fetch_history as fh        # noqa: E402
import validate_data as vd        # noqa: E402

checks = {}

# ---------------------------------------------------------------- formules
U = {"AAA", "BBB", "CCC", "DDD", "EEE", "SPL"}
prev = {"AAA": [10.0, 100_000], "BBB": [10.0, 100_000], "CCC": [10.0, 100_000], "DDD": [10.0, 500_000],
        "EEE": [10.0, 100_000], "SPL": [100.0, 100_000], "ZZZ": [10.0, 100_000]}
today = {"AAA": [10.4, 200_000],      # +4,0 %, volume ok et croissant           -> haussier
         "BBB": [9.6, 200_000],       # -4,0 %                                    -> baissier
         "CCC": [10.4, 99_000],       # +4 % mais volume < 100 000                -> ignore
         "DDD": [10.5, 400_000],      # +5 % mais volume en baisse (V <= V1)      -> ignore
         "EEE": [10.3, 300_000],      # +3 %                                      -> ignore
         "SPL": [50.0, 150_000],      # split 2-pour-1 : veille 50 / 200 000      -> 0 % -> ignore
         "ZZZ": [20.0, 900_000]}      # hors univers                              -> ignore
# sans split declare, SPL (100 -> 50) compte comme -50 % : baissier ; avec split 2-pour-1, 0 % : ignore
checks["haussier +4 % exact / baissier -4 % exact, filtres volume et univers"] = \
    bo.count_breadth(today, prev, U, {"SPL": 2.0}) == (1, 1)
checks["split 2-pour-1 : la veille est ajustee (pas de faux -50 %)"] = \
    bo.count_breadth(today, prev, U, {"SPL": 2.0}) == (1, 1) and bo.count_breadth(today, prev, U, {}) == (1, 2)
checks["identique a fetch_data.count_breadth"] = all(
    bo.count_breadth(today, prev, U, s) == fd.count_breadth(today, prev, U, s, 4, 100_000) for s in ({}, {"SPL": 2.0}))

# ---------------------------------------------------------------- ratios
counts = {f"2026-09-{d:02d}": [d, 10] for d in range(1, 13)}          # 12 seances : up = 1..12, down = 10
counts["2026-09-12"][1] = 0                                           # division par zero sur la derniere
rows = bo.build_rows(counts)
checks["ratio5 absent avant 5 seances, puis somme up / somme down"] = \
    [r[3] for r in rows[:4]] == [None] * 4 and rows[4][3] == round((1 + 2 + 3 + 4 + 5) / 50, 2)
checks["ratio10 absent avant 10 seances"] = [r[4] for r in rows[:9]] == [None] * 9 and rows[9][4] == round(55 / 100, 2)
checks["division par zero : ratio absent, pas d'exception"] = rows[-1][3] is None or rows[-1][3] > 0

# ---------------------------------------------------------------- fenetres longues : mois, trimestre, T2108, splits
LD = [f"s{k:03d}" for k in range(70)]                              # 70 seances fictives (ordre lexicographique = temps)
LU = {"UP", "DN", "FLAT", "CHEAP", "LOWV", "SPLT"}
def _day(k):
    up = 10.0 if k < 50 else 13.0                                   # UP : +30 % a partir de la seance 50
    dn = 10.0 if k < 50 else 7.0                                    # DN : -30 %
    return {"UP": [up, 200_000], "DN": [dn, 200_000], "FLAT": [10.0, 200_000],
            "CHEAP": [2.0 if k < 50 else 3.0, 200_000],                # +50 %, depart a 2 $ : ignore sur le mois (< 5 $), compte sur le trimestre (>= 1 $)
            "LOWV": [10.0 if k < 50 else 13.0, 50_000],                 # +30 % avec un faible volume : compte (pas de filtre de volume)
            "SPLT": [100.0 if k < 60 else 50.0, 200_000]}               # split 2-pour-1 a la seance 60 : pas une baisse
LH = {d: _day(k) for k, d in enumerate(LD)}
long_ = bo.compute_long(LD, LH, LU, {LD[60]: {"SPLT": 2.0}})
checks["mois : absent avant 20 seances"] = long_[LD[19]]["up25m"] is None and long_[LD[20]]["up25m"] == 0
checks["mois : +25 % / -25 % sur 20 seances, prix de depart >= 5 $, sans filtre de volume"] = (long_[LD[60]]["up25m"], long_[LD[60]]["down25m"]) == (2, 1)
checks["mois : split 2-pour-1 ajuste (pas de faux -50 %)"] = (long_[LD[65]]["up25m"], long_[LD[65]]["down25m"]) == (2, 1)
checks["mois : sans declarer le split, faux -50 % (le test verifie bien l'ajustement)"] = \
    bo.compute_long(LD, LH, LU, {})[LD[65]]["down25m"] == 2
checks["trimestre : absent avant 63 seances, puis plus bas / plus haut de la fenetre, prix >= 1 $"] = \
    long_[LD[62]]["up25q"] is None and (long_[LD[63]]["up25q"], long_[LD[63]]["down25q"]) == (3, 1)
t = long_[LD[50]]["t2108"]            # seance 50 : UP, LOWV, CHEAP au-dessus de leur SMA 40 ; DN dessous ; FLAT et SPLT egaux
checks["T2108 : absent avant 40 seances, puis % au-dessus de la SMA 40"] = \
    long_[LD[38]]["t2108"] is None and t == round(100 * 3 / 6, 2)
rows_l = bo.build_rows({LD[60]: [1, 1]}, long_)
checks["lignes : colonnes longues a la suite des ratios"] = rows_l[0][5:] == [long_[LD[60]][k] for k in bo.LONG]

# ---------------------------------------------------------------- conservation des lignes publiees
with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp) / "breadth_data.js"
    old = bo.build_rows({"2026-08-03": [100, 50], "2026-08-04": [110, 60], "2026-09-01": [1, 1]})
    bo.write_js(old, 5000, out)
    kept = bo.load_existing(out)
    kept.update({"2026-09-01": [200, 80], "2026-09-02": [210, 70]})           # recalcul : une ligne corrigee, une nouvelle
    bo.write_js(bo.build_rows(kept), 5000, out)
    final = {r[0]: r for r in json.loads(out.read_text().split("=", 1)[1].strip().rstrip(";"))["rows"]}
    checks["lignes anciennes conservees, recalculees ecrasees, nouvelles ajoutees"] = (
        final["2026-08-03"][1:3] == [100, 50] and final["2026-09-01"][1:3] == [200, 80] and "2026-09-02" in final)
    checks["fichier illisible : repart de zero sans exception"] = bo.load_existing(Path(tmp) / "absent.js") == {}
    bo.write_js(bo.build_rows({"2026-09-01": [1, 1]}, {"2026-09-01": {"up25m": 40, "t2108": 31.5}}), 5000, out)
    checks["colonnes longues relues (mois, T2108)"] = bo.load_existing_long(out)["2026-09-01"]["up25m"] == 40


# ---------------------------------------------------------------- historique (API simulee)
class FakeApi:
    def __init__(self, holidays=(), unpublished=()):
        self.holidays, self.unpublished, self.calls = set(holidays), set(unpublished), []

    def get(self, url, params=None):
        d = url.rsplit("/", 1)[-1]
        self.calls.append(d)
        if d in self.holidays or d in self.unpublished:
            return {"results": []}
        return {"results": [{"T": "AAA", "c": 10.0, "v": 200_000}, {"T": "BBB", "c": 5.0, "v": 1_000}]}

    def pages(self, url, params=None):
        yield {"execution_date": params["execution_date.gte"], "ticker": "AAA", "split_from": 1, "split_to": 2}


with tempfile.TemporaryDirectory() as tmp:
    fh.HISTORY, fh.SPLITS_FILE = Path(tmp) / "history", Path(tmp) / "splits.json"
    end = date(2026, 10, 9)                                              # un vendredi
    api = FakeApi(holidays={"2026-10-07"}, unpublished=())
    n = fh.update(api, 5, end, keep=400, log=lambda *_: None)
    got = fh.list_sessions()
    checks["5 seances sautent le jour ferie et les week-ends"] = got == [
        "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"]
    checks["jour ferie note, donc redemande jamais"] = fh.read_day(date(2026, 10, 7)) == {}
    api2 = FakeApi(holidays={"2026-10-07"})
    n2 = fh.update(api2, 5, end, keep=400, log=lambda *_: None)
    checks["relance : aucune seance retelechargee"] = n > 0 and n2 == 0 and not api2.calls
    checks["splits enregistres (ratio = to / from)"] = fh.load_splits_file().get(
        min(fh.load_splits_file()), {}).get("AAA") == 2.0
    # ancien format (ajuste) : retelecharge
    p = fh.day_path(date(2026, 10, 9))
    with gzip.open(p, "wt") as f:
        json.dump({"adjusted": True, "rows": {"AAA": [1, 1]}}, f)
    api3 = FakeApi(holidays={"2026-10-07"})
    fh.update(api3, 5, end, keep=400, log=lambda *_: None)
    checks["ancien format ajuste : retelecharge"] = api3.calls.count("2026-10-09") == 1 and \
        fh.read_day(date(2026, 10, 9))["AAA"] == [10.0, 200_000]
    # jour du jour pas encore publie : ni ecrit comme ferie, ni bloquant
    with tempfile.TemporaryDirectory() as tmp2:
        fh.HISTORY, fh.SPLITS_FILE = Path(tmp2) / "history", Path(tmp2) / "splits.json"
        api4 = FakeApi(unpublished={"2026-10-09"})
        fh.update(api4, 3, end, keep=400, log=lambda *_: None)
        checks["seance du jour non publiee : ignoree, non notee ferie"] = fh.read_day(date(2026, 10, 9)) is None \
            and len(fh.list_sessions()) == 3
        # le plan gratuit refuse la seance du jour (403) : ignoree ; un refus sur une seance plus ancienne remonte
        class Denied(FakeApi):
            def get(self, url, params=None):
                d = url.rsplit("/", 1)[-1]
                if d in self.denied:
                    raise fd.PlanError("403")
                return super().get(url, params)

        with tempfile.TemporaryDirectory() as tmp3:
            fh.HISTORY, fh.SPLITS_FILE = Path(tmp3) / "history", Path(tmp3) / "splits.json"
            a = Denied()
            a.denied = {"2026-10-09"}
            fh.update(a, 2, end, keep=400, log=lambda *_: None)
            ignored = fh.list_sessions()[-1] == "2026-10-08"
            fh.HISTORY = Path(tmp3) / "history_b"                          # cache vide : la seance 10-08 doit etre telechargee
            raised = False
            b = Denied()
            b.denied = {"2026-10-08"}
            try:
                fh.update(b, 3, end, keep=400, log=lambda *_: None)
            except fd.PlanError:
                raised = True
            checks["403 sur la seance du jour : ignore ; sur une ancienne : remonte"] = ignored and raised
        fh.HISTORY, fh.SPLITS_FILE = Path(tmp2) / "history", Path(tmp2) / "splits.json"
        # elagage
        fh.update(FakeApi(), 6, date(2026, 10, 9), keep=3, log=lambda *_: None)
        checks["elagage : garde les `keep` seances les plus recentes"] = len(fh.list_sessions()) == 3 \
            and fh.list_sessions()[-1] == "2026-10-09"

# ---------------------------------------------------------------- controle de coherence
today_d = date(2026, 10, 13)
dates = [(date(2026, 10, 12) - timedelta(days=i)) for i in range(40)]
dates = sorted(d.isoformat() for d in dates if d.weekday() < 5)[-20:]          # 20 seances finissant le 12 octobre
with tempfile.TemporaryDirectory() as tmp:
    sb_rows = [[d, 200 + i, 150 + i, 1, 1] for i, d in enumerate(dates)]
    (Path(tmp) / "stockbee_data.js").write_text(
        "window.STOCKBEE = " + json.dumps({"columns": ["date", "up4", "down4", "ratio5", "ratio10"], "rows": sb_rows}) + ";\n")
    good = {"columns": bo.COLUMNS, "rows": [[d, 202 + i, 149 + i, 1.0, 1.0] for i, d in enumerate(dates)]}
    partial = {"columns": bo.COLUMNS, "rows": [[r[0], r[1] // 3, r[2] // 3, r[3], r[4]] for r in good["rows"]]}
    sbp = Path(tmp) / "stockbee_data.js"
    checks["calcul proche de Stockbee : valide"] = vd.check_breadth(good, today_d, sbp) == []
    checks["ecart anormal avec Stockbee : refuse"] = any("ecart anormal" in e for e in vd.check_breadth(partial, today_d, sbp))
    stale = vd.check_breadth(good, date(2026, 12, 1), sbp)
    checks["donnees trop anciennes : refuse"] = any("trop anciennes" in e for e in stale)
    checks["valeur absente : refuse"] = any("absentes" in e for e in vd.check_breadth(
        {"columns": bo.COLUMNS, "rows": [[d, None, 1, 1.0, 1.0] for d in dates]}, today_d))
    checks["trop peu de seances : refuse"] = any("minimum" in e for e in vd.check_breadth(
        {"columns": bo.COLUMNS, "rows": good["rows"][:5]}, today_d))

ok = True
for name, passed in checks.items():
    print(("ok     " if passed else "ECHEC  ") + name)
    ok = ok and bool(passed)
sys.exit(0 if ok else 1)
