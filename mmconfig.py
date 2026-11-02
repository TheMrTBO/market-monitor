#!/usr/bin/env python3
"""Configuration centralisée du Market Monitor (dossier config/, format TOML, lu par la bibliothèque standard).

Source unique des paramètres métier : horaires, heures de marché, étapes du robot et contrôles de fraîcheur, filtres du scan
post-market, univers des ETF, vue TradingView (secteurs → industries → actions), thèmes suivis, seuils et libellés d'affichage, modèle logique des données, stockage.
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
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
CONFIG = HERE / "config"
JS = HERE / "config_data.js"
WORKFLOWS = HERE / ".github" / "workflows"
FILES = ("market", "schedule", "sources", "postmarket", "display", "sectors", "industries", "themes", "short", "datasets", "storage", "etf_themes")
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


def themes():
    """Thèmes suivis de l'onglet Secteurs (config/themes.toml), dans l'ordre : [{name, tickers, etf?}]."""
    return load("themes").get("theme", [])


def sectors():
    """Univers de l'onglet Secteurs (config/sectors.toml), dans l'ordre."""
    return load("sectors")["etf"]


def front_config():
    """Sous-ensemble de la config utile au dashboard (sérialisé dans config_data.js)."""
    m, pm, d, ind = load("market"), load("postmarket"), load("display"), load("industries")
    return {
        "market": {k: m[k] for k in ("timezone", "close_hour", "postmarket_end_hour", "premarket_start_hour")},
        "schedule": {k: {"label": w["label"], "cron": w["cron_job_org"]} for k, w in load("schedule")["workflows"].items()},
        "postmarket": {**{k: pm[k] for k in ("min_price", "min_volume", "min_change", "max_per_side", "keep_sessions")},
                       "links": [{"label": l["label"], "url": l["url"]} for l in pm.get("links", [])]},
        "breadth": {**d["breadth"], "tv_sma": load("sources")["tv_breadth"]["sma"]},
        "vix": d["vix"],
        "colors": d["colors"], "chart_nine": d["chart_nine"], "ticker_popup": d["ticker_popup"],
        "etf_themes": {**{k: load("etf_themes")[k] for k in ("label", "tip", "row_label", "row_max")}, "file": step("etf_themes")["output"]},
        "sectors": {"groups": d["sectors"]["groups"], "views": d["sectors"]["views"], "group_tips": d["sectors"]["group_tips"],
                    "kpis": d["sectors"]["kpis"], "rrg": d["sectors"]["rrg"], "actifs": d["sectors"]["actifs"], "map": d["sectors"]["map"],
                    "breakouts": load("sources")["tv_breadth"]["breakouts"],
                    "labels": {e["symbol"]: e["label"] for e in sectors()}},
        "ti65": d["ti65"],
        "adr": d["adr"],
        "phases": d["phases"],
        "tickers": {**d["tickers"], "file": ind["output"]["tickers_file"], "short_file": step("short")["output"],
                    "short_stale_days": load("short")["stale_days"]},
        "industries": {**{k: ind["index"][k] for k in ("min_members", "few_members")}, "folder": ind["output"]["folder"],
                       "volume": ind["volume"], "leaders": ind["leaders"],
                       **{k: ind["universe"][k] for k in ("min_price", "min_avg_volume", "avg_volume_sessions", "min_market_cap")}},
        "themes": [{"name": t["name"], "etf": t.get("etf")} for t in themes()],
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
    if not (pm["request_attempts"] >= 1 and len(pm["request_waits"]) == pm["request_attempts"] - 1 and pm["request_timeout"] > 0):
        errors.append("postmarket : request_attempts ≥ 1, request_waits = request_attempts − 1 attentes, request_timeout > 0 attendus")
    bs = load("sources")["breadth_soir"]
    if not (0 < bs["match_tol"] < 0.1 and 0.5 <= bs["min_match"] <= 1 and bs["split_min"] > 1 + bs["match_tol"]
            and 0.5 <= bs["min_coverage"] <= 1):
        errors.append("sources.breadth_soir : 0 < match_tol < 0,1, min_match et min_coverage entre 0,5 et 1, split_min > 1 + match_tol attendus")
    po = load("display")["phases"].get("own", {})
    if not (po.get("primary") in ("sb", "own") and 0 < po.get("choc_pct", 0) < 1
            and isinstance(po.get("compare_sessions"), int) and po["compare_sessions"] > 0
            and (po.get("since") == "" or re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(po.get("since"))))
            and all(po.get(k) for k in ("label", "label_prov", "label_sb"))):
        errors.append("display.phases.own : primary sb ou own, choc_pct entre 0 et 1, compare_sessions entier > 0, since vide ou AAAA-MM-JJ, libellés attendus")
    sbk = load("sources")["stockbee"]
    year = datetime.now(ZoneInfo(m["timezone"])).year
    if str(year) not in sbk["gids"]:
        errors.append(f"sources.stockbee : onglet {year} absent de gids (Stockbee ouvre un onglet par année : ajouter son gid)")
    for l in pm.get("links", []):
        if not l.get("label") or not str(l.get("url", "")).startswith("https://") or not re.search(r"\{(sym|symd|tv)\}", l.get("url", "")):
            errors.append(f"postmarket.links « {l.get('label', '?')} » : libellé, url https:// et {{sym}}, {{symd}} ou {{tv}} attendus")
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
    kp = load("display")["sectors"]["kpis"]
    rr = kp.get("rotation_ratio", [])
    if not kp["tiles"] or set(kp["tiles"]) - {"ind", "sec", "rot", "rr", "stk", "th", "bo9", "t9"} or len(set(kp["tiles"])) != len(kp["tiles"]) \
            or not (isinstance(kp["rotation_window"], int) and kp["rotation_window"] > 0) or not 1 < kp["record_sessions"] < load("industries")["output"]["sessions"] or not kp.get("record_label") or not kp.get("record_text") \
            or not (isinstance(kp.get("rotation_ratio_sessions"), int) and kp["rotation_ratio_sessions"] > 0) \
            or not (len(rr) == 2 and 0 < rr[0] <= rr[1]) or not 0 < kp.get("breadth_mid", -1) < 100 or not kp.get("benchmark"):
        errors.append("display.sectors.kpis : tiles parmi ind, sec, rot, rr, stk, th, bo9, t9 (sans doublon), rotation_window, record_sessions (< industries.output.sessions), record_label, record_text, "
                      "rotation_ratio_sessions entier > 0, rotation_ratio = [bas, haut] croissant, breadth_mid entre 0 et 100 et benchmark attendus")
    ad = load("display")["adr"]
    if not (isinstance(ad.get("sessions"), int) and ad["sessions"] > 1 and ad.get("step", 0) > 0):
        errors.append("display.adr : sessions entier > 1 et step > 0 attendus")
    elif ad["sessions"] > load("industries")["output"]["stock_sessions"]:
        errors.append("display.adr.sessions : plus de séances que les fichiers d'actions n'en contiennent (industries.output.stock_sessions)")
    mp = load("display")["sectors"].get("map", {})
    zk = {"reveil", "lasting", "trend", "calm"}
    if not (isinstance(mp.get("shown"), bool) and mp.get("label") and 0 < mp.get("x_hot", 0) < 100 and 0 < mp.get("y_max", 0) <= 100
            and isinstance(mp.get("trail"), int) and 2 <= mp["trail"] <= 21
            and mp.get("y_scale") in ("log", "sqrt", "linear") and (mp["y_scale"] != "log" or 0 < mp.get("y_log_k", 0) < 100) and isinstance(mp.get("y_ticks"), list) and len(mp["y_ticks"]) >= 2
            and all(0 <= v <= mp.get("y_max", 0) for v in mp["y_ticks"]) and mp.get("x_title") and mp.get("y_title") and mp.get("read_hint")
            and isinstance(mp.get("time_sessions"), int) and 10 <= mp["time_sessions"] < load("industries")["output"]["sessions"] and mp.get("time_label")
            and isinstance(mp.get("side_share"), int) and 40 <= mp["side_share"] <= 75 and all(isinstance(mp.get(k), int) and 200 <= mp[k] <= 1200 for k in ("map_min", "zone_min")) and isinstance(mp.get("grow_max"), int) and 0 <= mp["grow_max"] <= 1000
            and set(mp.get("zones", {})) == zk and all(mp["zones"].values()) and set(mp.get("zone_notes", {})) == zk and mp.get("tip")):
        errors.append("display.sectors.map : shown (booléen), label, 0 < x_hot < 100, 0 < y_max ≤ 100, trail entier de 2 à 21, y_scale (log et y_log_k / sqrt / linear), y_ticks, titres d'axes, read_hint, time_sessions de 10 à industries.output.sessions, time_label, side_share 40-75, map_min et zone_min 200-1200, grow_max 0-1000, zones et zone_notes "
                      "(reveil, lasting, trend, calm) et tip attendus")
    bd = mp.get("board", {})
    if not (bd.get("label") and bd.get("copy_tip") and "{z}" in bd.get("copy_zone_tip", "") and bd.get("neuf_label") and set(bd.get("notes", {})) == {"neuf", "other"} and all(bd["notes"].values()) and bd.get("other_label")
            and isinstance(bd.get("other_max"), int) and bd["other_max"] >= 1 and isinstance(bd.get("dots_max"), int) and bd["dots_max"] >= 1
            and "{x}" in bd.get("lift_label", "") and "{x}" in bd.get("lift_short", "") and isinstance(bd.get("lift_hi"), (int, float)) and bd.get("lift_tip") and "{n}" in bd.get("age_label", "") and isinstance(bd.get("age_buckets"), list) and len(bd.get("age_notes", [])) == len(bd["age_buckets"]) + 1 and bd.get("age_tip") and "{k}" in bd.get("basket", "") and "{n}" in bd.get("same_day", "") and bd.get("same_day_tip") and isinstance(bd.get("low_rank"), (int, float)) and 0 < bd["low_rank"] < 100 and bd.get("low_label") and "{r}" in bd.get("low_tip", "") and bd.get("legend") and bd.get("empty")):
        errors.append("display.sectors.map.board : label, copy_tip, copy_zone_tip ({z}), neuf_label, notes (neuf, other), other_label, other_max ≥ 1, dots_max ≥ 1, lift_label et lift_short ({x}), lift_hi, lift_tip, age_label ({n}), age_buckets, age_notes (une de plus que les bornes), age_tip, basket ({k}), same_day ({n}), "
                      "same_day_tip, low_rank (0-100), low_label, low_tip ({r}), legend et empty attendus")
    ints = lambda *ks: all(isinstance(bd.get(k), int) and bd[k] >= 1 for k in ks)
    if not (ints("grid_sessions", "rank_up_sessions", "moves_sessions", "gone_sessions", "gone_max") and bd["grid_sessions"] <= 63
            and isinstance(bd.get("rank_up_pts"), (int, float)) and bd["rank_up_pts"] > 0 and "{n}" in bd.get("grid_legend", "")
            and "{d}" in bd.get("cell_tip", "") and "{n}" in bd.get("cell_tip", "") and "{s}" in bd.get("cell_ep", "") and "{d}" in bd.get("cell_none", "")
            and "{r}" in bd.get("rank_tip", "") and bd.get("rank_up_tip") and "{n}" in bd.get("moves_label", "") and "{n}" in bd.get("moves_in", "")
            and "{n}" in bd.get("moves_out", "") and bd.get("moves_none") and bd.get("gone_title") and bd.get("gone_note") and "{n}" in bd.get("gone_label", "")
            and bd.get("theme_tag") and bd.get("theme_tip")):
        errors.append("display.sectors.map.board : grille de convergence attendue (grid_sessions 1-63, grid_legend ({n}), cell_tip ({d}, {n}), cell_ep ({s}), "
                      "cell_none ({d}), rank_tip ({r}), rank_up_sessions, rank_up_pts > 0, rank_up_tip, moves_sessions, moves_label / moves_in / moves_out ({n}), "
                      "moves_none, gone_sessions, gone_max, gone_title, gone_note, gone_label ({n}), theme_tag, theme_tip)")
    zk, pk = {"rev", "both", "neuf"}, [x.get("key") for x in load("display").get("phases", {}).get("phase", [])]
    rules = bd.get("phase_rule", [])
    seen = [k for r in rules for k in r.get("phases", [])]
    perm = lambda o: isinstance(o, list) and sorted(o) == sorted(zk)
    if not (perm(bd.get("default_order")) and "{p}" in bd.get("phase_label", "") and "{z}" in bd.get("phase_label", "") and rules
            and all(perm(r.get("order")) and isinstance(r.get("low"), bool) and r.get("tip") for r in rules)
            and sorted(seen) == sorted(pk)):
        errors.append("display.sectors.map.board : default_order (rev, both, neuf), phase_label ({p}, {z}) et phase_rule "
                      "(phases, order = rev / both / neuf dans un ordre, low vrai ou faux, tip) attendus ; chaque phase de [[phases.phase]] dans une seule règle")
    cn = load("display").get("chart_nine", {})
    if not (isinstance(cn.get("shown"), bool) and cn.get("label") and cn.get("strong_label") and cn.get("tip") and cn.get("legend") and isinstance(cn.get("skip"), list)):
        errors.append("display.chart_nine : shown (booléen), label, strong_label, tip, legend et skip (liste) attendus")
    tx = mp.get("text", {})
    need_tx = ("notes_title", "no_list", "loading", "nine_some", "nine_none", "point_tip", "rank", "go_leaders", "go_actions", "close",
               "row_tip", "row_tip_none", "chip_tip", "copy")
    pairs = ("over", "leader", "titre", "industrie", "titre_9m")
    if not (all(isinstance(tx.get(k), str) and tx[k] for k in need_tx) and all(isinstance(tx.get(k), list) and len(tx[k]) == 2 for k in pairs)
            and set(tx.get("legend", {})) == {"reveil", "lasting", "neuf", "hot", "read"} and set(tx.get("state", {})) == {"neuf", "hot"}):
        errors.append("display.sectors.map.text : libellés de la carte et du tableau attendus (" + ", ".join(need_tx) + ", paires "
                      + ", ".join(pairs) + ", legend et state)")
    tp = load("display").get("ticker_popup", {})
    if not (tp.get("range") in ("3M", "6M", "YTD", "1A", "2A", "5A", "Tout") and all(tp.get(k) for k in ("loading", "no_index", "not_found", "no_chart", "fiche", "fiche_tip", "close"))):
        errors.append("display.ticker_popup : range (3M, 6M, YTD, 1A, 2A, 5A, Tout) et libellés (loading, no_index, not_found, no_chart, fiche, fiche_tip, close) attendus")
    if not (isinstance(load("sources")["tv_breadth"]["breakouts"].get("adr_sessions"), int) and load("sources")["tv_breadth"]["breakouts"]["adr_sessions"] >= 2):
        errors.append("sources.tv_breadth.breakouts.adr_sessions : entier ≥ 2 attendu (ADR de la bougie forte)")
    mt = load("sources")["tv_breadth"]["breakouts"].get("marks_text", {})
    mk_need = ("close", "range", "prev", "week", "strong", "weak", "leader", "touch", "leg_strong", "leg_weak", "leg_ext_tag", "leg_ext", "leg_repeat", "leg_leader", "leg_hover",
               "ep", "ep_tag", "leg_ep", "conv", "conv_tag", "leg_conv")
    if not (all(mt.get(k) for k in mk_need) and isinstance(mt.get("repeat"), list) and len(mt["repeat"]) == 2):
        errors.append("sources.tv_breadth.breakouts.marks_text : libellés des repères attendus (" + ", ".join(mk_need) + ", repeat [singulier, pluriel])")
    tt = load("display")["sectors"]["kpis"].get("tiles_text", {})
    if not (all(tt.get(k) for k in ("bo9", "bo9_none", "bo9_kw", "bo9_own", "t9", "t9_none", "t9_loading", "t9_sub", "t9_kw")) and isinstance(tt.get("bo9_ext"), list) and len(tt["bo9_ext"]) == 2):
        errors.append("display.sectors.kpis.tiles_text : libellés des cases 9M attendus (bo9, bo9_none, bo9_ext [singulier, pluriel], bo9_kw, bo9_own, t9, t9_none, t9_loading, t9_sub, t9_kw)")
    et = load("etf_themes")
    if not (isinstance(et.get("etfs"), dict) and len(et["etfs"]) >= 5 and all(isinstance(v, str) and v for v in et["etfs"].values())
            and all(isinstance(et.get(k), (int, float)) and et[k] > 0 for k in ("min_weight", "max_per_stock", "pause", "timeout", "stale_days", "min_etfs"))
            and et["min_etfs"] <= len(et["etfs"]) and et.get("label") and et.get("tip") and "{t}" in et.get("row_label", "") and isinstance(et.get("row_max"), int)):
        errors.append("etf_themes : etfs (au moins 5, ETF = thème), min_weight, max_per_stock, pause, timeout, stale_days, "
                      "min_etfs (≤ nombre d'ETF), label, tip, row_label ({t}) et row_max attendus")
    rg = load("display")["sectors"]["rrg"]
    if not (isinstance(rg["trail"], int) and rg["trail"] > 0 and isinstance(rg["momentum"], int) and rg["momentum"] > 0
            and isinstance(rg.get("delta_windows"), list) and len(rg["delta_windows"]) == 2 and all(isinstance(w, int) and w > 0 for w in rg["delta_windows"])
            and rg["delta_windows"][0] < rg["delta_windows"][1]
            and isinstance(rg.get("major_factor"), (int, float)) and rg["major_factor"] > 0 and isinstance(rg.get("zone_margin"), (int, float)) and rg["zone_margin"] >= 0
            and isinstance(rg.get("table_rows"), int) and rg["table_rows"] > 0
            and isinstance(rg.get("shown"), bool)
            and all(isinstance(rg.get(k), (int, float)) for k in ("confirm_ti65", "confirm_breadth", "pistes_max_rs"))
            and 0 <= rg["confirm_breadth"] <= 1 and rg["confirm_ti65"] > 0 and rg["pistes_max_rs"] > 0
            and set(rg.get("views", {})) == {"conf", "pist", "chg", "all"} and set(rg.get("tags", {})) == {"strong", "edge", "fade", "watch"}
            and all(isinstance(v, str) and v for v in list(rg["views"].values()) + list(rg["tags"].values()))
            and isinstance(rg.get("measure_sessions"), list) and rg["measure_sessions"] and all(isinstance(w, int) and w > 0 for w in rg["measure_sessions"])
            and isinstance(rg.get("measure_streak"), int) and rg["measure_streak"] > 0 and isinstance(rg.get("streak_max"), int) and rg["streak_max"] > 0
            and rg.get("default_view") in ("conf", "pist", "chg", "all") and rg.get("default_view_in") in ("conf", "pist", "chg", "all")) \
            or set(rg["labels"]) != {"lead", "weak", "lag", "impr"}:
        errors.append("display.sectors.rrg : trail, momentum, table_rows entiers > 0, delta_windows = [courte, longue] entiers croissants, major_factor > 0, zone_margin ≥ 0, confirm_ti65 et pistes_max_rs > 0, confirm_breadth entre 0 et 1, views conf / pist / chg / all et tags strong / edge / fade / watch non vides, measure_sessions liste d'entiers > 0, measure_streak et streak_max entiers > 0, default_view et default_view_in parmi conf / pist / chg / all, labels lead / weak / lag / impr attendus")
    ti, ind = load("display")["ti65"], load("industries")
    if not (isinstance(ti["short"], int) and isinstance(ti["long"], int) and 0 < ti["short"] < ti["long"]) or not ti.get("name"):
        errors.append("display.ti65 : name non vide et 0 < short < long (entiers) attendus")
    if set(load("display")["sectors"]["group_tips"]) != {g for g, _ in load("display")["sectors"]["groups"]}:
        errors.append("display.sectors.group_tips : une bulle par filtre de display.sectors.groups attendue")
    # borne réelle (01/11/2026) : les données, pas la longueur du TI65 (spark + long − 1 séances publiées ; 6 mois = 126)
    if not (isinstance(ti.get("spark"), int) and ti["spark"] >= 2) or not ti.get("spark_label"):
        errors.append("display.ti65.spark : entier ≥ 2 attendu, avec spark_label")
    if ti.get("spark", 0) + ti["long"] - 1 > ind["output"]["sessions"]:
        errors.append("display.ti65.spark : la miniature des indices demande spark + long − 1 séances ≤ industries.output.sessions")
    if ti.get("spark", 0) + ti["long"] - 1 > ind["output"]["stock_sessions"]:
        errors.append("display.ti65.spark : la miniature des actions demande spark + long − 1 séances ≤ industries.output.stock_sessions")
    hist = load("sources").get("history", {})
    if not (isinstance(hist.get("sessions"), int) and hist["sessions"] <= hist.get("keep", 0) and hist.get("rate", 0) > 0
            and isinstance(hist.get("max_downloads"), int) and hist["max_downloads"] >= 0):
        errors.append("sources.history : sessions (entier) ≤ keep, rate > 0 et max_downloads (entier ≥ 0) attendus")
    elif hist["max_downloads"] and hist["max_downloads"] / hist["rate"] > 40:
        errors.append("sources.history : max_downloads / rate dépasse 40 min (un passage du robot doit rester court)")
    elif not ind["output"]["stock_sessions"] <= ind["output"]["sessions"] <= hist["sessions"]:
        errors.append("industries.output : stock_sessions ≤ sessions ≤ sources.history.sessions (historique Polygon téléchargé) attendu")
    tk = load("display").get("tickers", {})
    if not (0 < tk.get("hot_top_pct", 0) <= 100 and 0 <= tk.get("hot_min_breadth", -1) <= 100
            and tk.get("emerging_min_delta", 0) >= 1 and tk.get("max_tickers", 0) >= 1):
        errors.append("display.tickers : 0 < hot_top_pct ≤ 100, 0 ≤ hot_min_breadth ≤ 100, emerging_min_delta ≥ 1, max_tickers ≥ 1 attendus")
    if not tk.get("dvol_step", 0) > 0:
        errors.append("display.tickers : dvol_step > 0 attendu (pas du filtre « Vol $ », en M$)")
    bo = load("sources")["tv_breadth"]["breakouts"]
    ex, xe = bo.get("extra"), bo.get("extra_exchanges")
    if not (isinstance(ex, list) and all(isinstance(t, str) and re.fullmatch(r"[a-z]+(/[a-z]+)?", t) for t in ex)
            and isinstance(xe, list) and all(isinstance(t, str) and t for t in xe) and bo.get("universe_label")):
        errors.append("sources.tv_breadth.breakouts : extra (« type » ou « type/sous-type ») et extra_exchanges (bourses) en listes attendus")
    if load("sources")["tv_breadth"]["breakouts"].get("sort") not in ("dvol", "pct"):
        errors.append("sources.tv_breadth.breakouts : sort = \"dvol\" ou \"pct\" attendu")
    if not (0 < bo.get("candle_close_pct", -1) <= 100 and bo.get("candle_range_adr", -1) >= 0 and bo.get("candle_range_prev", -1) >= 0
            and bo.get("extended_pct", 0) > 0 and isinstance(bo.get("repeat_min"), int) and bo["repeat_min"] >= 1
            and isinstance(bo.get("repeat_sessions"), int) and 1 <= bo["repeat_sessions"] <= bo.get("keep_sessions", 0)
            and len(bo.get("lanes", [])) == 3 and len(bo.get("lanes_sub", [])) == 3 and bo.get("edge_note")):
        errors.append("sources.tv_breadth.breakouts : repères attendus (0 < candle_close_pct ≤ 100, candle_range_adr et candle_range_prev ≥ 0, "
                      "extended_pct > 0, repeat_min ≥ 1, 1 ≤ repeat_sessions ≤ keep_sessions, 3 lanes et 3 lanes_sub, edge_note)")
    if not (bo.get("ep_pct", 0) > 0 and bo.get("ep_vol_mult", 0) > 0 and bo.get("ep_min_price", -1) >= 0
            and isinstance(bo.get("ep_vol_sessions"), int) and 1 <= bo["ep_vol_sessions"] < load("industries")["output"]["sessions"]):
        errors.append("sources.tv_breadth.breakouts : EP attendu (ep_pct > 0, ep_vol_mult > 0, ep_min_price ≥ 0, "
                      "1 ≤ ep_vol_sessions < industries.output.sessions)")
    if not (isinstance(ti.get("delta"), int) and ti["delta"] >= 1 and 0 < ti.get("breadth_ref", -1) < 100):
        errors.append("display.ti65 : delta (entier ≥ 1) et 0 < breadth_ref < 100 attendus")
    if not (ind["universe"].get("market") and ind["universe"].get("type") and ind["universe"].get("scan_limit", 0) > 0
            and ind["output"].get("volume_unit", 0) >= 1 and isinstance(ind["output"].get("publish_all"), bool)
            and re.fullmatch(r"-{2}[a-z0-9-]+", ind["output"].get("extra_suffix", ""))):
        errors.append("industries : universe.market, universe.type, universe.scan_limit > 0 et output.volume_unit ≥ 1 attendus")
    if {k for k, _ in load("display")["sectors"]["views"]} != {"etf", "tv"}:
        errors.append("display.sectors.views : clés etf et tv attendues")
    u, ix = ind["universe"], ind["index"]
    if not (u["min_price"] > 0 and u["min_avg_volume"] >= 0 and u["avg_volume_sessions"] > 0 and u["min_market_cap"] >= 0
            and u["exchanges"] and u["subtype"]):
        errors.append("industries.universe : seuils positifs, bourses et sous-type attendus")
    if not (ix["base"] > 0 and 0 < ix["daily_return_clip"] and 1 <= ix["min_members"] <= ix["few_members"]):
        errors.append("industries.index : base > 0, plafond > 0 et 1 ≤ min_members ≤ few_members attendus")
    if not (ind["output"]["stock_sessions"] > ti["long"] and re.fullmatch(r"[a-z0-9_-]+", ind["output"]["folder"])):
        errors.append("industries.output : stock_sessions > ti65.long et dossier en minuscules sans / attendus")
    ld = ind.get("leaders", {})
    if not (all(isinstance(ld.get(k), int) and not isinstance(ld.get(k), bool) and ld[k] > 0
                for k in ("gain_pct", "sessions", "grappe_min", "list_sessions"))
            and isinstance(ld.get("grappe_ratio"), (int, float)) and ld["grappe_ratio"] >= 1
            and isinstance(ld.get("theme_share_pct"), (int, float)) and 0 < ld["theme_share_pct"] <= 100
            and ld["list_sessions"] < ind["output"]["stock_sessions"]):
        errors.append("industries.leaders : gain_pct, sessions, grappe_min, list_sessions entiers > 0, grappe_ratio ≥ 1, "
                      "0 < theme_share_pct ≤ 100 et list_sessions < output.stock_sessions attendus")
    etfs = {e["symbol"] for e in sectors()}
    names = [t.get("name") for t in themes()]
    for t in themes():
        tk = t.get("tickers", [])
        if not (t.get("name") and isinstance(tk, list) and len(tk) >= ix["min_members"] and len(set(tk)) == len(tk)
                and all(isinstance(x, str) and re.fullmatch(r"[A-Z][A-Z0-9.\-]*", x) for x in tk)
                and (t.get("etf") is None or t["etf"] in etfs)):
            errors.append(f"themes : « {t.get('name')} » : nom, au moins {ix['min_members']} symboles distincts en majuscules et etf de config/sectors.toml (facultatif) attendus")
    if len(set(names)) != len(names):
        errors.append("themes : noms en double")
    ac = load("display")["sectors"].get("actifs", {})
    phase_keys = {x.get("key") for x in load("display").get("phases", {}).get("phase", [])}
    if not (all(isinstance(ac.get(k), int) and not isinstance(ac.get(k), bool) and ac[k] > 0
                for k in ("fresh_sessions", "neuf_window", "old_sessions", "list_limit", "high_sessions", "chauds_shown", "trend_sessions",
                          "nine_window", "nine_min"))
            and 0 < ac.get("nine_share", 0) < ac.get("nine_intense", 0) <= 100
            and set(ac.get("alert_phases", [])) <= phase_keys
            and ac["fresh_sessions"] + ac["neuf_window"] <= ld.get("list_sessions", 0)
            and all(ac.get(k) for k in ("label", "leaders_label", "alert_text", "neuf_tip", "nine_tip", "reveil_label", "reveil_tip"))
            and isinstance(ac.get("refuges"), dict) and all(isinstance(v, list) and v for v in ac["refuges"].values())):
        errors.append("display.sectors.actifs : séances entières > 0, 0 < nine_share < nine_intense ≤ 100, alert_phases parmi les "
                      "phases, fresh_sessions + neuf_window ≤ leaders.list_sessions, libellés et familles refuges attendus")
    if "th" in load("display")["sectors"]["kpis"]["tiles"] and not themes():
        errors.append("display.sectors.kpis : case « th » sans thème dans config/themes.toml")
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
    for s_ in steps():                           # étape à passage séparé : son workflow existe et la lance
        wf = s_.get("separate")
        if wf and (not (WORKFLOWS / wf).exists() or s_["script"] not in (WORKFLOWS / wf).read_text()):
            errors.append(f"sources.{s_['name']} : workflow {wf} introuvable ou ne lance pas {s_['script']}")
    br = load("display").get("breadth", {})
    if not (all(isinstance(br.get(k), bool) for k in ("rm_log", "rq_log"))
            and isinstance(br.get("ratio_zone_alpha"), (int, float)) and not isinstance(br.get("ratio_zone_alpha"), bool)
            and 0 < br["ratio_zone_alpha"] <= 1):
        errors.append("display.breadth : rm_log et rq_log booléens, ratio_zone_alpha entre 0 (exclu) et 1 attendus")
    ph = load("display").get("phases", {})
    PH_KEYS = ["contraction", "wash", "recovery", "exp_c", "exp_b", "exp_a", "hot", "overheat", "shock"]
    num = lambda k: isinstance(ph.get(k), (int, float)) and not isinstance(ph.get(k), bool)
    pos_int = lambda k: isinstance(ph.get(k), int) and not isinstance(ph.get(k), bool) and ph[k] > 0
    keys = [x.get("key") for x in ph.get("phase", [])]
    if not (all(num(k) for k in ("choc_pct", "ext_on_r5", "ext_on_t2108", "ext_off_r5", "ext_off_t2108", "hot_r5", "hot_t2108",
                                  "grade_a_rm", "grade_b_rm", "wash_rm", "rep_r5", "pre_r5"))
            and all(pos_int(k) for k in ("choc_sessions", "mq_lag", "confirm", "rep_window", "pullback_lag", "record_sessions", "alert_gap"))
            and 0 < ph["choc_pct"] < 1 and ph["ext_off_r5"] <= ph["ext_on_r5"] <= ph["hot_r5"]
            and ph["ext_off_t2108"] <= ph["ext_on_t2108"] <= ph["hot_t2108"] and 0 < ph["grade_b_rm"] <= ph["grade_a_rm"]
            and isinstance(ph.get("pullback_r5"), list) and len(ph["pullback_r5"]) == 2 and ph["pullback_r5"][0] < ph["pullback_r5"][1]
            and sorted(keys) == sorted(PH_KEYS)
            and set(ph.get("pre_phases", [])) <= set(PH_KEYS) and set(ph.get("pullback_phases", [])) <= set(PH_KEYS)
            and all(re.fullmatch(r"#[0-9a-fA-F]{6}", x.get("color", "")) and x.get("name") and x.get("setups")
                    and isinstance(x.get("detail"), str) and x.get("rule") for x in ph["phase"])
            and ph.get("setups_label")
            and isinstance(ph.get("mq_lag_valid"), list) and len(ph["mq_lag_valid"]) == 2
            and ph["mq_lag_valid"][0] <= ph["mq_lag"] <= ph["mq_lag_valid"][1]
            and sorted(x.get("key") for x in ph.get("signal", [])) == sorted(["pre", "pullback", "sell_high", "sell_low", "rm_high"])
            and all(x.get("name") and x.get("tip") for x in ph["signal"])
            and pos_int("mq_spark") and isinstance(ph.get("mq_spark_label"), str) and ph["mq_spark_label"]
            and set(ph.get("lines", {})) <= set(PH_KEYS)
            and all(isinstance(e, list) and len(e) == 3 and e[0] in ("ratio5", "rm", "down4") and num(e[1])
                    and isinstance(e[2], str) and e[2] for v in ph.get("lines", {}).values() for e in v)):
        errors.append("display.phases : seuils numériques (ext_off ≤ ext_on ≤ hot, 0 < grade_b_rm ≤ grade_a_rm, 0 < choc_pct < 1), "
                      "séances entières > 0, mq_lag dans mq_lag_valid = [min, max] (réglage fragile), pullback_r5 = [bas, haut], une [[phases.phase]] par phase (" + ", ".join(PH_KEYS) +
                      ") avec name, color #rrggbb, setups, detail (texte, vide permis), rule, setups_label, et une [[phases.signal]] par signal (pre, pullback, sell_high, "
                      "sell_low, rm_high) avec name et tip, mq_spark entier > 0 et mq_spark_label, [phases.lines] : phases connues, entrées [ratio5 | rm | down4, "
                      "seuil numérique de [phases], libellé] attendus")
    site = load("storage").get("site", {})
    listed = set(site.get("required", [])) | set(site.get("optional", [])) | {d + "/" for d in site.get("dirs", [])}
    for s_ in steps():                           # tout fichier produit par une étape est publié
        for f in s_["restore"]:
            if f not in listed and not f.endswith(".csv"):
                errors.append(f"storage.site : {f} (étape {s_['name']}) absent de la liste des fichiers publiés")
    gen = load("storage").get("generated", {})
    for f in gen.get("files", []) + [d + "/" for d in gen.get("dirs", [])]:   # fichiers générés : publiés, jamais versionnés
        if f not in listed:
            errors.append(f"storage.generated : {f} absent de la liste des fichiers publiés ([site])")
        if "/" + f not in (HERE / ".gitignore").read_text().split():
            errors.append(f"storage.generated : /{f} absent de .gitignore (le fichier serait commité)")
    ind_out = load("industries")["output"]
    if ind_out["folder"] not in gen.get("dirs", []) or ind_out["tickers_file"] not in gen.get("files", []):
        errors.append("storage.generated : dossier et index de config/industries.toml [output] attendus")
    cache_paths = "\n".join(gen.get("files", []) + gen.get("dirs", []))
    for wf in sorted(WORKFLOWS.glob("*.yml")):   # les workflows qui publient passent tous par build_site.py
        text = wf.read_text()
        if "upload-pages-artifact" in text and ("build_site.py" not in text or re.search(r"\bcp\s+index\.html", text)):
            errors.append(f"{wf.name} : le site doit être préparé par build_site.py (liste unique config/storage.toml [site])")
        # mêmes chemins partout : le cache Actions n'est retrouvé qu'avec la même liste (sinon : version différente, cache absent)
        blocks = re.findall(r"path: \|\n((?:\s+\S.*\n)+?)\s+key: " + re.escape(gen.get("cache_prefix", "")), text)
        if "upload-pages-artifact" in text and gen and (not blocks or any("\n".join(x.strip() for x in b.strip().splitlines()) != cache_paths for b in blocks)):
            errors.append(f"{wf.name} : cache « {gen.get('cache_prefix')} » absent ou chemins différents de storage.generated "
                          f"(attendu, dans l'ordre : {', '.join(cache_paths.splitlines())})")
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
