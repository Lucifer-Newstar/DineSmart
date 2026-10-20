# Gokul — Work Log

## 2026-10-10

### S1-06 — Environment Variables

- **Branch:** `feature/S1-06-environment-variables`, stacked on `feature/S1-05-mongodb-atlas` because the backend environment already includes the local database URI.
- Added frontend and backend `.env.example` files with non-secret local defaults and blank placeholders for auth, Google OAuth, email-provider, and server-side Gemini settings. `EMAIL_PROVIDER=mock` remains the approved local default; the exact email provider and Gemini model are unset.
- Confirmed real `.env` and `.env.local` files remain ignored while `.env.example` files are committable. The backend already loads its local `.env` through `dotenv`; Next.js reads its standard frontend env files.
- **Validation:** checked ignore behavior and placeholder names; no real credentials were added. Existing backend lint, tests, typecheck, build, and audit checks remain clean.
- **Delivery:** committed locally; no remote push was made during this task.

## 2026-10-11

### S2-10 — Notification Module

- Implemented a trusted server-side notification creation service, MongoDB repository, bounded recipient feed, total unread count, and idempotent mark-read operation. Added authenticated `GET /api/v1/notifications` and `PATCH /api/v1/notifications/{id}/read` routes.
- The Customer feed is filtered by the signed-in recipient across restaurants. Reception, Manager, and Administrator are filtered by both their signed restaurant and own recipient ID; Kitchen Staff has no notification access. API responses omit `recipientUserId`. These unspecified scope/read-state details are documented as assistant recommendations, not separate owner approvals.
- **Gokul-authored commits:** `33d885f` (persistence/service and tests), `35adbaf` (authenticated feed/read routes and tests), and `921c1cd` (feed-truncation and staff-scope coverage). Navin separately committed the security permission and shared app/schema/docs integration.
- **Validation:** Node 24.21.0 (invoked via `npm exec --package=node@24.21.0`) backend lint, typecheck, production build, and production-dependency audit passed; all 111 backend tests passed. Notification-specific repository/service/router/app/auth/schema coverage passed using fakes and local HTTP tests.
- **Outstanding:** Docker/`mongod` is unavailable, so MongoDB persistence and index creation were not live-tested. Automatic critical-incident-to-recipient generation, WebSocket delivery/reconnect (S2-13), retention/TTL, dashboard UI connection, and browser E2E remain outstanding; AC-08 is not claimed as met. S2-06 remains independently In Progress.
- **Delivery:** S2-10 is Ready to Push on local `main`; no remote is configured, so no push, GitHub CI run, or merge occurred.

### 2026-10-11 — S2-16 Staff Management HTTP/security tests started

- Joined S2-16's local implementation on `main` as a genuine test contribution while Jegatheesan owns the backend feature repository/service and Navin owns shared contract/app integration.
- Own the route-level security/validation tests for `GET /staff` and `PUT /staff/{id}`: Manager/Administrator permissions, signed tenant scope, strict fields/path IDs, safe serialization, self-deactivation guard, and absent/cross-tenant non-disclosure.
- This assignment adds test coverage to the documented recommendation; it does not change S2-16's primary backlog owner or imply an additional owner-approved API decision.

### 2026-10-11 — S2-16 staff API route/security test contribution

- Implemented and committed the dedicated route-level security suite for the staff-management API as an S2-16 sub-scope, while Jegatheesan retained primary feature ownership and Navin handled shared integration.
- Tests cover Manager/Administrator access, Reception/Customer denial, bearer authentication, tenant derivation from the signed principal, query/body/path validation, forged tenant rejection, safe roster serialization, active-state/role updates, and the non-enumerating 404/self-deactivation error paths.
- **Gokul test commit:** `641fcc3` (`test(staff): verify route permissions and scope`). Targeted staff/auth/app coverage passed; final Node `24.21.0` full backend verification passed all 237 tests with Biome, typecheck, build, and high-severity audit clean.
- Live MongoDB, browser UI, remote CI, deployment, push, and merge remain unverified/deferred; S2-16 is **Ready to Push** locally, not Complete.

## 2026-10-12

### S3-06 — Customer workflow and app-composition integration tests

- Delivered a locally verifiable integration-test sub-scope on `main`, using the real public menu router, customer-order router, and `OrderService` with one shared in-memory menu/order repository.
- The customer workflow test browses the current public menu, places an order using only item IDs and quantities, verifies the server-derived integer-minor total and safe response, then reads the same order from authenticated history. Regression coverage changes menu availability after browsing and verifies the stale cart is rejected without a second write; another Customer cannot see or cancel the first Customer's order.
- Extended the `createApp` composition test to verify the reservation and AI recommendation read/generate endpoints are mounted and reject unauthenticated requests.
- **Gokul-authored commits:** `dc2eb8a` (`test(S3-06): integrate customer menu and order flow`) and `aaa9416` (`test(S3-06): cover app router composition for reservations and AI`).
- **Validation on Node `24.21.0`:** all 274 backend tests passed, including the four app/customer-workflow HTTP tests; Biome checked 150 files with no findings; TypeScript typecheck, production build, and high-severity dependency audit passed (zero vulnerabilities).
- **Limits:** integration repositories and auth verifier are fakes; the tests do not establish live MongoDB/index behavior, browser E2E, live Gemini, deployment, remote CI, push, or merge. S3-06's local test contribution is Ready to Push only; external acceptance remains outstanding.

### S3-07 — Frontend interactive-control regression test

- Took a substantive frontend test sub-scope on `main`: added a TypeScript AST regression test that scans the app's TSX/JSX components and fails if a JSX `onClick` uses an empty block-bodied callback. It guards against regressions like the inert sample-range control removed by Dhanush's S3-07 fix.
- **Gokul-authored test commit:** `e55b1d6` (`test(S3-07): guard against empty click handlers`).
- **Gokul-authored test commits:** `e55b1d6` (empty click handlers), `38348a0` (buttons must declare an explicit `type`), and `14519b6` (form controls must expose an accessible name through `aria-label`/`aria-labelledby` or a wrapping label with visible text; placeholders alone are rejected). Verified the guard by temporarily introducing one violation of each type, then removing the probe file.
- **Validation via Node `24.21.0`:** the three guards passed; the full frontend suite passed 23/23; Biome, typecheck, production build, and high-severity dependency audit passed.
- The overall S3-07 bug-fixing task remains **In Progress**. These static checks do not replace browser E2E/responsive acceptance or a live accessibility audit; no live API/database, remote CI, push, merge, or deployment is claimed.

### S3-10 — Performance test coverage

- Owned the test side of the S3-10 backend and frontend performance work on `main`.
- Backend: `backend/test/http-performance.test.ts` uses a raw HTTP client (Node's `fetch` always decompresses) to verify gzip negotiation on large public menus, uncompressed small menus and `identity` requests, JSON-only compression, `no-store` defaults across operational routes, and the menu success override. `backend/test/repository-projections.test.ts` records query options and fails when a read omits an explicit projection or projects a field the serializer does not use.
- Frontend: `frontend/test/dashboard-metrics.test.mjs` covers order filtering/counters/averages, empty and unknown-filter cases, bar scaling with custom floors, flat/empty series, incident feed state gating, and the capped `200+` count label.
- **Gokul test commits:** `f44e0aa`, `159a40a`, `268e51c`, `1c7b52b`, `3527515`.
- **Validation via Node `24.21.0`:** all 283 backend tests and all 29 frontend tests passed; both packages pass Biome, typecheck, production build, and high-severity dependency audit.
- These are unit/contract tests, not a load test: no p95 measurement, live database/index coverage, browser E2E, remote CI, push, merge, or deployment is claimed.

### S3-12 — Demo readiness preflight and fixture tests

- Built `tools/demo-readiness.mjs`, a dependency-free preflight that checks the demo documents, env examples, seed CLI, CI workflow, Node pinning, and absence of committed `.env` files; `--strict` makes it exit non-zero for CI use. Covered it with `tools/demo-readiness.test.mjs` using temporary fixture directories (complete repo, partially configured repo, empty repo, report formatting).
- Added `backend/test/demo-fixtures.test.ts` for Jegatheesan's fixture summary: accounts by role, per-collection counts, incident statuses/types, recommendation sources, and an assertion that the printed report never contains the demo password or a hash field.
- **Gokul-authored commits:** `3e7464f` (preflight script), `653ad71` (preflight tests), `9169140` (fixture summary tests).
- **Validation via Node `24.21.0`:** `node --test tools/demo-readiness.test.mjs` passed 4/4; the backend suite passed 286/286 with Biome, typecheck, production build, and high-severity audit clean.
- This is preparation work. No live demo, rehearsal, database run, remote CI, push, merge, or deployment has been performed.

### S3-07 — Browser triage and API error-contract tests

- Added `frontend/test/styles-contract.test.mjs`: `.sr-only` must stay anchored and clipped, `.table-scroll` must be a positioned scroller, and the four standalone text-control rules must declare `min-height >= 24px`; the skip-link and reduced-motion rules are asserted present.
- Added `backend/test/api-error-contract.test.ts`: the JSON 404 envelope for unknown versioned routes, `no-store` plus the envelope on malformed and oversized bodies, the private uncompressed liveness probe, and that protected routes never answer with HTML.
- **Gokul test commits:** `99dea5c`, `6be7c47`.
- **Validation via Node `24.21.0`:** frontend 32/32 and backend 290/290 passed; both packages pass Biome, typecheck, production build, and high-severity audit.
- The contrast finding from the browser pass is deliberately uncovered by tests: remediating it changes shared design tokens that are pending an owner decision.

### S3-10 — Projection and request-deadline tests

- Added `backend/test/repository-projections-reads.test.ts`, which replays the incident-context and table-status flows against a per-collection recording double and asserts the exact projection keys for each read, including the re-read after a lost conditional update.
- Added `frontend/test/api-client.test.mjs`: a fast response is forwarded untouched, a stalled request rejects with `ApiTimeoutError` after its deadline and aborts the socket, a caller abort keeps its own reason and wins over the deadline, an already-aborted signal rejects with the caller's reason, and timeouts/aborts/errors classify differently.
- **Gokul test commits:** `30f70bc`, `5a28526`.
- **Validation via Node `24.21.0`:** backend 293/293 and frontend 38/38 passed; Biome, typecheck, and both production builds are clean.
- These are unit/contract tests with stubbed fetch and recording doubles. No live database, real network timeout, browser E2E, remote CI, push, merge, or deployment is claimed.

### S1-07 — CI workflow guard tests

- Added `tools/ci-workflow.test.mjs`, a dependency-free guard (no YAML package) that reads the workflow line by line and asserts: least-privilege permissions, cancel-in-progress concurrency, no `pull_request_target` or piped shell installation, per-job timeouts, pinned checkout/setup-node actions with `persist-credentials: false`, Node pinning from `.nvmrc`, `npm ci` rather than `npm install`, the audit/lint/test/typecheck/build order with typecheck before build, the backend `hashFiles` gate, and the strict preflight command.
- **Gokul test commit:** `7caa246`.
- **Validation via Node `24.21.0`:** 6/6 tests passed; `node tools/demo-readiness.mjs --strict` exited 0 with 14/14 prerequisites satisfied.
- This checks the workflow definition, not an execution: no GitHub Actions run, remote, runner matrix, secret, artifact, or deployment verification is claimed.
