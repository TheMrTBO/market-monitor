#!/usr/bin/env python3
"""Historique des cours NON ajustes : un fichier gzip par seance dans cache/history/ (hors depot, voir .gitignore).
Une ligne par titre : [cloture, volume, ouverture, plus haut, plus bas] (les deux premiers champs gardent leur place :
les lecteurs qui n'utilisent que cloture et volume lisent row[0], row[1]). Les fichiers d'avant l'ajout de l'OHLC
([cloture, volume]) restent lisibles ; update() les retelecharge pour completer l'ouverture, le plus haut et le plus bas.

Une seance = 1 appel Polygon / Massive `grouped daily` (tous les titres US). Les splits sont conserves a part
(cache/splits.json, un seul appel paginé par execution) et appliques au calcul, comme dans fetch_data.py : les prix
stockes ne sont jamais reecrits, donc une mise a jour incrementale ne peut pas melanger donnees ajustees et brutes.

Reprenable : les seances deja presentes ne sont pas retelechargees ; un jour ferie est note (liste vide) pour ne pas etre
redemande. L'univers (actions ordinaires NYSE/Nasdaq/AMEX) est rafraichi s'il a plus de 7 jours.

Usage : python3 fetch_history.py [--sessions N] [--keep N] [--rate N]   (défauts : config/sources.toml [history])
Cle : POLYGON_API_KEY (variable d'environnement, GitHub Secret, ou fichier .env local).
"""
import argparse
import gzip
import json
import os
import sys
from datetime import date, timedelta

import fetch_data as fd
import mmconfig

HISTORY = fd.CACHE / "history"
SPLITS_FILE = fd.CACHE / "splits.json"


def day_path(d):
    return HISTORY / f"{d.isoformat()}.json.gz"


def read_day(d, need_ohlc=False):
    """{ticker: [close, volume, open, high, low]} (ou [close, volume] avant l'ajout de l'OHLC ; vide = jour ferie), ou None
    si le jour est inconnu ou d'un ancien format. need_ohlc : None aussi pour une seance sans OHLC (a retelecharger)."""
    p = day_path(d)
    if not p.exists():
        return None
    try:
        with gzip.open(p, "rt") as f:
            payload = json.load(f)
    except (OSError, ValueError):
        return None
    if payload.get("adjusted") is not False:     # ancien format (cloture ajustee) : a retelecharger
        return None
    if need_ohlc and payload["rows"] and not payload.get("ohlc"):   # seance sans ouverture / plus haut / plus bas
        return None
    return payload["rows"]


def write_day(d, rows):
    HISTORY.mkdir(parents=True, exist_ok=True)
    tmp = day_path(d).with_suffix(".tmp")
    with gzip.open(tmp, "wt") as f:
        json.dump({"adjusted": False, "ohlc": True, "rows": rows}, f, separators=(",", ":"))
    tmp.replace(day_path(d))


def list_sessions():
    """Dates (str ISO, ordre croissant) des seances non vides presentes en cache."""
    out = []
    for p in sorted(HISTORY.glob("*.json.gz")) if HISTORY.exists() else []:
        rows = read_day(date.fromisoformat(p.name[:10]))
        if rows:
            out.append(p.name[:10])
    return out


def load_history():
    """([dates], {date: {ticker: [close, volume]}}) pour toutes les seances en cache."""
    dates = list_sessions()
    return dates, {d: read_day(date.fromisoformat(d)) for d in dates}


def load_splits_file():
    """{date: {ticker: ratio}} ; ratio = split_to / split_from (2-pour-1 -> 2.0)."""
    try:
        return json.loads(SPLITS_FILE.read_text())
    except (OSError, ValueError):
        return {}


def fetch_day(api, d):
    data = api.get(f"{fd.POLYGON}/v2/aggs/grouped/locale/us/market/stocks/{d.isoformat()}",
                   {"adjusted": "false", "include_otc": "false"})
    return {r["T"]: [r["c"], r["v"], r.get("o"), r.get("h"), r.get("l")] for r in data.get("results") or []}


def update(api, sessions, end, keep=400, log=print):
    """Complete le cache jusqu'a `sessions` seances en remontant depuis `end`, met a jour les splits, elague. Retourne le nombre
    de seances telechargees."""
    d, got, downloaded = end, 0, 0
    log(f"Historique : {sessions} seances en remontant depuis {end}")
    while got < sessions:
        if d.weekday() >= 5:
            d -= timedelta(days=1)
            continue
        rows = read_day(d, need_ohlc=True)      # seance sans OHLC (ancien cache) : retelechargee une fois
        if rows is None:
            try:
                rows = fetch_day(api, d)
            except fd.PlanError:                # le plan gratuit peut refuser la seance du jour (fin de journee non diffusee)
                if d != end:
                    raise
                rows = {}
            if not rows and d == end:           # donnees du jour pas encore publiees : ne pas le noter ferie
                log(f"{d}  pas encore de donnees, ignore")
                d -= timedelta(days=1)
                continue
            write_day(d, rows)
            downloaded += 1
            log(f"{d}  {len(rows):5d} titres" if rows else f"{d}  ferie")
        got += 1 if rows else 0
        d -= timedelta(days=1)
    oldest = d + timedelta(days=1)
    splits = load_splits_file()                 # un seul appel (pagine) pour toute la fenetre ; remplace la fenetre
    fresh = fd.load_splits(api, oldest, end)
    splits = {k: v for k, v in splits.items() if not (oldest.isoformat() <= k <= end.isoformat())}
    splits.update(fresh)
    fd.save_json(SPLITS_FILE, splits)
    log(f"Splits : {sum(len(v) for v in fresh.values())} sur la fenetre")
    prune(keep)
    return downloaded


def prune(keep):
    """Garde les `keep` seances les plus recentes (et efface tout ce qui est plus ancien, jours feries compris)."""
    files = sorted(HISTORY.glob("*.json.gz")) if HISTORY.exists() else []
    sessions = [p for p in files if read_day(date.fromisoformat(p.name[:10]))]
    if len(sessions) <= keep:
        return
    cut = sessions[-keep].name[:10]
    for p in files:
        if p.name[:10] < cut:
            p.unlink()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    h = mmconfig.load("sources")["history"]           # profondeur et rythme : config/sources.toml [history]
    ap.add_argument("--sessions", type=int, default=h["sessions"], help=f"seances recentes en cache ({h['sessions']})")
    ap.add_argument("--keep", type=int, default=h["keep"], help=f"seances conservees au maximum ({h['keep']})")
    ap.add_argument("--rate", type=float, default=h["rate"], help=f"appels/min ({h['rate']} = plan gratuit)")
    args = ap.parse_args()

    fd.load_env()
    key = os.environ.get("POLYGON_API_KEY")
    if not key:
        sys.exit("Cle API manquante : definis POLYGON_API_KEY (GitHub Secret ou fichier .env local).")
    api = fd.Polygon(key, args.rate)
    try:
        fd.load_universe(api, refresh=False)    # rafraichi si plus de 7 jours (cache/universe.json)
        update(api, args.sessions, fd.last_session_end(), keep=args.keep)
    except fd.PlanError as e:
        sys.exit(f"Acces refuse par ton plan Polygon (403) : {e}")
    except KeyboardInterrupt:
        print("\nInterrompu : les seances telechargees sont gardees, relance pour reprendre.")
        return
    print(f"Termine : {len(list_sessions())} seances dans {HISTORY.name}/")


if __name__ == "__main__":
    main()
