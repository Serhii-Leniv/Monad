/**
 * Deliberately narrow: rules that catch REAL bugs, not style.
 *
 * The codebase already had ~10 `eslint-disable react-hooks/*` comments for a
 * linter that was never installed — those suppressions were load-bearing
 * documentation of intentional dependency omissions, but nothing was checking
 * the un-suppressed cases. That's the gap this closes.
 *
 * No formatting rules (there's no Prettier here and reformatting 16k lines would
 * bury every future diff), and no blanket `recommended` set — the goal is a
 * signal-dense lint that stays worth running.
 */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  ignorePatterns: ['out/', 'dist/', 'node_modules/', 'scripts/', '*.cjs'],
  rules: {
    // The reason this config exists.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Genuine-bug rules that don't require type information (fast, no project
    // parse). Each of these has a real failure mode behind it.
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }
    ],
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-fallthrough': 'error',
    // `case x: const y = …` leaks the binding across every later case.
    'no-case-declarations': 'error',
    'no-self-compare': 'error',
    // `await` in a loop over independent work serialises it; flagged, not banned.
    'require-atomic-updates': 'warn',
    'no-promise-executor-return': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-unreachable-loop': 'error',
    'no-template-curly-in-string': 'warn'
  },
  overrides: [
    {
      // Tests legitimately assert on odd shapes.
      files: ['**/*.test.ts'],
      rules: { '@typescript-eslint/no-unused-vars': 'off' }
    }
  ]
}
