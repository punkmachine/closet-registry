import "dotenv/config";
import { AppDataSource } from "./data-source.js";

const dataSource = await AppDataSource.initialize();
try {
  await dataSource.undoLastMigration();
  console.log("Reverted last migration.");
} finally {
  await dataSource.destroy();
}
