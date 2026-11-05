#!/usr/bin/env python3
"""Relevés en cours de séance (screener public TradingView, sans compte ni clé) -> intraday_data.js : la séance du jour du
calendrier, provisoire, pour tout l'onglet MM (chiffres seuls, pas de liste de titres : choix de l'utilisateur du 05/11/2026).

Demande de l'utilisateur du 05/11/2026 (exception au gel de la refonte) : un relevé à mi-séance et un avant la clôture, aux
heures de config/intraday.toml (heure de New York). Même relevé que fetch_tv_breadth.py (même requête, mêmes colonnes, même
univers d'actions ordinaires) et même formule TC2000 du ±4 % (breadth_own.count_breadth, appelée telle quelle, comme le soir). T2108 = part des actions au-dessus de leur SMA 40, cours du moment inclus.
±25 % mois et trimestre, T2108 maison, n : breadth_soir.provisional, le calcul du soir appliqué aux cours du moment (cache Polygon
jusqu'à la veille, restauré en lecture seule par intraday.yml ; absent ou pas à la veille : ces valeurs manquent, rien d'autre).
Bougies partielles des indices de [indices] (QQQ, IWM : ouverture, plus haut, plus bas, dernier cours, volume du moment).
PROVISOIRE : le volume du jour est partiel, la condition « volume > veille » compte donc moins de titres qu'à la clôture.

Le fichier ne contient que la séance du jour (un relevé par heure prévue) ; il n'entre jamais dans breadth_data.js,
tv_breadth_data.js ni dans l'historique (branche data, config/datasets.toml). Le soir, fetch_tv_breadth.py et le calcul maison
prennent le relais (le dashboard n'utilise le relevé que si aucune autre source n'a la séance).

Quel relevé ? Le plus récent des relevés prévus partis depuis moins de `tolerance_minutes` (heure de New York). Aucun relevé dû,
ou relevé déjà pris aujourd'hui : le script sort sans requête ni écriture (les créneaux en trop du déclencheur ne coûtent rien).
Le relevé n'est écrit que si le screener est en séance régulière (`sessions_ok`) et que sa bougie du jour date d'aujourd'hui
(sinon : jour férié, données figées) ; sinon rien n'est écrit.

Lancé par .github/workflows/intraday.yml (pas par update_all.py).
Usage : python fetch_intraday.py [--slot HH:MM] [--force] [--due]
  --due   : écrit due=true|false (sortie GitHub Actions : relevé à prendre ?) et s'arrête, sans requête
  --slot  : relevé à prendre quelle que soit l'heure (essai manuel en séance) ; doit figurer dans config/intraday.toml
  --force : reprend un relevé déjà pris aujourd'hui
"""
import argparse
import json
import statistics
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import mmconfig
from breadth_own import MIN_VOL, THRESHOLD, count_breadth   # formule TC2000 (une seule définition, voir breadth_own.py)
from fetch_tv_breadth import SCAN_COLS, common, screener     # même relevé et même univers que le breadth TradingView du soir

HERE = Path(__file__).resolve().parent
OUT = HERE / mmconfig.step("intraday")["output"]
CFG = mmconfig.load("intraday")
TV = mmconfig.load("sources")["tv_breadth"]
NY = ZoneInfo(mmconfig.load("market")["timezone"])


def load_existing(path):
    """Contenu publié ({date, snaps, …}) ou None (absent, illisible)."""
    try:
        text = Path(path).read_text()
        data = json.loads(text[text.index("=") + 1:].strip().rstrip(";"))
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def write_js(day, snaps, path):
    payload = {"date": day, "rule": {"pct": THRESHOLD, "min_volume": MIN_VOL}, "delay": CFG["delay_minutes"],
               "snaps": sorted(snaps, key=lambda s: mmconfig.hhmm_minutes(s["slot"]))}
    Path(path).write_text("window.INTRADAY = " + json.dumps(payload, separators=(",", ":")) + ";\n")


def due_slot(now_utc, forced=None):
    """(séance ISO, relevé « HH:MM ») à prendre maintenant, ou (None, raison). forced = relevé imposé (--slot)."""
    ny = now_utc.astimezone(NY)
    if forced is not None:
        return (ny.date().isoformat(), forced) if forced in CFG["snapshots"] else (None, f"relevé {forced} absent de config/intraday.toml")
    if ny.isoweekday() > 5:
        return None, "week-end"
    mins = ny.hour * 60 + ny.minute
    due = [s for s in CFG["snapshots"] if 0 <= mins - mmconfig.hhmm_minutes(s) < CFG["tolerance_minutes"]]
    if not due:
        return None, f"{ny:%H:%M} à New York : aucun relevé prévu (relevés : {', '.join(CFG['snapshots'])})"
    return ny.date().isoformat(), due[-1]


def long_values(items, day):
    """{up25m, down25m, up25q, down25q, t2108, n} maison de la séance en cours (calcul du soir, cours du moment), ou (None, raison)."""
    import breadth_soir as bs
    try:
        vals = bs.provisional(day, bs.snapshot(items), *bs.recent_history())
    except (bs.Stale, OSError) as e:
        return None, str(e)
    vals.pop("splits", None)
    return vals, None


def indices(day):
    """{QQQ: [ouverture, plus haut, plus bas, dernier, volume], …} des indices de [indices] dont la bougie du jour est `day`."""
    from fetch_postmarket import scan
    names = {v: k for k, v in CFG["indices"].items()}
    raw = scan({"symbols": {"tickers": list(names)}, "columns": ["open", "high", "low", "close", "volume", "time", "current_session"]})
    out = {}
    for x in raw:
        o, h, l, c, v, tm, st = x["d"]
        bar = datetime.fromtimestamp(tm, timezone.utc).astimezone(NY).date().isoformat() if tm else None
        if x["s"] in names and bar == day and st in CFG["sessions_ok"] and None not in (o, h, l, c) and l <= min(o, c) and h >= max(o, c):
            out[names[x["s"]]] = [o, h, l, c, v]
    return out


def measure(items, day, slot, now_utc):
    """Relevé {slot, at, data_at, n, t2108, up4, down4}, ou (None, raison) s'il ne doit pas être écrit."""
    rows = [r for r in (dict(zip(SCAN_COLS, d)) for d in items) if common(r)]    # ADR, ETF, CBOE : exclus (comme le soir)
    if len(rows) < TV["min_stocks"]:
        return None, f"{len(rows)} actions seulement (minimum {TV['min_stocks']})"
    status = Counter(r["current_session"] for r in rows).most_common(1)[0][0]
    if status not in CFG["sessions_ok"]:
        return None, f"état « {status} » du screener (attendu : {', '.join(CFG['sessions_ok'])})"
    times = [r["time"] for r in rows if r["time"]]
    bar = datetime.fromtimestamp(statistics.median(times), timezone.utc).astimezone(NY).date().isoformat() if times else None
    if bar != day:
        return None, f"bougie du {bar} et non du {day} (jour férié ou données figées)"
    sma = f"SMA{TV['sma']}"
    valid = [r for r in rows if r["close"] is not None and r.get(sma) is not None]
    # ±4 % : clé = rang de la ligne (comme fetch_tv_breadth.measure) ; titres sans clôture ou volume de la veille ignorés
    full = {i: r for i, r in enumerate(rows) if None not in (r["close"], r.get("close[1]"), r.get("volume"), r.get("volume[1]"))}
    up4, down4 = count_breadth({i: [r["close"], r["volume"]] for i, r in full.items()},
                               {i: [r["close[1]"], r["volume[1]"]] for i, r in full.items()}, set(full), {})
    data_at = (now_utc - timedelta(minutes=CFG["delay_minutes"])).astimezone(NY)
    return {"slot": slot, "at": now_utc.isoformat(timespec="seconds"), "data_at": f"{data_at:%H:%M}", "n": len(valid),
            "t2108": round(100 * sum(r["close"] > r[sma] for r in valid) / len(valid), 2) if valid else None,
            "up4": up4, "down4": down4}, None


def main(argv=None):
    ap = argparse.ArgumentParser(description="Relevés en cours de séance (screener TradingView)")
    ap.add_argument("--slot", help="relevé à prendre quelle que soit l'heure (HH:MM de config/intraday.toml)")
    ap.add_argument("--force", action="store_true", help="reprendre un relevé déjà pris aujourd'hui")
    ap.add_argument("--due", action="store_true", help="écrit due=true|false (relevé à prendre ?) et s'arrête")
    a = ap.parse_args(argv)
    now = datetime.now(timezone.utc)
    day, slot = due_slot(now, a.slot or None)
    existing = load_existing(OUT)          # OUT lu à l'appel (les tests le redirigent vers un dossier temporaire)
    if a.due:
        taken = day is not None and existing and existing.get("date") == day and any(s.get("slot") == slot for s in existing.get("snaps", []))
        print(f"due={'true' if day is not None and (a.force or not taken) else 'false'}")
        return 0
    if day is None:
        print(f"Relevés en séance : rien à faire ({slot}).")
        if existing is None and a.slot is None:   # premier passage : fichier vide, pour que le site le charge
            write_js(None, [], OUT)
        return 0 if a.slot is None else 1
    snaps = existing.get("snaps", []) if existing and existing.get("date") == day else []   # autre séance : on repart de zéro
    if any(s.get("slot") == slot for s in snaps) and not a.force:
        print(f"Relevés en séance : relevé de {slot} du {day} déjà pris (--force pour le reprendre).")
        return 0
    items = screener()
    snap, why = measure(items, day, slot, now)
    if snap is None:
        print(f"Relevés en séance : relevé de {slot} non écrit ({why}).")
        return 0
    long, why = long_values(items, day)
    if long is None:
        print(f"::warning::Relevés en séance : ±25 % et T2108 maison absents ({why}) ; ±4 % et T2108 TradingView seuls.")
    else:
        snap["long"] = long
    try:
        idx = indices(day)
    except RuntimeError as e:                # TradingView injoignable pour cette requête : le relevé garde le breadth
        idx, why = {}, str(e)
    if idx:
        snap["idx"] = idx
    else:
        print("::warning::Relevés en séance : bougies partielles des indices absentes.")
    write_js(day, [s for s in snaps if s.get("slot") != slot] + [snap], OUT)
    print(f"Ecrit : {OUT.name} | {day} relevé de {slot} (marché de {snap['data_at']}) : ±4 % +{snap['up4']} / -{snap['down4']}, "
          f"T2108 {snap['t2108']} % sur {snap['n']} actions | maison : {snap.get('long', '—')} | indices : {snap.get('idx', '—')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
