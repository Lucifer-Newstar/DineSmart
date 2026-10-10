import "dotenv/config";
import type { Db } from "mongodb";
import { createApp } from "./app.js";
import { initializeDatabaseSchema } from "./database/schema.js";
import { closeDatabase, connectToDatabase } from "./database.js";

const port = Number(process.env.PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

let schemaReady: Promise<Db> | undefined;
function getSchemaReadyDatabase(): Promise<Db> {
  if (!process.env.MONGODB_URI) {
    return Promise.reject(new Error("MONGODB_URI is not configured."));
  }

  if (!schemaReady) {
    schemaReady = connectToDatabase()
      .then(async (database) => {
        await initializeDatabaseSchema(database);
        return database;
      })
      .catch((error: unknown) => {
        schemaReady = undefined;
        throw error;
      });
  }

  return schemaReady;
}

const app = createApp({ getDatabase: getSchemaReadyDatabase });
const server = app.listen(port, "0.0.0.0", () => {
  console.info(`Andhrímnir API server listening on port ${port}.`);
});

if (process.env.MONGODB_URI) {
  void getSchemaReadyDatabase()
    .then(() => console.info("Connected to MongoDB; schema indexes are ready."))
    .catch(() => {
      console.error(
        "MongoDB connection or schema initialization failed; the API remains in liveness-only mode.",
      );
    });
} else {
  console.info("MONGODB_URI is unset; database connection skipped.");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close((error) => {
      if (error) {
        console.error("The API server did not shut down cleanly.", error);
        process.exitCode = 1;
      }

      void closeDatabase().catch(() => {
        console.error("The MongoDB client did not shut down cleanly.");
        process.exitCode = 1;
      });
    });
  });
}
