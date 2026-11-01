#!/usr/bin/env python3
"""Test : thèmes des actions d'après les ETF thématiques (fetch_etf_themes.py), sur des compositions fabriquées, sans réseau.

Vérifie : lecture d'un N-PORT (date, série, lignes), rapprochement avec l'index du site (ticker, CUSIP appris, nom normalisé,
deux mots stricts), lignes écartées (pas des actions, cotées hors des États-Unis, CUSIP « N/A »), thèmes par action (poids
minimum, au plus max_per_stock, thème le plus lourd d'abord), ETF illisible gardé du fichier publié, contrôle (validate_data).
"""
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import fetch_etf_themes as fe    # noqa: E402
import validate_data             # noqa: E402

checks = {}


def check(label, cond):
    checks[label] = bool(cond)


XML = b"""<?xml version="1.0"?><edgarSubmission xmlns="http://www.sec.gov/edgar/nport"><formData><genInfo>
<seriesId>S000099999</seriesId><repPdDate>2026-06-30</repPdDate></genInfo><invstOrSecs>
<invstOrSec><name>CrowdStrike Holdings Inc</name><title>CrowdStrike Holdings Inc</title><cusip>22788C105</cusip>
<identifiers><isin value="US22788C1053"/><ticker value="CRWD"/></identifiers><pctVal>8.5</pctVal><assetCat>EC</assetCat><invCountry>US</invCountry></invstOrSec>
<invstOrSec><name>Aeroports de Paris SA</name><title>ADP</title><cusip>N/A</cusip>
<identifiers><isin value="FR0010340141"/><ticker value="ADP"/></identifiers><pctVal>1.2</pctVal><assetCat>EC</assetCat><invCountry>FR</invCountry></invstOrSec>
</invstOrSecs></formData></edgarSubmission>"""
rep, ser, rows = fe.parse_nport(XML)
check("N-PORT : date du rapport, série, lignes (nom, CUSIP, ISIN, ticker, poids, catégorie, pays)",
      rep == "2026-06-30" and ser == "S000099999" and len(rows) == 2 and rows[0][:6] == ["CrowdStrike Holdings Inc", "CrowdStrike Holdings Inc", "22788C105", "US22788C1053", "CRWD", 8.5])

cols = ["s", "n"]
index = [["CRWD", "CrowdStrike Holdings, Inc. Class A"], ["ADP", "Automatic Data Processing, Inc."], ["XOM", "Exxonmobil Holdings Corporation"],
         ["DHI", "D.R. Horton, Inc."], ["WLKP", "Westlake Chemical Partners LP"], ["HY", "Hyster-Yale, Inc. Class A"], ["S", "SentinelOne, Inc. Class A"],
         ["ONB", "Old National Bancorp"]]
row = lambda name, cu="", isin="", tick="", pct=1.0, cat="EC", ctry="US": [name, name, cu, isin, tick, pct, cat, ctry]
learn = [[row("SentinelOne Inc", "81730H109", "US81730H1095", "S", 2.0)]]
m = fe.Matcher(index, cols, learn)
check("rapprochement : ticker donné et présent dans l'index", m(row("CrowdStrike", tick="CRWD")) == "CRWD")
check("rapprochement : CUSIP appris d'une autre composition (ligne sans ticker)", m(row("SENTINELONE INC-CL A", "81730H109")) == "S")
check("rapprochement : nom normalisé (« Exxon Mobil Corp » = Exxonmobil, « DR Horton » = D.R. Horton, suffixe d'État retiré)",
      m(row("Exxon Mobil Corp")) == "XOM" and m(row("DR Horton Inc")) == "DHI" and m(row("Old National Bancorp/IN")) == "ONB")
check("rapprochement : deux mots seulement si tous les mots du titre de l'index y sont (Hyster-Yale oui, Westlake Chemical non)",
      m(row("HYSTER-YALE MATERIALS HANDLING, INC.")) == "HY" and m(row("WESTLAKE CHEMICAL CORPORATION")) is None)
check("écartées : coté hors des États-Unis (Aéroports de Paris « ADP » ≠ ADP), pas une action, CUSIP « N/A » non appris",
      m(rows[1]) is None and m(row("CrowdStrike", tick="CRWD", cat="DBT")) is None and "N/A" not in m.cusip)

fe.CFG = {**fe.CFG, "min_weight": 0.5, "max_per_stock": 2, "etfs": {"CYB": "Cybersécurité", "CLD": "Cloud", "AI": "IA", "OLD": "Ancien"}}
comps = {"CYB": ("2026-06-30", [row("CrowdStrike", tick="CRWD", pct=8.0), row("SentinelOne Inc", "81730H109", pct=0.4)]),
         "CLD": ("2026-06-30", [row("CrowdStrike", tick="CRWD", pct=3.0), row("SentinelOne Inc", "81730H109", pct=2.0)]),
         "AI": ("2026-06-30", [row("CrowdStrike", tick="CRWD", pct=1.0)])}
prev = {"etfs": {"OLD": {"t": 0, "d": "2026-03-31", "n": 1}}, "h": {"OLD": [["XOM", 5.0]]}}
d = fe.build(comps, {"cols": cols, "rows": index}, prev, now=datetime(2026, 11, 1, tzinfo=timezone.utc))
th = d["themes"]
check("thèmes : au plus max_per_stock, le plus lourd d'abord (CRWD : Cybersécurité 8 %, Cloud 3 % ; IA 1 % coupé)",
      [th[t] for t, _ in d["stocks"]["CRWD"]] == ["Cybersécurité", "Cloud"])
check("thèmes : poids minimum (S : 0,4 % en cybersécurité ignoré, Cloud 2 % gardé)", [th[t] for t, _ in d["stocks"]["S"]] == ["Cloud"])
check("ETF illisible à ce passage : sa composition publiée est gardée (OLD → XOM)", d["h"]["OLD"] == [["XOM", 5.0]]
      and [th[t] for t, _ in d["stocks"]["XOM"]] == ["Ancien"] and d["etfs"]["OLD"]["d"] == "2026-03-31")

# contrôle : avec la config réelle (ETF connus) et des données fabriquées
fe.CFG = fe.mmconfig.load("etf_themes")
real = list(fe.CFG["etfs"].values())
themes = list(dict.fromkeys(real))
ok = {"updated": "2026-11-01T00:00:00Z", "themes": themes,
      "etfs": {e: {"t": themes.index(t), "d": "2026-06-30", "n": 1} for e, t in fe.CFG["etfs"].items()},
      "h": {e: [["CRWD", 1.0]] for e in fe.CFG["etfs"]}, "stocks": {f"T{i}": [[0, 1.0]] for i in range(400)}}
check("contrôle : fichier cohérent accepté", validate_data.check_etf_themes(ok, date(2026, 11, 2)) == [])
bad = {**ok, "stocks": {**ok["stocks"], "ZZZ": [[999, 1.0]]}, "updated": "2026-01-01T00:00:00Z"}
errs = validate_data.check_etf_themes(bad, date(2026, 11, 2))
check("contrôle : thème inconnu et passage trop ancien refusés", any("incohérents" in e for e in errs) and any("dernier passage" in e for e in errs))
old = {**ok, "etfs": {**ok["etfs"], next(iter(ok["etfs"])): {"t": 0, "d": "2025-01-01", "n": 1}}}
check("contrôle : composition trop vieille signalée", any("trop vieille" in e for e in validate_data.check_etf_themes(old, date(2026, 11, 2))))

for label, good in checks.items():
    print(("ok     " if good else "ECHEC  ") + label)
sys.exit(0 if all(checks.values()) else 1)
