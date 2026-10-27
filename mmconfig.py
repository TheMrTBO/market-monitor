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
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG = HERE / "config"
JS = HERE / "config_data.js"
WORKFLOWS = HERE / ".github" / "workflows"
FILES = ("market", "schedule", "sources", "postmarket", "display", "sectors", "industries", "themes", "short", "datasets", "storage")
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
        "colors": d["colors"],
        "sectors": {"groups": d["sectors"]["groups"], "views": d["sectors"]["views"], "group_tips": d["sectors"]["group_tips"],
                    "kpis": d["sectors"]["kpis"], "rrg": d["sectors"]["rrg"], "actifs": d["sectors"]["actifs"],
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
    if not kp["tiles"] or set(kp["tiles"]) - {"ind", "sec", "rot", "rr", "stk", "th"} or len(set(kp["tiles"])) != len(kp["tiles"]) \
            or not (isinstance(kp["rotation_window"], int) and kp["rotation_window"] > 0) or not kp["record_sessions"] > 1 \
            or not (isinstance(kp.get("rotation_ratio_sessions"), int) and kp["rotation_ratio_sessions"] > 0) \
            or not (len(rr) == 2 and 0 < rr[0] <= rr[1]) or not 0 < kp.get("breadth_mid", -1) < 100 or not kp.get("benchmark"):
        errors.append("display.sectors.kpis : tiles parmi ind, sec, rot, rr, stk, th (sans doublon), rotation_window, record_sessions, "
                      "rotation_ratio_sessions entier > 0, rotation_ratio = [bas, haut] croissant, breadth_mid entre 0 et 100 et benchmark attendus")
    ad = load("display")["adr"]
    if not (isinstance(ad.get("sessions"), int) and ad["sessions"] > 1 and ad.get("step", 0) > 0):
        errors.append("display.adr : sessions entier > 1 et step > 0 attendus")
    elif ad["sessions"] > load("industries")["output"]["stock_sessions"]:
        errors.append("display.adr.sessions : plus de séances que les fichiers d'actions n'en contiennent (industries.output.stock_sessions)")
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
    if not (isinstance(ti.get("spark"), int) and 2 <= ti["spark"] <= ti["long"]) or not ti.get("spark_label"):
        errors.append("display.ti65.spark : entier entre 2 et long attendu, avec spark_label")
    if ti.get("spark", 0) + ti["long"] - 1 > ind["output"]["stock_sessions"]:
        errors.append("display.ti65.spark : la miniature des actions demande spark + long − 1 séances ≤ industries.output.stock_sessions")
    hist = load("sources").get("history", {})
    if not (isinstance(hist.get("sessions"), int) and hist["sessions"] <= hist.get("keep", 0) and hist.get("rate", 0) > 0
            and isinstance(hist.get("max_downloads"), int) and hist["max_downloads"] >= 0):
        errors.append("sources.history : sessions (entier) ≤ keep, rate > 0 et max_downloads (entier ≥ 0) attendus")
    elif hist["max_downloads"] and hist["max_downloads"] / hist["rate"] > 40:
        errors.append("sources.history : max_downloads / rate dépasse 40 min (un passage du robot doit rester court)")
    elif ind["output"]["stock_sessions"] > hist["sessions"]:
        errors.append("industries.output.stock_sessions dépasse sources.history.sessions (historique Polygon téléchargé)")
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
                for k in ("fresh_sessions", "neuf_window", "old_sessions", "list_limit", "pioneer_window", "high_sessions", "chauds_shown", "trend_sessions"))
            and isinstance(ac.get("pioneer_gain_pct"), (int, float)) and ac["pioneer_gain_pct"] > ld.get("gain_pct", 0)
            and set(ac.get("alert_phases", [])) <= phase_keys
            and ac["fresh_sessions"] + ac["neuf_window"] <= ld.get("list_sessions", 0)
            and all(ac.get(k) for k in ("label", "leaders_label", "alert_text", "neuf_tip", "pioneer_tip"))
            and isinstance(ac.get("refuges"), dict) and all(isinstance(v, list) and v for v in ac["refuges"].values())):
        errors.append("display.sectors.actifs : séances entières > 0, pioneer_gain_pct > leaders.gain_pct, alert_phases parmi les "
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
            and all(x.get("name") and x.get("tip") for x in ph["signal"])):
        errors.append("display.phases : seuils numériques (ext_off ≤ ext_on ≤ hot, 0 < grade_b_rm ≤ grade_a_rm, 0 < choc_pct < 1), "
                      "séances entières > 0, mq_lag dans mq_lag_valid = [min, max] (réglage fragile), pullback_r5 = [bas, haut], une [[phases.phase]] par phase (" + ", ".join(PH_KEYS) +
                      ") avec name, color #rrggbb, setups, detail (texte, vide permis), rule, setups_label, et une [[phases.signal]] par signal (pre, pullback, sell_high, "
                      "sell_low, rm_high) avec name et tip attendus")
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
