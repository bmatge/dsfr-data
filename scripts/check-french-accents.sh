#!/usr/bin/env bash
# Lint des libellés d'interface — BLOQUANT depuis le lot UX 3 (#540, epic #546).
#
# Trois contrôles, sur les sources HTML et TS (templates HTML embarqués) :
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
#  3. CHAÎNES (#1158) — les mêmes motifs PATTERNS, là où le volet 1 est
#     aveugle : littéraux JS et gabarits (`Connecte (${n} elements)`), contenu
#     de balise sur plusieurs lignes, et commentaires `<!-- … -->` émis dans le
#     code exporté (« Dependances CSS »). Volet Node, lu par l'AST TypeScript
#     (les commentaires du code source restent exclus) :
#     scripts/check-french-accents-strings.mjs. Le texte écrit pour le modèle
#     (skills, **/ia/**) et le catalogue d'exemples du Playground en sont exclus.
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
# contenu de balise (selection, generation, definition, configure, prepare…)
# ni avec une forme française CORRECTE sans accent (affiche — « s'affiche » —,
# recommande, embarque, connecte en minuscule…) — traiter au cas par cas en
# revue. Depuis #1158 les motifs valent aussi pour les chaînes JS (volet 3) :
# mesurer les nouveaux constats avant d'ajouter un mot. Une forme proscrite
# s'ajoute ici ET dans actions.md §3.

set -euo pipefail

# ---------------------------------------------------------------------------
# 1. Accents — mots sans accent qui n'ont aucun sens anglais / identifiant.
# Sorted, deduped. Word boundaries applied by `git grep -wE` below.
# Excluded for bilingual overlap (would false-positive on English source):
#   present, presente, presents, presentes — "present" is also valid English.
#   series, Series — also valid English AND appears in HTML identifiers
#                    (`extra-series-container`, etc.). Singular `serie`/`Serie`
#                    is unambiguously French.
#   selection, generation, definition, configure, prepare — also English.
#   affiche, recommande, embarque, connecte — also CORRECT French verb forms
#                    (« le graphique s'affiche ») ; `Connecte` capitalised is kept.
PATTERNS=(
  agreger Agreger agregation Agregation agregations Agregations agrege agreges agregee agregees
  alphabetique Alphabetique
  annee Annee annees Annees
  apparaitra
  accessibilite Accessibilite
  apercu Apercu
  bibliotheque Bibliotheque
  caractere Caractere caracteres
  categorie Categorie categories Categories categoriel Categoriel categorielle categorielles
  chaine chaines
  chargee chargees
  cle Cle cles Cles
  Connecte
  configuree configurees
  copiee copiees
  creer Creer creee creees crees Creez
  critere criteres
  Decrivez
  decroissant Decroissant
  deja Deja
  defaut Defaut
  defini definie definis definies
  degrade Degrade
  departement Departement departements departementale departementales
  dependances Dependances
  Deposez
  deroulant deroulante
  Detail
  detecte detectee detectes
  donnees Donnees
  ecran Ecran ecrans
  echec Echec echoue
  editeur Editeur
  element elements Elements
  etiquette Etiquette etiquettes Etiquettes
  etre
  Etat Etats
  evenement Evenement evenements Evenements
  executer Executer
  genere Genere generes generer Generer generee generees
  generateur Generateur
  guidee Guidee
  integrer Integrer
  interieur
  libelle Libelle libelles Libelles
  meme Meme memes
  methode Methode methodes Methodes
  necessaire necessaires
  numerique Numerique numeriques
  operateur Operateur operateurs Operateurs
  parametre Parametre parametres Parametres
  prefere Prefere
  prevu prevue prevus prevues
  previsualiser Previsualiser previsualisation
  rafraichissement Rafraichissement
  realise realisee realisees
  recue recues
  reessayez Reessayez
  recupere
  Reference
  reglages Reglages
  reinitialiser Reinitialiser
  reorganiser Reorganiser
  repartition Repartition
  requete Requete requetes
  resultat Resultat resultats Resultats
  reussi reussie reussite Reussite
  revoquer Revoquer
  Role
  selectionne selectionnez Selectionnez selectionner Selectionner selectionnee selectionnes
  separee separees separes Separez
  serie Serie
  specifique Specifique specifiques
  succes Succes
  telecharge telechargee telecharger Telecharger telechargement Telechargement telechargements
  validite
  verifie verifier Verifier verifiez Verifiez
  # Locutions : « a » sans accent devant ces mots n'a aucun sens anglais.
  'a chaque' 'a cocher' 'a facettes' 'a integrer' 'a jour' 'a mesurer' 'a promouvoir'
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
    # Le contenu d'un <code> EST du code : identifiants, clauses, noms de
    # colonnes (`categorie:eq:Actif`, `Sous_theme`) n'ont pas a etre accentues.
    # Sans ce retrait, les pages /specs — dont les tableaux d'attributs sont
    # generes depuis le JSDoc, exemples de code compris — declenchent des faux
    # positifs. Cohérent avec l'intention annoncée en tete de fichier.
    content=$(printf '%s' "$content" | sed 's|<code>[^<]*</code>||g')
    # Idem pour les gabarits `{{champ}}`, les trous `${expr}` d'un littéral JS,
    # les valeurs entre guillemets d'un bloc de code colore (`>"annee"<`) et
    # les affectations `on="annee,code"` citees dans une phrase : ce sont des
    # noms de champs, pas du texte (#1158).
    content=$(printf '%s' "$content" | sed -E 's/\{\{[^}]*\}\}//g; s/\$\{[^}]*\}//g; s/>"[^"<>]*"</></g; s/[[:alnum:]_-]+="[^"<>]*"//g')
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

# 3. Chaînes de script et contenu multi-ligne (#1158) — volet Node, lu par
# l'AST TypeScript : voir l'en-tête de scripts/check-french-accents-strings.mjs.
# Hors périmètre de ce volet : le texte écrit POUR LE MODÈLE (guide des skills,
# prompts et outils des assistants IA), relu à part, et le catalogue d'exemples
# du Playground (code d'exemple, pas une interface).
STRINGS_SCOPE=(
  "${SCOPE[@]}"
  ':!packages/shared/src/skills/**' ':!**/ia/**' ':!apps/playground/src/examples/examples-data.ts'
)
# nosemgrep: bash.lang.security.ifs-tampering.ifs-tampering
strings_hits=$(git ls-files -- "${STRINGS_SCOPE[@]}" \
  | ACCENT_PATTERNS=$(IFS='|'; echo "${PATTERNS[*]}") node scripts/check-french-accents-strings.mjs || true)
strings_hits=$(printf '%s' "$strings_hits" | grep -vE 'grist\.numerique\.gouv\.fr' | sed '/^[[:space:]]*$/d' || true)

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
if [ -n "$strings_hits" ]; then
  count=$(printf '%s\n' "$strings_hits" | wc -l | tr -d ' ')
  printf '\n\033[31m✗ %d libellé(s) dé-accentué(s) dans une chaîne de script, un contenu multi-ligne ou un commentaire de code exporté :\033[0m\n\n' "$count"
  printf '%s\n' "$strings_hits"
  printf '\n\033[33mCorrige le texte affiché ou émis (Connecte → Connecté, <!-- Dependances --> → <!-- Dépendances -->).\033[0m\n'
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
