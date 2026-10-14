"""Backend git_csv : un dossier par jeu de données, un fichier CSV par partition (mois ou jour), versionné sur la branche
`data` du dépôt. Arborescence :

    <root>/README.md                          description (générée)
    <root>/_schema/<jeu>.json                 modèle du jeu (généré depuis config/datasets.toml)
    <root>/<jeu>/<AAAA>/<AAAA-MM>.csv         partition mensuelle
    <root>/<jeu>/<AAAA>/<AAAA-MM-JJ>.csv      partition journalière

CSV : en-tête = colonnes dans l'ordre du modèle ; valeur absente = champ vide ; booléens true / false ; nombres en notation
la plus courte qui redonne exactement la même valeur. Lignes triées par clé primaire : un passage qui n'apporte rien de
neuf ne modifie aucun fichier (pas de commit vide), et les différences Git ne montrent que les lignes réellement changées.
Écriture atomique (fichier temporaire puis renommage).
"""
import csv
import io
import json
import os
from pathlib import Path

from . import SchemaError, Store, datasets, normalize


def _fmt(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        return repr(v)              # notation la plus courte qui redonne exactement la même valeur
    return str(v)


class GitCsvStore(Store):
    def __init__(self, root):
        self.root = Path(root)
        self.ds = datasets()

    # --- fichiers -------------------------------------------------------------------------------------------------
    def _path(self, d, part):
        return self.root / d.name / part[:4] / f"{part}.csv"

    def _load(self, d, path):
        if not path.exists():
            return {}
        with open(path, newline="", encoding="utf-8") as f:
            rows = [normalize(d, {k: (v if v != "" else None) for k, v in r.items()}) for r in csv.DictReader(f)]
        return {d.key(r): r for r in rows}

    def _write(self, d, path, rows):
        buf = io.StringIO()
        w = csv.writer(buf, lineterminator="\n")
        w.writerow(list(d.columns))
        for k in sorted(rows):
            w.writerow([_fmt(rows[k][c]) for c in d.columns])
        text = buf.getvalue()
        if path.exists() and path.read_text(encoding="utf-8") == text:
            return False
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".csv.tmp")
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, path)
        return True

    def _parts(self, d):
        base = self.root / d.name
        return sorted(p for p in base.glob("*/*.csv")) if base.exists() else []

    # --- interface ------------------------------------------------------------------------------------------------
    def dataset(self, name):
        if name not in self.ds:
            raise SchemaError(f"jeu de données inconnu : {name}")
        return self.ds[name]

    def upsert(self, dataset, rows):
        d = self.dataset(dataset)
        clean = [normalize(d, r) for r in rows]           # tout le lot est contrôlé avant la moindre écriture
        keys = [d.key(r) for r in clean]
        if len(set(keys)) != len(keys):
            raise SchemaError(f"{dataset} : clés primaires en double dans le lot")
        by_part = {}
        for r in clean:
            by_part.setdefault(d.partition_of(r), []).append(r)
        stats = {"inserted": 0, "updated": 0, "unchanged": 0}
        for part, part_rows in sorted(by_part.items()):
            path = self._path(d, part)
            current = self._load(d, path)
            for r in part_rows:
                k = d.key(r)
                if k not in current:
                    stats["inserted"] += 1
                elif current[k] != r:
                    stats["updated"] += 1
                else:
                    stats["unchanged"] += 1
                current[k] = r
            self._write(d, path, current)
        return stats

    def read(self, dataset, since=None, until=None):
        d = self.dataset(dataset)
        out = []
        for path in self._parts(d):
            part = path.stem
            if (since and part < since[:len(part)]) or (until and part > until[:len(part)]):
                continue
            for r in self._load(d, path).values():
                v = r[d.partition_by][:10]
                if (since and v < since) or (until and v > until):
                    continue
                out.append(r)
        return sorted(out, key=d.key)

    def latest(self, dataset):
        d = self.dataset(dataset)
        parts = self._parts(d)
        if not parts:
            return None
        rows = self._load(d, parts[-1]).values()
        return max((r[d.partition_by] for r in rows), default=None)

    def count(self, dataset):
        d = self.dataset(dataset)
        return sum(len(self._load(d, p)) for p in self._parts(d))

    def write_meta(self):
        """README et schémas (générés) : rendent la branche lisible et autodescriptive."""
        (self.root / "_schema").mkdir(parents=True, exist_ok=True)
        for name, d in self.ds.items():
            meta = {"name": name, "description": d.description, "primary_key": list(d.primary_key),
                    "partition": d.partition, "partition_by": d.partition_by,
                    "columns": {c: t + ("?" if n else "") for c, (t, n) in d.columns.items()}}
            self._write_text(self.root / "_schema" / f"{name}.json", json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
        lines = ["# Market Monitor — données historiques", "",
                 "Branche **orpheline** `data` du dépôt `market-monitor` : stockage durable, en ajout seul, écrit par les workflows",
                 "(module `mm/store/` de la branche `main`). Ne pas modifier à la main.", "",
                 "- un dossier par jeu de données ; un fichier CSV par mois (`AAAA/AAAA-MM.csv`) ou par jour (`AAAA/AAAA-MM-JJ.csv`) ;",
                 "- modèle de chaque jeu (clé primaire, colonnes typées, `?` = valeur absente autorisée) : `_schema/<jeu>.json` ;",
                 "- dates ISO, horodatages UTC, valeur absente = champ vide ; lignes triées par clé primaire.", "",
                 "Lecture rapide : `duckdb -c \"select * from read_csv_auto('prices_daily/*/*.csv') where symbol = 'QQQ'\"`.", "",
                 "| Jeu | Clé primaire | Partition | Contenu |", "|---|---|---|---|"]
        lines += [f"| `{n}` | {', '.join(d.primary_key)} | {d.partition} | {d.description} |" for n, d in self.ds.items()]
        self._write_text(self.root / "README.md", "\n".join(lines) + "\n")

    def _write_text(self, path, text):
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            path.write_text(text, encoding="utf-8")
