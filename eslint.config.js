import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "_site/**",
      ".output/**",
      ".wxt/**",
      ".acl-recovery/**",
      ".migration-backup/**",
      "node_modules/**",
      "docs/**",
      "private/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ["src/**/*.{ts,vue}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      "server/**/*.ts",
      "*.config.ts",
      "shared/**/*.ts",
      "scripts/**/*.mjs",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
);
