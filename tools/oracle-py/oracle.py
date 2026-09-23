#!/usr/bin/env python3
"""La TROISIÈME VOIX de la vérification des données (#880, ADR-122 amendée).

Deux implémentations d'un même contrat, écrites par les mêmes agents dans le
même langage, peuvent dériver dans le même sens sans que rien ne bouge au
rapport. Celle-ci est écrite à part, dans un autre langage, avec d'autres
outils : la bibliothèque standard de Python et rien d'autre — ``json``,
``fractions``, ``decimal``, ``unicodedata``. Jamais pandas : ``sum`` d'une
colonne toute-NaN y vaut 0, ``groupby`` y supprime le groupe null, ``mean`` y
saute les NaN — exactement la famille de comportements que la doctrine #301
interdit (« une cellule vide est ``null``, jamais un 0 silencieux »).

Ce programme lit la PROJECTION des contrôles déterministes
(``tools/oracle/out/manifests.json``, produite par ``npm run verif:manifests``)
et les JEUX (``tests/verif-donnees/jeux/*.json``), recalcule chaque attente
en tableaux nus, et écrit ``tests/verif-donnees/attendus.json`` — versionné :
un attendu qui change se voit dans le diff d'une PR. Ce fichier ne porte QUE
des chiffres et les conventions qui les produisent ; la version exacte de
l'interpréteur va dans ``tools/oracle/out/attendus-provenance.json``, hors de
la zone gardée — sans quoi le garde-fou compare l'environnement en même temps
que les valeurs et rougit sur un runner qui n'a pas le Python de l'auteur.

Il n'exécute jamais ``node``, ne lit jamais ``packages/`` : il ne connaît de
la bibliothèque que ce que la projection lui dit (test-garde
``tests/oracle/oracle-py.test.ts``).

Conventions ÉCRITES (README de l'oracle, « La troisième voix ») :

- **Nombres** : une valeur est numérique si c'est un nombre JSON (jamais un
  booléen) ou une chaîne qui, une fois ses blancs retirés et sa PREMIÈRE
  virgule changée en point, se lit comme un décimal — signe, exposant et
  ``.5`` / ``5.`` compris ; ``Infinity`` et ``NaN`` ne sont pas des nombres ;
  les formes que Python accepterait et pas JavaScript (``1_000``) sont
  refusées. Tout calcul se fait en ``Fraction`` (exact) ; l'arrondi final
  d'un KPI est ``decimal.ROUND_HALF_UP`` à ``decimals`` — là où
  ``Math.round`` arrondit −2,5 à −2, cette voix dit −3.
- **Absence** : ``null`` et la chaîne vide (blancs compris) sont absents pour
  ``count(champ)``, ``distinct`` et les clés de jointure ; ``isnull-strict``
  ne voit que ``null``.
- **Égalité** : deux absents sont égaux ; un absent n'égale rien d'autre ;
  numérique si les deux côtés le sont ; sinon en chaîne.
- **Ordre** : numérique si les deux côtés le sont ; sinon en TEXTE, sur une
  clé de collation indépendante de la locale : ``NFD`` sans marques
  combinantes puis ``casefold`` (primaire), départagée par la forme NFD à
  casse inversée (minuscule avant majuscule, sans accent avant avec accent).
  C'est une approximation de la collation ICU de ``localeCompare`` ; une
  divergence sur une paire donnée est un constat, pas un défaut à masquer.
  Les absents vont en queue, tri stable.
- **Chaîne d'une valeur** (clés de groupe, de jointure, de pivot) : la forme
  que JavaScript donnerait — ``true`` / ``false``, entiers sans décimale,
  tableaux joints par une virgule, ``null`` en chaîne vide.
- **Hors v1** : ``derive`` (la grammaire ADR-105 est une seconde réécriture
  à part), ``class``, ``dots``, ``csv``, ``urls``, ``legend``, ``attr``,
  ``diagnostic``. Chaque attente non couverte est ÉCRITE avec sa raison.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from fractions import Fraction
from pathlib import Path
from typing import Any, Callable

RACINE = Path(__file__).resolve().parents[2]
MANIFESTS_PAR_DEFAUT = RACINE / "tools" / "oracle" / "out" / "manifests.json"
JEUX_PAR_DEFAUT = RACINE / "tests" / "verif-donnees" / "jeux"
SORTIE_PAR_DEFAUT = RACINE / "tests" / "verif-donnees" / "attendus.json"
# La PROVENANCE (version exacte de l'interpréteur) vit HORS du fichier versionné :
# `tools/oracle/out/` est ignoré par git. Voir `ecrire()`.
PROVENANCE_PAR_DEFAUT = RACINE / "tools" / "oracle" / "out" / "attendus-provenance.json"

# Les conventions écrites plus haut (ROUND_HALF_UP, Fraction, NFD/casefold)
# tiennent sur la stdlib de Python 3.11 et au-delà. En deçà, le recalcul n'est
# pas celui que le fichier d'attendus dit : on refuse plutôt que de dériver.
VERSION_MINIMALE = (3, 11)

Row = dict[str, Any]

# Séparateur d'une clé composite : le même caractère de contrôle que l'oracle TS.
SEPARATEUR_CLE = "\x1f"

DECIMALES_LIGNES = 6

GENRES_COUVERTS = ("kpi", "rows", "chart", "list", "facets", "text", "texts", "count")
RAISONS = {
    "derive": "derive : grammaire ADR-105, seconde réécriture hors v1",
    "class": "genre class : habillage par seuils, hors v1",
    "dots": "genre dots : couleurs de légende, hors v1",
    "csv": "genre csv : fichier exporté, hors v1",
    "urls": "genre urls : pas un chiffre, énoncé par le contrôle",
    "legend": "genre legend : discrétisation, hors v1",
    "attr": "genre attr : attribut relayé, hors v1",
    "diagnostic": "genre diagnostic : pas un chiffre, énoncé par le contrôle",
}


class NonCouvert(Exception):
    """Une attente que cette voix ne sait pas (encore) recalculer — dit pourquoi."""


class ErreurConfiguration(Exception):
    """Ce que la bibliothèque refuse d'émettre : l'oracle lève au lieu d'inventer."""


# ---------------------------------------------------------------------------
# Valeurs
# ---------------------------------------------------------------------------

_NOMBRE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")


def absent(v: Any) -> bool:
    """Absent ou vide : ``null``, ou une chaîne sans rien d'autre que des blancs."""
    return v is None or (isinstance(v, str) and v.strip() == "")


def to_num(v: Any) -> Fraction | None:
    """Le nombre qu'une valeur porte, EXACT, ou ``None``.

    Un booléen n'est pas un nombre (``typeof true !== 'number'``). Une chaîne
    est lue comme le fait ``Number()`` après retrait des blancs et changement
    de la première virgule en point — sans les formes que Python seul
    accepterait.
    """
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return Fraction(v)
    if isinstance(v, Decimal):
        return Fraction(v) if v.is_finite() else None
    if isinstance(v, float):
        return Fraction(v) if v == v and v not in (float("inf"), float("-inf")) else None
    if isinstance(v, Fraction):
        return v
    if not isinstance(v, str):
        return None
    t = re.sub(r"\s", "", v.strip()).replace(",", ".", 1)
    if t == "" or not _NOMBRE.match(t):
        return None
    try:
        return Fraction(Decimal(t))
    except InvalidOperation:
        return None


def str_js(v: Any) -> str:
    """La chaîne que ``String(v)`` donnerait en JavaScript."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, Fraction):
        if v.denominator == 1:
            return str(v.numerator)
        return _str_js_float(float(v))
    if isinstance(v, Decimal):
        if v == v.to_integral_value():
            return str(int(v))
        texte = str(v)
        return _str_js_float(float(v)) if "E" in texte or "e" in texte else texte
    if isinstance(v, float):
        return _str_js_float(v)
    if isinstance(v, list):
        return ",".join(str_js(x) for x in v)
    if isinstance(v, dict):
        return "[object Object]"
    return str(v)


def _str_js_float(f: float) -> str:
    if f == int(f) and abs(f) < 1e21:
        return str(int(f))
    return repr(f)


def egal(a: Any, b: Any) -> bool:
    """Deux absents sont égaux ; un absent n'égale rien ; un TABLEAU est égal dès
    qu'un de ses éléments l'est, et garde en plus son rendu texte (#953) ;
    nombres si les deux le sont ; sinon chaînes."""
    va, vb = absent(a), absent(b)
    if va or vb:
        return va and vb
    if isinstance(a, list) and any(egal(el, b) for el in a):
        return True
    na, nb = to_num(a), to_num(b)
    if na is not None and nb is not None:
        return na == nb
    return str_js(a) == str_js(b)


def replier(v: Any) -> str:
    """Sans accents, sans casse, sans blancs de bord."""
    nfd = unicodedata.normalize("NFD", str_js(v))
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn").lower().strip()


def cle_collation(s: str) -> tuple[str, str]:
    """Clé d'ordre d'un texte — la convention écrite de cette voix (voir l'en-tête)."""
    nfd = unicodedata.normalize("NFD", s)
    primaire = "".join(c for c in nfd if unicodedata.category(c) != "Mn").casefold()
    return (primaire, nfd.swapcase())


def compare(a: Any, b: Any) -> int | None:
    """Ordre : ``None`` si l'un est absent ; numérique si les deux le sont ; sinon en texte."""
    if absent(a) or absent(b):
        return None
    na, nb = to_num(a), to_num(b)
    if na is not None and nb is not None:
        return (na > nb) - (na < nb)
    ka, kb = cle_collation(str_js(a)), cle_collation(str_js(b))
    return (ka > kb) - (ka < kb)


def num_ou_none(v: Any) -> float | None:
    n = to_num(v)
    return None if n is None else float(n)


def json_pret(v: Any) -> Any:
    """Une valeur telle que le fichier d'attendus la porte : nombres en flottants, le reste tel quel."""
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v
    if isinstance(v, Fraction):
        return int(v) if v.denominator == 1 else float(v)
    if isinstance(v, Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    if isinstance(v, list):
        return [json_pret(x) for x in v]
    if isinstance(v, dict):
        return {k: json_pret(x) for k, x in v.items()}
    return v


def arrondir(n: Fraction, decimals: int) -> float:
    """Arrondi HALF_UP à ``decimals`` : la convention de cette voix, distincte de ``Math.round``."""
    d = Decimal(n.numerator) / Decimal(n.denominator)
    quantum = Decimal(1).scaleb(-decimals)
    return float(d.quantize(quantum, rounding=ROUND_HALF_UP))


# ---------------------------------------------------------------------------
# Filtres
# ---------------------------------------------------------------------------


def passe_filtre(row: Row, f: dict[str, Any]) -> bool:
    op = f["op"]
    if op == "or":
        # Le OU entre champs (#1026) : la ligne passe dès qu'UN filtre passe —
        # miroir de la clause multi-champs `a|b:op:valeur` de la bibliothèque.
        return any(passe_filtre(row, g) for g in f["any"])
    v = row.get(f["field"])
    if op == "isnotnull":
        return not absent(v)
    if op == "isnull":
        return absent(v)
    if op == "isnull-strict":
        return v is None
    if op == "isnotnull-strict":
        return v is not None
    if op == "in":
        return any(egal(v, c) for c in f["values"])
    if op == "notin":
        return not any(egal(v, c) for c in f["values"])
    fold = bool(f.get("fold"))
    if op == "eq":
        return replier(v) == replier(f["value"]) if fold else egal(v, f["value"])
    if op == "eq-strict":
        # L'égalité de la FORME TEXTE (PG-030) : '1' et 1 s'écrivent pareil,
        # '01' non ; un absent n'égale rien. Aucune lecture numérique.
        return not absent(v) and str_js(v) == str_js(f["value"])
    if op == "neq":
        # Logique SQL à TROIS VALEURS (#958) : une valeur ABSENTE ne satisfait
        # NI `eq` NI `neq`. Mesuré le 2026-09-20 sur data.education.gouv.fr,
        # champ `themes_attendus` (176 lignes, 21 nulles) : `= "Elèves"` -> 124,
        # `!= "Elèves"` -> 31 (= 155 − 124), et non 52. La chaîne VIDE reste
        # une valeur, d'où le test strict et non `absent()`.
        # `notin` garde les absents : il se délègue en `NOT … in (…)`, une
        # négation booléenne que le portail rend à 52.
        return v is not None and not egal(v, f["value"])
    if op in ("contains", "notcontains"):
        if fold:
            trouve = replier(f["value"]) in replier(v)
        else:
            trouve = str_js(f["value"]).lower() in str_js(v).lower()
        return trouve if op == "contains" else not trouve
    c = compare(v, f["value"])
    if c is None:
        return False
    return {"gt": c > 0, "gte": c >= 0, "lt": c < 0, "lte": c <= 0}[op]


def appliquer_filtres(rows: list[Row], filtres: Any) -> list[Row]:
    if not filtres:
        return rows
    liste = filtres if isinstance(filtres, list) else [filtres]
    return [r for r in rows if all(passe_filtre(r, f) for f in liste)]


# ---------------------------------------------------------------------------
# Agrégats
# ---------------------------------------------------------------------------


def valeur_bout(rows: list[Row], field: str, bout: str) -> Any:
    if not rows:
        return None
    return (rows[0] if bout == "first" else rows[-1]).get(field)


def agreger(rows: list[Row], agg: str, field: str | None, weight: str | None = None) -> Fraction | None:
    if agg == "count":
        if not field:
            return Fraction(len(rows))
        return Fraction(sum(1 for r in rows if not absent(r.get(field))))
    if not field:
        raise ErreurConfiguration(f"{agg} exige un champ")
    if agg == "distinct":
        return Fraction(len({str_js(r.get(field)) for r in rows if not absent(r.get(field))}))
    if agg == "wavg":
        if not weight:
            raise ErreurConfiguration("wavg exige un champ de pondération")
        num, den = Fraction(0), Fraction(0)
        for r in rows:
            v, w = to_num(r.get(field)), to_num(r.get(weight))
            if v is None or w is None:
                continue
            num += v * w
            den += w
        return None if den == 0 else num / den
    if agg == "evolution":
        nums = [n for n in (to_num(r.get(field)) for r in rows) if n is not None]
        if len(nums) < 2 or nums[0] == 0:
            return None
        return (nums[-1] - nums[0]) / nums[0]
    if agg in ("first", "last"):
        return to_num(valeur_bout(rows, field, agg))
    nums = [n for n in (to_num(r.get(field)) for r in rows) if n is not None]
    if not nums:
        return None
    if agg == "sum":
        return sum(nums, Fraction(0))
    if agg == "avg":
        return sum(nums, Fraction(0)) / len(nums)
    if agg == "min":
        return min(nums)
    if agg == "max":
        return max(nums)
    raise ErreurConfiguration(f"agrégat inconnu : {agg}")


def agreger_texte(rows: list[Row], agg: str, field: str) -> str | None:
    """Agrégat rendu en TEXTE (dates ISO) : bouts dans l'ordre reçu, min/max en chaîne."""
    if agg in ("first", "last"):
        v = valeur_bout(rows, field, agg)
        return None if absent(v) else str_js(v)
    valeurs = [str_js(r.get(field)) for r in rows if not absent(r.get(field))]
    if not valeurs:
        return None
    if agg == "min":
        return min(valeurs)
    if agg == "max":
        return max(valeurs)
    raise ErreurConfiguration(f"{agg} ne rend pas un texte")


def iso_vers_fr(value: str) -> str | None:
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", value.strip())
    return None if m is None else f"{m.group(3)}/{m.group(2)}/{m.group(1)}"


def appliquer_spec(rows: list[Row], spec: dict[str, Any]) -> Fraction | None:
    return agreger(appliquer_filtres(rows, spec.get("filter")), spec["agg"], spec.get("field"), spec.get("weight"))


# ---------------------------------------------------------------------------
# Étapes
# ---------------------------------------------------------------------------


def cle_groupe(v: Any) -> str:
    return "" if v is None else str_js(v)


def group_by(rows: list[Row], by: Any, columns: dict[str, Any]) -> list[Row]:
    champs = by if isinstance(by, list) else [by]
    groupes: dict[str, tuple[list[str], list[Row]]] = {}
    for r in rows:
        cles = [cle_groupe(r.get(f)) for f in champs]
        k = SEPARATEUR_CLE.join(cles)
        if k in groupes:
            groupes[k][1].append(r)
        else:
            groupes[k] = (cles, [r])
    out: list[Row] = []
    for cles, membres in groupes.values():
        row: Row = {f: cles[i] for i, f in enumerate(champs)}
        for nom, spec in columns.items():
            row[nom] = appliquer_spec(membres, spec)
        out.append(row)
    return out


def agregat_global(rows: list[Row], columns: dict[str, Any]) -> list[Row]:
    return [{nom: appliquer_spec(rows, spec) for nom, spec in columns.items()}]


def order_by_keys(rows: list[Row], keys: list[dict[str, str]]) -> list[Row]:
    """Tri stable à plusieurs clés, absents en queue — même convention que l'oracle TS."""
    import functools

    def comparer(a: tuple[int, Row], b: tuple[int, Row]) -> int:
        for k in keys:
            col, sens = k["column"], k["dir"]
            c = compare(a[1].get(col), b[1].get(col))
            if c is None or c == 0:
                va, vb = absent(a[1].get(col)), absent(b[1].get(col))
                if va != vb:
                    return 1 if va else -1
                continue
            return -c if sens == "desc" else c
        return a[0] - b[0]

    return [r for _, r in sorted(enumerate(rows), key=functools.cmp_to_key(comparer))]


def running_sum(rows: list[Row], champ: str, alias: str) -> list[Row]:
    total = Fraction(0)
    out = []
    for r in rows:
        v = to_num(r.get(champ))
        if v is not None:
            total += v
        out.append({**r, alias: total})
    return out


def diff(rows: list[Row], champ: str, alias: str) -> list[Row]:
    precedent: Fraction | None = None
    out = []
    for i, r in enumerate(rows):
        v = to_num(r.get(champ))
        ecart = None if i == 0 or v is None or precedent is None else v - precedent
        precedent = v
        out.append({**r, alias: ecart})
    return out


def share(rows: list[Row], champ: str, alias: str, echelle: Fraction) -> list[Row]:
    """Part du total (#926) : valeur / somme de la colonne sur toutes les lignes reçues.

    ``echelle`` vaut 100 pour une part en points de pourcentage
    (``share_percent``). Total nul, ou valeur non numérique : ``None``.
    """
    valeurs = [to_num(r.get(champ)) for r in rows]
    total = sum((v for v in valeurs if v is not None), Fraction(0))
    out = []
    for r, v in zip(rows, valeurs):
        out.append({**r, alias: None if v is None or total == 0 else (v / total) * echelle})
    return out


def ratio(rows: list[Row], num: str, den: str, alias: str) -> list[Row]:
    out = []
    for r in rows:
        n, d = to_num(r.get(num)), to_num(r.get(den))
        out.append({**r, alias: None if n is None or d is None or d == 0 else n / d})
    return out


def cle_jointure(row: Row, champs: list[str]) -> str | None:
    segments = []
    for f in champs:
        v = row.get(f)
        if absent(v):
            return None
        segments.append(str_js(v))
    return "|".join(segments)


def champs_jointure(on: str) -> list[tuple[str, str]]:
    paires = []
    for part in on.split(","):
        morceaux = [s.strip() for s in part.split("=")]
        gauche = morceaux[0]
        droite = morceaux[1] if len(morceaux) > 1 else gauche
        paires.append((gauche, droite))
    return paires


def join_rows(left: list[Row], right: list[Row], on: str, type_: str = "left", prefix: str = "right_") -> list[Row]:
    paires = champs_jointure(on)
    champs_gauche = [g for g, _ in paires]
    champs_droite = [d for _, d in paires]
    cles = set(champs_gauche) | set(champs_droite)
    collisions: set[str] = set()
    if left and right:
        for nom in right[0]:
            if nom in left[0] and nom not in cles:
                collisions.add(nom)
    droite_vers_gauche = {d: g for g, d in paires}

    def fusionner(l: Row | None, r: Row | None) -> Row:
        out: Row = {}
        if l:
            out.update(l)
        if r:
            for nom, valeur in r.items():
                if nom in droite_vers_gauche:
                    if not l:
                        out[droite_vers_gauche[nom]] = valeur
                    continue
                out[f"{prefix}{nom}" if nom in collisions else nom] = valeur
        return out

    def indexer(rows: list[Row], champs: list[str]) -> dict[str, list[Row]]:
        index: dict[str, list[Row]] = {}
        for r in rows:
            k = cle_jointure(r, champs)
            if k is None:
                continue
            index.setdefault(k, []).append(r)
        return index

    index_droite = indexer(right, champs_droite)
    out: list[Row] = []
    if type_ == "right":
        index_gauche = indexer(left, champs_gauche)
        for r in right:
            k = cle_jointure(r, champs_droite)
            apparies = None if k is None else index_gauche.get(k)
            if not apparies:
                out.append(fusionner(None, r))
                continue
            for l in apparies:
                out.append(fusionner(l, r))
        return out
    appariees: set[str] = set()
    for l in left:
        k = cle_jointure(l, champs_gauche)
        apparies = None if k is None else index_droite.get(k)
        if not apparies:
            if type_ in ("left", "full"):
                out.append(fusionner(l, None))
            continue
        appariees.add(k)  # type: ignore[arg-type]
        for r in apparies:
            out.append(fusionner(l, r))
    if type_ == "full":
        for r in right:
            k = cle_jointure(r, champs_droite)
            if k is None or k not in appariees:
                out.append(fusionner(None, r))
    return out


def cellule_vide(v: Any) -> bool:
    return v is None or v == ""


def reduire_cellule(valeurs: list[Any], agg: str) -> Any:
    if not valeurs:
        return None
    if agg == "count":
        return Fraction(sum(1 for v in valeurs if not cellule_vide(v)))
    if agg == "first":
        return valeurs[0]
    if agg == "last":
        return valeurs[-1]
    nombres = [n for n in (to_num(v) for v in valeurs) if n is not None]
    if agg == "sum":
        return sum(nombres, Fraction(0)) if nombres else None
    if agg == "avg":
        return sum(nombres, Fraction(0)) / len(nombres) if nombres else None
    if nombres:
        return min(nombres) if agg == "min" else max(nombres)
    textes = [str_js(v) for v in valeurs if not cellule_vide(v)]
    if not textes:
        return None
    return min(textes) if agg == "min" else max(textes)


def pivot_rows(rows: list[Row], o: dict[str, Any]) -> list[Row]:
    champs_ligne = o["row"] if isinstance(o["row"], list) else [o["row"]]
    agg = o.get("aggregate") or "sum"
    gabarit = o.get("columnFormat") or "{value}"
    brutes: list[str] = []
    groupes: dict[str, tuple[Row, dict[str, list[Any]]]] = {}
    for r in rows:
        brut = r.get(o["column"])
        if cellule_vide(brut):
            continue
        col = str_js(brut)
        if col not in brutes:
            brutes.append(col)
        k = json.dumps([str_js(r.get(f)) if r.get(f) is not None else None for f in champs_ligne])
        if k not in groupes:
            groupes[k] = ({f: r.get(f) for f in champs_ligne}, {})
        groupes[k][1].setdefault(col, []).append(r.get(o["value"]))
    ordonnees = list(brutes)
    if o.get("columnOrder"):
        tout_numerique = all(to_num(v) is not None for v in brutes)
        if tout_numerique:
            ordonnees.sort(key=lambda v: to_num(v))  # type: ignore[arg-type,return-value]
        else:
            ordonnees.sort(key=cle_collation)
        if o["columnOrder"] == "desc":
            ordonnees.reverse()
    nom_de: dict[str, str] = {}
    for brut in ordonnees:
        nom = gabarit.replace("{value}", brut)
        if nom in champs_ligne:
            raise ErreurConfiguration(f"pivot : la colonne générée « {nom} » porte le nom d'un champ de « row »")
        if nom in nom_de.values():
            raise ErreurConfiguration(f"pivot : deux valeurs de « {o['column']} » produisent la colonne « {nom} »")
        nom_de[brut] = nom
    out: list[Row] = []
    for porte, cellules in groupes.values():
        ligne: Row = dict(porte)
        for brut in ordonnees:
            valeurs = cellules.get(brut)
            ligne[nom_de[brut]] = reduire_cellule(valeurs, agg) if valeurs else None
        out.append(ligne)
    return out


def unpivot_rows(rows: list[Row], o: dict[str, Any]) -> list[Row]:
    var_name = o.get("varName") or "variable"
    value_name = o.get("valueName") or "value"
    out: list[Row] = []
    for r in rows:
        porte = {f: r.get(f) for f in o["idCols"]}
        for vc in o["valueCols"]:
            cellule = r.get(vc["column"])
            if o.get("dropEmpty") and cellule_vide(cellule):
                continue
            out.append({**porte, var_name: vc.get("as") or vc["column"], value_name: cellule})
    return out


def concat_rows(datasets: dict[str, list[Row]], sources: list[str], origin_field: str | None, labels: dict[str, str]) -> list[Row]:
    jeux = [datasets.get(nom, []) for nom in sources]
    reference = next((i for i, rows in enumerate(jeux) if rows), -1)
    if reference != -1:
        attendu = {c for r in jeux[reference] for c in r}
        for i, rows in enumerate(jeux):
            if i == reference or not rows:
                continue
            schema = {c for r in rows for c in r}
            if schema != attendu:
                raise ErreurConfiguration(f"empilement : schémas divergents entre « {sources[reference]} » et « {sources[i]} »")
        if origin_field and any(origin_field in r for rows in jeux for r in rows):
            raise ErreurConfiguration(f"empilement : la colonne de provenance « {origin_field} » écraserait une colonne des données")
    out: list[Row] = []
    for nom in sources:
        if nom not in datasets:
            raise ErreurConfiguration(f"empilement : jeu « {nom} » absent du feed")
        for r in datasets[nom]:
            out.append({**r, origin_field: labels.get(nom, nom)} if origin_field else dict(r))
    return out


def derouler(datasets: dict[str, list[Row]], steps: list[dict[str, Any]], depart: str = "main") -> list[Row]:
    rows = list(datasets.get(depart, []))
    for s in steps:
        op = s["op"]
        if op == "filter":
            rows = appliquer_filtres(rows, s["filters"])
        elif op == "group-by":
            rows = group_by(rows, s["by"], s["columns"])
        elif op == "global":
            rows = agregat_global(rows, s["columns"])
        elif op == "order-by":
            rows = order_by_keys(rows, [{"column": s["column"], "dir": s["dir"]}])
        elif op == "order-by-keys":
            rows = order_by_keys(rows, s["keys"])
        elif op == "limit":
            rows = rows[: s["n"]]
        elif op == "page":
            rows = rows[(s["number"] - 1) * s["size"] : s["number"] * s["size"]]
        elif op == "running":
            rows = running_sum(rows, s["from"], s["as"]) if s["kind"] == "running_sum" else diff(rows, s["from"], s["as"])
        elif op == "share":
            rows = share(rows, s["from"], s["as"], Fraction(s.get("scale") or 1))
        elif op == "ratio":
            rows = ratio(rows, s["numerator"], s["denominator"], s["as"])
        elif op == "join":
            if s["right"] not in datasets:
                raise ErreurConfiguration(f"jointure : jeu « {s['right']} » absent du feed")
            rows = join_rows(rows, datasets[s["right"]], s["on"], s.get("type", "left"), s.get("prefixRight", "right_"))
        elif op == "pivot":
            rows = pivot_rows(rows, s)
        elif op == "unpivot":
            rows = unpivot_rows(rows, s)
        elif op == "concat":
            rows = concat_rows(datasets, s["sources"], s.get("originField"), s.get("originLabels") or {})
        elif op == "explode":
            # Une ligne par valeur du tableau ; rien pour une ligne sans tableau.
            rows = [{**r, s["field"]: valeur} for r in rows if isinstance(r.get(s["field"]), list) for valeur in r[s["field"]]]
        elif op == "derive":
            raise NonCouvert(RAISONS["derive"])
        else:
            raise NonCouvert(f"étape inconnue : {op}")
    return rows


# ---------------------------------------------------------------------------
# Attentes
# ---------------------------------------------------------------------------


def attendu_de(e: dict[str, Any], datasets: dict[str, list[Row]]) -> dict[str, Any]:
    """L'attendu d'UNE attente : ``valeur`` (et ``brut`` avant arrondi, ``decimals``) selon le genre."""
    genre = e["kind"]
    if genre not in GENRES_COUVERTS:
        raise NonCouvert(RAISONS.get(genre, f"genre non couvert : {genre}"))
    depart = e.get("from") or "main"
    rows = derouler(datasets, e.get("pipeline") or [], depart)

    if genre == "kpi":
        filtrees = appliquer_filtres(rows, e.get("filter"))
        if e.get("as") == "date":
            brut = agreger_texte(filtrees, e["agg"], e.get("field") or "")
            return {"valeur": None if brut is None else iso_vers_fr(brut), "decimals": 0}
        n = agreger(filtrees, e["agg"], e.get("field"), e.get("weight"))
        decimals = int(e.get("decimals") or 0)
        if n is None:
            return {"valeur": None, "brut": None, "decimals": decimals}
        n = n * Fraction(Decimal(str(e["scale"]))) if e.get("scale") is not None else n
        return {"valeur": arrondir(n, decimals), "brut": json_pret(n), "decimals": decimals}

    if genre == "rows":
        cles = e["key"] if isinstance(e["key"], list) else [e["key"]]
        projetees = []
        for r in rows:
            ligne: Row = {k: cle_groupe(r.get(k)) for k in cles}
            for c in e["columns"]:
                ligne[c] = num_ou_none(r.get(c))
            projetees.append(ligne)
        return {"valeur": projetees}

    if genre == "chart":
        return {
            "valeur": {
                "labels": [cle_groupe(r.get(e["labelColumn"])) for r in rows],
                "series": [[num_ou_none(r.get(col)) for r in rows] for col in e["valueColumns"]],
            }
        }

    if genre == "list":
        colonnes = [c["column"] for c in e["columns"]]
        return {
            "valeur": [{c: json_pret(r.get(c)) for c in colonnes} for r in rows],
            "decimals": int(e.get("decimals") or DECIMALES_LIGNES),
        }

    if genre == "facets":
        return {
            "valeur": [
                {"value": cle_groupe(r.get(e["valueColumn"])), "count": num_ou_none(r.get(e["countColumn"]))}
                for r in rows
            ]
        }

    if genre == "text":
        decimals = int(e.get("decimals") or 0)
        if e.get("numeric"):
            if e.get("agg"):
                n = agreger(rows, e["agg"], e.get("field"))
            else:
                rang = int(e.get("row") or 0)
                n = to_num(rows[rang].get(e.get("column") or "")) if rang < len(rows) else None
            if n is None:
                return {"valeur": None, "brut": None, "decimals": decimals}
            return {"valeur": arrondir(n, decimals), "brut": json_pret(n), "decimals": decimals}
        rang = int(e.get("row") or 0)
        brut = rows[rang].get(e["column"]) if e.get("column") is not None and rang < len(rows) else None
        milieu = "" if brut is None else str_js(brut)
        return {"valeur": f"{e.get('prefix') or ''}{milieu}{e.get('suffix') or ''}"}

    if genre == "count":
        # Éléments tracés (#1059) : une forme par ligne que le recalcul laisse.
        return {"valeur": len(rows)}

    # texts
    facteur = Fraction(Decimal(str(e["scale"]))) if e.get("scale") is not None else Fraction(1)
    valeurs: list[Any] = []
    for r in rows:
        brut = r.get(e["column"])
        if not e.get("numeric"):
            valeurs.append("" if brut is None else str_js(brut))
            continue
        n = to_num(brut)
        valeurs.append(None if n is None else json_pret(n * facteur))
    return {"valeur": valeurs, "decimals": int(e.get("decimals") or 0)}


# ---------------------------------------------------------------------------
# Invariants (#881) — la référence vient des lignes BRUTES ; « tenu » dit si
# le recalcul de CETTE voix les respecte (un invariant que l'oracle viole
# lui-même est mal posé, ou volontairement violé — le canari 1-N).
# ---------------------------------------------------------------------------


def lignes_brutes(datasets: dict[str, list[Row]], depuis: Any) -> list[Row]:
    noms = ["main"] if depuis is None else (depuis if isinstance(depuis, list) else [depuis])
    out: list[Row] = []
    for nom in noms:
        if nom not in datasets:
            raise ErreurConfiguration(f"invariant : jeu « {nom} » absent du feed")
        out.extend(datasets[nom])
    return out


def cle_de(row: Row, key: Any) -> str:
    champs = key if isinstance(key, list) else [key]
    return " | ".join(str_js(row.get(k)) for k in champs)


def reference_invariant(inv: dict[str, Any], datasets: dict[str, list[Row]]) -> dict[str, Any]:
    kind = inv["kind"]
    if kind == "sum-preserved":
        nums = [n for n in (to_num(r.get(inv["field"])) for r in lignes_brutes(datasets, inv.get("from"))) if n is not None]
        return {"sum": json_pret(sum(nums, Fraction(0))) if nums else None}
    if kind in ("count-preserved", "not-truncated"):
        return {"count": len(lignes_brutes(datasets, inv.get("from")))}
    if kind == "null-group":
        brutes = lignes_brutes(datasets, inv.get("from"))
        nuls = sum(1 for r in brutes if absent(r.get(inv["field"])))
        return {"nullCount": nuls, "nonNullCount": len(brutes) - nuls}
    if kind == "null-stays-null":
        brutes = lignes_brutes(datasets, inv.get("from"))
        champ = inv.get("rawField") or inv["field"]
        sans = [r for r in brutes if absent(r.get(champ))]
        ref: dict[str, Any] = {"nullCount": len(sans)}
        if inv.get("key"):
            ref["nullKeys"] = [cle_de(r, inv["key"]) for r in sans]
        return ref
    return {}


def lignes_de(e: dict[str, Any], attendu: dict[str, Any]) -> list[Row] | None:
    """Les lignes que le recalcul de cette voix a produites, quel que soit le genre."""
    genre = e["kind"]
    v = attendu.get("valeur")
    if genre in ("kpi", "text"):
        return [{"value": attendu.get("brut")}]
    if genre in ("rows", "list"):
        return list(v) if isinstance(v, list) else None
    if genre == "chart" and isinstance(v, dict):
        return [
            {e["labelColumn"]: label, **{col: v["series"][s][i] for s, col in enumerate(e["valueColumns"])}}
            for i, label in enumerate(v["labels"])
        ]
    if genre == "facets" and isinstance(v, list):
        return [{e["valueColumn"]: x["value"], e["countColumn"]: x["count"]} for x in v]
    return None


def tenu(inv: dict[str, Any], ref: dict[str, Any], lignes: list[Row], genre: str) -> bool | None:
    kind = inv["kind"]
    if kind == "sum-preserved":
        nums = [n for n in (to_num(r.get(inv["field"])) for r in lignes) if n is not None]
        somme = sum(nums, Fraction(0)) if nums else None
        if somme is None or ref.get("sum") is None:
            return somme is None and ref.get("sum") is None
        return abs(somme - Fraction(str(ref["sum"]))) <= Fraction(1, 2 * 10**DECIMALES_LIGNES)
    if kind == "count-preserved":
        return len(lignes) == ref["count"]
    if kind == "count-equals":
        return len(lignes) == inv["n"]
    if kind == "null-group":
        vides = [r for r in lignes if absent(r.get(inv["field"]))]
        compte = inv.get("count")

        def total(rows: list[Row]) -> Fraction:
            return sum((to_num(r.get(compte)) or Fraction(0) for r in rows), Fraction(0))

        if inv["expect"] == "visible":
            return len(vides) > 0 and (compte is None or total(vides) == ref["nullCount"])
        return len(vides) == 0 and (compte is None or total(lignes) == ref["nonNullCount"])
    if kind == "bounded":
        champ = "value" if genre in ("kpi", "text") else (inv.get("field") or "value")
        valeurs = [n for n in (to_num(r.get(champ)) for r in lignes) if n is not None]
        if not valeurs:
            return False
        lo, hi = inv.get("min"), inv.get("max")
        return all((lo is None or v >= lo) and (hi is None or v <= hi) for v in valeurs)
    if kind == "null-stays-null":
        if inv.get("key") and "nullKeys" in ref:
            par_cle = {cle_de(r, inv["key"]): r for r in lignes}
            return all(k not in par_cle or absent(par_cle[k].get(inv["field"])) for k in ref["nullKeys"])
        return sum(1 for r in lignes if absent(r.get(inv["field"]))) >= ref["nullCount"]
    if kind == "not-truncated":
        # Tenu si toutes les lignes sont là — OU si la bibliothèque l'a DIT,
        # ce que seule la page sait : hors de la page, l'invariant reste
        # indéterminé dès que le compte diffère.
        recues = to_num(lignes[0].get("value")) if genre in ("kpi", "text") and lignes else Fraction(len(lignes))
        return True if recues == ref["count"] else None
    return None


def invariants_de(e: dict[str, Any], attendu: dict[str, Any] | None, datasets: dict[str, list[Row]]) -> list[dict[str, Any]]:
    out = []
    lignes = lignes_de(e, attendu) if attendu is not None else None
    for inv in e.get("invariants") or []:
        entree: dict[str, Any] = {"kind": inv["kind"]}
        if inv.get("field"):
            entree["field"] = inv["field"]
        try:
            ref = reference_invariant(inv, datasets)
        except ErreurConfiguration as erreur:
            entree["erreur"] = str(erreur)
            out.append(entree)
            continue
        entree["reference"] = ref
        entree["tenu"] = None if lignes is None else tenu(inv, ref, lignes, e["kind"])
        if inv.get("skip"):
            entree["attente"] = True
        out.append(entree)
    return out


# ---------------------------------------------------------------------------
# Programme
# ---------------------------------------------------------------------------


def charger_jeux(dossier: Path) -> dict[str, list[Row]]:
    jeux: dict[str, list[Row]] = {}
    for fichier in sorted(dossier.glob("*.json")):
        with fichier.open(encoding="utf-8") as f:
            # Les décimaux sont lus EXACTS (Decimal), jamais en flottant binaire :
            # c'est ce qui fait de cette voix une voix exacte.
            jeux[fichier.stem] = json.load(f, parse_float=Decimal)
    return jeux


def calculer(projection: dict[str, Any], jeux: dict[str, list[Row]]) -> list[dict[str, Any]]:
    attendus: list[dict[str, Any]] = []
    for check in projection["checks"]:
        datasets = {nom: jeux[fichier] for nom, fichier in check["datasets"].items()}
        for e in check["expects"]:
            entree: dict[str, Any] = {
                "domaine": check["domaine"],
                "controle": check["id"],
                "cle": e["cle"],
                "kind": e["kind"],
            }
            attendu: dict[str, Any] | None = None
            try:
                attendu = attendu_de(e, datasets)
                entree.update(attendu)
                entree["couvert"] = True
            except NonCouvert as raison:
                entree["couvert"] = False
                entree["raison"] = str(raison)
            except ErreurConfiguration as erreur:
                entree["couvert"] = False
                entree["raison"] = f"erreur de configuration : {erreur}"
            # Les invariants (#881) : leur référence ne dépend que des lignes
            # brutes, elle est écrite même quand la valeur n'est pas couverte.
            if e.get("invariants"):
                entree["invariants"] = invariants_de(e, attendu, datasets)
            attendus.append(entree)
    return attendus


def ecrire(attendus: list[dict[str, Any]], sortie: Path, provenance: Path, python_version: str) -> None:
    """Une entrée par ligne — un fichier d'attendus se relit comme un tableau, et se diffe ligne à ligne.

    Le fichier versionné ne porte QUE des chiffres et les conventions qui les
    produisent : aucune métadonnée d'environnement. Le job `attendus` de
    `verif-donnees.yml` régénère et refuse un diff (`git diff --exit-code`) —
    tant que la version de l'interpréteur vivait dans l'en-tête, ce garde-fou
    échouait dès que le runner n'avait pas le Python de l'auteur (3.12.3 contre
    3.11.5), sur une ligne d'en-tête, toutes les valeurs égales par ailleurs.
    Un contrôle de conformité qui devient instable est un contrôle qu'on
    abandonne : la version part donc dans un fichier de PROVENANCE, à côté des
    autres sorties de l'oracle (`tools/oracle/out/`, ignoré par git), où elle
    reste lisible sans être comparée.
    """
    couverts = sum(1 for a in attendus if a["couvert"])
    raisons: dict[str, int] = {}
    for a in attendus:
        if not a["couvert"]:
            raisons[a["raison"]] = raisons.get(a["raison"], 0) + 1
    entete = {
        "source": "python-stdlib",
        "conventions": {
            "arrondi": "decimal.ROUND_HALF_UP à decimals (Math.round arrondit -2,5 à -2 ; cette voix dit -3)",
            "sommes": "fractions.Fraction, exactes, décimaux lus en Decimal",
            "ordre": "numérique si les deux côtés le sont ; sinon NFD sans marques combinantes puis casefold, départagé par la forme NFD à casse inversée ; absents en queue ; tri stable",
            "absence": "null et chaîne vide (blancs compris) ; isnull-strict ne voit que null",
            "horsV1": sorted(set(RAISONS.values())),
        },
        "couverture": {"total": len(attendus), "couverts": couverts, "nonCouverts": dict(sorted(raisons.items()))},
    }
    lignes = [json.dumps(entete, ensure_ascii=False, sort_keys=True)]
    lignes.extend(json.dumps(a, ensure_ascii=False) for a in attendus)
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text("[\n" + ",\n".join(lignes) + "\n]\n", encoding="utf-8")
    provenance.parent.mkdir(parents=True, exist_ok=True)
    provenance.write_text(
        json.dumps(
            {
                "source": "python-stdlib",
                "python": python_version,
                "implementation": sys.implementation.name,
                "attendus": str(sortie.relative_to(RACINE)),
                "total": len(attendus),
                "couverts": couverts,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--manifests", type=Path, default=MANIFESTS_PAR_DEFAUT)
    parser.add_argument("--jeux", type=Path, default=JEUX_PAR_DEFAUT)
    parser.add_argument("--out", type=Path, default=SORTIE_PAR_DEFAUT)
    parser.add_argument("--provenance", type=Path, default=PROVENANCE_PAR_DEFAUT)
    args = parser.parse_args(argv)
    if sys.version_info[:2] < VERSION_MINIMALE:
        vue = ".".join(str(n) for n in sys.version_info[:3])
        attendue = ".".join(str(n) for n in VERSION_MINIMALE)
        print(f"Python {attendue}+ requis (stdlib seule) ; interpréteur vu : {vue}.", file=sys.stderr)
        return 2
    if not args.manifests.exists():
        print(f"{args.manifests} absent : lancer d'abord `npm run verif:manifests`.", file=sys.stderr)
        return 2
    with args.manifests.open(encoding="utf-8") as f:
        projection = json.load(f)
    jeux = charger_jeux(args.jeux)
    attendus = calculer(projection, jeux)
    version = ".".join(str(n) for n in sys.version_info[:3])
    ecrire(attendus, args.out, args.provenance, version)
    couverts = sum(1 for a in attendus if a["couvert"])
    print(f"{couverts}/{len(attendus)} attentes couvertes par la troisième voix → {args.out}")
    print(f"provenance (hors zone gardée) : Python {version} → {args.provenance}")
    for a in attendus:
        if not a["couvert"]:
            print(f"  non couvert : {a['domaine']}/{a['controle']}/{a['cle']} — {a['raison']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
