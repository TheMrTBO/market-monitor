#!/usr/bin/env python3
"""Test : short interest de l'onglet Tickers (fetch_short.py), sans réseau (Yahoo simulé).

Vérifie : ordre de rafraîchissement (demandés, jamais vus, puis plus anciens), taille du lot, conversion des champs Yahoo,
arrêt du lot après trop d'erreurs consécutives, valeurs déjà connues jamais effacées par un échec, symbole Yahoo, contrôle.
"""
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import fetch_short as fs         # noqa: E402
import validate_data             # noqa: E402

checks = {}


def check(label, cond):
    checks[label] = bool(cond)


known = {"AAA": {"at": "2026-10-01", "dtc": 2.0}, "BBB": {"at": "2026-10-10", "dtc": 3.0}}
check("ordre : demandés, jamais vus, puis du plus ancien au plus récent",
      fs.pick(["AAA", "BBB", "CCC", "DDD"], known, 4, first=["BBB"]) == ["BBB", "CCC", "DDD", "AAA"])
check("taille du lot respectée", fs.pick(["AAA", "BBB", "CCC", "DDD"], known, 2) == ["CCC", "DDD"])
check("symbole Yahoo : BRK.B -> BRK-B", fs.yahoo_symbol("BRK.B") == "BRK-B")

info = {"floatShares": 1.5e8, "sharesShort": 3e6, "shortPercentOfFloat": 0.02, "shortRatio": 1.234567, "dateShortInterest": 1790726400}
r = fs.to_row(info, "2026-10-18")
check("conversion des champs Yahoo (config/short.toml [fields])", r == {"flt": 150000000, "sh": 3000000, "pct": 0.02, "dtc": 1.2346,
      "date": "2026-09-30", "at": "2026-10-18"})
check("valeur négative ou texte ignorés", fs.to_row({"floatShares": -5, "shortRatio": "n/a", "sharesShort": 10}, "x")["flt"] is None)
check("aucune donnée Yahoo : pas de ligne", fs.to_row({}, "x") is None)

ok_info = lambda s: info
rows, ok, errs, stopped = fs.run(["AAA", "BBB", "CCC"], known, 10, fetch=ok_info, sleep=lambda s: None, today="2026-10-18")
check("lot complet : toutes rafraîchies", ok == 3 and not errs and not stopped and rows["CCC"]["dtc"] == 1.2346)


def boom(s):
    raise ConnectionError("429")


fs.CFG = dict(fs.CFG, max_errors=3)
syms = ["AAA", "BBB"] + [f"X{i}" for i in range(10)]
rows, ok, errs, stopped = fs.run(syms, known, 12, fetch=boom, sleep=lambda s: None, today="2026-10-18")
check("Yahoo bloque : lot arrêté après max_errors erreurs de suite", stopped and errs == 3 and ok == 0)
check("Yahoo bloque : valeurs déjà connues gardées", rows["AAA"]["dtc"] == 2.0 and rows["BBB"]["dtc"] == 3.0 and "X0" not in rows)

payload = {"updated": "2026-10-18T12:20:00+00:00", "cols": fs.COLS,
           "rows": {f"S{i}": [1e8, 1e6, 0.01, 1.5, "2026-09-30", "2026-10-18"] for i in range(600)}}
f = dict(validate_data.fresh("short"))
check("contrôle : fichier valide accepté", validate_data.check_short(payload, date(2026, 10, 18)) == [])
check("contrôle : passage trop ancien refusé", any("dernier passage" in e for e in validate_data.check_short(payload, date(2026, 11, 30))))
payload["rows"]["S1"][3] = -2
check("contrôle : valeur incohérente refusée", any("incohérente" in e for e in validate_data.check_short(payload, date(2026, 10, 18))))

for label, good in checks.items():
    print(("ok     " if good else "ECHEC  ") + label)
sys.exit(0 if all(checks.values()) else 1)
