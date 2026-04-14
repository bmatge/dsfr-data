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
      'src-tauri/**',
      'mcp-server/**',
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
