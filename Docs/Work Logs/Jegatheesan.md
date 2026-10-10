# Jegatheesan — Work Log

## 2026-10-10

### S1-04 — Setup Express Backend

- **Branch:** `feature/S1-04-express-backend`, stacked on `feature/S1-07-ci-cd` because the backend package is a CI input; integrate the prerequisite branches first.
- Added an Express 5 and TypeScript API package with Node.js `24.21.0` engine enforcement, npm lockfile, Biome checks, development/build/start scripts, and a Node test-runner script.
- Added a process-liveness-only `GET /health` route and a graceful server entry point bound to `0.0.0.0`. Product endpoints remain under `/api/v1`; no database, authentication, or restaurant workflows were added.
- **Validation on Node `24.21.0`:** clean `npm ci`, Biome lint, one liveness test, TypeScript typecheck, production build, and `npm audit` passed; zero vulnerabilities. Local `/health` smoke check returned HTTP 200.
- **Delivery:** committed locally; no remote push was made during this task.

### S1-05 — Local-first MongoDB connection setup

- **Branch:** `feature/S1-05-mongodb-atlas`, stacked on `feature/S1-04-express-backend`.
- Per owner choice, selected the official MongoDB Node.js driver instead of Mongoose, with local MongoDB first and Atlas later. Added a loopback-only MongoDB `8.0` Compose service, named data volume, `MONGODB_URI` example, dotenv loading, and a reusable driver connection helper.
- The API attempts a connection only when `MONGODB_URI` is set; if the database is unavailable it stays in liveness-only mode and does not log the URI. No collection schemas or product data routes were introduced.
- **Validation on Node `24.21.0`:** clean `npm ci`, Biome lint, three tests, TypeScript typecheck, production build, and `npm audit` passed; zero vulnerabilities. `/health` returned HTTP 200, and the connection-failure path stayed alive. Compose YAML was parsed, but this workspace has no Docker daemon, so the container/live database could not be started.
- **Status:** In Progress pending a live local MongoDB check and later Atlas provisioning/URI. No secret was committed; no remote push was made.

### S1-08 — Database Schema

- **Branch:** `feature/S1-08-database-schema`, created from the local S1-06 environment branch.
- On the owner's direction to select recommendations, implemented typed native-driver documents and the initial 14-collection baseline with `ObjectId` references, UTC BSON `Date` timestamps, integer minor-unit money fields, and named tenant-oriented indexes. The technical choices are documented as recommendations; the owner separately approved global Customer identity with restaurant-scoped operational records.
- Added normalized email lookup, unique identity/table/staff/bill constraints, and an idempotent index bootstrap after MongoDB connects. Startup logs remain URI-safe and falls back to liveness-only mode if connection or schema bootstrap fails.
- Added schema/index-plan tests and the S1-08 architecture schema document. No MongoDB JSON Schema validators or migrations were added because exact workflow validation remains pending.
- **Validation on Node `24.21.0`:** 8 backend tests, Biome lint, TypeScript typecheck, production build, and `npm audit --audit-level=high` passed; zero vulnerabilities. The fake-database test verified startup index initialization. This environment has no Docker daemon or `mongod`, so a live MongoDB bootstrap could not be tested.
- **Status:** In Progress pending live MongoDB verification. Work remains local; no remote push was made.
