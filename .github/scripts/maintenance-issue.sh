#!/usr/bin/env bash
# Une issue récurrente par contrôle de maintenance (maintenance.yml) : titre
# FIXE, label `maintenance`.
#
#   maintenance-issue.sh a-faire  "<titre>" <fichier-corps>   # crée l'issue, ou commente l'issue ouverte
#   maintenance-issue.sh en-ordre "<titre>" [<commentaire>]   # ferme l'issue ouverte, s'il y en a une
#   maintenance-issue.sh rappel   "<titre>" <fichier-corps>   # comme a-faire, mais n'est jamais fermée par le job
#
# Variables : GH_TOKEN (issues: write), GH_REPO (owner/repo). Le label est créé
# s'il manque. La recherche se fait sur le titre EXACT parmi les issues ouvertes
# portant le label, pour qu'un titre voisin ne soit jamais pris pour le bon.
set -euo pipefail

mode=${1:?mode}
titre=${2:?titre}
LABEL=maintenance

gh label create "$LABEL" --color d4c5f9 --description "Contrôle de maintenance récurrent (maintenance.yml)" >/dev/null 2>&1 || true

numero=$(gh issue list --state open --label "$LABEL" --limit 100 --json number,title \
  | jq --arg t "$titre" '[.[] | select(.title == $t)] | sort_by(.number) | .[0].number // empty')

aujourdhui=$(date -u +%F)
run_url="${GITHUB_SERVER_URL:-https://github.com}/${GH_REPO}/actions/runs/${GITHUB_RUN_ID:-0}"

case "$mode" in
  a-faire|rappel)
    corps=${3:?fichier corps}
    {
      cat "$corps"
      printf '\n\n---\n_Contrôle du %s par [maintenance.yml](%s). Procédure : [docs/MAINTENANCE.md](https://github.com/%s/blob/main/docs/MAINTENANCE.md)._\n' \
        "$aujourdhui" "$run_url" "$GH_REPO"
    } > /tmp/maintenance-corps.md
    if [ -n "$numero" ]; then
      gh issue comment "$numero" --body-file /tmp/maintenance-corps.md >/dev/null
      echo "::notice::« $titre » : issue #$numero déjà ouverte, état du jour ajouté en commentaire."
      echo "issue=$numero"
    else
      url=$(gh issue create --title "$titre" --label "$LABEL" --body-file /tmp/maintenance-corps.md)
      echo "::warning::« $titre » : issue ouverte → $url"
      echo "issue=${url##*/}"
    fi
    ;;
  en-ordre)
    if [ -n "$numero" ]; then
      commentaire=${3:-"Tout est en ordre au $aujourdhui : fermée par maintenance.yml ($run_url)."}
      gh issue close "$numero" --comment "$commentaire" >/dev/null
      echo "::notice::« $titre » : en ordre, issue #$numero fermée."
    else
      echo "« $titre » : en ordre, aucune issue ouverte."
    fi
    ;;
  *)
    echo "mode inconnu : $mode" >&2
    exit 2
    ;;
esac
