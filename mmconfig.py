#!/usr/bin/env python3
"""Configuration centralisée du Market Monitor (dossier config/, format TOML, lu par la bibliothèque standard).

Source unique des paramètres métier : horaires, heures de marché, étapes du robot et contrôles de fraîcheur, filtres du scan
post-market, univers des ETF, seuils et libellés d'affichage, modèle logique des données, stockage.
  - le robot Python lit la config avec load("<fichier>") ;
  - le dashboard lit config_data.js (window.MM_CONFIG), GÉNÉRÉ par ce module : ne jamais l'éditer à la main ;
  - les créneaux `schedule` des workflows GitHub ne peuvent pas lire la config : check() vérifie qu'ils lui correspondent.

Usage :
  python mmconfig.py --js      régénère config_data.js après une modification de config/
  python mmconfig.py --check   valide la config et sa cohérence (lancé par tests/run_all.sh et la CI) ; code 1 si erreur
"""
import json
import re
import sys
import tomllib
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG = HERE / "config"
JS = HERE / "config_data.js"
WORKFLOWS = HERE / ".github" / "workflows"
FILES = ("market", "schedule", "sources", "postmarket", "display", "sectors", "datasets", "storage")
BACKENDS = {"git_csv", "postgres", "sqlite"}
TYPES = {"date", "timestamp", "int", "float", "text", "bool"}


@lru_cache(maxsize=None)
def load(name):
    """Contenu de config/<name>.toml (dictionnaire, mis en cache)."""
    if name not in FILES:
        raise KeyError(f"fichier de config inconnu : {name} (attendus : {', '.join(FILES)})")
    with open(CONFIG / f"{name}.toml", "rb") as f:
        return tomllib.load(f)


def steps():
    """Étapes de update_all.py, dans l'ordre (config/sources.toml)."""
    return load("sources")["step"]


def step(name):
    return next(s for s in steps() if s["name"] == name)


def sectors():
    """Univers de l'onglet Secteurs (config/sectors.toml), dans l'ordre."""
    return load("sectors")["etf"]


def front_config():
    """Sous-ensemble de la config utile au dashboard (sérialisé dans config_data.js)."""
    m, pm, d = load("market"), load("postmarket"), load("display")
    return {
        "market": {k: m[k] for k in ("timezone", "close_hour", "postmarket_end_hour", "premarket_start_hour")},
        "schedule": {k: {"label": w["label"], "cron": w["cron_job_org"]} for k, w in load("schedule")["workflows"].items()},
        "postmarket": {**{k: pm[k] for k in ("min_price", "min_volume", "min_change", "max_per_side", "keep_sessions")},
                       "links": [{"label": l["label"], "url": l["url"]} for l in pm.get("links", [])],
                       "tags": [{k: t[k] for k in ("id", "icon", "label", "tone")} for t in pm.get("tags", [])]},
        "breadth": d["breadth"],
        "vix": d["vix"],
        "colors": d["colors"],
        "sectors": {"groups": d["sectors"]["groups"], "labels": {e["symbol"]: e["label"] for e in sectors()}},
        "sector_fr": d["postmarket"]["sector_fr"],
        "sources": {s["name"]: {"label": s["label"], "inline": s["label_inline"]} for s in steps()},
    }


def js_text():
    return ("// GÉNÉRÉ par mmconfig.py depuis config/*.toml : ne pas modifier à la main (python mmconfig.py --js)\n"
            "window.MM_CONFIG = " + json.dumps(front_config(), ensure_ascii=False, sort_keys=True, separators=(",", ":")) + ";\n")


CRON_FIELD = re.compile(r"^(\*|\d+(-\d+)?)(/\d+)?(,(\*|\d+(-\d+)?)(/\d+)?)*$")


def _cron_ok(expr):
    parts = expr.split()
    return len(parts) == 5 and all(CRON_FIELD.match(p) for p in parts)


def _workflow_crons(file):
    text = (WORKFLOWS / file).read_text()
    return re.findall(r"-\s*cron:\s*'([^']+)'", text)


def check():
    """Liste des erreurs de configuration (vide = valide)."""
    errors = []
    for name in FILES:
        try:
            load(name)
        except (OSError, tomllib.TOMLDecodeError) as e:
            errors.append(f"config/{name}.toml illisible : {e}")
    if errors:
        return errors
    m = load("market")
    if not 0 < m["premarket_start_hour"] < m["open_hour"] < m["close_hour"] < m["postmarket_end_hour"] <= 24:
        errors.append("market : heures incohérentes (pre-market < ouverture < clôture < fin du post-market)")
    for key, w in load("schedule")["workflows"].items():
        for expr in [w["cron_job_org"], *w["github_fallback"]]:
            if not _cron_ok(expr):
                errors.append(f"schedule.{key} : expression cron invalide « {expr} »")
        if not (WORKFLOWS / w["file"]).exists():
            errors.append(f"schedule.{key} : workflow {w['file']} introuvable")
        elif _workflow_crons(w["file"]) != w["github_fallback"]:
            errors.append(f"schedule.{key} : les créneaux de {w['file']} ({_workflow_crons(w['file'])}) diffèrent de github_fallback")
    names = [s["name"] for s in steps()]
    if len(set(names)) != len(names):
        errors.append("sources : noms d'étapes en double")
    for s in steps():
        if not (HERE / s["script"]).exists():
            errors.append(f"sources.{s['name']} : script {s['script']} introuvable")
        if s["attempts"] < 1 or not s["waits"] or s["output"] not in s["restore"]:
            errors.append(f"sources.{s['name']} : attempts ≥ 1, waits non vide et output dans restore attendus")
    pm = load("postmarket")
    if not (pm["min_price"] > 0 and pm["min_volume"] > 0 and pm["min_change"] > 0 and pm["max_per_side"] > 0 and pm["keep_sessions"] > 0):
        errors.append("postmarket : seuils strictement positifs attendus")
    for l in pm.get("links", []):
        if not l.get("label") or not str(l.get("url", "")).startswith("https://") or not re.search(r"\{(sym|tv)\}", l.get("url", "")):
            errors.append(f"postmarket.links « {l.get('label', '?')} » : libellé, url https:// et {{sym}} ou {{tv}} attendus")
    tags = pm.get("tags", [])
    if not tags:
        errors.append("postmarket.tags : au moins une étiquette de suivi attendue")
    if len({t.get("id") for t in tags}) != len(tags):
        errors.append("postmarket.tags : identifiants en double")
    for t in tags:
        if not (t.get("id") and t.get("icon") and t.get("label")) or t.get("tone") not in {"warn", "up", "down", "muted"}:
            errors.append(f"postmarket.tags « {t.get('id', '?')} » : id, icon, label et tone (warn, up, down, muted) attendus")
    groups = {g for g, _ in load("display")["sectors"]["groups"]} - {"all"}
    syms = [e["symbol"] for e in sectors()]
    if len(set(syms)) != len(syms):
        errors.append("sectors : symboles en double")
    for e in sectors():
        missing = [k for k in ("symbol", "name", "group", "origin", "label") if not e.get(k)]
        if missing:
            errors.append(f"sectors.{e.get('symbol', '?')} : champs vides {missing}")
        if e.get("group") not in groups:
            errors.append(f"sectors.{e.get('symbol', '?')} : groupe « {e.get('group')} » absent de display.sectors.groups")
    for key, ds in load("datasets")["datasets"].items():
        bad = [c for c, t in ds["columns"].items() if t.rstrip("?") not in TYPES]
        if bad:
            errors.append(f"datasets.{key} : types inconnus pour {bad}")
        if any(k not in ds["columns"] for k in ds["primary_key"]):
            errors.append(f"datasets.{key} : clé primaire hors colonnes")
    st = load("storage")
    if st.get("serving") not in {"js_files", "store"}:
        errors.append(f"storage : serving inconnu « {st.get('serving')} » (attendus : js_files, store)")
    if st.get("store", {}).get("backend") not in BACKENDS:
        errors.append(f"storage.store : backend inconnu « {st.get('store', {}).get('backend')} » (attendus : {', '.join(sorted(BACKENDS))})")
    for key, ds in load("datasets")["datasets"].items():
        if ds.get("partition") not in {"month", "day"}:
            errors.append(f"datasets.{key} : partition « {ds.get('partition')} » (attendus : month, day)")
        if ds["columns"].get(ds.get("partition_by", ""), "").rstrip("?") not in {"date", "timestamp"} or ds["columns"][ds["partition_by"]].endswith("?"):
            errors.append(f"datasets.{key} : partition_by doit nommer une colonne date ou timestamp obligatoire")
    if not JS.exists() or JS.read_text() != js_text():
        errors.append("config_data.js n'est pas à jour : lance python mmconfig.py --js")
    return errors


def main(argv):
    if "--js" in argv:
        JS.write_text(js_text())
        print(f"Écrit : {JS.name}")
    if "--check" in argv or not argv:
        errs = check()
        for e in errs:
            print("  -", e)
        print("config : " + ("valide" if not errs else f"{len(errs)} erreur(s)"))
        return 1 if errs else 0
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
