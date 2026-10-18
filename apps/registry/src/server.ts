import "./load-env.js";
import { buildApp } from "./app.js";
import { bootstrapAdmin } from "./auth/bootstrap-admin.js";

const port = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    if (await bootstrapAdmin(app.orm)) {
      app.log.info("Создан первый admin из ADMIN_USERNAME / ADMIN_PASSWORD");
    }

    await app.listen({ port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);

    process.exit(1);
  }
}

void main();
