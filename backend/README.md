# Andhrímnir Backend

This package provides the Express API foundation, process-liveness endpoint, native MongoDB connection/index bootstrap, typed collection contracts, Email/OTP, email/password, Google sign-in, JWT refresh/logout flows, shared RBAC permission/tenant middleware, tenant-scoped inventory and health-score endpoints, and AI recommendation endpoints. Unit/route tests pass locally, but MongoDB-backed workflows have not been verified against a live MongoDB service and AI has not been checked against a live Gemini key. Most other operations routes, password reset, strict document validation, and persisted restaurant workflows remain pending.

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

## Inventory API (S2-06)

`GET /api/v1/inventory` requires a bearer token and `inventory:availability:read`. Queries are scoped to the restaurant on the signed principal. Manager/Administrator receive quantities, units, thresholds, low-stock flags, and adjustment timestamps; Reception/Kitchen Staff receive only item names and low/available state. Lists are name-sorted, capped at 2,000 items, and report `truncated` when the cap is reached.

`PUT /api/v1/inventory/:id` requires `inventory:write` (Manager/Administrator). It sets an absolute non-negative manual count, optionally updates the non-negative low-stock threshold, and stamps `lastAdjustedAt` server-side. Inventory is not deducted automatically from orders and the route does not create incidents. The request/response details are assistant recommendations recorded in [Implementation Decisions](../Docs/Architecture/Andhrimnir_Implementation_Decisions.md), not separate owner approvals. Route, validation, repository-tenant, and role-shape tests pass locally; live MongoDB verification remains outstanding.

## Restaurant health score (S2-08)

`GET /api/v1/healthscore` requires a bearer access token and the `dashboard:operations:read` permission (Reception, Manager, or Administrator). It derives the tenant from the signed principal and queries tenant-scoped orders, inventory, reservations, tables, incidents, and restaurant thresholds; a client cannot select another restaurant. The response is a live rolling-24-hour weighted score with six explained components (kitchen 25%, inventory 20%, order completion 20%, reservation 15%, table utilization 10%, incidents 10%), calculation timestamps, per-component observation counts/status, and capped-sample metadata. Components without eligible observations use a neutral score of 50 without reweighting; the endpoint never mutates operational records.

The approved weight distribution is in [Implementation Decisions](../Docs/Architecture/Andhrimnir_Implementation_Decisions.md). Normalization formulas and missing-data handling are explicitly marked as assistant recommendations, not separate owner approvals. MongoDB reads are capped at 2,000 records per collection and the response lists collections whose sample was truncated. The route calculates on demand; event-triggered and scheduled hourly refresh are not implemented yet. Unit, authorization, and tenant-query tests pass locally; end-to-end verification against MongoDB remains outstanding.

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
