#!/usr/bin/env python3
"""Rafraîchit la copie figée des fichiers générés lue par les tests (tests/fixtures/, voir tests/node/lib/fixtures.js).

Les fichiers générés (config/storage.toml [generated]) ne sont plus versionnés : les tests Node lisent tests/fixtures/ à leur
place. À relancer seulement si le format de fetch_industries.py change (nouvelle colonne, nouveau champ), après avoir
régénéré ou téléchargé les fichiers (python generated.py fetch --force) ; seuls les fichiers déjà présents dans
tests/fixtures/ sont recopiés (un test qui ouvre une autre industrie : copier son fichier une fois à la main).
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "tests" / "fixtures"


def main():
    olds = sorted(p for p in FIX.rglob("*.js"))
    absent = [p.relative_to(FIX).as_posix() for p in olds if not (ROOT / p.relative_to(FIX)).is_file()]
    if absent:
        sys.exit(f"Absents à la racine (python generated.py fetch) : {', '.join(absent)}")
    for p in olds:
        shutil.copy2(ROOT / p.relative_to(FIX), p)
    print(f"{len(olds)} fichiers recopiés dans {FIX.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
