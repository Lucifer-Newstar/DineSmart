import nodemailer from "nodemailer";
import { REGISTRATION_OTP_TTL_MS } from "../auth/email-otp.service.js";
import { PASSWORD_RESET_OTP_TTL_MS } from "../auth/password-reset.constants.js";

/**
 * Email delivery for the OTP and password-reset flows.
 *
 * EMAIL_PROVIDER selects the transport:
 * - `mock`   development and tests only; nothing is sent and codes are never logged
 * - `smtp`   any SMTP server (Gmail app password, Brevo, Mailgun, SES SMTP, ...)
 * - `resend` the Resend HTTPS API
 *
 * Production refuses to start without a real provider (see assertEmailConfiguration).
 */
export const EMAIL_PROVIDERS = ["mock", "smtp", "resend"] as const;
export type EmailProviderName = (typeof EMAIL_PROVIDERS)[number];

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailTransport {
  readonly provider: EmailProviderName;
  send(message: EmailMessage): Promise<void>;
}

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export type EmailEnvironment = Readonly<Record<string, string | undefined>>;

function value(env: EmailEnvironment, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}

function required(env: EmailEnvironment, name: string, provider: string): string {
  const found = value(env, name);
  if (!found) {
    throw new EmailConfigurationError(`${name} must be set when EMAIL_PROVIDER=${provider}.`);
  }
  return found;
}

/** Returns the configured provider name, defaulting to `mock` outside production. */
export function resolveEmailProvider(
  env: EmailEnvironment,
  nodeEnvironment: string,
): EmailProviderName {
  const configured = value(env, "EMAIL_PROVIDER")?.toLowerCase();
  const provider = configured ?? (nodeEnvironment === "production" ? undefined : "mock");
  if (!provider) {
    throw new EmailConfigurationError(
      "EMAIL_PROVIDER must be set to smtp or resend in production.",
    );
  }
  if (!(EMAIL_PROVIDERS as readonly string[]).includes(provider)) {
    throw new EmailConfigurationError(
      `EMAIL_PROVIDER must be one of ${EMAIL_PROVIDERS.join(", ")}; received "${provider}".`,
    );
  }
  if (provider === "mock" && nodeEnvironment === "production") {
    throw new EmailConfigurationError(
      "EMAIL_PROVIDER=mock is not permitted in production; use smtp or resend.",
    );
  }
  return provider as EmailProviderName;
}

export class MockEmailTransport implements EmailTransport {
  readonly provider = "mock" as const;

  async send(_message: EmailMessage): Promise<void> {
    // Development only. The code reaches the developer through the API's
    // developmentCode field; it is never written to logs.
  }
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

type SendMail = (message: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) => Promise<unknown>;

export class SmtpEmailTransport implements EmailTransport {
  readonly provider = "smtp" as const;
  private readonly sendMail: SendMail;

  constructor(
    private readonly settings: SmtpSettings,
    sendMail?: SendMail,
  ) {
    if (sendMail) {
      this.sendMail = sendMail;
    } else {
      const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: settings.user ? { user: settings.user, pass: settings.password ?? "" } : undefined,
        connectionTimeout: SEND_TIMEOUT_MS,
        greetingTimeout: SEND_TIMEOUT_MS,
        socketTimeout: SEND_TIMEOUT_MS,
      });
      this.sendMail = (message) => transporter.sendMail(message);
    }
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.sendMail({ from: this.settings.from, ...message });
    } catch {
      // The SMTP error can echo addresses or server banners; keep it out of logs.
      throw new EmailDeliveryError("The SMTP server did not accept the message.");
    }
  }
}

export class ResendEmailTransport implements EmailTransport {
  readonly provider = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch {
      throw new EmailDeliveryError("The email API could not be reached.");
    }
    if (!response.ok) {
      throw new EmailDeliveryError(`The email API rejected the message (HTTP ${response.status}).`);
    }
  }
}

export function parseSmtpSettings(env: EmailEnvironment): SmtpSettings {
  const host = required(env, "SMTP_HOST", "smtp");
  const from = required(env, "EMAIL_FROM", "smtp");
  const secure = value(env, "SMTP_SECURE")?.toLowerCase() === "true";
  const port = Number(value(env, "SMTP_PORT") ?? (secure ? 465 : 587));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new EmailConfigurationError("SMTP_PORT must be an integer between 1 and 65535.");
  }
  const user = value(env, "SMTP_USER");
  const password = value(env, "SMTP_PASSWORD");
  if (user && !password) {
    throw new EmailConfigurationError("SMTP_PASSWORD must be set when SMTP_USER is set.");
  }
  return { host, port, secure, user, password, from };
}

/** Builds the transport selected by EMAIL_PROVIDER, validating its settings. */
export function createEmailTransport(
  env: EmailEnvironment,
  nodeEnvironment: string,
): EmailTransport {
  const provider = resolveEmailProvider(env, nodeEnvironment);
  if (provider === "smtp") return new SmtpEmailTransport(parseSmtpSettings(env));
  if (provider === "resend") {
    const apiKey = value(env, "RESEND_API_KEY") ?? value(env, "EMAIL_API_KEY");
    if (!apiKey) {
      throw new EmailConfigurationError("RESEND_API_KEY must be set when EMAIL_PROVIDER=resend.");
    }
    return new ResendEmailTransport(apiKey, required(env, "EMAIL_FROM", "resend"));
  }
  return new MockEmailTransport();
}

/** Called at startup so a misconfigured production deploy fails fast and says why. */
export function assertEmailConfiguration(env: EmailEnvironment, nodeEnvironment: string): void {
  createEmailTransport(env, nodeEnvironment);
}

function minutes(ms: number): number {
  return Math.round(ms / 60_000);
}

/** Composes the OTP and reset messages; one instance serves both auth services. */
export class AuthEmailSender {
  constructor(private readonly transport: EmailTransport) {}

  sendRegistrationCode(email: string, code: string): Promise<void> {
    return this.transport.send({
      to: email,
      subject: "Your DineSmart verification code",
      text: [
        `Your DineSmart verification code is ${code}.`,
        `It expires in ${minutes(REGISTRATION_OTP_TTL_MS)} minutes.`,
        "If you did not try to create an account, you can ignore this email.",
      ].join("\n\n"),
    });
  }

  sendPasswordResetCode(email: string, code: string): Promise<void> {
    return this.transport.send({
      to: email,
      subject: "Your DineSmart password reset code",
      text: [
        `Your DineSmart password reset code is ${code}.`,
        `It expires in ${minutes(PASSWORD_RESET_OTP_TTL_MS)} minutes.`,
        "If you did not ask to reset your password, you can ignore this email; your password has not changed.",
      ].join("\n\n"),
    });
  }
}
