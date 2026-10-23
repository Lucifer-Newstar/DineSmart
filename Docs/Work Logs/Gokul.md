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
- The Customer feed is filtered by the signed-in recipient across restaurants. Reception, Manager, and Administrator are filtered by both their signed restaurant and own recipient ID; Kitchen Staff has no notification access. API responses omit `recipientUserId`. These unspecified scope/read-state details are documented as team recommendations.
- **Gokul-authored commits:** `33d885f` (persistence/service and tests), `35adbaf` (authenticated feed/read routes and tests), and `921c1cd` (feed-truncation and staff-scope coverage). Navin separately committed the security permission and shared app/schema/docs integration.
- **Validation:** Node 24.21.0 (invoked via `npm exec --package=node@24.21.0`) backend lint, typecheck, production build, and production-dependency audit passed; all 111 backend tests passed. Notification-specific repository/service/router/app/auth/schema coverage passed using fakes and local HTTP tests.
- **Outstanding:** Docker/`mongod` is unavailable, so MongoDB persistence and index creation were not live-tested. Automatic critical-incident-to-recipient generation, WebSocket delivery/reconnect (S2-13), retention/TTL, dashboard UI connection, and browser E2E remain outstanding; AC-08 is not claimed as met. S2-06 remains independently In Progress.
- **Delivery:** S2-10 is Ready to Push on local `main`; no remote is configured, so no push, GitHub CI run, or merge occurred.

### 2026-10-11 — S2-16 Staff Management HTTP/security tests started

- Joined S2-16's local implementation on `main` as a genuine test contribution while Jegatheesan owns the backend feature repository/service and Navin owns shared contract/app integration.
- Own the route-level security/validation tests for `GET /staff` and `PUT /staff/{id}`: Manager/Administrator permissions, signed tenant scope, strict fields/path IDs, safe serialization, self-deactivation guard, and absent/cross-tenant non-disclosure.
- This assignment adds test coverage to the documented recommendation; it does not change S2-16's primary backlog owner or imply an additional team-approved API decision.

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

### S2-12 — Waitlist incident rule tests

- Added `backend/test/incident-rules-waitlist.test.ts` (7 tests): default and validated queue thresholds (integer pairs, inverted-pair fallback), a short queue under every threshold, escalation to critical by count and by longest wait, table congestion when no free table can seat the largest waiting party, clearing once a large enough table frees up, an empty floor escalating to critical, quiet behaviour for short waits with no free table, and exclusion of seated/cancelled/no-show entries.
- Updated two existing fixtures for the widened rule set: the incident-service test now uses `staff_shortage` as its example of a type outside the rule set, because `table_congestion` became rule-managed.
- **Gokul test commit:** `be2c242`.
- **Validation via Node `24.21.0`:** backend 300/300 passed with Biome, typecheck, production build, and high-severity audit clean.
- These are fake-snapshot unit tests: no live MongoDB queue, wait-estimate formula, browser incident UI, remote CI, push, merge, or deployment is claimed.

### S3-12 — Deck guard tests

- Added `presentation/deck.test.mjs` (6 tests): eleven ordered slides each with a heading and real content, no absolute URLs/link/img/@import or CDN references, inline styles and script with all four controls and keyboard handlers and no network calls, honest-limits wording (advisory AI, unverified live services, payment boundary, deployment), every rule-managed incident type listed on slide 6, and a print stylesheet plus a presenter note on each slide.
- **Gokul test commit:** `b78db04`.
- **Validation via Node `24.21.0`:** 6/6 passed.
- These are static-content and structure checks. No visual design review, rehearsal, recorded demo, remote CI, push, merge, or deployment is claimed.

### S3-12 — Backup demo capture tool

- Added `tools/capture-demo.mjs`: it walks the browser-visible runbook steps with Playwright, clicks the dashboard sidebar item for section steps (sections are component state, not routes), records whether the navigation applied, and writes a self-contained `demo-capture/index.html` with every screenshot embedded as a data URI plus a `manifest.json` of URLs, viewports, click outcomes, and non-2xx responses. Playwright is installed on demand and is not a project dependency, so the tool degrades to a clear instruction message when it is missing.
- **Gokul tool commit:** `581a09e`.
- **Validation via Node `24.21.0`:** the tool captured 12 steps (1440x900 plus one at 390x844) with all four sidebar clicks applied; `presentation/deck.test.mjs` still passes 6/6.
- The capture is a screenshot walkthrough, not a video recording: no live MongoDB, signed-in Manager session, Gemini call, rehearsal, remote CI, push, merge, or deployment is claimed.

### S3-07 — Contract checker tests

- Added `tools/api-contract-check.test.mjs` (6 tests): mount parsing from `app.ts`, route scanning that ignores handler-internal `request.get("origin")`, frontend call extraction with the GET default and template paths, the live repository result (routes found, calls found, no unmatched calls, no unresolvable factories), per-call file attribution, and a resolved route table whose entries all point at real router files.
- **Gokul test commit:** `f9ee881`.
- **Validation via Node `24.21.0`:** 6/6 passed; `node tools/api-contract-check.mjs --strict` exited 0.
- These tests assert route and call-site shapes, not runtime behaviour: no payload validation, authenticated flow, live database, remote CI, push, merge, or deployment is claimed.

### S3-13 — Fallback branch tests

- Added `backend/test/ai-fallback.test.ts` (5 tests): queue congestion citing the queue, largest party, wait, and threshold; table congestion distinguishing no free table from no large enough table; both types degrading to generic, lower-confidence wording on an empty snapshot with non-empty action text; a serialized-output check for emails, phone-shaped strings, `undefined`, and `NaN`; and unchanged inventory/delay/reservation/unknown-type behaviour. This is the first dedicated unit coverage for the fallback builder, which was previously only exercised through the service tests.
- **Gokul test commit:** `76f3a9e`.
- **Validation via Node `24.21.0`:** 5/5 passed and the full backend suite passed 305/305.
- These tests build the context object directly: no live provider, quota, timeout, network failure, remote CI, push, merge, or deployment is claimed.

## 2026-10-23

### Review fixes

Review follow-up after the repository was published (environment, email, notifications and tests). My part:

- `0423a96` ci(S1-07): pin actions to full commit SHAs
- `8c68539` test(S1-11): cover the pre-registration takeover and pending sign-up expiry
- `6adba73` feat(S1-11): add SMTP and Resend email transports selected by EMAIL_PROVIDER
- `dc03673` test(S1-11): cover provider selection, SMTP and Resend delivery
- `b0c6629` feat(S1-06): make trust proxy configurable with TRUST_PROXY
- `836db21` test(S1-06): cover TRUST_PROXY parsing and the resulting req.ip
- `30faa9d` test(S1-13): cover the remote seed guard and the bootstrap command
- `380d0e5` test(S1-09): cover the token renewal timing and the 401 hook
- `0674b84` feat(S2-10): notify managers when an incident opens
- `4c9587b` test(S2-10): cover incident notifications and their recipients
- `8ba797b` feat(S2-10): replace the sample notification bell with the live feed
- `861fd12` test(S2-13): cover the realtime client and notification parsing
- `b0e7a3b` test(S2-18): cover the table list route and its tenant scope
- `6f4176b` test(S2-17): cover floor seating, transitions and response parsing
- `.env.example` files now list every production variable, with the Render/Vercel values in the [deployment checklist](../Developers%20Guide/Deployment.md).
- **Local verification via Node `24.21.0`:** backend 328 tests and frontend 50 tests pass; Biome, typecheck, both production builds and `npm audit --audit-level=high` are clean; `actionlint` passes.
- **Not verified live:** MongoDB Atlas, the email provider, Google sign-in, Gemini and the deployed WebSocket path still need a live check after deployment.
