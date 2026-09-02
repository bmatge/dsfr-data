#!/usr/bin/env bash
# Lint des libellés d'interface — BLOQUANT depuis le lot UX 3 (#540, epic #546).
#
# Deux contrôles, sur les sources HTML et TS (templates HTML embarqués) :
#
#  1. ACCENTS — mots français écrits sans accent (liste PATTERNS), cherchés
#     UNIQUEMENT dans le CONTENU TEXTUEL DES BALISES, c.-à-d. entre un « > »
#     et un « < » (décision 2026-05-30, élargie 2026-06-19). Ce filtre exclut
#     mécaniquement le code, les attributs, les URLs et les commentaires, et
#     permet de scanner les .ts sans faux positifs sur les identifiants.
#
#  2. FORMES PROSCRITES — libellés remplacés par le lexique canonique de
#     `docs/ux/actions.md` §3 (liste FORBIDDEN, sensible à la casse), cherchés
#     dans le contenu des balises ET dans les valeurs entre guillemets
#     (attributs `title="…"`, `aria-label='…'`, littéraux JS '…' / "…"),
#     puisqu'un libellé posé par script (`textContent = 'Sauvegarder'`) ou
#     un `title` sont aussi des chaînes d'interface. Les commentaires sans
#     guillemets ne sont pas concernés.
#
# Périmètre des fichiers scannés :
#  - HTML : apps/, packages/, specs/, guide/  (**/*.html)
#  - TS   : apps/, packages/                  (**/*.ts)
#  Exclus : dist/, node_modules/, *.min.*, et tests/ (hors apps|packages).
#  Les artefacts générés (skills-reference.generated.ts…) SONT scannés : on
#  corrige le générateur, jamais la sortie.
#
# Sortie : exit 1 dès qu'un hit subsiste (CI bloquante).
#
# Run locally: bash scripts/check-french-accents.sh
# Or via npm:  npm run check:accents
#
# Maintenance : ne pas ajouter de pattern ambigu avec l'anglais dans le
# contenu de balise (selection, generation, definition…) — traiter au cas par
# cas en revue. Une forme proscrite s'ajoute ici ET dans actions.md §3.

set -euo pipefail

# ---------------------------------------------------------------------------
# 1. Accents — mots sans accent qui n'ont aucun sens anglais / identifiant.
# Sorted, deduped. Word boundaries applied by `git grep -wE` below.
# Excluded for bilingual overlap (would false-positive on English source):
#   present, presente, presents, presentes — "present" is also valid English.
#   series, Series — also valid English AND appears in HTML identifiers
#                    (`extra-series-container`, etc.). Singular `serie`/`Serie`
#                    is unambiguously French.
#   selection, generation, definition — handled case-by-case (not auto-checkable).
PATTERNS=(
  agreger Agreger agregation Agregation agregations Agregations agrege agreges
  accessibilite Accessibilite
  apercu Apercu
  bibliotheque Bibliotheque
  caractere Caractere caracteres
  categorie Categorie categories Categories categoriel Categoriel categorielle categorielles
  cle Cle cles Cles
  creer Creer creee creees crees
  deja Deja
  defaut Defaut
  defini definie definis definies
  degrade Degrade
  Detail
  detecte detectee detectes
  donnees Donnees
  ecran Ecran ecrans
  echec Echec echoue
  Etat Etats
  evenement Evenement evenements Evenements
  executer Executer
  genere Genere generes generer Generer generee generees
  generateur Generateur
  guidee Guidee
  meme Meme memes
  methode Methode methodes Methodes
  numerique Numerique numeriques
  parametre Parametre parametres Parametres
  prefere Prefere
  prevu prevue prevus prevues
  previsualiser Previsualiser previsualisation
  realise realisee realisees
  recupere
  Reference
  reglages Reglages
  reinitialiser Reinitialiser
  reorganiser Reorganiser
  requete Requete requetes
  reussi reussie reussite Reussite
  revoquer Revoquer
  Role
  selectionne selectionnez Selectionnez selectionner Selectionner selectionnee selectionnes
  serie Serie
  specifique Specifique specifiques
  telecharge telechargee telecharger Telecharger telechargement Telechargement telechargements
  validite
  verifie verifier Verifier verifiez Verifiez
)

# ---------------------------------------------------------------------------
# 2. Formes proscrites (docs/ux/actions.md §3) — ERE, sensibles à la casse.
# Les formes qui deviendront des entrées de menu (Export CSV, Exporter HTML,
# Exporter vers Grist, Ouvrir dans Dashboard, Utiliser dans le Builder) sont
# reportées à l'arrivée de l'AppActionBar (lots 2/4) — ne pas les ajouter ici
# avant.
FORBIDDEN=(
  'Sauvegarder'
  'Garder en favori'
  'Obtenir le code'
  'Générer le graphique'
  'Repartir de zéro'
  'Rafraîchir'
  '\+ Deps'
  'Visual Dashboard Editor'
)

SCOPE=(
  "apps/**/*.html" "packages/**/*.html" "specs/**/*.html" "guide/**/*.html"
  "apps/**/*.ts" "packages/**/*.ts"
  ':!**/dist/**' ':!**/node_modules/**' ':!**/*.min.*'
)

# nosemgrep: bash.lang.security.ifs-tampering.ifs-tampering
joined=$(IFS='|'; echo "${PATTERNS[*]}")
# nosemgrep: bash.lang.security.ifs-tampering.ifs-tampering
forbidden=$(IFS='|'; echo "${FORBIDDEN[*]}")

# Garde les lignes dont un segment « >…< » contient le motif ($1 = ERE, -w).
filter_tag_content() {
  local pattern=$1 line content tagtext
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    content=${line#*:*:}
    tagtext=$(printf '%s' "$content" | grep -oE '>[^<>]+<' || true)
    if [ -n "$tagtext" ] && printf '%s' "$tagtext" | grep -qwE "($pattern)"; then
      printf '%s\n' "$line"
    fi
  done
}

# Garde les lignes dont un segment « >…< », "…" ou '…' contient le motif.
filter_ui_strings() {
  local pattern=$1 line content segs
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    content=${line#*:*:}
    segs=$(printf '%s' "$content" | grep -oE ">[^<>]+<|\"[^\"]*\"|'[^']*'" || true)
    if [ -n "$segs" ] && printf '%s' "$segs" | grep -qE "($pattern)"; then
      printf '%s\n' "$line"
    fi
  done
}

raw_accents=$(git grep -nwE "(${joined})" -- "${SCOPE[@]}" 2>/dev/null || true)
accents=$(printf '%s\n' "$raw_accents" | filter_tag_content "$joined" | grep -vE 'grist\.numerique\.gouv\.fr' || true)
accents=$(printf '%s' "$accents" | sed '/^[[:space:]]*$/d')

raw_forbidden=$(git grep -nE "(${forbidden})" -- "${SCOPE[@]}" 2>/dev/null || true)
forbidden_hits=$(printf '%s\n' "$raw_forbidden" | filter_ui_strings "$forbidden" || true)
forbidden_hits=$(printf '%s' "$forbidden_hits" | sed '/^[[:space:]]*$/d')

status=0
if [ -n "$accents" ]; then
  count=$(printf '%s\n' "$accents" | wc -l | tr -d ' ')
  printf '\n\033[31m✗ %d libellé(s) HTML dé-accentué(s) :\033[0m\n\n' "$count"
  printf '%s\n' "$accents"
  printf '\n\033[33mCorrige les libellés UI (donnees → données). Scope : contenu des balises HTML.\033[0m\n'
  status=1
fi
if [ -n "$forbidden_hits" ]; then
  count=$(printf '%s\n' "$forbidden_hits" | wc -l | tr -d ' ')
  printf '\n\033[31m✗ %d libellé(s) hors lexique (docs/ux/actions.md §3) :\033[0m\n\n' "$count"
  printf '%s\n' "$forbidden_hits"
  printf '\n\033[33mRemplace par le libellé canonique : Sauvegarder → Enregistrer, Garder en favori → Ajouter aux favoris, Obtenir le code → Copier le code, Générer le graphique → Générer, Repartir de zéro → Nouveau, Rafraîchir → Actualiser, + Deps → Ajouter des dépendances.\033[0m\n'
  status=1
fi
if [ "$status" -eq 0 ]; then
  printf '\033[32m✓ Libellés UI conformes (accents + lexique).\033[0m\n'
fi
exit "$status"
