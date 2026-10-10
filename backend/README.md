# Andhrímnir Backend

This package provides the Express API foundation, process-liveness endpoint, native MongoDB connection/index bootstrap, typed collection contracts, and Email/OTP, email/password, Google sign-in, JWT refresh, and logout flows. Shared RBAC permission/tenant middleware is implemented and exercised by the AI routes; applying it across product operations routes remains pending. Restaurant operations APIs, password reset, strict document validation, and live workflows are still outstanding.

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
npm run seed  # optional: create the local demo restaurant and sample records
npm run dev
```

The API listens on port `3001` by default (or the value of `PORT`) and binds to `0.0.0.0`. `GET /health` reports process liveness only; it does not indicate database readiness. The Compose service binds MongoDB to loopback on port `27017` and stores local data in a named volume. Do not expose this unauthenticated development service to a network.

To stop MongoDB while preserving data, run `docker compose down` from the repository root. Use `docker compose down --volumes` only when you intend to delete the local database volume.

### Local demo data (optional)

Run `npm run seed` from `backend/` after copying `.env.example` to `.env` and starting Compose. The script creates repeatable Saffron & Co. demo records for the operations UI. It refuses to run unless `NODE_ENV=development` and `MONGODB_URI` targets a local host. It upserts its fixed fixture IDs, so re-running refreshes only those demo records. The `.env.example` override is `Andhrimnir-Demo-Only-Change-Me`; if `SEED_DEMO_PASSWORD` is unset, the script falls back to `Andhrimnir Demo 2026`. Set a private local-only value if desired. The seeded users are `manager@saffronandco.demo`, `reception@saffronandco.demo`, `kitchen.staff@saffronandco.demo`, `administrator@saffronandco.demo`, and `ananya@saffronandco.demo`. These are public local demo credentials only—never seed them into production or a shared database.

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

## AI recommendations (S3-01/02/04/13)

- `POST /api/v1/incidents/{incidentId}/recommendations` — Manager/Administrator only; build a tenant-filtered incident context, request a structured Gemini recommendation when configured, and persist one current recommendation for the incident.
- `GET /api/v1/recommendations?incidentId={id}` — retrieve current tenant-scoped recommendations (the filter is optional).
- The backend defaults to `GEMINI_MODEL=gemini-3.5-flash-lite`; the model ID is configurable. Set `GEMINI_API_KEY` only in backend `.env` or a deployment secret. It is never sent to the browser.
- With no API key, or on timeout/quota/invalid output, the backend persists a deterministic `source=fallback` recommendation. All recommendations are advisory; no operational record is changed automatically.
- Context construction omits customer names/contact details and direct customer/database identifiers. Live Gemini and MongoDB integration still need credentials/service availability for end-to-end verification.

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
