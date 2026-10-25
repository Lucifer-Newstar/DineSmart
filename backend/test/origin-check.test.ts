import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import cookieParser from "cookie-parser";
import express from "express";
import { checkOrigin, requireTrustedOrigin } from "../src/http/origin-check.js";

const WEB = "https://app.example.com";
const production = { allowedOrigins: [WEB], nodeEnvironment: "production" };
const development = { allowedOrigins: [WEB], nodeEnvironment: "development" };

test("the web app's own origin is allowed", () => {
  assert.equal(checkOrigin("POST", { origin: WEB }, production), "allowed");
  assert.equal(checkOrigin("DELETE", { origin: WEB }, development), "allowed");
});

test("foreign, look-alike and null origins are refused in every environment", () => {
  for (const origin of [
    "https://evil.example",
    "https://app.example.com.evil.example",
    "http://app.example.com",
    "https://app.example.com:8443",
    "null",
  ]) {
    assert.equal(checkOrigin("POST", { origin }, production), "foreign_origin", origin);
    assert.equal(checkOrigin("POST", { origin }, development), "foreign_origin", origin);
  }
});

test("a missing Origin is refused in production and allowed for local tools", () => {
  assert.equal(checkOrigin("POST", {}, production), "missing_origin");
  assert.equal(checkOrigin("POST", {}, development), "allowed");
  assert.equal(checkOrigin("POST", { secFetchSite: "same-origin" }, development), "allowed");
});

test("Sec-Fetch-Site: cross-site without Origin is refused even in development", () => {
  assert.equal(checkOrigin("POST", { secFetchSite: "cross-site" }, development), "cross_site");
  assert.equal(checkOrigin("POST", { secFetchSite: "cross-site" }, production), "cross_site");
});

test("safe methods are never blocked", () => {
  for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
    assert.equal(checkOrigin(method, { origin: "https://evil.example" }, production), "allowed");
    assert.equal(checkOrigin(method, {}, production), "allowed");
  }
});

test("refresh and logout answer 403 untrusted_origin over HTTP", async () => {
  const app = express();
  app.use(cookieParser());
  app.use(requireTrustedOrigin(production));
  let reached = 0;
  app.post("/api/v1/auth/refresh", (_request, response) => {
    reached += 1;
    response.status(200).json({ ok: true });
  });
  app.post("/api/v1/auth/logout", (_request, response) => {
    reached += 1;
    response.status(204).end();
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/v1/auth`;
    const cookie = { cookie: "refresh_token=stolen" };
    for (const path of ["refresh", "logout"]) {
      const foreign = await fetch(`${base}/${path}`, {
        method: "POST",
        headers: { ...cookie, origin: "https://evil.example" },
      });
      assert.equal(foreign.status, 403, path);
      assert.equal(
        ((await foreign.json()) as { error: { code: string } }).error.code,
        "untrusted_origin",
      );

      const missing = await fetch(`${base}/${path}`, { method: "POST", headers: cookie });
      assert.equal(missing.status, 403, `${path} without Origin`);

      const own = await fetch(`${base}/${path}`, {
        method: "POST",
        headers: { ...cookie, origin: WEB },
      });
      assert.ok(own.status < 300, `${path} from the web app`);
    }
    assert.equal(reached, 2, "only the two same-origin requests reached the handlers");
  } finally {
    server.close();
  }
});
