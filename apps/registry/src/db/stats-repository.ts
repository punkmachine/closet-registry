import type { DataSource } from "typeorm";
import { InstallEvent } from "./entities/install-event.entity.js";

export async function recordInstall(
  dataSource: DataSource,
  pluginId: string,
  pluginVersionId: string,
  cliVersion: string,
): Promise<void> {
  const repo = dataSource.getRepository(InstallEvent);
  await repo.save(repo.create({ plugin: { id: pluginId }, pluginVersion: { id: pluginVersionId }, cliVersion }));
}
