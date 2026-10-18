#!/usr/bin/env python3
"""Test : une etape de mise a jour qui produit des donnees invalides doit etre annulee (anciennes donnees restaurees).

Simule, dans un dossier temporaire, cinq scripts de recuperation factices :
  - stockbee : ne change rien (donnees deja valides)                  -> doit rester "ok"
  - prices  : renvoie une seance de moins (source en retard)         -> version precedente gardee, "ok" avec une note
  - vix     : tronque la serie (donnees trop anciennes)               -> doit etre annule et restaure a l'identique
  - sectors : ecrit un fichier quasi vide (1 ETF au lieu de 55)       -> doit etre annule et restaure a l'identique
  - breadth : ecrit un calcul maison tronque (3 seances)              -> doit etre annule et restaure a l'identique
  - industries : fichier principal tronque, un fichier d'industrie supprime, un autre ajoute
                                                                      -> fichier et dossier industries/ restaures a l'identique
Aucun acces reseau. Sortie : code 0 si le comportement est conforme.
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ["stockbee_data.js", "stockbee_market_monitor.csv", "breadth_data.js", "vix_data.js", "prices_data.js", "sectors_data.js",
        "industries_data.js"]
FOLDER = "industries"                     # un fichier par industrie (config/industries.toml), restaure en bloc

STUBS = {
    "fetch_stockbee.py": 'print("stub stockbee : donnees deja a jour")\n',
    # prices : la source renvoie une derniere seance de moins (Yahoo le soir, cloture du jour absente) -> version precedente
    # conservee, sans echec
    "fetch_prices.py": (
        'import json\nd = json.loads(open("prices_data.js").read().split("=", 1)[1].strip().rstrip(";"))\n'
        'd = {k: v[:-1] for k, v in d.items()}\nopen("prices_data.js", "w").write("window.PRICES = " + json.dumps(d) + ";\\n")\n'
        'print("Ecrit : prices_data.js")\n'
    ),
    "fetch_sectors.py": (
        'open("sectors_data.js", "w").write(\'window.SECTORS = {"asof":"2026-10-12","dates":["2026-10-12"],'
        '"symbols":[{"s":"XLK","n":"x","g":"y","c":[1]}]};\\n\')\nprint("Ecrit : sectors_data.js")\n'
    ),
    "breadth_own.py": (
        'import json\ntxt = open("breadth_data.js").read()\nd = json.loads(txt.split("=", 1)[1].strip().rstrip(";"))\n'
        'd["rows"] = d["rows"][:3]\nopen("breadth_data.js", "w").write("window.BREADTH_OWN = " + json.dumps(d) + ";\\n")\n'
        'print("Ecrit : breadth_data.js")\n'
    ),
    "fetch_industries.py": (
        'import pathlib\nfiles = sorted(pathlib.Path("industries").glob("*.js"))\nfiles[0].unlink()\n'
        'pathlib.Path("industries/nouvelle-industrie.js").write_text("x")\n'
        'open("industries_data.js", "w").write(\'window.INDUSTRIES = {"asof":"2026-10-12","dates":[],"sectors":[],"industries":[]};\\n\')\n'
        'print("Ecrit : industries_data.js")\n'
    ),
    "fetch_vix.py": (
        'import json\nrows = json.loads(open("vix_data.js").read().split("=", 1)[1].strip().rstrip(";"))\n'
        'open("vix_data.js", "w").write("window.VIX = " + json.dumps(rows[:-30]) + ";\\n")\nprint("Ecrit : vix_data.js")\n'
    ),
}

RUNNER = (
    "import sys, time\n"
    "time.sleep = lambda s: None            # pas d'attente entre les tentatives pendant le test\n"
    "import update_all\n"
    "sys.exit(update_all.main())\n"
)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        for name in ["update_all.py", "validate_data.py", "mmconfig.py", *DATA]:
            shutil.copy(ROOT / name, work / name)
        shutil.copytree(ROOT / "config", work / "config")             # configuration centralisee (etapes, fraicheur)
        shutil.copytree(ROOT / ".github", work / ".github")
        shutil.copytree(ROOT / FOLDER, work / FOLDER)
        folder = lambda: {q.name: q.read_bytes() for q in sorted((work / FOLDER).glob("*"))}
        before_folder = folder()
        for name, code in STUBS.items():
            (work / name).write_text(code)
        before = {n: (work / n).read_bytes() for n in DATA}

        r = subprocess.run([sys.executable, "-c", RUNNER], cwd=work, capture_output=True, text=True, timeout=120)
        status_text = (work / "status_data.js").read_text()
        status = json.loads(status_text[status_text.index("=") + 1:].strip().rstrip(";"))["sources"]

        checks = {
            "stockbee ok": status["stockbee"]["ok"] is True,
            "prices en retard d'une seance : ok, version precedente gardee": status["prices"]["ok"] is True and "en retard" in status["prices"].get("note", ""),
            "prices restaure a l'identique": (work / "prices_data.js").read_bytes() == before["prices_data.js"],
            "breadth en echec": status["breadth"]["ok"] is False,
            "breadth restaure a l'identique": (work / "breadth_data.js").read_bytes() == before["breadth_data.js"],
            "vix en echec": status["vix"]["ok"] is False,
            "sectors en echec": status["sectors"]["ok"] is False,
            "vix restaure a l'identique": (work / "vix_data.js").read_bytes() == before["vix_data.js"],
            "sectors restaure a l'identique": (work / "sectors_data.js").read_bytes() == before["sectors_data.js"],
            "industries en echec": status["industries"]["ok"] is False,
            "industries restaure a l'identique": (work / "industries_data.js").read_bytes() == before["industries_data.js"],
            "dossier industries/ restaure a l'identique (fichier supprime remis, fichier ajoute retire)": folder() == before_folder,
            "code de sortie 1 (echec signale)": r.returncode == 1,
        }
        for label, ok in checks.items():
            print(("ok     " if ok else "ECHEC  ") + label)
        if not all(checks.values()):
            print(r.stdout[-800:], r.stderr[-400:])
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
