#!/usr/bin/env bash
# Fail if French UI strings are written without accents.
#
# Scope : apps/, packages/ — extensions .ts, .html, .css, .md.
# Skipped: node_modules, dist, build, .changeset, audit-ui-*, *.min.*, tests/.
#
# Each pattern is a French word that has NO valid English / identifier meaning
# without its accent. When such a word appears in source, it is virtually
# certain to be a user-visible string that lost its accents — restore them.
#
# Run locally: bash scripts/check-french-accents.sh
# Or via npm:  npm run check:accents
#
# Maintenance: when you add a new ambiguous-with-English pattern (e.g.
# "selection", "generation", "definition"), DO NOT add it here — it would
# false-positive on English comments. Handle case-by-case in code review.

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

PATHS=(apps packages)

# Build a single ERE alternation: \b(word1|word2|…)\b
# IFS is scoped to the subshell, no leak to the parent shell.
# nosemgrep: bash.lang.security.ifs-tampering.ifs-tampering
joined=$(IFS='|'; echo "${PATTERNS[*]}")

# Use git grep so .gitignore is honoured automatically.
# -E: ERE alternation, -w: word boundaries, -n: line numbers, --: end of options.
# CHANGELOG.md is excluded by design: it documents past mistakes ("avant : donnees,
# après : données") and contains the unaccented forms as quoted examples.
if matches=$(git grep -nwE "(${joined})" -- \
      "apps/**/*.ts" "apps/**/*.html" "apps/**/*.css" "apps/**/*.md" \
      "packages/**/*.ts" "packages/**/*.html" "packages/**/*.css" "packages/**/*.md" \
      ':!**/dist/**' ':!**/node_modules/**' ':!**/*.min.*' \
      ':!**/CHANGELOG.md' ':!**/CHANGELOG*' 2>/dev/null); then
  # Allowlist : grist.numerique.gouv.fr est un vrai nom de domaine (ASCII), pas
  # une chaîne d'UI française. Le pattern `numerique` matcherait `\bnumerique\b`
  # dans le hostname et re-casserait le routage proxy Grist (cf. CORS prod).
  # On retire ces lignes du résultat avant de décider de l'échec.
  matches=$(printf '%s\n' "$matches" | grep -vE 'grist\.numerique\.gouv\.fr' || true)
  if [ -z "$matches" ]; then
    printf '\033[32m✓ No unaccented French words found in UI source files.\033[0m\n'
    exit 0
  fi
  count=$(printf '%s\n' "$matches" | wc -l | tr -d ' ')
  printf '\n\033[31m✗ %d unaccented French word(s) found in UI source files:\033[0m\n\n' "$count"
  printf '%s\n' "$matches"
  printf '\n\033[33mFix: replace each match with its accented form (donnees → données, etc.)\033[0m\n'
  printf '\033[33mSee EPIC #183 / issue #192 for the full list and rationale.\033[0m\n\n'
  exit 1
fi

printf '\033[32m✓ No unaccented French words found in UI source files.\033[0m\n'
