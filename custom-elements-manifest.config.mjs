/**
 * Configuration @custom-elements-manifest/analyzer.
 *
 * Produit `packages/core/custom-elements.json` : la description machine des
 * composants `dsfr-data-*` (attributs, types, defauts, evenements, slots,
 * variables CSS) extraite du code + du JSDoc.
 *
 * Deux consommateurs :
 *  - `scripts/build-skills-reference.ts` -> section « reference » generee des
 *    skills builder-IA / MCP (issue #512) ;
 *  - les integrateurs de la lib npm (autocompletion editeur via le manifeste).
 *
 * Regenerer avec `npm run build:cem` (le fichier produit est commite).
 *
 * Attributs qui designent un CHAMP des donnees (#1141) : tag JSDoc
 * `@champ <grammaire>` sur la propriete. Le plugin `champsDesDonnees` le
 * reporte sur l'attribut du manifeste (`"champ": "liste"`), d'ou
 * `build:component-contract` le propage au contrat des composants et a la
 * table `FIELD_ATTRS` du diagnostic. Grammaires : voir `FieldAttrKind`
 * (`packages/shared/src/debug/field-check.ts`).
 */

/** Grammaires permises pour `@champ` — miroir de `FieldAttrKind` (test-garde). */
export const GRAMMAIRES_CHAMP = [
  'nom',
  'liste',
  'liste-alias',
  'pipe-alias',
  'clauses',
  'paires',
  'chemin',
  'expression',
];

/**
 * Lit `@champ <grammaire>` sur les proprietes des classes, puis le pose sur les
 * attributs correspondants (y compris herites d'un mixin) une fois le
 * manifeste lie. Une grammaire inconnue fait ECHOUER l'analyse : un marquage
 * mal ecrit ne doit pas disparaitre en silence.
 */
function champsDesDonnees() {
  /** nom de classe -> nom de propriete -> grammaire */
  const parClasse = new Map();
  return {
    name: 'dsfr-data-champs',
    analyzePhase({ ts, node }) {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      const classe = node.name.getText();
      for (const membre of node.members) {
        if (!membre.name || !ts.isPropertyDeclaration(membre)) continue;
        for (const tag of ts.getJSDocTags(membre)) {
          if (tag.tagName.getText() !== 'champ') continue;
          const brut = typeof tag.comment === 'string' ? tag.comment : '';
          const grammaire = (brut.trim().split(/\s+/)[0] || 'nom').trim();
          if (!GRAMMAIRES_CHAMP.includes(grammaire)) {
            throw new Error(
              `@champ "${grammaire}" inconnu sur ${classe}.${membre.name.getText()} — permis : ${GRAMMAIRES_CHAMP.join(', ')}`
            );
          }
          if (!parClasse.has(classe)) parClasse.set(classe, new Map());
          parClasse.get(classe).set(membre.name.getText(), grammaire);
        }
      }
    },
    packageLinkPhase({ customElementsManifest }) {
      for (const mod of customElementsManifest.modules ?? []) {
        for (const decl of mod.declarations ?? []) {
          for (const attr of decl.attributes ?? []) {
            if (!attr.fieldName) continue;
            const classe = attr.inheritedFrom?.name ?? decl.name;
            const grammaire = parClasse.get(classe)?.get(attr.fieldName);
            if (grammaire) attr.champ = grammaire;
          }
        }
      }
    },
  };
}

export default {
  globs: ['packages/core/src/components/*.ts'],
  exclude: ['**/*.test.ts'],
  outdir: 'packages/core',
  litelement: true,
  dev: false,
  plugins: [champsDesDonnees()],
};
