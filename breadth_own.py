#!/usr/bin/env python3
"""Breadth calcule par nous, depuis cache/history/ (voir fetch_history.py) : +4 % / -4 %, ratios 5 / 10 j,
+25 % / -25 % sur un mois et sur un trimestre (experimental), T2108.

Formules TC2000 (ne pas modifier sans accord ; identiques a fetch_data.py, valide contre Stockbee : ecart moyen ~2,6 titres) :
    Haussier : 100 * (C - C1) / C1 >= 4   ET  V >= 100000  ET  V > V1
    Baissier : C / C1 <= 96 / 100         ET  V >= 100000  ET  V > V1
    Splits   : la veille est ajustee le jour du split (prix / ratio, volume * ratio).
Univers : actions ordinaires NYSE / Nasdaq / AMEX (cache/universe.json), radiees incluses.
Ratio 5 / 10 j = somme des haussiers / somme des baissiers sur 5 / 10 seances.

Fenetres longues (definitions de Stockbee inconnues : approximations calibrees contre sa serie, voir RECAP_PROJET.md).
Les clotures sont ajustees des splits sur toute la fenetre (sinon un split 2-pour-1 compterait comme -50 %).
    Mois (20 seances)  : C / C[20] >= 1,25 (hausse) ou <= 0,75 (baisse) ; V >= 100 000 ; cloture brute de depart >= 5 $.
                         Mesure (52 seances, juil.-oct. 2026) : correlation 0,999 / 0,983, niveaux 13 % / 27 % sous Stockbee.
    Trimestre (63 s.)  : EXPERIMENTAL. C / plus bas des 63 clotures precedentes >= 1,25, C / plus haut <= 0,75 ;
                         V >= 100 000 ; present sur 90 % de la fenetre ; premiere cloture brute >= 5 $.
                         Mesure sur 9 seances seulement : comptes 40 a 70 % sous Stockbee, a recaler.
    T2108              : % des titres de l'univers (40 clotures presentes) dont C > SMA 40 (C incluse).
                         Mesure (33 seances) : correlation 0,98, biais +0 a +6 points selon la periode.

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
COLUMNS = ["date", "up4", "down4", "ratio5", "ratio10", "up25m", "down25m", "up25q", "down25q", "t2108"]
LONG = COLUMNS[5:]           # fenetres longues : absentes tant que l'historique en cache est trop court
MONTH, QUARTER, SMA = 20, 63, 40
MIN_PRICE = 5.0              # cloture brute de depart minimale (sans ce filtre : ~2 fois trop de titres sur le mois)
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


def adjusted_series(dates, history, universe, splits):
    """({ticker: [cloture ajustee | None]}, {ticker: [cloture brute | None]}) alignes sur `dates`.

    Ajustement arriere : une cloture anterieure a un split (date s, ratio r) est divisee par r ; toutes les clotures d'un
    titre sont ainsi comparables entre elles sur la fenetre en cache.
    """
    n, raw = len(dates), {}
    for k, d in enumerate(dates):
        for t, (c, _v) in history[d].items():
            if t in universe and c and c > 0:
                raw.setdefault(t, [None] * n)[k] = c
    adj = {t: list(v) for t, v in raw.items()}
    index = {d: k for k, d in enumerate(dates)}
    for s, by_ticker in splits.items():
        if s not in index:
            continue
        for t, r in by_ticker.items():
            if t in adj and r and r > 0:
                for k in range(index[s]):
                    if adj[t][k] is not None:
                        adj[t][k] /= r
    return adj, raw


def compute_long(dates, history, universe, splits):
    """{date: {up25m, down25m, up25q, down25q, t2108}} ; une metrique est None tant que sa fenetre n'est pas en cache."""
    adj, raw = adjusted_series(dates, history, universe, splits)
    out = {}
    for i, d in enumerate(dates):
        vol = history[d]
        um = dm = uq = dq = above = total = 0
        for t, a in adj.items():
            c = a[i]
            if c is None:
                continue
            v = vol[t][1] if t in vol else 0
            if i >= MONTH and v >= MIN_VOL:
                b, rb = a[i - MONTH], raw[t][i - MONTH]
                if b and rb is not None and rb >= MIN_PRICE:
                    if c / b >= 1.25:
                        um += 1
                    elif c / b <= 0.75:
                        dm += 1
            if i >= QUARTER and v >= MIN_VOL:
                w = [x for x in a[i - QUARTER:i] if x is not None]
                first = next((x for x in raw[t][i - QUARTER:i] if x is not None), None)
                if len(w) >= 0.9 * QUARTER and first is not None and first >= MIN_PRICE:
                    if c / min(w) >= 1.25:
                        uq += 1
                    if c / max(w) <= 0.75:
                        dq += 1
            if i >= SMA - 1:
                w = a[i - SMA + 1:i + 1]
                if None not in w:
                    total += 1
                    if c > sum(w) / SMA:
                        above += 1
        out[d] = {"up25m": um if i >= MONTH else None, "down25m": dm if i >= MONTH else None,
                  "up25q": uq if i >= QUARTER else None, "down25q": dq if i >= QUARTER else None,
                  "t2108": round(100 * above / total, 2) if i >= SMA - 1 and total else None}
    return out


def build_rows(counts, long=None):
    """[[date, up, down, ratio5, ratio10, up25m, down25m, up25q, down25q, t2108]] triees ; ratio None tant que la
    fenetre n'est pas complete ; fenetres longues None si absentes de `long`."""
    long = long or {}
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
        row += [long.get(d, {}).get(k) for k in LONG]
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


def load_existing_long(path=OUT):
    """{date: {colonne longue: valeur}} deja publie (vide si absent : anciens fichiers sans ces colonnes)."""
    try:
        text = Path(path).read_text()
        data = json.loads(text[text.index("=") + 1:].strip().rstrip(";"))
        ix = {c: i for i, c in enumerate(data["columns"])}
        return {r[0]: {k: r[ix[k]] for k in LONG if k in ix and ix[k] < len(r)} for r in data["rows"]}
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
    splits = fh.load_splits_file()
    counts, long = load_existing(), load_existing_long()
    fresh = compute_counts(dates, history, universe, splits)
    counts.update(fresh)
    for d, vals in compute_long(dates, history, universe, splits).items():   # une valeur deja publiee n'est pas effacee
        long.setdefault(d, {}).update({k: v for k, v in vals.items() if v is not None})
    rows = build_rows(counts, long)
    write_js(rows, len(universe))
    print(f"Ecrit : {OUT.name} ({len(rows)} seances, {len(fresh)} recalculees, derniere {rows[-1][0]})")


if __name__ == "__main__":
    main()
