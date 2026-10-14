"""Ligne de commande du stockage historique.

  python -m mm.store import [--from DOSSIER] [--only fichier.js ...]   synchronise les *_data.js publiés vers le stockage
  python -m mm.store check                                             relit tout le stockage et contrôle chaque ligne
  python -m mm.store stats                                             lignes et dernière date par jeu de données
Le dossier du stockage est celui de config/storage.toml ([store] root) ; --root le remplace.
"""
import argparse
import sys
from pathlib import Path

from . import HERE, SchemaError, open_store
from .importers import from_js_files


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m mm.store", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=("import", "check", "stats"))
    ap.add_argument("--root", help="dossier du stockage (défaut : config/storage.toml)")
    ap.add_argument("--from", dest="src", default=str(HERE), help="dossier des *_data.js (défaut : racine du dépôt)")
    ap.add_argument("--only", nargs="*", help="fichiers à synchroniser (ex. postmarket_data.js)")
    a = ap.parse_args(argv)
    store = open_store(a.root)
    if not store.root.exists():
        print(f"Stockage introuvable : {store.root} (extraire la branche data, voir ARCHITECTURE.md)")
        return 1
    try:
        if a.command == "import":
            store.write_meta()
            for ds, st in from_js_files(store, Path(a.src), a.only).items():
                print(f"{ds:<20} +{st['inserted']} nouvelles, {st['updated']} modifiées, {st['unchanged']} inchangées")
        else:
            for name in store.ds:
                n, last = store.count(name), store.latest(name)       # relit et contrôle chaque ligne de chaque fichier
                print(f"{name:<20} {n:>7} lignes   dernière : {last or '—'}")
            if a.command == "check":
                print("stockage : valide")
    except SchemaError as e:
        print(f"ERREUR : {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
