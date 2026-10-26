import assert from "node:assert/strict";
import test from "node:test";
import {
  canConfirmDeletion,
  exportFileName,
  parseAccountProfile,
  validateName,
  validatePasswordForm,
} from "../src/app/account/account-data.ts";

test("account profiles parse with safe preference defaults", () => {
  assert.deepEqual(
    parseAccountProfile({
      profile: {
        name: "Ananya",
        email: "a@example.test",
        contactPreferences: {},
        hasPassword: true,
      },
    }),
    {
      name: "Ananya",
      email: "a@example.test",
      contactPreferences: { email: true, offers: false },
      hasPassword: true,
    },
  );
  assert.equal(parseAccountProfile({ profile: { name: "A" } }), null);
  assert.equal(parseAccountProfile(null), null);
});

test("names must be present and short enough", () => {
  assert.equal(validateName("  "), "Enter your name.");
  assert.equal(validateName("x".repeat(101)), "Use at most 100 characters.");
  assert.equal(validateName("Ananya Menon"), null);
});

test("password changes need the current password, a long new one and a matching confirmation", () => {
  assert.deepEqual(
    validatePasswordForm({ currentPassword: "", newPassword: "short", confirmPassword: "shor" }),
    {
      currentPassword: "Enter your current password.",
      newPassword: "Use at least 12 characters.",
      confirmPassword: "The passwords do not match.",
    },
  );
  assert.deepEqual(
    validatePasswordForm({
      currentPassword: "same password 1",
      newPassword: "same password 1",
      confirmPassword: "same password 1",
    }),
    { newPassword: "Choose a password you are not using now." },
  );
  assert.deepEqual(
    validatePasswordForm({
      currentPassword: "old password 12",
      newPassword: "a new long password",
      confirmPassword: "a new long password",
    }),
    {},
  );
});

test("deleting needs DELETE typed exactly and, for password accounts, the password", () => {
  assert.equal(canConfirmDeletion("delete", "pw", true), false);
  assert.equal(canConfirmDeletion("DELETE", "", true), false);
  assert.equal(canConfirmDeletion("DELETE", "pw", true), true);
  assert.equal(canConfirmDeletion("DELETE", "", false), true);
});

test("the export keeps the server's file name", () => {
  assert.equal(
    exportFileName('attachment; filename="dinesmart-account-2026-10-26.json"', "2026-10-27"),
    "dinesmart-account-2026-10-26.json",
  );
  assert.equal(exportFileName(null, "2026-10-27"), "dinesmart-account-2026-10-27.json");
});
