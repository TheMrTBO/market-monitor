#!/usr/bin/env python3
"""Stockage historique (mm/store, backend git_csv), sans réseau, dans un dossier temporaire :
contrôle des types, upsert idempotent, aucune suppression, partitions, relecture exacte, lot invalide sans écriture,
reprise des *_data.js du dépôt (comptes identiques) et règle « liste finale = dernier relevé » du post-market."""
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from mm.store import SchemaError, open_store                     # noqa: E402
from mm.store.importers import from_js_files, load_js           # noqa: E402

fails = 0


def check(label, cond):
    global fails
    print(("ok     " if cond else "ECHEC  ") + label)
    fails += not cond


def raises(fn):
    try:
        fn()
    except SchemaError:
        return True
    return False


with tempfile.TemporaryDirectory() as tmp:
    st = open_store(tmp)
    vix = lambda d, c: {"session_date": d, "open": 15.0, "high": 16.0, "low": 14.5, "close": c}
    r = st.upsert("vix_daily", [vix("2026-09-30", 15.1), vix("2026-10-01", 15.2)])
    check("insertion : 2 nouvelles lignes", r == {"inserted": 2, "updated": 0, "unchanged": 0})
    check("partition mensuelle : 2 fichiers", sorted(p.name for p in Path(tmp, "vix_daily").glob("*/*.csv")) == ["2026-09.csv", "2026-10.csv"])
    f = Path(tmp, "vix_daily/2026/2026-10.csv"); before = f.read_text()
    r = st.upsert("vix_daily", [vix("2026-10-01", 15.2)])
    check("idempotent : même ligne = inchangée, fichier identique", r["unchanged"] == 1 and f.read_text() == before)
    r = st.upsert("vix_daily", [vix("2026-10-01", 15.3), vix("2026-10-02", 15.4)])
    check("upsert : 1 modifiée, 1 nouvelle", r == {"inserted": 1, "updated": 1, "unchanged": 0})
    check("aucune suppression : 3 lignes", st.count("vix_daily") == 3)
    rows = st.read("vix_daily", since="2026-10-01")
    check("lecture filtrée et typée", [x["close"] for x in rows] == [15.3, 15.4] and isinstance(rows[0]["close"], float))
    check("dernière date", st.latest("vix_daily") == "2026-10-02")
    check("valeur exacte relue (0,1 + 0,2)", (st.upsert("vix_daily", [vix("2026-10-05", 0.1 + 0.2)]) and st.read("vix_daily", since="2026-10-05")[0]["close"] == 0.1 + 0.2))
    check("colonne inconnue refusée", raises(lambda: st.upsert("vix_daily", [dict(vix("2026-10-06", 1), foo=1)])))
    check("type faux refusé (date)", raises(lambda: st.upsert("vix_daily", [vix("06/10/2026", 1)])))
    check("valeur obligatoire manquante refusée", raises(lambda: st.upsert("vix_daily", [vix("2026-10-06", None)])))
    n = st.count("vix_daily")
    check("lot invalide : rien n'est écrit", raises(lambda: st.upsert("vix_daily", [vix("2026-10-07", 1), vix("bad", 1)])) and st.count("vix_daily") == n)
    check("doublon de clé dans un lot refusé", raises(lambda: st.upsert("vix_daily", [vix("2026-10-08", 1), vix("2026-10-08", 2)])))
    st.upsert("stockbee_daily", [{"session_date": "2026-10-01", "up4": 300, "down4": None}])
    check("valeur absente autorisée (« ? ») relue comme absente", st.read("stockbee_daily")[0]["down4"] is None)

    # post-market : deux relevés de la même séance ; un titre sort du scan au second relevé
    pm = lambda at, rows: {"cols": ["t", "s", "n", "sec", "ind", "c", "ch", "pc", "pch", "pv", "rv", "cap", "flt", "er", "nx", "ng"],
                           "snaps": [{"d": "2026-10-13", "at": at, "closed": False, "rows": rows}]}
    row = lambda t, pch: ["NASDAQ:" + t, t, t + " Inc.", "Finance", "Banks", 10, 1, 11, pch, 200000, 1.2, 2e9, 5e7, "", None, None]
    from mm.store import importers
    for at, rows in (("2026-10-13T20:22:00+00:00", [row("AAA", 9.0), row("BBB", 5.0)]), ("2026-10-13T23:52:00+00:00", [row("BBB", 6.0)])):
        for ds, rws in importers.postmarket(pm(at, rows)).items():
            st.upsert(ds, rws)
    scan = st.read("postmarket_scan")
    last = max(x["taken_at"] for x in scan)
    final = sorted(x["ticker"] for x in scan if x["taken_at"] == last)
    check("chaque relevé conservé (3 lignes, 2 relevés)", len(scan) == 3 and len({x["taken_at"] for x in scan}) == 2)
    check("liste finale = dernier relevé : AAA (sorti du scan) absent", final == ["NASDAQ:BBB"])

with tempfile.TemporaryDirectory() as tmp:                        # reprise des fichiers publiés du dépôt
    st = open_store(tmp)
    rep = from_js_files(st, ROOT)
    sb = load_js(ROOT / "stockbee_data.js")
    pr = load_js(ROOT / "prices_data.js")
    check("reprise Stockbee : autant de lignes que de séances", st.count("stockbee_daily") == len(sb["rows"]))
    check("reprise prix : QQQ + IWM + BTC", st.count("prices_daily") == sum(len(v) for v in pr.values()))
    q = st.read("prices_daily", since=pr["QQQ"][-1][0], until=pr["QQQ"][-1][0])
    check("reprise prix : dernière clôture QQQ identique", any(x["symbol"] == "QQQ" and x["close"] == pr["QQQ"][-1][4] for x in q))
    rep2 = from_js_files(st, ROOT)
    check("reprise relancée : rien de nouveau ni de modifié", all(v["inserted"] == 0 and v["updated"] == 0 for v in rep2.values()))

sys.exit(1 if fails else 0)
