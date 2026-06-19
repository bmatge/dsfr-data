#!/usr/bin/env bash
# Warn (NON-BLOCKING) about French UI labels written without accents.
#
# Principe (cf. décision 2026-05-30, élargie 2026-06-19) : on ne regarde QUE le
# CONTENU TEXTUEL DES BALISES HTML, c.-à-d. ce qui est strictement entre un
# « > » et un « < ». Ce filtre exclut mécaniquement tout le reste :
#  - le code (corps de fonctions, identifiants, imports…),
#  - les ATTRIBUTS HTML (entre « < » et « > » : placeholder=…, label=…, href=…),
#  - les URLs (dans des attributs, ou sans « >…< » autour),
#  - les commentaires <!-- … --> (commencent par « < »).
# Grâce à ce filtre, on peut élargir le périmètre AUX FICHIERS .ts qui embarquent
# des templates HTML (skills, exemples, générateurs, composants Lit) sans jamais
# toucher au code : seul le texte des balises est inspecté.
#
# Périmètre des fichiers scannés :
#  - HTML : apps/, packages/, specs/, guide/  (**/*.html)
#  - TS   : apps/, packages/                  (**/*.ts — templates HTML embarqués)
#  Exclus : dist/, node_modules/, *.min.*, et tests/ (hors apps|packages).
#
# Le script n'échoue JAMAIS (exit 0) : c'est un avertissement, pas une barrière.
#
# Each pattern is a French word that has NO valid English / identifier meaning
# without its accent.
#
# Run locally: bash scripts/check-french-accents.sh
# Or via npm:  npm run check:accents
#
# Maintenance: ne pas ajouter de pattern ambigu avec l'anglais (selection,
# generation, definition…) — traiter au cas par cas en revue.

set -euo pipefail

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
  caractere Caractere caracteres
  categorie Categorie categories Categories categoriel Categoriel categorielle categorielles
  cle Cle cles Cles
  creer Creer creee creees crees
  deja Deja
  defaut Defaut
  defini definie definis definies
  degrade Degrade
  detecte detectee detectes
  donnees Donnees
  ecran Ecran ecrans
  echec Echec echoue
  Etat Etats
  evenement Evenement evenements Evenements
  genere Genere generes generer Generer
  meme Meme memes
  methode Methode methodes
  numerique Numerique numeriques
  prefere Prefere
  prevu prevue prevus prevues
  previsualiser Previsualiser previsualisation
  realise realisee realisees
  recupere
  reglages Reglages
  requete Requete requetes
  reussi reussie reussite Reussite
  selectionne selectionnez Selectionnez selectionner Selectionner selectionnee selectionnes
  serie Serie
  specifique Specifique specifiques
  telecharge telechargee telecharger Telecharger telechargement Telechargement telechargements
  validite
  verifie verifier Verifier verifiez Verifiez
)

# Build a single ERE alternation: (word1|word2|…) — word boundaries via -w.
# IFS is scoped to the subshell, no leak to the parent shell.
# nosemgrep: bash.lang.security.ifs-tampering.ifs-tampering
joined=$(IFS='|'; echo "${PATTERNS[*]}")

# 1. Pré-filtre git grep (honore .gitignore) : HTML (apps/packages/specs/guide)
#    + TS (apps/packages), qui embarquent des templates HTML.
raw=$(git grep -nwE "(${joined})" -- \
      "apps/**/*.html" "packages/**/*.html" "specs/**/*.html" "guide/**/*.html" \
      "apps/**/*.ts" "packages/**/*.ts" \
      ':!**/dist/**' ':!**/node_modules/**' ':!**/*.min.*' 2>/dev/null || true)

# 2. Ne garder que les hits où le mot apparaît dans le CONTENU D'UNE BALISE,
#    c.-à-d. dans un segment « >…< ». Tout le reste — code, attributs (entre
#    « < » et « > »), URLs, commentaires (« <!-- ») — n'a pas cette forme et est
#    donc exclu. Robuste pour le HTML pur ET le HTML embarqué dans du .ts.
matches=""
if [ -n "$raw" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    content=${line#*:*:}                                  # file:line:CONTENU
    tagtext=$(printf '%s' "$content" | grep -oE '>[^<>]+<' || true)
    if [ -n "$tagtext" ] && printf '%s' "$tagtext" | grep -qwE "(${joined})"; then
      matches="${matches}${line}"$'\n'
    fi
  done <<EOF
$raw
EOF
fi

# Allowlist : grist.numerique.gouv.fr est un vrai nom de domaine (ASCII).
matches=$(printf '%s' "$matches" | grep -vE 'grist\.numerique\.gouv\.fr' || true)
matches=$(printf '%s' "$matches" | sed '/^[[:space:]]*$/d')

if [ -z "$matches" ]; then
  printf '\033[32m✓ Aucun libellé HTML dé-accentué.\033[0m\n'
  exit 0
fi

count=$(printf '%s\n' "$matches" | wc -l | tr -d ' ')
printf '\n\033[33m⚠ %d libellé(s) HTML potentiellement dé-accentué(s) — AVERTISSEMENT (non bloquant) :\033[0m\n\n' "$count"
printf '%s\n' "$matches"
printf '\n\033[33mCorrige si ce sont de vrais libellés UI (donnees → données). Scope : contenu des balises HTML uniquement.\033[0m\n'
# Non bloquant : ne fait jamais échouer la CI.
exit 0
