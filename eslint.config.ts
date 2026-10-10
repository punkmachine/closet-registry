import eslint from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";
import nodePlugin from "eslint-plugin-n";
import security from "eslint-plugin-security";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

// import importPlugin from "eslint-plugin-import"; // установлен, настройка отключена (см. plans/02-format-lint.md)

const TS_FILES = ["**/*.ts"];
const REGISTRY_FILES = ["apps/registry/**/*.ts"];

export default defineConfig(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/.nuxt/**",
      "**/.output/**",
      "**/node_modules/**",
      "**/registry/plugins/**",
      // .vue-файлы требуют vue-eslint-parser — вне объёма этапа
      "**/*.vue",
      "**/*.d.ts",
      "eslint.config.ts",
    ],
  },

  {
    files: TS_FILES,
    extends: [
      eslint.configs.recommended,
      // strictTypeChecked, а не recommended: проект уже на noUncheckedIndexedAccess
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      unicorn.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Fastify-специфика: главный источник реальных багов — async-хендлеры
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/return-await": ["error", "always"],

      // особенно полезно вместе с noUncheckedIndexedAccess
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "separate-type-imports" }],
      "@typescript-eslint/explicit-module-boundary-types": "error",

      // пустая строка в env/config — тоже "не задано", поэтому || для строк осознанный
      "@typescript-eslint/prefer-nullish-coalescing": ["error", { ignorePrimitives: { string: true } }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],

      "no-console": "error",
      eqeqeq: ["error", "always"],

      // unicorn: шумные/спорные правила отключены точечно
      "unicorn/name-replacements": "off", // Repo/Params/Deps — принятые в проекте и экосистеме сокращения
      "unicorn/no-null": "off", // null — часть контрактов TypeORM, zod и JSON-схем
      "unicorn/no-top-level-side-effects": "off", // server.ts и fastify-плагины
      "unicorn/no-array-reduce": "off", // semver-reduction в plugins-repository.ts — осознанно
      "unicorn/no-top-level-assignment-in-function": "off", // счётчик id в admin-panel
      "unicorn/consistent-boolean-name": "off",
      "unicorn/no-process-exit": "off", // server.ts использует осознанно
      // JSDoc-комментарии появятся на этапе 05 — стиль комментариев не навязываем
      "unicorn/single-line-block-comment-style": "off",
      "unicorn/no-asterisk-prefix-in-documentation-comments": "off",
    },
  },

  // ESM + NodeNext: обязательный .js в относительных импортах (только бэкенд)
  {
    files: REGISTRY_FILES,
    extends: [nodePlugin.configs["flat/recommended-module"]],
    rules: {
      "n/no-missing-import": "error",
      "n/no-process-exit": "off", // server.ts использует осознанно
    },
  },

  // security — только бэкенд, на admin-panel не подключается
  {
    files: REGISTRY_FILES,
    extends: [security.configs.recommended],
    rules: {
      // file-store.ts — главное место с путями из пользовательского ввода, они проходят resolveSafePath()
      "security/detect-non-literal-fs-filename": "error",
      // ложные срабатывания на индексации словарей/массивов по валидированному ключу
      "security/detect-object-injection": "off",
    },
  },

  // fastify-плагины и роуты: async обязателен по сигнатуре FastifyPluginAsync, даже без await внутри
  {
    files: ["apps/registry/src/routes/*.ts", "apps/registry/src/plugins/*.ts"],
    rules: { "@typescript-eslint/require-await": "off" },
  },

  // CLI-скрипты миграций пишут результат в stdout, имя файла миграции задаёт TypeORM (timestamp + класс)
  {
    files: ["apps/registry/src/db/run-migrations.ts", "apps/registry/src/db/revert-migration.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["apps/registry/src/db/migrations/*.ts"],
    rules: { "unicorn/filename-case": "off" },
  },

  {
    files: ["apps/registry/src/db/entities/*.ts"],
    rules: { "@typescript-eslint/no-unsafe-declaration-merging": "off" },
  },

  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    extends: [vitest.configs.recommended],
  },

  // Тесты и тестовые хелперы: стилистические правила unicorn и security шумят, не защищая прод-код
  {
    files: ["**/tests/**/*.ts", "vitest.config.ts"],
    rules: {
      // файлы компонентных тестов называются по компоненту (ConfirmDialog.test.ts)
      "unicorn/filename-case": "off",
      // Biome форматирует hex в нижнем регистре — правило конфликтует с форматтером
      "unicorn/number-literal-case": "off",
      // вложенные expect(...)/Buffer.from(...) в тестах читаются лучше, чем промежуточные переменные
      "unicorn/max-nested-calls": "off",
      "unicorn/no-await-expression-member": "off",
      "unicorn/consistent-function-scoping": "off",
      "unicorn/prefer-iterator-to-array": "off",
      "unicorn/require-array-sort-compare": "off",
      "unicorn/no-array-sort": "off",
      // пути в тестах — всегда tmp-директории самих тестов, а не пользовательский ввод
      "security/detect-non-literal-fs-filename": "off",
      // fake-репозиторий повторяет async-сигнатуру настоящего, хотя внутри синхронный
      "@typescript-eslint/require-await": "off",
    },
  },
);
