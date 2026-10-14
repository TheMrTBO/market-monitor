#!/usr/bin/env python3
"""Telecharge les bougies daily d'une liste d'ETF sectoriels / thematiques et ecrit sectors_data.js (onglet « Secteurs »).

Source : Yahoo Finance via yfinance (gratuit, sans cle). Clotures de seance non ajustees des dividendes, comme dans TC2000.
Sortie : window.SECTORS = { asof, dates:[...], symbols:[{s, n, g, o, d (description), c:[...clotures], op:[...], h:[...], l:[...], v:[...]}] }
        (tous les tableaux sont alignes sur dates ; null quand l'ETF ne cotait pas encore).
Le classement lui-meme (avgC7 / avgC65, rang, variation de rang) est calcule dans le navigateur.

La liste de depart vient de TC2000 (YINN, ETF a effet de levier x3, est retire a la demande) ; les ajouts completent
les 11 secteurs SPDR et les principales industries / themes. Les noms sont indicatifs.
"""
import argparse
import json
import math
import sys
from datetime import date, timedelta, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "sectors_data.js"

import mmconfig

# Univers : config/sectors.toml (symbole, nom, groupe, origine, libellé court, description) ; ajouter un ETF = l'y ajouter
UNIVERSE = [(e["symbol"], e["name"], e["group"], e["origin"]) for e in mmconfig.sectors()]
DESC = {e["symbol"]: e["description"] for e in mmconfig.sectors() if e["description"]}


def session_still_open(day_iso):
    """Vrai si `day_iso` est aujourd'hui a New York et que la seance n'est pas finie (avant 16 h) : sa bougie est partielle,
    on ne l'enregistre pas (un passage du workflow pendant la seance ecrivait une bougie du jour incomplete)."""
    from zoneinfo import ZoneInfo
    m = mmconfig.load("market")
    t = datetime.now(ZoneInfo(m["timezone"]))
    return day_iso == t.date().isoformat() and t.hour < m["close_hour"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=900, help="historique en jours calendaires (900 = environ 620 seances : de quoi afficher la SMA 200)")
    args = ap.parse_args()
    try:
        import yfinance as yf
    except ImportError:
        sys.exit("Le module yfinance manque : pip install -r requirements.txt (dans le venv du projet).")

    symbols = [u[0] for u in UNIVERSE]
    start = (date.today() - timedelta(days=args.days)).isoformat()
    df = yf.download(symbols, start=start, interval="1d", auto_adjust=False, group_by="ticker",
                     progress=False, threads=True)
    if df is None or df.empty:
        sys.exit("Aucune donnee recue de Yahoo Finance (limitation de debit ? reessaie dans quelques minutes).")

    fields = {"c": "Close", "op": "Open", "h": "High", "l": "Low", "v": "Volume"}
    series = {}
    for s in symbols:
        try:
            sub = df[s][list(fields.values())].dropna(subset=["Close"])
        except KeyError:
            continue
        if len(sub):
            series[s] = {ts.date().isoformat(): row for ts, row in sub.iterrows()}

    dates = sorted({d for ser in series.values() for d in ser})
    if dates and session_still_open(dates[-1]):        # seance du jour pas finie : bougie partielle, non enregistree
        dates = dates[:-1]
    out = []
    for sym, name, grp, origin in UNIVERSE:
        ser = series.get(sym)
        if not ser:
            print(f"  ! {sym} : aucune donnee (ticker inconnu de Yahoo ?)")
            continue
        rec = {"s": sym, "n": name, "g": grp, "o": origin, "d": DESC.get(sym, "")}
        for key, col in fields.items():
            vals = []
            for d in dates:
                row = ser.get(d)
                v = None if row is None else row[col]
                vals.append(None if v is None or (isinstance(v, float) and math.isnan(v))
                            else (int(v) if key == "v" else round(float(v), 4)))
            rec[key] = vals
        out.append(rec)
    if len(out) < 0.9 * len(UNIVERSE):          # reponse partielle de Yahoo : on garde l'ancien fichier
        sys.exit(f"Seulement {len(out)}/{len(UNIVERSE)} ETF recus : {OUT.name} non modifie.")
    payload = {"asof": dates[-1], "dates": dates, "symbols": out}
    OUT.write_text("window.SECTORS = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n")

    short = [(s["s"], sum(c is not None for c in s["c"])) for s in out if sum(c is not None for c in s["c"]) < 70]
    print(f"{len(out)}/{len(UNIVERSE)} ETF, {len(dates)} seances ({dates[0]} -> {dates[-1]})")
    if short:
        print("Historique court (< 70 seances) :", ", ".join(f"{s} ({n})" for s, n in short))
    print(f"Ecrit : {OUT.name}")


if __name__ == "__main__":
    main()
