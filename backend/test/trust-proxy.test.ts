import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { resolveTrustProxy } from "../src/http/trust-proxy.js";

test("TRUST_PROXY defaults to one hop in production and off elsewhere", () => {
  assert.equal(resolveTrustProxy(undefined, "production"), 1);
  assert.equal(resolveTrustProxy("", "development"), false);
  assert.equal(resolveTrustProxy("false", "production"), false);
  assert.equal(resolveTrustProxy("0", "production"), false);
});

test("TRUST_PROXY accepts hop counts and address ranges but never true", () => {
  assert.equal(resolveTrustProxy("2", "production"), 2);
  assert.deepEqual(resolveTrustProxy("loopback, 10.0.0.0/8", "production"), [
    "loopback",
    "10.0.0.0/8",
  ]);
  assert.throws(() => resolveTrustProxy("true", "production"), /hop count/);
  assert.throws(() => resolveTrustProxy("11", "production"), /between 1 and 10/);
  assert.throws(() => resolveTrustProxy("not a proxy", "production"), /not a hop count/);
});

test("the app applies the configured hop count to req.ip", async () => {
  const app = createApp({
    nodeEnvironment: "production",
    webOrigin: "https://app.example.com",
    trustProxy: "2",
    getDatabase: async () => {
      throw new Error("no database in this test");
    },
  });
  app.get("/ip-probe", (request, response) => {
    response.json({ ip: request.ip });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/ip-probe`, {
      headers: { "x-forwarded-for": "203.0.113.7, 198.51.100.2" },
    });
    assert.equal(((await response.json()) as { ip: string }).ip, "203.0.113.7");
  } finally {
    server.close();
  }
});
