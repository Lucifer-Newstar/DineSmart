# Andhrímnir Backend

This package provides the Express API foundation, process-liveness endpoint, native MongoDB connection/index bootstrap, typed collection contracts, and the initial JWT login/refresh/logout flows. Email-OTP registration, Google OAuth, password reset, RBAC enforcement, strict document validation, and restaurant operations remain pending.

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

## Authentication API (S1-09 baseline)

With a live MongoDB configured, the backend exposes these versioned endpoints:

- `POST /api/v1/auth/login` — verify an active user's email/password and return a 15-minute bearer access token.
- `POST /api/v1/auth/google` — verify a Google Identity Services ID token and link its verified email to an existing active account.
- `POST /api/v1/auth/refresh` — rotate the HttpOnly refresh cookie and return a new access token.
- `POST /api/v1/auth/logout` — revoke the refresh session and clear the cookie.

Set `JWT_SECRET` in `backend/.env` to at least 32 bytes of cryptographically random material (for example, generate a value with `openssl rand -base64 32`). `WEB_ORIGIN` must exactly match the frontend origin; local default is `http://localhost:3000`. For Google sign-in, set `GOOGLE_CLIENT_ID` on the backend and the matching public `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on the frontend; this ID-token verification flow does not use a client secret. Never commit real values. Browser calls that refresh/logout must send credentials; production uses `Secure; SameSite=None` cookies and exact-origin checks. Access tokens belong in client memory, not local storage.

A live user record must already be active and have an Argon2id `passwordHash`; user registration and OTP verification are handled in S1-11. MongoDB is required for login/session persistence; without it, auth routes fail closed while `/health` remains process-liveness-only.

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
