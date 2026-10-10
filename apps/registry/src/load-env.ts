import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

/**
 * Ищет корень монорепо по `pnpm-workspace.yaml`, поднимаясь вверх не больше чем на 5 уровней.
 *
 * @remarks
 * Корневой `.env` общий (его же читает docker compose через `--env-file`), плюс необязательный локальный
 * override `apps/registry/.env`. dotenv не перезатирает уже определённые переменные, поэтому локальный
 * файл читается первым и имеет приоритет. В Docker переменные приходят из окружения — отсутствие обоих
 * файлов не ошибка.
 */
function findWorkspaceRoot(startDir: string): string | null {
  let current = startDir;
  for (let depth = 0; depth < 5; depth += 1) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- путь из process.cwd(), не из пользовательского ввода
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

const cwd = process.cwd();
const workspaceRoot = findWorkspaceRoot(cwd);

for (const candidate of [path.join(cwd, ".env"), workspaceRoot ? path.join(workspaceRoot, ".env") : null]) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- путь из process.cwd(), не из пользовательского ввода
  if (candidate && existsSync(candidate)) {
    config({ path: candidate, quiet: true });
  }
}
