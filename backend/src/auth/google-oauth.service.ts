import { OAuth2Client } from "google-auth-library";
import { normalizeEmail, type UserDocument } from "../database/schema.js";
import type { AuthRepository } from "./auth.repository.js";
import { AuthError, type AuthService, type AuthSession } from "./auth.service.js";

export interface GoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
}

export interface GoogleIdentityVerifier {
  verifyIdToken(idToken: string): Promise<GoogleIdentity | null>;
}

export class GoogleIdTokenVerifier implements GoogleIdentityVerifier {
  private readonly client: OAuth2Client;

  constructor(private readonly clientId: string) {
    this.client = new OAuth2Client(clientId);
  }

  async verifyIdToken(idToken: string): Promise<GoogleIdentity | null> {
    const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) return null;

    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
    };
  }
}

function genericGoogleAuthFailure(): AuthError {
  return new AuthError(401, "invalid_google_credential", "Google sign-in could not be verified.");
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export class GoogleOAuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly authService: AuthService,
    private readonly verifier: GoogleIdentityVerifier,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async login(idToken: string): Promise<AuthSession> {
    if (typeof idToken !== "string" || idToken.length === 0 || idToken.length > 8_192) {
      throw new AuthError(400, "invalid_request", "A valid Google ID token is required.");
    }

    let identity: GoogleIdentity | null;
    try {
      identity = await this.verifier.verifyIdToken(idToken);
    } catch {
      throw genericGoogleAuthFailure();
    }

    if (
      !identity?.emailVerified ||
      identity.subject.length === 0 ||
      identity.subject.length > 255
    ) {
      throw genericGoogleAuthFailure();
    }

    const normalizedEmail = normalizeEmail(identity.email);
    if (
      !normalizedEmail ||
      Buffer.byteLength(normalizedEmail, "utf8") > 320 ||
      !normalizedEmail.includes("@")
    ) {
      throw genericGoogleAuthFailure();
    }

    const user = await this.repository.findActiveUserByEmail(normalizedEmail);
    if (!user?._id) throw genericGoogleAuthFailure();

    let linkedUser: (UserDocument & { _id: typeof user._id }) | null = user;
    if (user.googleSubject && user.googleSubject !== identity.subject) {
      throw genericGoogleAuthFailure();
    }

    if (!user.googleSubject) {
      try {
        linkedUser = await this.repository.linkGoogleSubject(
          user._id,
          identity.subject,
          this.clock(),
        );
      } catch (error) {
        if (isDuplicateKeyError(error)) throw genericGoogleAuthFailure();
        throw error;
      }
      if (!linkedUser) throw genericGoogleAuthFailure();
    }

    return this.authService.issueSessionForUser(linkedUser);
  }
}
