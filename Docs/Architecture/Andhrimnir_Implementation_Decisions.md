# Andhrímnir Implementation Decisions

**Status:** Approved project baseline with explicit open decisions. Scope choices marked approved reflect the owner's decisions; where directed, assistant-selected technical recommendations are identified as recommendations rather than attributed to a separate owner selection. Items under **Pending decisions** are not requirements yet and must not be implemented by assumption.

This document refines the Product Vision, SRS, SDD, canonical API inventory, backlog, test plan, demo plan, and database-fallback strategy. It is the reference for decisions that are more detailed than the high-level architecture documents.

## 1. Product identity and release scope — approved

- Product name: **Andhrímnir**. Repository name: **DineSmart**.
- Use the SRS Must-Have scope as the MVP baseline; execute the canonical backlog in owner order.
- Bills may be generated and viewed. **Payment processing is out of MVP** until a provider and payment lifecycle are approved.
- Keep the documented backlog additions in the plan; prioritize their release timing against the Must-Have scope.
- Multi-branch management, POS/IoT integrations, predictive ML, supplier management, voice AI, and durable emergency-offline writes are deferred.
- The current three-day plan and 115 story points require capacity planning; do not treat the schedule as a commitment until the team re-estimates it.

## 2. Roles and authorization — approved baseline

The SRS role list is canonical for the MVP: **Customer, Reception, Kitchen Staff, Manager, Administrator**. Restaurant Owner maps to Manager for the MVP. Waiter and Inventory Manager remain personas/responsibilities, not separate MVP roles.

| Capability | Customer | Reception | Kitchen Staff | Manager | Administrator |
| --- | --- | --- | --- | --- | --- |
| Browse menu/availability | Read | Read | Read | Read/write | Read/write |
| Own orders and reservations | Own records | Read/create/update for restaurant | Read relevant orders | Read/write | Read/write |
| Waitlist and table assignment | — | Read/write | — | Read/write | Read/write |
| Kitchen preparation queue/status | — | — | Read/write | Read/write | Read/write |
| Inventory | — | Read availability | Read availability | Read/write | Read/write |
| Dashboard/analytics/incidents/recommendations | Own order status | Operational subset | Kitchen subset | Full restaurant view | Authorized administrative view |
| Resolve incidents/configure thresholds | — | — | — | Read/write | Read/write |
| Staff and restaurant configuration | — | — | — | Same-restaurant management | Same-restaurant administration |

Apply least privilege and restaurant scoping. Administrator access is restaurant-scoped for the MVP; no platform-wide or cross-restaurant superuser access is defined. The matrix is approved as the starting policy; any finer-grained exception must be documented before the affected endpoint is built.

### S1-12 authorization implementation recommendations

The middleware implementation follows the matrix through named permissions. Each operational route should apply both the required permission and restaurant scope, and repository queries/mutations must independently include the authenticated restaurant ID. Any client-supplied `restaurantId` in path, query, or body is rejected unless it matches the signed principal; creation handlers should derive the tenant ID from that principal rather than trust the body. Customer-owned resources require a service-level owner comparison after a tenant/ownership-filtered lookup. The Customer identity remains cross-restaurant, but Customer authorization never grants restaurant operations. Manager and Administrator share the approved operational permission set in the MVP; neither receives platform-wide privileges. These are implementation recommendations, not separate owner selections.

## 3. Authentication and security — approved baseline

- Registration: email OTP verification.
- Login: email/password or Google OAuth.
- Password reset and secure logout are in scope.
- OTP: 6 digits, 10-minute expiry, 60-second resend cooldown, maximum 5 verification attempts.
- Password hashes: Argon2id.
- Session: 15-minute access JWT and rotating 7-day refresh session. Keep the access token in memory and the refresh token in an HttpOnly/Secure cookie; logout revokes the refresh session.
- Apply rate limits to login, OTP, password-reset, and OAuth callback flows. Do not log secrets or OTP values.
- Use environment variables and local secret storage. Commit placeholder names in `.env.example`, never secret values.
- Until an email provider is configured, use a local/mock email adapter for development. Provider credentials are not part of this repository.

### S1-09 JWT implementation recommendations

These are the assistant-selected implementation defaults on the owner's direction to choose recommendations; the owner has not separately selected each detail:

- Sign 15-minute access JWTs with `HS256`, a minimum 32-byte `JWT_SECRET`, issuer/audience validation, and subject/role/restaurant claims. Keep authorization rules in middleware/services, not solely in unverified client data.
- Issue 256-bit opaque refresh tokens in an HttpOnly cookie; persist only SHA-256 hashes. Rotate each use, detect reuse and revoke the token family, with a fixed seven-day absolute session lifetime (rotation does not extend the lifetime).
- Cookie policy: HttpOnly always; `Secure` in production; `SameSite=Lax` for local development and `SameSite=None` in production for the separate frontend/API origins. In production, allow credentialed CORS and unsafe auth requests only from the configured exact `WEB_ORIGIN`.
- Use Argon2id with explicit memory/time parameters. Apply a modest process-local IP limiter to login and refresh as an MVP safeguard; configure a shared store before horizontally scaling.
- Return only the access token and safe user identity in JSON; never expose the refresh token or log token/password values. Registration/OTP remains owned by S1-11; S1-09 login accepts only active users that already have a password hash.
- Include secure logout in S1-09 because revocation belongs with refresh-session handling; keep S2-15 focused on password reset to avoid duplicate ownership.

### S1-10 Google OAuth recommendations

These are assistant-selected implementation defaults on the owner's direction to choose recommendations; they are not separate owner selections:

- Use Google Identity Services to obtain an ID token in the browser, then verify it server-side with Google's `google-auth-library` against the exact `GOOGLE_CLIENT_ID`; never trust profile claims supplied outside the verified token.
- Require a verified Google email and link it only to an existing active user whose `normalizedEmail` matches. Store the stable Google `sub` as a unique `googleSubject`. Do not create a new user or grant a role from Google sign-in; verified Email/OTP registration remains the account-creation path.
- Issue the same access/refresh session as email/password login. This ID-token verification flow needs a public client ID in the frontend and backend, but no Google client secret.

### S1-11 Email OTP recommendations

The six-digit/10-minute/60-second/five-attempt policy is owner-approved. The following implementation choices are assistant recommendations on the owner's direction:

- `POST /auth/register` creates a pending Customer account from name/email/password; roles and tenant ids are server-assigned. `POST /auth/otp/request` resends only for a pending account; `POST /auth/otp/verify` atomically activates it and issues the standard session. Existing accounts receive a generic response; registration never overwrites them.
- Require a 12-character minimum password for new registrations, with no composition rules and a 1024-byte maximum. Store only an Argon2id hash.
- Store a domain-separated HMAC-SHA-256 of the OTP on the pending user document (not the OTP itself), so attempt/expiry/activation checks can be atomic on one MongoDB document. Derive the OTP key from `JWT_SECRET` with a distinct purpose prefix.
- Keep the mock mailer local-only. In development with `EMAIL_PROVIDER=mock`, return the one-time code as `developmentCode` in the response for manual testing; never log it, never return it in production, and reject mock email in production. A real mail provider remains unconfigured.
- Apply process-local IP rate limits in addition to the per-account cooldown and attempt ceiling; use a shared store before horizontal scaling.

### Authentication test alignment

The test plan now reflects the SRS: register with Email/OTP, then log in with Email/Password; Google OAuth is an additional supported login path.

## 4. Data tenancy and API conventions — approved baseline

- Operational records are scoped by `restaurantId`.
- Store timestamps as BSON `Date` values in UTC; serialize them as ISO-8601 over HTTP and display them in each restaurant's configured timezone.
- Store timezone and currency per restaurant; do not hard-code a global locale.
- Use the versioned base path `/api/v1`.
- The canonical endpoint inventory is [Andhrímnir API Specification](Andhrimnir_API_Specification.md).

### Recommended minimum entity fields — S1-08 baseline

On the owner's instruction to choose the best recommendation, this field list is the initial S1-08 implementation baseline (2026-10-10). It is an assistant recommendation, not a claim that the owner separately approved each technical detail. More exact field validation, optionality, and API payload rules remain open until the affected workflows are specified.

| Entity | Recommended minimum fields |
| --- | --- |
| User | `name`, `email`, `role`, `restaurantId` (nullable for customers), `status`, auth-provider reference, timestamps |
| Restaurant | `name`, contact/address, timezone, currency, operating hours, configurable thresholds, status |
| MenuItem | `restaurantId`, category, name/description, price, availability, optional dietary/allergen labels |
| Customer | `userId` or guest contact, display name, contact preferences |
| Reservation | `restaurantId`, customer, party size, start/end time, table, status, notes, timestamps |
| Table | `restaurantId`, label/number, capacity, zone, status, current reservation/order references |
| Order | `restaurantId`, customer, table/reservation, item snapshots, total, lifecycle status, status timestamps |
| OrderItem | menu-item reference and name/price snapshot, quantity, notes, preparation status |
| InventoryItem | `restaurantId`, name, quantity, unit, low-stock threshold, last-adjusted timestamp |
| Staff | user reference, restaurant, role, active status; no shift/schedule fields in MVP |
| Incident | `restaurantId`, type, severity, trigger snapshot, affected entity, root cause, status, timestamps |
| Recommendation | incident reference, summary, actions, rationale, expected impact, confidence, provider, timestamp |
| Notification | recipient, restaurant, type, title/body, related entity, read/delivery timestamps |
| Bill | order reference, line-item snapshots, subtotal, tax/adjustments, total, status; no payment capture fields |

### S1-08 schema conventions — recommendations applied

- Use MongoDB `ObjectId` for document identifiers and references; use BSON `Date` for stored timestamps.
- Persist money as integer minor units (for example, cents/paise) alongside an explicit ISO currency code; snapshot menu names and unit prices on order items and bills.
- Keep a global `customers` identity/profile separate from restaurant-scoped orders and reservations. Customer users may have `restaurantId: null`; staff/administrative users are restaurant-scoped. The owner explicitly approved this cross-restaurant customer identity scope on 2026-10-10.
- Store both the entered email and its trimmed, lowercase `normalizedEmail`; enforce a global unique index on the normalized value. Do not remove plus tags or provider-specific dots.
- Give operational collections compound indexes led by `restaurantId`. Use named, idempotent index creation at backend startup. Reservation overlap remains an application-level check; indexes alone do not enforce time-range conflicts.
- S1-08 adds indexes, not MongoDB JSON Schema validators; exact validation remains pending. S1-09 adds a TTL only for refresh-session records with the documented seven-day expiry; do not add TTL or incident-deduplication constraints to operational data until its retention/lifecycle rules are specified.

See the [S1-08 Database Schema](Andhrimnir_Database_Schema.md) for collections, fields, relationships, and index definitions.

### Pending API contract and schema decisions

- Success/error response envelope, pagination/filter conventions, and validation/error codes.
- Missing endpoint operations (OTP request/verify, reservation cancellation/table assignment, order detail/cancel, inventory creation, table listing, staff creation/deactivation, notification read state).
- Exact runtime/document validation rules, optionality for unresolved workflow fields, restaurant onboarding, and remaining workflow constraints.

The canonical endpoint inventory is in the [API Specification](Andhrimnir_API_Specification.md). The S1-08 field list is a persistence baseline, not a substitute for finalizing the API payloads and domain validation before those workflows are implemented.

## 5. Restaurant workflow defaults — approved baseline

| Workflow | Approved default |
| --- | --- |
| Reservation duration and slots | 90-minute duration; 30-minute booking slots, subject to restaurant operating hours. |
| Reservation conflict | Reject overlapping assignments for the same table and reject a party larger than the table capacity. |
| Cancellation/no-show | Customer cancellation allowed until reservation start; use a 15-minute grace period before marking a reservation no-show. |
| Waitlist | FIFO; Reception or Manager confirms/promotion and assigns the table; no automatic seating. |
| Order lifecycle | Keep `Created → Accepted → Preparing → Ready → Served → Completed`. |
| Order cancellation | Customer cancellation is allowed only before the order is accepted. |
| Kitchen status | Kitchen Staff updates preparation status; Reception/Manager handles table assignment and serving. |
| Inventory consumption | Manual stock adjustments only until menu-item ingredient/recipe mapping is defined; do not auto-deduct from orders yet. |
| Billing | Generate and retrieve bills only; no payment capture or payment-provider integration. |
| Staff shortage detection | Defer automated detection until a staffing schedule/minimum-staffing model is approved. |

### Pending workflow details

Exact opening-hour representation, party-size limits, no-show resolution, actor allowed to accept orders, and remaining per-status transition permissions need to be recorded before the corresponding reservation/order APIs are implemented.

## 6. Incident detection — approved thresholds

All thresholds below are configurable per restaurant. Severity values are `info`, `warning`, and `critical`.

| Incident type | Warning | Critical |
| --- | --- | --- |
| Kitchen delay | Item preparing for more than 15 minutes | More than 25 minutes |
| Order delay | Accepted-to-ready exceeds 20 minutes | Exceeds 30 minutes |
| Kitchen congestion | 8 or more active kitchen orders | 12 or more, or oldest active order exceeds 30 minutes |
| Inventory shortage | Available quantity is at/below item threshold | Quantity is zero or negative |
| Reservation conflict | Same-table overlap or party exceeds capacity | Confirmed reservation cannot be seated |
| Queue congestion | 6 or more waiting parties, or estimated wait exceeds 30 minutes | Estimated wait exceeds 45 minutes |
| Staff shortage | Deferred | Deferred |
| Table congestion | Utilization at least 85% while a waitlist exists for 15 minutes | Utilization at least 95% and wait exceeds 30 minutes |

### Pending incident lifecycle details

The thresholds and severity scale are approved. The exact incident status transitions, deduplication key/cooldown, auto-resolution behavior, and queue-wait estimate formula remain pending. Do not build those behaviors from assumptions.

## 7. Restaurant health score — approved weights

Use a score from 0 to 100 with these weights:

| Component | Weight |
| --- | ---: |
| Kitchen efficiency | 25% |
| Inventory health | 20% |
| Order completion rate | 20% |
| Reservation efficiency | 15% |
| Table utilization | 10% |
| Incident frequency | 10% |
| **Total** | **100%** |

The owner-approved cadence is recalculation after relevant operational events and at least hourly. The current endpoint recalculates from current records on each GET; event-triggered recalculation and a scheduled hourly refresh are not implemented yet, so this cadence remains outstanding. The weights are owner-approved; the following score normalization and missing-data behavior are **assistant recommendations dated 2026-10-10**, not separate owner approvals:

| Component | Recommended normalization |
| --- | --- |
| Kitchen efficiency | Average completed prep duration in a rolling 24-hour window. Score 100 at/below `kitchenDelayWarningMinutes`; fall linearly to 0 at `kitchenDelayCriticalMinutes`; clamp to `[0,100]`. |
| Inventory health | `100 × healthy items / observed items`; healthy means quantity is strictly above its item low-stock threshold. |
| Order completion rate | In the rolling 24-hour window, measure served/completed orders among non-cancelled orders that are terminal or older than the configured order-delay warning. Newly placed orders are not immediately penalized. |
| Reservation efficiency | For ended, non-cancelled reservations with a recorded outcome, measure seated/completed over seated/completed plus no-shows. Do not infer a no-show from a missing status. |
| Table utilization | `100 × occupied active tables / active tables` at calculation time; exclude only explicitly disabled/out-of-service tables. |
| Incident frequency | Start at 100 and deduct 35 per open critical, 15 per open warning, and 5 per open info incident in the rolling 24-hour window; clamp to `[0,100]`. |

If a component has no eligible observations, use a neutral 50, expose `observations: 0` and an `insufficient_data` marker, and keep the approved weight rather than reweighting the other components. A successfully queried incident window with zero open incidents is observed as a score of 100. Include per-component score, weight, observation count, and formula details in the response so the aggregate remains explainable. Threshold defaults (15/25 minutes for kitchen, 20 minutes for order delay) are recommendations only when a restaurant has no configured value; do not store a precomputed score or let it mutate operations. The MongoDB snapshot is capped at 2,000 documents per collection; the response exposes any capped collection names so a score based on a partial sample is visible. `GET /api/v1/healthscore` uses the approved `dashboard:operations:read` permission and the signed principal's restaurant ID (Manager, Administrator, Reception); clients cannot select another tenant.

## 8. AI, real-time events, and notifications — approved baseline

- Use Gemini server-side; keep the model name configurable through `GEMINI_MODEL` and the key in `GEMINI_API_KEY`.
- Send only incident evidence and a small operational context snapshot; omit unnecessary customer PII.
- AI output is advisory and cannot change operational records or resolve incidents.
- Validate structured JSON output. Use deterministic, incident-specific fallback recommendations for timeout, quota, or invalid output; label their source as fallback.
- Use the proposed JSON fields in the original implementation draft: summary, root cause, priority, actions with rationale/expected impact, and confidence.
- Use the proposed WebSocket event envelope and event names for order, reservation, inventory, incident, recommendation, notification, and health-score changes. Authenticate connections and scope them by restaurant.
- Persist in-app notifications and deliver them in real time over WebSockets. External SMS/push and non-auth email delivery are deferred until providers are selected.

### Pending real-time/AI details

Exact Gemini model ID, reconnect/replay guarantees, event-level authorization, and notification retention/read-state rules remain pending. No API keys or provider secrets are to be committed.

## 9. Database-fallback scope — approved for MVP

Include transient retry with backoff, cached menu/configuration reads, a clear degraded/read-only banner, and a timestamp on cached dashboard data. When the database is unavailable, disable/reject writes; do not accept offline orders/reservations into a local queue.

Defer durable queued writes and emergency offline mode. This supersedes the earlier fallback acceptance criteria requiring queued orders to synchronize; update the test plan and demo criteria accordingly. The legacy queue/synchronization design remains a future option, not MVP behavior.

## 10. Frontend, backend, and developer setup — approved baseline

- One repository with `frontend/` (Next.js App Router) and `backend/` (Express API).
- TypeScript for both apps, npm and committed lockfiles.
- Initial frontend scaffold versions: Next.js `16.4.0`, React `19.3.0`, Tailwind CSS `4.3.3`; the lockfile is authoritative for the resolved dependency tree.
- Pin Node.js `24.21.0` in the repository `.nvmrc`; use Node 24 LTS for both apps. Re-check the official [Node.js release schedule](https://github.com/nodejs/release) before future major upgrades.
- Production data target: MongoDB Atlas. Local development uses MongoDB `8.0` via root `compose.yaml`, bound to loopback with a named data volume; do not expose the unauthenticated dev container to a network.
- Use the official MongoDB Node.js driver `mongodb` `7.7.0`; Mongoose is not selected. Atlas provisioning/credentials are deferred. No connection string or other secret is committed.
- Commit placeholder names only in app-specific `.env.example` files; never commit real `.env`/`.env.local` values. Current names are `NODE_ENV`, `MONGODB_URI`, `SEED_DEMO_PASSWORD`, `PORT`, `JWT_SECRET`, `WEB_ORIGIN`, `GOOGLE_CLIENT_ID`, `EMAIL_PROVIDER`, `EMAIL_API_KEY`, and frontend `NEXT_PUBLIC_API_BASE_URL`/`NEXT_PUBLIC_GOOGLE_CLIENT_ID`. The selected Google ID-token verification flow needs the public client ID on both sides but no client secret. Keep `EMAIL_PROVIDER=mock` for local development; provider credentials and the exact Gemini model remain unset until approved/configured.
- Build responsive customer flows and role-specific restaurant views with loading, empty, error, and degraded states.
- Draft a visual design proposal for owner review before committing to brand-specific colors/assets.

## 11. CI, testing, performance, and deployment — approved baseline

- Use Biome `2.5.15` for linting/formatting and run typecheck, unit/integration tests, and production builds for both apps in pull-request CI. Do not deploy from pull requests.
- The initial CI workflow runs install/audit/Biome/typecheck/build checks for each app package present; it runs tests when a test script is configured. The backend currently has process-liveness, MongoDB-configuration, and schema/index-plan tests; frontend feature tests and deployment are not implemented. Backend CI is gated on `backend/package.json` so the workflow also works before that package is merged.
- Biome replaces the generated Next ESLint configuration: its dependency tree contained five high-severity development-only audit findings with no compatible automatic fix; `npm audit --omit=dev` reported zero production dependency findings. Do not force-downgrade `eslint-config-next` to an incompatible Next 14 version.
- Interpret existing performance targets as p95: dashboard under 2 seconds, REST API under 500 ms, incident detection under 5 seconds, and AI response under 10 seconds. Test workload/concurrency and dataset size are still pending.
- Keep Vercel (frontend), Render (backend), and MongoDB Atlas as the planned deployment platforms. Do not deploy without owner-provided accounts, domains, and secrets.
- Use HTTPS, input validation, least-privilege authorization, auth rate limits, audit events without secrets, and restaurant-level data scoping.

## 12. Backlog status policy — approved

| Status | Meaning |
| --- | --- |
| To Do | Not started |
| In Progress | Work started; not yet ready for review/push |
| Ready to Push | Verified local work is committed; no remote push has been made by this session |
| In Review | PR is open and awaiting review |
| Complete | Definition of Done is met and the PR is merged |
| Blocked | Work cannot proceed until a documented dependency/decision is resolved |

The existing GitHub repository means S1-01 is marked Complete. S1-02, S1-03, S1-04, and S3-11 are Ready to Push. S1-05 is In Progress: local MongoDB configuration is being added first; Atlas connectivity is deferred. S1-06 is Ready to Push with secret-free environment examples. S1-07 is In Progress while deployment/CD and GitHub-run confirmation are outstanding. S1-08 is In Progress while its recommended schema and index baseline is implemented and verified. S1-09 is In Progress while the JWT/session implementation is on the local S1-09 branch. S1-10 is In Progress while Google ID-token verification and account linking are built on S1-09. S1-11 is In Progress while pending-user Email/OTP registration is implemented on S1-10. S1-12 is In Progress while the approved MVP role middleware is implemented on local area branch `feature/backend`; operation-route enforcement remains pending. S1-13 is In Progress with a development-only idempotent seed dataset on the same branch; local MongoDB execution remains unverified. Locally committed work is not Complete until review and merge.

## 13. Remaining decisions before corresponding modules

- Final API response/error/pagination contract and exact runtime/document validation rules for each workflow; S1-08 establishes only the initial native-driver types and index baseline.
- Remaining order and reservation transition permissions and opening-hour rules.
- Incident deduplication/status lifecycle and queue-wait estimate formula.
- Health-score component normalization and analytics/reporting definitions.
- MongoDB Atlas cluster provisioning, credential delivery, and network allow-listing.
- Production `JWT_SECRET` delivery and the deployment-specific `WEB_ORIGIN` value.
- Exact email provider and Google OAuth configuration.
- WebSocket reconnect/replay/auth detail and notification retention.
- Visual design approval and accessibility conformance level.
- Deployment domains, CI branch protection/reviewer/merge policy.
- Performance-test concurrency and dataset size.

These open points should be clarified in the owning canonical documents before work reaches the affected APIs or features.
