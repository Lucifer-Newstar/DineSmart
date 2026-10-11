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

### S1-13 — Development Seed Data

- **Branch:** `feature/backend`, the area branch stacked on the local auth/RBAC work.
- Added deterministic, fixed-ID sample records for Saffron & Co. across users, restaurant, customers, staff, menu, tables, inventory, reservations, orders/items, incidents, recommendations, notifications, and a bill. Demo Customer identity is global; operational records are restaurant-scoped.
- Added an idempotent native-driver seed command, initialized indexes before seeding, and restricted execution to `NODE_ENV=development` plus localhost/loopback or the local Compose service hostname. The fixture login password is explicitly local demo-only.
- **Implementation commit:** `548f3aa` (Jegatheesan).
- **Validation on Node `24.21.0`:** Biome, 27 backend tests, TypeScript typecheck, production build, and `npm audit --audit-level=high` passed; zero vulnerabilities. Unit tests validate fixture references, canonical collection names, deterministic IDs, and production/remote-target refusal. Docker/`mongod` are unavailable, so a live Mongo seed/re-run was not verified.
- **Status:** In Progress pending live local MongoDB seed and repeat-run verification. No remote push or merge was made.

### S2-06 — Inventory API foundation

- Added tenant-scoped `GET /api/v1/inventory` and `PUT /api/v1/inventory/:id` routes. Manager/Administrator receive full stock details and can set a manual non-negative count/optional threshold; Reception/Kitchen Staff receive availability-only data. Each read/write repository filter includes the signed restaurant ID; lists are name-sorted and capped at 2,000 records with a truncation flag. Orders do not auto-deduct stock.
- **Implementation commit:** `1086404` (Jegatheesan). Navin documented the recommended request/response and privacy contract in `e2c4e4e`; those contract details remain recommendations, not separate owner approvals.
- **Validation on Node `24.21.0`:** Biome, TypeScript typecheck, 41 backend tests, production build, `npm audit --audit-level=high` (zero vulnerabilities), and `git diff --check` passed. Fake-repository tests verify tenant filtering; live MongoDB integration remains unavailable.
- **2026-10-11 local closeout:** Rechecked frontend `npm ci`, Biome, TypeScript typecheck, production build, and audit (zero vulnerabilities); backend CI-equivalent Biome, typecheck, build, production-dependency audit, and all 111 backend tests also pass on Node `24.21.0`. The frontend has no automated test runner, so no browser E2E is claimed.
- **Status:** S2-06 is **Ready to Push** on local `main`. Live MongoDB persistence/index verification is deferred to the final database/deployment stage; no remote push or merge was made.

## 2026-10-11

### S2-03 — Reservation Module API

- Implemented authenticated `POST`, `GET`, and `PUT /api/v1/reservations` with customer-owned cross-restaurant reads/cancellation and tenant-scoped Reception/Manager/Administrator operations. Customer identity is derived from the active user; the request cannot forge `customerId` or status.
- Applied the approved 90-minute duration, 30-minute slots, table overlap/capacity checks, customer cancellation-before-start rule, and 15-minute no-show grace. Selected and documented additional assistant recommendations (party size 1–12, `Awaiting` request status, staff-confirmed table assignment, bounded notes, status transitions, response shape, and concurrency limitation) without describing them as separate owner approvals.
- Added a customer reservation-history index, Mongo repository/service/router, and service/HTTP/repository/schema tests. The table-overlap check is application-level and not atomic across API processes.
- **Implementation commit:** `02abcb4` (Jegatheesan).
- **Local validation on Node `24.21.0`:** backend `npm ci`, audit (zero vulnerabilities), Biome, typecheck, production build, and all 58 backend tests passed. Route/repository tests use injected/fake storage; Docker/`mongod` are unavailable, so live Mongo persistence and concurrent booking behavior remain unverified.
- **Delivery:** implementation committed locally on `main`; no remote push or GitHub Actions run was made. S2-03 is Ready to Push pending live MongoDB persistence/concurrency verification.

### S2-04 — Customer order API

- Added the Mongo-backed order repository and service for active-Customer profile resolution, active restaurant/menu checks, authoritative price/name snapshots, server-calculated integer-minor-unit totals, and bounded customer history across restaurants. New item records are inserted before the visible order header; failures trigger best-effort compensation.
- Enforced 1–20 distinct lines, 1–20 units per line, 50 total units, duplicate-ID rejection, safe arithmetic, and owner-only cancellation while `Created`. Cancellation conditionally matches order ID, Customer ID, current status, and observed `updatedAt` to avoid overwriting a concurrent acceptance.
- Added authenticated customer order create/history/cancel routes and service/repository/HTTP tests. Shared Customer profile logic is reused; `orders:own:update` permission and app mounting were integrated by Navin.
- **Implementation commits:** `f74c728` (repository/snapshots/history), `3b9a0c0` (service/cart validation/cancellation), `dd169ef` (HTTP endpoints), and `e02bd14` (customer response excludes kitchen-only state), Jegatheesan.
- **Local validation on Node `24.21.0`:** all 79 backend tests passed; Biome, TypeScript typecheck, production build, `npm audit --audit-level=high` (zero vulnerabilities), and `git diff --check` passed. Repository tests use fakes; Docker/`mongod` are unavailable, so live MongoDB persistence/index behavior remains unverified.
- **Status:** S2-04 API work is Ready to Push on local `main`, pending live MongoDB verification and integration E2E. No remote push or GitHub Actions run was made.

### S2-05 — Kitchen Queue and staff order progression

- Implemented a tenant-scoped, oldest-first kitchen queue limited to 200 active tickets with `truncated`, item-only preparation data, and no customer contacts/prices. Added conditional item `Created → Preparing → Ready` updates and parent-header derivation (`Accepted → Preparing → Ready`); idempotent retries re-run header synchronization across the separate MongoDB documents.
- Added tenant-scoped staff order progression (`Created → Accepted`, `Ready → Served`, `Served → Completed`) with status/`updatedAt` compare-and-set. Direct staff cancellation, payment/tax, fulfillment/table assignment, and auto-stock deductions remain out of scope; dashboard wiring is a separate S2-07 story and has since been implemented locally.
- Recorded detailed endpoint rules as assistant recommendations, not separate owner approvals. Identified Reception's missing `orders:write` grant despite the approved order-update matrix; Navin integrated the recommended permission and regression coverage.
- **Implementation commits:** `bd46f2f` (tenant-scoped repository/service/types) and `dad0024` (staff HTTP routes), Jegatheesan. **App/RBAC integration commit:** `4e550bc`; **contract/status documentation commit:** `ccefeba`, Navin.
- **Validation on Node `24.21.0`:** backend Biome lint, TypeScript typecheck, production build, `npm audit --audit-level=high` (zero vulnerabilities), all 92 tests, and `git diff --check` passed. Tests use fakes; Docker/`mongod` are unavailable, so live MongoDB persistence/index/concurrency/crash recovery is not verified. No browser/dashboard E2E was run.
- **Status:** S2-05 is Ready to Push on local `main`, not Complete. No remote is configured; no push, GitHub Actions run, or merge occurred.

### S2-07 — Tenant-scoped staff order feed API

- Closed the missing staff list-route gap with `GET /api/v1/orders`, separate from Customer `/orders/history`. The route uses `orders:read` plus signed tenant scope, ignores no client filter silently (query parameters are rejected), and returns up to 200 oldest-first active orders with `truncated`.
- The service selects statuses server-side: Reception/Manager/Administrator receive `Created`, `Accepted`, `Preparing`, `Ready`, and `Served`; Kitchen Staff receive only `Accepted`, `Preparing`, and `Ready`. Parent and child reads include `restaurantId`. The response omits customer identity/contact data, prices, and totals.
- **Implementation commit:** `d616080` (Jegatheesan). Added repository/service/router tests for tenant/status filtering, role-specific status sets, result caps, query rejection, unauthenticated/Customer denial, and safe serialization.
- **Local validation on Node `24.21.0`:** backend Biome lint, TypeScript typecheck, production build, and all 115 backend tests passed. Tests use fakes; no live MongoDB/index validation occurred.
- **Status:** S2-07 is **Ready to Push** on local `main` after backend and dashboard code checks. The assistant-recommended split leaves analytics/incidents and broader role-workflow review to S2-09/S2-12/S2-11; no live MongoDB or browser E2E result is claimed. Live DB/index validation is deferred to the final database/deployment stage; no remote push, CI run, or merge occurred.
