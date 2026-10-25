import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest, type IncomingMessage, type Server } from "node:http";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import express from "express";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createApp } from "../src/app.js";
import {
  NO_STORE_CACHE_CONTROL,
  PUBLIC_MENU_MAX_AGE_SECONDS,
  sendNoStoreApiResponse,
} from "../src/http/cache-policy.js";
import {
  createPublicJsonCompression,
  PUBLIC_JSON_COMPRESSION_THRESHOLD_BYTES,
} from "../src/http/response-compression.js";
import { createMenuRouter } from "../src/menu/menu.router.js";
import type { MenuReader, PublicMenu } from "../src/menu/menu.types.js";

const restaurantId = new ObjectId("507f1f77bcf86cd799439011");

function buildMenu(itemCount: number): PublicMenu {
  return {
    restaurant: { id: restaurantId, name: "Saffron & Co.", currency: "INR" },
    categories: ["Tiffin"],
    items: Array.from({ length: itemCount }, (_unused, index) => ({
      id: new ObjectId(),
      name: `Chef's seasonal tasting plate number ${index + 1}`,
      description:
        "A deliberately long catalogue description used to push this public menu payload past the compression threshold.",
      category: "Tiffin",
      isAvailable: true,
      priceMinor: 28_500 + index,
      dietaryLabels: ["vegetarian"],
      allergenLabels: ["dairy"],
    })),
    truncated: false,
  };
}

interface RawResponse {
  status: number;
  headers: IncomingMessage["headers"];
  body: Buffer;
  text: string;
}

/** Node's fetch always decompresses, so these checks use the raw HTTP client. */
async function rawGet(port: number, path: string, acceptEncoding?: string): Promise<RawResponse> {
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const clientRequest = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {},
      },
      resolve,
    );
    clientRequest.on("error", reject);
    clientRequest.end();
  });

  const chunks: Buffer[] = [];
  for await (const chunk of response) chunks.push(Buffer.from(chunk as Buffer));
  const body = Buffer.concat(chunks);
  const encoding = String(response.headers["content-encoding"] ?? "");
  return {
    status: response.statusCode ?? 0,
    headers: response.headers,
    body,
    text: encoding.includes("gzip") ? gunzipSync(body).toString("utf8") : body.toString("utf8"),
  };
}

async function withServer(
  app: express.Express,
  run: (port: number) => Promise<void>,
): Promise<void> {
  const server: Server = app.listen(0, "127.0.0.1");
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

function menuApp(itemCount: number): express.Express {
  const menu = buildMenu(itemCount);
  const reader: MenuReader = { getAvailableMenu: async () => menu };
  const app = express();
  app.use("/api/v1/menu", createMenuRouter({ createReader: async () => reader }));
  return app;
}

test("public menu responses are gzipped when the client accepts gzip", async () => {
  await withServer(menuApp(40), async (port) => {
    const response = await rawGet(
      port,
      `/api/v1/menu?restaurantId=${restaurantId.toHexString()}`,
      "gzip",
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers["content-encoding"], "gzip");
    assert.equal(response.headers.vary, "Accept-Encoding");
    assert.ok(response.body.length < response.text.length);

    const body = JSON.parse(response.text) as { items: unknown[]; restaurant: { name: string } };
    assert.equal(body.items.length, 40);
    assert.equal(body.restaurant.name, "Saffron & Co.");
  });
});

test("public menu responses stay uncompressed for small payloads or clients without gzip", async () => {
  await withServer(menuApp(1), async (port) => {
    const small = await rawGet(
      port,
      `/api/v1/menu?restaurantId=${restaurantId.toHexString()}`,
      "gzip",
    );
    assert.equal(small.status, 200);
    assert.equal(small.headers["content-encoding"], undefined);
    assert.equal(JSON.parse(small.text).items.length, 1);
  });

  await withServer(menuApp(40), async (port) => {
    const identity = await rawGet(
      port,
      `/api/v1/menu?restaurantId=${restaurantId.toHexString()}`,
      "identity",
    );
    assert.equal(identity.status, 200);
    assert.equal(identity.headers["content-encoding"], undefined);
    assert.equal(JSON.parse(identity.text).items.length, 40);
  });
});

test("the public compression helper only compresses JSON above the threshold", async () => {
  const app = express();
  app.get("/text", (_request, response) =>
    response.status(200).type("text/plain").send("x".repeat(4_096)),
  );
  app.use(createPublicJsonCompression());
  app.get("/small", (_request, response) => response.status(200).json({ ok: true }));
  app.get("/large", (_request, response) =>
    response.status(200).json({ value: "y".repeat(4_096) }),
  );

  await withServer(app, async (port) => {
    const large = await rawGet(port, "/large", "gzip");
    assert.equal(large.status, 200);
    assert.equal(large.headers["content-encoding"], "gzip");

    const small = await rawGet(port, "/small", "gzip");
    assert.equal(small.status, 200);
    assert.equal(small.headers["content-encoding"], undefined);

    const text = await rawGet(port, "/text", "gzip");
    assert.equal(text.status, 200);
    assert.equal(text.headers["content-encoding"], undefined);
  });

  assert.ok(PUBLIC_JSON_COMPRESSION_THRESHOLD_BYTES > 0);
});

test("operational API responses are marked no-store while the public menu opts into a short cache", async () => {
  const db = { collection: () => ({}) } as unknown as Db;
  const api = createApp({
    getDatabase: async () => db,
    getJwtSecret: () => "local-test-secret-with-sufficient-length",
    webOrigin: "http://localhost:3000",
    nodeEnvironment: "test",
  });

  await withServer(api, async (port) => {
    const incidents = await rawGet(port, "/api/v1/incidents", "identity");
    assert.equal(incidents.status, 401);
    assert.equal(incidents.headers["cache-control"], NO_STORE_CACHE_CONTROL);

    const orders = await rawGet(port, "/api/v1/orders/history", "identity");
    assert.equal(orders.status, 401);
    assert.equal(orders.headers["cache-control"], NO_STORE_CACHE_CONTROL);

    const invalidMenu = await rawGet(port, "/api/v1/menu?restaurantId=not-an-id", "identity");
    assert.equal(invalidMenu.status, 400);
    assert.equal(invalidMenu.headers["cache-control"], NO_STORE_CACHE_CONTROL);
  });
});

test("the liveness probe stays uncompressed and cacheable-free without touching tenant data", async () => {
  const db = { collection: () => ({}) } as unknown as Db;
  const api = createApp({
    getDatabase: async () => db,
    getJwtSecret: () => "local-test-secret-with-sufficient-length",
    webOrigin: "http://localhost:3000",
    nodeEnvironment: "test",
  });

  await withServer(api, async (port) => {
    const health = await rawGet(port, "/health", "gzip");
    assert.equal(health.status, 200);
    assert.equal(health.headers["content-encoding"], undefined);
    assert.deepEqual(JSON.parse(health.text), { status: "ok" });
  });
});

test("the menu success response overrides the default no-store policy", async () => {
  const menu = buildMenu(3);
  const reader: MenuReader = {
    getAvailableMenu: async (id) => (id.equals(restaurantId) ? menu : null),
  };
  const app = express();
  app.use("/api/v1", sendNoStoreApiResponse as unknown as express.RequestHandler);
  app.use("/api/v1/menu", createMenuRouter({ createReader: async () => reader }));

  await withServer(app, async (port) => {
    const ok = await rawGet(
      port,
      `/api/v1/menu?restaurantId=${restaurantId.toHexString()}`,
      "identity",
    );
    assert.equal(ok.status, 200);
    assert.equal(ok.headers["cache-control"], `public, max-age=${PUBLIC_MENU_MAX_AGE_SECONDS}`);

    const missing = await rawGet(
      port,
      `/api/v1/menu?restaurantId=${new ObjectId().toHexString()}`,
      "identity",
    );
    assert.equal(missing.status, 404);
    assert.equal(missing.headers["cache-control"], NO_STORE_CACHE_CONTROL);
  });
});
