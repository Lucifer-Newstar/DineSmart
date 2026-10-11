# Andhrímnir Test Plan and Acceptance Criteria

## Andhrímnir – Test Plan & Acceptance Criteria

Project: Andhrímnir – AI Incident Intelligence Platform for Restaurants
Purpose: Define the testing strategy, test scope, test cases, and acceptance criteria for the MVP based on the finalized Product Vision, SRS, SDD, Sprint Backlog, and VibeAthon requirements.

## 1. Test Objectives

- Verify all MVP functional requirements operate correctly.
- Validate authentication, customer workflows, dashboard, incident detection, AI recommendations, and notifications.
- Ensure integration between frontend, backend, database, and AI services.
- Confirm security, performance, usability, and deployment readiness.
## 2. Test Scope

| Module | Included | Priority |
| --- | --- | --- |
| Authentication | Email/OTP registration, Email/Password login, Google OAuth, JWT, RBAC | High |
| Customer Portal | Menu, Reservations, Orders | High |
| Restaurant Dashboard | Orders, Inventory, Analytics, Health Score | High |
| Incident Detection | Delays, Congestion, Shortages | High |
| AI Engine | Recommendations & summaries | High |
| Database schema | Typed collections, restaurant tenancy, index bootstrap and constraints | High |
| Database fallback | Cached reads and read-only/degraded mode | High |
| Notifications | Customer & manager alerts | Medium |
| Deployment | Frontend, Backend, Database | High |

## 3. Test Types

- Unit Testing: Individual services, utilities and APIs.
- Integration Testing: Frontend, backend, MongoDB and Gemini integration.
- System Testing: Complete end-to-end workflows.
- Performance Testing (p95): Dashboard <2s, API <500ms, incident detection <5s, AI response <10s; workload/concurrency and dataset size remain to be specified.
- Security Testing: Authentication, authorization, JWT, input validation.
- User Acceptance Testing: Validate business workflows against acceptance criteria.
## 4. Functional Test Cases

| ID | Feature | Test Scenario | Expected Result | Priority |
| --- | --- | --- | --- | --- |
| TC-01 | Authentication | Register with Email/OTP; verify; log in with Email/Password | Pending Customer becomes active only with a valid unexpired code; resend cooldown and five-attempt limit are enforced; login succeeds after verification | High |
| TC-02 | Google OAuth | Submit a signed Google ID token for a verified email linked to an active user | Backend verifies token audience/signature, links the stable subject, and starts the standard session | High |
| TC-03 | Digital Menu | View menu and availability | Available items displayed | High |
| TC-04 | Reservations | Create reservation | Reservation saved and visible | High |
| TC-05 | Orders | Place order | Order lifecycle starts | High |
| TC-06 | Kitchen | Read the tenant queue, advance item preparation, and progress front-of-house order status | Only `Accepted`/`Preparing`/`Ready` tickets appear; item updates follow `Created → Preparing → Ready`, derive the parent header, and staff roles can only apply their permitted lifecycle transitions | High |
| TC-07 | Inventory | Cross each item's low-stock and depletion thresholds | Rule-managed incident record is created or updated with warning/critical severity; notification delivery is not implied | High |
| TC-08 | Incident Engine | Kitchen delay simulation | Incident created with severity | High |
| TC-09 | AI | Generate recommendation | Explainable recommendation returned | High |
| TC-10 | Health Score | Successful order, kitchen, inventory, reservation, or incident persistence; hourly active-tenant sweep; GET after cache expiry | A tenant refresh is requested after writes and persisted incident changes, the hourly sweep recalculates active restaurants, and a cache miss/expiry recalculates on GET without persisting a score | Medium |
| TC-11 | Notifications | Critical incident | Manager notified | Medium |
| TC-12 | Analytics | Request 7/30-day operational reports as authorized and unauthorized roles; view live, empty, and unavailable UI states | Signed-tenant scope and role gate hold; local-time charts/summaries match API data, capped samples are disclosed, and failures never become fabricated/live revenue figures | Medium |
| TC-13 | Database fallback | Disable database after cache is warmed | Menu/dashboard show stale-data banner; writes fail clearly and are not queued | High |
| TC-14 | JWT sessions | Login, refresh, replay a rotated token, then logout | Access token is short-lived; refresh cookie is HttpOnly; replay revokes the session family; logout revokes | High |
| TC-15 | Access middleware | Call a protected test route with missing, invalid, and valid bearer tokens | Missing/invalid tokens are rejected; a valid token attaches the authenticated principal | High |
| TC-16 | Notification API | Persist a trusted in-app notice, retrieve the bounded recipient feed, then mark it read | Only the authenticated recipient can see/mark it; unread count, truncation, and idempotent read timestamp are correct | Medium |
| TC-17 | Inventory API | Read inventory as each staff role and set a manager stock count | Signed-tenant filtering, role-based detail redaction, count/threshold validation, and server timestamps are correct | High |
| TC-18 | Staff order feed | Retrieve `/orders` as Reception, Manager, Administrator, and Kitchen Staff | Signed tenant scope, server-selected per-role statuses, bounded ordering, safe fields, and Customer denial are correct | High |
| TC-19 | Staff dashboard order workflow | Exercise the live Orders and Kitchen views by role against a configured API/database | Reads remain tenant-scoped; authorized accept/serve/complete and item preparation updates persist; unsupported/unavailable states remain explicit | High |
| TC-20 | Role-based dashboards | Sign in as Customer, Reception, Kitchen Staff, Manager, and Administrator; switch Manager/Admin identities or tenants while Insights/Analytics is selected | Navigation and actions match the approved role matrix; Customers see only their own history; Reception/Kitchen see availability-only stock; stale sections and prior-tenant recommendations/review state/analytics are not rendered; server authorization remains authoritative | High |
| TC-21 | Incident rules, lifecycle, and API | Simulate approved delay/congestion thresholds, inventory and reservation conflicts; repeat a triggered condition, clear it, recur, truncate source data, and call `/incidents` by role | Severity follows configured/default thresholds; an active incident updates, resolves only on complete evidence, recurrence gets a fresh ID; reads are tenant/role scoped, bounded, and reject filters; unavailable waitlist-dependent rules are not inferred | High |
| TC-22 | Billing API | Generate a bill for an eligible order, repeat concurrently, read by ID/order as scoped staff and the owning Customer, then attempt invalid/out-of-scope access | One immutable bill per tenant/order uses persisted snapshots; integer-minor subtotal matches the order; only Manager/Administrator can issue; Customers see only their own order bills; payment/tax capture is not implied | High |
| TC-23 | Staff Management API | List and update staff as Manager/Administrator; attempt self-deactivation, role escalation to Customer, invalid fields, and cross-tenant IDs | Tenant-scoped safe roster; only permitted role/active changes persist; stale refresh sessions are rejected and the current access-token expiry bound is respected | High |
| TC-24 | Password Reset API | Request and confirm a reset as eligible/ineligible users; exercise cooldown, attempt/IP limits, origin, and refresh-session invalidation | Generic account-safe request response; single-use HMAC-backed code and Argon2id replacement; no new session; provider remains fail-closed in production and reset/session behavior follows the documented security limits | High |

S2-08's local TC-10 coverage uses fake-backed scheduler/repository/service tests to verify one-hour expiry, operational-event invalidation, active-tenant sweeps, and tenant-scoped API behavior. It does not demonstrate live MongoDB/Atlas behavior; those checks are deferred to the final database/deployment stage. Scores are held only in process memory, not persisted. S2-10's local TC-16 coverage validates persisted retrieval/read-state behavior with fake-backed repositories and HTTP tests. It does **not** demonstrate automatic critical-incident notification dispatch because the event-to-recipient policy remains open. S2-13's backend WebSocket transport now has local route/gateway/hub tests, but this does not verify live MongoDB delivery, browser reconnect, or a notification UI; TC-11 and acceptance criterion AC-08 remain outstanding. S2-06's TC-17 covers the inventory API; TC-07's low-stock detection is now locally implemented under S2-12, but live database behavior and delivered alerts remain unverified. S2-09's local TC-12 verification covers the protected tenant-scoped analytics API and live operational chart states, but it is not a browser E2E or MongoDB integration run. S2-12's TC-08/TC-21 coverage uses fake-backed rule, repository, service, scheduler, and HTTP tests for threshold boundaries/escalation, current-data incident rules, tenant scope, bounded responses, deduplication, condition-based resolution, fresh-ID recurrence, notification hooks, and incomplete-scan safeguards. The supported rules, incidents API, and event/time-based reevaluation pass local checks; live MongoDB/index behavior, Atlas, multi-replica timing, p95 performance, browser incident UI, and critical-incident delivery are not verified. Waitlist-dependent queue/table congestion and staffing rules remain unavailable, and the wait-estimate formula remains undecided.

## 5. Non-Functional Testing

- Dashboard p95 load time is under 2 seconds.
- REST API p95 latency is below 500 ms.
- Incident detection p95 completion time is under 5 seconds.
- AI recommendation p95 response time is under 10 seconds.
- Responsive UI on desktop and mobile.
- Graceful handling of AI/API failures.
## 6. Acceptance Criteria

| ID | Acceptance Criterion |
| --- | --- |
| AC-01 | Users can register with Email/OTP and log in using Email/Password or Google OAuth. |
| AC-02 | Role-based access restricts features appropriately. |
| AC-03 | Customers can browse menu, reserve tables and place orders. |
| AC-04 | Restaurant staff can manage orders, reservations and inventory. |
| AC-05 | Incident Detection Engine detects delays, shortages and congestion. |
| AC-06 | AI Recommendation Engine generates contextual recommendations. |
| AC-07 | Restaurant Health Score updates based on operational metrics. |
| AC-08 | Notifications are delivered for critical incidents. |
| AC-09 | Dashboard displays analytics, incidents and operational status. |
| AC-10 | Application is deployed publicly with working frontend and backend. |
| AC-11 | All critical defects resolved before submission. |
| AC-12 | README, documentation and presentation are complete. |
| AC-13 | Database failure produces cached read-only behavior; writes are not accepted or queued, and normal operation resumes after recovery. |

S2-12 locally implements and tests current-data detection for kitchen/order delays, active-kitchen congestion, inventory shortage, and reservation conflicts, plus the protected tenant-scoped incidents API. AC-05 remains only locally covered for this supported subset: waitlist-dependent queue/table congestion and staff-shortage detection lack inputs, live MongoDB/Atlas behavior is unverified, and full acceptance demonstration remains outstanding. S2-09 covers operational analytics and S2-12 supplies the incidents API, but an incident dashboard UI and full acceptance demonstration remain outstanding; AC-09 is not claimed complete.

## 7. Exit Criteria

- 100% Must-Have features pass.
- No Critical or High severity defects remain.
- Core user stories demonstrated successfully.
- Application deployed and accessible.
- Documentation finalized.

## 8. S1-08 Database Schema Verification

- Backend unit tests verify that every collection has named indexes, operational collections have an index beginning with `restaurantId`, selected identity/domain constraints are unique, email lookup normalization is applied, and startup requests the full index plan.
- These tests validate the declared plan using a fake MongoDB `Db`; they do not prove MongoDB accepted or built the indexes.
- Before moving S1-08 to **Ready to Push**, run the configured local MongoDB Compose service and verify startup index creation against a live instance. Docker/`mongod` are not available in the current workspace, so that check remains outstanding.
- Workflow-level validation (for example, cross-restaurant access, reference ownership, amount/quantity ranges, and reservation conflicts) must also be exercised by the corresponding service/API tests. TypeScript document interfaces alone do not enforce persisted data.

## 9. S1-09 Authentication Verification

- Unit tests cover Argon2id hashing/verification, generic invalid-credential handling, normalized email lookup, access-token claims/expiry, opaque refresh-token hashing, rotation, replay revocation, and logout.
- HTTP tests cover the versioned login/refresh/logout routes, HttpOnly cookie delivery, absence of refresh tokens from JSON, exact-origin rejection, and bearer middleware behavior.
- Current route tests use a fake repository. Run the login/refresh/logout flow with a live MongoDB instance before treating persistence behavior as integration-tested; this workspace has no Docker/`mongod`.
- The access token is returned to the client for memory-only storage. Frontend credential inclusion and protected-route/RBAC coverage remain pending their corresponding stories.

## 10. S1-10 Google OAuth Verification

- Unit tests use an injected verifier to cover verified-email linking to an existing active account, rejection of unverified/unregistered identities, and standard session issuance.
- The production adapter uses `google-auth-library` to verify Google ID-token signature, issuer, audience, and expiry against `GOOGLE_CLIENT_ID`.
- No Google project/client ID or live signed credential is available in this workspace. Before marking S1-10 **Ready to Push**, validate the configured frontend client ID and backend audience against a real Google Identity Services credential. Do not commit a client secret.

## 11. S1-11 Email OTP Verification

- Unit tests cover six-digit code generation, keyed/domain-separated OTP hashing (no raw code stored), 10-minute expiry policy, 60-second resend cooldown, five invalid-attempt lockout, pending-to-active transition, session issuance, and 12-character/1024-byte password bounds.
- HTTP tests cover registration and verification, HttpOnly session cookie delivery, and development-only `developmentCode` exposure through the mock provider.
- The mock mailer is intentionally unavailable in production. No real email provider or live MongoDB is configured; verify provider delivery, atomic update semantics, indexes, and complete registration-to-login flow before closing S1-11.

## 12. S1-12 Role-Based Access Control Verification

- Unit/HTTP tests verify unauthenticated rejection, allow/deny behavior for the approved MVP role matrix, manager-only incident resolution, kitchen queue access, and customer-owner checks.
- Operational middleware rejects a client-supplied `restaurantId` from path, query, or body when it differs from the signed principal; Customer principals cannot use restaurant-scoped routes. Repository methods must still filter every operational read/write by `restaurantId`, and customer services must apply owner conditions.
- Locally tested product routes now include inventory, health score, AI recommendations, and reservations. Their route/repository tests verify role permissions and tenant/owner filters; service-specific workflow checks are recorded below. Other operations routes remain pending. Each new route must apply both permission and tenant/owner checks; RBAC is not integrated based only on the middleware tests.

## 13. S1-13 Seed Data Verification

- Unit tests validate stable fixture IDs, required sample roles/workflows, restaurant-scoped operational records, seeded local demo recommendation labels, and rejection of production or remote database targets.
- The seed command upserts known fixture IDs into the canonical collection names after the index bootstrap. A live local MongoDB run and repeat-seed check remain pending because Docker/`mongod` are unavailable.

## 14. S3 AI Recommendation Verification

- Unit tests verify tenant-scoped incident lookup, whitelisted/bounded operational context, removal of customer IDs/email/phone-like values, and omission of direct customer identity from the prompt.
- Prompt/provider tests validate the structured JSON schema, locally validate output fields/ranges, require priority to match incident severity, and reject malformed/escalated output.
- Failure-path tests verify deterministic incident-specific recommendations when the API key is absent or provider errors/timeouts/invalid output occur. Fallback responses are persisted with `source=fallback` and remain advisory.
- HTTP tests verify Manager-only generation, tenant-scoped retrieval, and no direct browser-to-Gemini integration. The production SDK call is not live-tested because no Gemini API key is configured; MongoDB persistence/index and live route verification remain pending.

## 15. S2-03 Reservation Verification

- Backend service tests cover Customer-profile resolution, 90-minute duration, 30-minute slot validation, future-time and operating-hour checks, party-size/notes bounds, capacity and overlapping table conflicts, ownership-only cancellation, status transitions, and the 15-minute no-show grace period.
- HTTP tests cover Customer and staff permissions, signed-tenant scoping, cross-restaurant Customer identity, malformed timezone-qualified timestamps, IDs, and forged `customerId` rejection. Repository tests verify the tenant/owner filters, profile upsert, overlap query, and optimistic `updatedAt` update condition.
- Frontend booking requires an authenticated Customer, derives identity from the session, sends requests to the API, displays success only after an API response, and returns to `/book` after login/registration. Customer and staff dashboards distinguish live API data from sample/unavailable states; preview mutations are explicitly not saved.
- Current verification is local unit/HTTP testing plus frontend lint, typecheck, and production build. Run the booking/list/cancellation/assignment flows against live local MongoDB before treating persistence and concurrency behavior as integration-tested. This workspace has no Docker/`mongod`; table-overlap reads are not atomic across multiple API processes.

## 16. S2-04 Customer Order Placement Verification

- Public menu tests verify that only active restaurants and currently available tenant-owned items are returned, prices are represented in integer minor units, results are bounded, and malformed/unknown restaurant IDs fail safely.
- Order service/repository tests verify active Customer-profile resolution, active-restaurant scope, server-derived menu prices/currency/total and snapshots, quantity/line bounds, unavailable/cross-restaurant menu-item rejection, initial `Created` status, child-before-header write order, compensation after parent-write failure, conditional owner cancellation, and bounded cross-restaurant customer history.
- HTTP tests verify Customer-only create/history/cancel permissions, authenticated identity derivation, strict body/path validation, and response serialization without per-item kitchen preparation state. An app-level test confirms the public menu and protected order-history routers are mounted. Fake storage cannot prove MongoDB transaction, index, or persistence behavior.
- The customer `/menu` page fetches only the public API catalog, fails closed without preview products, rechecks server prices on submission, and carries an ID/quantity-only cart through login/registration in session storage. `/orders` reads own cross-restaurant history and sends cancellation only for `Created` orders. The frontend has no automated UI test runner; local coverage is Biome, TypeScript, and Next production build. Manually verify menu → cart → sign-in/registration return → persisted order → history/cancellation when services are available.
- Live MongoDB/Compose verification remains outstanding. The selected local standalone MongoDB target cannot transact the separate order and order-item writes; line-item-first insertion with compensating cleanup can leave orphan items after a process crash. Treat this as a known limitation until transaction/reconciliation behavior is validated.

## 17. S2-05 Kitchen Queue and Staff Order Progression Verification

S2-05 is **Ready to Push** on local `main`; the selected endpoint details are assistant recommendations, not separate owner approvals. The combined backend lint, typecheck, build, audit, and current 115-test suite pass locally; live MongoDB verification remains outstanding. The Orders and Kitchen dashboard views now consume these routes under S2-07 and the frontend is build-verified. Backend route tests cover role permissions; no manual browser E2E is claimed, and the broader role-focused UX review remains under S2-11.

- Queue repository tests verify a signed-tenant filter on parent and child records, status inclusion limited to `Accepted`, `Preparing`, and `Ready`, oldest-first order, and a 200-order cap with a `truncated` indicator. The service/HTTP serializers omit customer contact details and prices from kitchen responses.
- Kitchen route tests verify Kitchen Staff/Manager/Administrator access only, exact `{ itemId, preparationStatus }` request keys, valid `Preparing`/`Ready` target values, tenant derivation from the signed principal, and no serialized prices/customer contact data. Cross-tenant order or item IDs must not disclose records.
- Staff lifecycle tests verify Reception/Manager/Administrator may only request `Created → Accepted`, `Ready → Served`, and `Served → Completed`; Kitchen Staff and Customers cannot use this order-header operation. Reception requires the recommended `orders:write` grant, aligning implementation with the approved role matrix's order-update responsibility.
- Service tests verify item transitions `Created → Preparing → Ready`, header derivation (`Accepted → Preparing` on the first started item and `Preparing → Ready` when every item is ready), rejection of backwards/invalid transitions, and conditional updates using observed header `updatedAt` or item status. Retrying an already-applied item status must re-run header aggregation so it can repair a non-transactional partial update.
- Backend fakes/HTTP tests cannot prove live MongoDB races or crash recovery. Local standalone MongoDB cannot transact parent and item collections; an interrupted process after the item write may leave the header stale until an idempotent retry. Live MongoDB/index/concurrency verification is required before treating persistence behavior as integration-tested. No staff dashboard E2E is claimed.

## 18. S2-06 Inventory Verification

S2-06 is locally implemented and **Ready to Push** on local `main`; only live MongoDB/index verification is deferred to the final database/deployment stage. The endpoint and UI details are assistant recommendations, not separate owner approvals.

- Backend service/repository/HTTP tests verify signed-restaurant filtering, non-negative stock/threshold validation, role-specific response redaction, server-stamped adjustments, and bounded/sorted results.
- The dashboard loads live inventory for restaurant roles, supports retry and empty/truncated/unavailable states, and permits only Manager/Administrator adjustments. Preview edits remain explicitly unsaved; supplier integration and order-driven stock deduction are excluded.
- Node 24.21.0 frontend Biome, typecheck, production build, dependency audit, and backend lint/typecheck/build plus the current 115 backend tests passed locally. No frontend automated test runner or browser E2E is configured.
- Docker/`mongod` are unavailable here; live MongoDB persistence/index creation will be checked in the final database/deployment stage. Automatic low-stock incident generation belongs to S2-12 and remains unverified.

## 19. S2-10 Notifications Verification

S2-10's assistant-recommended contract is locally implemented and **Ready to Push** on local `main`. These recommendations are not separate owner approvals. Local service, repository, route, and app-mount tests cover the behavior below; no live MongoDB or remote CI verification was performed.

- Service tests verify trusted notification text trimming/bounds, unread creation, bounded 100-item recipient feeds, total unread counts, idempotent mark-read semantics, and a non-enumerating not-found result.
- Repository tests verify customer queries use authenticated `recipientUserId` across restaurants, staff queries include both `restaurantId` and recipient ID, unread queries include `readAt: null`, read updates preserve the first timestamp, recipient ID is omitted from safe records, and notification indexes are declared.
- Route tests verify Customer own-history access, signed-tenant/recipient staff scope, Kitchen Staff denial, client-filter rejection, empty mark-read bodies, invalid-ID handling, safe serialization, and unauthenticated rejection. An app-level test confirms the versioned routes are mounted.
- Local verification uses in-memory fakes; run schema bootstrap, creation/list/read, and isolation checks against local Compose MongoDB before treating persistence/index behavior as integration-tested. Docker/`mongod` are unavailable in this workspace.
- Automatic critical-incident notification generation, event-to-recipient mapping, retention/TTL, frontend notification integration/reconnect behavior, browser E2E, and live persistence remain outstanding. S2-13 now has a locally tested backend WebSocket transport; no incident-to-recipient policy or replay behavior is claimed. AC-08 is not claimed as met.

## 20. S2-07 Staff Orders and Kitchen Dashboard Integration

S2-07 is **Ready to Push** on local `main` after backend/frontend local checks. The assistant-recommended scope covers the dashboard shell and currently available operational flows; S2-09 analytics reads real tenant-scoped operational data, and S2-12 now provides supported-data backend incident rules/API but no incident dashboard presentation; S2-11 role-specific dashboard presentation is locally implemented, while browser E2E remains unverified. This scope split is not a separate owner approval. Live MongoDB validation is deferred to the final database/deployment stage; no browser E2E is claimed.

- Backend repository/service/HTTP tests verify the tenant filter on orders and item snapshots, oldest-first 200-record cap and truncation, server-selected `floor` versus `kitchen` status sets, permission/scope enforcement, Customer denial, strict no-query-filter behavior, and omission of customer IDs, prices, and totals.
- The authenticated Orders view reads `/api/v1/orders`; Reception/Manager/Administrator may accept, serve, and complete through the guarded status route. Preparation progress is item-level only. Kitchen Staff cannot change order headers.
- The Kitchen view reads `/api/v1/kitchen/queue`, displays only ticket/item data, and saves `Created → Preparing → Ready` item transitions through the existing queue route. Refresh/retry, loading/unavailable/preview labels, and unsaved local-preview actions are explicit.
- Node `24.21.0` local verification: backend Biome lint, typecheck, production build, and all 115 backend tests passed; frontend Biome, typecheck, and Next production build passed. Frontend role/access policy tests now run through the configured Node test script; TC-19 still requires manual/live-service verification and no browser E2E is claimed.
- No Docker/`mongod`, live database, browser E2E, remote CI, push, or merge verification occurred. The live persistence/index validation remains deferred with Atlas/deployment at the end.

## 21. S2-09 Analytics Charts Verification

S2-09 is locally implemented and **Ready to Push** on `main`; the assistant-selected contract is a recommendation, not separate owner approval. The implementation distinguishes live API results from loading, zero-data, and unavailable states and does not represent sample order subtotals as revenue. AC-09 as a whole remains open pending incident dashboard presentation and the full acceptance demonstration.

- Backend tests verify Manager/Administrator permission enforcement, signed restaurant scope (including rejection of client-selected tenants), range validation/default, per-collection query bounds/truncation, timezone-local date/hour buckets and UTC fallback, preparation-time calculation, empty/repository failure behavior, and protected app mounting.
- Frontend `parseAnalyticsData` defensively validates the API response shape before rendering. The dashboard supports 7- and 30-day views, local-time daily/hourly order charts, order outcomes, preparation and reservation summaries, current low/out-of-stock counts, retry, and a visible partial-sample note.
- Backend Biome, typecheck, build, audit and full tests plus frontend Biome, typecheck, build, and audit are recorded in the S2-09 work log. The frontend has no automated UI test runner; no browser E2E or live MongoDB/Atlas result is claimed.
- Docker/`mongod`, Atlas credentials, deployment, remote CI, push, and merge verification are unavailable/deferred. Complete AC-09 and any database integration claims only after the corresponding remaining work is executed.

## 22. S2-11 Role-based Dashboard Verification

S2-11 is locally implemented and **Ready to Push** on `main`, aligned with the approved role matrix. Navigation and customer-owned history presentation are client-side conveniences only; backend permissions, signed tenant scope, and ownership checks remain authoritative.

- Node-native frontend unit tests assert the section matrix for Reception, Kitchen Staff, Customer, Manager, and Administrator; verify Analytics/health-score/recommendation visibility; check disallowed/stale sections resolve to Overview; and exercise identity/restaurant/role-specific workspace keys plus the mismatched-scope fallback for tenant-bound values. The CI workflow executes these tests through `npm run test`.
- Reception now has the read-only Inventory availability section. Kitchen Staff sees relevant Orders, Kitchen, and availability-only Inventory, with management/guest pages hidden. Manager/Administrator keep the full restaurant navigation. Customer sessions see a dedicated portal with authenticated own-order history summary, cross-restaurant own reservation view, and sign-out.
- On Manager/Administrator identity changes, recommendation and review values render only when their stored scope key matches the active user/restaurant/role; otherwise the UI immediately uses preview/unreviewed values and clears the prior state. Analytics remounts on that identity scope key, removing the previous report and aborting its request. Other tenant-bound feeds reset when their session-bound requests begin and ignore aborted responses. No stale recommendation or analytics response is shown across the new workspace.
- Frontend Biome, the role/access unit suite, typecheck, production build, and dependency audit pass on Node `24.21.0`. No component/browser E2E or live MongoDB/Atlas integration result is claimed; those checks remain outstanding.

## 23. S2-12 Incident Detection Verification

S2-12's locally implemented backend scope uses the approved threshold values and the user-selected condition-based auto-resolution/fresh-ID recurrence lifecycle. Active deduplication, event/time cadence, response/source bounds, and the unimplemented notification cooldown are documented as assistant implementation recommendations. The status is Ready to Push only after the local implementation and documentation commits; no remote push/merge is claimed.

- Rule tests cover strict warning/critical delay boundaries, accepted-to-ready clearance, active kitchen-order count/oldest-age congestion, per-item inventory thresholds/depletion, table overlap/capacity/unavailable confirmed assignments, threshold fallback, and reservation-expiration reevaluation.
- Service tests cover one active record per identity, severity/evidence update, automatic resolution on cleared conditions, fresh-ID recurrence, non-interference with unsupported incident types, incomplete-scan resolve protection, and post-persistence health-score refresh requests.
- Repository/schema tests verify tenant-filtered operational-source queries, bounded inputs, tenant-scoped active-restaurant enumeration, duplicate-key recovery, active-key clearing on resolution, and the unique partial active-key index. These use fake Mongo collections; no live database/index bootstrap is verified.
- Route/app tests verify Manager/Administrator access, signed tenant scope, client-filter rejection, safe bounded fields, unavailable responses, and app mounting. Scheduler tests cover startup/hourly cadence, event coalescing, threshold timer, retry and shutdown cancellation; no multi-process coordination is claimed.
- Successful customer/staff order, kitchen, inventory, and reservation writes request incident reevaluation. Table writes do not yet exist in this module; future table writes need the same incident/health-score hooks. S2-12 does not send notifications or provide an incident dashboard UI.
- **Local verification via Node `24.21.0`:** backend Biome checked 107 files with no findings; TypeScript typecheck and production build passed; the complete backend suite passed 154/154 tests. `git diff --check` is recorded after final documentation sync. These are local checks, not remote CI.
- Live Docker Compose MongoDB, live MongoDB/Atlas persistence/index verification, waitlist-dependent coverage, queue-wait formula, browser E2E, load/p95 testing, deployment, remote CI, push, and merge remain outstanding or deferred. AC-05/AC-09 are not claimed fully complete.

## 24. S2-13 WebSocket Implementation Verification

S2-13 implements an assistant-recommended backend transport, not a new owner-approved event-to-recipient business policy. The ticket route, in-process gateway/hub, best-effort event publishers, and ACK-based notification delivery persistence are implemented, tested, documented, and committed locally; S2-13 is **Ready to Push** on `main`, not Complete. No remote CI or deployment is claimed.

- Ticket-store tests cover 256-bit base64url token shape, authenticated identity binding, 30-second expiry, one-use consumption, pending-capacity enforcement, and invalid token handling. Route tests cover bearer-authenticated role permission, signed staff tenant versus cross-restaurant Customer identity, exact configured Origin, body/query rejection, and the 10 requests/minute/IP limit.
- Real WebSocket integration tests use a local in-process HTTP server to verify the RFC 6455 upgrade, only the public subprotocol being selected, one-use ticket consumption, exact-origin enforcement, missing-ticket and query-string rejection, unknown-message close, and the 8 KiB receive limit.
- Hub/service tests cover same-tenant permission-filtered event fanout; customer/staff recipient scope; notification ACK binding to the connection and authenticated recipient; ACK expiry; first `deliveredAt` persistence only after ACK; and best-effort publication from order, kitchen, inventory, reservation, incident, recommendation, health-score, and notification paths.
- Event fanout remains in-process and has no replay queue. Clients must refetch the persisted REST feed after reconnect; there is no frontend WebSocket integration in this S2-13 backend scope. S2-12 does not create notifications or select their recipients, and retention/TTL remains undecided.
- **Local verification via Node `24.21.0`:** Biome checked 115 backend files with no findings; typecheck and production build passed; all 172 backend tests passed; `npm audit --audit-level=moderate` reported zero vulnerabilities; `git diff --check` passed.
- Tests use fake repositories and a local WebSocket handshake only. They do not verify live MongoDB/Atlas state/indexes, browser behavior, load/p95, multiple replicas, remote CI, deployment, push, or merge. These remain outstanding/deferred to the agreed later stages.

## 25. S2-14 Billing API Verification

S2-14 is **Ready to Push** on local `main`, not Complete. The locally implemented API follows assistant-recommended details documented in the Implementation Decisions; those details are not separate owner approvals. Payment capture/provider integration, tax/discount calculation, bill editing/voiding, and settlement/accounting remain outside scope.

- Service tests verify generation only for `Ready`, `Served`, and `Completed` orders; immutable bill-line snapshots; safe integer-minor arithmetic; `subtotalMinor` equality with the stored order total; zero tax/adjustments; source-data validation; and idempotent reuse without overwriting existing snapshots.
- Repository tests verify that staff reads include the signed `restaurantId`, Customer reads first prove order ownership through the active global Customer profile, child item snapshots use the same restaurant/order filter, and a duplicate-key race returns the existing bill. The existing unique `(restaurantId, orderId)` index is the one-bill invariant.
- HTTP tests verify `bills:write` and `bills:read`/`bills:own:read` role gates, signed staff scope, owner-only Customer access across restaurants, body/path/query validation, no-store responses, `201` versus idempotent `200`, inaccessible-resource `404`, and fail-closed service errors. The application test verifies the mounted protected route.
- **Local verification via Node `24.21.0`:** `npm ci` installed 160 packages with zero vulnerabilities; Biome checked 122 backend files; TypeScript typecheck and production build passed; all 194 backend tests passed (22 new billing tests); `npm audit --audit-level=high` found zero vulnerabilities; `git diff --check` passed.
- Repository/service/HTTP tests use fakes. Live MongoDB persistence and enforcement of the unique index, Atlas, deployment, remote CI, push, and merge have not been verified; live database/index checks remain deferred to the final DB/deployment stage. Base shell Node is `20.20.2`; the validation commands explicitly selected `24.21.0`.

## 26. S2-15 Password Reset Verification

S2-15 is **Ready to Push** on local `main`, not Complete. The two-step endpoint behavior and security limits are assistant recommendations selected to fill the undocumented backlog contract; they are not separate owner approvals. The approved OTP baseline remains six digits, 10-minute expiry, 60-second resend cooldown, and five attempts. Real email delivery and live MongoDB checks are not claimed.

- Repository tests verify atomic code issuance only for active users with a non-empty password hash; missing/blank hashes, disabled/pending users, and resend cooldown are ineligible. They verify hashed-code storage, single-use atomic replacement, reset-state cleanup, five-attempt bounds, and active-refresh-session revocation filters.
- Service tests verify normalized email, HMAC storage keyed by the reset purpose, generic handling of unknown/ineligible accounts, development-only mock response, provider fail-closed behavior, password/code bounds, invalid/expired code handling, Argon2id password replacement, and session-revocation failure behavior.
- HTTP tests verify exact request keys and no query parameters, generic no-store `202`, `204` success with refresh-cookie clearing/no login session, exact-Origin enforcement, configuration failures, and process-local limits of five requests/ten confirmations per IP in a 15-minute window. The application test confirms the versioned route mount.
- **Local verification via Node `24.21.0`:** Biome checked 128 backend files with no findings; typecheck and production build passed; all 216 backend tests passed; `npm audit --audit-level=high` reported zero vulnerabilities; `git diff --check` passed.
- Tests use in-memory/fake repositories. Live MongoDB/Atlas persistence, real email-provider credentials/delivery, browser E2E, remote CI, deployment, push, and merge remain unverified or deferred. Stateless access JWTs remain usable until their existing 15-minute expiry; if bulk refresh-session revocation fails after password replacement, `passwordChangedAt` provides stale-refresh rejection.

## 27. S2-16 Staff Management API Verification

S2-16 is **In Progress**. The request semantics below are assistant recommendations, not separate owner approvals. Only Manager/Administrator can manage the roster; the API remains tenant-scoped, and adding staff or managing schedules/payroll is not part of the current inventory.

- Test repository filtering on the signed restaurant, bounded list ordering/truncation, safe joins to user records, atomic user role/status change, staff projection synchronization, and the refresh-session watermark.
- Test HTTP role gates, strict body/query/path validation, same-tenant reads/updates, safe serialization, self-deactivation denial, inactive membership visibility/reactivation, and indistinguishable absent/cross-tenant updates.
- Verify refresh rejects pre-change token families after both role/status changes and reactivation; existing access tokens remain valid only until their current 15-minute expiry.
- Local fake-backed tests cannot prove two-collection atomicity. Live MongoDB behavior/indexes, browser workflow, remote CI, deployment, push, and merge are outstanding.
