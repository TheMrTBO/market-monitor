#!/usr/bin/env python3
"""Test : T2108 relevé sur le screener TradingView (fetch_tv_breadth.py), sans réseau (réponses simulées).

Vérifie : séance = date de la bougie journalière (juste un jour férié), refus en séance ou en pre-market, refus pendant
le différé de fin de séance, filtre des actions ordinaires, calcul du pourcentage, réponse trop courte refusée, écriture
(un relevé par séance, remplacé s'il est refait) et contrôle validate_data.
"""
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import fetch_tv_breadth as tb    # noqa: E402
import validate_data             # noqa: E402

checks = {}


def check(label, cond):
    checks[label] = bool(cond)


MIN = tb.CFG["min_stocks"]
BAR_1019 = int(datetime(2026, 10, 19, 13, 30, tzinfo=timezone.utc).timestamp())   # ouverture 9 h 30 à New York


def rows(n_above, n_below, state="post_market", bar=BAR_1019, extra=()):
    # colonnes : close, SMA40, subtype, time, current_session
    return ([[11, 10, "common", bar, state]] * n_above + [[9, 10, "common", bar, state]] * n_below + list(extra))


utc = lambda *a: datetime(*a, tzinfo=timezone.utc)
half = MIN // 2 + 1
day, res = tb.measure(rows(half, half), utc(2026, 10, 19, 21, 0))                 # 17 h à New York
check("après la clôture + différé : séance du 19/10 relevée", day == "2026-10-19" and res[:2] == (50.0, 2 * half))
day, res = tb.measure(rows(half, half), utc(2026, 10, 19, 20, 10))                # 16 h 10 : différé de 15 min pas écoulé
check("pendant le différé de fin de séance : refusé", day is None and "pas encore close" in res)
day, res = tb.measure(rows(half, half, state="market"), utc(2026, 10, 20, 15, 0))
check("en séance régulière : refusé", day is None and "market" in res)
day, res = tb.measure(rows(half, half, state="pre_market"), utc(2026, 10, 20, 9, 0))
check("en pre-market : refusé", day is None)
day, res = tb.measure(rows(half, half, state="out_of_session"), utc(2026, 10, 20, 7, 40))   # nuit suivante
check("la nuit suivante : toujours la séance du 19/10", day == "2026-10-19")
day, res = tb.measure(rows(half, half, state="out_of_session"), utc(2026, 11, 27, 3, 0))     # jour férié : bougie inchangée
check("jour férié : la séance relevée reste celle de la bougie", day == "2026-10-19")
pref = [[50, 10, "preferred", BAR_1019, "post_market"]] * 500
day, res = tb.measure(rows(half, half, extra=pref), utc(2026, 10, 19, 21, 0))
check("actions privilégiées exclues du calcul", res[:2] == (50.0, 2 * half))
day, res = tb.measure(rows(10, 10), utc(2026, 10, 19, 21, 0))
check("réponse trop courte : refusée", day is None and "minimum" in res)
nulls = [[None, 10, "common", BAR_1019, "post_market"], [11, None, "common", BAR_1019, "post_market"]] * 50
day, res = tb.measure(rows(half, half, extra=nulls), utc(2026, 10, 19, 21, 0))
check("titres sans clôture ou sans SMA 40 : ignorés", res[:2] == (50.0, 2 * half))

# ±4 % : formule TC2000 de breadth_own (≥ +4 % ou ≤ −4 %, volume ≥ 100 000 et supérieur à la veille)
P = "post_market"
pm = [[10.4, 10, "common", BAR_1019, P, 10.0, 200_000, 100_000],    # +4 %, volume en hausse : compté en hausse
      [10.39, 10, "common", BAR_1019, P, 10.0, 200_000, 100_000],   # +3,9 % : non
      [9.6, 10, "common", BAR_1019, P, 10.0, 200_000, 100_000],     # −4 % : compté en baisse
      [11.0, 10, "common", BAR_1019, P, 10.0, 90_000, 50_000],      # volume < 100 000 : non
      [11.0, 10, "common", BAR_1019, P, 10.0, 200_000, 300_000],    # volume en baisse sur la veille : non
      [11.0, 10, "common", BAR_1019, P, None, 200_000, 100_000]]    # pas de clôture de la veille : ignoré
day, res = tb.measure(rows(half, half) + pm, utc(2026, 10, 19, 21, 0))
check("±4 % : formule TC2000 (+1 / −1 ; seuil, volume minimal, volume en hausse, veille absente)", res[2:] == (1, 1))
day, res = tb.measure(rows(half, half), utc(2026, 10, 19, 21, 0))
check("±4 % : réponse sans close[1] / volume[1] : None (T2108 seul)", res[2:] == (None, None) and res[0] == 50.0)

with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp) / "tv_breadth_data.js"
    tb.write_js([["2026-10-16", 30.1, 5120], ["2026-10-19", 27.41, 5129]], "2026-10-20T07:40:29+00:00", out)
    old = tb.load_existing(out)
    check("relecture : séances gardées", list(old) == ["2026-10-16", "2026-10-19"])
    check("contrôle : fichier valide accepté", validate_data.validate("tv_breadth", out, date(2026, 10, 20)) == [])
    tb.write_js([["2026-10-19", 120, 5129]], None, out)
    check("contrôle : T2108 > 100 refusé", validate_data.validate("tv_breadth", out, date(2026, 10, 20)) != [])
    tb.write_js([], None, out)
    check("contrôle : fichier vide (premier passage hors fenêtre) accepté", validate_data.validate("tv_breadth", out, date(2026, 10, 20)) == [])
    tb.write_js([["2026-10-16", 30.1, 5120], ["2026-10-19", 27.41, 5129, 161, 173]], None, out)
    d = validate_data.load_js(out)
    check("ancienne ligne (3 colonnes) complétée à 5, contrôle accepté", d["columns"][-2:] == ["up4", "down4"]
          and d["rows"][0] == ["2026-10-16", 30.1, 5120, None, None] and validate_data.validate("tv_breadth", out, date(2026, 10, 20)) == [])
    tb.write_js([["2026-10-19", 27.41, 5129, -3, 173]], None, out)
    check("contrôle : ±4 % négatif refusé", validate_data.validate("tv_breadth", out, date(2026, 10, 20)) != [])

# passages répétés (postmarket.yml : toutes les 15 min le soir) : un relevé identique ne réécrit pas le fichier, sinon
# chaque passage produirait un commit et un déploiement du site
import types
fake = types.ModuleType("fetch_postmarket")
items = [{"d": r} for r in rows(half, half, state="out_of_session")]
fake.scan = lambda payload: items
sys.modules["fetch_postmarket"] = fake
with tempfile.TemporaryDirectory() as tmp:
    tb.OUT = Path(tmp) / "tv_breadth_data.js"
    tb.main()
    first = tb.OUT.read_text()
    tb.main()
    check("relevé identique : fichier inchangé (pas de commit à chaque passage)", tb.OUT.read_text() == first and '"2026-10-19",50.0' in first)
    items[0] = {"d": [9, 10, "common", BAR_1019, "out_of_session"]}          # une valeur change : nouveau relevé écrit
    tb.main()
    check("relevé différent : fichier réécrit", tb.OUT.read_text() != first)

for label, ok in checks.items():
    print(("ok     " if ok else "ECHEC  ") + label)
sys.exit(0 if all(checks.values()) else 1)
