import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const fromRoot = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

const contractAlias = { "@closet/contract": fromRoot("./packages/contract/src/index.ts") };
const renderAlias = { "@closet/harness-render": fromRoot("./packages/harness-render/src/index.ts") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: contractAlias },
        test: {
          name: "contract",
          root: "./packages/contract",
          environment: "node",
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: contractAlias },
        test: {
          name: "harness-render",
          root: "./packages/harness-render",
          environment: "node",
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: { ...contractAlias, ...renderAlias } },
        test: {
          name: "registry-unit",
          root: "./apps/registry",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: { ...contractAlias, ...renderAlias } },
        test: {
          name: "registry-api",
          root: "./apps/registry",
          environment: "node",
          include: ["tests/api/**/*.test.ts"],
          setupFiles: ["./tests/setup/mock-db.ts"],
          fileParallelism: false,
        },
      },
      {
        plugins: [vue()],
        resolve: {
          alias: {
            ...contractAlias,
            ...renderAlias,
            "~~": fromRoot("./apps/admin-panel"),
            "@@": fromRoot("./apps/admin-panel"),
            "~": fromRoot("./apps/admin-panel/app"),
            "@": fromRoot("./apps/admin-panel/app"),
          },
        },
        test: {
          name: "admin-unit",
          root: "./apps/admin-panel",
          environment: "happy-dom",
          include: ["tests/unit/**/*.test.ts", "tests/components/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "codemods",
          root: "./scripts",
          environment: "node",
          include: ["codemods/tests/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["apps/*/src/**/*.ts", "packages/*/src/**/*.ts", "apps/admin-panel/app/utils/**/*.ts"],
      exclude: [
        "**/tests/**",
        "**/dist/**",
        "**/.nuxt/**",
        "**/.output/**",
        "**/*.d.ts",
        "apps/registry/src/db/entities/**",
        "apps/registry/src/db/migrations/**",
        "apps/registry/src/db/run-migrations.ts",
        "apps/registry/src/db/revert-migration.ts",
        "apps/registry/src/server.ts",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        "apps/registry/src/registry/file-store.ts": { statements: 100, branches: 100 },
        "apps/registry/src/plugins/auth.ts": { statements: 100, branches: 100 },
        "apps/registry/src/auth/guards.ts": { statements: 100, branches: 100 },
        "apps/registry/src/auth/password.ts": { statements: 100, branches: 100 },
      },
    },
  },
});
