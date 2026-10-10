import express from "express";

const app = express();

app.disable("x-powered-by");
app.use(express.json());

// Infrastructure liveness only; product endpoints will live under /api/v1.
app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

export default app;
