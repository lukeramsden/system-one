import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
  },
  lint: { ignorePatterns: ["**/dist/**"] },
  fmt: { ignorePatterns: ["**/dist/**", "pnpm-lock.yaml", "CHANGELOG.md"] },
});
