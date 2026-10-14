#!/usr/bin/env python3
"""Stockage privé (suivis post-market), sans réseau : séparation stricte public / privé, et contrat de format entre le site
(navigateur, qui écrit le dépôt privé) et mm/store : le fichier de référence tests/fixtures/postmarket_watch_2026-10.csv,
au format exact produit par le site, est relu par mm/store puis réécrit à l'octet près."""
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from mm.store import SchemaError, open_store                     # noqa: E402

FIX = ROOT / "tests" / "fixtures" / "postmarket_watch_2026-10.csv"
fails = 0


def check(label, cond):
    global fails
    print(("ok     " if cond else "ECHEC  ") + label)
    fails += not cond


with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    # 1) stockage public : le jeu privé y est inconnu, et n'apparaît ni dans les schémas ni dans le README
    pub = open_store(root=tmp / "public")
    try:
        pub.upsert("postmarket_watch", [{"symbol": "LQDA", "session_date": "2026-10-13", "deleted": False, "updated_at": "2026-10-14T09:00:00Z"}])
        check("public : écriture d'un jeu privé refusée", False)
    except SchemaError:
        check("public : écriture d'un jeu privé refusée", True)
    pub.write_meta()
    check("public : aucun schéma ni mention du jeu privé", not (tmp / "public" / "_schema" / "postmarket_watch.json").exists()
          and "postmarket_watch" not in (tmp / "public" / "README.md").read_text())
    check("public : aucun fichier du jeu privé", not (tmp / "public" / "postmarket_watch").exists())

    # 2) stockage privé : dossier obligatoire, ne voit que les jeux privés
    try:
        open_store(private=True)
        check("privé : dossier obligatoire", False)
    except ValueError:
        check("privé : dossier obligatoire", True)
    priv = open_store(root=tmp / "prive", private=True)
    try:
        priv.dataset("prices_daily")
        check("privé : jeux publics invisibles", False)
    except SchemaError:
        check("privé : jeux publics invisibles", True)

    # 3) contrat de format : fichier écrit par le site relu par mm/store, puis réécrit à l'identique
    dest = tmp / "prive" / "postmarket_watch" / "2026" / "2026-10.csv"
    dest.parent.mkdir(parents=True)
    shutil.copy(FIX, dest)
    rows = priv.read("postmarket_watch")
    by = {r["symbol"]: r for r in rows}
    check("relecture : 4 suivis triés par clé", [r["symbol"] for r in rows] == ["AEHL", "BRK.B", "LQDA", "XYZ"])
    check("relecture : note avec virgule et guillemets", by["AEHL"]["note"] == '+150 %, sans news "à vérifier"')
    check("relecture : types (bool, float, absent)", by["XYZ"]["deleted"] is True and by["BRK.B"]["close"] == 500.0
          and by["LQDA"]["note"] is None and by["XYZ"]["tag"] is None)
    stats = priv.upsert("postmarket_watch", rows)
    check("réécriture par mm/store : aucune ligne modifiée", stats == {"inserted": 0, "updated": 0, "unchanged": 4})
    check("réécriture par mm/store : fichier identique à l'octet", dest.read_bytes() == FIX.read_bytes())
    priv.write_meta()
    check("privé : schéma du jeu privé et README privé", (tmp / "prive" / "_schema" / "postmarket_watch.json").exists()
          and "données privées" in (tmp / "prive" / "README.md").read_text()
          and not (tmp / "prive" / "_schema" / "prices_daily.json").exists())

print("tout est bon" if not fails else f"{fails} échec(s)")
sys.exit(1 if fails else 0)
