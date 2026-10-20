#!/usr/bin/env python3
"""Test : fichiers générés publiés sans être commités (config/storage.toml [generated], generated.py, workflows).

  - secours « site publié » : téléchargement (URL file://, aucun réseau) de tous les fichiers, dossier des industries
    reconstitué d'après industries_data.js et tickers_data.js ; un fichier manquant = rien n'est installé ; déjà présents =
    rien n'est téléchargé
  - copie / remise à l'identique (annulation de update.yml), y compris au premier passage (aucune copie : produit retiré)
  - validate_data.py : fichier généré absent = non contrôlé (pas d'annulation de toutes les sources)
  - mmconfig.py --check : cache des trois workflows avec les mêmes chemins ; aucun workflow ne commite ces fichiers
  - copie figée des tests (tests/fixtures/) au format courant de fetch_industries.py
Sortie : code 0 si tout est conforme.
"""
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import fetch_industries as fi  # noqa: E402
import generated  # noqa: E402
import mmconfig  # noqa: E402
import validate_data  # noqa: E402

FAILS = []


def check(label, cond, detail=""):
    print(("ok     " if cond else "ECHEC  ") + label + (f"  ({detail})" if detail and not cond else ""))
    if not cond:
        FAILS.append(label)


def js(var, payload):
    return f"window.{var} = " + json.dumps(payload) + ";\n"


def fake_site(site):
    """Site publié minimal : 2 industries, dont une avec des actions hors filtres."""
    (site / "industries").mkdir(parents=True)
    (site / "industries_data.js").write_text(js("INDUSTRIES", {"asof": "2026-10-19", "industries": [{"f": "aa"}, {"f": "bb"}]}))
    (site / "tickers_data.js").write_text(js("TICKERS", {"inds": [["A", 0, "aa--hors"], ["B", 0, None]], "rows": []}))
    for f in ("aa", "bb", "aa--hors"):
        (site / "industries" / f"{f}.js").write_text(f'(window.TV_STOCKS = window.TV_STOCKS || {{}})["{f}"] = {{}};\n')


def tree(root):
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in sorted(Path(root).rglob("*")) if p.is_file()}


def main():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        site, work, snap = tmp / "site", tmp / "work", tmp / "copie"
        work.mkdir()
        fake_site(site)

        # --- secours : téléchargement depuis le site publié
        check("dépôt fraîchement extrait : fichiers générés signalés absents", set(generated.missing(work)) == {"industries_data.js", "tickers_data.js", "industries"})
        n = generated.fetch(site.as_uri(), root=work)
        check("téléchargement : 2 fichiers principaux + 3 fichiers d'industrie (dont hors filtres)", n == 5 and not generated.missing(work), n)
        check("téléchargement : contenu identique au site publié", tree(work) == tree(site))
        check("déjà présents : rien n'est téléchargé", generated.fetch((tmp / "nulle-part").as_uri(), root=work) == 0)

        empty = tmp / "vide"
        empty.mkdir()
        (site / "industries" / "bb.js").unlink()
        try:
            generated.fetch(site.as_uri(), root=empty)
            ok = False
        except RuntimeError:
            ok = True
        check("fichier d'industrie absent du site : erreur et rien d'installé (pas de mélange)", ok and tree(empty) == {})

        # --- copie et remise à l'identique (annulation de update.yml)
        generated._copy(work, snap)
        before = tree(work)
        (work / "industries" / "aa.js").unlink()
        (work / "industries" / "nouvelle.js").write_text("x")
        (work / "industries_data.js").write_text("window.INDUSTRIES = {};\n")
        generated._copy(snap, work)
        check("remise à l'identique : fichier supprimé remis, ajouté retiré, principal restauré", tree(work) == before)
        generated._copy(empty, snap)                       # premier passage : aucune copie
        (work / "autre.txt").write_text("garde")
        generated._copy(snap, work)
        check("premier passage sans copie : produits retirés, autres fichiers intacts", tree(work) == {"autre.txt": b"garde"})

        # --- contrôle : absent = non contrôlé
        check("validate_data : industries_data.js absent = non contrôlé (pas d'erreur)", validate_data.validate("industries", tmp / "absent" / "industries_data.js") == [])

        # --- configuration et workflows
        gen = mmconfig.load("storage")["generated"]
        site_cfg = mmconfig.load("storage")["site"]
        check("[generated] publiés par build_site.py ([site] optional / dirs)", set(gen["files"]) <= set(site_cfg["optional"]) and set(gen["dirs"]) <= set(site_cfg["dirs"]))
        wf_dir = tmp / "workflows"
        shutil.copytree(mmconfig.WORKFLOWS, wf_dir)
        mmconfig.WORKFLOWS = wf_dir
        try:
            check("mmconfig --check : workflows actuels conformes", not [e for e in mmconfig.check() if "generes" in e])
            p = wf_dir / "postmarket.yml"
            p.write_text(p.read_text().replace("            tickers_data.js\n            industries\n", "            industries\n            tickers_data.js\n", 1))
            errs = [e for e in mmconfig.check() if "generes" in e]
            check("mmconfig --check : chemins du cache dans un autre ordre (cache introuvable) détectés", len(errs) == 1 and "postmarket.yml" in errs[0], errs)
        finally:
            mmconfig.WORKFLOWS = ROOT / ".github" / "workflows"
        names = gen["files"] + gen["dirs"]
        bad = [f"{wf.name}: {line.strip()}" for wf in sorted(mmconfig.WORKFLOWS.glob("*.yml")) for line in wf.read_text().splitlines()
               if re.search(r"\bgit (add|checkout|clean)\b", line) and any(n in line for n in names)]
        check("aucun workflow ne commite ni ne restaure par Git les fichiers générés", not bad, bad)
        ignored = (ROOT / ".gitignore").read_text().split()
        check(".gitignore : fichiers générés ignorés à la racine seulement (pas tests/fixtures/)", all("/" + f in ignored for f in gen["files"]) and all(f"/{d}/" in ignored for d in gen["dirs"]))

        # --- copie figée des tests au format courant
        fx = ROOT / "tests" / "fixtures"
        tk = json.loads((fx / "tickers_data.js").read_text().split("=", 1)[1].strip().rstrip(";"))
        check("tests/fixtures/tickers_data.js au format courant (sinon : python tests/make_fixtures.py)", tk["cols"] == fi.TK_COLS, tk["cols"])
        ind_text, tk_text = (fx / "industries_data.js").read_text(), (fx / "tickers_data.js").read_text()
        listed = set(generated.folder_files(ind_text, tk_text))
        have = {p.relative_to(fx).as_posix() for p in (fx / "industries").glob("*.js")}
        check("tests/fixtures/industries/ : fichiers cités par la copie figée", have and have <= listed, have - listed)

    print(f"\n{'ECHEC' if FAILS else 'OK'} : {len(FAILS)} échec(s)")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
