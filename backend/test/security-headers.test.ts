import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { API_CONTENT_SECURITY_POLICY } from "../src/http/security-headers.js";

async function withServer(
  nodeEnvironment: string,
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const app = createApp({
    nodeEnvironment,
    webOrigin: "https://app.example.com",
    getDatabase: async () => {
      throw new Error("no database in this test");
    },
    getJwtSecret: () => "security-header-test-signing-key-000000000000",
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
  }
}

function assertSecurityHeaders(response: Response, where: string): void {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", where);
  assert.equal(response.headers.get("x-frame-options"), "DENY", where);
  assert.equal(response.headers.get("content-security-policy"), API_CONTENT_SECURITY_POLICY, where);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer", where);
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin", where);
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin", where);
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/, where);
  assert.equal(response.headers.get("x-powered-by"), null, where);
}

test("a successful response carries every security header", async () => {
  await withServer("test", async (origin) => {
    const response = await fetch(`${origin}/health`);
    assert.equal(response.status, 200);
    assertSecurityHeaders(response, "GET /health");
  });
});

test("404, malformed JSON and error responses carry them too", async () => {
  await withServer("test", async (origin) => {
    const missing = await fetch(`${origin}/api/v1/does-not-exist`);
    assert.equal(missing.status, 404);
    assertSecurityHeaders(missing, "unknown route");

    const malformed = await fetch(`${origin}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    assert.equal(malformed.status, 400);
    assertSecurityHeaders(malformed, "malformed JSON");

    // With no database the router answers 503 before it reaches authentication.
    const unavailable = await fetch(`${origin}/api/v1/orders`);
    assert.ok(unavailable.status >= 400, `expected an error, got ${unavailable.status}`);
    assertSecurityHeaders(unavailable, "error response");
  });
});

test("CORS preflight responses carry them", async () => {
  await withServer("test", async (origin) => {
    const response = await fetch(`${origin}/api/v1/orders`, {
      method: "OPTIONS",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "POST",
      },
    });
    assert.equal(response.status, 204);
    assertSecurityHeaders(response, "preflight");
  });
});

test("Strict-Transport-Security is sent in production only", async () => {
  await withServer("production", async (origin) => {
    const response = await fetch(`${origin}/health`);
    assert.equal(
      response.headers.get("strict-transport-security"),
      "max-age=31536000; includeSubDomains",
    );
  });
  await withServer("test", async (origin) => {
    const response = await fetch(`${origin}/health`);
    assert.equal(response.headers.get("strict-transport-security"), null);
  });
});
