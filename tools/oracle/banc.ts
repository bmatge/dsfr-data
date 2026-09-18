/**
 * `out/banc.md` — le rapport d'écart RELU PAR LE BANC d'essai.
 *
 * `out/report.json` et `out/report.txt` rangent les constats par contrôle :
 * c'est la vue de qui écrit les contrôles. Le banc open-data-viz, lui, ne
 * connaît ni les identifiants de contrôle ni les domaines — il connaît ses
 * PAGES (`education/dataviz-ips-colleges`) et ses CONSTATS (`BUG-009`,
 * `AM-067`). Sans une vue rangée dans ses termes, la seule façon pour lui de
 * savoir si une de ses demandes tient encore serait de relire le code des
 * contrôles.
 *
 * D'où ce second rendu, à partir des MÊMES constats : une section par page
 * reproduite, une ligne par observation (chiffre lib, chiffre oracle, verdict),
 * puis un index par identifiant de registre. Un contrôle en attente
 * (`Check.skip`) y figure aussi, avec sa raison : le banc doit pouvoir lire ce
 * que la bibliothèque ne passe pas, pas seulement ce qu'elle passe.
 *
 * C'est le seul endroit qui relie un identifiant du registre à un chiffre
 * mesuré. Le changeset dit « résout AM-0XX » ; celui-ci dit à quel écart, sur
 * quelle page, à quelle date.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Constat } from './compare.js';

/**
 * Ce que le rendu a besoin de savoir d'un contrôle — un sous-ensemble
 * structurel de `Check`, pour qu'un `Check` s'y passe tel quel.
 *
 * Le moteur n'importe PAS les manifestes : c'est l'appelant (le spec, qui les
 * charge déjà) qui les lui tend. L'import inverse ferait dépendre `tools/oracle`
 * de `tests/verif-donnees`, c'est-à-dire le moteur de ses données — et le garde
 * d'indépendance le refuse désormais explicitement.
 */
export interface FicheBanc {
  id: string;
  origin: string;
  page?: string;
  constats?: string[];
  skip?: string;
}

const SANS_PAGE = '(hors reproduction du banc)';

/** Les fiches, par identifiant de contrôle — pour retrouver page et constats. */
function fichesParId(fiches: readonly FicheBanc[]): Map<string, FicheBanc> {
  const out = new Map<string, FicheBanc>();
  for (const fiche of fiches) out.set(fiche.id, fiche);
  return out;
}

/**
 * Rend un texte inoffensif dans une CELLULE de tableau Markdown.
 *
 * Deux choses cassent une ligne de tableau : une barre verticale, qui ouvre une
 * colonne de plus, et un saut de ligne, qui termine la ligne au milieu d'une
 * phrase. Les deux arrivent pour de vrai — un message d'écart cite des valeurs
 * venues de l'API, et une raison de mise en attente tient sur plusieurs lignes.
 *
 * L'antislash est échappé EN PREMIER : le faire ensuite reviendrait à échapper
 * les antislashes que l'on vient soi-même d'ajouter, et un texte finissant par
 * un antislash échapperait alors la barre suivante au lieu d'être neutralisé.
 */
function echapper(texte: string): string {
  return texte
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ');
}

/**
 * Écrit `banc.md` dans `dossier` et rend son chemin.
 *
 * `fiches` décrit les contrôles JOUÉS dans ce run — c'est l'appelant qui les
 * fournit, le moteur n'allant pas les chercher dans les manifestes. Le dossier
 * est un paramètre pour la même raison côté `report.ts`, qui appelle ce rendu
 * une fois les constats des différents workers fusionnés : l'import inverse
 * fermerait le cycle.
 */
export function ecrireRapportBanc(
  constats: Constat[],
  fiches: readonly FicheBanc[],
  dossier: string
): string {
  const checks = fichesParId(fiches);

  // Ne retenir que ce qui vient d'une reproduction : un contrôle sur fixture
  // sans page n'a rien à dire au banc, et le noyer dedans le rendrait illisible.
  const parPage = new Map<string, Constat[]>();
  for (const c of constats) {
    const page = checks.get(c.controle)?.page ?? SANS_PAGE;
    if (page === SANS_PAGE) continue;
    const liste = parPage.get(page);
    if (liste === undefined) parPage.set(page, [c]);
    else liste.push(c);
  }

  // Les contrôles en attente n'ont produit aucun constat : ils se lisent
  // directement sur les manifestes, et ils comptent autant que les autres.
  const enAttente = [...checks.values()].filter((k) => k.page !== undefined && k.skip);

  const lignes: string[] = [];
  lignes.push('# Contrôles vivants — reproductions du banc open-data-viz');
  lignes.push('');
  // Le décompte porte sur ce que CE fichier rend : les constats des contrôles
  // rattachés à une page. Compter tous les constats du run annoncerait des
  // observations qui ne figurent nulle part ci-dessous.
  const retenus = [...parPage.values()].flat();
  lignes.push(
    `Recalculé le ${new Date().toISOString()} — ${parPage.size} page(s) reproduites, ` +
      `${retenus.length} observation(s), ${retenus.filter((c) => !c.ok).length} écart(s), ` +
      `${enAttente.length} contrôle(s) en attente.`
  );
  lignes.push('');
  lignes.push(
    'Chaque ligne oppose ce que la page **montre** à ce que l’oracle **recalcule** depuis les ' +
      'lignes brutes retéléchargées au même instant. Les identifiants `AM-0XX` / `BUG-0XX` / ' +
      '`PG-0XX` sont ceux du registre du banc.'
  );
  lignes.push('');

  for (const page of [...parPage.keys()].sort()) {
    lignes.push(`## ${page}`);
    lignes.push('');
    let controleCourant = '';
    for (const c of parPage.get(page)!) {
      if (c.controle !== controleCourant) {
        controleCourant = c.controle;
        const check = checks.get(c.controle);
        const cites = check?.constats?.length ? check.constats.join(', ') : '—';
        lignes.push(`### \`${c.controle}\` — constats : ${cites}`);
        lignes.push('');
        lignes.push(`${check?.origin ?? ''}`);
        lignes.push('');
        lignes.push(`${c.rawRows} lignes brutes.`);
        lignes.push('');
        lignes.push('| Observation | Lib | Oracle | Serveur | Valeurs | Verdict |');
        lignes.push('|---|---|---|---|---|---|');
      }
      // Le troisième chiffre (#883) et son verdict à trois : qui est d'accord
      // avec qui. Sans recoupement, la colonne reste vide et le verdict est
      // celui à deux voix.
      const verdict = c.verdict
        ? `${c.ok ? '' : '**écart** — '}${echapper(c.verdict)}`
        : c.ok
          ? 'conforme'
          : `**écart** — ${echapper(c.message)}`;
      lignes.push(
        `| \`${echapper(c.observation)}\` | ${echapper(c.lib)} | ${echapper(c.oracle)} | ` +
          `${c.serveur === undefined ? '' : echapper(c.serveur)} | ${c.comparaisons} | ${verdict} |`
      );
    }
    lignes.push('');
  }

  if (enAttente.length > 0) {
    lignes.push('## Contrôles en attente');
    lignes.push('');
    lignes.push(
      'Contrôles légitimes que la bibliothèque ne passe pas encore. Ils ne sont ni supprimés ni ' +
        'adoucis : leur raison dit s’il s’agit d’un **défaut** (la documentation promet autre ' +
        'chose) ou d’une **amélioration attendue** (rien n’est promis, le chiffre affiché est juste).'
    );
    lignes.push('');
    lignes.push('| Page | Contrôle | Constats | Raison |');
    lignes.push('|---|---|---|---|');
    for (const k of enAttente) {
      lignes.push(
        `| ${k.page} | \`${k.id}\` | ${k.constats?.join(', ') ?? '—'} | ${echapper(k.skip!)} |`
      );
    }
    lignes.push('');
  }

  // Index par identifiant de registre : l'entrée par laquelle le banc lit.
  const parConstat = new Map<string, Array<{ page: string; controle: string; ok: boolean }>>();
  for (const [page, liste] of parPage) {
    for (const c of liste) {
      for (const id of checks.get(c.controle)?.constats ?? []) {
        const entrees = parConstat.get(id) ?? [];
        if (!entrees.some((e) => e.controle === c.controle && e.ok === c.ok)) {
          entrees.push({ page, controle: c.controle, ok: c.ok });
        }
        parConstat.set(id, entrees);
      }
    }
  }
  if (parConstat.size > 0) {
    lignes.push('## Index par constat du registre');
    lignes.push('');
    lignes.push('| Constat | Page | Contrôle | Verdict |');
    lignes.push('|---|---|---|---|');
    for (const id of [...parConstat.keys()].sort()) {
      for (const e of parConstat.get(id)!) {
        lignes.push(
          `| ${id} | ${e.page} | \`${e.controle}\` | ${e.ok ? 'conforme' : '**écart**'} |`
        );
      }
    }
    lignes.push('');
  }

  const chemin = resolve(dossier, 'banc.md');
  mkdirSync(dossier, { recursive: true });
  writeFileSync(chemin, `${lignes.join('\n')}\n`);
  return chemin;
}
