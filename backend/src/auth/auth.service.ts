import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2, { type HashOptions as Argon2HashOptions } from "argon2";
import { jwtVerify, SignJWT } from "jose";
import type { ObjectId } from "mongodb";
import { normalizeEmail, type UserDocument, type UserRole } from "../database/schema.js";
import type { AuthRepository } from "./auth.repository.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const ACCESS_TOKEN_ISSUER = "andhrimnir-api";
export const ACCESS_TOKEN_AUDIENCE = "andhrimnir-client";

const MAX_PASSWORD_BYTES = 1_024;
const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ARGON2_OPTIONS: Argon2HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const VALID_ROLES = new Set<UserRole>([
  "Customer",
  "Reception",
  "Kitchen Staff",
  "Manager",
  "Administrator",
]);

export interface SafeAuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  restaurantId: string | null;
}

export interface AuthPrincipal {
  userId: string;
  role: UserRole;
  restaurantId: string | null;
}

export interface AuthSession {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: SafeAuthUser;
}

export class AuthError extends Error {
  constructor(
    readonly statusCode: 400 | 401 | 403 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export class AuthConfigurationError extends Error {
  constructor(message = "Authentication is not configured.") {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isRefreshTokenShape(token: unknown): token is string {
  return typeof token === "string" && REFRESH_TOKEN_PATTERN.test(token);
}

export async function hashPassword(password: string): Promise<string> {
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES
  ) {
    throw new AuthError(
      400,
      "invalid_request",
      "Password must be a non-empty string no longer than 1024 bytes.",
    );
  }

  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES)
    return false;
  if (typeof encodedHash !== "string" || encodedHash.length > 512) return false;

  try {
    return await argon2.verify(encodedHash, password);
  } catch {
    return false;
  }
}

function buildJwtKey(secret: string): Uint8Array {
  const encoded = new TextEncoder().encode(secret);
  if (encoded.byteLength < 32) {
    throw new AuthConfigurationError(
      "JWT_SECRET must contain at least 32 bytes of high-entropy key material.",
    );
  }

  return encoded;
}

function safeUser(user: UserDocument & { _id: ObjectId }): SafeAuthUser {
  return {
    id: user._id.toHexString(),
    name: user.name,
    email: user.email,
    role: user.role,
    restaurantId: user.restaurantId?.toHexString() ?? null,
  };
}

export class AuthService {
  private readonly jwtKey: Uint8Array;

  constructor(
    private readonly repository: AuthRepository,
    secret: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.jwtKey = buildJwtKey(secret);
  }

  async login(email: string, password: string): Promise<AuthSession> {
    if (typeof email !== "string") {
      throw new AuthError(400, "invalid_request", "A valid email and password are required.");
    }

    const normalizedEmail = normalizeEmail(email);
    if (
      !normalizedEmail ||
      Buffer.byteLength(normalizedEmail, "utf8") > 320 ||
      !normalizedEmail.includes("@") ||
      /\s/.test(normalizedEmail) ||
      typeof password !== "string" ||
      password.length === 0 ||
      Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES
    ) {
      throw new AuthError(400, "invalid_request", "A valid email and password are required.");
    }

    const user = await this.repository.findActiveUserByEmail(normalizedEmail);
    if (!user?.passwordHash) {
      // Match the expensive password-verification path to reduce account-enumeration timing signals.
      await argon2.hash(password, ARGON2_OPTIONS);
      throw new AuthError(401, "invalid_credentials", "Email or password is incorrect.");
    }

    if (!(await verifyPassword(password, user.passwordHash)) || !user._id) {
      throw new AuthError(401, "invalid_credentials", "Email or password is incorrect.");
    }

    return this.createSession(user);
  }

  async issueSessionForUser(user: UserDocument & { _id: ObjectId }): Promise<AuthSession> {
    if (user.status !== "active") {
      throw new AuthError(401, "invalid_user", "An active user is required to start a session.");
    }

    return this.createSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    if (!isRefreshTokenShape(refreshToken)) {
      throw new AuthError(401, "invalid_refresh_token", "A valid refresh session is required.");
    }

    const now = this.clock();
    const nextRefreshToken = randomBytes(32).toString("base64url");
    const rotated = await this.repository.rotateRefreshSession(
      hashRefreshToken(refreshToken),
      hashRefreshToken(nextRefreshToken),
      now,
    );

    if (!rotated) {
      throw new AuthError(401, "invalid_refresh_token", "A valid refresh session is required.");
    }

    const user = await this.repository.findActiveUserById(rotated.userId);
    if (!user?._id) {
      await this.repository.revokeRefreshSession(rotated._id, now);
      throw new AuthError(401, "invalid_refresh_token", "A valid refresh session is required.");
    }
    if (
      (user.passwordChangedAt && rotated.createdAt < user.passwordChangedAt) ||
      (user.refreshSessionsInvalidBefore && rotated.createdAt < user.refreshSessionsInvalidBefore)
    ) {
      await this.repository.revokeRefreshSession(rotated._id, now);
      throw new AuthError(401, "invalid_refresh_token", "A valid refresh session is required.");
    }

    return this.createSession(user, nextRefreshToken, rotated.expiresAt);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!isRefreshTokenShape(refreshToken)) return;
    await this.repository.revokeRefreshToken(hashRefreshToken(refreshToken), this.clock());
  }

  async verifyAccessToken(token: string): Promise<AuthPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.jwtKey, {
        algorithms: ["HS256"],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
        currentDate: this.clock(),
      });

      const restaurantId = payload.restaurantId;
      if (
        typeof payload.sub !== "string" ||
        !/^[a-f\d]{24}$/i.test(payload.sub) ||
        typeof payload.role !== "string" ||
        !VALID_ROLES.has(payload.role as UserRole) ||
        !(
          restaurantId === null ||
          (typeof restaurantId === "string" && /^[a-f\d]{24}$/i.test(restaurantId))
        )
      ) {
        throw new Error("Required access-token claims are invalid.");
      }

      return {
        userId: payload.sub,
        role: payload.role as UserRole,
        restaurantId,
      };
    } catch {
      throw new AuthError(401, "invalid_access_token", "A valid access token is required.");
    }
  }

  private async createSession(
    user: UserDocument & { _id: ObjectId },
    refreshToken?: string,
    existingRefreshExpiry?: Date,
  ): Promise<AuthSession> {
    const now = this.clock();
    const accessTokenExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1_000);
    const isNewSession = refreshToken === undefined;
    const activeRefreshToken = refreshToken ?? randomBytes(32).toString("base64url");
    const refreshTokenExpiresAt =
      existingRefreshExpiry ?? new Date(now.getTime() + REFRESH_SESSION_TTL_MS);

    if (!REFRESH_TOKEN_PATTERN.test(activeRefreshToken)) {
      throw new Error("Generated refresh token did not match the expected format.");
    }

    if (refreshTokenExpiresAt <= now) {
      throw new AuthError(401, "invalid_refresh_token", "A valid refresh session is required.");
    }

    if (isNewSession) {
      await this.repository.createRefreshSession({
        userId: user._id,
        tokenHash: hashRefreshToken(activeRefreshToken),
        usedTokenHashes: [],
        expiresAt: refreshTokenExpiresAt,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const accessToken = await new SignJWT({
      role: user.role,
      restaurantId: user.restaurantId?.toHexString() ?? null,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(user._id.toHexString())
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setJti(randomUUID())
      .setIssuedAt(Math.floor(now.getTime() / 1_000))
      .setExpirationTime(Math.floor(accessTokenExpiresAt.getTime() / 1_000))
      .sign(this.jwtKey);

    return {
      accessToken,
      accessTokenExpiresAt,
      refreshToken: activeRefreshToken,
      refreshTokenExpiresAt,
      user: safeUser(user),
    };
  }
}
