import assert from "node:assert/strict";
import test from "node:test";
import { parseSessions } from "../src/app/_dashboard/session-data.ts";

test("sessions parse with the current device flagged", () => {
  const parsed = parseSessions({
    sessions: [
      {
        id: "a".repeat(24),
        deviceLabel: "Chrome on macOS",
        createdAt: "2026-10-25T09:00:00.000Z",
        lastUsedAt: "2026-10-25T10:00:00.000Z",
        expiresAt: "2026-11-01T09:00:00.000Z",
        current: true,
      },
    ],
  });
  assert.deepEqual(parsed, [
    {
      id: "a".repeat(24),
      deviceLabel: "Chrome on macOS",
      createdAt: "2026-10-25T09:00:00.000Z",
      lastUsedAt: "2026-10-25T10:00:00.000Z",
      current: true,
    },
  ]);
});

test("malformed rows are dropped and a malformed body is rejected", () => {
  assert.deepEqual(parseSessions({ sessions: [{ id: 1 }, null, "x"] }), []);
  assert.equal(parseSessions({}), null);
  assert.equal(parseSessions(null), null);
});
