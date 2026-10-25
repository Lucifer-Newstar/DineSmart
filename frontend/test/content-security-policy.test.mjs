import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentSecurityPolicy,
  realtimeOrigins,
  securityHeaders,
} from "../src/content-security-policy.ts";

function directives(policy) {
  return new Map(
    policy.split(";").map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

test("production forbids framing, plugins and eval", () => {
  const policy = directives(
    buildContentSecurityPolicy({ realtimeUrl: "https://api.example.com", development: false }),
  );
  assert.deepEqual(policy.get("frame-ancestors"), ["'none'"]);
  assert.deepEqual(policy.get("object-src"), ["'none'"]);
  assert.ok(!policy.get("script-src").includes("'unsafe-eval'"));
  assert.ok(policy.get("script-src").includes("https://accounts.google.com/gsi/client"));
});

test("development adds eval for React's tooling only", () => {
  const policy = directives(buildContentSecurityPolicy({ development: true }));
  assert.ok(policy.get("script-src").includes("'unsafe-eval'"));
});

test("the configured WebSocket origin is allowed and the localhost fallback is not", () => {
  const policy = directives(
    buildContentSecurityPolicy({ realtimeUrl: "https://api.example.com/", development: false }),
  );
  assert.ok(policy.get("connect-src").includes("wss://api.example.com"));
  assert.ok(!policy.get("connect-src").includes("ws://localhost:3001"));
});

test("without a realtime URL the localhost fallback is allowed", () => {
  assert.deepEqual(realtimeOrigins(undefined), ["ws://localhost:3001", "ws://127.0.0.1:3001"]);
  assert.deepEqual(realtimeOrigins("ftp://example.com"), []);
  assert.deepEqual(realtimeOrigins("not a url"), []);
  assert.deepEqual(realtimeOrigins("http://localhost:4001"), ["ws://localhost:4001"]);
});

test("the header set includes the policy and the classic hardening headers", () => {
  const headers = new Map(
    securityHeaders({ development: false }).map(({ key, value }) => [key, value]),
  );
  assert.ok(headers.get("Content-Security-Policy")?.includes("default-src 'self'"));
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
});
