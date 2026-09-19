/**
 * Rétrocompatibilité du rendu de `dsfr-data-kpi` et `dsfr-data-kpi-group`.
 *
 * Les évolutions d'affichage (icon-position, icon-size, picto, image,
 * orientation, border, tint, color-token illustratif) ne changent AUCUN
 * défaut : sans l'un de ces attributs, le rendu doit être identique à celui
 * d'avant leur arrivée. Ce test le prouve de deux façons :
 *
 * 1. Le BALISAGE (innerHTML sans le bloc `<style>`) de chaque cas est comparé
 *    byte à byte à la référence `tests/data/kpi-rendu-reference.json`,
 *    capturée sur `main` AVANT le chantier (commit a950e9d). Un diff non
 *    vide est une régression.
 * 2. Les RÈGLES CSS de la référence doivent toutes exister encore, avec les
 *    mêmes déclarations : une évolution ne peut qu'AJOUTER des règles
 *    (nouvelles classes, nouveaux attributs), jamais retoucher celles qui
 *    régissent le rendu historique.
 *
 * Régénérer la référence (uniquement quand un changement de rendu par défaut
 * est DÉCIDÉ, et dit dans le changeset) :
 *   KPI_RENDU_REFERENCE_WRITE=1 npx vitest run tests/kpi-rendu-retrocompat.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataKpiGroup } from '@/components/dsfr-data-kpi-group.js';
import {
  clearDataCache,
  dispatchDataLoaded,
  dispatchDataLoading,
  dispatchDataError,
  dispatchDataIdle,
} from '@/utils/data-bridge.js';

// Force l'enregistrement des balises (imports à effet de bord).
void DsfrDataKpi;
void DsfrDataKpiGroup;

const REFERENCE_PATH = resolve(import.meta.dirname, 'data/kpi-rendu-reference.json');
const WRITE = process.env.KPI_RENDU_REFERENCE_WRITE === '1';

interface Cas {
  nom: string;
  html: string;
  /** Alimentation de la source `ref` : lignes, ou un état. */
  source?: unknown[] | { etat: 'loading' | 'error' | 'idle' };
}

const ROWS = [
  { score: 80, montant: 1200, statut: 'actif', evolution: 5.2 },
  { score: 60, montant: 800, statut: 'inactif', evolution: -1.5 },
  { score: 95, montant: 3000, statut: 'actif', evolution: 2.1 },
];

const CAS: Cas[] = [
  {
    nom: 'valeur et libellé',
    html: '<dsfr-data-kpi source="ref" value="montant:sum" label="Montant"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'icône historique dans le libellé',
    html: '<dsfr-data-kpi source="ref" value="count" label="Sites" icon="ri-global-line"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'icône fr-icon',
    html: '<dsfr-data-kpi source="ref" value="count" label="Sites" icon="fr-icon-leaf-line"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'alias icone déprécié',
    html: '<dsfr-data-kpi source="ref" value="count" label="Sites" icone="ri-truck-line"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'heading + lines + label',
    html: '<dsfr-data-kpi source="ref" heading="Part de marché" value="score:avg" format="pourcentage" lines=\'[{"value":"evolution:avg","sign":true,"suffix":"vs N-1","color":"auto"}]\' label="Donnée 2026"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'tendance',
    html: '<dsfr-data-kpi source="ref" value="score:avg" trend="evolution:avg" label="Score"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'color-token vert',
    html: '<dsfr-data-kpi source="ref" value="count:statut:actif" label="Actifs" color-token="vert" icon="ri-checkbox-circle-line"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'color-token orange',
    html: '<dsfr-data-kpi source="ref" value="count" label="Sites" color-token="orange"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'color-token rouge',
    html: '<dsfr-data-kpi source="ref" value="count" label="Sites" color-token="rouge"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'color-token bleu',
    html: '<dsfr-data-kpi source="ref" value="count" label="Sites" color-token="bleu"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'seuils vert',
    html: '<dsfr-data-kpi source="ref" value="score:max" label="Meilleur" format="pourcentage" threshold-green="80" threshold-orange="50"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'seuils orange',
    html: '<dsfr-data-kpi source="ref" value="score:avg" label="Moyen" format="pourcentage" threshold-green="80" threshold-orange="50"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'seuils rouge',
    html: '<dsfr-data-kpi source="ref" value="score:min" label="Plus bas" format="pourcentage" threshold-green="80" threshold-orange="50"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'littéral sans source',
    html: '<dsfr-data-kpi value="=667" label="Validé à la main" unit="ha"></dsfr-data-kpi>',
  },
  {
    nom: 'description a11y',
    html: '<dsfr-data-kpi source="ref" value="count" label="Sites" description="Trois sites suivis"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'chargement',
    html: '<dsfr-data-kpi source="ref" value="count" label="Sites"></dsfr-data-kpi>',
    source: { etat: 'loading' },
  },
  {
    nom: 'erreur de source',
    html: '<dsfr-data-kpi source="ref" value="count" label="Sites"></dsfr-data-kpi>',
    source: { etat: 'error' },
  },
  {
    nom: 'en attente de filtre',
    html: '<dsfr-data-kpi source="ref" value="count" label="Sites"></dsfr-data-kpi>',
    source: { etat: 'idle' },
  },
  {
    nom: 'erreur de configuration',
    html: '<dsfr-data-kpi source="ref" value="montant:somme" label="Sites"></dsfr-data-kpi>',
    source: ROWS,
  },
  {
    nom: 'sans données',
    html: '<dsfr-data-kpi source="ref" value="count" label="Sites"></dsfr-data-kpi>',
  },
  {
    nom: 'groupe cols',
    html: '<dsfr-data-kpi-group cols="4"><dsfr-data-kpi source="ref" value="count" label="A"></dsfr-data-kpi><dsfr-data-kpi source="ref" value="montant:sum" label="B" color-token="rouge"></dsfr-data-kpi></dsfr-data-kpi-group>',
    source: ROWS,
  },
  {
    nom: 'groupe per-row et span',
    html: '<dsfr-data-kpi-group per-row="2 md:4" gap="lg"><dsfr-data-kpi source="ref" value="count" label="A" span="6"></dsfr-data-kpi><dsfr-data-kpi source="ref" value="montant:sum" label="B" col="3"></dsfr-data-kpi></dsfr-data-kpi-group>',
    source: ROWS,
  },
];

/** Balisage sans les blocs `<style>` (comparé byte à byte) et CSS à part. */
function separer(html: string): { markup: string; css: string } {
  const css: string[] = [];
  const markup = html.replace(/<style>([\s\S]*?)<\/style>/g, (_m, s: string) => {
    css.push(s);
    return '<style></style>';
  });
  // Les commentaires (marqueurs de Lit `<!--?lit$…$-->`, `<!---->`) ne se
  // rendent pas : retirés des deux côtés. Une expression `${}` de plus dans le
  // template en ajoute un sans changer un pixel — ce n'est pas ce que ce test
  // surveille. Éléments, attributs et texte, eux, sont comparés byte à byte.
  return { markup: normaliser(markup), css: css.join('\n') };
}

function normaliser(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim();
}

/**
 * Règles CSS `sélecteur -> (propriété -> valeur)` — parseur minimal, sans
 * @media. Un sélecteur écrit deux fois cumule ses déclarations, comme le
 * ferait le navigateur.
 */
function regles(css: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = norm(m[1]);
    if (!selecteur) continue;
    const props = out.get(selecteur) ?? new Map<string, string>();
    for (const d of norm(m[2]).split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      props.set(norm(d.slice(0, i)), norm(d.slice(i + 1)));
    }
    out.set(selecteur, props);
  }
  return out;
}

async function rendre(cas: Cas): Promise<{ markup: string; css: string; hote: string }> {
  clearDataCache('ref');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = cas.html;
  document.body.appendChild(wrapper);
  const kpis = Array.from(wrapper.querySelectorAll('dsfr-data-kpi')) as DsfrDataKpi[];
  const groupe = wrapper.querySelector('dsfr-data-kpi-group') as DsfrDataKpiGroup | null;
  await Promise.all(kpis.map((k) => k.updateComplete));
  if (Array.isArray(cas.source)) dispatchDataLoaded('ref', cas.source);
  else if (cas.source?.etat === 'loading') dispatchDataLoading('ref');
  else if (cas.source?.etat === 'error') dispatchDataError('ref', new Error('HTTP 500'));
  else if (cas.source?.etat === 'idle') dispatchDataIdle('ref');
  await Promise.all(kpis.map((k) => k.updateComplete));
  if (groupe) await groupe.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await Promise.all(kpis.map((k) => k.updateComplete));

  const parts = kpis.map((k) => separer(k.innerHTML));
  let hote = '';
  if (groupe) {
    const shadow = groupe.shadowRoot?.innerHTML ?? '';
    const attrs = Array.from(groupe.attributes)
      .map((a) => `${a.name}="${a.value}"`)
      .sort()
      .join(' ');
    hote = `${attrs} || ${normaliser(shadow)}`;
  }
  wrapper.remove();
  return {
    markup: normaliser(parts.map((p) => p.markup).join('\n')),
    css: parts.map((p) => p.css).join('\n'),
    hote,
  };
}

describe('dsfr-data-kpi : rendu identique sans les nouveaux attributs', () => {
  const rendus = new Map<string, { markup: string; css: string; hote: string }>();

  beforeAll(async () => {
    for (const cas of CAS) rendus.set(cas.nom, await rendre(cas));
    if (WRITE) {
      const ref = Object.fromEntries(rendus);
      writeFileSync(REFERENCE_PATH, JSON.stringify(ref, null, 2) + '\n');
    }
  });

  afterEach(() => {
    clearDataCache('ref');
  });

  it('la référence existe (capturée sur main avant le chantier)', () => {
    expect(existsSync(REFERENCE_PATH)).toBe(true);
  });

  let reference: Record<string, { markup: string; css: string; hote: string }> = {};
  beforeAll(() => {
    reference = existsSync(REFERENCE_PATH) ? JSON.parse(readFileSync(REFERENCE_PATH, 'utf8')) : {};
  });

  it.each(CAS.map((c) => [c.nom] as const))('%s : balisage byte à byte', (nom) => {
    const actuel = rendus.get(nom)!;
    expect(reference[nom], `cas « ${nom} » absent de la référence`).toBeDefined();
    expect(actuel.markup).toBe(normaliser(reference[nom].markup));
    expect(actuel.hote).toBe(normaliser(reference[nom].hote));
  });

  it.each(CAS.map((c) => [c.nom] as const))(
    '%s : chaque règle CSS de la référence existe encore, inchangée',
    (nom) => {
      const avant = regles(reference[nom].css);
      const apres = regles(rendus.get(nom)!.css);
      const ecarts: string[] = [];
      for (const [sel, props] of avant) {
        const nouvelles = apres.get(sel);
        if (!nouvelles) {
          ecarts.push(`${sel} : règle ABSENTE`);
          continue;
        }
        for (const [prop, val] of props) {
          if (nouvelles.get(prop) !== val) {
            ecarts.push(`${sel} { ${prop}: ${val} } -> ${nouvelles.get(prop) ?? 'ABSENTE'}`);
          }
        }
        // Un sélecteur historique ne peut GAGNER qu'une variable (`--*`) :
        // une propriété de rendu ajoutée changerait le rendu par défaut.
        for (const prop of nouvelles.keys()) {
          if (!props.has(prop) && !prop.startsWith('--')) {
            ecarts.push(`${sel} : propriété de rendu ajoutée « ${prop} »`);
          }
        }
      }
      expect(ecarts).toEqual([]);
    }
  );

  it('le diff de balisage sur l’ensemble des cas est vide', () => {
    const diff = CAS.filter(
      (c) => rendus.get(c.nom)!.markup !== normaliser(reference[c.nom]?.markup ?? '')
    ).map((c) => c.nom);
    expect(diff).toEqual([]);
  });
});
