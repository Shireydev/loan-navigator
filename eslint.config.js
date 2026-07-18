const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: [
      '.expo/**',
      'Builds/**',
      'node_modules/**',
      'loan-navigator-tax-api/data/**',
    ],
  },
]);
