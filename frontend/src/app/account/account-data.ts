/** Data helpers for the customer account page (S5-02). */

export interface AccountProfile {
  name: string;
  email: string;
  contactPreferences: { email: boolean; offers: boolean };
  hasPassword: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAccountProfile(payload: unknown): AccountProfile | null {
  const profile = isRecord(payload) ? payload.profile : null;
  if (!isRecord(profile) || !isRecord(profile.contactPreferences)) return null;
  if (typeof profile.name !== "string" || typeof profile.email !== "string") return null;
  return {
    name: profile.name,
    email: profile.email,
    contactPreferences: {
      email: profile.contactPreferences.email !== false,
      offers: profile.contactPreferences.offers === true,
    },
    hasPassword: profile.hasPassword === true,
  };
}

export const NAME_MAX_LENGTH = 100;
export const PASSWORD_MIN_LENGTH = 12;

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter your name.";
  if (trimmed.length > NAME_MAX_LENGTH) return `Use at most ${NAME_MAX_LENGTH} characters.`;
  return null;
}

export interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function validatePasswordForm(
  form: PasswordForm,
): Partial<Record<keyof PasswordForm, string>> {
  const errors: Partial<Record<keyof PasswordForm, string>> = {};
  if (!form.currentPassword) errors.currentPassword = "Enter your current password.";
  if (form.newPassword.length < PASSWORD_MIN_LENGTH) {
    errors.newPassword = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  } else if (form.newPassword === form.currentPassword) {
    errors.newPassword = "Choose a password you are not using now.";
  }
  if (form.confirmPassword !== form.newPassword)
    errors.confirmPassword = "The passwords do not match.";
  return errors;
}

/** The delete button stays disabled until the guest types DELETE exactly. */
export function canConfirmDeletion(typed: string, password: string, hasPassword: boolean): boolean {
  return typed === "DELETE" && (!hasPassword || password.length > 0);
}

export function exportFileName(disposition: string | null, today: string): string {
  const match = /filename="([^"]+)"/.exec(disposition ?? "");
  return match?.[1] ?? `dinesmart-account-${today}.json`;
}
