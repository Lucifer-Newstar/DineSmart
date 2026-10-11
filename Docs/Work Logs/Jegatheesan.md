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
- **Status:** S2-07 is **Ready to Push** on local `main` after backend and dashboard code checks. S2-09 analytics is now implemented separately; incident reporting/rules remain under S2-12 and broader role-workflow review remains under S2-11. No live MongoDB or browser E2E result is claimed. Live DB/index validation is deferred to the final database/deployment stage; no remote push, CI run, or merge occurred.

### S2-09 — Tenant-scoped Analytics API

- Implemented `GET /api/v1/analytics` with Manager/Administrator `analytics:read`, signed-principal tenant scope, strict `7d`/`30d` validation, restaurant-local daily/hourly buckets, operational order/reservation/prep/stock summaries, and per-collection 2,000-record caps with explicit truncation. No guest PII or financial subtotal is returned.
- Added the Mongo repository, aggregation service, protected router, and fake-backed tests for tenant filters, role/auth/query behavior, bounded sampling, local-time/UTC fallback, operational values, and unavailable responses. Navin mounted the route and added an app-level protected-route assertion.
- **Implementation commit:** `bb8d8dd` (Jegatheesan). **API mount/test commit:** `d9f2e3b` (Navin).
- **Local validation on Node `24.21.0`:** backend Biome checked 96 files; TypeScript typecheck and production build passed; all 131 backend tests passed; backend `npm audit --audit-level=high` reported zero vulnerabilities; `git diff --check` passed. Mongo repositories were tested with fakes; no Docker/`mongod` or live MongoDB/Atlas verification was available.
- **Status:** S2-09 is **Ready to Push** on local `main`, not Complete. Live MongoDB/Atlas/index checks, deployment, browser E2E, remote CI, push, and merge remain unverified/deferred to their proper stages.

### 2026-10-11 — S2-14 Billing APIs started

- S2-14 is now In Progress on local `main`. No new branch was created; the configured repository has no remote or upstream, so a pull could not be completed.
- Reviewed the existing `BillDocument`, unique `(restaurantId, orderId)` index, Manager/Administrator `bills:write` and `bills:read`, Customer `bills:own:read`, endpoint inventory, and order/item snapshot model.
- Implement the billing module and fake-backed service/repository/HTTP tests under my Git identity. Use the documented recommendation only: signed tenant for staff; own-order checks for Customers; idempotent one-bill-per-order generation from persisted snapshots; tax/adjustments zero; no payment or settlement lifecycle. These specifics are not separate owner approvals.
- Live MongoDB/Atlas persistence and index verification remain deferred; no credentials, deployment, push, or remote CI are part of this local item.

### 2026-10-11 — S2-14 Billing APIs local implementation and closeout

- Implemented the Mongo bill repository, service, and authenticated `POST /api/v1/bills`, `GET /api/v1/bills/{id}`, and `GET /api/v1/bills/order/{orderId}` routes. Manager/Administrator writes and tenant-scoped reads derive restaurant scope from the verified principal; Customer reads resolve the active global profile and verify ownership through the order. Reception/Kitchen Staff cannot read or issue bills.
- Generation accepts only `{ orderId }`, supports same-tenant orders in `Ready`, `Served`, or `Completed`, snapshots persisted order-item names/quantities/prices, verifies the integer-minor subtotal against the order total, sets tax/adjustments to zero, and does not mutate the order. The existing unique tenant/order index supports idempotent one-bill-per-order generation, including duplicate-key races; existing bills are not overwritten.
- No bill listing/edit/void, payment capture/provider, tax/discount policy, or settlement lifecycle was introduced. The selected eligibility and zero-tax/adjustment behavior remain documented recommendations, not separate owner approvals.
- **Jegatheesan implementation commits:** `8f534e6` (types, Mongo repository, service and unit tests) and `dd8d453` (protected HTTP routes and role/scope tests). **Navin shared app integration:** `bd34229`. S2-14 contract/status documentation and final verification are recorded separately.
- **Local verification via Node `24.21.0`:** clean `npm ci` installed 160 packages with zero vulnerabilities; Biome checked 122 backend files; typecheck and production build passed; all 194 backend tests passed, including 22 new billing tests; `npm audit --audit-level=high` found zero vulnerabilities; `git diff --check` passed. The base shell Node remains `20.20.2`; commands explicitly used `npm exec --yes --package=node@24.21.0`.
- Tests use fakes and do not prove live MongoDB persistence, unique-index enforcement, Atlas, or cross-process race behavior. Docker/`mongod` are unavailable in this workspace; live DB/index verification remains deferred to the final database/deployment stage. No remote CI, push, or merge occurred.
- **Status:** S2-14 is **Ready to Push** on local `main`, not Complete. No remote/upstream is configured; the preceding `git pull --ff-only` attempt could not fetch updates. Deployment and Atlas work remain deferred until the project's other work is finished.

### 2026-10-11 — S2-16 Staff Management API started

- Continued sequentially on local `main` after S2-15's Ready to Push checkpoint; S2-16 is In Progress and remains assigned to Jegatheesan.
- Reviewed the sparse `GET /staff` and `PUT /staff/{id}` inventory, existing `StaffDocument`, auth `UserDocument`, Manager/Administrator `staff:read`/`staff:write` permissions, and 15-minute access-token/refresh-session rules.
- Implement a tenant-scoped bounded roster and safe role/active-state updates for existing staff only; no invitation/creation, shift/scheduling, payroll, contact editing, or staff deletion. The two-document update and session-watermark choices are recommendations, not separate owner approvals.
- Gokul is assigned a real sub-scope: the HTTP/security test suite for route validation, role gates, signed-tenant isolation, and safe responses. Shared endpoint/architecture docs and app composition remain Navin-owned.
- Live MongoDB/Atlas verification, deployment, push, and remote CI remain deferred/unavailable; tests will use repository fakes.

### 2026-10-11 — S2-16 Staff Management API local closeout

- Implemented `GET /api/v1/staff` and `PUT /api/v1/staff/{id}` for Manager/Administrator using only the signed restaurant scope. The bounded 500-member roster joins minimal auth-user fields and omits hashes/OTP/session secrets. Updates allow only a supported staff role and/or active state; no invitation/create, schedule, payroll, contact edit, or delete workflow was added.
- Kept the auth `users` document authoritative and synchronized its linked `staff` membership. Optimistic user updates, same-tenant membership filters, safe not-found responses, a self-deactivation guard, and a `refreshSessionsInvalidBefore` watermark prevent old refresh families from reviving after role changes/deactivation/reactivation. Access JWTs remain stateless and usable until their existing 15-minute expiry.
- **Jegatheesan implementation commits:** `ddfd32e` (types, Mongo repository/service, schema/session-watermark changes and unit tests) and `9326e13` (protected router). **Gokul route/security tests:** `641fcc3`. **Navin app integration:** `d3304f8`.
- **Local verification via Node `24.21.0`:** Biome checked 135 backend files with no findings; typecheck and production build passed; all 237 backend tests passed; `npm audit --audit-level=high` reported zero vulnerabilities; `git diff --check` passed. The base shell Node remains `20.20.2`.
- Cross-collection changes cannot be transactional on the selected standalone local MongoDB. Fake-backed tests exercise filters/failure paths, but no live MongoDB/Atlas, browser UI, remote CI, deployment, push, or merge is claimed.
- **Status:** S2-16 is **Ready to Push** on local `main`, not Complete.

### 2026-10-11 — S2-17 Waitlist Management API started

- Continued sequentially on local `main` after S2-16's Ready to Push checkpoint; S2-17 is In Progress and remains assigned to Jegatheesan.
- Reviewed the sparse `GET /waitlist` and `POST /waitlist` inventory, existing Reception/Manager/Administrator permissions, the approved FIFO/manual-promotion workflow, guest/customer profiles, and current table-state fields.
- Recommend a bounded signed-tenant walk-in queue plus a staff-only update to seat/cancel/no-show entries. Seating must be staff-directed, same-tenant, table-capacity-safe, and linked to an available table; it is not automatic seating or guest notification. These request/status details are recommendations, not separate owner approvals.
- Shared API/architecture/test-plan docs and later app composition remain Navin-owned. Live MongoDB/Atlas and multi-document allocation behavior remain unverified; no deployment, push, or remote CI is planned.

### 2026-10-11 — S2-17 Waitlist Management API local implementation

- Implemented the assistant-recommended tenant-scoped walk-in waitlist contract: FIFO `GET`, validated `POST`, and staff-directed `PUT` resolution to seated/cancelled/no-show; no automatic seating, wait estimate, or notification was added.
- Added the native-driver waitlist document/repository/service/router, bounded guest fields, signed-restaurant filters, conditional table allocation with `currentWaitlistId`, conditional waitlist resolution, and compensating rollback for stale/failed seating writes.
- Added repository, service, and HTTP tests for tenant/role gates, FIFO/cap, body/path/query validation, capacity and table state, stale/conflicting writes, compensation, and safe errors. Schema/index and seed fixtures are covered locally.
- Verification on Node `24.21.0`: Biome checked 142 backend files; typecheck and production build passed; all 257 backend tests passed; high-severity `npm audit` found zero vulnerabilities; `git diff --check` passed. S2-17 is Ready to Push on local `main`, not Complete.
- Live MongoDB/Atlas index/write behavior, multi-process table allocation, browser workflow, remote CI, deployment, push, and merge remain outstanding/deferred.

### 2026-10-11 — S2-18 Table Status API started

- Continued sequentially after committing S2-17 as Ready to Push on local `main`; S2-18 is In Progress and remains assigned to Jegatheesan.
- Reviewed the endpoint inventory (`PUT /tables/{id}/status` only), existing `tables:write` permissions, seeded lowercase table states, reservation/order assignment pointers, S2-17's `currentWaitlistId`, and S2-08/S2-12 table-change hooks.
- The assistant-recommended contract uses an explicit status transition graph, signed-tenant `PUT`, and safe release rules for terminal reservation/order links and verified seated waitlist links. These details are recommendations, not separate owner approval.
- Feature repository/service/router tests are next. Live MongoDB/Atlas and cross-collection consistency remain unverified; no deployment, push, or remote CI is planned.
