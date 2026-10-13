#!/usr/bin/env python3
"""Telecharge l'historique daily du VIX depuis le fichier CSV public du CBOE et ecrit vix_data.js pour le dashboard.

Source : CBOE, https://www.cboe.com/tradable_products/vix/vix_historical_data/ (fichier VIX_History.csv, sans cle API).
Colonnes du fichier : DATE (mm/jj/aaaa), OPEN, HIGH, LOW, CLOSE ; depuis 1990.
Sortie : vix_data.js -> window.VIX = [[date ISO, open, high, low, close], ...] (on garde a partir de --start).
Donnees du CBOE : a citer si republiees.
"""
import argparse
import csv
import io
import json
import sys
from datetime import datetime
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv"   # redirige vers cdn-api.cboe.com
OUT = HERE / "vix_data.js"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", default="2018-01-01", help="premiere date conservee (debut des donnees Stockbee : 2018-12)")
    args = ap.parse_args()

    r = requests.get(URL, timeout=60)
    r.raise_for_status()
    rows = []
    for rec in csv.DictReader(io.StringIO(r.text)):
        try:
            d = datetime.strptime(rec["DATE"].strip(), "%m/%d/%Y").date().isoformat()
            vals = [float(rec[k]) for k in ("OPEN", "HIGH", "LOW", "CLOSE")]
        except (KeyError, ValueError):
            continue                    # ligne vide ou format inattendu
        if d >= args.start:
            rows.append([d] + vals)
    if not rows:
        sys.exit("Aucune donnee VIX recuperee : le format du fichier CBOE a peut-etre change.")
    rows.sort(key=lambda x: x[0])
    OUT.write_text("window.VIX = " + json.dumps(rows, separators=(",", ":")) + ";\n")
    print(f"VIX : {len(rows)} seances ({rows[0][0]} -> {rows[-1][0]}), dernier close {rows[-1][4]:.2f}")
    print(f"Ecrit : {OUT.name}")


if __name__ == "__main__":
    main()
