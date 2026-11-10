#!/usr/bin/env python3
"""Descriptions Polygon des actions pas encore classées (10/11/2026) → cache hors dépôt (config/groups.toml [descriptions]).

Les groupes de l'onglet Secteurs viennent de la liste validée config/groups.toml [groups]. Une action absente de cette liste
reçoit un groupe PROVISOIRE (fetch_industries.regroup) : la première règle [[auto.rule]] trouvée dans sa description, sinon le
groupe majoritaire de son industrie TradingView. Ce script lit ces descriptions, quelques-unes par passage (plan gratuit :
5 appels par minute) : d'abord les actions retenues (filtres de config/industries.toml), puis les autres par capitalisation.
Actions candidates : index de l'onglet Tickers (tickers_data.js, dernière composition publiée).

Sortie : cache/descriptions.json = {symbole: {d: description, sic: secteur SIC, at: date}} (hors dépôt : cache Actions de
update.yml, avec l'historique Polygon). Une description vide est gardée (pas de nouvel appel avant refresh_days).
Clé : POLYGON_API_KEY (GitHub Secret ou .env local). Échec d'un appel : l'action est retentée au passage suivant.
  python fetch_descriptions.py              passage normal (max_per_run descriptions au plus)
  python fetch_descriptions.py --max 0      sans limite (en local)
"""
import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import mmconfig

HERE = Path(__file__).resolve().parent
CFG = mmconfig.load("groups")["descriptions"]
OUT = HERE / CFG["file"]
TICKERS = HERE / mmconfig.load("industries")["output"]["tickers_file"]


def load(path=OUT):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {}


def candidates(tk, cache, valid, today, refresh_days=CFG["refresh_days"]):
    """Symboles à lire, dans l'ordre : actions non validées, retenues d'abord puis par capitalisation décroissante ; celles dont
    la description en cache a moins de refresh_days jours sont écartées."""
    col = {k: i for i, k in enumerate(tk["cols"])}
    limit = (today - timedelta(days=refresh_days)).isoformat()
    rows = [r for r in tk["rows"] if r[col["s"]] not in valid
            and not (r[col["s"]] in cache and (cache[r[col["s"]]].get("at") or "") >= limit)]
    rows.sort(key=lambda r: (-(r[col["kept"]] or 0), -(r[col["cap"]] or 0), r[col["s"]]))
    return [r[col["s"]] for r in rows]


def fetch(api, sym, base):
    """{d, sic} d'après Polygon (/v3/reference/tickers/<symbole>) ; description vide si Polygon n'en a pas."""
    res = (api.get(f"{base}/v3/reference/tickers/{sym}") or {}).get("results") or {}
    return {"d": (res.get("description") or "").strip(), "sic": res.get("sic_description") or ""}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max", type=int, default=CFG["max_per_run"], help=f"descriptions au plus ({CFG['max_per_run']} ; 0 = sans limite)")
    args = ap.parse_args()
    import fetch_data as fd                       # importe requests : seulement si on exécute la lecture
    fd.load_env()
    key = os.environ.get("POLYGON_API_KEY")
    if not key:
        sys.exit("Clé API manquante : définis POLYGON_API_KEY (GitHub Secret ou fichier .env local).")
    try:
        text = TICKERS.read_text()
        tk = json.loads(text[text.index("=") + 1:].strip().rstrip(";"))
    except (OSError, ValueError):
        sys.exit(f"Index des tickers introuvable ({TICKERS.name}) : lance fetch_industries.py.")
    cache, today = load(), date.today()
    todo = candidates(tk, cache, set(mmconfig.groups()), today)
    todo = todo[:args.max] if args.max else todo
    api, done = fd.Polygon(key, 60.0 / CFG["pause"]), 0
    for sym in todo:
        try:
            cache[sym] = {**fetch(api, sym, fd.POLYGON), "at": today.isoformat()}
            done += 1
        except Exception as e:                    # réseau, quota, symbole inconnu : retenté au prochain passage
            print(f"⚠ {sym} : {e}")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")))
    print(f"Descriptions : {done} lues, {len(cache)} en cache, {max(0, len(candidates(tk, cache, set(mmconfig.groups()), today)))} restantes")


if __name__ == "__main__":
    main()
