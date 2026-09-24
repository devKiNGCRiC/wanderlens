/**
 * ESLint config (flat-config format), used by `npm run lint` (`expo lint`).
 * Uses Expo's recommended rule set as-is. The Supabase Edge Functions folder is
 * ignored because it is Deno code (URL imports, the `Deno` global) that the
 * React Native rules would flag incorrectly.
 */
// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'supabase/functions/*'],
  },
]);
