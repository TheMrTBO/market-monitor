#!/usr/bin/env python3
"""Met a jour toutes les donnees du dashboard, une etape apres l'autre, et ecrit status_data.js.

Etapes (chacune est un script independant ; si une etape echoue, les anciennes donnees sont conservees) :
  stockbee  -> stockbee_data.js   (Google Sheet public de Stockbee)
  vix       -> vix_data.js        (fichier CSV public du CBOE)
  prices    -> prices_data.js     (QQQ, IWM : Yahoo Finance ; BTC : Coinbase)
  sectors   -> sectors_data.js    (ETF sectoriels : Yahoo Finance)

Chaque fichier produit est controle (validate_data.py) avant d'etre conserve : s'il est invalide, ou plus ancien que
la version precedente, il est annule et les anciennes donnees sont restaurees.

Aucune cle API ni identifiant : toutes les sources sont publiques. Utilise en local ou par GitHub Actions
(voir AUTOMATISATION.md). Code de sortie : 0 si tout est a jour, 1 si au moins une etape a echoue.
"""
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import validate_data

HERE = Path(__file__).resolve().parent
STATUS = HERE / "status_data.js"

# (nom, script, fichier principal, fichiers a restaurer en cas d'echec, tentatives, attentes entre tentatives en secondes)
STEPS = [
    ("stockbee", "fetch_stockbee.py", "stockbee_data.js", ("stockbee_data.js", "stockbee_market_monitor.csv"), 3, (30, 90)),
    ("vix", "fetch_vix.py", "vix_data.js", ("vix_data.js",), 3, (30, 90)),
    ("prices", "fetch_prices.py", "prices_data.js", ("prices_data.js",), 3, (60, 180)),   # Yahoo : 429 possibles depuis une IP de serveur
    ("sectors", "fetch_sectors.py", "sectors_data.js", ("sectors_data.js",), 3, (60, 180)),
]


def last_date(name, path):
    """Derniere date presente dans le fichier produit (pour le statut affiche dans le dashboard)."""
    try:
        text = path.read_text()
        data = json.loads(text[text.index("=") + 1:].strip().rstrip(";"))
        if name == "stockbee":
            return data["rows"][-1][0]
        if name == "vix":
            return data[-1][0]
        if name == "prices":
            return min(v[-1][0] for v in data.values() if v)        # la serie la plus en retard
        if name == "sectors":
            return data["asof"]
    except (OSError, ValueError, KeyError, IndexError):
        pass
    return None


def run_step(name, script, out_file, restore, attempts, waits):
    out_path = HERE / out_file
    backup = {f: (HERE / f).read_bytes() for f in restore if (HERE / f).exists()}
    old_last = last_date(name, out_path)

    def rollback():
        for f, data in backup.items():
            (HERE / f).write_bytes(data)

    last_err = ""
    for i in range(attempts):
        t0 = time.time()
        try:
            r = subprocess.run([sys.executable, script], cwd=HERE, capture_output=True, text=True, timeout=900)
            tail = (r.stdout + r.stderr).strip().splitlines()[-4:]
            if r.returncode == 0:
                errors = validate_data.validate(name, out_path)
                new_last = last_date(name, out_path)
                if not errors and old_last and new_last and new_last < old_last:
                    errors = [f"{name} : donnees plus anciennes que la version precedente ({new_last} < {old_last})"]
                if not errors:
                    print(f"[{name}] OK ({time.time() - t0:.0f}s, essai {i + 1}) : {' | '.join(tail[-2:])}", flush=True)
                    return {"ok": True, "attempts": i + 1, "last": new_last}
                rollback()                                  # fichier invalide : on revient aux dernieres donnees valides
                last_err = "controle de coherence : " + " ; ".join(errors)[:300]
            else:
                last_err = " | ".join(tail)[:300]
        except subprocess.TimeoutExpired:
            rollback()
            last_err = "delai depasse (15 min)"
        print(f"[{name}] echec essai {i + 1}/{attempts} : {last_err}", flush=True)
        if i < attempts - 1:
            time.sleep(waits[min(i, len(waits) - 1)])
    rollback()
    return {"ok": False, "attempts": attempts, "last": last_date(name, out_path), "error": last_err}


def main():
    t0 = time.time()
    sources = {name: run_step(name, script, out, restore, att, waits) for name, script, out, restore, att, waits in STEPS}
    status = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "sources": sources}
    STATUS.write_text("window.STATUS = " + json.dumps(status, separators=(",", ":"), ensure_ascii=False) + ";\n")
    failed = [n for n, s in sources.items() if not s["ok"]]
    print(f"\nTermine en {time.time() - t0:.0f}s : " + ("tout est a jour." if not failed else "ECHEC pour " + ", ".join(failed) + " (anciennes donnees conservees)."))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
