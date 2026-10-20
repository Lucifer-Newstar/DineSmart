import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiTimeoutError,
  classifyRequestError,
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  isRequestTimeout,
} from "../src/app/api-client.ts";

/** Replaces global fetch for one test and restores it afterwards. */
function withFetch(stub) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

const okResponse = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

test("a fast response is returned untouched and the init is forwarded", async () => {
  let seen;
  const restore = withFetch(async (url, init) => {
    seen = { url, init };
    return okResponse();
  });

  try {
    const response = await fetchWithTimeout("/api/v1/incidents", {
      cache: "no-store",
      credentials: "include",
      headers: { authorization: "Bearer token" },
    });

    assert.equal(response.status, 200);
    assert.equal(seen.url, "/api/v1/incidents");
    assert.equal(seen.init.cache, "no-store");
    assert.equal(seen.init.credentials, "include");
    assert.deepEqual(seen.init.headers, { authorization: "Bearer token" });
    assert.equal(seen.init.signal.aborted, false);
  } finally {
    restore();
  }
});

test("the default deadline is a documented, bounded value", () => {
  assert.equal(DEFAULT_REQUEST_TIMEOUT_MS, 15_000);
  assert.ok(DEFAULT_REQUEST_TIMEOUT_MS > 0 && DEFAULT_REQUEST_TIMEOUT_MS <= 60_000);
});

test("a stalled request rejects with ApiTimeoutError and aborts the socket", async () => {
  let abortedSignal;
  const restore = withFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          abortedSignal = init.signal;
          reject(init.signal.reason);
        });
      }),
  );

  try {
    const startedAt = Date.now();
    await assert.rejects(
      () => fetchWithTimeout("/api/v1/orders", {}, { timeoutMs: 40 }),
      ApiTimeoutError,
    );
    assert.ok(Date.now() - startedAt >= 35, "the deadline must actually be awaited");
    assert.ok(abortedSignal, "the underlying request must be aborted");
    assert.ok(isRequestTimeout(abortedSignal.reason));
    assert.equal(classifyRequestError(abortedSignal.reason), "timeout");
  } finally {
    restore();
  }
});

test("a caller abort wins over the deadline and keeps its own reason", async () => {
  const controller = new AbortController();
  const reason = new Error("workspace changed");
  const restore = withFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      }),
  );

  try {
    setTimeout(() => controller.abort(reason), 10);
    await assert.rejects(
      () =>
        fetchWithTimeout(
          "/api/v1/kitchen/queue",
          { signal: controller.signal },
          { timeoutMs: 5_000 },
        ),
      (error) => error === reason,
    );
  } finally {
    restore();
  }
});

test("an already-aborted signal rejects with the caller's reason", async () => {
  let called = false;
  // Mirrors the platform behaviour: fetch rejects immediately when the signal
  // it is handed is already aborted.
  const restore = withFetch(async (_url, init) => {
    called = true;
    if (init.signal?.aborted) throw init.signal.reason;
    return okResponse();
  });
  const controller = new AbortController();
  const reason = new Error("already gone");
  controller.abort(reason);

  try {
    await assert.rejects(
      () => fetchWithTimeout("/api/v1/inventory", { signal: controller.signal }),
      (error) => error === reason,
    );
    assert.equal(called, true);
  } finally {
    restore();
  }
});

test("network failures and timeout failures are classified differently", async () => {
  const restore = withFetch(async () => {
    throw new Error("Failed to fetch");
  });

  try {
    const error = await fetchWithTimeout("/api/v1/healthscore", {}, { timeoutMs: 50 }).catch(
      (caught) => caught,
    );
    assert.equal(error.message, "Failed to fetch");
    assert.equal(classifyRequestError(error), "error");

    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    assert.equal(classifyRequestError(abortError), "abort");
    assert.equal(classifyRequestError(new ApiTimeoutError(50)), "timeout");
  } finally {
    restore();
  }
});
