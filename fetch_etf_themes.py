#!/usr/bin/env python3
"""Thèmes des actions d'après les ETF thématiques (01/11/2026) → etf_themes_data.js (config/etf_themes.toml).

Pour chaque ETF de [etfs] : dernière composition déclarée à la SEC (formulaire N-PORT-P, trimestriel) ; ses actions reliées aux
tickers du site (index tickers_data.js) ; chaque action reçoit le thème des ETF où elle pèse au moins min_weight % (au plus
max_per_stock thèmes, les poids les plus forts). Étiquettes d'information, pas une règle (tests : config/etf_themes.toml).

Rapprochement d'une ligne N-PORT avec un ticker du site : 1. ticker donné et présent dans l'index ; 2. CUSIP (ou ISIN US) déjà
relié par un ticker dans une autre composition ; 3. nom de la société normalisé identique (ou sans espaces) ; 4. deux premiers
mots identiques, un seul titre de l'index, et tous les mots de son nom présents. Écartés : lignes autres qu'actions (assetCat EC),
titres cotés hors des États-Unis (ISIN étranger sans CUSIP : leur ticker local peut tomber sur un ticker US, « ADP »).

Accès : SEC EDGAR, gratuit, sans clé ; contact obligatoire dans chaque requête (variable SEC_UA, « Nom contact@domaine » : secret
GitHub, jamais dans un fichier du dépôt). Échec partiel : un ETF illisible garde sa composition publiée ; moins de min_etfs ETF
lus : échec (code 1), le fichier publié n'est pas modifié.
  python fetch_etf_themes.py                     depuis la SEC (SEC_UA requis)
  python fetch_etf_themes.py --from-dir DOSSIER  depuis des fichiers N-PORT déjà téléchargés (DOSSIER/<ETF>/*.xml, local)
"""
import argparse
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import mmconfig

HERE = Path(__file__).resolve().parent
CFG = mmconfig.load("etf_themes")
OUT = HERE / mmconfig.step("etf_themes")["output"]
TICKERS = HERE / mmconfig.load("industries")["output"]["tickers_file"]
SEC = "https://www.sec.gov"
STOP = {"inc", "incorporated", "corp", "corporation", "co", "company", "companies", "ltd", "limited", "plc", "llc", "lp", "sa", "nv",
        "ag", "se", "the", "holdings", "holding", "group", "class", "a", "b", "c", "common", "stock", "shares", "ordinary", "adr", "ads",
        "sponsored", "new", "de", "del", "cl", "com", "reit", "trust", "tr"}


def local(tag):
    return tag.rsplit("}", 1)[-1]


def parse_nport(xml_bytes):
    """(date du rapport, identifiant de série, lignes [nom, titre, cusip, isin, ticker, % de l'actif, catégorie, pays])."""
    root = ET.fromstring(xml_bytes)
    rep, ser, rows = None, None, []
    for el in root.iter():
        n = local(el.tag)
        if n == "repPdDate" and not rep:
            rep = (el.text or "").strip()
        elif n == "seriesId" and not ser:
            ser = (el.text or "").strip()
        elif n == "invstOrSec":
            kids = {local(c.tag): c for c in el}
            txt = lambda k: (kids[k].text or "").strip() if k in kids else ""
            isin = tick = ""
            for c in (kids["identifiers"] if "identifiers" in kids else []):
                if local(c.tag) == "isin":
                    isin = c.get("value", "")
                elif local(c.tag) == "ticker":
                    tick = c.get("value", "")
            try:
                pct = float(txt("pctVal"))
            except ValueError:
                pct = 0.0
            rows.append([txt("name"), txt("title"), txt("cusip"), isin, tick, pct, txt("assetCat"), txt("invCountry")])
    return rep, ser, rows


def norm(name):
    n = re.sub(r"/[a-z]{2}\b.*$", "", (name or "").lower())                 # « Old National Bancorp/IN »
    n = re.sub(r"\b([a-z])\.(?=[a-z]\.)", r"\1", n).replace(".", "")          # « D.R. Horton » → « dr horton »
    return [w for w in re.sub(r"[^a-z0-9 ]", " ", n.replace("&", " and ")).split() if w not in STOP]


def okc(k):
    return bool(re.fullmatch(r"[0-9A-Z]{9}", k or "")) and k != "000000000"


class Matcher:
    """Lignes N-PORT → tickers de l'index du site."""

    def __init__(self, tk_rows, cols, compositions):
        ci = {c: i for i, c in enumerate(cols)}
        self.syms = {r[ci["s"]] for r in tk_rows}
        self.by_name, self.by_join, self.by_two, self.words = {}, {}, defaultdict(set), {}
        for r in tk_rows:
            w = norm(r[ci["n"]])
            if w:
                self.by_name.setdefault(" ".join(w), r[ci["s"]])
                self.by_join.setdefault("".join(w), r[ci["s"]])
                self.by_two[" ".join(w[:2])].add(r[ci["s"]])
                self.words[r[ci["s"]]] = set(w)
        self.cusip = {}
        for rows in compositions:
            for _, _, cu, isin, tick, _, _, _ in rows:
                tk = tick.replace("/", ".").upper()
                if tk in self.syms:
                    for k in (cu, isin[2:11] if isin.startswith("US") else ""):
                        if okc(k):
                            self.cusip.setdefault(k, tk)

    def __call__(self, row):
        name, title, cu, isin, tick, pct, cat, ctry = row
        if cat != "EC" or (isin and not isin.startswith("US") and not okc(cu)):
            return None
        tk = tick.replace("/", ".").upper()
        if tk in self.syms:
            return tk
        for k in (cu, isin[2:11] if isin.startswith("US") else ""):
            if okc(k) and k in self.cusip:
                return self.cusip[k]
        w = norm(name) or norm(title)
        if " ".join(w) in self.by_name:
            return self.by_name[" ".join(w)]
        if "".join(w) in self.by_join:
            return self.by_join["".join(w)]
        two = self.by_two.get(" ".join(w[:2]), set())
        if len(w) >= 2 and len(two) == 1 and self.words[next(iter(two))] <= set(w):
            return next(iter(two))
        return None


class Sec:
    """Lecture polie d'EDGAR (pause entre requêtes, 3 essais, contact obligatoire)."""

    def __init__(self, ua):
        import requests                                       # importé seulement pour un vrai passage réseau
        self.rq, self.ua, self.last = requests, ua, 0.0

    def get(self, url):
        for k in range(3):
            time.sleep(max(0.0, CFG["pause"] - (time.time() - self.last)))
            self.last = time.time()
            try:
                r = self.rq.get(url, headers={"User-Agent": self.ua, "Accept-Encoding": "gzip, deflate"}, timeout=CFG["timeout"])
            except self.rq.RequestException as e:
                print(f"  erreur réseau ({e.__class__.__name__}), essai {k + 1}/3")
                time.sleep(2)
                continue
            if r.status_code == 200:
                return r.content
            print(f"  HTTP {r.status_code} : {url}")
            if r.status_code not in (403, 429):
                return None
            time.sleep(10)
        return None

    def latest(self, series, cik):
        """Dernière composition N-PORT-P de la série, ou None."""
        atom = self.get(f"{SEC}/cgi-bin/browse-edgar?action=getcompany&CIK={series}&type=NPORT-P&dateb=&owner=include&count=10&output=atom")
        if not atom:
            return None
        for e in ET.fromstring(atom).iter():
            if local(e.tag) != "entry":
                continue
            acc = next(((c.text or "").strip() for c in e.iter() if local(c.tag) == "accession-number"), None)
            if not acc:
                continue
            doc = self.get(f"{SEC}/Archives/edgar/data/{int(cik)}/{acc.replace('-', '')}/primary_doc.xml")
            if doc:
                rep, ser, rows = parse_nport(doc)
                if (not ser or ser == series) and rep and rows:
                    return rep, rows
        return None


def from_sec(etfs):
    ua = os.environ.get("SEC_UA", "").strip()
    if not re.search(r"\S+@\S+\.\S+", ua):
        sys.exit("SEC_UA manquant ou sans adresse (« Nom contact@domaine », exigé par la SEC) : rien n'est modifié.")
    sec = Sec(ua)
    raw = sec.get(f"{SEC}/files/company_tickers_mf.json")
    if not raw:
        sys.exit("Table des fonds de la SEC illisible : rien n'est modifié.")
    mf = json.loads(raw)
    F = mf["fields"]
    by_sym = {r[F.index("symbol")]: (r[F.index("cik")], r[F.index("seriesId")]) for r in mf["data"]}
    out = {}
    for etf in etfs:
        if etf not in by_sym:
            print(f"{etf:5} absent de la table des fonds de la SEC")
            continue
        got = sec.latest(by_sym[etf][1], by_sym[etf][0])
        print(f"{etf:5} {'composition du ' + got[0] if got else 'illisible'}")
        if got:
            out[etf] = got
    return out


def from_dir(folder, etfs):
    """Dernière composition de chaque ETF parmi des fichiers N-PORT déjà téléchargés (DOSSIER/<ETF>/*.xml)."""
    out = {}
    for etf in etfs:
        best = None
        for f in sorted((Path(folder) / etf).glob("*.xml")):
            try:
                rep, ser, rows = parse_nport(f.read_bytes())
            except ET.ParseError:
                continue
            if rep and rows and (best is None or rep > best[0]):
                best = (rep, rows)
        if best:
            out[etf] = best
    return out


def build(comps, tk, previous=None, now=None):
    """Contenu de etf_themes_data.js : {updated, themes, etfs: {ETF: {t, d, n}}, h: {ETF: [[ticker, %], ...]}, stocks: {ticker: [[t, %], ...]}}.
    ETF absent de comps : sa composition publiée (previous) est gardée."""
    etfs = CFG["etfs"]
    themes = list(dict.fromkeys(etfs.values()))
    m = Matcher(tk["rows"], tk["cols"], [rows for _, rows in comps.values()])
    prev_h, prev_e = (previous or {}).get("h", {}), (previous or {}).get("etfs", {})
    h, meta = {}, {}
    for etf in etfs:
        if etf in comps:
            rep, rows = comps[etf]
            w = defaultdict(float)
            for row in rows:
                s = m(row)
                if s:
                    w[s] += row[5]
            h[etf] = sorted([[s, round(v, 3)] for s, v in w.items()], key=lambda x: (-x[1], x[0]))
            meta[etf] = {"t": themes.index(etfs[etf]), "d": rep, "n": len(h[etf])}
        elif etf in prev_h:
            h[etf], meta[etf] = prev_h[etf], {**prev_e[etf], "t": themes.index(etfs[etf])}
    best = defaultdict(dict)                                  # action → {thème : poids le plus fort parmi ses ETF}
    for etf, lst in h.items():
        t = meta[etf]["t"]
        for s, v in lst:
            if v >= CFG["min_weight"] and v > best[s].get(t, 0):
                best[s][t] = v
    stocks = {s: [[t, round(v, 2)] for t, v in sorted(d.items(), key=lambda x: -x[1])[:CFG["max_per_stock"]]] for s, d in sorted(best.items())}
    return {"updated": (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"), "themes": themes, "etfs": meta, "h": h, "stocks": stocks}


def load_js(path):
    t = Path(path).read_text()
    return json.loads(t[t.index("=") + 1:].strip().rstrip(";"))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--from-dir", help="fichiers N-PORT déjà téléchargés (DOSSIER/<ETF>/*.xml) au lieu de la SEC")
    a = ap.parse_args()
    if not TICKERS.exists():
        sys.exit(f"{TICKERS.name} absent (index des tickers) : python generated.py fetch")
    tk = load_js(TICKERS)
    comps = from_dir(a.from_dir, CFG["etfs"]) if a.from_dir else from_sec(CFG["etfs"])
    if len(comps) < CFG["min_etfs"]:
        sys.exit(f"Seulement {len(comps)} ETF lus (minimum {CFG['min_etfs']}) : rien n'est modifié.")
    previous = load_js(OUT) if OUT.exists() else None
    data = build(comps, tk, previous)
    OUT.write_text("window.ETF_THEMES = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"Écrit : {OUT.name} — {len(data['etfs'])} ETF, {len(data['stocks'])} actions étiquetées, {len(data['themes'])} thèmes")


if __name__ == "__main__":
    main()
