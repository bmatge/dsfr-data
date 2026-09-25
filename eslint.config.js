import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import litPlugin from 'eslint-plugin-lit';
import securityPlugin from 'eslint-plugin-security';

export default tseslint.config(
  // Ignored paths
  {
    ignores: [
      'dist/**',
      'app-dist/**',
      'coverage/**',
      'node_modules/**',
      '**/node_modules/**',
      '**/*.js',
      '**/*.d.ts',
      'mcp-server/**',
      // Artefact genere (npm run build:skills) : eslint --fix y retirait le
      // /* eslint-disable */ de tete, faisant diverger le fichier commite du
      // rendu du generateur.
      'packages/shared/src/skills/skills-reference.generated.ts',
      // Registres de reperes (npm run build:reperes) : meme raison.
      'apps/*/src/assistant/reperes.generated.ts',
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended (type-aware disabled for speed)
  ...tseslint.configs.recommended,

  // Lit plugin recommended
  litPlugin.configs['flat/recommended'],

  // Security plugin recommended (complément léger au SAST Semgrep/CodeQL)
  securityPlugin.configs.recommended,

  // Project-wide rules
  {
    rules: {
      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-function': 'off',

      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-useless-escape': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // eslint-plugin-security : overrides globaux
      //
      // detect-object-injection : trop bruyant sur TypeScript. Toute indexation
      //   obj[key] où key n'est pas un littéral déclenche la règle, y compris
      //   les simples array[i], les builders paramétrés typés, les reducers…
      //   Le typage TS + les corrections de prototype pollution via
      //   `isUnsafeKey()` (cf. #57) couvrent déjà le risque réel. Désactivée
      //   globalement, comme recommandé dans le README de eslint-plugin-security
      //   pour les projets TS.
      'security/detect-object-injection': 'off',

      // detect-non-literal-fs-filename : uniquement pertinente pour du code
      //   qui lit des chemins fournis par l'utilisateur. Nos seuls fs.*Sync
      //   sont dans les configs Vite et les scripts de build, où les chemins
      //   sont des constantes de projet.
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // Frontière lib/app (#319) : la bibliothèque publiée (packages/core) ne doit
  // importer que l'entrée lib-safe de shared. Le barrel racine ré-exporte
  // auth/, storage/, ui/ (modales, toasts, appels /api/*) qui n'ont rien à
  // faire dans les bundles npm/CDN.
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@dsfr-data/shared',
              message:
                "packages/core ne doit importer que la frontière lib-safe : utiliser '@dsfr-data/shared/lib' (#319).",
            },
          ],
          patterns: [
            {
              group: [
                '@dsfr-data/shared/auth/*',
                '@dsfr-data/shared/storage/*',
                '@dsfr-data/shared/ui/*',
              ],
              message: 'Module app-side interdit dans packages/core (#319).',
            },
          ],
        },
      ],
    },
  },
  // Neutralité fournisseur (#1134) : les composants et leurs utilitaires ne
  // parlent aux fournisseurs qu'à travers le contrat ApiAdapter (import type)
  // et le registre. Règle distincte de celle de #319 (variante
  // typescript-eslint, pour `allowTypeImports`) : les deux s'appliquent.
  // Pendant du garde-fou statique tests/lib-provider-neutrality.test.ts.
  {
    files: ['packages/core/src/components/**/*.ts', 'packages/core/src/utils/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@dsfr-data/shared/lib',
              importNames: [
                'ODS_CONFIG',
                'TABULAR_CONFIG',
                'GRIST_CONFIG',
                'INSEE_CONFIG',
                'buildGristHeaders',
                'flattenInseeObservation',
                'buildInseeLabelIndex',
                'applyInseeLabels',
                'fetchInseeLabelIndex',
                'clearInseeLabelCache',
                'INSEE_CODE_SUFFIX',
                'parseDataGouvDataset',
                'dataGouvDatasetApiUrl',
                'extractDataGouvResources',
              ],
              message:
                'Spécificité de fournisseur : elle appartient à un adaptateur (packages/core/src/adapters), pas à un composant (#1134).',
            },
          ],
          patterns: [
            {
              group: [
                '**/adapters/*',
                '!**/adapters/api-adapter.js',
                '!**/adapters/adapter-registry.js',
                // Résolution du dialecte WHERE d'un adaptateur (#1135) : seul
                // utils/where.ts l'importe, pour déléguer à l'adaptateur
                '!**/adapters/where-dialect.js',
              ],
              message:
                'Un composant ne connaît aucun adaptateur : passer par le contrat ApiAdapter (import type) ou le registre getAdapter (#1134).',
            },
            {
              group: ['**/adapters/api-adapter.js'],
              allowTypeImports: true,
              message:
                "api-adapter.js s'importe en `import type` seulement ; le registre vit dans adapter-registry.js (#1134).",
            },
          ],
        },
      ],
    },
  },

  // Relax rules for test files
  {
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Relax rules for scripts
  {
    files: ['scripts/**/*.ts', 'scripts/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  }
);
