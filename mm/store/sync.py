"""Synchronisation des fichiers publiés vers la branche `data` (phase 3b), appelée par les workflows après chaque passage.

Algorithme (prod safe, sans conflit possible) :
  1. repartir de la dernière version publiée de la branche (fetch + reset sur origin/<branche>) ;
  2. importer les *_data.js (upsert idempotent) et, pour une mise à jour complète, le journal `runs` ;
  3. relire tout le stockage (contrôle de chaque ligne) ;
  4. si rien n'a changé : terminé, aucun commit ; sinon commit puis push ;
  5. si le push est refusé (la branche a avancé entre-temps) : recommencer en 1 (au plus `attempts` fois). Rejouer
     l'import sur la nouvelle version ne crée aucun doublon (clés primaires).
Aucune clé : le push utilise les droits du workflow (GITHUB_TOKEN, contents: write).
"""
import subprocess
import time
from pathlib import Path

import mmconfig

from . import open_store
from .importers import from_js_files


def _git(root, *args, check=True):
    r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError(f"git {' '.join(args)} : {(r.stderr or r.stdout).strip()[:300]}")
    return r


def sync(src, root=None, only=None, run_id=None, message="Données", attempts=3, push=True, wait=10):
    """Renvoie 0 (stockage à jour, poussé ou inchangé) ou 1 (échec après `attempts` essais)."""
    branch = mmconfig.load("storage")["store"]["branch"]
    store = open_store(root)
    for i in range(1, attempts + 1):
        if push:
            _git(store.root, "fetch", "--quiet", "origin", branch)
            _git(store.root, "reset", "--quiet", "--hard", f"origin/{branch}")
        store = open_store(store.root)
        store.write_meta()
        for ds, st in from_js_files(store, Path(src), only, run_id).items():
            if st["inserted"] or st["updated"]:
                print(f"  {ds:<20} +{st['inserted']} nouvelles, {st['updated']} modifiées")
        total = sum(store.count(n) for n in store.ds)            # relit et contrôle chaque ligne (SchemaError sinon)
        _git(store.root, "add", "-A")
        if not _git(store.root, "status", "--porcelain").stdout.strip():
            print(f"Stockage inchangé ({total} lignes).")
            return 0
        _git(store.root, "commit", "--quiet", "-m", message)
        if not push:
            return 0
        if _git(store.root, "push", "--quiet", "origin", f"HEAD:{branch}", check=False).returncode == 0:
            print(f"Stockage poussé sur {branch} ({total} lignes).")
            return 0
        print(f"  push refusé (la branche {branch} a avancé), essai {i}/{attempts} : on recommence depuis sa dernière version")
        time.sleep(wait * i)
    return 1
