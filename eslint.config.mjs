import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "scripts/**"],
  },
  {
    files: ["apps/**/*.ts", "jobs/**/*.ts", "libs/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier,
    },
    rules: {
      ...tseslint.configs["recommended"].rules,
      ...prettierConfig.rules,
      "prettier/prettier": "error",

      // --- Disabled / overridden NestJS/framework rules ---
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-require-imports": "off",

      // --- Type safety (CLAUDE.md: avoid `as any`, use proper MikroORM types) ---
      // warn instead of error: ~39 existing violations mostly from MikroORM ref pattern
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",

      // --- Unused vars (error, prefix _ to suppress) ---
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      // --- Import hygiene ---
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // --- Async safety: critical for NestJS promise handling ---
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],

      // --- Modern TypeScript syntax ---
      // prefer-nullish-coalescing requires strictNullChecks — enable when tsconfig "strict" is turned on
      "@typescript-eslint/prefer-optional-chain": "error",
    },
  },
];
