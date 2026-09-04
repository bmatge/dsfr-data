#!/usr/bin/env bash
# npm audit pour la CI, resistant aux pannes du registre.
#
# `npm audit` sort en 1 dans deux cas indiscernables au code retour : des
# vulnerabilites au-dessus du seuil (echec legitime) et une panne de l'endpoint
# d'avis de npm (« audit endpoint returned an error », « network timeout »),
# qui a deja fait rougir main sans qu'aucune dependance ait bouge.
#
# On rejoue donc jusqu'a 3 fois en cas d'erreur d'infrastructure. Si les trois
# tentatives echouent sur le registre, on ne bloque pas : l'annotation le
# signale, et le filet de securite reste tendu par Trivy, le job « SCA advisory »
# et Dependabot. Une vraie vulnerabilite, elle, fait echouer des la 1re passe.
set -uo pipefail

LEVEL="${1:-high}"
ATTEMPTS=3

for i in $(seq 1 "$ATTEMPTS"); do
  out="$(npm audit --audit-level="$LEVEL" 2>&1)"
  code=$?
  echo "$out"

  if [ "$code" -eq 0 ]; then
    exit 0
  fi

  if grep -qiE 'audit endpoint returned an error|network timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|503 Service Unavailable' <<<"$out"; then
    echo "::warning::npm audit — panne du registre (tentative $i/$ATTEMPTS)"
    [ "$i" -lt "$ATTEMPTS" ] && sleep $((i * 15)) && continue
    echo "::warning::npm audit injoignable apres $ATTEMPTS tentatives — etape non bloquante (couverture Trivy + SCA advisory + Dependabot)"
    exit 0
  fi

  echo "::error::npm audit — vulnerabilites de niveau $LEVEL ou superieur"
  exit "$code"
done
