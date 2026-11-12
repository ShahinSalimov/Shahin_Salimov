import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // The logger is the single place allowed to write to stdout.
    files: ["src/lib/logger.ts", "scripts/**"],
    rules: { "no-console": "off" },
  },
  {
    // Playwright scripts run directly with Node (CommonJS).
    files: ["tests/e2e/**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { require: "readonly", process: "readonly", console: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off", "no-console": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"]),
]);
