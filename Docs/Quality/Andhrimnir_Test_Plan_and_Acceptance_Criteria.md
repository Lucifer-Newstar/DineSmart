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
| TC-06 | Kitchen | Update order status | Status reflected in dashboard | High |
| TC-07 | Inventory | Low stock condition | Alert generated | High |
| TC-08 | Incident Engine | Kitchen delay simulation | Incident created with severity | High |
| TC-09 | AI | Generate recommendation | Explainable recommendation returned | High |
| TC-10 | Health Score | Operational changes | Score recalculated | Medium |
| TC-11 | Notifications | Critical incident | Manager notified | Medium |
| TC-12 | Analytics | View reports | Charts load correctly | Medium |
| TC-13 | Database fallback | Disable database after cache is warmed | Menu/dashboard show stale-data banner; writes fail clearly and are not queued | High |
| TC-14 | JWT sessions | Login, refresh, replay a rotated token, then logout | Access token is short-lived; refresh cookie is HttpOnly; replay revokes the session family; logout revokes | High |
| TC-15 | Access middleware | Call a protected test route with missing, invalid, and valid bearer tokens | Missing/invalid tokens are rejected; a valid token attaches the authenticated principal | High |

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
- Order service/repository tests verify Customer profile resolution, active-restaurant scope, server-derived menu prices/currency/total and snapshots, quantity/line bounds, unavailable/cross-restaurant menu item rejection, initial `Created` status, and bounded cross-restaurant customer history.
- HTTP tests verify Customer-only create/history/cancel permissions, signed-in customer ownership, forged identity/total/status/table fields are rejected, customer cancellation works only before `Accepted`, and a stale cancellation cannot overwrite an accepted status.
- Frontend tests currently have no test runner; local validation covers Biome, TypeScript, and production build. Manually verify the live menu → cart → sign-in/registration return → persisted order → history/cancellation flow when services are available. Preview/unavailable menu data must never be submitted as a real order.
- Live MongoDB/Compose verification remains outstanding. The selected local standalone MongoDB target cannot transact the separate order and order-item writes; line-item-first insertion with compensating cleanup can leave orphan items after a process crash. Treat this as a known limitation until transaction/reconciliation behavior is validated.
