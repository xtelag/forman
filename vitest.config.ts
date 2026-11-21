import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.join(rootDir, "src"),
    },
  },
  test: {
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    projects: [
      {
        extends: true,
        test: {
          environment: "node",
          globalSetup: ["./tests/global-setup.ts"],
          include: ["tests/**/*.test.ts"],
          name: "node",
        },
      },
      {
        extends: true,
        test: {
          environment: "jsdom",
          setupFiles: ["./tests/setup.ts", "./tests/setup-admin.ts"],
          include: ["tests/**/*.test.tsx"],
          name: "jsdom",
        },
      },
    ],
  },
});
