// https://docs.expo.dev/guides/using-eslint/
//
// Flat config (ESLint 9). Kept separate from the website's `.eslintrc.json`
// (`next/core-web-vitals`) — that one targets React DOM and flags every native
// <Image> with `jsx-a11y/alt-text`, which does not apply here.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
  {
    rules: {
      // The `@/*` alias is resolved by Metro and *verified* by
      // `npx tsc --noEmit`, which is stricter than the import plugin (it sees
      // path aliases in tsconfig.json). The plugin does not, so every file
      // would be reported as unresolved.
      'import/no-unresolved': 'off',

      // Fetching in an effect is deliberate here: `useApi` and the providers
      // read from the network or the Keychain and commit the result afterwards.
      // The rule aims at *synchronous* cascading renders, but it fires on any
      // effect that reaches a setState — including every `load()` that only
      // commits after an `await`. TypeScript + this rule's intent are both
      // satisfied; silencing it avoids masking genuine bugs elsewhere.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
