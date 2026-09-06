import "dotenv/config";
import { AppDataSource } from "./data-source.js";

const dataSource = await AppDataSource.initialize();
try {
  const executed = await dataSource.runMigrations();
  if (executed.length === 0) {
    console.log("No pending migrations.");
  } else {
    for (const migration of executed) {
      console.log(`Applied migration: ${migration.name}`);
    }
  }
} finally {
  await dataSource.destroy();
}
