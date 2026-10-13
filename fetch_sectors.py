#!/usr/bin/env python3
"""Telecharge les bougies daily d'une liste d'ETF sectoriels / thematiques et ecrit sectors_data.js (onglet « Secteurs »).

Source : Yahoo Finance via yfinance (gratuit, sans cle). Clotures de seance non ajustees des dividendes, comme dans TC2000.
Sortie : window.SECTORS = { asof, dates:[...], symbols:[{s, n, g, o, d (description), c:[...clotures], op:[...], h:[...], l:[...], v:[...]}] }
        (tous les tableaux sont alignes sur dates ; null quand l'ETF ne cotait pas encore).
Le classement lui-meme (avgC7 / avgC65, rang, variation de rang) est calcule dans le navigateur.

La liste de depart vient de TC2000 (YINN, ETF a effet de levier x3, est retire a la demande) ; les ajouts completent
les 11 secteurs SPDR et les principales industries / themes. Les noms sont indicatifs.
"""
import argparse
import json
import math
import sys
from datetime import date, timedelta, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "sectors_data.js"

SECTEUR, INDUSTRIE, THEME, MATIERE, PAYS = "Secteur", "Industrie", "Thème", "Matières", "Pays / région"

# (symbole, nom, groupe, origine) ; origine : "tc2000" = liste de l'utilisateur, "ajout" = proposition
UNIVERSE = [
    ("CIBR", "First Trust NASDAQ Cybersecurity", THEME, "tc2000"),
    ("CLOU", "Global X Cloud Computing", THEME, "tc2000"),
    ("XLK", "Technology Select Sector SPDR", SECTEUR, "tc2000"),
    ("DRAM", "Roundhill Memory", THEME, "tc2000"),
    ("XOP", "SPDR S&P Oil & Gas Exploration & Production", INDUSTRIE, "tc2000"),
    ("QTUM", "Defiance Quantum", THEME, "tc2000"),
    ("XLE", "Energy Select Sector SPDR", SECTEUR, "tc2000"),
    ("DISK", "Tema Memory", THEME, "tc2000"),
    ("IYZ", "iShares U.S. Telecommunications", INDUSTRIE, "tc2000"),
    ("HYDR", "Global X Hydrogen", THEME, "tc2000"),
    ("XLV", "Health Care Select Sector SPDR", SECTEUR, "tc2000"),
    ("XLC", "Communication Services Select Sector SPDR", SECTEUR, "tc2000"),
    ("GDX", "VanEck Gold Miners", MATIERE, "tc2000"),
    ("BKCH", "Global X Blockchain", THEME, "tc2000"),
    ("PPH", "VanEck Pharmaceutical", INDUSTRIE, "tc2000"),
    ("XBI", "SPDR S&P Biotech", INDUSTRIE, "tc2000"),
    ("LIT", "Global X Lithium & Battery Tech", THEME, "tc2000"),
    ("SLV", "iShares Silver Trust", MATIERE, "tc2000"),
    ("UFO", "Procure Space", THEME, "tc2000"),
    ("PBJ", "Invesco Food & Beverage", INDUSTRIE, "tc2000"),
    ("XLB", "Materials Select Sector SPDR", SECTEUR, "tc2000"),
    ("XRT", "SPDR S&P Retail", INDUSTRIE, "tc2000"),
    ("XLF", "Financial Select Sector SPDR", SECTEUR, "tc2000"),
    ("XLU", "Utilities Select Sector SPDR", SECTEUR, "tc2000"),
    ("URA", "Global X Uranium", THEME, "tc2000"),
    ("KWEB", "KraneShares CSI China Internet", PAYS, "tc2000"),
    ("XHB", "SPDR S&P Homebuilders", INDUSTRIE, "tc2000"),
    ("EWQ", "iShares MSCI France", PAYS, "tc2000"),
    ("TAN", "Invesco Solar", THEME, "tc2000"),
    ("XAR", "SPDR S&P Aerospace & Defense", INDUSTRIE, "tc2000"),
    ("NCLD", "Roundhill Neocloud", THEME, "tc2000"),
    # --- ajouts : secteurs SPDR manquants
    ("XLI", "Industrial Select Sector SPDR", SECTEUR, "ajout"),
    ("XLY", "Consumer Discretionary Select Sector SPDR", SECTEUR, "ajout"),
    ("XLP", "Consumer Staples Select Sector SPDR", SECTEUR, "ajout"),
    ("XLRE", "Real Estate Select Sector SPDR", SECTEUR, "ajout"),
    # --- ajouts : industries
    ("SMH", "VanEck Semiconductor", INDUSTRIE, "ajout"),
    ("IGV", "iShares Expanded Tech-Software", INDUSTRIE, "ajout"),
    ("IBB", "iShares Biotechnology", INDUSTRIE, "ajout"),
    ("IHI", "iShares U.S. Medical Devices", INDUSTRIE, "ajout"),
    ("KRE", "SPDR S&P Regional Banking", INDUSTRIE, "ajout"),
    ("KIE", "SPDR S&P Insurance", INDUSTRIE, "ajout"),
    ("JETS", "U.S. Global Jets", INDUSTRIE, "ajout"),
    ("IYT", "iShares Transportation Average", INDUSTRIE, "ajout"),
    ("OIH", "VanEck Oil Services", INDUSTRIE, "ajout"),
    # --- ajouts : matieres / mines
    ("XME", "SPDR S&P Metals & Mining", MATIERE, "ajout"),
    ("COPX", "Global X Copper Miners", MATIERE, "ajout"),
    ("REMX", "VanEck Rare Earth/Strategic Metals", MATIERE, "ajout"),
    ("MOO", "VanEck Agribusiness", MATIERE, "ajout"),
    # --- ajouts : themes
    ("ICLN", "iShares Global Clean Energy", THEME, "ajout"),
    ("NLR", "VanEck Uranium+Nuclear Energy", THEME, "ajout"),
    ("BOTZ", "Global X Robotics & Artificial Intelligence", THEME, "ajout"),
    ("ARKK", "ARK Innovation", THEME, "ajout"),
    ("FDN", "First Trust Dow Jones Internet", THEME, "ajout"),
    ("PAVE", "Global X U.S. Infrastructure Development", THEME, "ajout"),
    ("FINX", "Global X FinTech", THEME, "ajout"),
]


# Description du theme de chaque ETF (affichee dans la colonne « Description » de l'onglet Secteurs).
DESC = {
    "CIBR": "Cybersécurité : éditeurs et fournisseurs de sécurité informatique",
    "CLOU": "Cloud computing : logiciels et infrastructures cloud",
    "XLK": "Secteur technologie du S&P 500 : logiciel, semi-conducteurs, matériel",
    "DRAM": "Mémoire : puces DRAM, HBM et NAND, et stockage (SK Hynix, Samsung, Micron…)",
    "XOP": "Pétrole et gaz : sociétés d'exploration et de production (E&P)",
    "QTUM": "Informatique quantique et apprentissage automatique",
    "XLE": "Secteur énergie du S&P 500 : majors pétrolières et services",
    "DISK": "Mémoire (gestion active) : DRAM, HBM et NAND, 15 à 100 titres mondiaux",
    "IYZ": "Télécoms américains : opérateurs et équipementiers",
    "HYDR": "Hydrogène : piles à combustible et électrolyse",
    "XLV": "Secteur santé du S&P 500 : pharma, biotech, équipements médicaux",
    "XLC": "Secteur communication du S&P 500 : médias, internet, télécoms",
    "GDX": "Mines d'or : sociétés aurifères mondiales",
    "BKCH": "Blockchain : mineurs, plateformes et infrastructure crypto",
    "PPH": "Pharmaceutique : grands laboratoires",
    "XBI": "Biotechnologie : sociétés de toutes tailles, équipondéré",
    "LIT": "Lithium et batteries : extraction et technologies de batteries",
    "SLV": "Argent métal : suit le cours de l'once d'argent",
    "UFO": "Espace : satellites, lanceurs et communications spatiales",
    "PBJ": "Agroalimentaire : aliments et boissons",
    "XLB": "Secteur matériaux du S&P 500 : chimie, métaux, emballages",
    "XRT": "Distribution : commerce de détail américain, équipondéré",
    "XLF": "Secteur financier du S&P 500 : banques, assurances, gestion d'actifs",
    "XLU": "Secteur services aux collectivités du S&P 500 : électricité, gaz, eau",
    "URA": "Uranium : mineurs d'uranium et filière nucléaire",
    "KWEB": "Internet chinois : grandes plateformes cotées (Tencent, Alibaba…)",
    "XHB": "Construction résidentielle : constructeurs et fournisseurs",
    "EWQ": "Pays : actions françaises (MSCI France)",
    "TAN": "Solaire : fabricants et développeurs d'énergie solaire",
    "XAR": "Aéronautique et défense : constructeurs et sous-traitants",
    "NCLD": "Neocloud : cloud GPU et centres de données pour l'IA",
    "XLI": "Secteur industrie du S&P 500 : aérospatiale, transport, machines",
    "XLY": "Secteur consommation discrétionnaire du S&P 500 : auto, e-commerce, loisirs",
    "XLP": "Secteur consommation de base du S&P 500 : alimentation, ménage, distribution",
    "XLRE": "Secteur immobilier du S&P 500 : foncières cotées",
    "SMH": "Semi-conducteurs : plus grandes sociétés du secteur",
    "IGV": "Logiciels : éditeurs de logiciels et services",
    "IBB": "Biotechnologie : grandes capitalisations biotech et sciences de la vie",
    "IHI": "Dispositifs médicaux : équipements et fournitures médicales",
    "KRE": "Banques régionales américaines",
    "KIE": "Assurance : assureurs américains",
    "JETS": "Compagnies aériennes : transporteurs aériens",
    "IYT": "Transport : fret, rail et aérien (Dow Jones Transportation)",
    "OIH": "Services pétroliers : forage et équipements",
    "XME": "Métaux et mines : acier, cuivre, aluminium, charbon",
    "COPX": "Mines de cuivre : producteurs de cuivre",
    "REMX": "Terres rares et métaux stratégiques",
    "MOO": "Agriculture : semences, engrais, machines agricoles",
    "ICLN": "Énergie propre : solaire, éolien et hydraulique mondial",
    "NLR": "Nucléaire : uranium et énergie nucléaire",
    "BOTZ": "Robotique et intelligence artificielle",
    "ARKK": "Innovation de rupture : croissance, gestion active (ARK)",
    "FDN": "Internet : grandes sociétés internet américaines",
    "PAVE": "Infrastructures américaines : construction, matériaux, ingénierie",
    "FINX": "Fintech : paiements et services financiers numériques",
}


def session_still_open(day_iso):
    """Vrai si `day_iso` est aujourd'hui a New York et que la seance n'est pas finie (avant 16 h) : sa bougie est partielle,
    on ne l'enregistre pas (un passage du workflow pendant la seance ecrivait une bougie du jour incomplete)."""
    from zoneinfo import ZoneInfo
    t = datetime.now(ZoneInfo("America/New_York"))
    return day_iso == t.date().isoformat() and t.hour < 16


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=900, help="historique en jours calendaires (900 = environ 620 seances : de quoi afficher la SMA 200)")
    args = ap.parse_args()
    try:
        import yfinance as yf
    except ImportError:
        sys.exit("Le module yfinance manque : pip install -r requirements.txt (dans le venv du projet).")

    symbols = [u[0] for u in UNIVERSE]
    start = (date.today() - timedelta(days=args.days)).isoformat()
    df = yf.download(symbols, start=start, interval="1d", auto_adjust=False, group_by="ticker",
                     progress=False, threads=True)
    if df is None or df.empty:
        sys.exit("Aucune donnee recue de Yahoo Finance (limitation de debit ? reessaie dans quelques minutes).")

    fields = {"c": "Close", "op": "Open", "h": "High", "l": "Low", "v": "Volume"}
    series = {}
    for s in symbols:
        try:
            sub = df[s][list(fields.values())].dropna(subset=["Close"])
        except KeyError:
            continue
        if len(sub):
            series[s] = {ts.date().isoformat(): row for ts, row in sub.iterrows()}

    dates = sorted({d for ser in series.values() for d in ser})
    if dates and session_still_open(dates[-1]):        # seance du jour pas finie : bougie partielle, non enregistree
        dates = dates[:-1]
    out = []
    for sym, name, grp, origin in UNIVERSE:
        ser = series.get(sym)
        if not ser:
            print(f"  ! {sym} : aucune donnee (ticker inconnu de Yahoo ?)")
            continue
        rec = {"s": sym, "n": name, "g": grp, "o": origin, "d": DESC.get(sym, "")}
        for key, col in fields.items():
            vals = []
            for d in dates:
                row = ser.get(d)
                v = None if row is None else row[col]
                vals.append(None if v is None or (isinstance(v, float) and math.isnan(v))
                            else (int(v) if key == "v" else round(float(v), 4)))
            rec[key] = vals
        out.append(rec)
    if len(out) < 0.9 * len(UNIVERSE):          # reponse partielle de Yahoo : on garde l'ancien fichier
        sys.exit(f"Seulement {len(out)}/{len(UNIVERSE)} ETF recus : {OUT.name} non modifie.")
    payload = {"asof": dates[-1], "dates": dates, "symbols": out}
    OUT.write_text("window.SECTORS = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n")

    short = [(s["s"], sum(c is not None for c in s["c"])) for s in out if sum(c is not None for c in s["c"]) < 70]
    print(f"{len(out)}/{len(UNIVERSE)} ETF, {len(dates)} seances ({dates[0]} -> {dates[-1]})")
    if short:
        print("Historique court (< 70 seances) :", ", ".join(f"{s} ({n})" for s, n in short))
    print(f"Ecrit : {OUT.name}")


if __name__ == "__main__":
    main()
