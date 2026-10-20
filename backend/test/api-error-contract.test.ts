import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest, type IncomingMessage, type Server } from "node:http";
import { test } from "node:test";
import type { Db } from "mongodb";
import { createApp } from "../src/app.js";
import { NO_STORE_CACHE_CONTROL } from "../src/http/cache-policy.js";

interface RawResponse {
  status: number;
  headers: IncomingMessage["headers"];
  text: string;
}

async function withServer(run: (port: number) => Promise<void>): Promise<void> {
  const db = { collection: () => ({}) } as unknown as Db;
  const api = createApp({
    getDatabase: async () => db,
    getJwtSecret: () => "local-test-secret-with-sufficient-length",
    webOrigin: "http://127.0.0.1:3000",
    nodeEnvironment: "test",
  });
  const server: Server = api.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await run(address.port);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function request(options: {
  port: number;
  path: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const clientRequest = httpRequest(
      {
        host: "127.0.0.1",
        port: options.port,
        path: options.path,
        method: options.method ?? "GET",
        headers: options.body
          ? { "content-type": "application/json", ...(options.headers ?? {}) }
          : options.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    clientRequest.on("error", reject);
    if (options.body) clientRequest.write(options.body);
    clientRequest.end();
  });
}

test("unknown versioned routes answer with the JSON error envelope", async () => {
  await withServer(async (port) => {
    const response = await request({ port, path: "/api/v1/does-not-exist" });

    assert.equal(response.status, 404);
    assert.equal(response.headers["cache-control"], NO_STORE_CACHE_CONTROL);
    assert.match(String(response.headers["content-type"]), /application\/json/);
    assert.deepEqual(JSON.parse(response.text), {
      error: { code: "route_not_found", message: "The requested API route does not exist." },
    });
  });
});

test("body-parser rejections keep the JSON envelope and the no-store policy", async () => {
  await withServer(async (port) => {
    const malformed = await request({
      port,
      path: "/api/v1/auth/login",
      method: "POST",
      body: "{not json",
    });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.headers["cache-control"], NO_STORE_CACHE_CONTROL);
    assert.deepEqual(JSON.parse(malformed.text), {
      error: { code: "invalid_request", message: "The request body is invalid." },
    });

    const oversized = await request({
      port,
      path: "/api/v1/auth/login",
      method: "POST",
      body: JSON.stringify({ email: "x".repeat(40_000), password: "y" }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(oversized.headers["cache-control"], NO_STORE_CACHE_CONTROL);
    assert.deepEqual(JSON.parse(oversized.text), {
      error: { code: "payload_too_large", message: "The request body is too large." },
    });
  });
});

test("the liveness probe stays private and uncompressed", async () => {
  await withServer(async (port) => {
    const response = await request({
      port,
      path: "/health",
      headers: { "accept-encoding": "gzip" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers["cache-control"], NO_STORE_CACHE_CONTROL);
    assert.equal(response.headers["content-encoding"], undefined);
    assert.deepEqual(JSON.parse(response.text), { status: "ok" });
  });
});

test("protected routes answer with the JSON envelope, never HTML", async () => {
  await withServer(async (port) => {
    const response = await request({ port, path: "/api/v1/incidents" });
    assert.equal(response.status, 401);
    assert.equal(response.headers["cache-control"], NO_STORE_CACHE_CONTROL);
    assert.match(String(response.headers["content-type"]), /application\/json/);
    assert.equal(JSON.parse(response.text).error.code, "missing_access_token");

    const orders = await request({ port, path: "/api/v1/orders/history" });
    assert.equal(orders.status, 401);
    assert.match(String(orders.headers["content-type"]), /application\/json/);

    // With no database the same request degrades to the JSON 503 envelope
    // rather than an HTML page; that path is recorded in the browser triage
    // report because it needs a runtime without a reachable MongoDB.
  });
});
