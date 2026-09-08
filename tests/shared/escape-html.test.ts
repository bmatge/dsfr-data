import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  singleQuoteAttr,
  jsonAttr,
  jsonLiteral,
  jsStringLiteral,
} from '../../packages/shared/src/utils/escape-html';

describe('escapeHtml', () => {
  it('should escape ampersand', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('should escape less than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('should escape greater than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('should handle null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('should handle undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should return string unchanged if no special chars', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123');
  });

  it('should handle multiple special chars', () => {
    expect(escapeHtml('<div class="test">&</div>')).toBe(
      '&lt;div class=&quot;test&quot;&gt;&amp;&lt;/div&gt;'
    );
  });
});

/**
 * Echappement des donnees embarquees dans un attribut (#615).
 *
 * La recette du generateur de l'Assistant IA a montre que
 * `data='${JSON.stringify(…)}'` casse sur une etiquette francaise ordinaire :
 * `JSON.stringify` echappe `"`, jamais `'`. Le patron etait ecrit a SEPT
 * endroits avec CINQ echappements differents — un complet, deux partiels sans
 * esperluette, deux absents, et un helper local `escapeSingleQuotes` qui ne
 * couvrait que l'apostrophe.
 *
 * Trois fonctions, trois contextes distincts, et c'est la distinction qui
 * compte : melanger les deux derniers produit un defaut VISIBLE plutot qu'une
 * balise cassee, donc plus difficile a rattacher a sa cause.
 */
describe('jsonAttr', () => {
  /** Relit la valeur comme un navigateur le ferait. */
  const relire = (valeur: unknown): unknown => {
    const doc = new DOMParser().parseFromString(
      `<dsfr-data-source data='${jsonAttr(valeur)}'></dsfr-data-source>`,
      'text/html'
    );
    return JSON.parse(doc.querySelector('dsfr-data-source')!.getAttribute('data')!);
  };

  it('traverse l’apostrophe — le defaut d’origine', () => {
    const lignes = [{ region: "Provence-Alpes-Cote d'Azur" }, { region: "Val-d'Oise" }];

    expect(relire(lignes)).toEqual(lignes);
  });

  it('traverse l’esperluette sans la decoder', () => {
    // Sans echapper `&`, un `&amp;` present dans la donnee redevient `&` a la
    // lecture : corruption silencieuse, aucun message.
    expect(relire([{ nom: 'Recherche &amp; Developpement' }])).toEqual([
      { nom: 'Recherche &amp; Developpement' },
    ]);
  });

  it('traverse un chevron sans ouvrir de balise', () => {
    expect(relire([{ note: '<script>alert(1)</script>' }])).toEqual([
      { note: '<script>alert(1)</script>' },
    ]);
    expect(jsonAttr([{ note: '<b>' }])).not.toContain('<b>');
  });

  it('laisse le JSON valide — le guillemet double n’est PAS echappe', () => {
    // C'est pour cela que `escapeHtml` ne convient pas ici : il transformerait
    // les `"` de la syntaxe JSON en `&quot;` et rendrait la valeur illisible.
    expect(jsonAttr([{ a: 'b' }])).toContain('"a"');
  });

  it('accepte les valeurs qui ne sont pas des tableaux', () => {
    expect(relire({ '93': 5098666, '95': 1249674 })).toEqual({ '93': 5098666, '95': 1249674 });
  });
});

describe('singleQuoteAttr — la serialisation a deja eu lieu', () => {
  const relire = (brut: string): unknown => {
    const doc = new DOMParser().parseFromString(
      `<dsfr-data-chart name='${singleQuoteAttr(brut)}'></dsfr-data-chart>`,
      'text/html'
    );
    return JSON.parse(doc.querySelector('dsfr-data-chart')!.getAttribute('name')!);
  };

  it('traverse une serie francaise deja serialisee', () => {
    // Le cas du Builder : `x`/`y`/`name` de DSFR Chart sont construits par
    // `JSON.stringify` en amont, puis poses dans l'attribut. C'est la chaine
    // qu'on echappe, pas la valeur.
    const serie = JSON.stringify(["Val-d'Oise", "Cotes-d'Armor"]);

    expect(relire(serie)).toEqual(["Val-d'Oise", "Cotes-d'Armor"]);
  });

  it('n’altere pas une chaine sans caractere sensible', () => {
    expect(singleQuoteAttr('["Paris"]')).toBe('["Paris"]');
  });

  it('jsonAttr n’est que singleQuoteAttr applique a JSON.stringify', () => {
    const valeur = [{ region: "Val-d'Oise & Oise", note: '<b>' }];

    expect(jsonAttr(valeur)).toBe(singleQuoteAttr(JSON.stringify(valeur)));
  });
});

describe('jsonLiteral — une valeur JSON dans un <script>', () => {
  // Ces tests existent parce que `jsonLiteral` n'en avait AUCUN en propre :
  // il n'etait couvert qu'indirectement, par la delegation de
  // `jsStringLiteral`. Une mutation qui desarmait `jsonLiteral` ET rendait
  // `jsStringLiteral` autonome laissait 371 tests au vert, alors que tous les
  // blocs `const data = …` perdaient leur protection. Un garde qui tient a un
  // refactor pres ne tient pas.

  /** Evalue le bloc comme le ferait le navigateur. */
  const evaluer = (valeur: unknown): unknown => new Function(`return ${jsonLiteral(valeur)};`)();

  it('restitue la valeur a l’identique', () => {
    const donnees = [
      { region: "Val-d'Oise", pop: 1249674 },
      { region: 'A & B', pop: 0 },
    ];

    expect(evaluer(donnees)).toEqual(donnees);
  });

  it('neutralise une fermeture de script glissee dans une donnee', () => {
    // Le parseur HTML ne connait pas la syntaxe JavaScript : il cherche la
    // sequence `</script>`, point. Une cellule qui la contient fermerait le
    // bloc et deverserait le reste des donnees dans la page.
    const donnees = [{ note: '</script><img src=x onerror=alert(1)>' }];
    const bloc = jsonLiteral(donnees);

    expect(bloc, 'le bloc referme le script').not.toContain('</script>');
    expect(evaluer(donnees), 'la donnee doit rester intacte a l’execution').toEqual(donnees);
  });

  it('protege aussi la casse mixte, que le parseur ignore', () => {
    expect(jsonLiteral([{ x: '</ScRiPt>' }])).not.toMatch(/<\/script/i);
  });

  it('n’echappe pas au-dela du necessaire', () => {
    // `>` et `&` sont sans danger en contexte JS : les echapper produirait
    // des donnees fausses a l'execution.
    expect(evaluer({ a: 'x > y & z' })).toEqual({ a: 'x > y & z' });
  });

  it('jsStringLiteral en derive — la protection ne peut pas diverger', () => {
    // C'est la mutation b3-ii qui a montre le besoin : les deux doivent
    // rester la MEME implementation, pas deux copies qui s'alignent par
    // hasard.
    expect(jsStringLiteral("Val-d'Oise")).toBe(jsonLiteral("Val-d'Oise"));
    expect(jsStringLiteral('</script>')).toBe(jsonLiteral('</script>'));
  });
});

describe('jsStringLiteral — contexte JavaScript, pas HTML', () => {
  /** Evalue le litteral comme le ferait le navigateur dans le script genere. */
  const evaluer = (brut: string): string =>
    new Function(`return ${jsStringLiteral(brut)};`)() as string;

  it('restitue l’apostrophe TELLE QUELLE, pas en entite', () => {
    // Le defaut : `el.setAttribute('name', '&#039;')` pose les six caracteres
    // `&#039;` — `setAttribute` ne decode pas les entites — et la legende
    // affiche « Val-d&#039;Oise ». Une balise cassee se voit ; ceci se lit.
    expect(evaluer(JSON.stringify(["Val-d'Oise"]))).toBe('["Val-d\'Oise"]');
    expect(jsStringLiteral("Val-d'Oise")).not.toContain('&#0');
  });

  it('produit un litteral avec ses propres guillemets', () => {
    // L'appelant n'en ajoute pas : `setAttribute('name', ${jsStringLiteral(x)})`.
    expect(jsStringLiteral('abc').startsWith('"')).toBe(true);
  });

  it('neutralise une fermeture de script glissee dans la donnee', () => {
    const litteral = jsStringLiteral('</script><script>alert(1)</script>');

    expect(litteral).not.toContain('</script>');
    expect(evaluer('</script>')).toBe('</script>');
  });

  it('survit au retour chariot et a l’antislash', () => {
    expect(evaluer('a\nb\\c')).toBe('a\nb\\c');
  });
});

describe('aucun generateur n’echappe a la main pour un attribut simple', () => {
  const GENERATEURS = [
    'apps/builder-ia/src/ui/code-generator.ts',
    'apps/builder/src/ui/code-generator.ts',
    'apps/builder-carto/src/ui/code-generator.ts',
    'packages/shared/src/dashboard/export-html.ts',
  ];

  const lireGenerateurs = async (): Promise<[string, string][]> => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const racine = join(__dirname, '../..');
    return GENERATEURS.map((f) => [f, readFileSync(join(racine, f), 'utf-8')]);
  };

  it('personne ne pose JSON.stringify directement dans l’attribut', () => {
    // La forme d'origine : `data='${JSON.stringify(…)}'`, aucun echappement.
    return lireGenerateurs().then((fichiers) => {
      for (const [nom, src] of fichiers) {
        expect(src, `${nom} : JSON.stringify dans un attribut simple`).not.toMatch(
          /='\$\{JSON\.stringify/
        );
      }
    });
  });

  it('personne ne se recrit un echappement d’apostrophe', () => {
    // La forme que la premiere passe avait LAISSEE PASSER : un helper local
    // `escapeSingleQuotes` qui ne couvrait que `'`. Le garde-fou precedent ne
    // cherchait que `JSON.stringify` et ne le voyait pas — un correctif
    // applique chez un consommateur, declare « remplace partout ».
    return lireGenerateurs().then((fichiers) => {
      for (const [nom, src] of fichiers) {
        expect(src, `${nom} : echappement d’apostrophe ecrit a la main`).not.toMatch(
          /replace\(\/'\/g/
        );
      }
    });
  });

  it('l’echappement partagé reste la seule definition', async () => {
    // `escape-html.ts` est le seul endroit ou ces caracteres sont traites.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(
      join(__dirname, '../../packages/shared/src/utils/escape-html.ts'),
      'utf-8'
    );

    expect(src).toContain('export function singleQuoteAttr');
    expect(src).toContain('export function jsonAttr');
    expect(src).toContain('export function jsStringLiteral');
  });
});
