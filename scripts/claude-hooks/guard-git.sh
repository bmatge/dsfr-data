#!/usr/bin/env bash
# guard-git.sh — hook Claude Code `PreToolUse` (matcher `Bash`).
#
# Fait tenir par la machine les interdits git du CLAUDE.md (« Ce que Claude ne
# doit JAMAIS faire ») et de ~/.claude/CLAUDE.md (« Interdits globaux »), que la
# prose seule ne tenait pas (ADR-169 du vault, docs/MAINTENANCE.md §7) :
#
#   - `git push` forcé (`--force`, `-f`, `--force-with-lease`, `--force-if-includes`)
#   - `git push` vers `main` / `master` d'un remote qui pointe sur bmatge/dsfr-data
#     (`git push origin main`, `HEAD:main`, `x:refs/heads/main`, `--delete main`,
#     `git push` nu depuis main) — la resynchronisation du miroir
#     (`git push mef refs/remotes/origin/main:refs/heads/main`, ou une URL
#     mef-snum-miweb) reste permise
#   - `git commit` (et `merge`, `cherry-pick`, `revert`, `am`) sur `main` / `master`
#     — sauf dans un dépôt qui s'est déclaré (`git config harness.allow-main true`) :
#     le vault Obsidian committe sur main par design (ADR-022) ; les autres règles
#     y valent toujours
#   - `git rebase`, sous toutes ses formes (les branches sont partagées)
#   - `git stash` nu, `pop`, `save`, ou `push` sans `-m` : la pile est partagée
#     entre les worktrees, une entrée sans étiquette est une entrée perdue
#
# Contrat du hook : le JSON de l'appel arrive sur stdin (`tool_input.command`,
# `cwd`) ; sortie 0 = laisser passer ; sortie 2 + message sur stderr = l'appel
# est bloqué et le message est lu par l'agent. Tout autre état est ignoré par
# Claude Code : ce script ne sort donc qu'en 0 ou 2, et laisse passer dès qu'il
# ne sait pas (JSON illisible, répertoire hors git, remote inconnu).
#
# Contournement humain explicite : préfixer la commande par `HARNESS_ALLOW=1`,
# réservé au cas où Bertrand a autorisé l'action dans la conversation — jamais
# à l'initiative de l'agent (le CLAUDE.md le proscrit). Même convention que les
# hooks globaux du vault (50-Meta/claude-code-config/hooks/).
#
# Test : `echo '{"tool_input":{"command":"git status"}}' | bash scripts/claude-hooks/guard-git.sh; echo $?`
# Suite : `npm run test:run -- tests/hooks`.
set -euo pipefail

input=$(cat || true)

# Sortie rapide : rien qui ressemble à git, on ne décode même pas le JSON.
case "$input" in
  *git*) ;;
  *) exit 0 ;;
esac

if command -v jq > /dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2> /dev/null || true)
  cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2> /dev/null || true)
else
  cmd=$(printf '%s' "$input" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print((d.get("tool_input") or {}).get("command", ""))
except Exception:
    pass' 2> /dev/null || true)
  cwd=$(printf '%s' "$input" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("cwd", ""))
except Exception:
    pass' 2> /dev/null || true)
fi

[ -n "$cmd" ] || exit 0
[ -n "$cwd" ] || cwd=$PWD

# Deuxième sortie rapide : `git` doit apparaître comme un mot de commande.
if ! printf '%s' "$cmd" | grep -Eq '(^|[[:space:];&|(`{])[[:space:]]*git([[:space:]]|$)'; then
  exit 0
fi

case "$cmd" in
  *HARNESS_ALLOW=1*) exit 0 ;;
esac

CLAUDE_MD='CLAUDE.md § « Ce que Claude ne doit JAMAIS faire » (et docs/MAINTENANCE.md § garde-fous)'

deny() {
  printf 'Bloqué par scripts/claude-hooks/guard-git.sh : %s\nRègle : %s.\nNe pas réessayer sous une autre forme. Si Bertrand a explicitement autorisé ce geste dans la conversation, préfixer la commande par HARNESS_ALLOW=1.\n' "$1" "$CLAUDE_MD" >&2
  exit 2
}

# Branche courante d'un répertoire (vide hors git ou en HEAD détachée).
branch_of() {
  git -C "$1" branch --show-current 2> /dev/null || true
}

# Toutes les URL de push d'un remote (un remote peut en avoir plusieurs :
# le `origin` historique pousse à la fois sur bmatge et sur le miroir).
push_urls_of() {
  local dir=$1 remote=$2
  case "$remote" in
    *://* | *@*:*) printf '%s\n' "$remote" ;;
    *) git -C "$dir" remote get-url --push --all "$remote" 2> /dev/null || true ;;
  esac
}

is_protected_branch() {
  case "$1" in
    main | master | refs/heads/main | refs/heads/master) return 0 ;;
    *) return 1 ;;
  esac
}

# Un dépôt qui committe sur main PAR DESIGN (le vault Obsidian, ADR-022) se
# déclare une fois : `git config harness.allow-main true`. Seule la règle du
# commit sur main s'y relâche ; push forcé, rebase et stash restent interdits,
# et le push vers main de bmatge/dsfr-data aussi.
allows_main_commits() {
  [ "$(git -C "$1" config --get --type=bool harness.allow-main 2> /dev/null || true)" = true ]
}

# Découpe en segments : && || ; | sauts de ligne, sous-shells et groupes.
segments=$(printf '%s\n' "$cmd" \
  | sed -E 's/&&/\n/g; s/\|\|/\n/g; s/;/\n/g; s/\|/\n/g; s/\$\(/\n/g; s/`/\n/g; s/\(/\n/g; s/\{/\n/g')

dir=$cwd
virtual_branch=''

while IFS= read -r seg; do
  # Nettoyage : espaces, fermetures de groupe, préfixes et affectations d'environnement.
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:])}]+//; s/[[:space:]]+$//')
  [ -n "$seg" ] || continue
  while :; do
    case "$seg" in
      [A-Za-z_]*=*)
        first=${seg%% *}
        case "$first" in
          *=*) seg=${seg#"$first"}; seg=${seg# } ;;
          *) break ;;
        esac ;;
      command\ * | exec\ * | nohup\ * | time\ * | env\ * | builtin\ * | sudo\ *) seg=${seg#* } ;;
      *) break ;;
    esac
    [ -n "$seg" ] || break
  done
  [ -n "$seg" ] || continue

  # `cd X` change le répertoire des segments suivants.
  case "$seg" in
    cd | cd\ *)
      target=${seg#cd}; target=$(printf '%s' "$target" | sed -E 's/^[[:space:]]+//; s/^["'"'"']//; s/["'"'"']$//')
      if [ -z "$target" ] || [ "$target" = '~' ]; then dir=$HOME
      elif [ "${target#/}" != "$target" ]; then dir=$target
      else dir="$dir/$target"; fi
      continue ;;
  esac

  case "$seg" in
    git | git\ *) ;;
    *) continue ;;
  esac

  # Découpage en mots (sans interprétation des guillemets : les chemins et
  # messages ne portent pas de sens ici, seuls les mots-clés comptent).
  # shellcheck disable=SC2206
  words=($seg)
  seg_dir=$dir
  sub=''
  i=1
  while [ $i -lt ${#words[@]} ]; do
    w=${words[$i]}
    case "$w" in
      -C) i=$((i + 1)); seg_dir=${words[$i]:-$dir}; case "$seg_dir" in /*) ;; *) seg_dir="$dir/$seg_dir" ;; esac ;;
      -c) i=$((i + 1)) ;;
      --git-dir | --work-tree | --namespace) i=$((i + 1)) ;;
      -*) ;;
      *) sub=$w; break ;;
    esac
    i=$((i + 1))
  done
  [ -n "$sub" ] || continue
  rest=("${words[@]:$((i + 1))}")

  case "$sub" in
    rebase)
      deny "« git rebase » est interdit sur ce dépôt (branches partagées, PR ouvertes). Intégrer main par « git merge origin/main »." ;;

    pull)
      for w in "${rest[@]}"; do
        case "$w" in
          --rebase=false | --no-rebase) ;;
          --rebase | --rebase=* | -r)
            deny "« git pull $w » est un rebase, interdit sur ce dépôt (branches partagées). Faire « git fetch origin && git merge origin/<branche> »." ;;
        esac
      done ;;

    stash)
      action=${rest[0]:-}
      case "$action" in
        '' | pop | save)
          deny "« git stash ${action:-} » nu : la pile de stash est partagée entre les worktrees et les sessions. Mettre de côté par un commit WIP, ou « git stash push -u -m \"<étiquette unique>\" » puis « git stash apply <sha> »." ;;
        push)
          has_m=0
          for w in "${rest[@]:1}"; do
            case "$w" in -m | --message | --message=* | -*m*) has_m=1 ;; esac
          done
          [ $has_m -eq 1 ] || deny "« git stash push » sans « -m » : une entrée sans étiquette ne se retrouve plus dans une pile partagée. Ajouter -m \"<étiquette unique>\"." ;;
      esac ;;

    checkout | switch)
      # Suit la branche visée pour juger les segments suivants (`git checkout main && git commit`).
      new=''; create=0
      for w in "${rest[@]}"; do
        case "$w" in
          -b | -B | -c | -C | --orphan) create=1 ;;
          --) break ;;
          -*) ;;
          *) [ -n "$new" ] || new=$w ;;
        esac
      done
      if [ $create -eq 1 ]; then virtual_branch='(nouvelle)'; elif [ -n "$new" ]; then virtual_branch=$new; fi ;;

    commit | merge | cherry-pick | revert | am)
      # Une avance rapide (`git merge --ff-only origin/main` sur main) n'écrit aucun commit.
      ff_only=0
      for w in "${rest[@]}"; do case "$w" in --ff-only) ff_only=1 ;; esac; done
      [ "$sub" = merge ] && [ $ff_only -eq 1 ] && continue
      branch=${virtual_branch:-$(branch_of "$seg_dir")}
      if is_protected_branch "$branch" && ! allows_main_commits "$seg_dir"; then
        deny "« git $sub » sur la branche « $branch » : jamais de commit direct sur main/master sans autorisation explicite. Créer une branche (git checkout -b <type>/<sujet>) et ouvrir une PR. (Un dépôt qui committe sur main par design, comme le vault, se déclare : git config harness.allow-main true.)"
      fi ;;

    push)
      remote=''; refspecs=(); delete=0; all=0
      j=0
      while [ $j -lt ${#rest[@]} ]; do
        w=${rest[$j]}
        case "$w" in
          --force | --force-with-lease | --force-with-lease=* | --force-if-includes)
            deny "« git push $w » : jamais de push forcé, sur aucun remote." ;;
          -f)
            deny "« git push -f » : jamais de push forcé, sur aucun remote." ;;
          -d | --delete) delete=1 ;;
          --all | --mirror | --branches) all=1 ;;
          -o | --push-option | --receive-pack | --exec | --repo) j=$((j + 1)) ;;
          --repo=*) remote=${w#--repo=} ;;
          --) ;;
          --*) ;;
          -*)
            # Groupe d'options courtes : `-fu`, `-uf`…
            case "${w#-}" in *f*) deny "« git push $w » : jamais de push forcé, sur aucun remote." ;; esac ;;
          *) if [ -z "$remote" ]; then remote=$w; else refspecs+=("$w"); fi ;;
        esac
        j=$((j + 1))
      done
      [ $delete -eq 1 ] && [ -z "${refspecs[*]:-}" ] && [ -n "$remote" ] && :

      if [ -z "$remote" ]; then
        branch=${virtual_branch:-$(branch_of "$seg_dir")}
        remote=$(git -C "$seg_dir" config --get "branch.$branch.pushRemote" 2> /dev/null \
          || git -C "$seg_dir" config --get "branch.$branch.remote" 2> /dev/null \
          || git -C "$seg_dir" config --get remote.pushDefault 2> /dev/null \
          || echo origin)
      fi

      # Branches distantes visées.
      targets=()
      if [ ${#refspecs[@]} -eq 0 ]; then
        if [ $all -eq 1 ]; then targets+=(main)
        else
          branch=${virtual_branch:-$(branch_of "$seg_dir")}
          [ -n "$branch" ] && targets+=("$branch")
        fi
      else
        for r in "${refspecs[@]}"; do
          r=${r#+}
          if [ $delete -eq 1 ]; then targets+=("$r")
          else
            case "$r" in
              *:*) targets+=("${r#*:}") ;;
              *) targets+=("$r") ;;
            esac
          fi
        done
      fi

      touches_main=0
      for t in "${targets[@]:-}"; do
        if is_protected_branch "$t"; then touches_main=1; fi
      done
      [ $touches_main -eq 1 ] || continue

      urls=$(push_urls_of "$seg_dir" "$remote")
      if printf '%s' "$urls" | grep -Eiq 'github\.com[:/]bmatge/dsfr-data(\.git)?([[:space:]]|$)'; then
        deny "« $seg » pousse sur main/master du dépôt bmatge/dsfr-data (remote « $remote »). Main ne reçoit que des PR mergées ; seule la resynchronisation du miroir (git push mef refs/remotes/origin/main:refs/heads/main) est permise."
      fi ;;
  esac
done <<< "$segments"

exit 0
