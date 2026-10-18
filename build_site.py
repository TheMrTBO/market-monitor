#!/usr/bin/env python3
"""Prépare le dossier _site publié sur GitHub Pages, depuis la liste unique de config/storage.toml [site].

Appelé par les workflows (update.yml, postmarket.yml, short.yml) à la place de listes `cp` recopiées dans chacun : un nouveau
fichier de données s'ajoute à un seul endroit. Fichier obligatoire absent : code de sortie 1, rien n'est publié.
Usage : python build_site.py [dossier]   (défaut : _site)
"""
import shutil
import sys
from pathlib import Path

import mmconfig

HERE = Path(__file__).resolve().parent


def build(out):
    site = mmconfig.load("storage")["site"]
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    missing = [f for f in site["required"] if not (HERE / f).is_file()]
    if missing:
        sys.exit(f"Fichiers obligatoires absents : {', '.join(missing)} ; site non préparé.")
    copied = 0
    for f in site["required"] + [f for f in site["optional"] if (HERE / f).is_file()]:
        shutil.copy2(HERE / f, out / f)
        copied += 1
    for d in site["dirs"]:
        if (HERE / d).is_dir():
            shutil.copytree(HERE / d, out / d, dirs_exist_ok=True)
            copied += 1
    (out / ".nojekyll").touch()
    print(f"{out}/ : {copied} fichiers ou dossiers copiés")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else HERE / "_site")
