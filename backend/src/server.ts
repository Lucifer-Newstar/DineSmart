import "dotenv/config";
import app from "./app.js";
import { closeDatabase, connectToDatabase } from "./database.js";

const port = Number(process.env.PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = app.listen(port, "0.0.0.0", () => {
  console.info(`Andhrímnir API server listening on port ${port}.`);
});

if (process.env.MONGODB_URI) {
  void connectToDatabase()
    .then(() => console.info("Connected to the configured MongoDB instance."))
    .catch(() => {
      console.error("MongoDB is unavailable; the API remains in liveness-only mode.");
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
