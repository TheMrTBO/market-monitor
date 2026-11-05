#!/usr/bin/env python3
"""Test : relevés en séance (fetch_intraday.py), sans réseau (réponses du screener simulées).

Vérifie : choix du relevé selon l'heure de New York (heure d'hiver et d'été, tolérance, week-end, relevé imposé), refus hors
séance régulière et un jour férié (bougie d'une autre séance), formule TC2000 du soir appliquée telle quelle (volume > veille),
univers d'actions ordinaires, chiffres seuls (aucune liste de titres), écriture (relevé déjà pris = aucune
requête, --force, nouvelle séance = remise à zéro, premier passage = fichier vide), contrôle validate_data (aucune limite d'âge,
indépendant de la config), couverture des créneaux cron (mmconfig) et isolement (ni update_all.py, ni historique).
"""
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import fetch_intraday as fi      # noqa: E402
import mmconfig                  # noqa: E402
import update_all                # noqa: E402
import validate_data             # noqa: E402
from mm.store import importers    # noqa: E402

checks = {}


def check(label, cond):
    checks[label] = bool(cond)


utc = lambda *a: datetime(*a, tzinfo=timezone.utc)
MIN = fi.TV["min_stocks"]
BAR_1105 = int(utc(2026, 11, 5, 14, 30).timestamp())     # ouverture 9 h 30 à New York (heure d'hiver)


def row(name, close, prev, vol, vol1, sma=None, state="market", bar=BAR_1105, subtype="common", typ="stock", exch="NASDAQ"):
    r = {"close": close, f"SMA{fi.TV['sma']}": sma if sma is not None else close * 0.9, "subtype": subtype, "time": bar,
         "current_session": state, "close[1]": prev, "volume": vol, "volume[1]": vol1, "name": name, "type": typ, "exchange": exch}
    return [r.get(c) for c in fi.SCAN_COLS]


def market(n=MIN, state="market", bar=BAR_1105, extra=()):
    """n actions sans mouvement (au-dessus de leur SMA), plus les lignes `extra`."""
    return [row(f"F{i}", 10, 10, 200_000, 100_000, state=state, bar=bar) for i in range(n)] + list(extra)


# ---- choix du relevé
d, s = fi.due_slot(utc(2026, 11, 5, 17, 0))
check("heure d'hiver : 17:00 UTC = relevé de 12:00", (d, s) == ("2026-11-05", "12:00"))
d, s = fi.due_slot(utc(2026, 7, 15, 16, 5))
check("heure d'été : 16:05 UTC = relevé de 12:00", (d, s) == ("2026-07-15", "12:00"))
d, s = fi.due_slot(utc(2026, 11, 5, 20, 30))
check("heure d'hiver : 20:30 UTC = relevé de 15:30", s == "15:30")
d, s = fi.due_slot(utc(2026, 11, 5, 16, 59))
check("une minute avant le relevé : rien", d is None)
d, s = fi.due_slot(utc(2026, 11, 5, 17, fi.CFG["tolerance_minutes"]))
check("au-delà de la tolérance : rien", d is None)
d, s = fi.due_slot(utc(2026, 11, 7, 17, 0))
check("samedi : rien", d is None and "week-end" in s)
d, s = fi.due_slot(utc(2026, 11, 5, 3, 0), forced="15:30")
check("relevé imposé (--slot) : pris quelle que soit l'heure", s == "15:30" and d == "2026-11-04")
d, s = fi.due_slot(utc(2026, 11, 5, 17, 0), forced="13:37")
check("relevé imposé absent de la config : refusé", d is None)

# ---- mesure
now = utc(2026, 11, 5, 17, 0)
movers = [row("UPBIG", 11, 10, 5_000_000, 1_000_000), row("UPSMALL", 10.5, 10, 300_000, 200_000),
          row("UPLOWVOL", 11, 10, 300_000, 400_000),            # volume ≤ veille : hors formule TC2000
          row("UPTINY", 11, 10, 50_000, 10_000),                 # volume < minimum : hors formule
          row("DOWN1", 9, 10, 900_000, 100_000),
          row("ADR1", 12, 10, 9_000_000, 100_000, subtype="", typ="dr"),   # ADR : hors du ±4 % (comme le soir)
          row("UP3", 10.3, 10, 900_000, 100_000)]                # +3 % : sous le seuil
snap, why = fi.measure(market(extra=movers), "2026-11-05", "12:00", now)
check("en séance : relevé écrit", snap is not None and snap["slot"] == "12:00")
check("formule TC2000 du soir : volume ≤ veille, petit volume, +3 % et ADR exclus", snap["up4"] == 2 and snap["down4"] == 1)
check("chiffres seuls : aucune liste de titres dans le relevé", set(snap) == {"slot", "at", "data_at", "n", "t2108", "up4", "down4"})
check("T2108 sur les actions ordinaires seulement", snap["n"] == MIN + 6 and 0 <= snap["t2108"] <= 100)
check("heure des données = relevé − différé", snap["data_at"] == "11:45")
snap, why = fi.measure(market(state="post_market"), "2026-11-05", "15:30", now)
check("hors séance régulière : rien n'est écrit", snap is None and "post_market" in why)
snap, why = fi.measure(market(bar=int(utc(2026, 11, 4, 14, 30).timestamp())), "2026-11-05", "12:00", now)
check("jour férié (bougie de la veille) : rien n'est écrit", snap is None and "férié" in why)
snap, why = fi.measure(market(n=10), "2026-11-05", "12:00", now)
check("réponse trop courte : rien n'est écrit", snap is None and "minimum" in why)
many = [row(f"U{i:03d}", 11, 10, 1_000_000 + i, 100_000) for i in range(500)]
snap, why = fi.measure(market(extra=many), "2026-11-05", "12:00", now)
check("comptes entiers (500 hausses)", snap["up4"] == 500 and snap["down4"] == 0)

# ---- écriture (main), dans un dossier temporaire
calls = []
real_screener = fi.screener


real_long, real_indices = fi.long_values, fi.indices
LONG = {"up25m": 150, "down25m": 290, "up25q": 700, "down25q": 1400, "t2108": 43.9, "n": 5100}
IDX = {"QQQ": [683.12, 683.65, 651.91, 652.49, 38379308], "IWM": [283.75, 284.7, 275.37, 275.43, 12549138]}


def run(at, items, *argv, long=(LONG, None), idx=IDX):
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return at

    def indices(day):
        if isinstance(idx, Exception):
            raise idx
        return idx
    fi.datetime, saved = Clock, fi.datetime
    fi.screener = lambda: calls.append(at) or items
    fi.long_values, fi.indices = (lambda items, day: long), indices
    try:
        return fi.main(list(argv))
    finally:
        fi.datetime, fi.screener, fi.long_values, fi.indices = saved, real_screener, real_long, real_indices


with tempfile.TemporaryDirectory() as tmp:
    fi.OUT = out = Path(tmp) / "intraday_data.js"
    run(utc(2026, 11, 5, 15, 0), market())
    data = validate_data.load_js(out)
    check("premier passage hors relevé : fichier vide, aucune requête", data["date"] is None and data["snaps"] == [] and not calls)
    check("fichier vide : valide", validate_data.validate("intraday", out, date(2026, 11, 5)) == [])
    run(utc(2026, 11, 5, 17, 2), market(extra=movers))
    data = validate_data.load_js(out)
    check("relevé de 12:00 écrit", data["date"] == "2026-11-05" and [s["slot"] for s in data["snaps"]] == ["12:00"] and len(calls) == 1)
    check("valeurs maison (±25 %, T2108, n) et bougies partielles des indices écrites", data["snaps"][0]["long"] == LONG and data["snaps"][0]["idx"] == IDX)
    check("règle de la formule écrite dans le fichier (affichée par le site)", data["rule"] == {"pct": fi.THRESHOLD, "min_volume": fi.MIN_VOL})
    check("relevé valide", validate_data.validate("intraday", out, date(2026, 11, 5)) == [])
    before = out.read_text()
    run(utc(2026, 11, 5, 17, 30), market())
    check("relevé déjà pris (nouvel essai +30 min) : aucune requête, fichier inchangé", len(calls) == 1 and out.read_text() == before)
    run(utc(2026, 11, 5, 17, 30), market(), "--slot", "12:00", "--force")
    data = validate_data.load_js(out)
    check("--force : relevé repris", len(calls) == 2 and data["snaps"][0]["up4"] == 0)
    from io import StringIO
    from contextlib import redirect_stdout
    buf = StringIO()
    with redirect_stdout(buf):
        run(utc(2026, 11, 5, 20, 31), market(), "--due")
    check("--due : relevé de 15:30 à prendre", buf.getvalue().strip() == "due=true" and len(calls) == 2)
    buf = StringIO()
    with redirect_stdout(buf):
        run(utc(2026, 11, 5, 17, 31), market(), "--due")
    check("--due : relevé déjà pris, sans requête", buf.getvalue().strip() == "due=false" and len(calls) == 2)
    buf = StringIO()
    with redirect_stdout(buf):
        run(utc(2026, 11, 5, 14, 0), market(), "--due")
    check("--due : hors des relevés", buf.getvalue().strip() == "due=false")
    run(utc(2026, 11, 5, 20, 31), market(extra=movers), long=(None, "cache absent"), idx=RuntimeError("TradingView injoignable"))
    data = validate_data.load_js(out)
    check("sans cache Polygon ni indices : relevé écrit avec le ±4 % et le T2108 TradingView seuls",
          "long" not in data["snaps"][-1] and "idx" not in data["snaps"][-1] and data["snaps"][-1]["up4"] == 2)
    check("relevé de 15:30 ajouté après celui de 12:00", [s["slot"] for s in data["snaps"]] == ["12:00", "15:30"])
    before = out.read_text()
    run(utc(2026, 11, 5, 20, 31), market(state="post_market"), "--slot", "15:30", "--force")
    check("relevé refusé (hors séance) : fichier inchangé", out.read_text() == before)
    run(utc(2026, 11, 6, 17, 1), market(bar=int(utc(2026, 11, 6, 14, 30).timestamp())))
    data = validate_data.load_js(out)
    check("nouvelle séance : relevés de la veille effacés", data["date"] == "2026-11-06" and [s["slot"] for s in data["snaps"]] == ["12:00"])
    check("relevé vieux de 30 jours : toujours valide (simplement plus affiché)", validate_data.validate("intraday", out, date(2026, 12, 6)) == [])
    check("séance dans le futur : invalide", validate_data.validate("intraday", out, date(2026, 11, 1)) != [])
    text = out.read_text()
    out.write_text(text.replace('"slot":"12:00"', '"slot":"09:41"'))
    check("heure absente de la config : toujours valide (changer la config n'invalide pas le fichier publié)",
          validate_data.validate("intraday", out, date(2026, 11, 6)) == [])
    out.write_text(text.replace('"up4":0', '"up4":-3', 1))
    check("compte négatif : invalide", validate_data.validate("intraday", out, date(2026, 11, 6)) != [])
    out.write_text(text.replace('"t2108":', '"t2108":1', 1))
    check("T2108 hors bornes : invalide", validate_data.validate("intraday", out, date(2026, 11, 6)) != [])
    out.write_text(text.replace('"t2108":43.9', '"t2108":143.9', 1))
    check("valeur maison hors bornes : invalide", '"t2108":43.9' in text and validate_data.validate("intraday", out, date(2026, 11, 6)) != [])
    out.write_text(text.replace('652.49', '700.0', 1))
    check("bougie partielle incohérente (dernier > plus haut) : invalide", validate_data.validate("intraday", out, date(2026, 11, 6)) != [])
    out.write_text("window.INTRADAY = {")
    check("fichier illisible : invalide", validate_data.validate("intraday", out, date(2026, 11, 6)) != [])
    out.unlink()
    check("fichier absent (pas encore produit) : pas une erreur", validate_data.validate("intraday", out, date(2026, 11, 6)) == [])

# ---- valeurs maison et bougies des indices (sans réseau)
import breadth_soir as bs                       # noqa: E402
import fetch_postmarket as fp                   # noqa: E402
saved = bs.recent_history, bs.provisional, fp.scan
bs.recent_history = lambda: (_ for _ in ()).throw(bs.Stale("univers introuvable"))
vals, why = fi.long_values(market(), "2026-11-05")
check("valeurs maison : cache Polygon absent → aucune valeur, raison donnée", vals is None and "univers" in why)
bs.recent_history = lambda: ([], {}, set(), {})
bs.provisional = lambda day, snap, dates, history, universe, splits: {**LONG, "splits": 2}
vals, why = fi.long_values(market(), "2026-11-05")
check("valeurs maison : calcul du soir (breadth_soir.provisional) repris tel quel", vals == LONG)
bar = int(utc(2026, 11, 5, 14, 30).timestamp())
fp.scan = lambda payload: [{"s": "NASDAQ:QQQ", "d": [683.12, 683.65, 651.91, 652.49, 38379308, bar, "market"]},
                           {"s": "AMEX:IWM", "d": [283.75, 284.7, 275.37, 275.43, 12549138, bar - 86400, "market"]}]
check("indices : bougie du jour seulement (IWM d'hier ignoré)", fi.indices("2026-11-05") == {"QQQ": IDX["QQQ"]})
fp.scan = lambda payload: [{"s": "NASDAQ:QQQ", "d": [683.12, 683.65, 651.91, 700.0, 38379308, bar, "market"]}]
check("indices : bougie incohérente ignorée", fi.indices("2026-11-05") == {})
fp.scan = lambda payload: [{"s": "CBOE:VIX", "d": [17.14, 28.09, 16.7, 25.26, None, int(utc(2026, 11, 5, 8, 15).timestamp()), "market"]}]
check("VIX : bougie du jour (ouverte à 3 h 15 à New York), sans volume", fi.indices("2026-11-05") == {"VIX": [17.14, 28.09, 16.7, 25.26, None]})
bs.recent_history, bs.provisional, fp.scan = saved

# ---- créneaux (mmconfig) et isolement
NY = fi.NY
check("créneaux de config/schedule.toml : chaque relevé couvert, hiver et été",
      mmconfig.intraday_uncovered([mmconfig.load("schedule")["workflows"]["intraday"]["cron_job_org"]], fi.CFG["snapshots"],
                                  fi.CFG["tolerance_minutes"], NY, 2026) == [])
miss = mmconfig.intraday_uncovered(["0 16 * * 1-5", "30 19 * * 1-5"], ["12:00", "15:30"], 40, NY, 2026)
check("créneaux d'été seulement : relevés d'hiver signalés", miss and all("-01-" in m for m in miss))
check("cron : jour de semaine (samedi oui, dimanche non)",
      mmconfig.cron_hits("7 1 * * 2-6", utc(2026, 11, 7, 1, 7)) and not mmconfig.cron_hits("7 1 * * 2-6", utc(2026, 11, 8, 1, 7)))
check("pas lancé par update_all.py (workflow séparé)", "intraday" not in [s[0] for s in update_all.STEPS])
datasets = (ROOT / "config" / "datasets.toml").read_text()
check("jamais écrit dans l'historique (absent de config/datasets.toml et des imports de mm/store)",
      "intraday" not in datasets and fi.OUT.name not in importers.SOURCES)
check("publié sur le site (fichier optionnel)", fi.OUT.name in mmconfig.load("storage")["site"]["optional"])

failed = [k for k, v in checks.items() if not v]
for k, v in checks.items():
    print(("ok     " if v else "ECHEC  ") + k)
print(f"{len(checks) - len(failed)}/{len(checks)} vérifications passées")
sys.exit(1 if failed else 0)
