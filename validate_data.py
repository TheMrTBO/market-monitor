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

HERE = Path(__file__).resolve().parent

FILES = {
    "stockbee": "stockbee_data.js",
    "vix": "vix_data.js",
    "prices": "prices_data.js",
    "sectors": "sectors_data.js",
}


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
    if len(rows) < 1500:
        errors.append(f"stockbee : seulement {len(rows)} seances (minimum 1500)")
    _check_dates([r[0] for r in rows], "stockbee", today, 6, 12, errors)
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


def check_vix(data, today):
    errors = []
    if len(data) < 1500:
        errors.append(f"vix : seulement {len(data)} seances (minimum 1500)")
    _check_dates([r[0] for r in data], "vix", today, 6, 12, errors)
    closes = [r[4] for r in data[-250:]]
    if min(closes) < 5 or max(closes) > 150:
        errors.append(f"vix : cloture hors bornes [5, 150] (min {min(closes)}, max {max(closes)})")
    _check_ohlc(data[-500:], "vix", errors, jump=1.5)
    return errors


def check_prices(data, today):
    errors = []
    for name, minimum, max_age, max_gap in (("QQQ", 1500, 5, 8), ("IWM", 1500, 5, 8), ("BTC", 2500, 3, 3)):
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
    if len(syms) < 50:
        errors.append(f"sectors : seulement {len(syms)} ETF (minimum 50)")
    dates = data.get("dates", [])
    if len(dates) < 250:
        errors.append(f"sectors : seulement {len(dates)} seances (minimum 250)")
    _check_dates(dates, "sectors", today, 6, 12, errors)
    if dates and data.get("asof") != dates[-1]:
        errors.append("sectors : asof different de la derniere date")
    stale = [s["s"] for s in syms if dates and not any(v is not None for v in s["c"][-6:])]
    if len(stale) > 3:
        errors.append(f"sectors : {len(stale)} ETF sans cotation recente ({', '.join(stale[:5])}...)")
    return errors


CHECKS = {"stockbee": check_stockbee, "vix": check_vix, "prices": check_prices, "sectors": check_sectors}


def validate(name, path=None, today=None):
    """Retourne la liste des erreurs (vide = valide) pour la source `name`."""
    path = Path(path) if path else HERE / FILES[name]
    try:
        data = load_js(path)
    except (OSError, ValueError) as e:
        return [f"{name} : fichier illisible ({e.__class__.__name__}: {e})"]
    try:
        return CHECKS[name](data, today or date.today())
    except (KeyError, IndexError, TypeError) as e:
        return [f"{name} : structure inattendue ({e.__class__.__name__}: {e})"]


def main():
    bad = 0
    for name in FILES:
        errs = validate(name)
        print(f"[{name}] " + ("valide" if not errs else "INVALIDE"))
        for e in errs:
            print("   -", e)
        bad += bool(errs)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
