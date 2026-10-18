#!/usr/bin/env python3
"""Vue « TradingView » de l'onglet Secteurs : secteurs -> industries -> actions, chaque niveau classé par TI65 (dans le navigateur).

Classification : scanner public TradingView (secteur, industrie, nom, capitalisation ; sans compte ni clé).
Clôtures : historique Polygon du cache (fetch_history.py, lancé avant par le workflow), ajustées des splits comme breadth_own.py.
Actions retenues : filtres de config/industries.toml (sous-type, bourses, prix, volume moyen, capitalisation).
Indice d'un secteur / d'une industrie (équipondéré par action) : base 100, puis × (1 + moyenne des variations du jour des
titres cotés la veille et le jour, chacune plafonnée à ±daily_return_clip). La composition est celle du jour du calcul.

Sorties :
  industries_data.js         window.INDUSTRIES = {asof, dates, sectors:[{k, n, c, b}], industries:[{k, sec, f, n, c, b}]}
                             k = nom TradingView, n = titres retenus, c = indice (aligné sur dates ; affiché en courbe de
                             tendance, pas en bougies), b = % des titres dont le
                             TI65 dépasse 1 (null si moins de min_members titres ont un TI65), f = fichier de l'industrie.
  industries/<f>.js          window.TV_STOCKS[<f>] = {asof, dates, vu (unité des volumes), rows:[[symbole, nom, cap, [clôtures], [volumes / vu],
                             [ouvertures], [plus hauts], [plus bas]]]} (les trois derniers : seulement si le cache a l'OHLC)
                             (dernières stock_sessions séances ; chargé par le navigateur à l'ouverture de l'industrie).
  industries/<f>--hors.js    mêmes colonnes, actions hors filtres de l'industrie (publish_all) : graphique de leur fiche.
  tickers_data.js            window.TICKERS = {asof, scan, fallback, secs, inds:[[nom, secteur, fichier hors filtres]], cols, rows} :
                             toutes les actions ordinaires
                             US du scanner (retenues ou non) avec secteur, industrie, capitalisation, flottant, TI65 (onglet
                             Tickers, chargé à l'ouverture). Sert aussi de composition publiée : une séance déjà publiée la
                             reprend (TradingView non réinterrogé) et, si TradingView ne répond pas, la dernière composition
                             connue est reprise avec les clôtures du jour (fallback = true, scan = date de cette composition).
"""
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

import mmconfig

HERE = Path(__file__).resolve().parent
OUT = HERE / "industries_data.js"
CFG = mmconfig.load("industries")
TI = mmconfig.load("display")["ti65"]
FOLDER = HERE / CFG["output"]["folder"]
TICKERS_OUT = HERE / CFG["output"]["tickers_file"]
TK_COLS = ["s", "n", "ind", "cap", "flt", "kept", "ti", "ti_prev", "rank_ind", "c", "av"]
TV_COLS = ["name", "description", "exchange", "subtype", "sector", "industry", "market_cap_basic", "float_shares_outstanding"]


def scan_tradingview():
    """[{name, description, exchange, subtype, sector, industry, market_cap_basic}] : toutes les actions US des bourses retenues."""
    from fetch_postmarket import scan            # même client (en-têtes, essais) que le scan post-market
    u = CFG["universe"]
    raw = scan({"columns": TV_COLS, "markets": [u["market"]], "range": [0, u["scan_limit"]],
                "filter": [{"left": "type", "operation": "equal", "right": u["type"]},
                           {"left": "exchange", "operation": "in_range", "right": u["exchanges"]}]})
    if len(raw) >= u["scan_limit"]:              # liste peut-être tronquée : composition fausse, on garde l'ancienne
        sys.exit(f"TradingView : {len(raw)} lignes = limite scan_limit atteinte (config/industries.toml) ; fichiers non modifiés.")
    return [dict(zip(TV_COLS, item["d"])) for item in raw]


def series(dates, history, universe, splits):
    """(close, vol, ohlc) alignés sur dates, ajustés des splits (ajustement arrière) : close = {ticker: [clôture | None]},
    vol = {ticker: [volume | None]}, ohlc = {ticker: ([ouverture], [plus haut], [plus bas])} (None si la séance en cache
    n'a pas d'OHLC : cache d'avant l'ajout, voir fetch_history.py)."""
    n, close, vol, ohlc = len(dates), {}, {}, {}
    for k, d in enumerate(dates):
        for t, row in history[d].items():
            c, v = row[0], row[1]
            if t in universe and c and c > 0:
                close.setdefault(t, [None] * n)[k] = c
                vol.setdefault(t, [None] * n)[k] = v
                if len(row) >= 5 and all(x and x > 0 for x in row[2:5]):
                    o, h, l = ohlc.setdefault(t, ([None] * n, [None] * n, [None] * n))
                    o[k], h[k], l[k] = row[2], row[3], row[4]
    index = {d: k for k, d in enumerate(dates)}
    for s, by_ticker in splits.items():
        if s not in index:
            continue
        for t, r in by_ticker.items():
            if t in close and r and r > 0:
                for k in range(index[s]):
                    if close[t][k] is not None:
                        close[t][k] /= r
                        vol[t][k] = vol[t][k] * r if vol[t][k] is not None else None
                    for arr in ohlc.get(t, ()):
                        if arr[k] is not None:
                            arr[k] /= r
    return close, vol, ohlc


def select(tv_rows, close, vol, cfg=CFG["universe"]):
    """Actions retenues : [{s, n, sec, ind, cap}] (dernière clôture brute ≥ min_price, volume moyen, capitalisation, sous-type)."""
    out = []
    m = cfg["avg_volume_sessions"]
    for r in tv_rows:
        t = r.get("name")
        if r.get("subtype") != cfg["subtype"] or t not in close or not r.get("sector") or not r.get("industry"):
            continue
        last = close[t][-1]
        vs = [v for v in vol[t][-m:] if v is not None]
        if last is None or last < cfg["min_price"] or not vs or sum(vs) / len(vs) < cfg["min_avg_volume"]:
            continue
        if (r.get("market_cap_basic") or 0) < cfg["min_market_cap"]:
            continue
        out.append({"s": t, "n": r.get("description") or t, "sec": r["sector"], "ind": r["industry"], "cap": r.get("market_cap_basic")})
    return out


def build_index(members, close, n, clip=CFG["index"]["daily_return_clip"], base=CFG["index"]["base"]):
    """Indice équipondéré : base, puis × (1 + moyenne des variations plafonnées des titres cotés la veille et le jour)."""
    out, idx = [None] * n, float(base)
    for k in range(n):
        if k:
            rets = []
            for t in members:
                a, b = close[t][k - 1], close[t][k]
                if a and b:
                    rets.append(max(-clip, min(clip, b / a - 1)))
            if rets:
                idx *= 1 + sum(rets) / len(rets)
        out[k] = idx
    return out


def ti65(c, end, short=TI["short"], long=TI["long"]):
    """Moyenne des `short` dernières clôtures ÷ moyenne des `long` dernières, à l'index end ; None s'il en manque une."""
    if end < long - 1:
        return None
    w = c[end - long + 1:end + 1]
    if any(v is None for v in w):
        return None
    return (sum(w[-short:]) / short) / (sum(w) / long)


def ti65_series(c):
    """TI65 à chaque séance (None tant que la fenêtre n'est pas complète) ; mêmes valeurs que ti65(c, k), en un passage."""
    return [ti65(c, k) for k in range(len(c))]


def breadth(members, scores, n, min_members=CFG["index"]["min_members"]):
    """% des titres dont le TI65 dépasse 1, séance par séance (None si moins de min_members titres ont un TI65).
    scores : {ticker: ti65_series(clôtures)}."""
    out = []
    for k in range(n):
        s = [scores[t][k] for t in members if scores[t][k] is not None]
        out.append(round(100 * sum(x > 1 for x in s) / len(s), 1) if len(s) >= min_members else None)
    return out


def slug(name, taken):
    """Nom de fichier d'une industrie : minuscules, chiffres, tirets ; unique."""
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "industrie"
    s, i = base, 2
    while s in taken:
        s, i = f"{base}-{i}", i + 1
    taken.add(s)
    return s


def num(v):
    """Clôture compacte (6 chiffres significatifs) ; None conservé."""
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else float(f"{v:.6g}")


def stock_row(t, name, cap, close, vol, ohlc, lo, unit):
    """[symbole, nom, cap, clôtures, volumes / unit, (ouvertures, plus hauts, plus bas si l'OHLC est en cache)]."""
    return [t, name, int(cap) if cap else None, [num(v) for v in close[t][lo:]],
            [None if v is None else round(v / unit) for v in vol[t][lo:]],
            *([num(v) for v in arr[lo:]] for arr in ohlc.get(t, ()))]


def extras(dates, close, vol, ohlc, tv_rows, members, keep=CFG["output"]["stock_sessions"]):
    """Fichiers des actions hors filtres ({fichier: payload}, {industrie: fichier}) : mêmes colonnes que les fichiers
    d'industrie, chargés seulement pour la fiche d'une de ces actions (onglet Tickers). Actions sans cours : rien."""
    if not CFG["output"]["publish_all"]:
        return {}, {}
    kept, lo, unit = {m["s"] for m in members}, max(0, len(dates) - keep), CFG["output"]["volume_unit"]
    by_ind = defaultdict(list)
    for r in universe_rows(tv_rows):
        if r["name"] not in kept and r["name"] in close:
            by_ind[r["industry"]].append(r)
    files, names, taken = {}, {}, set()
    for ind, rs in sorted(by_ind.items()):
        f = slug(ind, taken) + CFG["output"]["extra_suffix"]   # « -- » n'apparaît jamais dans un nom d'industrie (slug)
        names[ind] = f
        files[f] = {"asof": dates[-1], "dates": dates[lo:], "vu": unit,
                    "rows": [stock_row(r["name"], r.get("description") or r["name"], r.get("market_cap_basic"), close, vol, ohlc, lo, unit)
                             for r in sorted(rs, key=lambda r: r["name"])]}
    return files, names


def compute(dates, close, vol, members, keep=CFG["output"]["stock_sessions"], ohlc=None):
    """(payload de industries_data.js, {fichier: payload de industries/<fichier>.js}). Un indice : c (courbe de tendance :
    pas de bougie, un indice équipondéré n'a pas de vrai plus haut / plus bas) ; une action : [symbole, nom, cap, clôtures,
    volumes k, ouvertures, plus hauts, plus bas] (bougies ; OHLC seulement s'il est en cache)."""
    ohlc, unit = ohlc or {}, CFG["output"]["volume_unit"]
    n = len(dates)
    by_sec, by_ind, sec_of = defaultdict(list), defaultdict(list), {}
    for m in members:
        by_sec[m["sec"]].append(m["s"])
        by_ind[m["ind"]].append(m)
        sec_of.setdefault(m["ind"], m["sec"])
    scores = {m["s"]: ti65_series(close[m["s"]]) for m in members}
    rnd = lambda xs: [None if v is None else round(v, 3) for v in xs]
    sectors = [{"k": s, "n": len(ts), "c": rnd(build_index(ts, close, n)), "b": breadth(ts, scores, n)}
               for s, ts in sorted(by_sec.items())]
    industries, files, taken = [], {}, set()
    lo = max(0, n - keep)
    for ind, ms in sorted(by_ind.items()):
        ts, f = [m["s"] for m in ms], slug(ind, taken)
        industries.append({"k": ind, "sec": sec_of[ind], "f": f, "n": len(ts),
                           "c": rnd(build_index(ts, close, n)), "b": breadth(ts, scores, n)})
        rows = [stock_row(m["s"], m["n"], m["cap"], close, vol, ohlc, lo, unit) for m in sorted(ms, key=lambda m: m["s"])]
        files[f] = {"asof": dates[-1], "dates": dates[lo:], "vu": unit, "rows": rows}
    return {"asof": dates[-1], "dates": dates, "sectors": sectors, "industries": industries}, files


def universe_rows(tv_rows, cfg=CFG["universe"]):
    """Actions ordinaires du scanner avec secteur et industrie (l'univers de l'onglet Tickers, retenues ou non)."""
    return [r for r in tv_rows if r.get("subtype") == cfg["subtype"] and r.get("name") and r.get("sector") and r.get("industry")]


def published_universe(path=None):
    """(date de séance du scan, [lignes au format du scanner]) relues dans tickers_data.js, ou (None, None)."""
    try:
        text = Path(path or TICKERS_OUT).read_text()
        d = json.loads(text[text.index("=") + 1:].strip().rstrip(";"))
        col = {k: i for i, k in enumerate(d["cols"])}
        rows = [{"name": r[col["s"]], "description": r[col["n"]], "subtype": CFG["universe"]["subtype"],
                 "industry": d["inds"][r[col["ind"]]][0], "sector": d["secs"][d["inds"][r[col["ind"]]][1]],
                 "market_cap_basic": r[col["cap"]], "float_shares_outstanding": r[col["flt"]]} for r in d["rows"]]
        return (d["scan"], rows) if rows else (None, None)
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        return None, None


def tickers(dates, close, vol, tv_rows, members, scan, fallback, extra_names=None):
    """Payload de tickers_data.js : une ligne par action de l'univers (cols = TK_COLS)."""
    rows = universe_rows(tv_rows)
    by_ind = defaultdict(list)
    for r in rows:
        by_ind[r["industry"]].append(r["sector"])
    inds = sorted(by_ind)
    secs = sorted({max(set(v), key=v.count) for v in by_ind.values()})
    ind_ix = {k: i for i, k in enumerate(inds)}
    n, delta = len(dates), TI["delta"]
    kept = {m["s"]: m for m in members}
    score = {t: ti65(close[t], n - 1) for t in {r["name"] for r in rows} if t in close}
    rank = {}
    members_by_ind = defaultdict(list)
    for m in members:
        members_by_ind[m["ind"]].append(m["s"])
    for ind, ts in members_by_ind.items():               # rang du TI65 de l'action parmi les actions retenues de son industrie
        ordered = sorted((t for t in ts if score.get(t) is not None), key=lambda t: (-score[t], t))
        rank.update({t: i + 1 for i, t in enumerate(ordered)})
    m_avg = CFG["universe"]["avg_volume_sessions"]
    out = []
    for r in sorted(rows, key=lambda r: r["name"]):
        t, c = r["name"], close.get(r["name"])
        vs = [v for v in (vol.get(t) or [])[-m_avg:] if v is not None]
        out.append([t, r.get("description") or t, ind_ix[r["industry"]],
                    int(r["market_cap_basic"]) if r.get("market_cap_basic") else None,
                    int(r["float_shares_outstanding"]) if r.get("float_shares_outstanding") else None,
                    1 if t in kept else 0,
                    None if score.get(t) is None else round(score[t], 4),
                    None if not c or ti65(c, n - 1 - delta) is None else round(ti65(c, n - 1 - delta), 4),
                    rank.get(t), num(c[-1]) if c and c[-1] else None, round(sum(vs) / len(vs)) if vs else None])
    return {"asof": dates[-1], "scan": scan, "fallback": fallback, "secs": secs,
            "inds": [[k, secs.index(max(set(by_ind[k]), key=by_ind[k].count)), (extra_names or {}).get(k)] for k in inds],
            "cols": TK_COLS, "rows": out}


def composition(asof, scan, prev, scanner=None):
    """(lignes du scanner, date du scan, secours ?) pour la séance asof. Séance déjà publiée (scan == asof) : composition
    reprise sans interroger TradingView. Sinon nouveau scan ; s'il échoue (muet, vide, liste tronquée), la dernière
    composition publiée est reprise (secours) ; sans composition publiée, arrêt (fichiers non modifiés)."""
    if prev and scan == asof:
        print(f"Séance {asof} déjà publiée : composition reprise ({len(prev)} actions), TradingView non interrogé")
        return prev, scan, False
    try:
        tv = (scanner or scan_tradingview)()
        if not tv:
            raise RuntimeError("aucune action reçue")
        return tv, asof, False
    except (RuntimeError, SystemExit) as e:          # TradingView muet ou liste tronquée : secours
        if not prev:
            sys.exit(f"TradingView : {e} ; aucune composition publiée à reprendre, fichiers non modifiés.")
        print(f"⚠ TradingView : {e} ; secours : composition du {scan} reprise avec les clôtures du {asof}")
        return prev, scan, True


def write(payload, files, tk=None):
    """Écrit industries_data.js, un fichier par industrie (retire ceux d'industries disparues) et tickers_data.js."""
    FOLDER.mkdir(exist_ok=True)
    for f, p in files.items():
        text = f"(window.TV_STOCKS = window.TV_STOCKS || {{}})[{json.dumps(f)}] = " + json.dumps(p, separators=(",", ":"), ensure_ascii=False) + ";\n"
        path = FOLDER / f"{f}.js"
        if not path.exists() or path.read_text() != text:      # fichier inchangé : pas de réécriture (pas de commit inutile)
            path.write_text(text)
    for old in FOLDER.glob("*.js"):
        if old.stem not in files:
            old.unlink()
    OUT.write_text("window.INDUSTRIES = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n")
    if tk is not None:
        TICKERS_OUT.write_text("window.TICKERS = " + json.dumps(tk, separators=(",", ":"), ensure_ascii=False) + ";\n")


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rescan", action="store_true", help="réinterroger TradingView même si la séance est déjà publiée")
    args = ap.parse_args()
    import fetch_data as fd                       # importe requests : seulement si on exécute le calcul
    import fetch_history as fh
    dates, history = fh.load_history()
    need = TI["long"] + TI["delta"]               # un TI65 aujourd'hui et il y a `delta` séances (colonne Δ)
    if len(dates) < need:
        sys.exit(f"Historique insuffisant : {len(dates)} séances en cache (minimum {need}). Lance python fetch_history.py.")
    try:
        universe = set(json.loads(fd.UNIVERSE_FILE.read_text())["tickers"])
    except (OSError, ValueError, KeyError):
        sys.exit("Univers introuvable (cache/universe.json) : lance python fetch_history.py.")
    close, vol, ohlc = series(dates, history, universe, fh.load_splits_file())
    tv, scan, fallback = composition(dates[-1], *((None, None) if args.rescan else published_universe()))
    members = select(tv, close, vol)
    payload, files = compute(dates, close, vol, members, ohlc=ohlc)
    payload["comp"] = {"asof": scan, "fallback": fallback}     # date de la composition (secours si TradingView a échoué)
    extra_files, extra_names = extras(dates, close, vol, ohlc, tv, members)
    files.update(extra_files)
    tk = tickers(dates, close, vol, tv, members, scan, fallback, extra_names)
    write(payload, files, tk)
    ranked = sum(i["n"] >= CFG["index"]["min_members"] for i in payload["industries"])
    print(f"{len(tk['rows'])} actions dans l'index, {len(members)} retenues : {len(payload['sectors'])} secteurs, "
          f"{len(payload['industries'])} industries ({ranked} classables), {len(dates)} séances ({dates[0]} -> {dates[-1]})")
    print(f"Écrit : {OUT.name}, {TICKERS_OUT.name} et {len(files)} fichiers dans {FOLDER.name}/")


if __name__ == "__main__":
    main()
