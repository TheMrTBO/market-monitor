"""Conversion des fichiers publiés (*_data.js, format d'affichage) vers les jeux de données du stockage (modèle logique).

Sert deux fois :
  - phase 3a : reprise unique de tout l'historique déjà disponible ;
  - phase 3b : après chaque passage du robot, synchronisation des fichiers fraîchement écrits (upsert idempotent : seules les
    lignes nouvelles ou modifiées changent les CSV ; chaque relevé post-market est conservé grâce à son horodatage).
Une fonction par fichier source ; chacune renvoie {jeu: [lignes]}. Aucune hypothèse sur le stockage physique.
"""
import json
from pathlib import Path


def load_js(path):
    text = Path(path).read_text()
    return json.loads(text[text.index("=") + 1:].strip().rstrip(";"))


def stockbee(data):
    cols = data["columns"]
    rows = []
    for r in data["rows"]:
        d = dict(zip(cols, r))
        d["session_date"] = d.pop("date")
        rows.append(d)
    return {"stockbee_daily": rows}


def breadth_own(data):
    cols = data["columns"]
    rows = []
    for r in data["rows"]:
        d = {c: (r[i] if i < len(r) else None) for i, c in enumerate(cols)}
        d["session_date"] = d.pop("date")
        rows.append(d)
    return {"breadth_own_daily": rows}


def prices(data):
    rows = [{"symbol": sym, "session_date": b[0], "open": b[1], "high": b[2], "low": b[3], "close": b[4], "volume": b[5]}
            for sym, bars in data.items() for b in bars]
    return {"prices_daily": rows}


def sectors(data):
    dates = data["dates"]
    rows = []
    for s in data["symbols"]:
        for i, d in enumerate(dates):
            if s["c"][i] is None:                          # pas de cotation ce jour-là (ETF plus récent, jour manquant)
                continue
            rows.append({"symbol": s["s"], "session_date": d, "open": s["op"][i], "high": s["h"][i], "low": s["l"][i],
                         "close": s["c"][i], "volume": s["v"][i]})
    return {"sectors_daily": rows}


def vix(data):
    return {"vix_daily": [{"session_date": r[0], "open": r[1], "high": r[2], "low": r[3], "close": r[4]} for r in data]}


# colonnes de postmarket_data.js -> colonnes de postmarket_scan
PM_COLS = {"t": "ticker", "s": "symbol", "n": "name", "sec": "sector", "ind": "industry", "c": "close", "ch": "change_pct",
           "pc": "pm_price", "pch": "pm_change_pct", "pv": "pm_volume", "rv": "rvol", "cap": "market_cap", "flt": "float_shares",
           "er": "earnings"}


def postmarket(data):
    """Chaque instantané = un relevé (taken_at) de postmarket_scan. Le lendemain (variation, gap de la séance suivante)
    des titres de la liste finale va dans postmarket_next. Un titre sorti du scan n'apparaît plus dans les relevés
    suivants : la liste finale d'une séance est son dernier relevé, jamais l'union des relevés."""
    cols = data["cols"]
    scan, nxt = [], []
    for snap in data["snaps"]:
        for r in snap["rows"]:
            d = dict(zip(cols, r))
            row = {PM_COLS[k]: d.get(k) for k in PM_COLS}
            row["earnings"] = row["earnings"] or None
            row.update(session_date=snap["d"], taken_at=snap["at"], closed=bool(snap["closed"]))
            scan.append(row)
            if snap.get("nextd") and (d.get("nx") is not None or d.get("ng") is not None):
                nxt.append({"session_date": snap["d"], "ticker": d["t"], "next_session": snap["nextd"],
                            "next_change_pct": d.get("nx"), "next_gap_pct": d.get("ng")})
    return {"postmarket_scan": scan, "postmarket_next": nxt}


def runs(status, run_id):
    """Journal d'un passage de update_all.py (status_data.js) : une ligne par source."""
    started = status.get("started") or status["updated"]
    return {"runs": [{"run_id": run_id, "source": name, "started_at": started, "duration_s": s.get("duration"), "ok": bool(s["ok"]),
                      "attempts": s.get("attempts", 1), "last_session": s.get("last"), "note": s.get("error") or s.get("note")}
                     for name, s in status.get("sources", {}).items()]}


# fichier publié -> fonction de conversion (les fichiers absents sont ignorés)
SOURCES = {
    "stockbee_data.js": stockbee,
    "breadth_data.js": breadth_own,
    "prices_data.js": prices,
    "sectors_data.js": sectors,
    "vix_data.js": vix,
    "postmarket_data.js": postmarket,
}


def from_js_files(store, folder, only=None, run_id=None):
    """Synchronise les fichiers publiés de `folder` vers le stockage. Renvoie {jeu: statistiques d'upsert}.
    run_id : identifiant du passage ; s'il est fourni, status_data.js alimente le journal `runs` (mise à jour complète)."""
    report = {}
    if run_id and (Path(folder) / "status_data.js").exists():
        for dataset, rows in runs(load_js(Path(folder) / "status_data.js"), run_id).items():
            report[dataset] = store.upsert(dataset, rows)
    for fname, conv in SOURCES.items():
        if only and fname not in only:
            continue
        path = Path(folder) / fname
        if not path.exists():
            continue
        for dataset, rows in conv(load_js(path)).items():
            report[dataset] = store.upsert(dataset, rows)
    return report
