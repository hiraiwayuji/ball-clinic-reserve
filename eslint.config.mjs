import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // .claude/worktrees には他セッション用の git worktree（フルコピー）が入ることがあり、
    // それをこのプロジェクトのソースとして誤って lint してしまうのを防ぐ（.gitignore 済み）。
    ".claude/**",
  ]),
]);

export default eslintConfig;
