import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    ".npm-cache/**",
    "coverage/**",
    "out/**",
    "playwright-report/**",
    "test-results/**",
    "fitora-scaffold/**",
    "next-env.d.ts",
  ]),
]);

