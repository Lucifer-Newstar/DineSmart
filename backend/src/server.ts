import app from "./app.js";

const port = Number(process.env.PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = app.listen(port, "0.0.0.0", () => {
  console.info(`Andhrímnir API server listening on port ${port}.`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close((error) => {
      if (error) {
        console.error("The API server did not shut down cleanly.", error);
        process.exitCode = 1;
      }
    });
  });
}
