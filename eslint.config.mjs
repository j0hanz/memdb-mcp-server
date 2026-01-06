import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import unusedImports from 'eslint-plugin-unused-imports';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const sourceFiles = ['src/**/*.ts'];
const testFiles = ['tests/**/*.ts'];
const tsFiles = [...sourceFiles, ...testFiles];

const sharedRules = {
  'unused-imports/no-unused-imports': 'error',
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],
  '@typescript-eslint/consistent-type-exports': [
    'error',
    { fixMixedExportsWithInlineTypeSpecifier: true },
  ],
  '@typescript-eslint/explicit-function-return-type': [
    'error',
    { allowExpressions: true, allowTypedFunctionExpressions: true },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': [
    'error',
    { checksVoidReturn: { arguments: false } },
  ],
  '@typescript-eslint/only-throw-error': 'error',
  complexity: ['error', { max: 5, variant: 'classic' }],
  'max-depth': ['error', 2],
  'max-lines': [
    'error',
    { max: 300, skipBlankLines: true, skipComments: true },
  ],
  'max-lines-per-function': [
    'error',
    { max: 40, skipBlankLines: true, skipComments: true },
  ],
  'max-params': ['error', 3],
  'prefer-const': 'error',
  'no-var': 'error',
  'sonarjs/cognitive-complexity': ['error', 10],
};

export default defineConfig([
  { ignores: ['dist', 'node_modules', '*.config.mjs', '*.config.js'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: tsFiles,
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: tsFiles,
  })),
  {
    files: sourceFiles,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'unused-imports': unusedImports, sonarjs },
    rules: sharedRules,
  },
  {
    files: testFiles,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: ['./tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'unused-imports': unusedImports, sonarjs },
    rules: sharedRules,
  },
  eslintConfigPrettier,
]);
