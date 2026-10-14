#!/usr/bin/env python3
"""Synchronisation vers la branche `data` (mm/store/sync.py) sur de vrais dépôts Git temporaires (sans réseau) :
premier passage poussé, second passage sans commit, journal `runs`, et course entre deux écrivains (push refusé →
reprise depuis la dernière version, aucune donnée perdue, aucun doublon)."""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import mm.store.sync as sync_mod                                  # noqa: E402
from mm.store import open_store                                   # noqa: E402

os.environ.update(GIT_AUTHOR_NAME="test", GIT_AUTHOR_EMAIL="test@example.invalid",
                  GIT_COMMITTER_NAME="test", GIT_COMMITTER_EMAIL="test@example.invalid")
fails = 0


def check(label, cond):
    global fails
    print(("ok     " if cond else "ECHEC  ") + label)
    fails += not cond


def git(cwd, *a):
    return subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def clone(bare, dest):
    git(dest.parent, "clone", "--quiet", "--branch", "data", str(bare), dest.name)
    return dest


with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    bare = tmp / "origin.git"
    git(tmp, "init", "--quiet", "--bare", str(bare))
    seed = tmp / "seed"; seed.mkdir()
    git(seed, "init", "--quiet", "-b", "data"); (seed / "README.md").write_text("x\n")
    git(seed, "add", "-A"); git(seed, "commit", "--quiet", "-m", "init"); git(seed, "remote", "add", "origin", str(bare))
    git(seed, "push", "--quiet", "origin", "data")

    # dossier source : les *_data.js du dépôt + un status_data.js de passage (journal runs)
    src = tmp / "src"; src.mkdir()
    for f in ("stockbee_data.js", "vix_data.js", "postmarket_data.js"):
        (src / f).write_text((ROOT / f).read_text())
    status = {"started": "2026-10-14T22:17:05+00:00", "updated": "2026-10-14T22:18:00+00:00",
              "sources": {"stockbee": {"ok": True, "attempts": 1, "last": "2026-10-13", "duration": 7.2},
                          "breadth": {"ok": False, "attempts": 1, "last": "2026-10-12", "error": "x", "duration": 4.0}}}
    (src / "status_data.js").write_text("window.STATUS = " + json.dumps(status) + ";\n")

    a = clone(bare, tmp / "a")
    rc = sync_mod.sync(src, a, run_id="111-1", message="passage 1", wait=0)
    head = git(tmp / "seed", "ls-remote", str(bare), "data").split()[0]
    check("1er passage : poussé sur data", rc == 0 and git(a, "rev-parse", "HEAD") == head)
    st = open_store(a)
    check("contenu : Stockbee et VIX complets", st.count("stockbee_daily") > 1900 and st.count("vix_daily") > 2000)
    runs = st.read("runs")
    check("journal runs : 2 sources, durée, échec et note gardés",
          len(runs) == 2 and any(r["source"] == "breadth" and r["ok"] is False and r["note"] == "x" for r in runs) and runs[0]["duration_s"] in (7.2, 4.0))
    rc = sync_mod.sync(src, a, run_id="111-1", message="passage 1 bis", wait=0)
    check("même passage relancé : aucun nouveau commit", rc == 0 and git(a, "rev-parse", "HEAD") == head)

    # course : pendant que A synchronise, B pousse un autre jeu sur data ; A doit repartir de la version de B
    b = clone(bare, tmp / "b")
    real = sync_mod._git
    raced = {"done": False}

    def racing_git(root, *args, check=True):
        if args[:1] == ("push",) and Path(root) == a and not raced["done"]:
            raced["done"] = True
            sb = open_store(b)
            sb.upsert("vix_daily", [{"session_date": "2030-01-02", "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5}])
            git(b, "add", "-A"); git(b, "commit", "--quiet", "-m", "écrivain B"); git(b, "push", "--quiet", "origin", "HEAD:data")
        return real(root, *args, check=check)

    sync_mod._git = racing_git
    status["started"] = "2026-10-15T01:17:00+00:00"
    (src / "status_data.js").write_text("window.STATUS = " + json.dumps(status) + ";\n")
    rc = sync_mod.sync(src, a, run_id="222-1", message="passage 2", wait=0)
    sync_mod._git = real
    st = open_store(a)
    check("course : push refusé puis réussi après reprise", rc == 0 and raced["done"])
    check("course : la ligne de B est conservée", any(r["session_date"] == "2030-01-02" for r in st.read("vix_daily", since="2030-01-01")))
    check("course : le passage 2 est journalisé, sans doublon", sorted({r["run_id"] for r in st.read("runs")}) == ["111-1", "222-1"] and st.count("runs") == 4)
    check("historique : init, passage 1, B, passage 2", git(a, "log", "--format=%s").splitlines() == ["passage 2", "écrivain B", "passage 1", "init"])

sys.exit(1 if fails else 0)
