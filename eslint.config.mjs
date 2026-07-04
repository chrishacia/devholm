import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  // Custom rules
  {
    rules: {
      // Allow setState in useEffect for legitimate hydration detection patterns
      // This is a common pattern for client-only rendering detection
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  // Allow require() in CommonJS config files
  {
    files: ['*.js', '*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['packages/sdk/**/*.ts', 'packages/sdk/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@core/*', '@user/*', '@/*'],
              message:
                'SDK package code must not import root framework aliases. Keep @devholm/sdk independent from root internals.',
            },
            {
              group: [
                '**/src/core/*',
                '**/src/app/*',
                '**/src/user/*',
                '../../../src/*',
                '../../../../src/*',
                '../../../../../src/*',
              ],
              message:
                'SDK package code must not import root framework source files through deep-relative or direct src paths.',
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
