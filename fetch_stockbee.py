#!/usr/bin/env python3
"""Recupere le Market Monitor publie par Stockbee (Pradeep Bonde) : Google Sheet public, un onglet par annee.

Source : https://stockbee.blogspot.com/p/mm.html (iframe vers le Google Sheet publie).
Ecrit : stockbee_market_monitor.csv (colonnes ci-dessous, tri chronologique).
Donnees tierces : usage personnel, a citer si republiees.
"""
import argparse
import csv
import io
import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

import mmconfig

HERE = Path(__file__).resolve().parent
CFG = mmconfig.load("sources")["stockbee"]   # Google Sheet, onglets (annee -> gid), delai : config/sources.toml [stockbee]
SHEET = CFG["sheet"]
GIDS = {int(y): g for y, g in CFG["gids"].items()}
COLUMNS = ["date", "up4", "down4", "ratio5", "ratio10", "up25q", "down25q", "up25m", "down25m",
           "up50m", "down50m", "up13_34d", "down13_34d", "universe", "t2108", "sp500"]


def num(s):
    s = s.strip().replace(",", "")
    try:
        return float(s) if "." in s else int(s)
    except ValueError:
        return None


def fetch_year(year, gid):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET}/pub"
    r = requests.get(url, params={"output": "csv", "gid": gid}, timeout=CFG["timeout"])
    r.raise_for_status()
    rows = []
    for line in csv.reader(io.StringIO(r.text)):
        try:
            d = datetime.strptime(line[0].strip(), "%m/%d/%Y").date()
        except (ValueError, IndexError):
            continue  # en-tetes et lignes vides
        vals = [num(x) for x in line[1:16]] + [None] * (15 - len(line[1:16]))
        rows.append([d.isoformat()] + vals)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from-year", type=int, default=min(GIDS), help="premiere annee (2019 min.)")
    args = ap.parse_args()
    this_year = datetime.now(ZoneInfo(mmconfig.load("market")["timezone"])).year
    if this_year not in GIDS:
        print(f"⚠️ onglet {this_year} absent de config/sources.toml [stockbee] gids : la serie s'arrete au 31/12/{max(GIDS)}", flush=True)
    rows = []
    for year in sorted(GIDS):
        if year >= args.from_year:
            got = fetch_year(year, GIDS[year])
            print(f"{year}: {len(got)} seances", flush=True)
            rows += got
    if not rows:
        sys.exit("Aucune donnee recuperee.")
    # les onglets se chevauchent autour du nouvel an : on garde la derniere occurrence de chaque date
    rows = sorted({r[0]: r for r in rows}.values(), key=lambda r: r[0])
    out = HERE / "stockbee_market_monitor.csv"
    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        w.writerows(rows)
    # meme contenu pour le dashboard : un .js se charge en double-clic (pas de fetch, donc pas de blocage file://)
    js = HERE / "stockbee_data.js"
    js.write_text("window.STOCKBEE = " + json.dumps({"columns": COLUMNS, "rows": rows}, separators=(",", ":")) + ";\n")
    print(f"Ecrit : {out.name} et {js.name} ({len(rows)} seances, {rows[0][0]} -> {rows[-1][0]})")


if __name__ == "__main__":
    main()
