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
| TC-03 | Digital Menu | Load the public menu, filter/search available dishes, inspect currency/dietary/allergen details, and retry after an API failure | Only currently available API items are shown; prices and labels use the live response; category/search/vegetarian filters work; unavailable or malformed responses show a retryable error and never substitute orderable sample items | High |
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
| TC-25 | Waitlist API | Add walk-in parties, read the FIFO queue by staff role, and manually seat/cancel/no-show an entry | Signed-tenant role gates hold; entries are bounded and FIFO; seated parties require a same-tenant capacity-safe table; no automatic seating/notification is implied | High |
| TC-26 | Table Status API | Transition a table through available/reserved/occupied/disabled/out-of-service as authorized staff; release associated records only when terminal | Signed-tenant role gates, strict transitions, reference validation, optimistic conflict handling, waitlist-pointer cleanup, safe response fields, and operational refresh hooks hold | High |
| TC-27 | Customer Landing Page | Open `/` signed out; follow menu, reservation, account, and restaurant-team links; restore/reload as Customer and staff roles; open `/dashboard` signed out | Visitors receive the public customer landing page; Customer sessions enter their own portal, staff sessions enter the role-aware workspace, and the sample operations preview remains available at `/dashboard` without confusing it with the landing page | High |
| TC-28 | Digital Menu client validation | Run the frontend menu-data unit tests against valid/malformed menu responses, pending carts, and safe-integer totals | Invalid/cross-restaurant or unknown cart lines fail closed; line/unit/item bounds hold; unsafe totals are not formatted or submitted | High |
| TC-29 | Customer menu-to-order integration | Browse the public menu, place an order as a Customer through injected test authentication using listed item IDs/quantities, retrieve history, then change availability and retry the stale cart | Router/service responses align; the server derives the total from current menu prices; unavailable items are rejected without a second write; history/cancellation remain owner-scoped | High |
| TC-30 | Application route composition | Create the Express app with test dependencies and request reservation and AI recommendation endpoints without credentials | Reservation and AI read/generate routes are mounted and reject unauthenticated requests; no live database or provider is required for this mount/auth check | Medium |
| TC-31 | Frontend interactive-control regression | Run the frontend AST guard over app TSX/JSX controls and inspect the overview sample range | No click handler has an empty function body; every button declares its type; every input/select/textarea has an accessible name; the sample-only reporting period is presented as a static label, not an inert button | Medium |

S2-08's local TC-10 coverage uses fake-backed scheduler/repository/service tests to verify one-hour expiry, operational-event invalidation, active-tenant sweeps, and tenant-scoped API behavior. It does not demonstrate live MongoDB/Atlas behavior; those checks are deferred to the final database/deployment stage. Scores are held only in process memory, not persisted. S2-10's local TC-16 coverage validates persisted retrieval/read-state behavior with fake-backed repositories and HTTP tests. It does **not** demonstrate automatic critical-incident notification dispatch because the event-to-recipient policy remains open. S2-13's backend WebSocket transport now has local route/gateway/hub tests, but this does not verify live MongoDB delivery, browser reconnect, or a notification UI; TC-11 and acceptance criterion AC-08 remain outstanding. S2-06's TC-17 covers the inventory API; TC-07's low-stock detection is now locally implemented under S2-12, but live database behavior and delivered alerts remain unverified. S2-09's local TC-12 verification covers the protected tenant-scoped analytics API and live operational chart states, but it is not a browser E2E or MongoDB integration run. S2-12's TC-08/TC-21 coverage uses fake-backed rule, repository, service, scheduler, and HTTP tests for threshold boundaries/escalation, current-data incident rules, tenant scope, bounded responses, deduplication, condition-based resolution, fresh-ID recurrence, notification hooks, and incomplete-scan safeguards. The supported rules, incidents API, and event/time-based reevaluation pass local checks; live MongoDB/index behavior, Atlas, multi-replica timing, p95 performance, browser incident UI, and critical-incident delivery are not verified. Waitlist-dependent queue and table congestion rules are now locally implemented and covered (count and longest-wait escalation, blocked-party table congestion, quiet short waits, seated/cancelled/no-show exclusion); staff-shortage detection still has no input, and the wait-estimate formula remains undecided.

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

S2-12 locally implements and tests current-data detection for kitchen/order delays, active-kitchen congestion, inventory shortage, and reservation conflicts, plus the protected tenant-scoped incidents API. AC-05 remains only locally covered for this supported subset: waitlist-dependent queue/table congestion is now implemented and locally tested, staff-shortage detection still lacks an input, live MongoDB/Atlas behavior is unverified, and full acceptance demonstration remains outstanding. S2-09 covers operational analytics and S2-12 supplies the incidents API; S3-05 now includes a local read-only incident dashboard. AC-09 remains open pending browser/live-service checks and the full acceptance demonstration.

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

- Unit/HTTP tests verify unauthenticated rejection, allow/deny behavior for the approved MVP role matrix, Manager/Administrator incident-feed access, kitchen queue access, and customer-owner checks. Incidents resolve automatically when their triggering conditions clear; no manual resolution endpoint is part of the approved lifecycle.
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
- The S3-03 dashboard loads the saved recommendation for the seeded inventory incident only for signed-in Manager/Administrator sessions, validates the GET/POST response shape and incident identity before rendering, aborts reads on workspace changes, and distinguishes loading/empty/unavailable/restricted states from sample preview content. Gemini, fallback, and seeded demo sources have separate labels; the browser never calls Gemini.
- Frontend parser tests cover bounded list parsing, incident matching, duplicate/malformed records, allowed severity/source, action/confidence ranges, and generated-response validation. They are contract/unit tests, not component or browser E2E. Live UI/API/MongoDB/Gemini and responsive acceptance remain outstanding.

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

S2-07 is **Ready to Push** on local `main` after backend/frontend local checks. The assistant-recommended scope covers the dashboard shell and currently available operational flows; S2-09 analytics reads real tenant-scoped operational data, and S2-12 provides supported-data backend incident rules/API; S3-05 now supplies a locally tested Manager/Administrator incident dashboard, while browser E2E remains unverified; S2-11 role-specific dashboard presentation is locally implemented. This scope split is not a separate owner approval. Live MongoDB validation is deferred to the final database/deployment stage; no browser E2E is claimed.

- Backend repository/service/HTTP tests verify the tenant filter on orders and item snapshots, oldest-first 200-record cap and truncation, server-selected `floor` versus `kitchen` status sets, permission/scope enforcement, Customer denial, strict no-query-filter behavior, and omission of customer IDs, prices, and totals.
- The authenticated Orders view reads `/api/v1/orders`; Reception/Manager/Administrator may accept, serve, and complete through the guarded status route. Preparation progress is item-level only. Kitchen Staff cannot change order headers.
- The Kitchen view reads `/api/v1/kitchen/queue`, displays only ticket/item data, and saves `Created → Preparing → Ready` item transitions through the existing queue route. Refresh/retry, loading/unavailable/preview labels, and unsaved local-preview actions are explicit.
- Node `24.21.0` local verification: backend Biome lint, typecheck, production build, and all 115 backend tests passed; frontend Biome, typecheck, and Next production build passed. Frontend role/access policy tests now run through the configured Node test script; TC-19 still requires manual/live-service verification and no browser E2E is claimed.
- No Docker/`mongod`, live database, browser E2E, remote CI, push, or merge verification occurred. The live persistence/index validation remains deferred with Atlas/deployment at the end.

## 21. S2-09 Analytics Charts Verification

S2-09 is locally implemented and **Ready to Push** on `main`; the assistant-selected contract is a recommendation, not separate owner approval. The implementation distinguishes live API results from loading, zero-data, and unavailable states and does not represent sample order subtotals as revenue. AC-09 as a whole remains open pending browser/live-service verification and the full acceptance demonstration.

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
- Successful customer/staff order, kitchen, inventory, and reservation writes request incident reevaluation. Table writes do not yet exist in this module; future table writes need the same incident/health-score hooks. S2-12 does not send notifications or provide a dashboard UI; S3-05 separately adds the Manager/Administrator read-only incident view.
- **Local verification via Node `24.21.0`:** backend Biome checked 107 files with no findings; TypeScript typecheck and production build passed; the complete backend suite passed 154/154 tests. `git diff --check` is recorded after final documentation sync. These are local checks, not remote CI.
- Live Docker Compose MongoDB, live MongoDB/Atlas persistence/index verification, queue-wait formula, browser E2E, load/p95 testing, deployment, remote CI, push, and merge remain outstanding or deferred. AC-05/AC-09 are not claimed fully complete.

### 23.1 Waitlist-driven queue and table congestion rules

The waitlist (S2-17) is now a detection input, closing the previously recorded gap without changing the approved lifecycle: one active incident per restaurant/type/affected entity, automatic resolution when the trigger clears, fresh ID on recurrence.

- `backend/src/incidents/incident.repository.ts` loads waiting entries (`status: "waiting"`, newest-bounded, projected to `partySize`/`createdAt`) into the detection snapshot alongside orders, items, inventory, reservations, and tables, and records `waitlist` in `truncatedSources` when the bound is hit.
- `backend/src/incidents/incident.rules.ts` adds `queue_congestion` and `table_congestion` to the rule-managed types with four new configurable thresholds — `queueCongestionWarningParties` (4), `queueCongestionCriticalParties` (7), `queueCongestionWarningWaitMinutes` (25), and `queueCongestionCriticalWaitMinutes` (45) — validated as warning/critical pairs with the same fallback behaviour as the existing thresholds.
- Both incidents are restaurant-scoped and carry only whitelisted trigger fields, so the AI incident context and the dashboard labels work unchanged. `frontend/src/app/dashboard.tsx` labels the two new types.
- `backend/test/incident-rules-waitlist.test.ts` (7 tests) covers the default/validated thresholds, a short queue under every threshold, count- and wait-based escalation to critical, table congestion when no free table can seat the largest waiting party, clearing once a large enough table frees up, an empty floor escalating to critical, quiet behaviour for short waits with no free table, and exclusion of seated/cancelled/no-show entries.
- **Commits:** Jegatheesan `451472a`; Gokul `be2c242`; Dhanush `514b6d7`.
- **Local verification via Node `24.21.0`:** backend 300 tests passed; frontend 38 tests passed; Biome, typecheck, and both production builds clean; high-severity audits reported zero vulnerabilities.
- **Limits:** rule evaluation is verified with unit snapshots, not against live MongoDB data; staff-shortage detection still has no input; the wait-estimate formula remains undecided, so no wait prediction is produced.

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

S2-16 is **Ready to Push** on local `main`, not Complete. The request semantics below are assistant recommendations, not separate owner approvals. Only Manager/Administrator can manage the roster; the API remains tenant-scoped, and adding staff or managing schedules/payroll is not part of the current inventory.

- Test repository filtering on the signed restaurant, bounded list ordering/truncation, safe joins to user records, atomic user role/status change, staff projection synchronization, and the refresh-session watermark.
- Test HTTP role gates, strict body/query/path validation, same-tenant reads/updates, safe serialization, self-deactivation denial, inactive membership visibility/reactivation, and indistinguishable absent/cross-tenant updates.
- Verify refresh rejects pre-change token families after both role/status changes and reactivation; existing access tokens remain valid only until their current 15-minute expiry.
- **Local verification via Node `24.21.0`:** Biome checked 135 backend files with no findings; typecheck and production build passed; all 237 backend tests passed; `npm audit --audit-level=high` found zero vulnerabilities; `git diff --check` passed.
- Tests use fake repositories. The auth user and staff membership are separate documents; a local standalone DB cannot make the update transactional. Live MongoDB/index behavior, browser workflow, remote CI, deployment, push, and merge remain outstanding/deferred.

## 28. S2-17 Waitlist Management API Verification

S2-17 is **Ready to Push** on local `main`, not Complete. FIFO/manual promotion and the new request contract are assistant recommendations based on the sparse endpoint inventory and existing workflow decision; no additional owner approval is implied.

- Test signed-tenant staff-only list/create/update behavior, FIFO ordering and truncation, guest input bounds, strict body/query/path validation, and role denials.
- Test only waiting entries can be resolved, seating requires a same-tenant available table with sufficient capacity, duplicate/stale writes fail closed, and table/waitlist synchronization failure is surfaced with compensation.
- Verify `currentWaitlistId` is attached on staff-directed seating; the S2-18 table status route now validates and clears it when staff marks the table available. Successful occupancy requests health-score/incident refreshes and publishes tenant-scoped table/waitlist invalidations.
- **Local verification via Node `24.21.0`:** Biome checked 142 backend files; typecheck and production build passed; all 257 backend tests passed; `npm audit --audit-level=high` found zero vulnerabilities; `git diff --check` passed.
- Local fakes cannot establish multi-document transactionality or cross-process table allocation. Live MongoDB/index behavior, browser workflow, remote CI, deployment, push, and merge remain outstanding.

## 29. S2-18 Table Status API Verification

S2-18 is **Ready to Push** on local `main`, not Complete. The endpoint inventory includes only `PUT /tables/{id}/status`; the transition map and reference-cleanup behavior below are assistant recommendations to fill the unspecified contract, not separate owner approval.

- Test Reception/Manager/Administrator authorization and signed-restaurant filters; Customers and Kitchen Staff are denied. Reject client-selected tenant, query filters, malformed IDs, unknown request fields, and unsupported status values.
- Test the documented transition graph and idempotent same-status updates. A table cannot leave disabled/out-of-service except to available; occupied/reserved tables must be explicitly cleared before disabling.
- On transition to `available`, verify same-tenant linked reservation/order records are terminal and a waitlist assignment is seated and points back to that table; clear only the safe links. Active, missing, mismatched, or cross-tenant references fail closed.
- Verify conditional `updatedAt`/status/reference matching prevents stale writes; successful changes request health-score/incident refresh and publish only minimal tenant-scoped table invalidations.
- **Local verification via Node `24.21.0`:** Biome checked 149 backend files; typecheck and production build passed; all 272 backend tests passed; `npm audit --audit-level=high` found zero vulnerabilities; `git diff --check` passed.
- Local fakes cannot establish consistency between table documents and linked reservation/order/waitlist documents under cross-process writes. Live MongoDB/index behavior, browser workflow, remote CI, deployment, push, and merge remain outstanding.

## 30. S2-01 Customer Landing Page and S2-02 Digital Menu Verification

S2-01 and S2-02 are locally implemented on `main` and marked **Ready to Push**, not Complete. The route/layout decisions in the Implementation Decisions document are assistant-selected recommendations rather than separate owner approvals.

- Signed-out `/` renders a customer-facing landing page; after session restoration, Customer users enter the existing Customer Portal and staff users enter the role-aware restaurant workspace. `/dashboard` preserves the sample operations preview for signed-out users. Menu, reservation, account, and team sign-in links use the existing routes.
- `/menu` continues to read only the live public menu API response, filter the available items, and fail closed on loading/error/malformed responses. The frontend utility tests cover menu response validation, item shaping, restaurant/menu-item cart matching, line/unit bounds, and safe integer subtotal calculation; checkout is blocked rather than formatting or submitting an unsafe total.
- **Local verification via Node `24.21.0`:** frontend Biome checked 27 files; 11 frontend tests passed (6 existing role/access tests and 5 new menu/cart tests); TypeScript typecheck and Next.js production build passed, with both `/` and `/dashboard` present; frontend `npm audit --audit-level=high` found zero vulnerabilities; `git diff --check` passed. `frontend/npm ci` installed 56 packages and reported zero vulnerabilities.
- The static landing route builds and prerenders; no browser E2E, interactive navigation, responsive visual review, or customer UAT was performed. Docker/`mongod` and local environment files are absent; no live API/MongoDB credentials/service were configured, so live menu loading, auth, order and reservation persistence/index behavior remain unverified. The repository has no configured Git remote, so remote CI, review/merge, and deployment were not verified or attempted. No push or deployment was made. These are remaining DoD gates, not claims of feature completion.

## 31. S3-06 Integration Testing

S3-06's locally verifiable test slice is committed on `main` and marked **Ready to Push**, not Complete. This status records local test work only; the task's full frontend/database/Gemini acceptance has not been demonstrated.

- **TC-29** uses the real public-menu router, customer-order router, and `OrderService` over a shared in-memory repository. It exercises menu retrieval, customer order placement from listed item IDs and quantities, server-derived pricing, safe order serialization, and authenticated history. It then changes item availability, verifies a stale cart fails without a second order write, and checks another Customer cannot read or cancel the first Customer's order.
- **TC-30** exercises the assembled `createApp` router composition with test dependencies and verifies the reservation list, AI recommendation retrieval, and AI generation routes reject unauthenticated requests.
- **Gokul-authored implementation commits:** `dc2eb8a` (customer menu/order workflow) and `aaa9416` (reservation/AI route composition coverage). The test contribution is also recorded in Gokul's work log.
- **Local verification via Node `24.21.0`:** all 274 backend tests passed; Biome checked 150 backend files with no findings; TypeScript typecheck, production build, and `npm audit --audit-level=high` passed (zero vulnerabilities).
- These tests use in-memory repositories and injected token verification. They do not validate live MongoDB/Atlas persistence or indexes, real OAuth/email/Gemini providers, frontend browser E2E, responsive behavior, load/performance targets, remote CI, deployment, or full user acceptance. Docker/`mongod`, credentials, and a Git remote are unavailable; no live-service, push, merge, or deployment result is claimed.

## 32. S3-03 Recommendation UI Verification

S3-03 is locally implemented and committed on `main`, marked **Ready to Push**, not Complete. Its response parser and API-connected state behavior are locally checked; no browser/live-service acceptance is claimed.

- Manager/Administrator sessions request the saved recommendation for the seeded inventory incident through `GET /api/v1/recommendations?incidentId=...`; generation remains a protected `POST /api/v1/incidents/{incidentId}/recommendations`. The dashboard does not call Gemini directly and carries no provider key.
- The client fails closed on malformed or oversized payloads, mismatched/duplicate incident records, unsupported priorities/sources, invalid confidence, out-of-range action counts, and bounded-text violations. It validates generated response identity before replacing visible state.
- Workspace-scoped requests abort on identity/tenant change. The Insights page distinguishes loading, empty, unavailable, restricted, live, and sample-preview states; Gemini, deterministic fallback, and seeded-demo source labels are not conflated. On generation/load failure, sample preview content remains visibly labeled rather than being represented as a live result.
- **Dhanush-authored commits:** `554acce` (recommendation response parser and unit tests) and `4fb28fd` (scoped GET loading, POST validation, and status/source presentation). Frontend README and this verification section record the behavior and limits.
- **Local verification via Node `24.21.0`:** 16 frontend tests passed, including five recommendation parser cases; Biome checked 29 files; TypeScript typecheck and Next.js production build passed; `npm audit --audit-level=high` found zero vulnerabilities.
- The tests are contract/unit tests; no component/browser E2E, responsive visual review, live backend, MongoDB/Atlas persistence/index test, Gemini request, or customer UAT was performed. The environment has no Docker/`mongod`, Gemini/Mongo credentials, or Git remote. No remote CI, push, merge, or deployment is claimed.

## 33. S3-05 Dashboard Polish and Incident Feed

S3-05 is locally implemented, tested, and committed on `main`, marked **Ready to Push**, not Complete. The incident page uses the signed-tenant API feed and read-only presentation; no browser/live-service acceptance is claimed.

- Signed-in Managers/Administrators load `GET /api/v1/incidents` using the in-memory access token and same-origin API proxy. No client-selected tenant/filter is sent. Reads are aborted on scope changes, and a manual refresh is available.
- The frontend parser caps the list at the server contract's 200 records and fails closed on malformed IDs/slugs, status/severity, dates, duplicate IDs, oversized text/snapshots, unsafe trigger keys/values, and invalid truncation metadata. The UI shows open/resolved records, safe trigger facts, loaded-list counts, partial-history notices, and matching incident recommendation links without displaying restaurant/customer PII.
- Preview records are labeled as samples. Live, empty, loading, unavailable, and restricted states are explicit; failed requests do not substitute sample records as live. The overview uses current open counts when available and marks partial results. Notification mock content is visibly labeled preview.
- Insights shows incident status, root-cause summary, and bounded trigger facts only when the recommendation matches a validated incident record; it does not invent trigger-specific inventory claims when context is unavailable. The incident page is intentionally read-only: rule-managed incidents resolve automatically when their triggering condition clears, and no manual close endpoint/control is added.
- **Dhanush-authored implementation commits:** `5b379df` (scoped feed, parser, role checks, incident dashboard/Insights integration) and `3564ea5` (incident and Insights styling). S3-05 is frontend-only; no backend source, test, or demo-seed fixture change is part of this work. The UI scope is an assistant-selected recommendation to fulfill the backlog's generic Dashboard Polish item, not separate design approval.
- **Local verification via Node `24.21.0`:** frontend 20 tests passed (4 incident parser cases plus role, menu/cart, and recommendation suites); Biome checked 31 files; typecheck and Next.js production build passed; high-severity audit found zero vulnerabilities. Backend checks were rerun against the unchanged backend tree: all 274 tests passed; Biome checked 150 files; typecheck/build passed; high-severity audit found zero vulnerabilities.
- No component/browser E2E, responsive visual review, live incident API/MongoDB index/persistence, or customer UAT was performed. Docker/`mongod`, live credentials, and a Git remote are unavailable; no remote CI, push, merge, or deployment is claimed.

## 34. S3-07 Frontend Bug-Fix Pass

S3-07 remains **In Progress**; this checkpoint closes one verified frontend defect, not a claim that the whole project has completed browser/manual bug triage.

- The overview's sample revenue card exposed a button-like “Last 7 days” range control whose click handler did nothing. Replaced it with an accessible, static “Last 7 days · sample” label so preview data is not presented with a nonfunctional control.
- Added a Node-native TypeScript AST regression test scanning app TSX/JSX for block-bodied `onClick` handlers with empty bodies, buttons without an explicit `type`, and form controls without an accessible name (aria-label/aria-labelledby or a wrapping label with visible text). TC-31 pairs this automated guard with review of the sample-range presentation. No placeholder-only field is accepted as a name.
- **Dhanush implementation commit:** `30f2ac4`. **Gokul test commits:** `e55b1d6` (empty click handlers), `38348a0` (button types), `14519b6` (accessible names).
- **Local verification via Node `24.21.0`:** 23 frontend tests passed; Biome checked 32 files; TypeScript typecheck and Next.js production build passed; high-severity audit found zero vulnerabilities. The guard was validated by temporarily introducing one violation of each type outside the committed tree; the probe file was removed and no violation remains.
- No browser E2E, interactive/responsive visual review, or live-service validation was performed. The work is frontend-only; no backend source was modified. S3-07 remains open for broader bug triage/acceptance.

### 34.1 Browser triage pass (Playwright, 7 routes x 3 viewports)

A second S3-07 checkpoint drives the production build in headless Chromium. [`Docs/Quality/Andhrimnir_Browser_Triage_Report.md`](Andhrimnir_Browser_Triage_Report.md) records the method, five findings, and the limits; the summary:

- **Fixed — mobile horizontal overflow (193 px on `/dashboard`):** an unanchored `.sr-only` absolute box escaped its unpositioned `.table-scroll` ancestor and grew the document. `.sr-only` is now anchored (`top: auto; left: 0`) and `.table-scroll` is a containing block. Re-verified: no route overflows at 1440x900, 820x1180, or 390x844.
- **Fixed — sub-24 px hit areas:** six dashboard controls measured 12-23 px tall. `.text-link`, `.insight-teaser-footer button`, `.sidebar-tip button`, and `.app-footer button` now declare `min-height: 24px`. Re-verified: every dashboard control is at least 24 px tall (WCAG 2.5.8 AA).
- **Open — colour contrast:** 108 elements across 91 colour/size combinations are below AA, worst at 2.22:1 for 7-8 px muted metadata. Remediation darkens shared design tokens, and the palette plus conformance level are pending owner decisions, so no palette change was made.
- **API error paths:** unknown `/api/v1/*` routes returned the framework's HTML 404, and body-parser rejections (400/413) as well as `/health` omitted `Cache-Control: no-store`. Both are fixed in `backend/src/app.ts`; a documented observation notes that protected routes return 503 when the database is unreachable even without a token, because routers connect before authenticating.
- **Contract triage:** `tools/api-contract-check.mjs` compares every frontend `fetchWithTimeout` call against every route mounted by `app.ts` (39 routes, 28 calls, 0 unmatched) and lists the 14 routes no frontend call reaches. CI runs it in strict mode.
- **Not defects:** the 401 refresh, 503 operational, and 429 rate-limit console entries are artifacts of a database-less environment and 21 rapid automated loads; the UI fails closed with labelled preview/unavailable states.
- **Commits:** Dhanush `09f1e89`; Gokul `99dea5c`; Jegatheesan `63076f9`, `6be7c47`; Navin `2b88c07`, `05980d8`, `c781b97`; Dhanush `dcc8974`; Gokul `f9ee881`.
- **Local verification via Node `24.21.0`:** backend 300 tests passed; frontend 38 tests passed; Biome, typecheck, and both production builds clean; 21 browser route/viewport loads with zero page errors and zero failed requests; `node --test tools/api-contract-check.test.mjs` passed 6/6 and the strict contract check exited 0.
- **Limits:** no live MongoDB, so only unavailable/empty/preview states were rendered; single browser engine; no screen-reader, touch, or performance testing; screenshots were captured but not visually reviewed.

## 35. S3-10 Performance Optimization Verification

S3-10 is **In Progress**; this checkpoint covers locally measurable response-size and client-derivation work, not a load test. The non-functional targets (dashboard p95 under 2 s, API p95 under 500 ms, incident detection p95 under 5 s, AI p95 under 10 s) remain unverified because no live MongoDB, Atlas, Gemini credential, or load generator is available.

- **Response compression:** the public menu router compresses JSON responses above 1,024 bytes for clients that advertise `gzip`. Authenticated operational responses are deliberately excluded so tenant data is never compressed alongside client-controlled input (BREACH-style exposure). Tests assert a gzipped large menu, an uncompressed small menu, an uncompressed `identity` request, and that non-JSON bodies are skipped.
- **Cache policy:** every `/api/v1` response defaults to `Cache-Control: no-store`. Only a successful public menu read overrides it with `public, max-age=30`; menu error responses keep `no-store`. The liveness probe stays outside the compression path.
- **Read projections:** notification, inventory, and recommendation list/read queries now request only the fields their mappers serialize. Regression tests fail if a read omits an explicit projection or adds a field the serializer does not use.
- **Projection coverage extended:** incident-context reads (incident, restaurant thresholds, active orders, low-stock items, upcoming reservations) and the table-status read path (current table, conditional update, re-read after a lost race, and the linked reservation/order/waitlist guards) now name their fields too. `backend/test/repository-projections-reads.test.ts` asserts the exact projection keys for each of those reads.
- **Bounded browser requests:** `frontend/src/app/api-client.ts` wraps `fetch` with a 15-second deadline that is combined with the caller's abort signal, so a stalled request resolves into an explicit `ApiTimeoutError` instead of leaving a panel in its loading state. All dashboard, menu, orders, booking, and auth requests use it; a timed-out read shows a dismissible "live data is slow to respond" banner, and `classifyRequestError` separates timeout, abort, and error outcomes. `frontend/test/api-client.test.mjs` covers the deadline, abort precedence, and classification.
- **Client derivations:** dashboard order filtering/counters/averages, analytics bar geometry, and the incident open/resolved split are pure helpers in `dashboard-metrics.ts`, memoized with `useMemo`. Hook order stays unconditional, so the analytics memos run before the state early-returns. `formatLoadedCount` shows `200+` when the bounded feed reaches its cap instead of implying a complete total.
- **Commits:** Jegatheesan `8fa08f1`, `829bed3`, `5324834`, `8a1e974`, `318501b`, `403fd74`; Gokul `f44e0aa`, `159a40a`, `268e51c`, `1c7b52b`, `3527515`, `30f70bc`, `5a28526`; Dhanush `76a6649`, `0470a73`, `11406a1`.
- **Local verification via Node `24.21.0`:** backend 293 tests passed; Biome checked 159 files; typecheck and production build passed; high-severity audit found zero vulnerabilities. Frontend 38 tests passed; Biome checked 37 files; typecheck and Next.js production build passed; high-severity audit found zero vulnerabilities.
- **Limits:** no p95 measurement, load/concurrency test, live database/index behavior, browser E2E, or deployed-environment verification was performed. The added `compression` dependency (`1.8.2`) and `@types/compression` (`1.8.1`) were audited with zero high-severity findings.

## 36. S3-12 Presentation & Demo Preparation

S3-12 is **In Progress**: the presentation outline, demo runbook, readiness preflight, and fixture summary exist locally. The slide deck itself, a rehearsal against live services, and the recorded backup demo remain outstanding.

- [`Docs/Planning/Andhrimnir_Presentation_Plan.md`](../Planning/Andhrimnir_Presentation_Plan.md) is an 11-slide outline with timings, a judging-criteria mapping, and presenter rules. Each criterion row records the honest current state (for example: functionality is locally verified with fake/unit tests; deployment is still deferred).
- [`Docs/Quality/Andhrimnir_Demo_Runbook.md`](Andhrimnir_Demo_Runbook.md) covers pre-demo setup, a 14-step script, and a fallback table for missing MongoDB, a missing Gemini key, missing seed data, an unreachable API, and an unavailable WebSocket.
- `tools/demo-readiness.mjs` prints a dependency-free preflight (documents, env examples, seed CLI, CI workflow, no committed `.env` files, Node pinning) and fails only with `--strict`. `tools/demo-readiness.test.mjs` covers the checker with temporary fixture directories.
- `backend/src/database/demo-fixtures.ts` and `npm run demo:fixtures` describe the seeded scenario without a database: restaurant, demo accounts, per-collection counts, incidents, and advisory recommendations. The report never prints a password or hash.
- **Commits:** Navin `6850c43`, `1f24ea8`; Gokul `3e7464f`, `653ad71`, `9169140`; Jegatheesan `4c1d6a3`; Dhanush `2114926`, `5053704`, `2701412`; Gokul `b78db04`, `581a09e`.
- **Rendered deck:** `presentation/andhrimnir-deck.html` is the 11-slide outline as a self-contained HTML deck (inline styles and script, no external resources, keyboard and print friendly, presenter notes per slide). `presentation/deck.test.mjs` passes 6/6; a Chromium pass at three viewports reported zero page errors and zero horizontal overflow.
- **Backup demo:** `tools/capture-demo.mjs` walks the browser-visible runbook steps with Playwright (installed on demand, not a project dependency), captures one screenshot per step, and writes a self-contained `demo-capture/index.html` with the screenshots embedded as data URIs. The committed capture covers 12 steps at 1440x900 plus one at 390x844; all four sidebar-section clicks reported `navigationApplied: true`. `demo-capture/manifest.json` records the base URL, viewport, click outcome, and non-2xx responses per step (401 refresh while signed out and 503 menu without a database, as expected).
- **Local verification via Node `24.21.0`:** backend 300 tests passed; Biome checked 159 files; typecheck and production build passed; high-severity audit found zero vulnerabilities. Frontend 38 tests passed with Biome, typecheck, and Next.js production build clean. `node --test tools/demo-readiness.test.mjs` passed 4/4, `node --test tools/ci-workflow.test.mjs` passed 6/6, `node --test presentation/deck.test.mjs` passed 6/6, and `node tools/demo-readiness.mjs --strict` exited 0.
- **Limits:** the capture was produced without MongoDB, so dashboard steps show labelled preview/empty states rather than live operational data, and it is a screenshot walkthrough rather than a video recording. No rehearsal was performed, no live Gemini call was made, and no deployed environment was available. The deck was checked for layout and self-containment, not reviewed as a design artifact.

## 37. S1-07 CI Workflow Hardening

S1-07 stays **In Progress**; this checkpoint hardens the local workflow definition and guards it locally. No GitHub Actions run has been observed, because no remote is configured.

- `.github/workflows/ci.yml` now declares `permissions: contents: read` and a `concurrency` group that cancels superseded runs on the same ref. The single job is split into `frontend`, `backend`, and `preflight` jobs, each with its own `timeout-minutes`, `actions/checkout@v7` with `persist-credentials: false`, `actions/setup-node@v7` reading `.nvmrc`, a cache keyed to that app's lockfile, and `npm ci` installation.
- Every application job runs the same sequence — high-severity `npm audit`, `npm run lint`, `npm test`, `npm run typecheck`, then `npm run build` — so a typecheck failure stops the build step. The backend job keeps its `hashFiles('backend/package.json')` gate so the workflow is still valid on a branch without the backend package.
- The new `preflight` job runs `node tools/demo-readiness.mjs --strict`, keeping the presentation prerequisites check in CI.
- `tools/ci-workflow.test.mjs` (6 tests, dependency-free) asserts those invariants: least-privilege permissions, cancel-in-progress concurrency, no `pull_request_target` or piped shell installation, timeouts, pinned actions, `.nvmrc` pinning, `npm ci` instead of `npm install`, the audit/lint/test/typecheck/build order, the backend gate, and the strict preflight command.
- **Commits:** Navin `272e7d3`; Gokul `7caa246`.
- **Local verification via Node `24.21.0`:** `node --test tools/ci-workflow.test.mjs` passed 6/6; `node tools/demo-readiness.mjs --strict` exited 0 with 14/14 prerequisites; both packages pass `npm audit --audit-level=high` with zero vulnerabilities, Biome, typecheck, tests (backend 293, frontend 38), and production builds. The workflow file was parsed to confirm three jobs with the expected step counts.
- **Limits:** this validates the workflow definition locally, not a GitHub Actions execution. No remote, runner matrix, secret, artifact, or deployment behaviour is claimed, and the workflow has never run on GitHub.
