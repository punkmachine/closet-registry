import "reflect-metadata";
import { DataSource } from "typeorm";
import { InstallEvent, Plugin, PluginDependency, PluginFile, PluginVersion } from "./entities/index.js";
import { CreatePluginRegistrySchema1788678999355 } from "./migrations/1788678999355-CreatePluginRegistrySchema.js";
import { SnakeNamingStrategy } from "./naming-strategy.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const AppDataSource = new DataSource({
  type: "postgres",
  url: connectionString,
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  entities: [Plugin, PluginVersion, PluginFile, PluginDependency, InstallEvent],
  migrations: [CreatePluginRegistrySchema1788678999355],
  migrationsTableName: "typeorm_migrations",
});
