import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Dùng lại alias trong tsconfig.base.json (@common/*, @core-service/*, @app-domain/*...)
const { paths } = JSON.parse(readFileSync(resolve(__dirname, "tsconfig.base.json"), "utf8")).compilerOptions as {
  paths: Record<string, string[]>;
};
const alias = Object.entries(paths).map(([key, [target]]) =>
  key.endsWith("/*")
    ? { find: new RegExp(`^${key.slice(0, -2).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/(.*)$`), replacement: resolve(__dirname, target.slice(0, -2)) + "/$1" }
    : { find: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`), replacement: resolve(__dirname, target) },
);

export default defineConfig({
  // SWC để giữ decorator metadata (MikroORM entity) — esbuild mặc định không emit
  plugins: [swc.vite({ module: { type: "es6" } })],
  resolve: { alias },
  test: {
    include: ["{apps,jobs,libs}/**/*.spec.ts"],
    environment: "node",
    // test tích hợp dùng chung một database
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
