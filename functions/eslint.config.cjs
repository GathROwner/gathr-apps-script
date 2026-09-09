const tseslint = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    name: 'gathr/ignores',
    ignores: [
      'coverage/**',
      'lib/**',
      'node_modules/**',
    ],
  },
  ...tseslint.configs['flat/recommended'],
  {
    name: 'gathr/legacy-typescript-baseline',
    files: ['src/**/*.ts'],
    rules: {
      // The parser currently uses flexible external payloads throughout. Keep
      // that debt visible without making the ESLint 9 migration rewrite it.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-nocheck': false,
        },
      ],
      'prefer-const': 'warn',
    },
  },
];
