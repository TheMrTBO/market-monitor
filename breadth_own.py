#!/usr/bin/env python3
"""Breadth +4 % / -4 % et ratios 5 / 10 j calcules par nous, depuis cache/history/ (voir fetch_history.py).

Formules TC2000 (ne pas modifier sans accord ; identiques a fetch_data.py, valide contre Stockbee : ecart moyen ~2,6 titres) :
    Haussier : 100 * (C - C1) / C1 >= 4   ET  V >= 100000  ET  V > V1
    Baissier : C / C1 <= 96 / 100         ET  V >= 100000  ET  V > V1
    Splits   : la veille est ajustee le jour du split (prix / ratio, volume * ratio).
Univers : actions ordinaires NYSE / Nasdaq / AMEX (cache/universe.json), radiees incluses.
Ratio 5 / 10 j = somme des haussiers / somme des baissiers sur 5 / 10 seances.

Sortie : breadth_data.js -> window.BREADTH_OWN = {columns, rows, asof, universe}. Seuls des agregats sont ecrits (aucune
donnee brute dans le depot). Les lignes deja presentes sont conservees : la serie s'allonge chaque jour meme si le cache
d'historique est glissant ; les seances en cache sont recalculees.
Stockbee ne sert plus que de controle croise (voir validate_data.py et le pied de page du dashboard).

Usage : python3 breadth_own.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "breadth_data.js"
COLUMNS = ["date", "up4", "down4", "ratio5", "ratio10"]
THRESHOLD = 4
MIN_VOL = 100_000
MIN_SESSIONS = 12          # 11 variations de seance pour le ratio 10 j + la seance de depart


def count_breadth(today, prev, universe, splits, threshold=THRESHOLD, min_vol=MIN_VOL):
    """(nb haussiers, nb baissiers) entre deux seances. today / prev : {ticker: [close, volume]}."""
    up = down = 0
    for t, (c, v) in today.items():
        if t not in universe or t not in prev:
            continue
        c1, v1 = prev[t]
        ratio = splits.get(t)
        if ratio:                                     # split le jour J : veille ajustee (prix / ratio, volume * ratio)
            c1, v1 = c1 / ratio, v1 * ratio
        if c1 <= 0 or v < min_vol or v <= v1:
            continue
        if 100 * (c - c1) / c1 >= threshold:
            up += 1
        elif c / c1 <= (100 - threshold) / 100:
            down += 1
    return up, down


def compute_counts(dates, history, universe, splits):
    """{date: [up, down]} pour chaque seance sauf la premiere (qui ne sert que de veille)."""
    out = {}
    for prev_d, d in zip(dates, dates[1:]):
        today = history[d]
        prev = history[prev_d]
        out[d] = list(count_breadth(today, prev, universe, splits.get(d, {})))
    return out


def build_rows(counts):
    """[[date, up, down, ratio5, ratio10]] triees ; ratio None tant que la fenetre n'est pas complete."""
    rows, ups, downs = [], [], []
    for d in sorted(counts):
        u, dn = counts[d]
        ups.append(u)
        downs.append(dn)
        row = [d, u, dn]
        for n in (5, 10):
            if len(ups) >= n:
                su, sd = sum(ups[-n:]), sum(downs[-n:])
                row.append(round(su / sd, 2) if sd else None)
            else:
                row.append(None)
        rows.append(row)
    return rows


def load_existing(path=OUT):
    """{date: [up, down]} deja publie (vide si le fichier manque ou est illisible)."""
    try:
        text = Path(path).read_text()
        data = json.loads(text[text.index("=") + 1:].strip().rstrip(";"))
        return {r[0]: [r[1], r[2]] for r in data["rows"]}
    except (OSError, ValueError, KeyError, IndexError):
        return {}


def write_js(rows, universe_size, path=OUT):
    payload = {"columns": COLUMNS, "rows": rows, "asof": rows[-1][0] if rows else None, "universe": universe_size}
    Path(path).write_text("window.BREADTH_OWN = " + json.dumps(payload, separators=(",", ":")) + ";\n")


def main():
    import fetch_history as fh            # importe fetch_data (requests) : seulement si on execute le calcul
    import fetch_data as fd
    dates, history = fh.load_history()
    if len(dates) < MIN_SESSIONS:
        sys.exit(f"Historique insuffisant : {len(dates)} seances en cache (minimum {MIN_SESSIONS}). "
                 f"Lance python fetch_history.py (cle POLYGON_API_KEY).")
    try:
        universe = set(json.loads(fd.UNIVERSE_FILE.read_text())["tickers"])
    except (OSError, ValueError, KeyError):
        sys.exit("Univers introuvable (cache/universe.json) : lance python fetch_history.py.")
    counts = load_existing()
    fresh = compute_counts(dates, history, universe, fh.load_splits_file())
    counts.update(fresh)
    rows = build_rows(counts)
    write_js(rows, len(universe))
    print(f"Ecrit : {OUT.name} ({len(rows)} seances, {len(fresh)} recalculees, derniere {rows[-1][0]})")


if __name__ == "__main__":
    main()
