/**
 * Le hook PreToolUse `scripts/claude-hooks/guard-git.sh` (câblé par
 * `.claude/settings.json`) fait tenir par la machine les interdits git du
 * CLAUDE.md. Chaque cas ci-dessous est une commande telle que Claude Code la
 * soumettrait à l'outil Bash : le script la reçoit en JSON sur stdin et répond
 * 0 (laisser passer) ou 2 (bloquer, message sur stderr).
 *
 * Les cas qui dépendent de la branche courante ou du remote tournent dans des
 * dépôts temporaires : l'un sur `main`, l'autre sur une branche de travail,
 * tous deux avec un `origin` qui pointe sur bmatge/dsfr-data et un `mef` qui
 * pointe sur le miroir.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HOOK = resolve(__dirname, '../../scripts/claude-hooks/guard-git.sh');

interface Verdict {
  code: number;
  stderr: string;
}

function hook(command: string, cwd: string, env: Record<string, string> = {}): Verdict {
  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command },
    cwd,
  });
  const r = spawnSync('bash', [HOOK], {
    input,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, ...env },
  });
  return { code: r.status ?? -1, stderr: r.stderr };
}

function git(dir: string, ...args: string[]): void {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
}

function depotTemporaire(branche: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'guard-git-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(
    dir,
    '-c',
    'user.email=t@t',
    '-c',
    'user.name=t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init'
  );
  git(dir, 'remote', 'add', 'origin', 'https://github.com/bmatge/dsfr-data.git');
  git(dir, 'remote', 'add', 'mef', 'https://github.com/mef-snum-miweb/dsfr-data.git');
  if (branche !== 'main') git(dir, 'checkout', '-q', '-b', branche);
  return dir;
}

let surMain = '';
let surBranche = '';
let vault = '';

beforeAll(() => {
  surMain = depotTemporaire('main');
  surBranche = depotTemporaire('feat/travail');
  // Le vault Obsidian committe sur main par design (ADR-022) : il se déclare.
  vault = depotTemporaire('main');
  git(vault, 'remote', 'set-url', 'origin', 'https://github.com/bmatge/vibecode-vault.git');
  git(vault, 'config', 'harness.allow-main', 'true');
});

afterAll(() => {
  for (const d of [surMain, surBranche, vault]) if (d) rmSync(d, { recursive: true, force: true });
});

describe('guard-git.sh — bloque (exit 2, message en français)', () => {
  const bloquees: Array<[string, 'main' | 'branche', RegExp]> = [
    ['git push --force origin feat/travail', 'branche', /push forcé/],
    ['git push -f', 'branche', /push forcé/],
    ['git push -fu origin feat/travail', 'branche', /push forcé/],
    ['git push --force-with-lease origin feat/travail', 'branche', /push forcé/],
    ['git push --force-with-lease=main origin feat/travail', 'branche', /push forcé/],
    ['git push mef --force refs/remotes/origin/main:refs/heads/main', 'branche', /push forcé/],
    ['git push origin main', 'branche', /bmatge\/dsfr-data/],
    ['git push origin HEAD:main', 'branche', /bmatge\/dsfr-data/],
    ['git push origin feat/travail:refs/heads/main', 'branche', /bmatge\/dsfr-data/],
    ['git push origin --delete main', 'branche', /bmatge\/dsfr-data/],
    ['git push', 'main', /bmatge\/dsfr-data/],
    ['git push origin', 'main', /bmatge\/dsfr-data/],
    ['git push https://github.com/bmatge/dsfr-data.git HEAD:main', 'branche', /bmatge\/dsfr-data/],
    ['git commit -m "x"', 'main', /commit direct sur main/],
    ['git commit --amend --no-edit', 'main', /commit direct sur main/],
    ['git merge feat/travail', 'main', /commit direct sur main/],
    ['git checkout main && git commit -m x', 'branche', /commit direct sur main/],
    ['git switch main; git commit -m x', 'branche', /commit direct sur main/],
    ['npm test && git push origin main', 'branche', /bmatge\/dsfr-data/],
    ['npm run build || git push origin main', 'branche', /bmatge\/dsfr-data/],
    ['echo ok | git push -f origin x', 'branche', /push forcé/],
    ['git rebase origin/main', 'branche', /rebase/],
    ['git rebase -i HEAD~3', 'branche', /rebase/],
    ['git pull --rebase', 'branche', /rebase|pull/],
    ['git stash', 'branche', /stash/],
    ['git stash pop', 'branche', /stash/],
    ['git stash save wip', 'branche', /stash/],
    ['git stash push -u', 'branche', /sans « -m »/],
  ];

  for (const [commande, ou, motif] of bloquees) {
    it(`${commande}  (${ou})`, () => {
      const v = hook(commande, ou === 'main' ? surMain : surBranche);
      expect(v.code, v.stderr).toBe(2);
      expect(v.stderr).toMatch(motif);
      expect(v.stderr).toMatch(/CLAUDE\.md/);
    });
  }
});

describe('guard-git.sh — laisse passer (exit 0, silence)', () => {
  const autorisees: Array<[string, 'main' | 'branche']> = [
    ['git status', 'main'],
    ['git log --oneline -3', 'main'],
    ['git fetch origin', 'main'],
    ['git pull', 'main'],
    ['git merge --ff-only origin/main', 'main'],
    ['git checkout -b fix/sujet', 'main'],
    ['git switch -c fix/sujet && git commit -m x', 'main'],
    ['git push origin ma-branche', 'branche'],
    ['git push -u origin feat/travail', 'branche'],
    ['git push', 'branche'],
    ['git push mef refs/remotes/origin/main:refs/heads/main', 'branche'],
    ['git push mef --tags', 'branche'],
    [
      'git push https://github.com/mef-snum-miweb/dsfr-data.git --delete vieille-branche',
      'branche',
    ],
    [
      'git push https://github.com/mef-snum-miweb/dsfr-data.git refs/remotes/origin/main:refs/heads/main',
      'main',
    ],
    ['git merge origin/main', 'branche'],
    ['git commit -m "feat: x"', 'branche'],
    ['git stash push -u -m "wip-agent-1"', 'branche'],
    ['git stash list --format="%H %gs"', 'branche'],
    ['git stash apply abc123', 'branche'],
    ['git stash drop stash@{0}', 'branche'],
    ['npm test', 'main'],
    ['echo git', 'main'],
    ['echo "git push --force" > notes.txt', 'main'],
    ['gh pr merge 42 --squash --delete-branch', 'main'],
    ['ls -la .github/workflows', 'main'],
    ['HARNESS_ALLOW=1 git push origin main', 'branche'],
  ];

  for (const [commande, ou] of autorisees) {
    it(`${commande}  (${ou})`, () => {
      const v = hook(commande, ou === 'main' ? surMain : surBranche);
      expect(v.code, v.stderr).toBe(0);
      expect(v.stderr).toBe('');
    });
  }

  it('hors de tout dépôt git, un commit passe (le hook ne sait pas, il laisse faire)', () => {
    const v = hook('git commit -m x', tmpdir());
    expect(v.code, v.stderr).toBe(0);
  });

  it('sans cwd dans le JSON, le hook ne plante pas', () => {
    const r = spawnSync('bash', [HOOK], {
      input: JSON.stringify({ tool_input: { command: 'git status' } }),
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
  });

  it('un stdin qui n’est pas du JSON ne bloque rien', () => {
    const r = spawnSync('bash', [HOOK], { input: 'git push --force ?', encoding: 'utf8' });
    expect(r.status).toBe(0);
  });

  it('un stdin vide ne bloque rien', () => {
    const r = spawnSync('bash', [HOOK], { input: '', encoding: 'utf8' });
    expect(r.status).toBe(0);
  });
});

describe('guard-git.sh — dépôt déclaré « harness.allow-main » (le vault)', () => {
  const passent = [
    'git commit -m "session: 2026-11-25"',
    'git add -A && git commit -m x && git push',
    'git merge --no-ff feat/travail',
  ];
  for (const commande of passent) {
    it(`${commande}  passe sur main`, () => {
      const v = hook(commande, vault);
      expect(v.code, v.stderr).toBe(0);
      expect(v.stderr).toBe('');
    });
  }

  it('git -C <vault> commit passe depuis un autre répertoire', () => {
    const v = hook(`git -C ${vault} commit -m x`, surBranche);
    expect(v.code, v.stderr).toBe(0);
  });

  // Les skills du vault (/session-start, /session-end, /new-adr) synchronisent par
  // `pull --rebase --autostash` : histoire linéaire à un seul auteur, pas de branche partagée.
  // (`vault` n'est connu qu'après beforeAll : les commandes sont construites à l'exécution.)
  const pulls: Array<[string, () => string]> = [
    ['git -C <vault> pull --rebase --autostash', () => `git -C ${vault} pull --rebase --autostash`],
    [
      'cd <vault> && git pull --rebase --autostash && git push',
      () => `cd ${vault} && git pull --rebase --autostash && git push`,
    ],
    ['git pull --rebase --autostash', () => 'git pull --rebase --autostash'],
  ];
  for (const [nom, commande] of pulls) {
    it(`${nom}  passe (dépôt déclaré)`, () => {
      const v = hook(commande(), vault);
      expect(v.code, v.stderr).toBe(0);
    });
  }

  it('git pull --rebase reste bloqué dans un dépôt non déclaré', () => {
    expect(hook('git pull --rebase --autostash', surBranche).code).toBe(2);
  });

  describe('chemins avec ~ et $HOME (cd, -C)', () => {
    let home = '';
    beforeAll(() => {
      home = mkdtempSync(join(tmpdir(), 'guard-git-home-'));
      const v = join(home, 'vault');
      const d = join(home, 'depot');
      mkdirSync(v);
      mkdirSync(d);
      for (const dir of [v, d]) {
        git(dir, 'init', '-q', '-b', 'main');
        git(
          dir,
          '-c',
          'user.email=t@t',
          '-c',
          'user.name=t',
          'commit',
          '-q',
          '--allow-empty',
          '-m',
          'init'
        );
      }
      git(v, 'remote', 'add', 'origin', 'https://github.com/bmatge/vibecode-vault.git');
      git(v, 'config', 'harness.allow-main', 'true');
      git(d, 'remote', 'add', 'origin', 'https://github.com/bmatge/dsfr-data.git');
    });
    afterAll(() => {
      if (home) rmSync(home, { recursive: true, force: true });
    });

    const cas: Array<[string, number]> = [
      ['git -C ~/vault pull --rebase --autostash', 0],
      ['cd ~/vault && git add -A && git commit -m x && git push', 0],
      ['cd "$HOME/vault" && git commit -m x', 0],
      ['git -C ~/depot commit -m x', 2],
      ['cd ~/depot && git commit -m x', 2],
      ['cd ~ && git -C vault commit -m x', 0],
    ];
    for (const [commande, attendu] of cas) {
      it(`${commande}  → ${attendu}`, () => {
        const v = hook(commande, surBranche, { HOME: home });
        expect(v.code, v.stderr).toBe(attendu);
      });
    }
  });

  const restentBloquees: Array<[string, RegExp]> = [
    ['git push --force origin main', /push forcé/],
    ['git rebase origin/main', /rebase/],
    ['git stash', /stash/],
    ['git push https://github.com/bmatge/dsfr-data.git HEAD:main', /bmatge\/dsfr-data/],
  ];
  for (const [commande, motif] of restentBloquees) {
    it(`${commande}  reste bloquée`, () => {
      const v = hook(commande, vault);
      expect(v.code, v.stderr).toBe(2);
      expect(v.stderr).toMatch(motif);
    });
  }

  it('la clé à false ne déclare rien', () => {
    git(vault, 'config', 'harness.allow-main', 'false');
    try {
      const v = hook('git commit -m x', vault);
      expect(v.code).toBe(2);
      expect(v.stderr).toMatch(/harness\.allow-main/);
    } finally {
      git(vault, 'config', 'harness.allow-main', 'true');
    }
  });
});

describe('guard-git.sh — câblage', () => {
  it('.claude/settings.json déclare le hook sur l’outil Bash', async () => {
    const { readFileSync } = await import('node:fs');
    const settings = JSON.parse(
      readFileSync(resolve(__dirname, '../../.claude/settings.json'), 'utf8')
    ) as { hooks?: { PreToolUse?: Array<{ matcher: string; hooks: Array<{ command: string }> }> } };
    const entree = settings.hooks?.PreToolUse?.find((h) => h.matcher === 'Bash');
    expect(entree, 'une entrée PreToolUse avec matcher Bash').toBeDefined();
    expect(entree?.hooks.some((h) => h.command.includes('scripts/claude-hooks/guard-git.sh'))).toBe(
      true
    );
  });
});
