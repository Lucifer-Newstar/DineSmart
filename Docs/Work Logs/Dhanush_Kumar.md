# Dhanush Kumar — Work Log

## 2026-10-10

### S1-03 — Setup Next.js

- **Branch:** `feature/S1-03-nextjs-setup`.
- Added the Next.js App Router, TypeScript, and Tailwind CSS frontend foundation, pinned Node.js `24.21.0` via root `.nvmrc` and the frontend engine constraint, and removed unused starter assets.
- Replaced the default Next.js landing page with a neutral, accessible Andhrímnir application shell. No customer or restaurant workflows, brand colors, or external assets were introduced.
- **Implementation commit:** `f75bcfe` (Dhanush). Navin's separate security commit `7d542aa` removed the generated ESLint dependency chain and configured Biome `2.5.15`.
- **Validation on Node `24.21.0`:** `npm run lint`, `npm run typecheck`, and `npm run build` passed. Both full `npm audit` and `npm audit --omit=dev` report zero vulnerabilities. The root page returned the expected static shell in the local dev-server smoke check.
- **Delivery:** committed locally; no remote push was made during this task.

### S1-09 — JWT Authentication

- **Branch:** `feature/S1-09-jwt-auth`, stacked on local `feature/S1-08-database-schema`; S1-08 is not yet merged.
- Added versioned email/password login, JWT bearer verification middleware, refresh, and logout. Access JWTs expire after 15 minutes; refresh tokens are 256-bit opaque values, stored only as SHA-256 hashes, rotated on use, replay-detected, and revoked on logout. The recommended seven-day lifetime is absolute and is not extended by rotation.
- Added Argon2id password helpers, generic invalid-credential responses, exact-origin credentialed CORS, production Secure/HttpOnly/SameSite=None cookies, local Lax cookies, and in-memory IP rate limits. The technical details are assistant-selected recommendations per owner direction, not separate owner approvals.
- Added the `refresh_sessions` collection/index/TTL baseline and `WEB_ORIGIN` example. Registration/OTP, Google OAuth, password reset, and RBAC enforcement remain assigned to their later stories.
- **Validation on Node `24.21.0`:** 14 backend tests, Biome, TypeScript typecheck, production build, and `npm audit --audit-level=high` passed; zero vulnerabilities. Tests use a fake auth repository; live MongoDB verification remains unavailable because Docker and `mongod` are absent.
- **Status:** In Progress pending live MongoDB persistence verification. Work remains local; no remote push was made.

### S1-10 — Google OAuth

- **Branch:** `feature/S1-10-google-oauth`, stacked on local `feature/S1-09-jwt-auth`; prior task branches remain unmerged.
- Added `POST /api/v1/auth/google` using Google Identity Services ID tokens and server-side signature/audience verification through `google-auth-library`. Verified Google email may link only to an existing active user; the stable Google subject is stored under a unique index. Google login does not create accounts or assign roles; Email/OTP remains the registration path.
- Reuses the S1-09 access/refresh session, cookie, origin, and rate-limit flow. Added matching public frontend/backend client-ID placeholders; no Google client secret is used or committed.
- **Validation on Node `24.21.0`:** 17 backend tests, Biome, TypeScript typecheck, production build, and `npm audit --audit-level=high` passed; zero vulnerabilities. Unit/HTTP tests use an injected fake verifier; no live Google credentials or MongoDB instance are available for end-to-end verification.
- **Status:** In Progress pending a real Google ID-token and live MongoDB check. Work remains local; no remote push was made.

### S1-11 — Email OTP registration

- **Branch:** `feature/S1-11-email-otp`, stacked on local `feature/S1-10-google-oauth`; prior task branches remain unmerged.
- Added pending Customer registration, resend and verify endpoints; OTP values are six digits, held only as domain-separated HMAC-SHA-256 values in MongoDB, with ten-minute expiry, 60-second cooldown, and five-attempt lockout. Verification activates the user and issues the standard S1-09 session. Server assigns role/tenant fields; the new-password minimum is 12 characters and maximum is 1024 UTF-8 bytes.
- The local mock email adapter never logs codes; `developmentCode` is returned only in development. Production rejects the mock provider. Real provider integration is not configured.
- **Implementation commit:** `cdf1ed8` (Dhanush).
- **Validation on Node `24.21.0`:** Biome, 21 backend tests, TypeScript typecheck, production build, and `npm audit --audit-level=high` passed; zero vulnerabilities. OTP tests use fake repositories; live MongoDB and real email delivery remain unverified because Docker/`mongod` and provider credentials are unavailable.
- **Status:** In Progress pending live MongoDB atomic-operation verification and real provider delivery. No remote push or merge was made.