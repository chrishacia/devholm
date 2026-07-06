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
    // Playwright generated artifacts - never lint transient reports
    'playwright-report/**',
    'test-results/**',
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
              // SDK contracts must not depend on framework types/business logic
              // This ensures SDK can be used by external consumers without framework deps
              group: ['@core/types/*', '@core/app/*', '@user/*', '@/*'],
              message:
                'SDK package code must not import root framework types/business logic. Keep @devholm/sdk contracts independent. Use types from @devholm/sdk/types instead.',
            },
            {
              // Deep-relative imports to root internals must be blocked
              group: [
                '**/src/core/types/*',
                '**/src/app/*',
                '**/src/user/*',
                '../../../src/core/types/*',
                '../../../src/app/*',
                '../../../src/user/*',
                '../../../src/middleware/*',
                '../../../../src/core/types/*',
                '../../../../src/app/*',
                '../../../../src/user/*',
                '../../../../src/middleware/*',
                '../../../../../src/core/types/*',
                '../../../../../src/app/*',
                '../../../../../src/user/*',
                '../../../../../src/middleware/*',
              ],
              message:
                'SDK package code must not import root framework types/business logic through relative paths. Keep @devholm/sdk contracts independent.',
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
