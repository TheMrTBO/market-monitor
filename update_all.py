#!/usr/bin/env python3
"""Met a jour toutes les donnees du dashboard, une etape apres l'autre, et ecrit status_data.js.

Etapes (chacune est un script independant ; si une etape echoue, les anciennes donnees sont conservees) :
  stockbee  -> stockbee_data.js   (Google Sheet public de Stockbee)
  breadth   -> breadth_data.js    (calcul maison +4 % / -4 % depuis l'historique cache/history/ ; fetch_history.py le remplit
                                   avant, voir le workflow ; Stockbee sert de controle croise)
  vix       -> vix_data.js        (fichier CSV public du CBOE)
  prices    -> prices_data.js     (QQQ, IWM : Yahoo Finance ; BTC : Coinbase)
  sectors   -> sectors_data.js    (ETF sectoriels : Yahoo Finance)
  postmarket-> postmarket_data.js (scan post-market du screener public TradingView ; ne fait rien hors du post-market ;
                                   aussi lance seul toutes les 15 min le soir par .github/workflows/postmarket.yml)
  industries-> industries_data.js + industries/ (vue TradingView de l'onglet Secteurs : classification du scanner
                                   TradingView, indices calcules depuis l'historique cache/history/)

Chaque fichier produit est controle (validate_data.py) avant d'etre conserve : s'il est invalide, ou plus ancien que
la version precedente, il est annule et les anciennes donnees sont restaurees.

Aucune cle API n'est necessaire ici : le telechargement des clotures (Polygon / Massive, cle POLYGON_API_KEY) est fait par
fetch_history.py, lance avant cet orchestrateur. Utilise en local ou par GitHub Actions
(voir AUTOMATISATION.md). Code de sortie : 0 si tout est a jour, 1 si au moins une etape a echoue.
"""
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import mmconfig
import validate_data

HERE = Path(__file__).resolve().parent
STATUS = HERE / "status_data.js"

# Etapes : config/sources.toml (nom, script, fichier principal, fichiers a restaurer, essais, attentes entre essais)
STEPS = [(t["name"], t["script"], t["output"], tuple(t["restore"]), t["attempts"], tuple(t["waits"])) for t in mmconfig.steps()
         if not t.get("separate")]          # étape « separate » : lancée par son propre workflow (ex. short interest)


def last_date(name, path):
    """Derniere date presente dans le fichier produit (pour le statut affiche dans le dashboard)."""
    try:
        text = path.read_text()
        data = json.loads(text[text.index("=") + 1:].strip().rstrip(";"))
        if name == "stockbee":
            return data["rows"][-1][0]
        if name == "vix":
            return data[-1][0]
        if name == "breadth":
            return data["rows"][-1][0]
        if name == "prices":
            return min(v[-1][0] for v in data.values() if v)        # la serie la plus en retard
        if name == "sectors":
            return data["asof"]
        if name == "postmarket":
            return data["snaps"][-1]["d"] if data["snaps"] else None
        if name == "industries":
            return data["asof"]
    except (OSError, ValueError, KeyError, IndexError):
        pass
    return None


def snapshot(restore):
    """{chemin relatif: contenu} des fichiers a restaurer ; une entree finissant par « / » designe tout un dossier."""
    out = {}
    for f in restore:
        p = HERE / f
        if f.endswith("/"):
            for q in sorted(p.glob("*")) if p.is_dir() else []:
                if q.is_file():
                    out[q.relative_to(HERE).as_posix()] = q.read_bytes()
        elif p.exists():
            out[f] = p.read_bytes()
    return out


def run_step(name, script, out_file, restore, attempts, waits):
    out_path = HERE / out_file
    backup = snapshot(restore)
    old_last = last_date(name, out_path)

    def rollback():
        for f in restore:
            if f.endswith("/"):                             # dossier : on retire les fichiers produits, on remet les anciens
                d = HERE / f
                for q in d.glob("*") if d.is_dir() else []:
                    if q.is_file() and q.relative_to(HERE).as_posix() not in backup:
                        q.unlink()
            elif f not in backup:                           # le fichier n'existait pas avant : on retire le produit invalide
                (HERE / f).unlink(missing_ok=True)
        for f, data in backup.items():
            (HERE / f).parent.mkdir(parents=True, exist_ok=True)
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
                    # source en retard sur nos donnees (ex. Yahoo renvoie le soir la bougie du jour sans cloture) : on garde la
                    # version precedente, qui est plus recente ; ce n'est pas un echec tant qu'elle reste valide (fraicheur)
                    rollback()
                    stale = validate_data.validate(name, out_path)
                    if not stale:
                        note = f"source en retard ({new_last}), version precedente conservee ({old_last})"
                        print(f"[{name}] OK (essai {i + 1}) : {note}", flush=True)
                        return {"ok": True, "attempts": i + 1, "last": old_last, "note": note}
                    errors = [f"{name} : donnees plus anciennes que la version precedente ({new_last} < {old_last}) ; " + " ; ".join(stale)[:200]]
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
    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
    sources = {}
    for name, script, out, restore, att, waits in STEPS:
        t = time.time()
        sources[name] = run_step(name, script, out, restore, att, waits)
        sources[name]["duration"] = round(time.time() - t, 1)     # journal des passages (stockage, jeu runs)
    status = {"started": started, "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "sources": sources}
    try:                                            # heure du dernier scan post-market (bouton « Actualiser », voir fetch_postmarket.py)
        pm = json.loads((lambda t: t[t.index("=") + 1:].strip().rstrip(";"))((HERE / "postmarket_data.js").read_text()))["snaps"]
        status["pm"] = pm[-1]["at"] if pm else None
    except (OSError, ValueError, KeyError):
        status["pm"] = None
    STATUS.write_text("window.STATUS = " + json.dumps(status, separators=(",", ":"), ensure_ascii=False) + ";\n")
    failed = [n for n, s in sources.items() if not s["ok"]]
    print(f"\nTermine en {time.time() - t0:.0f}s : " + ("tout est a jour." if not failed else "ECHEC pour " + ", ".join(failed) + " (anciennes donnees conservees)."))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
