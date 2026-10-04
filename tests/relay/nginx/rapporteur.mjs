// Rapporteur `node:test` du banc nginx : une ligne JSON par test (pas par suite).
//
//   node --test --test-reporter=./tests/relay/nginx/rapporteur.mjs …
//
// Le pont Vitest (`relais-nginx.test.ts`) y lit le nom de chaque test rouge et la
// raison de son échec, pour les comparer à la liste des limites documentées de
// l'extrait (`limites.mjs`). Les diagnostics (`t.diagnostic`) sont repris tels quels.

/** @param {AsyncIterable<{ type: string, data: Record<string, any> }>} source */
export default async function* rapporteur(source) {
  for await (const event of source) {
    const { type, data } = event;
    if (type === 'test:diagnostic') {
      yield `${JSON.stringify({ issue: 'note', texte: String(data.message) })}\n`;
      continue;
    }
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    if (data.details?.type === 'suite') continue;
    if (type === 'test:pass') {
      const saute = data.skip !== undefined && data.skip !== false;
      yield `${JSON.stringify({ issue: saute ? 'saute' : 'vert', nom: data.name })}\n`;
      continue;
    }
    const erreur = data.details?.error;
    const cause = erreur?.cause ?? erreur;
    yield `${JSON.stringify({
      issue: 'rouge',
      nom: data.name,
      erreur: String(cause?.message ?? cause ?? '').slice(0, 800),
    })}\n`;
  }
}
