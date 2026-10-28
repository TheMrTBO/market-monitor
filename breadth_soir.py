#!/usr/bin/env python3
"""Calcul maison du breadth dès la clôture : la séance du jour, provisoire, dans breadth_data.js (décision du 28/10/2026).

Polygon (plan gratuit) ne publie la séance qu'au matin de J+1 ; Stockbee vers 18 h 20 à New York. Pour avoir toute la série
maison (±4 %, ratios 5 / 10 j, ±25 % mois et trimestre, T2108, n), donc les phases de marché, dès 16 h 20 à New York, la
séance du jour est ajoutée à l'historique Polygon en cache (clôtures jusqu'à la veille) avec les clôtures du screener
TradingView, puis calculée par les MÊMES fonctions que breadth_own.py (formules TC2000 inchangées) :
    ±4 %          : relevé TradingView de la séance (fetch_tv_breadth.measure : close / close[1] / volume / volume[1]) ;
    ±25 %, T2108  : breadth_own.compute_long sur les QUARTER dernières séances du cache + la séance du jour ;
    n             : breadth_own.count_compared (titres de l'univers cotés la séance et la veille).
Contrôles (config/sources.toml [breadth_soir]) : la dernière séance du cache doit être la veille (clôture de la veille
TradingView = dernière clôture en cache pour au moins `min_match` des titres) ; un écart d'au moins `split_min` = split du
jour (clôtures d'avant divisées par le ratio, comme les splits Polygon) ; un écart entre les deux = titre ignoré ; au moins
`min_coverage` des titres de la veille retrouvés sur TradingView. Sinon : rien n'est écrit (avertissement).
La ligne est marquée `provisional` ; breadth_own.py la recalcule et retire la marque dès que Polygon a la séance.

Lancé par postmarket.yml, après fetch_tv_breadth.py, avec le cache Polygon de update.yml restauré (lecture seule).
Usage : python breadth_soir.py
"""
import json
import sys
from datetime import date, datetime, timezone

import breadth_own as bo
import mmconfig

CFG = mmconfig.load("sources")["breadth_soir"]


class Stale(Exception):
    """Le cache Polygon ou le relevé TradingView ne permettent pas de calculer la séance."""


def snapshot(items):
    """{ticker: (clôture, volume, clôture de la veille)} des actions ordinaires du relevé (mêmes règles que le T2108)."""
    from fetch_tv_breadth import SCAN_COLS, common
    out = {}
    for d in items:
        r = dict(zip(SCAN_COLS, d))
        if common(r) and None not in (r.get("name"), r.get("close"), r.get("close[1]"), r.get("volume")) and r["close[1]"] > 0:
            out[r["name"]] = (r["close"], r["volume"], r["close[1]"])
    return out


def provisional(day, snap, dates, history, universe, splits):
    """{up25m, down25m, up25q, down25q, t2108, n} de la séance `day` ; Stale si le cache n'est pas à la veille."""
    if not dates or dates[-1] >= day:
        raise Stale(f"cache Polygon déjà à la séance {dates[-1] if dates else '—'} (rien à compléter pour {day})")
    prev = history[dates[-1]]
    pairs = [t for t in snap if t in universe and t in prev and prev[t][0] and prev[t][0] > 0]
    today, today_splits, match = {}, {}, 0
    for t in pairs:
        c, v, c1 = snap[t]
        r = prev[t][0] / c1                       # dernière clôture en cache ÷ clôture de la veille TradingView
        if abs(r - 1) <= CFG["match_tol"]:
            match += 1
        elif r >= CFG["split_min"] or r <= 1 / CFG["split_min"]:
            today_splits[t] = r                   # split du jour : TradingView a déjà ajusté la veille
        else:
            continue                              # veilles incohérentes entre les deux sources : titre ignoré
        today[t] = [c, v]
    for t in snap:                                # pas de clôture la veille en cache (suspension…) : gardé, comme Polygon
        if t in universe and t not in today and t not in pairs:
            today[t] = [snap[t][0], snap[t][1]]
    if not pairs or match < CFG["min_match"] * len(pairs):
        raise Stale(f"dernière séance du cache ({dates[-1]}) différente de la veille de {day} : {match} clôtures "
                    f"identiques sur {len(pairs)} (minimum {CFG['min_match']:.0%})")
    active = sum(1 for t in prev if t in universe and prev[t][0])
    if len(today) < CFG["min_coverage"] * active:
        raise Stale(f"{len(today)} titres retrouvés sur TradingView pour {active} cotés la veille (minimum {CFG['min_coverage']:.0%})")
    win = dates[-bo.QUARTER:]                     # fenêtre la plus longue (trimestre) : la séance du jour a l'indice QUARTER
    sp = {d: dict(splits.get(d, {})) for d in win}
    sp[day] = today_splits
    vals = bo.compute_long(win + [day], {**{d: history[d] for d in win}, day: today}, universe, sp)[day]
    return {**{k: v for k, v in vals.items() if v is not None}, "n": bo.count_compared(today, prev, universe),
            "splits": len(today_splits)}


def needed():
    """Séance du dernier relevé TradingView absente de breadth_data.js (postmarket.yml : sinon, pas de restauration du cache)."""
    from fetch_tv_breadth import OUT as TV_OUT, load_existing
    days = sorted(load_existing(TV_OUT))
    return bool(days) and days[-1] not in bo.load_existing(bo.OUT)


def main():
    import argparse
    import fetch_data as fd
    import fetch_history as fh
    from fetch_tv_breadth import measure, screener
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--needed", action="store_true", help="écrit needed=true|false (sortie GitHub Actions) et s'arrête")
    if ap.parse_args().needed:
        print(f"needed={'true' if needed() else 'false'}")
        return
    history = {}                                 # seules les QUARTER dernières séances servent (fenêtre la plus longue) :
    for p in sorted(fh.HISTORY.glob("*.json.gz"), reverse=True):   # lues depuis la fin, sans ouvrir tout le cache
        rows = fh.read_day(date.fromisoformat(p.name[:10]))
        if rows:                                 # jour férié : fichier vide
            history[p.name[:10]] = rows
        if len(history) == bo.QUARTER:
            break
    dates = sorted(history)
    try:
        universe = set(json.loads(fd.UNIVERSE_FILE.read_text())["tickers"])
    except (OSError, ValueError, KeyError):
        sys.exit("Univers introuvable (cache/universe.json) : cache Polygon de update.yml non restauré ?")
    items = screener()
    day, res = measure(items, datetime.now(timezone.utc))
    if day is None:
        print(f"Calcul du soir : rien à calculer ({res}).")
        return
    counts, long = bo.load_existing(bo.OUT), bo.load_existing_long(bo.OUT)   # bo.OUT lu à l'appel (tests)
    if day in counts and not long.get(day, {}).get("provisional"):
        print(f"Calcul du soir : séance {day} déjà calculée depuis Polygon.")
        return
    try:
        vals = provisional(day, snapshot(items), dates, history, universe, fh.load_splits_file())
    except Stale as e:
        print(f"::warning::Calcul du soir impossible : {e}. La séance attendra le calcul Polygon du matin.")
        return
    t2108, n_tv, up4, down4 = res
    if up4 is None:
        print("::warning::Calcul du soir impossible : ±4 % absent du relevé TradingView.")
        return
    nsplit = vals.pop("splits")
    counts[day], long[day] = [up4, down4], {**vals, "provisional": True}
    rows = bo.build_rows(counts, long)
    if rows == bo.build_rows(bo.load_existing(bo.OUT), bo.load_existing_long(bo.OUT)):
        print(f"Calcul du soir : séance {day} déjà calculée à l'identique.")   # pas de commit à chaque passage du soir
        return
    bo.write_js(rows, len(universe), bo.OUT)
    r = rows[-1]
    print(f"Ecrit : {bo.OUT.name} | séance {day} provisoire : ±4 % +{up4} / -{down4}, ratio 5 j {r[3]}, "
          f"+25 % / -25 % mois {vals.get('up25m')} / {vals.get('down25m')}, trimestre {vals.get('up25q')} / {vals.get('down25q')}, "
          f"T2108 {vals.get('t2108')} % (TradingView {t2108} %), n {vals['n']}, splits du jour {nsplit}")


if __name__ == "__main__":
    main()
