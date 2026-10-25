import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import {
  type EmailTransport,
  MOCK_OUTBOX_LIMIT,
  MockEmailTransport,
} from "../src/email/email-transport.js";
import { isMockOutboxEnabled } from "../src/email/mock-outbox.router.js";

async function withServer(
  options: Parameters<typeof createApp>[0],
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createApp(options).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("the mock transport keeps a bounded outbox per recipient, newest first", async () => {
  let tick = 0;
  const transport = new MockEmailTransport(() => new Date(Date.UTC(2026, 9, 24, 9, 0, tick++)));
  await transport.send({ to: "Asha@Example.com", subject: "first", text: "code 111111" });
  await transport.send({ to: "other@example.com", subject: "other", text: "code 222222" });
  await transport.send({ to: "asha@example.com", subject: "second", text: "code 333333" });

  const messages = transport.outbox(" ASHA@example.com ");
  assert.deepEqual(
    messages.map((message) => message.subject),
    ["second", "first"],
  );
  assert.equal(messages[0]?.sentAt.toISOString(), "2026-10-24T09:00:02.000Z");

  for (let index = 0; index < MOCK_OUTBOX_LIMIT + 5; index += 1) {
    await transport.send({ to: "bulk@example.com", subject: `n${index}`, text: "x" });
  }
  assert.equal(transport.outbox("bulk@example.com").length, MOCK_OUTBOX_LIMIT);
  assert.equal(transport.outbox("asha@example.com").length, 0);
});

test("the outbox is enabled only outside production", () => {
  assert.equal(isMockOutboxEnabled("development"), true);
  assert.equal(isMockOutboxEnabled("test"), true);
  assert.equal(isMockOutboxEnabled("production"), false);
});

test("GET /api/v1/testing/outbox returns the messages sent through the mock transport", async () => {
  const transport = new MockEmailTransport();
  await transport.send({ to: "guest@example.com", subject: "Your code", text: "Code: 123456" });

  await withServer({ nodeEnvironment: "test", emailTransport: transport }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/testing/outbox?to=guest%40example.com`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = (await response.json()) as { messages: { subject: string; text: string }[] };
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0]?.text, "Code: 123456");

    const invalid = await fetch(`${baseUrl}/api/v1/testing/outbox?to=not-an-email`);
    assert.equal(invalid.status, 400);
  });
});

test("the outbox answers 404 when a real transport is configured", async () => {
  const smtp: EmailTransport = { provider: "smtp", send: async () => undefined };
  await withServer({ nodeEnvironment: "development", emailTransport: smtp }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/testing/outbox?to=guest%40example.com`);
    assert.equal(response.status, 404);
  });
});

test("the outbox route is absent when NODE_ENV=production", async () => {
  const transport = new MockEmailTransport();
  await withServer(
    {
      nodeEnvironment: "production",
      webOrigin: "https://dinesmart.example",
      emailTransport: transport,
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/testing/outbox?to=guest%40example.com`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: { code: "route_not_found", message: "The requested API route does not exist." },
      });
    },
  );
});
