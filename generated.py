#!/usr/bin/env python3
"""Fichiers générés publiés sans être commités (config/storage.toml [generated]) : vue TradingView de l'onglet Secteurs et
index de l'onglet Tickers (industries_data.js, tickers_data.js, industries/).

Le robot les réécrit à chaque séance ; les commiter faisait grossir l'historique Git de ~2,7 Mo par passage. Ils passent
d'une exécution à l'autre par le cache Actions (clé « generes- ») ; ce script couvre le reste :
  python generated.py check               code 1 si un fichier ou un dossier manque (rien n'est modifié)
  python generated.py fetch [--from URL]  s'il en manque : télécharge la version publiée (site GitHub Pages, ou URL file://)
                                          et l'installe en bloc ; un seul fichier en échec = rien n'est installé (code 1)
  python generated.py snapshot DOSSIER    copie la version présente (avant update_all.py) ...
  python generated.py restore DOSSIER     ... et la remet à l'identique (contrôle global en échec dans update.yml)
En local (aperçu du site) : python generated.py fetch, ou ../tradingview-bot/venv/bin/python fetch_industries.py (cache Polygon).
"""
import gzip
import http.client
import json
import shutil
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import mmconfig
from fetch_industries import FOLDER, OUT, TICKERS_OUT   # noms des fichiers de la vue TradingView (config/industries.toml)

HERE = Path(__file__).resolve().parent
GEN = mmconfig.load("storage")["generated"]
PREFIXES = ("window.", "(window.")                      # tout fichier de données publié définit une variable globale


def paths(root=HERE):
    """Chemins des fichiers et dossiers générés sous root."""
    return [Path(root) / f for f in GEN["files"]] + [Path(root) / d for d in GEN["dirs"]]


def missing(root=HERE):
    """Fichiers absents et dossiers absents ou vides (noms relatifs)."""
    return [p.name for p in paths(root) if not (p.is_file() or (p.is_dir() and any(p.glob("*.js"))))]


def _load(text):
    return json.loads(text[text.index("=") + 1:].strip().rstrip(";"))


def folder_files(ind_text, tk_text):
    """Fichiers du dossier des industries d'après les fichiers principaux : un par industrie (industries_data.js, champ f)
    et un par industrie ayant des actions hors filtres (tickers_data.js, inds[i][2])."""
    names = {i["f"] for i in _load(ind_text)["industries"]} | {x[2] for x in _load(tk_text)["inds"] if len(x) > 2 and x[2]}
    return sorted(f"{FOLDER.name}/{n}.js" for n in names)


def _get(base, rel, tries=3):
    url = base.rstrip("/") + "/" + rel
    if url.startswith("http"):
        url += f"?v={int(time.time())}"                  # contourne le cache de Pages (10 min)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "market-monitor (generated.py)", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":   # Pages compresse : ~5 fois moins à transférer
                    raw = gzip.decompress(raw)
            text = raw.decode("utf-8")
            if not text.startswith(PREFIXES):
                raise ValueError("contenu inattendu")
            return text
        except (OSError, ValueError, http.client.HTTPException) as e:   # coupure, réponse tronquée
            if i == tries - 1:
                raise RuntimeError(f"{rel} : {e}") from e
            time.sleep(2 * (i + 1))


def _clear(root):
    for p in paths(root):
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()


def _copy(src, dst):
    """Copie les fichiers et dossiers générés présents sous src vers dst (après avoir vidé ceux de dst)."""
    Path(dst).mkdir(parents=True, exist_ok=True)
    _clear(dst)
    n = 0
    for s, d in zip(paths(src), paths(dst)):
        if s.is_dir():
            shutil.copytree(s, d)
            n += 1
        elif s.is_file():
            shutil.copy2(s, d)
            n += 1
    return n


def fetch(base=None, root=HERE, force=False):
    """Télécharge la version publiée si un fichier manque. Renvoie le nombre de fichiers installés (0 : rien à faire)."""
    if not force and not missing(root):
        print(f"Fichiers générés présents ({', '.join(p.name for p in paths(root))}) : rien à télécharger")
        return 0
    base = base or GEN["site_url"]
    with tempfile.TemporaryDirectory() as tmp:
        texts = {f: _get(base, f) for f in GEN["files"]}
        ind_file, tk_file = OUT.name, TICKERS_OUT.name
        rels = folder_files(texts[ind_file], texts[tk_file]) if {ind_file, tk_file} <= texts.keys() else []
        texts.update({rel: _get(base, rel) for rel in rels})
        for rel, text in texts.items():
            (Path(tmp) / rel).parent.mkdir(parents=True, exist_ok=True)
            (Path(tmp) / rel).write_text(text)
        _copy(tmp, root)                                  # tout a été reçu : installation en bloc
    print(f"Fichiers générés téléchargés depuis {base} : {len(texts)} fichiers")
    return len(texts)


def main(argv):
    cmd = argv[0] if argv else ""
    if cmd == "check":
        miss = missing()
        print("Fichiers générés : " + (f"absents : {', '.join(miss)}" if miss else "présents"))
        return 1 if miss else 0
    if cmd == "fetch":
        base = argv[argv.index("--from") + 1] if "--from" in argv else None
        try:
            fetch(base, force="--force" in argv)
        except RuntimeError as e:
            print(f"Téléchargement impossible, rien n'est modifié : {e}")
            return 1
        return 0
    if cmd in ("snapshot", "restore") and len(argv) == 2:
        store = Path(argv[1])
        if cmd == "snapshot":
            print(f"Copie des fichiers générés vers {store} : {_copy(HERE, store)} élément(s)")
        else:
            print(f"Fichiers générés remis depuis {store} : {_copy(store, HERE)} élément(s)")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
