import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { lineOf, SUPPORTED_EXTENSIONS, stripComments } from "./strip-comments-core.js";

/** Области, в которых codemod работает (пути от корня репозитория, `/`-разделитель). */
const INCLUDE_PATTERNS: readonly RegExp[] = [
  /^apps\/[^/]+\/src\//,
  /^apps\/admin-panel\/(?:app|server|shared)\//,
  /^packages\/[^/]+\/src\//,
];

/** Сегменты пути, при наличии которых файл пропускается. */
const EXCLUDE_SEGMENTS: ReadonlySet<string> = new Set(["node_modules", "dist", ".nuxt", ".output", "tests"]);

/** Каталог с содержимым плагинов реестра — пользовательские данные, не исходники. */
const EXCLUDE_PREFIX = "apps/registry/registry/plugins/";

type Mode = "run" | "report" | "dry-run" | "check";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: rootDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function isInScope(file: string): boolean {
  const supported = SUPPORTED_EXTENSIONS.some((extension) => file.endsWith(extension)) && !file.endsWith(".d.ts");
  const excluded = file.startsWith(EXCLUDE_PREFIX) || file.split("/").some((segment) => EXCLUDE_SEGMENTS.has(segment));
  return supported && !excluded && INCLUDE_PATTERNS.some((pattern) => pattern.test(file));
}

function listFiles(): string[] {
  return git("ls-files", "--cached", "--others", "--exclude-standard")
    .split("\n")
    .filter(Boolean)
    .filter((file) => isInScope(file));
}

function parseMode(args: readonly string[]): Mode {
  const modes: Mode[] = ["report", "dry-run", "check"];
  const requested = modes.filter((mode) => args.includes(`--${mode}`));
  if (requested.length > 1) {
    throw new Error(`Флаги ${requested.map((mode) => `--${mode}`).join(", ")} взаимоисключающие`);
  }
  return requested[0] ?? "run";
}

function oneLine(text: string): string {
  const flat = text.replaceAll(/\s+/g, " ").trim();
  return flat.length > 100 ? `${flat.slice(0, 97)}...` : flat;
}

function main(): void {
  const mode = parseMode(process.argv.slice(2));

  if (mode === "run" && git("status", "--porcelain").trim() !== "") {
    process.stderr.write(
      "Рабочее дерево грязное: закоммитьте или спрячьте изменения, чтобы diff откатывался `git checkout`.\n",
    );
    process.exit(1);
  }

  let totalRemoved = 0;
  let touchedFiles = 0;

  for (const file of listFiles()) {
    const source = readFileSync(path.join(rootDir, file), "utf8");
    const { output, removed } = stripComments(source, file);
    if (removed.length === 0) {
      continue;
    }
    touchedFiles += 1;
    totalRemoved += removed.length;

    if (mode === "report") {
      process.stdout.write(`${String(removed.length).padStart(4)}  ${file}\n`);
    } else {
      for (const span of removed) {
        const line = lineOf(source, span.start);
        process.stdout.write(`${file}:${line}${mode === "check" ? "" : `  ${oneLine(span.text)}`}\n`);
      }
    }
    if (mode === "run") {
      writeFileSync(path.join(rootDir, file), output);
    }
  }

  const verb = mode === "run" ? "удалено" : "найдено";
  process.stdout.write(`\n${verb} комментариев: ${totalRemoved} в файлах: ${touchedFiles}\n`);

  if (mode === "check" && totalRemoved > 0) {
    process.exit(1);
  }
}

main();
