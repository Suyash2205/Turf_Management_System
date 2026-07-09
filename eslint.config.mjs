import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
  {
    // Background polling in client code keeps a Vercel Fluid instance warm
    // 24/7 (the poll interval is shorter than the idle timeout, so it never
    // scales to zero) and fires a DB query per tick. This paused the whole
    // Vercel account once. Refresh on `focus`/`visibilitychange` instead.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "setInterval",
          message:
            "No background polling in client code — it pins a Vercel Fluid instance warm 24/7 and burns DB operations. Refresh on focus/visibilitychange instead.",
        },
      ],
    },
  },
]);

export default eslintConfig;
