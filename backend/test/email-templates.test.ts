import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthEmailSender, type EmailMessage } from "../src/email/email-transport.js";
import { bookingConfirmedEmail, bookingReminderEmail } from "../src/email/templates/booking.js";
import { composeEmail, emailText, escapeHtml } from "../src/email/templates/layout.js";

const details = {
  reservationId: "6650a1b2c3d4e5f6a7b8c9d0",
  guestName: "Ravi <b>&</b> Co",
  email: "ravi@example.test",
  restaurantName: "Saffron & Co.",
  restaurantAddress: "12 Beach Road, Chennai",
  timeZone: "Asia/Kolkata",
  partySize: 2,
  startAt: new Date("2026-10-30T14:00:00.000Z"),
  endAt: new Date("2026-10-30T15:30:00.000Z"),
  tableNumber: "05",
};

async function everyEmail(): Promise<EmailMessage[]> {
  const sent: EmailMessage[] = [];
  const auth = new AuthEmailSender({
    provider: "mock",
    send: async (message) => {
      sent.push(message);
    },
  });
  await auth.sendRegistrationCode("new@example.test", "123456");
  await auth.sendPasswordResetCode("new@example.test", "654321");
  return [
    ...sent,
    bookingConfirmedEmail(details, new Date("2026-10-26T10:00:00.000Z")),
    bookingReminderEmail(details),
  ];
}

test("every email has a plain-text part and an HTML part", async () => {
  const emails = await everyEmail();
  assert.equal(emails.length, 4);
  for (const email of emails) {
    assert.ok(email.text.trim().length > 0, email.subject);
    assert.match(email.html ?? "", /^<!doctype html>/);
    assert.ok(email.html?.includes(`<title>${escapeHtml(email.subject)}</title>`));
  }
});

test("guest-supplied text is escaped in HTML and kept as written in plain text", () => {
  const email = bookingConfirmedEmail(details, new Date("2026-10-26T10:00:00.000Z"));
  assert.ok(email.text.startsWith("Hi Ravi <b>&</b> Co,"));
  assert.ok(email.html?.includes("Hi Ravi &lt;b&gt;&amp;&lt;/b&gt; Co,"));
  assert.ok(!email.html?.includes("<b>&</b>"));
  assert.ok(email.html?.includes("<strong>Table:</strong> 05"));
  assert.match(email.text, /\n\nTable: 05\n\n/);
});

test("the text part lists blocks in order and attachments pass through", () => {
  assert.equal(emailText(["One", { label: "Two", value: "2" }]), "One\n\nTwo: 2");
  const message = composeEmail({ to: "a@example.test", subject: "S", blocks: ["Body"] });
  assert.equal(message.attachments, undefined);
  const withFile = bookingConfirmedEmail(details, new Date("2026-10-26T10:00:00.000Z"));
  assert.equal(withFile.attachments?.[0]?.filename, "dinesmart-booking.ics");
});
