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

- Global success/error envelopes, pagination/filter conventions, and validation/error codes remain draft for routes that are not implemented. S2-03 defines a locally tested reservation contract below; this is an assistant recommendation, not a separate owner approval.
- Remaining endpoint operations include individual order detail, inventory creation, table listing, staff creation/deactivation, and notification read state. S2-04 now defines and locally implements customer order creation/history/cancellation; S2-05 locally implements the recommended tenant-scoped kitchen queue and staff order progression; OTP request/verify and reservation cancellation/table assignment also have local implementations.
- Exact runtime/document validation rules, optionality for unresolved workflow fields, restaurant onboarding, and remaining workflow constraints still require definition as their APIs are implemented.

The canonical endpoint inventory is in the [API Specification](Andhrimnir_API_Specification.md). The S1-08 field list is a persistence baseline, not a substitute for finalizing API payloads and domain validation before the remaining workflows are implemented.

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

- Reservation day-specific/holiday hours, table combinations, automatic no-show jobs, and advanced recurrence rules remain outside S2-03. The local reservation contract below uses the current static `opensAt`/`closesAt` shape when present; unconfigured hours do not impose an opening-window check.
- S2-04 implements customer order placement, history, and cancellation. S2-05 now defines an assistant-recommended split between kitchen item preparation and front-of-house order progression; table/fulfillment assignment remains deferred.

### S2-03 reservation endpoint recommendation

The following S2-03 contract was selected by the assistant on the owner's direction to choose and document unspecified module decisions. It is **not a separate owner approval**. Backend routes have local unit/HTTP coverage; the frontend passes lint, typecheck, and production build but has no automated UI test. Live MongoDB persistence is not verified.

- `POST /api/v1/reservations`: an authenticated Customer sends `restaurantId`, `partySize`, timezone-qualified `startAt`, and optional `notes`. The API accepts only an active restaurant, derives/creates the caller's global Customer profile from the active Customer user, computes `endAt` as 90 minutes later, and creates an unassigned `Awaiting` request. The customer cannot supply `customerId`, status, or table assignment. Restaurant selection is from the public demo configuration for now; general restaurant discovery remains a separate endpoint decision.
- Party size is recommended at 1–12 people; notes are trimmed and capped at 500 characters. `startAt` must be in the future, align to a 30-minute wall-clock slot in the restaurant time zone, and fit within the configured static daily opening window when both `opensAt` and `closesAt` are present. This limit is a recommendation; no owner-specific party-size maximum was selected.
- Reception, Manager, and Administrator can also create for an existing Customer profile, with tenant ID derived from the signed principal. Staff may optionally assign one same-restaurant table; table capacity and overlapping non-cancelled reservation checks apply. A table assignment yields `Confirmed`; without one, status is `Awaiting`. Table combinations are not modeled.
- `GET /api/v1/reservations`: Customers see only their own records across restaurants; Reception, Manager, and Administrator see records for their signed restaurant. Results are sorted by start time, capped at 500, and include `truncated`. Responses include restaurant name, guest display name, and table number so cross-restaurant Customers can identify each visit; customer email/phone are omitted.
- `PUT /api/v1/reservations/{id}`: Customers may only cancel their own reservation before start. Restaurant staff may update time, party size, notes, table assignment, or status, subject to signed tenant scope, table capacity/conflict checks, and the transition map `Awaiting → Confirmed/Cancelled`, `Confirmed → Seated/Cancelled/NoShow`, `Seated → Completed`. Staff may mark NoShow only after the approved 15-minute grace period; automatic no-show processing is not implemented.
- Responses use `{ reservation }` or `{ reservations, truncated }`; errors use `{ error: { code, message } }`. Reservation writes use an optimistic `updatedAt` check. Overlap detection remains a read-before-write application check and is not atomic across multiple API processes; production requires an atomic reservation lock/transaction strategy before promising race-free seating.
- The frontend booking form requires a signed-in Customer, returns to `/book` after login/registration, posts to the API, and displays the saved status without claiming a confirmed table. Customer and staff dashboards read persisted reservation records; fallback sample data is explicitly labeled and cannot masquerade as saved updates.

### S2-04 customer order placement recommendation

This is the assistant-selected S2-04 contract on the owner's instruction to choose and document unspecified module decisions. It is **not a separate owner approval**. API/UI changes are locally implemented and tested where possible; live MongoDB persistence and browser E2E remain unverified.

- `GET /api/v1/menu?restaurantId={id}` is public/read-only and returns an active restaurant plus up to 200 currently available menu items with integer minor-unit prices, category, dietary/allergen labels, and `truncated`. It does not reveal unavailable items or customer data.
- `POST /api/v1/orders` requires an authenticated Customer and accepts only `{ restaurantId, items: [{ menuItemId, quantity }] }`. The server derives the active global Customer profile from the signed-in user, verifies the restaurant is active and every menu item belongs to that restaurant and is available, snapshots the current name/price, and computes `totalMinor`/currency. Caller-supplied user/customer ID, prices, totals, status, table, or fulfillment fields are rejected. The order starts at `Created` with server-set `Created` timestamps.
- Cart bounds are recommended at 1–20 distinct lines, 1–20 units per line, and 50 total units. Repeated item IDs, invalid quantities, unavailable/cross-restaurant items, and unsafe money arithmetic are rejected. Currency is carried on the order; values remain pre-bill totals only.
- `GET /api/v1/orders/history` returns at most 100 of the authenticated Customer's own orders across restaurants, newest first, with restaurant display name and item snapshots; response includes `truncated`. It does not reveal email, phone, or staff details.
- `PUT /api/v1/orders/{id}/cancel` accepts an empty body and is permitted only for the owner while status is `Created`. The repository update condition includes order ID, Customer ID, `Created`, and the observed `updatedAt`, so it will not overwrite a concurrent acceptance; S2-05 staff header transitions likewise condition on the observed status and `updatedAt`.
- Errors use `{ error: { code, message } }`; expected codes include `invalid_order_request`, `invalid_order_lines`, `duplicate_order_item`, `invalid_order_quantity`, `order_quantity_limit_exceeded`, `restaurant_not_found`, `customer_profile_required`, `order_menu_item_unavailable`, `order_cannot_be_cancelled`, and `order_changed`.
- The customer menu/cart uses only the live public API result; if unavailable, no preview items are rendered or submitted. A cart may be held in session storage solely through sign-in/registration; the server rechecks menu items and prices on submission. `/orders` displays only authenticated customer history and allows cancellation while `Created`.
- Payment/tax capture, fulfillment mode/table assignment, automatic inventory deduction, and staff status progression remain out of S2-04. S2-05 defines the recommended staff preparation/serving transitions below; table and fulfillment assignment remain deferred.
- The existing `orders` and `order_items` collections require multiple writes. The recommendation is insert item snapshots first, then create the visible header, with best-effort cleanup on failure. A standalone local MongoDB cannot transact the writes; a process crash can leave orphan item documents, so reconciliation/transaction behavior and live persistence must be validated before production.

### S2-05 kitchen queue and restaurant order progression recommendation

This is an assistant-selected contract to proceed with the next sequential backlog item; it is **not a separate owner approval**. Backend implementation, app integration, and fake-backed tests are committed locally on `main`; S2-05 is Ready to Push. Live MongoDB/index/concurrency and process-crash behavior remain unverified, and the staff dashboard remains a separate S2-07 UI task.

- `GET /api/v1/kitchen/queue` requires `kitchen:queue:read` and a signed restaurant-scoped principal. Kitchen Staff, Manager, and Administrator see only their own restaurant's `Accepted`, `Preparing`, and `Ready` tickets, oldest first, up to 200 with `truncated`. Return order/item identifiers, item snapshots, quantities and preparation statuses; exclude customer contact details and menu prices.
- `PUT /api/v1/kitchen/queue/{orderId}` requires `kitchen:queue:update`; request is exactly `{ itemId, preparationStatus }`. Only `Created → Preparing → Ready` item transitions are accepted, for an item belonging to the same-restaurant order. Repeating the current status is idempotent and retries parent status aggregation after a partial failure.
- `PATCH /api/v1/orders/{id}/status` requires `orders:write` and a signed restaurant-scoped principal. Reception, Manager, and Administrator may progress only `Created → Accepted`, `Ready → Served`, and `Served → Completed`. `Preparing` and `Ready` order headers are derived from item statuses; kitchen users do not directly accept, serve, or complete an order. Customers retain cancellation only while the order is `Created`; staff cancellation is not added here.
- The approved role matrix says Reception can create/read/update restaurant orders, but the pre-existing permission list omitted `orders:write`. Recommend adding that permission to Reception, with a regression test; this aligns the existing policy rather than expanding it and is not a separate owner approval.
- The order header advances to `Preparing` when the first item begins preparation, and to `Ready` when every item is `Ready`. Conditional item-status and header-status/`updatedAt` writes protect against stale concurrent changes. The customer and staff APIs never trust client-supplied restaurant scope.
- Local standalone MongoDB cannot atomically update the separate order and item documents. Item-first writes, conditional status changes and idempotent retries reduce inconsistency but do not eliminate a process-crash window; record and test this limit rather than claiming transaction safety. The staff dashboard UI is integrated locally under S2-07; fallback sample queue controls remain explicitly labeled and are not persisted.

### S2-06 inventory endpoint recommendation

The following contract is an assistant recommendation dated 2026-10-10, not a separate owner approval: `GET /api/v1/inventory` uses `inventory:availability:read` and derives tenant scope from the signed principal. Manager/Administrator receive quantity, unit, low-stock threshold, and last-adjusted timestamp; Reception/Kitchen Staff receive item name and low/available status only. `PUT /api/v1/inventory/{id}` requires `inventory:write`, sets an absolute non-negative physical count, accepts an optional non-negative low-stock threshold, and stamps `lastAdjustedAt` server-side. List results are sorted by name, capped at 2,000, and expose whether they were truncated. The endpoint does not auto-deduct stock from orders or create incidents.

### S2-07 staff dashboard order-feed recommendation

This is an assistant-selected recommendation dated 2026-10-11 to close the missing staff list-route gap discovered during S2-07 review; it is not a separate owner approval. Keep Customer history at `GET /api/v1/orders/history`; expose a distinct `GET /api/v1/orders` for authenticated restaurant staff, with `orders:read` and signed tenant scope. Reception, Manager and Administrator receive active `Created`, `Accepted`, `Preparing`, `Ready`, and `Served` orders; Kitchen Staff receive only `Accepted`, `Preparing`, and `Ready`. The server selects role-specific statuses (no client filters), sorts oldest first, caps at 200 with `truncated`, and returns order/item IDs, operational statuses, names/quantities, and timestamps without customer identity/contact or prices/totals. The repository must apply `restaurantId` to both order and item reads.

The Orders view now consumes this feed and uses the authorized staff status transitions; the Kitchen view consumes `GET /api/v1/kitchen/queue` and its item-level update route. Kitchen Staff may change preparation statuses but must not accept, serve, or complete headers. Loading/unavailable/preview states remain explicit; local preview actions are not presented as saved. The feed and these two views pass local backend tests/build and frontend lint/typecheck/build on Node `24.21.0`. Assistant-recommended scope treats the dashboard shell and operational flows available in this stage as S2-07; S2-09 live operational analytics is now implemented separately, and S2-12 now provides supported-data backend incident rules/API without an incident dashboard UI; role-based navigation and own-order summary are locally implemented under S2-11, while browser E2E remains outstanding. These boundaries are not separate owner approvals. S2-07 is **Ready to Push** on local `main`; live MongoDB validation is deferred to the final database/deployment phase, and no browser E2E result is implied.

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

### S2-12 incident lifecycle and local implementation contract

On 2026-10-11, the user selected condition-based auto-resolution and a fresh incident record if the condition recurs. This is the owner-selected lifecycle direction. The remaining details below are assistant implementation recommendations, not additional owner approvals.

- Keep one active incident per `(restaurantId, type, affectedEntity.type, affectedEntity.id)`. While its condition remains true, update the same record's current severity, evidence snapshot, root-cause summary, and `updatedAt`. When the condition clears, set `status: "resolved"`, `resolvedAt`, and `resolutionReason: "condition_cleared"`. A later recurrence creates a new incident ID rather than reopening historical data.
- Do not throttle incident persistence. Recommend a five-minute notification cooldown keyed by the same incident identity when notification fan-out is implemented; that cooldown does not suppress incident updates and is not implemented here. Notification delivery remains separate under S2-10/S2-13.
- Evaluate after successful order, kitchen, inventory, and reservation writes; schedule process-local checks at upcoming time-threshold boundaries and at the end of active reservation conflicts; and run a startup plus hourly active-restaurant sweep to recover after restarts. The local scheduler and timer state are volatile; no multi-replica or live-database behavior is claimed.
- Use the approved warning/critical thresholds. For missing restaurant threshold values, use the documented approved numeric defaults; reject invalid threshold pairs in favor of those defaults. Inventory uses each item's `lowStockThreshold`.
- Locally available signals are kitchen item/order delays, active kitchen-order congestion, inventory shortage, and reservation/table conflicts. Queue congestion and wait-based table congestion remain deferred until waitlist data and its approved estimate formula are implemented; staff shortage remains deferred as already approved. For reservation conflicts, the assistant recommendation is warning for table overlap/over-capacity and critical for a confirmed reservation assigned to a missing or disabled table.
- `GET /api/v1/incidents` is Manager/Administrator-only, derives tenant scope from the signed principal, returns a bounded newest-first list, and has no client-selected tenant or filters. No manual resolve route is needed for the selected auto-resolution behavior.

The queue-wait estimate formula remains undecided and must not be invented or used for queue/wait-based table rules.

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

The owner-approved cadence is recalculation after relevant operational events and at least hourly. The local implementation (assistant recommendation dated 2026-10-11) uses a volatile, per-process cache rather than persisting a precomputed score: `GET /api/v1/healthscore` returns a result younger than one hour, otherwise calculates on demand; successful order, kitchen-order, inventory, and reservation writes invalidate the tenant entry and request an asynchronous refresh. Concurrent refreshes are coalesced, and an event arriving during a refresh requests one additional pass. Once MongoDB and schema initialization succeed, the server performs an immediate sweep and then refreshes active restaurants hourly; shutdown clears the timer. Cache loss on process restart is intentional, and no score is stored in MongoDB. Tables and incidents are part of the score snapshot. S2-12 incident persistence now requests a health-score refresh after active incidents are upserted or resolved, so the cache refresh observes the persisted incident state; future table write APIs must call the same event hook when implemented. This local cache is not shared across API processes: multi-replica deployment needs a shared cache or single-scheduler design to avoid divergent cached responses and duplicate work. These local tests do not replace deferred live MongoDB/Atlas validation. The weights are owner-approved; the following score normalization and missing-data behavior are **assistant recommendations dated 2026-10-10**, not separate owner approvals:

| Component | Recommended normalization |
| --- | --- |
| Kitchen efficiency | Average completed prep duration in a rolling 24-hour window. Score 100 at/below `kitchenDelayWarningMinutes`; fall linearly to 0 at `kitchenDelayCriticalMinutes`; clamp to `[0,100]`. |
| Inventory health | `100 × healthy items / observed items`; healthy means quantity is strictly above its item low-stock threshold. |
| Order completion rate | In the rolling 24-hour window, measure served/completed orders among non-cancelled orders that are terminal or older than the configured order-delay warning. Newly placed orders are not immediately penalized. |
| Reservation efficiency | For ended, non-cancelled reservations with a recorded outcome, measure seated/completed over seated/completed plus no-shows. Do not infer a no-show from a missing status. |
| Table utilization | `100 × occupied active tables / active tables` at calculation time; exclude only explicitly disabled/out-of-service tables. |
| Incident frequency | Start at 100 and deduct 35 per open critical, 15 per open warning, and 5 per open info incident in the rolling 24-hour window; clamp to `[0,100]`. |

If a component has no eligible observations, use a neutral 50, expose `observations: 0` and an `insufficient_data` marker, and keep the approved weight rather than reweighting the other components. A successfully queried incident window with zero open incidents is observed as a score of 100. Include per-component score, weight, observation count, and formula details in the response so the aggregate remains explainable. Threshold defaults (15/25 minutes for kitchen, 20 minutes for order delay) are recommendations only when a restaurant has no configured value; do not store a precomputed score or let it mutate operations. The MongoDB snapshot is capped at 2,000 documents per collection; the response exposes any capped collection names so a score based on a partial sample is visible. `GET /api/v1/healthscore` uses the approved `dashboard:operations:read` permission and the signed principal's restaurant ID (Manager, Administrator, Reception); clients cannot select another tenant.

### S2-09 analytics charts — assistant-selected implementation recommendation (2026-10-11)

No detailed analytics contract is owner-approved beyond the backlog story and canonical `GET /analytics` inventory. To proceed locally, use Manager/Administrator `analytics:read` with the signed restaurant scope and reject client-selected tenants. `GET /api/v1/analytics` defaults to `range=7d` and permits only `7d` or `30d`; it returns UTC-safe ISO period bounds, the restaurant's validated IANA timezone (fallback `UTC`), daily order/reservation counts, hour-of-day order volume, fulfilled/cancelled/in-progress counts, average kitchen preparation minutes where `Preparing` and `Ready` timestamps exist, and current low/out-of-stock counts. Queries are tenant-filtered and bounded to 2,000 records per collection, with truncated collection names exposed. This is operational reporting, not financial accounting: do not label `orders.totalMinor` as revenue or average check because it is a pre-bill subtotal and payment/billing flows are not implemented; do not infer dine-in/takeaway/delivery mix from absent fulfillment fields. The UI should show live, loading, empty, and unavailable states without substituting sample figures for failed API data. No personal/guest data is needed in the response. The local implementation now follows this recommendation: the protected endpoint and dashboard expose live/loading/empty/unavailable states, daily and hourly order charts, outcome/preparation/reservation summaries, and current stock alerts; any capped collection is disclosed. No pre-bill totals, sample values, guest PII, or inferred service-mix percentages are presented as live analytics. Backend tests use fake repositories; local backend/frontend checks pass and S2-09 is **Ready to Push** on local `main`. Live MongoDB/Atlas behavior, browser E2E, remote CI, push, and merge remain unverified/deferred; these implementation details do not become owner-approved product requirements by being implemented.

## 8. AI, real-time events, and notifications — approved baseline

- Use Gemini server-side; keep the model name configurable through `GEMINI_MODEL` and the key in `GEMINI_API_KEY`.
- Send only incident evidence and a small operational context snapshot; omit unnecessary customer PII.
- AI output is advisory and cannot change operational records or resolve incidents.
- Validate structured JSON output. Use deterministic, incident-specific fallback recommendations for timeout, quota, or invalid output; label their source as fallback.
- Use the proposed JSON fields in the original implementation draft: summary, root cause, priority, actions with rationale/expected impact, and confidence.
- Use the proposed WebSocket event envelope and event names for order, reservation, inventory, incident, recommendation, notification, and health-score changes. Authenticate connections and scope them by restaurant.
- Persist in-app notifications and deliver them in real time over WebSockets. External SMS/push and non-auth email delivery are deferred until providers are selected.

### AI implementation recommendations (assistant-selected 2026-10-10)

These details implement the owner-approved Gemini/advisory/fallback baseline; they are recommendations, not separate owner selections:

- Use Google's official JavaScript SDK `@google/genai` `2.28.0` and default `GEMINI_MODEL=gemini-3.5-flash-lite`. As of 2026-10-10, Google lists this as a stable, cost-conscious Flash-Lite model; model access and quality must be validated with the supplied project key. Keep the model configurable. See [Google's model catalog](https://ai.google.dev/gemini-api/docs/models) and [official SDK release](https://github.com/googleapis/js-genai/releases/tag/v2.28.0).
- Use constrained JSON generation and validate every field locally. Match recommendation priority to the incident's existing severity; accept only one to three actions and confidence in `[0,1]`.
- Build a tenant-filtered, bounded operational context from incident evidence and aggregate order, stock, reservation, and restaurant-threshold signals. Whitelist trigger fields, strip email/phone-like strings, and omit customer names, contact details, customer IDs, and database IDs before sending to Gemini.
- Persist one current recommendation per incident with a unique `(restaurantId, incidentId)` key. A new generation replaces that incident's current recommendation rather than creating an unbounded history.
- If `GEMINI_API_KEY` is absent, the provider times out, quota is reached, or JSON validation fails, persist a deterministic incident-specific fallback and mark `source=fallback`. The fallback is advisory and never writes an operational state change.
- Provide `POST /api/v1/incidents/{incidentId}/recommendations` for authorized manager/admin generation and `GET /api/v1/recommendations` for tenant-scoped retrieval. Keep API key and all provider calls server-side.

### S2-10 notification API and read-state recommendation (assistant-selected 2026-10-11)

These details fill gaps for the locally verifiable S2-10 API. They are assistant recommendations made under the instruction to choose and document unspecified module details; they are not separate owner approvals.

- Keep notification creation server-side. A trusted producer may persist a notification with its restaurant, recipient, type, title, body, optional related entity, and timestamps; there is no public create endpoint. Do not invent an automatic event-to-recipient mapping before that policy is agreed.
- `GET /notifications` accepts no client-selected tenant or recipient filter. A Customer sees only notifications addressed to the authenticated user across restaurants. Reception, Manager, and Administrator see only notifications addressed to that same authenticated user and scoped to the restaurant in the signed principal. This interprets the existing `notifications:restaurant:read` permission conservatively; it does not expose other staff members' notification records. Kitchen Staff have no notification permission until the role matrix is deliberately extended.
- Return the newest 100 records ordered by `createdAt` then `_id` descending, plus `truncated` and the total unread count for the authenticated user's scope. Do not serialize `recipientUserId`.
- `PATCH /notifications/{id}/read` accepts no mutable fields, sets `readAt` once, and is idempotent. A Customer can mark only their own record across restaurants; restaurant staff can mark only their own record within their signed tenant. Return 404 for absent or out-of-scope records to avoid resource enumeration. No mark-all operation is included.
- Validate trusted create inputs as non-empty after trimming, with `type` and related-entity type capped at 80 characters, `title` at 160, and `body` at 2,000. Store new notifications unread; leave `deliveredAt` unset until a delivery transport is implemented.
- Do not add TTL cleanup until retention is decided. Automatic critical-incident notification creation, WebSocket delivery/replay, and provider delivery are not part of this API-only implementation; WebSocket work remains S2-13 and external SMS/push/non-auth email remain deferred under the approved baseline.

### Pending real-time/AI details

Reconnect/replay guarantees, event-level authorization, producer-to-recipient event mapping, and notification retention remain pending. The read-state behavior above is an assistant-selected S2-10 recommendation rather than an owner-approved product decision. The selected Gemini model/API key still require a live credential check. No API keys or provider secrets are to be committed.

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
- Commit placeholder names only in app-specific `.env.example` files; never commit real `.env`/`.env.local` values. Current names are `NODE_ENV`, `MONGODB_URI`, `SEED_DEMO_PASSWORD`, `PORT`, `JWT_SECRET`, `WEB_ORIGIN`, `GOOGLE_CLIENT_ID`, `EMAIL_PROVIDER`, `EMAIL_API_KEY`, and frontend `NEXT_PUBLIC_API_BASE_URL`/`NEXT_PUBLIC_GOOGLE_CLIENT_ID`. The selected Google ID-token verification flow needs the public client ID on both sides but no client secret. Keep `EMAIL_PROVIDER=mock` for local development; a real email provider and Gemini API key still require configuration. `GEMINI_MODEL` defaults to the assistant-recommended `gemini-3.5-flash-lite` and remains configurable.
- Build responsive customer flows and role-specific restaurant views with loading, empty, error, and degraded states.
- Draft a visual design proposal for owner review before committing to brand-specific colors/assets.

### S2-11 role-based dashboard presentation — local implementation verification

S2-11 follows the approved five-role matrix and does not expand server authorization. The Customer entry renders an own-account portal, including a recent order summary from `GET /api/v1/orders/history` and cross-restaurant own reservations; order totals/prices are not needed for this dashboard summary. Reception navigation includes Orders, Reservations, and availability-only Inventory, but not incidents, AI recommendations, or Analytics. Kitchen Staff sees relevant Orders, Kitchen, and availability-only Inventory, with no Reservations, incidents, Analytics, or AI recommendations. Manager/Administrator retain the restaurant-wide workspace. A stale selected section resolves to Overview after a role change, and navigation events are permission-filtered. Recommendation and review state is tagged with the active user/restaurant/role scope and immediately falls back to preview/unreviewed when that scope changes; Analytics remounts on the same scope key, aborting the prior page's in-flight request. Other tenant-bound feeds clear when the new session's requests begin and ignore aborted responses. These are presentation and client-state hygiene only: backend permissions, signed tenant scope, and ownership checks remain authoritative. Frontend tests cover the role matrix and scope-gated value helper; browser E2E and live database behavior remain unverified. S2-11 is Ready to Push locally, not Complete.

## 11. CI, testing, performance, and deployment — approved baseline

- Use Biome `2.5.15` for linting/formatting and run typecheck, unit/integration tests, and production builds for both apps in pull-request CI. Do not deploy from pull requests.
- The initial CI workflow runs install/audit/Biome/typecheck/build checks for each app package present; it runs tests when a test script is configured. The backend has process-liveness, MongoDB-configuration, schema/index-plan, and service/HTTP tests; the frontend now has Node-native role/access policy tests, but no component/browser E2E suite. Deployment remains deferred. Backend CI is gated on `backend/package.json` so the workflow also works before that package is merged.
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

The integrated local `main` contains the former backend, AI, and frontend area work (integration commit `70f5fb4`); all other local branch references were deleted at the owner's direction. No remote is configured, and no push or GitHub Actions run has been made. The existing GitHub repository means S1-01 is marked Complete. S1-02, S1-03, S1-04, and S3-11 are Ready to Push. S1-05 is In Progress: local-first MongoDB is the selected development approach, but Docker/`mongod` is not available here; Atlas connectivity is deferred. S1-06 is Ready to Push with secret-free environment examples. S1-07 is In Progress pending remote GitHub-run and deployment/CD confirmation; the local CI-equivalent workflow passes on the integrated tree. S1-08 is In Progress while live index verification remains unavailable. S1-09/10/11 remain In Progress pending live MongoDB, email-provider, and Google credential checks. S1-12 middleware is integrated with the AI, inventory, health-score, reservation, and order routes; additional operations enforcement remains pending. S1-13's development-only seed dataset is committed but has not been run against live MongoDB. S2-06's tenant-scoped inventory API/UI is locally verified and Ready to Push on `main`; live MongoDB/index validation is deferred to the final database/deployment stage. S2-08's health-score API/UI and event/hourly refresh are locally verified and Ready to Push on local `main`; live MongoDB/index verification is deferred to the final database/deployment stage. S3-01/02/04/13's AI flow is on `main` with fake-provider tests; live Gemini credentials and MongoDB persistence remain unverified. S2-01/02 and S3-03/05 remain In Progress; S2-11 role-based dashboard presentation is locally implemented and Ready to Push on `main`; S2-07 is Ready to Push after local dashboard integration checks. S2-03 reservation API and booking UI are locally tested and committed as Ready to Push pending live MongoDB/E2E verification. S2-04 is Ready to Push; the public menu/order API and customer menu/cart/history UI are locally implemented and checked, while live MongoDB persistence and browser E2E remain outstanding. S2-05 is Ready to Push on local `main`: tenant-scoped kitchen/order progression routes and fake-backed tests are committed and local backend checks pass; live MongoDB concurrency/process-crash behavior remains unverified. S2-07's staff Orders/Kitchen views now use the local order feed and kitchen routes; the dashboard UI is Ready to Push. S2-09 operational analytics is locally implemented and Ready to Push; remaining preview financial figures are not live revenue, incident reporting/rules remain in S2-12, and browser E2E for role-specific workflows remains unverified. No browser E2E/live database result is claimed. S2-10 is Ready to Push on local `main`: the recommended recipient-scoped persisted feed, server-only creation service, and idempotent read-state routes are locally tested; live MongoDB/index verification, automatic event-to-recipient generation, WebSocket delivery, retention, and UI integration remain outstanding, so AC-08 is not claimed as met. Other non-inventory operations are still pending. A local commit or merge alone does not mark a task Complete; required DoD, review, and merge criteria still apply.

## 13. Remaining decisions before corresponding modules

- Final API response/error/pagination contract and exact runtime/document validation rules for each workflow; S1-08 establishes only the initial native-driver types and index baseline.
- S2-05 locally implements the recommended staff order acceptance/preparation/serving transitions; table/fulfillment assignment remains deferred and direct staff cancellation is not included. Reservation day-specific/holiday hours remain outside S2-03.
- Incident deduplication/status lifecycle and queue-wait estimate formula.
- Health-score component normalization and owner acceptance of the assistant-recommended S2-09 analytics/reporting definitions.
- MongoDB Atlas cluster provisioning, credential delivery, and network allow-listing.
- Production `JWT_SECRET` delivery and the deployment-specific `WEB_ORIGIN` value.
- Exact email provider and Google OAuth configuration; owner-provided Gemini API key and a live credential check for the recommended model.
- WebSocket reconnect/replay/auth detail and notification retention.
- Visual design approval and accessibility conformance level.
- Deployment domains, CI branch protection/reviewer/merge policy.
- Performance-test concurrency and dataset size.

These open points should be clarified in the owning canonical documents before work reaches the affected APIs or features.
