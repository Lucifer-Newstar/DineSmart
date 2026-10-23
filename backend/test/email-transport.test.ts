import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AuthEmailSender,
  assertEmailConfiguration,
  createEmailTransport,
  EmailConfigurationError,
  EmailDeliveryError,
  type EmailMessage,
  type EmailTransport,
  MockEmailTransport,
  parseSmtpSettings,
  ResendEmailTransport,
  resolveEmailProvider,
  SmtpEmailTransport,
} from "../src/email/email-transport.js";

test("mock is the default outside production and refused in production", () => {
  assert.equal(resolveEmailProvider({}, "development"), "mock");
  assert.equal(resolveEmailProvider({}, "test"), "mock");
  assert.throws(() => resolveEmailProvider({}, "production"), EmailConfigurationError);
  assert.throws(
    () => resolveEmailProvider({ EMAIL_PROVIDER: "mock" }, "production"),
    /not permitted in production/,
  );
  assert.throws(
    () => resolveEmailProvider({ EMAIL_PROVIDER: "carrier-pigeon" }, "development"),
    /must be one of/,
  );
});

test("production startup fails with a clear message for incomplete provider settings", () => {
  assert.throws(
    () => assertEmailConfiguration({ EMAIL_PROVIDER: "smtp" }, "production"),
    /SMTP_HOST must be set/,
  );
  assert.throws(
    () =>
      assertEmailConfiguration(
        { EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.com" },
        "production",
      ),
    /EMAIL_FROM must be set/,
  );
  assert.throws(
    () =>
      assertEmailConfiguration({ EMAIL_PROVIDER: "resend", EMAIL_FROM: "a@b.co" }, "production"),
    /RESEND_API_KEY must be set/,
  );
  assert.doesNotThrow(() =>
    assertEmailConfiguration(
      { EMAIL_PROVIDER: "resend", EMAIL_FROM: "a@b.co", RESEND_API_KEY: "re_test" },
      "production",
    ),
  );
});

test("SMTP settings default the port from SMTP_SECURE and validate credentials", () => {
  const base = { SMTP_HOST: "smtp.example.com", EMAIL_FROM: "DineSmart <no-reply@example.com>" };
  assert.equal(parseSmtpSettings(base).port, 587);
  assert.equal(parseSmtpSettings({ ...base, SMTP_SECURE: "true" }).port, 465);
  assert.equal(parseSmtpSettings({ ...base, SMTP_PORT: "2525" }).port, 2525);
  assert.throws(() => parseSmtpSettings({ ...base, SMTP_PORT: "abc" }), /SMTP_PORT/);
  assert.throws(() => parseSmtpSettings({ ...base, SMTP_USER: "user" }), /SMTP_PASSWORD/);
  assert.equal(
    createEmailTransport({ ...base, EMAIL_PROVIDER: "SMTP" }, "production").provider,
    "smtp",
  );
});

test("the SMTP transport sends from EMAIL_FROM and hides server errors", async () => {
  const sent: unknown[] = [];
  const transport = new SmtpEmailTransport(
    { host: "smtp.example.com", port: 587, secure: false, from: "no-reply@example.com" },
    async (message) => {
      sent.push(message);
    },
  );
  await transport.send({ to: "guest@example.com", subject: "Hi", text: "Body" });
  assert.deepEqual(sent, [
    { from: "no-reply@example.com", to: "guest@example.com", subject: "Hi", text: "Body" },
  ]);

  const failing = new SmtpEmailTransport(
    { host: "smtp.example.com", port: 587, secure: false, from: "no-reply@example.com" },
    async () => {
      throw new Error("550 mailbox guest@example.com unavailable");
    },
  );
  await assert.rejects(
    failing.send({ to: "guest@example.com", subject: "Hi", text: "Body" }),
    (error: unknown) =>
      error instanceof EmailDeliveryError && !error.message.includes("guest@example.com"),
  );
});

test("the Resend transport posts the message with a bearer key", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
  }) as unknown as typeof fetch;
  const transport = new ResendEmailTransport("re_test", "no-reply@example.com", fakeFetch);
  await transport.send({ to: "guest@example.com", subject: "Code", text: "123456" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer re_test");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    from: "no-reply@example.com",
    to: ["guest@example.com"],
    subject: "Code",
    text: "123456",
  });

  const rejecting = new ResendEmailTransport(
    "re_test",
    "no-reply@example.com",
    (async () => new Response("{}", { status: 422 })) as unknown as typeof fetch,
  );
  await assert.rejects(
    rejecting.send({ to: "guest@example.com", subject: "Code", text: "123456" }),
    /HTTP 422/,
  );
});

test("auth emails carry the code and its expiry, and mock delivery is silent", async () => {
  const messages: EmailMessage[] = [];
  const capturing: EmailTransport = {
    provider: "smtp",
    async send(message) {
      messages.push(message);
    },
  };
  const sender = new AuthEmailSender(capturing);
  await sender.sendRegistrationCode("guest@example.com", "123456");
  await sender.sendPasswordResetCode("guest@example.com", "654321");

  assert.equal(messages[0].to, "guest@example.com");
  assert.match(messages[0].subject, /verification code/);
  assert.match(messages[0].text, /123456/);
  assert.match(messages[0].text, /10 minutes/);
  assert.match(messages[1].subject, /password reset/);
  assert.match(messages[1].text, /654321/);

  await new MockEmailTransport().send({ to: "x@example.com", subject: "s", text: "t" });
});
