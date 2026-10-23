import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithTimeout, setUnauthorizedListener } from "../src/app/api-client.ts";
import { needsRefresh, REFRESH_LEAD_MS, refreshDelayMs } from "../src/app/session-timing.ts";

const MINUTE = 60_000;

test("the token is renewed one minute before it expires", () => {
  const now = 1_000_000;
  assert.equal(REFRESH_LEAD_MS, MINUTE);
  assert.equal(refreshDelayMs(now + 15 * MINUTE, now), 14 * MINUTE);
  assert.equal(refreshDelayMs(now + 30_000, now), 5_000, "never schedules a tight loop");
  assert.equal(needsRefresh(now + 2 * MINUTE, now), false);
  assert.equal(needsRefresh(now + 30_000, now), true);
  assert.equal(needsRefresh(now - 1, now), true);
});

async function withFetch(stub, run) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("a 401 on an authenticated request notifies the auth provider", async () => {
  let calls = 0;
  const unregister = setUnauthorizedListener(() => {
    calls += 1;
  });
  try {
    await withFetch(
      async () => new Response("{}", { status: 401 }),
      async () => {
        await fetchWithTimeout("/api/v1/orders", { headers: { authorization: "Bearer old" } });
        assert.equal(calls, 1);
        await fetchWithTimeout("/api/v1/auth/login", { method: "POST" });
        assert.equal(calls, 1, "unauthenticated requests such as a failed login are ignored");
      },
    );
    await withFetch(
      async () => new Response("{}", { status: 200 }),
      async () => {
        await fetchWithTimeout("/api/v1/orders", { headers: { authorization: "Bearer new" } });
        assert.equal(calls, 1);
      },
    );
  } finally {
    unregister();
  }
});
