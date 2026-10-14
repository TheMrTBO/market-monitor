"""Stockage historique du Market Monitor : interface commune, indépendante de l'endroit où sont les données.

Le modèle logique (jeux de données, clés primaires, colonnes typées, partitionnement) est déclaré dans config/datasets.toml.
Le backend est choisi dans config/storage.toml ([store] backend). Aujourd'hui : git_csv (CSV sur la branche `data`).
Demain : postgres, sqlite… — il suffira d'écrire une classe qui respecte l'interface Store ci-dessous ; aucun script de
source ni le site n'ont besoin de savoir où sont les données.

Règles (prod safe) :
  - upsert idempotent par clé primaire : relancer un passage ne crée jamais de doublon ;
  - aucune suppression ;
  - chaque ligne est contrôlée (colonnes connues, types, valeurs obligatoires) avant toute écriture : un lot invalide
    n'écrit rien.
"""
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import mmconfig

HERE = Path(__file__).resolve().parents[2]


class SchemaError(ValueError):
    """Ligne non conforme au modèle (colonne inconnue, type, valeur obligatoire manquante)."""


@dataclass(frozen=True)
class Dataset:
    name: str
    description: str
    primary_key: tuple
    columns: dict          # nom -> (type, nullable)
    partition: str         # month | day
    partition_by: str
    private: bool = False  # jeu privé : jamais dans le stockage public (et inversement)

    @classmethod
    def from_config(cls, name, d):
        cols = {c: (t.rstrip("?"), t.endswith("?")) for c, t in d["columns"].items()}
        return cls(name, d.get("description", ""), tuple(d["primary_key"]), cols, d["partition"], d["partition_by"],
                   bool(d.get("private", False)))

    def key(self, row):
        return tuple(row[k] for k in self.primary_key)

    def partition_of(self, row):
        """Identifiant de partition (AAAA-MM ou AAAA-MM-JJ) d'une ligne déjà normalisée."""
        v = row[self.partition_by][:10]
        return v[:7] if self.partition == "month" else v


def datasets(private=False):
    """Jeux de données déclarés dans config/datasets.toml : publics (défaut) ou privés (private = true), jamais mélangés."""
    return {k: d for k, v in mmconfig.load("datasets")["datasets"].items() if (d := Dataset.from_config(k, v)).private == private}


DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def normalize(ds, row):
    """Ligne contrôlée et convertie aux types du modèle ; lève SchemaError sinon."""
    extra = set(row) - set(ds.columns)
    if extra:
        raise SchemaError(f"{ds.name} : colonnes inconnues {sorted(extra)}")
    out = {}
    for col, (typ, nullable) in ds.columns.items():
        v = row.get(col)
        if v is None or v == "":
            if not nullable or col in ds.primary_key:
                raise SchemaError(f"{ds.name} : valeur obligatoire manquante pour {col} ({row.get(ds.primary_key[0])})")
            out[col] = None
            continue
        try:
            if typ == "date":
                v = v.isoformat() if isinstance(v, date) else str(v)
                if not DATE.match(v):
                    raise ValueError(v)
                date.fromisoformat(v)
            elif typ == "timestamp":
                v = v.isoformat() if isinstance(v, datetime) else str(v)
                datetime.fromisoformat(v)
            elif typ == "int":
                if isinstance(v, bool) or (isinstance(v, float) and not v.is_integer()):
                    raise ValueError(v)
                v = int(v)
            elif typ == "float":
                if isinstance(v, bool):
                    raise ValueError(v)
                v = float(v)
                if v != v or v in (float("inf"), float("-inf")):
                    raise ValueError(v)
            elif typ == "bool":
                if isinstance(v, str):
                    if v not in ("true", "false"):
                        raise ValueError(v)
                    v = v == "true"
                elif not isinstance(v, bool):
                    raise ValueError(v)
            else:
                v = str(v)
        except (TypeError, ValueError) as e:
            raise SchemaError(f"{ds.name} : {col} = {row.get(col)!r} n'est pas de type {typ}") from e
        out[col] = v
    return out


class Store:
    """Interface commune des backends. Toutes les méthodes prennent le nom d'un jeu de config/datasets.toml."""

    def upsert(self, dataset, rows):
        """Insère ou remplace (par clé primaire) ; renvoie {"inserted": n, "updated": n, "unchanged": n}."""
        raise NotImplementedError

    def read(self, dataset, since=None, until=None):
        """Lignes (dictionnaires typés) dont la colonne de partition est dans [since, until], triées par clé."""
        raise NotImplementedError

    def latest(self, dataset):
        """Plus grande valeur de la colonne de partition (None si vide)."""
        raise NotImplementedError

    def count(self, dataset):
        raise NotImplementedError


def open_store(root=None, private=False):
    """Store configuré dans config/storage.toml : [store] (public, branche `data`) ou [private] (dépôt privé de l'utilisateur,
    extrait dans `root`, obligatoire). `root` remplace le dossier configuré (tests). Un store ne voit que ses propres jeux."""
    cfg = mmconfig.load("storage")["private" if private else "store"]
    if private and not root:
        raise ValueError("stockage privé : indiquer le dossier où le dépôt privé est extrait (root)")
    if cfg["backend"] == "git_csv":
        from .git_csv import GitCsvStore
        return GitCsvStore(Path(root) if root else HERE / cfg["root"], private=private)
    raise NotImplementedError(f"backend de stockage non implémenté : {cfg['backend']}")
