import { createHmac, randomInt } from "node:crypto";
import { normalizeEmail } from "../database/schema.js";
import {
  AuthConfigurationError,
  AuthError,
  type AuthService,
  type AuthSession,
  hashPassword,
} from "./auth.service.js";
import type { RegistrationOtpRepository } from "./registration.repository.js";

export const REGISTRATION_OTP_TTL_MS = 10 * 60 * 1_000;
export const REGISTRATION_OTP_RESEND_COOLDOWN_MS = 60 * 1_000;
export const REGISTRATION_OTP_MAX_ATTEMPTS = 5;
const MAX_PASSWORD_BYTES = 1_024;
const OTP_PATTERN = /^\d{6}$/;
const GENERIC_REQUEST_MESSAGE = "If registration can proceed, a verification code has been sent.";

export interface EmailOtpSender {
  sendRegistrationCode(email: string, code: string): Promise<void>;
}

export interface OtpRequestResult {
  message: string;
  developmentCode?: string;
}

export class MockEmailOtpSender implements EmailOtpSender {
  async sendRegistrationCode(_email: string, _code: string): Promise<void> {
    // The code is returned only by the development mock response; never print it to logs.
  }
}

function deriveOtpHmacKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("andhrimnir/email-otp/v1/key", "utf8").digest();
}

export function hashRegistrationOtp(secret: string, normalizedEmail: string, code: string): string {
  const key = deriveOtpHmacKey(secret);
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

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export class EmailOtpService {
  constructor(
    private readonly repository: RegistrationOtpRepository,
    private readonly authService: AuthService,
    private readonly jwtSecret: string,
    private readonly emailProvider: string,
    private readonly nodeEnvironment: string,
    private readonly sender: EmailOtpSender = new MockEmailOtpSender(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async register(name: string, email: string, password: string): Promise<OtpRequestResult> {
    const normalizedEmail = validEmail(email);
    if (
      typeof name !== "string" ||
      !name.trim() ||
      Array.from(name.trim()).length > 120 ||
      !normalizedEmail ||
      typeof password !== "string" ||
      Array.from(password).length < 12 ||
      Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES
    ) {
      throw new AuthError(
        400,
        "invalid_request",
        "A name, valid email, and password of at least 12 characters are required.",
      );
    }

    this.assertEmailProvider();
    const existing = await this.repository.findUserByNormalizedEmail(normalizedEmail);
    if (existing) return { message: GENERIC_REQUEST_MESSAGE };

    const now = this.clock();
    const code = this.generateCode();
    const passwordHash = await hashPassword(password);
    try {
      await this.repository.createPendingUser({
        name: name.trim(),
        email: email.trim(),
        normalizedEmail,
        role: "Customer",
        restaurantId: null,
        status: "pending",
        authProvider: "email",
        passwordHash,
        emailOtpCodeHash: hashRegistrationOtp(this.jwtSecret, normalizedEmail, code),
        emailOtpExpiresAt: new Date(now.getTime() + REGISTRATION_OTP_TTL_MS),
        emailOtpResendAt: new Date(now.getTime() + REGISTRATION_OTP_RESEND_COOLDOWN_MS),
        emailOtpAttempts: 0,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) return { message: GENERIC_REQUEST_MESSAGE };
      throw error;
    }

    await this.sender.sendRegistrationCode(email.trim(), code);
    return this.requestResult(code);
  }

  async requestRegistrationOtp(email: string): Promise<OtpRequestResult> {
    const normalizedEmail = validEmail(email);
    if (!normalizedEmail) {
      throw new AuthError(400, "invalid_request", "A valid email address is required.");
    }

    this.assertEmailProvider();
    const user = await this.repository.findUserByNormalizedEmail(normalizedEmail);
    if (!user?._id || user.status !== "pending") {
      return { message: GENERIC_REQUEST_MESSAGE };
    }

    const now = this.clock();
    if (user.emailOtpResendAt && user.emailOtpResendAt > now) {
      return { message: GENERIC_REQUEST_MESSAGE };
    }

    const code = this.generateCode();
    const updated = await this.repository.replaceRegistrationOtp(
      user._id,
      now,
      hashRegistrationOtp(this.jwtSecret, normalizedEmail, code),
      new Date(now.getTime() + REGISTRATION_OTP_TTL_MS),
      new Date(now.getTime() + REGISTRATION_OTP_RESEND_COOLDOWN_MS),
    );
    if (!updated) return { message: GENERIC_REQUEST_MESSAGE };

    await this.sender.sendRegistrationCode(user.email, code);
    return this.requestResult(code);
  }

  async verifyRegistrationOtp(email: string, code: string): Promise<AuthSession> {
    const normalizedEmail = validEmail(email);
    if (!normalizedEmail || typeof code !== "string" || !OTP_PATTERN.test(code)) {
      throw new AuthError(
        400,
        "invalid_request",
        "A valid email and six-digit verification code are required.",
      );
    }

    this.assertEmailProvider();
    const user = await this.repository.verifyRegistrationOtp(
      normalizedEmail,
      hashRegistrationOtp(this.jwtSecret, normalizedEmail, code),
      this.clock(),
    );
    if (!user?._id) {
      throw new AuthError(
        401,
        "invalid_verification_code",
        "The verification code is invalid or expired.",
      );
    }

    return this.authService.issueSessionForUser(user);
  }

  private assertEmailProvider(): void {
    if (this.emailProvider !== "mock") {
      throw new AuthConfigurationError("The configured email provider is not implemented.");
    }
    if (this.nodeEnvironment === "production") {
      throw new AuthConfigurationError("The mock email provider is not permitted in production.");
    }
  }

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  private requestResult(code: string): OtpRequestResult {
    return {
      message: GENERIC_REQUEST_MESSAGE,
      ...(this.emailProvider === "mock" && this.nodeEnvironment === "development"
        ? { developmentCode: code }
        : {}),
    };
  }
}
