import { createHmac, randomInt } from "node:crypto";
import { normalizeEmail } from "../database/schema.js";
import { AuthConfigurationError, AuthError, hashPassword } from "./auth.service.js";
import {
  PASSWORD_RESET_MAX_BYTES,
  PASSWORD_RESET_MIN_LENGTH,
  PASSWORD_RESET_OTP_RESEND_COOLDOWN_MS,
  PASSWORD_RESET_OTP_TTL_MS,
} from "./password-reset.constants.js";
import type { PasswordResetRepository } from "./password-reset.repository.js";

export {
  PASSWORD_RESET_MAX_BYTES,
  PASSWORD_RESET_MIN_LENGTH,
  PASSWORD_RESET_OTP_MAX_ATTEMPTS,
  PASSWORD_RESET_OTP_RESEND_COOLDOWN_MS,
  PASSWORD_RESET_OTP_TTL_MS,
} from "./password-reset.constants.js";

const OTP_PATTERN = /^\d{6}$/;
const GENERIC_PASSWORD_RESET_MESSAGE =
  "If an eligible account exists, password reset instructions have been sent.";

export interface PasswordResetEmailSender {
  sendPasswordResetCode(email: string, code: string): Promise<void>;
}

export interface PasswordResetRequestResult {
  message: string;
  developmentCode?: string;
}

export class MockPasswordResetEmailSender implements PasswordResetEmailSender {
  async sendPasswordResetCode(_email: string, _code: string): Promise<void> {
    // The development mock never prints OTPs; the local-only response carries the code.
  }
}

function derivePasswordResetHmacKey(secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("andhrimnir/password-reset-otp/v1/key", "utf8")
    .digest();
}

export function hashPasswordResetOtp(
  secret: string,
  normalizedEmail: string,
  code: string,
): string {
  const key = derivePasswordResetHmacKey(secret);
  return createHmac("sha256", key).update(`${normalizedEmail}\0${code}`, "utf8").digest("hex");
}

function validEmail(email: string): string | null {
  if (typeof email !== "string") return null;
  const normalizedEmail = normalizeEmail(email);
  if (
    !normalizedEmail ||
    Buffer.byteLength(normalizedEmail, "utf8") > 320 ||
    !normalizedEmail.includes("@") ||
    /\s/.test(normalizedEmail)
  ) {
    return null;
  }
  return normalizedEmail;
}

export class PasswordResetService {
  constructor(
    private readonly repository: PasswordResetRepository,
    private readonly jwtSecret: string,
    private readonly emailProvider: string,
    private readonly nodeEnvironment: string,
    private readonly sender: PasswordResetEmailSender = new MockPasswordResetEmailSender(),
    private readonly clock: () => Date = () => new Date(),
    private readonly codeGenerator: () => string = () =>
      randomInt(0, 1_000_000).toString().padStart(6, "0"),
  ) {}

  async requestReset(email: string): Promise<PasswordResetRequestResult> {
    const normalizedEmail = validEmail(email);
    if (!normalizedEmail) {
      throw new AuthError(400, "invalid_request", "A valid email address is required.");
    }
    this.assertEmailProvider();

    const now = this.clock();
    const code = this.codeGenerator();
    if (!OTP_PATTERN.test(code)) throw new Error("Generated password-reset code was invalid.");
    const target = await this.repository.issuePasswordResetCode(
      normalizedEmail,
      hashPasswordResetOtp(this.jwtSecret, normalizedEmail, code),
      now,
      new Date(now.getTime() + PASSWORD_RESET_OTP_TTL_MS),
      new Date(now.getTime() + PASSWORD_RESET_OTP_RESEND_COOLDOWN_MS),
    );

    if (!target) return { message: GENERIC_PASSWORD_RESET_MESSAGE };
    await this.sender.sendPasswordResetCode(target.email, code);
    return {
      message: GENERIC_PASSWORD_RESET_MESSAGE,
      ...(this.emailProvider === "mock" && this.nodeEnvironment === "development"
        ? { developmentCode: code }
        : {}),
    };
  }

  async confirmReset(email: string, code: string, newPassword: string): Promise<void> {
    const normalizedEmail = validEmail(email);
    if (
      !normalizedEmail ||
      typeof code !== "string" ||
      !OTP_PATTERN.test(code) ||
      typeof newPassword !== "string" ||
      Array.from(newPassword).length < PASSWORD_RESET_MIN_LENGTH ||
      Buffer.byteLength(newPassword, "utf8") > PASSWORD_RESET_MAX_BYTES
    ) {
      throw new AuthError(
        400,
        "invalid_request",
        `A valid email, six-digit code, and password of at least ${PASSWORD_RESET_MIN_LENGTH} characters are required.`,
      );
    }

    const now = this.clock();
    const passwordHash = await hashPassword(newPassword);
    const userId = await this.repository.replacePasswordWithResetCode(
      normalizedEmail,
      hashPasswordResetOtp(this.jwtSecret, normalizedEmail, code),
      passwordHash,
      now,
    );
    if (!userId) {
      throw new AuthError(
        401,
        "invalid_password_reset_code",
        "The password reset code is invalid or expired.",
      );
    }

    try {
      await this.repository.revokeActiveRefreshSessions(userId, now);
    } catch {
      // passwordChangedAt was already committed with the new hash. AuthService.refresh
      // rejects and lazily revokes any older family if bulk revocation is unavailable.
      throw new AuthError(
        503,
        "password_reset_sessions_pending",
        "The password was changed, but existing sessions could not be cleared. Sign in with the new password.",
      );
    }
  }

  private assertEmailProvider(): void {
    if (this.emailProvider !== "mock") {
      throw new AuthConfigurationError("The configured email provider is not implemented.");
    }
    if (this.nodeEnvironment === "production") {
      throw new AuthConfigurationError("The mock email provider is not permitted in production.");
    }
  }
}
