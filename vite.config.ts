import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
  },
  lint: { ignorePatterns: ["**/dist/**", "SPEC.md"] },
  fmt: { ignorePatterns: ["**/dist/**", "SPEC.md", "pnpm-lock.yaml"] },
});
