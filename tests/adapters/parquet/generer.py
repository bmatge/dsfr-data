"""Fixtures Parquet de l'export Tabular (#1055) — script qui les PRODUIT.

    python3 tests/adapters/parquet/generer.py

Dépendance : pyarrow (testé avec 23.0.1). Les fichiers produits sont versionnés ;
ce script n'est rejoué que pour les changer. Ils imitent les exports de data.gouv
(étude #1022, `tools/banc-parquet/`) : écrits par parquet-cpp-arrow, compressés en
ZSTD, entiers en INT64, dates en INT32/DATE, plusieurs groupes de lignes.

1. `tests/adapters/parquet/types.parquet` — tests unitaires
   (`tests/adapters/tabular-parquet.test.ts`) : un type par colonne, une valeur
   nulle, 5 lignes en 3 groupes de lignes (2, 2, 1).

2. `tests/verif-donnees/jeux/adaptateurs-tabular-long.parquet` — contrôle ADR-122
   (`tests/verif-donnees/adaptateurs.ts`, `tabular-export-parquet`) : les MÊMES
   411 lignes que `adaptateurs-tabular-long.json`, colonnes et ordre compris,
   en 5 groupes de 100 lignes (100, 100, 100, 100, 11). L'oracle relit le JSON ;
   la bibliothèque lit le Parquet. Un groupe sauté, un entier resté `BigInt`,
   une colonne perdue se voient comme un écart.
"""

import datetime
import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent.parent.parent
JEU_LONG = RACINE / 'tests' / 'verif-donnees' / 'jeux' / 'adaptateurs-tabular-long.json'
SORTIE_LONG = JEU_LONG.with_suffix('.parquet')
SORTIE_TYPES = ICI / 'types.parquet'


def ecrire(table: pa.Table, chemin: Path, groupe: int) -> None:
    pq.write_table(table, chemin, compression='zstd', row_group_size=groupe)
    print(f'{chemin.relative_to(RACINE)} : {table.num_rows} lignes, '
          f'{pq.ParquetFile(chemin).metadata.num_row_groups} groupes')


def types() -> None:
    table = pa.table({
        'code': pa.array(['01', '02', '03', '04', '05'], pa.string()),
        'population': pa.array([652432, 531345, 335975, 165197, 140916], pa.int64()),
        'surface': pa.array([5762.4, 7369.1, 7340.0, 6925.2, 5549.0], pa.float64()),
        'actif': pa.array([True, False, True, True, False], pa.bool_()),
        'date_creation': pa.array([datetime.date(1790, 3, 4), datetime.date(1967, 7, 22),
                                   datetime.date(2000, 1, 1), datetime.date(2024, 2, 29),
                                   datetime.date(1970, 1, 1)], pa.date32()),
        'horodatage': pa.array([datetime.datetime(2026, 9, 22, 23, 14, 5)] * 5,
                               pa.timestamp('ms', tz='UTC')),
        'note': pa.array([3, None, 5, 7, 11], pa.int64()),
    })
    ecrire(table, SORTIE_TYPES, 2)


def jeu_long() -> None:
    lignes = json.loads(JEU_LONG.read_text(encoding='utf-8'))
    colonnes = list(lignes[0].keys())
    donnees = {}
    for col in colonnes:
        valeurs = [ligne[col] for ligne in lignes]
        entiers = all(isinstance(v, int) and not isinstance(v, bool) for v in valeurs)
        donnees[col] = pa.array(valeurs, pa.int64() if entiers else pa.string())
    ecrire(pa.table(donnees), SORTIE_LONG, 100)


if __name__ == '__main__':
    types()
    jeu_long()
