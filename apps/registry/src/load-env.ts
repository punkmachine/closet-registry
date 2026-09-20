import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

// На монорепо один общий .env в корне (его же читает docker compose через --env-file),
// плюс необязательный локальный override apps/registry/.env. dotenv не перезатирает уже
// определённые переменные, поэтому локальный файл читается первым и имеет приоритет.
// В Docker переменные приходят из окружения — отсутствие обоих файлов не ошибка.
function findWorkspaceRoot(startDir: string): string | null {
  let current = startDir;
  for (let depth = 0; depth < 5; depth += 1) {
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
  if (candidate && existsSync(candidate)) {
    config({ path: candidate, quiet: true });
  }
}
