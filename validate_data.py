#!/usr/bin/env python3
"""Controles de coherence des fichiers de donnees avant publication.

Utilise par update_all.py (une etape dont le fichier est invalide est annulee : les anciennes donnees sont restaurees)
et par le workflow GitHub (garde-fou avant commit). En ligne de commande : python validate_data.py
-> code de sortie 0 si tout est valide, 1 sinon.

Les controles couvrent : fichier lisible, volume minimal, fraicheur, ordre chronologique, bornes de valeurs, coherence
OHLC, sauts de cours aberrants, trous de dates. Les seuils de fraicheur tolerent week-ends et jours feries.
"""
import json
import sys
from datetime import date
from pathlib import Path

import mmconfig

HERE = Path(__file__).resolve().parent

FILES = {t["name"]: t["output"] for t in mmconfig.steps()}          # config/sources.toml


def fresh(name):
    """Parametres de fraicheur de la source (config/sources.toml) : min_rows, max_age, max_gap, ..."""
    return mmconfig.step(name)["freshness"]


def load_js(path):
    text = Path(path).read_text()
    return json.loads(text[text.index("=") + 1:].strip().rstrip(";"))


def _age_days(iso, today):
    return (today - date.fromisoformat(iso)).days


def _check_dates(dates, label, today, max_age, max_gap, errors):
    if not dates:
        errors.append(f"{label} : aucune date")
        return
    if any(b <= a for a, b in zip(dates, dates[1:])):
        errors.append(f"{label} : dates non croissantes ou en double")
    age = _age_days(dates[-1], today)
    if age > max_age:
        errors.append(f"{label} : donnees trop anciennes (derniere date {dates[-1]}, {age} jours)")
    if age < -1:
        errors.append(f"{label} : derniere date dans le futur ({dates[-1]})")
    big = [(a, b) for a, b in zip(dates, dates[1:]) if (date.fromisoformat(b) - date.fromisoformat(a)).days > max_gap]
    if big:
        errors.append(f"{label} : trou de plus de {max_gap} jours ({big[0][0]} -> {big[0][1]}, {len(big)} trou(s))")


def _check_ohlc(rows, label, errors, jump=0.6, o=1, h=2, l=3, c=4):
    bad = [r[0] for r in rows if not (r[l] <= min(r[o], r[c]) + 1e-6 and r[h] >= max(r[o], r[c]) - 1e-6 and r[l] > 0)]
    if bad:
        errors.append(f"{label} : {len(bad)} bougie(s) incoherente(s) (ex. {bad[0]})")
    jumps = [(a[0], r[c] / a[c] - 1) for a, r in zip(rows, rows[1:]) if a[c] > 0 and abs(r[c] / a[c] - 1) > jump]
    if jumps:
        errors.append(f"{label} : saut de cours aberrant ({jumps[0][0]} : {jumps[0][1]:+.0%})")


def check_stockbee(data, today):
    errors = []
    cols = {c: i for i, c in enumerate(data["columns"])}
    rows = data["rows"]
    f = fresh("stockbee")
    if len(rows) < f["min_rows"]:
        errors.append(f"stockbee : seulement {len(rows)} seances (minimum {f['min_rows']})")
    _check_dates([r[0] for r in rows], "stockbee", today, f["max_age"], f["max_gap"], errors)
    for k, lo, hi in (("up4", 0, 5000), ("down4", 0, 5000), ("t2108", 0, 100), ("up25q", 0, 8000), ("down25q", 0, 8000)):
        vals = [r[cols[k]] for r in rows[-250:] if r[cols[k]] is not None]
        if not vals:
            errors.append(f"stockbee : colonne {k} vide")
        elif min(vals) < lo or max(vals) > hi:
            errors.append(f"stockbee : {k} hors bornes [{lo}, {hi}] (min {min(vals)}, max {max(vals)})")
    last = rows[-1]
    if last[cols["up4"]] is None or last[cols["down4"]] is None:
        errors.append("stockbee : derniere ligne sans +4 % / -4 %")
    return errors


def check_breadth(data, today, stockbee_path=None):
    """Calcul maison (breadth_own.py) : structure, bornes, fraicheur, puis controle croise avec Stockbee.

    Un ecart moyen anormal sur les seances communes (ex. une seance Polygon partielle) invalide le fichier ; l'ecart
    normal observe est de ~3 titres, le seuil est volontairement large pour ne signaler que les vraies anomalies.
    """
    errors = []
    cols = {c: i for i, c in enumerate(data["columns"])}
    rows = data["rows"]
    f = fresh("breadth")
    if len(rows) < f["min_rows"]:
        errors.append(f"breadth : seulement {len(rows)} seances (minimum {f['min_rows']})")
        return errors
    _check_dates([r[0] for r in rows], "breadth", today, f["max_age"], f["max_gap"], errors)
    for k in ("up4", "down4"):
        vals = [r[cols[k]] for r in rows[-250:]]
        if any(v is None or not isinstance(v, int) for v in vals):
            errors.append(f"breadth : colonne {k} contient des valeurs absentes ou non entieres")
        elif min(vals) < 0 or max(vals) > 5000:
            errors.append(f"breadth : {k} hors bornes [0, 5000] (min {min(vals)}, max {max(vals)})")
    # fenetres longues (mois, trimestre experimental, T2108) : absentes tant que l'historique est court, bornees sinon ;
    # pas de controle croise avec Stockbee (niveaux volontairement differents : seule la tendance est suivie)
    for k, hi in (("up25m", 5000), ("down25m", 5000), ("up25q", 8000), ("down25q", 8000), ("t2108", 100)):
        if k not in cols:
            continue
        vals = [r[cols[k]] for r in rows[-250:] if cols[k] < len(r) and r[cols[k]] is not None]
        if any(not isinstance(v, (int, float)) or v < 0 or v > hi for v in vals):
            errors.append(f"breadth : {k} hors bornes [0, {hi}]")
    if stockbee_path:
        try:
            sb = load_js(stockbee_path)
            sc = {c: i for i, c in enumerate(sb["columns"])}
            ref = {r[0]: (r[sc["up4"]], r[sc["down4"]]) for r in sb["rows"][-60:]
                   if r[sc["up4"]] is not None and r[sc["down4"]] is not None}
        except (OSError, ValueError, KeyError):
            ref = {}
        common = [(r[cols["up4"]], r[cols["down4"]], *ref[r[0]]) for r in rows if r[0] in ref][-20:]
        if len(common) >= 5:
            mad = sum(abs(a - c) + abs(b - d) for a, b, c, d in common) / (2 * len(common))
            scale = sum(c + d for _, _, c, d in common) / (2 * len(common))
            if mad > max(30, 0.2 * scale):
                errors.append(f"breadth : ecart anormal avec Stockbee ({mad:.0f} titres en moyenne sur {len(common)} seances)")
    return errors


def check_tv_breadth(data, today):
    """T2108 TradingView (fetch_tv_breadth.py) : structure, bornes, fraicheur (la serie demarre le 20/10/2026)."""
    errors, f = [], fresh("tv_breadth")
    rows = data["rows"]
    if len(rows) < f["min_rows"]:
        errors.append(f"tv_breadth : seulement {len(rows)} seances (minimum {f['min_rows']})")
    if not rows:
        return errors
    _check_dates([r[0] for r in rows], "tv_breadth", today, f["max_age"], f["max_gap"], errors)
    bad = [r[0] for r in rows if not isinstance(r[1], (int, float)) or not 0 <= r[1] <= 100 or not isinstance(r[2], int)
           or r[2] < mmconfig.load("sources")["tv_breadth"]["min_stocks"]]
    if bad:
        errors.append(f"tv_breadth : {len(bad)} seance(s) incoherente(s) ({', '.join(bad[:3])})")
    return errors


def check_vix(data, today):
    errors = []
    f = fresh("vix")
    if len(data) < f["min_rows"]:
        errors.append(f"vix : seulement {len(data)} seances (minimum {f['min_rows']})")
    _check_dates([r[0] for r in data], "vix", today, f["max_age"], f["max_gap"], errors)
    closes = [r[4] for r in data[-250:]]
    if min(closes) < 5 or max(closes) > 150:
        errors.append(f"vix : cloture hors bornes [5, 150] (min {min(closes)}, max {max(closes)})")
    _check_ohlc(data[-500:], "vix", errors, jump=1.5)
    return errors


def check_prices(data, today):
    errors = []
    f = fresh("prices")
    for name, minimum, max_age, max_gap in (("QQQ", f["min_rows"], f["max_age"], f["max_gap"]), ("IWM", f["min_rows"], f["max_age"], f["max_gap"]),
                                            ("BTC", f["btc_min_rows"], f["btc_max_age"], f["btc_max_gap"])):
        rows = data.get(name) or []
        if len(rows) < minimum:
            errors.append(f"prices/{name} : seulement {len(rows)} bougies (minimum {minimum})")
            continue
        _check_dates([r[0] for r in rows], f"prices/{name}", today, max_age, max_gap, errors)
        _check_ohlc(rows[-750:], f"prices/{name}", errors)
    return errors


def check_sectors(data, today):
    errors = []
    syms = data.get("symbols", [])
    f = fresh("sectors")
    if len(syms) < f["min_symbols"]:
        errors.append(f"sectors : seulement {len(syms)} ETF (minimum {f['min_symbols']})")
    dates = data.get("dates", [])
    if len(dates) < f["min_rows"]:
        errors.append(f"sectors : seulement {len(dates)} seances (minimum {f['min_rows']})")
    _check_dates(dates, "sectors", today, f["max_age"], f["max_gap"], errors)
    if dates and data.get("asof") != dates[-1]:
        errors.append("sectors : asof different de la derniere date")
    stale = [s["s"] for s in syms if dates and not any(v is not None for v in s["c"][-6:])]
    if len(stale) > 3:
        errors.append(f"sectors : {len(stale)} ETF sans cotation recente ({', '.join(stale[:5])}...)")
    return errors


def check_postmarket(data, today):
    """Scan post-market (fetch_postmarket.py) : structure, filtres respectes, fraicheur. Un fichier sans instantane est valide
    (aucun passage du robot pendant un post-market pour l'instant)."""
    errors = []
    cols = data["cols"]
    need = {"t", "s", "pch", "pv", "c", "pc", "er", "nx", "ng"}
    if not need <= set(cols):
        return [f"postmarket : colonnes manquantes ({', '.join(sorted(need - set(cols)))})"]
    snaps = data["snaps"]
    if not snaps:
        return errors
    dates = [s["d"] for s in snaps]
    f = fresh("postmarket")
    if len(snaps) > f["max_snapshots"]:
        errors.append(f"postmarket : {len(snaps)} instantanes (maximum {f['max_snapshots']})")
    _check_dates(dates, "postmarket", today, f["max_age"], f["max_gap"], errors)
    ich, iv, n = cols.index("pch"), cols.index("pv"), len(cols)
    f = data.get("filters", {})
    for s in snaps:
        bad = [r for r in s["rows"] if len(r) != n or r[ich] is None or abs(r[ich]) < f.get("chg", 4) - 1e-9 or (r[iv] or 0) < f.get("vol", 100_000)]
        if bad:
            errors.append(f"postmarket : {len(bad)} ligne(s) hors filtres ou incompletes le {s['d']} (ex. {bad[0][:2]})")
        if not s["rows"]:
            errors.append(f"postmarket : instantane vide le {s['d']}")
    h = data.get("hist") or {}
    hd = h.get("dates", [])
    over = [k for k, v in h.get("bars", {}).items() if not v or v[0] + len(v) - 1 > len(hd)]
    if over:
        errors.append(f"postmarket : graphiques hors des dates communes ({', '.join(over[:3])})")
    return errors


def check_industries(data, today, folder=None):
    """Vue TradingView (fetch_industries.py) : nombre de secteurs, d'industries et de titres, fraîcheur, indices positifs,
    puis chaque fichier d'industrie (présent, même dernière séance, autant de titres que déclaré)."""
    errors, f = [], fresh("industries")
    secs, inds, dates = data.get("sectors", []), data.get("industries", []), data.get("dates", [])
    if len(secs) < f["min_sectors"]:
        errors.append(f"industries : seulement {len(secs)} secteurs (minimum {f['min_sectors']})")
    if len(inds) < f["min_industries"]:
        errors.append(f"industries : seulement {len(inds)} industries (minimum {f['min_industries']})")
    total = sum(i["n"] for i in inds)
    if total < f["min_stocks"] or total != sum(s["n"] for s in secs):
        errors.append(f"industries : {total} titres dans les industries, {sum(s['n'] for s in secs)} dans les secteurs "
                      f"(minimum {f['min_stocks']}, totaux égaux attendus)")
    if len(dates) < f["min_rows"]:
        errors.append(f"industries : seulement {len(dates)} séances (minimum {f['min_rows']})")
    _check_dates(dates, "industries", today, f["max_age"], f["max_gap"], errors)
    if dates and data.get("asof") != dates[-1]:
        errors.append("industries : asof différent de la dernière date")
    bad = [x["k"] for x in secs + inds if len(x["c"]) != len(dates) or len(x["b"]) != len(dates)
           or any(v is None or not v > 0 for v in x["c"])]
    if bad:
        errors.append(f"industries : {len(bad)} indice(s) incomplet(s) ou non positif(s) ({', '.join(bad[:3])})")
    if folder is not None:
        missing = []
        for i in inds:
            try:                              # « (window.TV_STOCKS = …)["<f>"] = {…}; » : objet après « ] = »
                text = (Path(folder) / f"{i['f']}.js").read_text()
                p = json.loads(text[text.index("] = ") + 4:].strip().rstrip(";"))
            except (OSError, ValueError):
                missing.append(i["f"]); continue
            if p.get("asof") != data.get("asof") or len(p.get("rows", [])) != i["n"] \
                    or any(len(r[3]) != len(p["dates"]) for r in p["rows"]):
                missing.append(i["f"])
        if missing:
            errors.append(f"industries : {len(missing)} fichier(s) d'industrie absent(s) ou incohérent(s) ({', '.join(missing[:3])})")
        tk_file = Path(folder).parent / mmconfig.load("industries")["output"]["tickers_file"]
        try:                                  # index de l'onglet Tickers : même séance, au moins toutes les actions retenues
            tk = load_js(tk_file)
            kept = tk["cols"].index("kept")
            if tk.get("asof") != data.get("asof") or sum(r[kept] for r in tk["rows"]) != total or len(tk["rows"]) < total \
                    or any(not 0 <= r[tk["cols"].index("ind")] < len(tk["inds"]) for r in tk["rows"]):
                errors.append(f"industries : {tk_file.name} incohérent (séance, actions retenues ou industries)")
            bad_x = []                        # fichiers des actions hors filtres (publish_all) : présents, même séance
            for ind in tk["inds"]:
                if len(ind) > 2 and ind[2]:
                    try:
                        text = (Path(folder) / f"{ind[2]}.js").read_text()
                        x = json.loads(text[text.index("] = ") + 4:].strip().rstrip(";"))
                        if x.get("asof") != data.get("asof") or not x.get("rows"):
                            bad_x.append(ind[2])
                    except (OSError, ValueError):
                        bad_x.append(ind[2])
            if bad_x:
                errors.append(f"industries : {len(bad_x)} fichier(s) hors filtres absent(s) ou incohérent(s) ({', '.join(bad_x[:3])})")
        except (OSError, ValueError, KeyError, IndexError, TypeError):
            errors.append(f"industries : {tk_file.name} absent ou illisible")
    return errors


def check_short(data, today):
    """Short interest (fetch_short.py) : nombre de lignes, fraîcheur du dernier passage, valeurs plausibles."""
    errors, f = [], fresh("short")
    cols, rows = data.get("cols", []), data.get("rows", {})
    if len(rows) < f["min_rows"]:
        errors.append(f"short : seulement {len(rows)} actions (minimum {f['min_rows']})")
    age = _age_days(data["updated"][:10], today)
    if age > f["max_age"]:
        errors.append(f"short : dernier passage il y a {age} jours (maximum {f['max_age']})")
    ix = {k: cols.index(k) for k in ("flt", "sh", "pct", "dtc")}
    bad = [s for s, r in rows.items() if len(r) != len(cols) or any(r[i] is not None and r[i] < 0 for i in ix.values())
           or (r[ix["pct"]] is not None and r[ix["pct"]] > 5) or (r[ix["dtc"]] is not None and r[ix["dtc"]] > 1000)]
    if bad:
        errors.append(f"short : {len(bad)} ligne(s) incohérente(s) ({', '.join(bad[:3])})")
    return errors


CHECKS = {"postmarket": check_postmarket, "stockbee": check_stockbee, "breadth": check_breadth, "tv_breadth": check_tv_breadth, "vix": check_vix, "prices": check_prices, "sectors": check_sectors,
          "industries": check_industries, "short": check_short}


def validate(name, path=None, today=None):
    """Retourne la liste des erreurs (vide = valide) pour la source `name`."""
    path = Path(path) if path else HERE / FILES[name]
    if not path.exists() and mmconfig.step(name).get("separate"):
        return []                             # source à passage séparé pas encore produite : rien à contrôler (pas un échec)
    try:
        data = load_js(path)
    except (OSError, ValueError) as e:
        return [f"{name} : fichier illisible ({e.__class__.__name__}: {e})"]
    try:
        if name == "breadth":                 # controle croise avec le fichier Stockbee voisin
            return check_breadth(data, today or date.today(), path.parent / FILES["stockbee"])
        if name == "industries":              # fichiers des industries : dossier voisin (config/industries.toml)
            return check_industries(data, today or date.today(), path.parent / mmconfig.load("industries")["output"]["folder"])
        return CHECKS[name](data, today or date.today())
    except (KeyError, IndexError, TypeError) as e:
        return [f"{name} : structure inattendue ({e.__class__.__name__}: {e})"]


def main(names=None):
    bad = 0
    for name in names or FILES:
        errs = validate(name)
        print(f"[{name}] " + ("valide" if not errs else "INVALIDE"))
        for e in errs:
            print("   -", e)
        bad += bool(errs)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))   # sans argument : tous les fichiers ; sinon les sources nommees (ex. postmarket)
