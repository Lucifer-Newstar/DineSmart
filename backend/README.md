# Andhrímnir Backend

This package provides the Express API foundation, process-liveness endpoint, native MongoDB connection/index bootstrap, typed collection contracts, and Email/OTP, email/password, Google sign-in, JWT refresh, and logout flows. RBAC permission/tenant middleware is in progress; operations routes, password reset, strict document validation, and restaurant workflows are still pending.

## Requirements

- Node.js `24.21.0` (pinned in the repository root `.nvmrc`)
- npm
- Docker Compose for the local MongoDB service, or a MongoDB instance of your own

## Run locally with Docker Compose

From the repository root:

```bash
docker compose up -d mongodb
cp backend/.env.example backend/.env
cd backend
npm ci
npm run dev
```

The API listens on port `3001` by default (or the value of `PORT`) and binds to `0.0.0.0`. `GET /health` reports process liveness only; it does not indicate database readiness. The Compose service binds MongoDB to loopback on port `27017` and stores local data in a named volume. Do not expose this unauthenticated development service to a network.

To stop MongoDB while preserving data, run `docker compose down` from the repository root. Use `docker compose down --volumes` only when you intend to delete the local database volume.

## Authentication API (S1-09–S1-11)

With a live MongoDB configured, the backend exposes these versioned endpoints:

- `POST /api/v1/auth/register` — create a pending Customer and request an Email/OTP verification code.
- `POST /api/v1/auth/otp/request` — request a resend for an eligible pending registration; the per-account cooldown is 60 seconds.
- `POST /api/v1/auth/otp/verify` — verify the six-digit code, activate the account, and establish a session.
- `POST /api/v1/auth/login` — verify an active user's email/password and return a 15-minute bearer access token.
- `POST /api/v1/auth/google` — verify a Google Identity Services ID token and link its verified email to an existing active account.
- `POST /api/v1/auth/refresh` — rotate the HttpOnly refresh cookie and return a new access token.
- `POST /api/v1/auth/logout` — revoke the refresh session and clear the cookie.

OTP policy is six digits, ten-minute expiry, 60-second resend cooldown, and five verification attempts. In `NODE_ENV=development` with the local `EMAIL_PROVIDER=mock`, registration/resend responses include `developmentCode` for manual testing. The mock provider is rejected in production and is not a real email integration; a production email provider and live MongoDB verification remain outstanding.

Set `JWT_SECRET` in `backend/.env` to at least 32 bytes of cryptographically random material (for example, generate a value with `openssl rand -base64 32`). `WEB_ORIGIN` must exactly match the frontend origin; local default is `http://localhost:3000`. For Google sign-in, set `GOOGLE_CLIENT_ID` on the backend and the matching public `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on the frontend; this ID-token verification flow does not use a client secret. Never commit real values. Browser calls that refresh/logout must send credentials; production uses `Secure; SameSite=None` cookies and exact-origin checks. Access tokens belong in client memory, not local storage.

Registration assigns the Customer role and a null restaurant scope on the server. New passwords must be at least 12 characters (maximum 1024 UTF-8 bytes). The OTP is stored only as a purpose-separated HMAC on the pending user document; successful verification removes challenge state. MongoDB is required for auth/session persistence; without it, auth routes fail closed while `/health` remains process-liveness-only.

## Quality commands

Run these from `backend/`:

```bash
npm run lint
npm run format
npm run test
npm run typecheck
npm run build
```

The tests use Node's built-in test runner. Connection configuration is read from `MONGODB_URI`; no Atlas credentials are committed. Atlas connectivity can be configured later by supplying a URI through a secret-safe local environment.
