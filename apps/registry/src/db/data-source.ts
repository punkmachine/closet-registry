import "reflect-metadata";
import { DataSource } from "typeorm";
import {
  ApiToken,
  AuditLog,
  InstallEvent,
  Plugin,
  PluginDependency,
  PluginFile,
  PluginVersion,
  Session,
  User,
} from "./entities/index.js";
import { CreatePluginRegistrySchema1788678999355 } from "./migrations/1788678999355-CreatePluginRegistrySchema.js";
import { CreateAuthSchema1792288641076 } from "./migrations/1792288641076-CreateAuthSchema.js";
import { AddPluginFileSpecFormat1792800000000 } from "./migrations/1792800000000-AddPluginFileSpecFormat.js";
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
  entities: [Plugin, PluginVersion, PluginFile, PluginDependency, InstallEvent, User, Session, ApiToken, AuditLog],
  migrations: [
    CreatePluginRegistrySchema1788678999355,
    CreateAuthSchema1792288641076,
    AddPluginFileSpecFormat1792800000000,
  ],
  migrationsTableName: "typeorm_migrations",
});
