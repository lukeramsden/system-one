import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: [
      "src/index.ts",
      "src/core.ts",
      "src/adapter.ts",
      "src/effect.ts",
      "src/adapters/typesafe.ts",
      "src/adapters/cloudflare.ts",
      "src/adapters/laya.ts",
    ],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["effect", /^effect\//, "@effect/platform", /^@effect\/platform\//],
  },
});
