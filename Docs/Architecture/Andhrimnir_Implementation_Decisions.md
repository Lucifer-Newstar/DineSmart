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
- Do not add TTL deletion or incident-deduplication constraints before retention and incident-lifecycle rules are specified. S1-08 adds indexes, not MongoDB JSON Schema validators; exact validation remains pending.

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

Recalculate after relevant operational events and at least hourly. The approved weight distribution does not yet define each component's normalization formula or the final behavior when data is missing; those are pending before health-score implementation.

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
- Commit placeholder names only in app-specific `.env.example` files; never commit real `.env`/`.env.local` values. Current names are `NODE_ENV`, `MONGODB_URI`, `PORT`, `JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_PROVIDER`, `EMAIL_API_KEY`, and frontend `NEXT_PUBLIC_API_BASE_URL`. Keep `EMAIL_PROVIDER=mock` for local development; provider credentials and the exact Gemini model remain unset until approved/configured.
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

The existing GitHub repository means S1-01 is marked Complete. S1-02, S1-03, S1-04, and S3-11 are Ready to Push. S1-05 is In Progress: local MongoDB configuration is being added first; Atlas connectivity is deferred. S1-06 is Ready to Push with secret-free environment examples. S1-07 is In Progress while deployment/CD and GitHub-run confirmation are outstanding. S1-08 is In Progress while its recommended schema and index baseline is implemented and verified. Locally committed work is not Complete until review and merge.

## 13. Remaining decisions before corresponding modules

- Final API response/error/pagination contract and exact runtime/document validation rules for each workflow; S1-08 establishes only the initial native-driver types and index baseline.
- Remaining order and reservation transition permissions and opening-hour rules.
- Incident deduplication/status lifecycle and queue-wait estimate formula.
- Health-score component normalization and analytics/reporting definitions.
- MongoDB Atlas cluster provisioning, credential delivery, and network allow-listing.
- Exact email provider and Google OAuth configuration.
- WebSocket reconnect/replay/auth detail and notification retention.
- Visual design approval and accessibility conformance level.
- Deployment domains, CI branch protection/reviewer/merge policy.
- Performance-test concurrency and dataset size.

These open points should be clarified in the owning canonical documents before work reaches the affected APIs or features.
