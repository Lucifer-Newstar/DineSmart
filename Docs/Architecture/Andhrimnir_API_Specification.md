# Andhrímnir API Specification

## Canonical API Endpoint Inventory

This is the canonical endpoint inventory for the MVP. Paths below are relative to the approved `/api/v1` base path. The endpoint table consolidates the initial API design and later additions for authentication, reservations, billing, staff, waitlist, table management, and notifications. General request/response schemas and detailed authorization rules remain **draft** for routes not yet implemented; the locally selected S2-03 reservation and S2-04/S2-05 order contracts are team recommendations. See [Implementation Decisions](Andhrimnir_Implementation_Decisions.md). S1-09 implements login/refresh/logout; S1-10 adds Google ID-token login; S1-11 implements pending registration and OTP verification locally, pending real email-provider and live MongoDB validation. S2-03 adds locally unit/HTTP-tested reservation routes and a typechecked/production-built customer/staff UI; live MongoDB verification remains outstanding. S2-04 now has a locally implemented public active-menu read and customer order placement/history/cancellation with server-derived prices, plus a customer-facing menu/cart/history UI; local backend and frontend checks pass, while live MongoDB and browser E2E verification remain outstanding. S2-05 now locally implements a team-recommended, tenant-scoped kitchen queue and role-separated order lifecycle contract; service, repository, HTTP, and app-mount tests pass locally. Live MongoDB concurrency/crash behavior remains unverified; the S2-07 Orders/Kitchen views now consume these routes locally and the dashboard UI is Ready to Push; live MongoDB and browser/role review were not run. S2-09 now locally provides the recommended Manager/Administrator, signed-tenant-scoped analytics endpoint and live operational charts; fake-backed backend tests and local frontend checks pass. Revenue/accounting is explicitly excluded, and MongoDB/Atlas plus browser E2E remain unverified. S2-10 now locally provides recipient-scoped persisted notification retrieval and idempotent read-state APIs; fake-backed tests pass, but live MongoDB, automatic critical-incident notification generation/event-to-recipient mapping, retention, and notification UI remain outstanding. S2-13 now locally implements tested backend WebSocket transport; browser reconnect/UI and live database delivery remain unverified. S2-06 adds locally tested, tenant-scoped inventory list/manual-count routes; live MongoDB verification is deferred. S2-08 includes a locally tested tenant-scoped health-score endpoint plus event-triggered and hourly refresh; live MongoDB/Atlas validation is deferred to the final database/deployment stage. S3-01/02/04/13 add locally tested AI recommendation endpoints and fallback; live Gemini credentials and MongoDB persistence remain to be verified. S2-12 now locally implements supported incident rules, lifecycle persistence, a Manager/Administrator incidents API, operational write hooks, and scheduled reevaluation; live MongoDB/Atlas and notification delivery remain unverified. S2-15 now locally implements the recommended two-step password-reset API with service/repository/router tests; email-provider delivery and live MongoDB behavior remain unverified. S2-16 now locally implements the recommended tenant-scoped staff list/update API with service/repository/router/app tests; MongoDB verification remains outstanding. S2-17 now locally implements the documented FIFO/manual-seating waitlist API, table occupancy link, protected router, app composition, and tenant-filtered realtime invalidations; fake-backed local tests pass. S2-17 is Ready to Push on local `main`, not Complete; live MongoDB/index behavior and multi-process allocation remain unverified. S2-18 now locally implements the protected table status transition API, safe current-reference release checks, health-score/incident hooks, and tenant-filtered invalidation; all fake-backed tests pass. S2-18 is Ready to Push on local `main`, not Complete; live cross-collection consistency remains unverified.

| Method | Endpoint | Description | Owner |
| --- | --- | --- | --- |
| POST | /auth/register | Create a pending Customer account and request Email/OTP verification | Dhanush |
| POST | /auth/otp/request | Resend a registration verification code when eligible | Dhanush |
| POST | /auth/otp/verify | Verify registration code and activate the account | Dhanush |
| POST | /auth/login | Login user | Dhanush |
| POST | /auth/refresh | Rotate refresh session and renew access token | Dhanush |
| POST | /auth/logout | Secure logout | Dhanush |
| POST | /auth/google | Verify Google Identity Services ID token and start a session | Dhanush |
| POST | /auth/reset-password/request | Request a password-reset email code (generic response) | Dhanush |
| POST | /auth/reset-password/confirm | Consume a reset code, update password, and revoke refresh sessions | Dhanush |
| GET | /menu?restaurantId={id} | Public read-only live menu; sold-out items included and flagged `isAvailable: false` | Dhanush |
| GET | /menu/items | Manager/Administrator: the restaurant's full managed menu, sold-out items and prep fields included | Jegatheesan |
| POST | /menu/items | Manager/Administrator: create a menu item | Jegatheesan |
| PATCH | /menu/items/{id} | Manager/Administrator: update a menu item's details | Jegatheesan |
| PATCH | /menu/items/{id}/availability | Manager/Administrator: 86 an item or bring it back; broadcasts `menu.availability` | Jegatheesan |
| PUT | /menu/items/arrangement | Manager/Administrator: save the order of categories and items | Jegatheesan |
| DELETE | /menu/items/{id} | Manager/Administrator: archive a menu item (soft delete) | Jegatheesan |
| POST | /reservations | Create reservation | Jegatheesan |
| GET | /reservations | Get reservations | Jegatheesan |
| PUT | /reservations/{id} | Update reservation | Jegatheesan |
| GET | /waitlist | Read the signed-restaurant FIFO waitlist (Reception/Manager/Administrator) | Jegatheesan |
| POST | /waitlist | Add a walk-in party to the signed-restaurant waitlist | Jegatheesan |
| PUT | /waitlist/{id} | Resolve a waitlist party or seat it at a same-tenant available table | Jegatheesan |
| GET | /reservations/availability?restaurantId&date&partySize | Public: bookable time slots for one day and party size (S5-01) | Jegatheesan |
| GET | /reservations/{id}/availability?date | Customer: open slots for moving their own booking (S5-01) | Jegatheesan |
| GET | /reservations/{id}/table-suggestion | Reception/Manager/Administrator: the best-fit free table for a booking (S5-01) | Jegatheesan |
| GET | /booking-rules | Reception/Manager/Administrator: turn times, pacing, lead time, booking window, change cutoff (S5-01) | Jegatheesan |
| PUT | /booking-rules | Manager/Administrator: save the booking rules (S5-01) | Jegatheesan |
| GET | /waitlist/estimate?restaurantId&partySize | Public: the current walk-in wait quote in minutes (S5-01) | Jegatheesan |
| POST | /orders | Place customer order; server derives prices/status | Jegatheesan |
| GET | /orders | List tenant-scoped active staff orders; Kitchen Staff see kitchen-relevant statuses only | Jegatheesan |
| GET | /orders/history | Get own order history across restaurants | Jegatheesan |
| PUT | /orders/{id}/cancel | Cancel own order before acceptance | Jegatheesan |
| PATCH | /orders/{id}/status | Tenant-scoped restaurant order lifecycle progression (S2-05) | Jegatheesan |
| GET | /kitchen/queue | Get kitchen queue | Jegatheesan |
| PUT | /kitchen/queue/{orderId} | Update preparation status for an order item | Jegatheesan |
| GET | /inventory | List inventory; Manager/Administrator receive stock detail, Reception/Kitchen Staff receive availability only | Jegatheesan |
| PUT | /inventory/{id} | Manually set a stock count and optionally its low-stock threshold (Manager/Administrator) | Jegatheesan |
| GET | /dashboard | Dashboard data | Jegatheesan |
| GET | /incidents | Get bounded incidents for the signed-in restaurant (Manager/Administrator) | Navin |
| POST | /incidents/{id}/recommendations | Generate/regenerate an advisory AI recommendation for an incident (Manager/Administrator) | Navin |
| GET | /recommendations | Get tenant-scoped AI recommendations; optional `incidentId` filter | Navin |
| GET | /analytics | Get analytics | Jegatheesan |
| GET | /healthscore | Get tenant-scoped weighted 0–100 health score and component explanations | Navin |
| GET | /bills/{id} | Get bill | Jegatheesan |
| GET | /bills/order/{orderId} | Get bill by order | Jegatheesan |
| POST | /bills | Generate bill | Jegatheesan |
| GET | /staff | List the signed-tenant staff roster (Manager/Administrator) | Jegatheesan |
| PUT | /staff/{id} | Update an existing staff role or active state (Manager/Administrator) | Jegatheesan |
| PUT | /thresholds | Configure thresholds | Navin |
| PUT | /tables/{id}/status | Staff-directed tenant-scoped table status transition | Jegatheesan |
| GET | /notifications | List the authenticated recipient's notifications; customer history spans restaurants, staff is scoped to its signed restaurant and own recipient ID | Gokul |
| PATCH | /notifications/{id}/read | Idempotently mark the authenticated recipient's own notification as read | Gokul |
| POST | /notifications/read-all | Mark every unread notification of the authenticated recipient as read (S5-04) | Gokul |
| GET | /notifications/preferences | The caller's optional notification categories and whether each is on (S5-04) | Gokul |
| PUT | /notifications/preferences | Turn the caller's optional notification categories on or off (S5-04) | Gokul |

## S5-01 Reservations 2.0: availability, booking changes and waitlist estimates

This section extends S2-03. It describes the local implementation on `main`, backed by route and service tests and the `reservations.spec.ts` / `customer-booking.spec.ts` end-to-end specs run against a local MongoDB. It has not been verified against MongoDB Atlas or a deployed environment.

**Booking rules.** Each restaurant stores `bookingRules` (defaults apply when unset): `turnTimes` (party size bands with minutes, 30 to 300; defaults 90 min up to 4 guests, 120 up to 6, 150 up to 12), `pacingCoversPer15Min` (default 20 covers that may start in any 15-minute window), `minLeadMinutes` (default 60), `maxAdvanceDays` (default 60) and `changeCutoffMinutes` (default 120). The end time of every booking is now the start plus the turn time for its party size, not a fixed 90 minutes.

| Route | Authorization | Request and behavior | Success response |
| --- | --- | --- | --- |
| `GET /reservations/availability` | Public (no token); sits ahead of authentication. | Query `restaurantId`, `date` (`YYYY-MM-DD` in the restaurant's time zone) and `partySize` (1 to 12). Slots every 30 minutes inside opening hours. An unavailable slot carries its reason: `past`, `too_soon` (lead time), `too_far` (booking window), `pacing`, or `no_table` (no table that seats the party is free for the whole turn). | `200 { date, partySize, timeZone, turnMinutes, slots: [{ startAt, endAt, localTime, available, reason? }] }` |
| `GET /reservations/{id}/availability` | Customer, own booking only (`reservations:own:read`). | Query `date`. The same slots, computed as if this booking did not exist, so a guest can move it without colliding with itself. | `200` same shape |
| `PUT /reservations/{id}` (customer) | Customer, own booking (`reservations:own:update`). | Either `{ "status": "Cancelled" }` alone, or any of `startAt`, `partySize`, `notes`, `occasion`, `dietaryNotes`. Changes and cancellations close `changeCutoffMinutes` before the start. A moved booking is re-checked against tables, pacing, lead time and window. Customers cannot set a table. | `200 { reservation }` |
| `PUT /reservations/{id}` (staff) | Reception/Manager/Administrator (`reservations:write`). | Adds the `Arrived` status (`Awaiting`/`Confirmed` to `Arrived`, then `Seated`) and records `arrivedAt` and `seatedAt`. Seating needs a table (`409 reservation_table_required`). Seating, completion and no-shows update the guest profile counters (S5-02). | `200 { reservation }` |
| `GET /reservations/{id}/table-suggestion` | Reception/Manager/Administrator (`reservations:write`). | Optional `accessible=true`. The free table (or, failing that, a pair of tables) that seats the party for the whole turn with the fewest spare seats. | `200 { suggestion: { kind: "single" or "combined", spareSeats, tables } }` or `200 { suggestion: null }` |
| `GET /booking-rules` | `reservations:read`, signed restaurant scope. | Returns the stored rules, or the defaults when none are saved. | `200 { rules, usingDefaults, limits }` |
| `PUT /booking-rules` | `restaurant:write` (Manager/Administrator), signed restaurant scope. | Replaces the rules. Every number is bounded as listed above; turn time bands are sorted by party size, may not repeat a size and must cover the largest bookable party. Writes a `restaurant.booking_rules_changed` audit entry with before and after values. | `200 { rules, usingDefaults: false, limits }` |
| `GET /waitlist/estimate` | Public (no token). | Query `restaurantId` and `partySize`. Each table that seats the party frees up when its current party's turn ends; parties already waiting take the earliest tables first. Rounded up to 5 minutes and capped at 120. `POST /waitlist` also returns `quotedWaitMinutes` on the new entry. | `200 { partySize, quotedWaitMinutes }` |

**Errors** (all `{ "error": { "code", "message" } }`):

| Status | Codes |
| --- | --- |
| 400 | `invalid_availability_query`, `invalid_wait_estimate_query`, `invalid_party_size`, `invalid_reservation_slot`, `invalid_reservation_time`, `reservation_time_in_past`, `reservation_too_soon`, `reservation_too_far`, `outside_operating_hours`, `invalid_reservation_occasion`, `reservation_notes_too_long`, `reservation_dietary_notes_too_long`, `invalid_reservation_update` |
| 403 | `customer_profile_required` |
| 404 | `reservation_not_found`, `restaurant_not_found`, `table_not_found`, `customer_not_found` |
| 409 | `reservation_slot_unavailable` (table or pacing full), `reservation_change_window_closed`, `reservation_not_changeable`, `reservation_cannot_be_cancelled`, `invalid_reservation_transition`, `reservation_table_required`, `reservation_table_conflict`, `table_capacity_exceeded`, `table_unavailable`, `reservation_no_show_too_early`, `reservation_changed` (another write landed first) |
| 503 | `reservation_unavailable`, `restaurant_schedule_unavailable` |

**Notifications (S5-04).** A staff confirmation, a staff change of time or party size, and a staff cancellation each send the guest an in-app notification and, when they allow booking emails, an email with a calendar file (`STATUS:CANCELLED` for a cancellation). Guests are not notified about their own edits. A reminder goes out the day before, once per booking. Email goes through the configured transport; with `EMAIL_PROVIDER=mock` (the development default) nothing leaves the machine.

**Limits.** Slot checks and the booking write are separate steps; two guests racing for the last table can both pass the slot check, and the table conflict check on write is what stops the second. This is not a database transaction.

## S2-03 Reservations — locally implemented contract

This section records the team's implementation recommendation. It is backed by route/service tests but has not been verified against a live MongoDB instance.

| Route | Authorization | Request/behavior | Success response |
| --- | --- | --- | --- |
| `POST /reservations` | Customer: `reservations:own:create`; Reception/Manager/Administrator: `reservations:write` | Customer supplies `restaurantId`, `partySize`, offset-qualified `startAt`, optional `notes`. Staff supplies existing `customerId`, `partySize`, `startAt`, optional `tableId`/`notes`; restaurant scope comes from the token. Server derives a 90-minute end time. | `201 { reservation }`; customer requests start `Awaiting` and unassigned. |
| `GET /reservations` | Customer: `reservations:own:read`; Reception/Manager/Administrator: `reservations:read` | Customer sees own bookings across restaurants; staff sees only its signed restaurant. Up to 500 records, sorted by `startAt`, with a `truncated` flag and restaurant/guest display names. | `200 { reservations, truncated }` |
| `PUT /reservations/{id}` | Customer: `reservations:own:update`; Reception/Manager/Administrator: `reservations:write` | Customer may send only `{ "status": "Cancelled" }` before start. Staff may update status, table, party size, start time, or notes; tenant/ownership, status transitions, table capacity, overlap and no-show grace rules are enforced. | `200 { reservation }` |

Errors use `{ "error": { "code", "message" } }`. Key validation/conflict codes include `invalid_reservation_request`, `invalid_party_size`, `invalid_reservation_slot`, `outside_operating_hours`, `reservation_table_conflict`, `table_capacity_exceeded`, `reservation_cannot_be_cancelled`, and `reservation_no_show_too_early`. Opening-hour checks use the current static daily `opensAt`/`closesAt` configuration when present. Table-overlap validation is application-level and is not atomic across multiple API processes; live MongoDB and concurrency verification remain outstanding. See the [reservation contract and team recommendations](Andhrimnir_Implementation_Decisions.md#s2-03-reservation-endpoint-recommendation).

## S2-04 Orders and public menu — local implementation; recommended contract

This section records the team-selected contract. The API, public menu/cart, and order-history/cancellation UI are locally implemented. Backend repository/service/HTTP tests and app-mount tests pass; frontend Biome, TypeScript, and production-build checks are the locally verifiable UI coverage. Live MongoDB persistence and browser E2E verification remain outstanding.

| Route | Authorization | Request/behavior | Success response |
| --- | --- | --- | --- |
| `GET /menu?restaurantId={id}` | Public read-only | Requires one valid restaurant ID; returns an active restaurant's live (not archived) menu entries in the saved order, prices in minor currency units, category, dietary/allergen labels, `isAvailable` (sold-out items stay listed, flagged `false`), any `optionGroups`, the ordered `categories`, and a bounded/truncated indicator. See S4-05 below. | `200 { restaurant, categories, items, truncated }` |
| `POST /orders` | Customer: `orders:own:create` | Sends `restaurantId` and distinct `{ menuItemId, quantity }` lines. Customer ID is derived from the signed-in Customer; all prices/status/totals are server-derived. | `201 { order }`, initially `Created`. |
| `GET /orders/history` | Customer: `orders:own:read` | Returns at most 100 of the customer's own orders across restaurants, newest first, with restaurant name, item snapshots, status, total, currency, and creation time. | `200 { orders, truncated }` |
| `PUT /orders/{id}/cancel` | Customer: `orders:own:update` | Cancels only the caller's order while it remains `Created`; the write is conditional on the stored status to avoid racing acceptance. | `200 { order }` |

The recommended cart bound is 1–20 distinct lines, quantity 1–20 per line, and 50 total units. Since S4-05 the same dish may appear on two lines when the chosen options differ; an identical dish-and-options line is still rejected. Menu availability, price and options are rechecked at order creation. The create body accepts only `{ restaurantId, items: [{ menuItemId, quantity, options? }] }`; caller-supplied Customer ID, price, total, status, and fulfillment fields are rejected. The order response contains item IDs/name/price snapshots, server-calculated `totalMinor`, ISO currency, status, and timestamps; it does not expose per-item kitchen preparation state. History is owner-filtered across restaurants and bounded to 100 orders; the Customer UI fails closed rather than showing or submitting preview menu data. Orders contain a pre-bill subtotal; no taxes, payment capture, table assignment, fulfillment mode, or automatic stock deduction are introduced. The cart is kept in browser session storage only to survive sign-in, and submitted orders are stored in MongoDB. Existing separate `orders` and `order_items` collections require more than one write; local MongoDB standalone mode lacks transaction support, so line items are inserted before the visible order header with best-effort cleanup. Process-crash orphan items and live persistence remain unverified; document this limitation before production. See the [S2-04 team recommendations](Andhrimnir_Implementation_Decisions.md#s2-04-customer-order-placement-recommendation).


## S4-05 Menu management and 86-ing — local implementation

Implemented in `backend/src/menu/menu.admin.router.ts` (routes), `menu.service.ts` (audit and realtime), `menu.repository.ts` (writes, archive, arrangement) and `menu.types.ts` (limits). All routes below are mounted at `/api/v1/menu/items`, before the public `/api/v1/menu` route.

**Authorization.** Every route needs a bearer access token and the `menu:write` permission, which only **Manager** and **Administrator** hold. Customers, Reception and Kitchen Staff get `403`. Every read and write is scoped to the caller's own restaurant; an item from another restaurant answers `404 menu_item_not_found`. A malformed `{id}` answers `400 invalid_menu_item_id` after authentication, so it never hides a `401` or `403`.

| Route | Request/behavior | Success response |
| --- | --- | --- |
| `GET /menu/items` | The full managed menu (up to 300 items), sold-out items included, with `prepStation`, `prepMinutes`, `optionGroups`, `sortPosition` and `updatedAt`. Archived items are left out. | `200 { categories, items, truncated }` |
| `POST /menu/items` | Body fields: `name` (1–80), `category` (1–40), `priceMinor` (integer, 1–10,000,000 paise), optional `description` (≤280), `isAvailable`, `dietaryLabels` (from `vegetarian`, `vegan`, `jain`, `gluten-free`, `contains-egg`, `non-vegetarian`), `allergenLabels` (≤10, each ≤30), `prepStation` (`tawa`, `tandoor`, `curry`, `rice`, `fryer`, `beverages`, `desserts`), `prepMinutes` (1–120) and `optionGroups`. Unknown fields are rejected. The new item goes last in its category. | `201 { item }` |
| `PATCH /menu/items/{id}` | Any subset of the create fields except `isAvailable`, at least one. `null` clears `description`, `prepStation` or `prepMinutes`. | `200 { item }` |
| `PATCH /menu/items/{id}/availability` | Body is exactly `{ "isAvailable": true \| false }`. Broadcasts `menu.availability` with `{ menuItemId, isAvailable }` to the restaurant's realtime channel; signed-in customers' sockets receive it as well as staff. | `200 { item }` |
| `PUT /menu/items/arrangement` | Body `{ categories, itemIds }`: every current category and every live item, each listed once, in the new order. A list that no longer matches the menu (an item added or archived meanwhile) answers `409 menu_arrangement_stale`, and the client reloads. | `200 { categories, items, truncated }` |
| `DELETE /menu/items/{id}` | Archives the item: it leaves the public and managed menus and can no longer be ordered, while past orders keep their snapshots. | `204` |

**Option groups.** `optionGroups` holds up to 4 single-choice groups `{ id, name, required, choices: [{ id, label, priceDeltaMinor }] }` with up to 8 choices each. Ids are lowercase slugs (`^[a-z0-9][a-z0-9-]{0,23}$`), labels are at most 40 characters, and `priceDeltaMinor` is a whole number ≥ 0. On `POST /orders` a line sends `options: { groupId: choiceId }`. The server checks each choice (`400 invalid_order_options`), requires every required group (`400 order_option_required`), stores the snapshot `{ group, choice, priceDeltaMinor }` on the order line, and prices the unit as base plus deltas. The order, kitchen and staff responses include the stored options.

**Errors.** `400 invalid_menu_item` (the message names the field), `400 invalid_menu_availability`, `400 invalid_menu_arrangement`, `400 invalid_menu_item_id`, `404 menu_item_not_found`, `409 menu_arrangement_stale`, and `503 menu_unavailable` when the database is down.

**Audit.** Create, update, archive and availability changes write `menu.item_created`, `menu.item_updated`, `menu.item_archived` and `menu.availability_changed` audit entries, with the before and after values (see `GET /audit-logs`).

**Caching.** The public menu keeps `Cache-Control: public, max-age=30` for shared caches. The customer page reads it with `cache: "no-store"` and refreshes on the realtime event, on tab focus, and every 30 seconds while no socket is live. The manager routes are `no-store`.

**Deviation from the backlog row.** Backlog row 1.58 named `restaurant:write`. The routes use a dedicated `menu:write` permission (Manager and Administrator) so that menu editing can be granted on its own.

## S2-05 Kitchen Queue — local backend implementation; recommended contract

This contract is a team recommendation selected to proceed with the backlog. It preserves the approved order lifecycle and separates front-of-house order acceptance/service from kitchen item preparation. Backend routes, services, tenant-scoped repository operations, and fake-backed tests are implemented locally; live MongoDB concurrency/recovery behavior and dashboard UI integration are not verified or included in this backend story.

| Route | Authorization and scope | Request/behavior | Success response |
| --- | --- | --- | --- |
| `PATCH /orders/{id}/status` | Reception/Manager/Administrator: `orders:write`; tenant from signed principal | Accepts exactly `{ status }`; permits only `Created → Accepted`, `Ready → Served`, or `Served → Completed`. Status, tenant, customer, timestamp, and item state are never client-selected beyond the requested target status. | `200 { order }` |
| `GET /kitchen/queue` | Kitchen Staff/Manager/Administrator: `kitchen:queue:read`; tenant from signed principal | Oldest-first `Accepted`, `Preparing`, and `Ready` tickets only; at most 200, with a `truncated` flag. Responses include order/ticket status and item name, quantity, and preparation status, but no customer contact data or prices. | `200 { orders, truncated }` |
| `PUT /kitchen/queue/{orderId}` | Kitchen Staff/Manager/Administrator: `kitchen:queue:update`; tenant from signed principal | Accepts exactly `{ itemId, preparationStatus }`, with target `Preparing` or `Ready`, and only advances an item `Created → Preparing → Ready`; updates only an item belonging to the same-restaurant order. Repeating the current item status is idempotent and re-synchronizes the parent order. | `200 { order }` |

Kitchen item updates derive the order header: the first item moved out of `Created` advances `Accepted → Preparing`; the order becomes `Ready` only when every item is `Ready`. Kitchen users cannot accept, serve, complete, or cancel headers. Reception, Manager, and Administrator accept/serve/complete; customers retain pre-acceptance cancellation only. Direct staff cancellation is not included. The approved role matrix assigns Reception restaurant order updates, but the pre-existing permission map lacked `orders:write`; granting that named permission to Reception is the team's recommendation to align enforcement with the matrix. All reads and writes include the signed `restaurantId`; mismatched IDs and invalid transitions fail closed.

The queue is oldest-first, bounded to 200 parent orders. Conditional item status and order status/`updatedAt` matches prevent stale writes from overwriting another transition. Item and parent records are separate MongoDB documents and cannot be updated atomically in local standalone mode; item-first updates plus an idempotent retry can repair header aggregation after an interrupted request, but process-crash consistency and live MongoDB concurrency remain unverified. The customer-facing order page and staff dashboard UI are outside this API story; S2-07 later connected the Orders/Kitchen dashboard views to these routes locally. Live MongoDB and browser E2E validation remain outstanding.

## S2-06 Inventory — local API/UI implementation; recommended contract

This endpoint contract records team-selected details. The tenant-scoped inventory API and dashboard UI are implemented and locally verified on `main`; S2-06 is Ready to Push. Live MongoDB persistence/index verification is deferred to the final database/deployment stage.

| Route | Authorization and scope | Request/behavior | Success response |
| --- | --- | --- | --- |
| `GET /inventory` | Reception/Kitchen Staff: `inventory:availability:read`; Manager/Administrator: same read permission; restaurant from signed principal | No client-selected tenant. Sorted by item name, capped at 2,000. Managers/Admins receive quantity, unit, low-stock threshold, and last-adjusted timestamp; Reception/Kitchen Staff receive availability only. | `200 { items, truncated }` |
| `PUT /inventory/{id}` | Manager/Administrator: `inventory:write`; restaurant from signed principal | Exact allowed fields are `quantity` and optional `lowStockThreshold`, both finite and non-negative. This sets the physical count; the server stamps `lastAdjustedAt`. No automatic order deduction or incident creation. | `200 { item }` |

The UI submits manager adjustments only after a live API response, displays unavailable/preview states clearly, and keeps supplier integration and automatic stock deduction out of this story. Low-stock incident generation belongs to S2-12, so TC-07/AC incident alerts are not claimed as complete by S2-06.

## S2-07 Staff orders feed — recommended contract; local feed/UI implementation verified

This contract is a team recommendation. The existing customer history remains `GET /orders/history`; the staff feed is `GET /orders` and derives restaurant scope solely from the signed principal. There are no client-selected tenant or status filters.

| Route | Authorization and scope | Request/behavior | Success response |
| --- | --- | --- | --- |
| `GET /orders` | `orders:read` plus a valid signed restaurant scope; Customer is denied | Reception/Manager/Administrator see `Created`, `Accepted`, `Preparing`, `Ready`, and `Served`. Kitchen Staff see only `Accepted`, `Preparing`, and `Ready`. Oldest first; maximum 200 orders plus a `truncated` indicator. | `200 { orders, truncated }` |

The payload includes order and item IDs, operational status, item names/quantities/preparation status, and timestamps; it omits customer identity/contact data, prices, and totals. The Kitchen page uses `GET /kitchen/queue` and item-level `PUT /kitchen/queue/{orderId}` updates. Reception/Manager/Administrator use the staff status route for acceptance, serving, and completion. This keeps the feed tenant-scoped and the kitchen view least-privileged without pretending an unsupported all-orders endpoint exists. The feed and Orders/Kitchen integration are locally implemented and checked; S2-07 is Ready to Push on local `main`. This status covers the dashboard shell and currently available operational flows; S2-09 operational analytics is implemented separately, S2-12 now supplies supported-data incident rules and the backend API, while incident dashboard presentation remains outside this API implementation; role-specific coverage remains under S2-11. No live MongoDB or browser E2E result is claimed.

## S2-08 Health Score — local API/UI and refresh cadence

The recommended formulas and volatile in-process cache implement the team-approved event/hourly cadence without persisting a precomputed score. GET returns a tenant-scoped result from the cache for up to one hour, computes on a miss/expiry, and shares a concurrent calculation for the same tenant. Successful order creation/cancellation, staff order/header/item transitions, inventory adjustments, and reservation create/update operations request an asynchronous tenant refresh and invalidate the cached entry. The server starts an immediate sweep and a one-hour interval after MongoDB connection/schema initialization; each sweep enumerates active restaurants and refreshes them sequentially. The interval is stopped on server shutdown. Restarting the process discards the cache; no health-score collection or score document is added.

The endpoint/UI and the cadence implementation are locally checked; S2-08 is **Ready to Push** on local `main`, not Complete. Live MongoDB persistence/index verification is deferred to the final database/deployment stage, and no live Atlas check has occurred. S2-12 incident persistence requests a health-score refresh after active incidents are upserted or resolved so the calculation reads the updated incident state. Future table write APIs must call the same refresh notifier when implemented. The cache/scheduler are process-local, so any multi-replica deployment will need a shared cache or a single refresh scheduler. See [the health-score architecture decision](Andhrimnir_Implementation_Decisions.md#7-restaurant-health-score--approved-weights).

## S2-09 Analytics Charts — recommended contract; local API/UI implementation

This is the locally implemented S2-09 interpretation of the backlog story. `GET /analytics` requires Manager/Administrator `analytics:read`; the restaurant ID comes only from the signed principal. An optional single `range` query accepts `7d` or `30d` (default `7d`); client-selected tenant IDs, unknown query keys, and duplicate values are rejected. Dates are grouped in the restaurant's validated IANA timezone (falling back to UTC), while period bounds and generation time are ISO timestamps.

The `200` response contains the range/period, summary counts for orders placed, fulfilled, cancelled and in progress; average preparation minutes and observation count; reservation scheduled/confirmed/seated/completed/no-show counts; current inventory/low-stock/out-of-stock counts; one daily order/reservation point per date; 24 local-hour order counts; and `{ perCollectionLimit, truncatedCollections }`. Order, reservation, and inventory reads include the signed `restaurantId` and are bounded to 2,000 records each. A truncated collection means its counts may be partial. Preparation duration uses observed `Preparing` and `Ready` timestamps. Empty live data returns zero/empty chart values; the frontend never substitutes demo figures for an API failure. Invalid queries return `400 invalid_analytics_query`; unavailable service/runtime returns `503 analytics_unavailable`.

The API intentionally omits pre-bill order totals, revenue, average check, service-channel mix, and guest PII; totals stored on an order are not verified billed revenue. The dashboard displays operational order outcomes/activity, preparation time, reservations, and current stock only. Backend tests use fake repositories; local backend and frontend validation passes and S2-09 is **Ready to Push** on local `main`. Live MongoDB/Atlas, deployment, browser E2E, remote CI, push, and merge are not claimed.

## S2-10 Notifications — local backend implementation; recommended contract

This contract is a team recommendation chosen to fill unspecified S2-10 details. The authenticated API, recipient/tenant-scoped repository, server-only creation service, and fake-backed tests are implemented locally. Live MongoDB verification remains outstanding. No automatic producer/event mapping, retention period, or WebSocket delivery guarantee is selected here.

| Route | Authorization and scope | Request/behavior | Success response |
| --- | --- | --- | --- |
| `GET /notifications` | Customer: `notifications:own:read`; Reception/Manager/Administrator: `notifications:restaurant:read`; Kitchen Staff denied | No client-selected filters. Customer records are filtered by authenticated `recipientUserId` across restaurants. Staff records are filtered by both signed `restaurantId` and authenticated `recipientUserId`; no user can read another recipient's notifications. Sort newest-first by `createdAt`, then `_id`; cap at 100. | `200 { notifications, unreadCount, truncated }`; `unreadCount` counts all unread records in the same recipient scope. |
| `PATCH /notifications/{id}/read` | Customer and authorized restaurant staff: `notifications:own:update`; staff also uses the signed restaurant scope | Empty body only. Set `readAt` once; repeated requests return the existing timestamp without changing it. | `200 { notification }` |
| `POST /notifications/read-all` (S5-04) | `notifications:own:update`, same recipient scope as the list | Empty body only. Sets `readAt` on every unread record in the caller's scope. | `200 { marked, unreadCount: 0 }` |
| `GET /notifications/preferences` (S5-04) | Same as `GET /notifications` | Returns only the categories the caller's role can receive: Customer `bookings` (`reservation.*`) and `orders` (`order.*`); Reception `waiterAlerts` (`staff.order_ready`). Unset means on. Incident alerts are not optional and are not listed. | `200 { preferences }`, for example `{ "bookings": true, "orders": false }` |
| `PUT /notifications/preferences` (S5-04) | `notifications:own:update` | Body: one or more of the caller's categories with `true` or `false`; anything else is `400 invalid_notification_preferences`. Stored on the user as `notificationPreferences`. The order-ready, booking and reminder notifiers skip a muted category before anything is stored or pushed. | `200 { preferences }` |

The response exposes `id`, `restaurantId`, `type`, `title`, `body`, optional `relatedEntity`, `createdAt`, `deliveredAt`, and `readAt`; it never exposes `recipientUserId`. A missing or out-of-scope ID returns the same `404 notification_not_found` response. Trusted server-side creation stores new notifications unread with `deliveredAt: null`; S2-13 changes that field only after an explicit client acknowledgement is persisted. There is no public create route. S2-12 evaluates and persists supported rule-managed incidents after relevant successful operational writes and on scheduled sweeps, but does not automatically create/dispatch incident notifications. The local S2-13 WebSocket transport is documented below; mapping business events to notification recipients and retention/TTL remain undecided. See the [S2-10 team recommendation](Andhrimnir_Implementation_Decisions.md#s2-10-notification-api-and-read-state-recommendation-team-selected-2026-10-11).

## S2-12 Incident Detection Rules — local backend implementation

The team selected condition-based automatic resolution and a new incident ID on recurrence. The active-key, evaluation-cadence, and notification-cooldown details are team implementation recommendations. Backend rule, lifecycle, repository, scheduler, route, and operational-hook coverage is local; no live MongoDB/Atlas result is implied.

| Route | Authorization and scope | Request/behavior | Success response |
| --- | --- | --- | --- |
| `GET /incidents` | Manager/Administrator: `incidents:read` and a valid signed restaurant scope | No query parameters or client-selected tenant. Returns current and resolved incidents for the signed restaurant, ordered by `updatedAt` descending then `_id`, capped at 200; `truncated` reports additional records. | `200 { incidents, truncated }` |

Each response item exposes `id`, type, severity, status, bounded/allowlisted trigger fields, affected-entity type/ID, root-cause text, creation/update timestamps, nullable resolution timestamp, and resolution reason. It omits tenant IDs and all customer contact/identity fields. Unsupported query parameters return `400 invalid_incident_query`; unavailable service/storage returns `503 incidents_unavailable`.

Implemented rules use the approved thresholds: a preparing kitchen item warns above 15 minutes and becomes critical above 25; accepted/preparing orders warn above 20 minutes and become critical above 30; 8+ active kitchen orders warn and 12+ or an oldest active order above 30 minutes is critical. Per-item inventory at/below its `lowStockThreshold` warns; zero/negative stock is critical. Same-table overlaps and over-capacity assignments warn; a confirmed reservation assigned to a missing or disabled/out-of-service table is critical. Threshold values are configurable per restaurant, with invalid/missing pairs falling back to the documented defaults. All time comparisons use stored BSON timestamps; timers schedule the next strict threshold boundary.

The selected lifecycle keeps one active record per restaurant/type/affected entity, updates its evidence and severity while triggered, resolves it with `resolutionReason: "condition_cleared"` when the trigger clears, and creates a fresh ID on recurrence. An active-only unique partial index backs deduplication. Each operational source scan is capped at 2,000 records, and the API list is capped at 200; a truncated/incomplete source scan or internal active-incident list does not auto-resolve records. Successful order, kitchen, inventory, and reservation writes request evaluation; time-boundary checks, reservation-end checks for active conflicts, and a startup plus hourly sweep provide recovery. Incident persistence also requests a health-score refresh after upserts/resolutions. Scheduler timers are in-process and volatile; multi-replica/live database behavior is unverified. Notification generation/delivery and a manual resolve route are not implemented; no manual route is needed for the selected lifecycle.

S2-17 now provides bounded waitlist records, but this S2-12 implementation has not been extended to consume them; a count-based queue-congestion rule can be considered as a separately documented follow-up. Wait-estimate-based table congestion/utilization and staff-shortage detection remain unimplemented, and the queue-wait estimate formula remains undecided. S2-18 now locally provides the protected table status write route and requests incident/health-score reevaluation on actual state/reference changes. The backend Biome check (107 files), TypeScript typecheck, production build, and complete 154-test suite pass locally via Node `24.21.0`; the test plan records rule boundaries, tenant scope, truncation, auto-resolution/recurrence, and scheduler behavior. The full acceptance criterion and incident dashboard UI are not claimed complete; live database and remote CI verification remain outstanding.

## S2-13 WebSocket — recommended transport; local backend implementation

This contract follows the S2-13 team recommendations in the implementation decisions. The local backend implements the ticket route, WebSocket upgrade, tenant/permission-scoped event fanout, and notification ACK persistence. S2-13 is **Ready to Push** on local `main`, not Complete. Its active ticket/socket state is process-local; this is not a multi-replica or deployment guarantee.

| Endpoint | Authorization / scope | Request and behavior | Response |
| --- | --- | --- | --- |
| `POST /api/v1/notifications/socket-ticket` | Bearer access token plus the role's existing notification-read permission. Staff scope comes only from the signed restaurant claim; Customers have global own-notification scope. Request `Origin` must equal configured `WEB_ORIGIN`. | No query filters; no body other than an empty JSON object. Limited to 10 requests/minute/IP. Issues a cryptographically random, one-use ticket valid for 30 seconds. | `201 { ticket, expiresAt, socketPath, protocol }` with `Cache-Control: no-store`; over-limit returns `429`, invalid origin `403`, invalid query/body `400`. |
| `GET /api/v1/notifications/socket` (WebSocket upgrade) | Ticket identity is bound server-side to authenticated user, role, and restaurant. Exact configured `Origin` is required. | No query string. Offer `andhrimnir.events.v1` and `ticket.<opaque-ticket>` via `Sec-WebSocket-Protocol`; the server echoes only `andhrimnir.events.v1`. The opaque ticket is consumed once. Maximum five simultaneous connections per user. | Standard WebSocket upgrade; invalid path/protocol/ticket/origin is rejected. Server closes clients that exceed payload or backpressure limits. |

Restaurant envelopes are `{ eventId, event, occurredAt, restaurantId, data }`. Allowed invalidation events are `order.updated`, `reservation.updated`, `table.updated`, `waitlist.updated`, `inventory.updated`, `incident.updated`, `recommendation.updated`, and `healthscore.updated`; each requires both signed-tenant equality and the event's existing read permission. Payload data contains only IDs/status, changed counts, or the score/timestamp. `notification.created` is sent only to the persisted recipient; Customers may receive their own notifications across restaurants, while staff must match both recipient user ID and signed tenant. No recipient IDs or unrestricted documents are serialized.

The only application message accepted from a client is `{ "type": "notification.ack", "eventId": "<UUID>" }` for a notification event delivered on that same connection. Only after the server verifies the outstanding ACK and persists the authenticated recipient-scoped update does it set `deliveredAt` (preserving the first timestamp) and send `notification.delivery_acknowledged`. Sending a frame alone does not mark a notification delivered. Unknown, malformed, binary, or oversized client messages are rejected/closed. The server does not replay missed events; clients should refetch the REST feed after reconnect. Notifications remain persisted; no TTL/retention is selected.

Operational writes and successful incident/recommendation/health-score updates publish best-effort restaurant events. S2-12 incident detection does not automatically create a notification, and no mapping from event/incident type to a recipient is invented. Local verification on Node `24.21.0`: Biome checked 115 files, TypeScript typecheck and production build passed, all 172 backend tests passed, and `npm audit --audit-level=moderate` reported zero vulnerabilities. WebSocket integration tests use a local in-process handshake and fake repositories; live MongoDB/Atlas persistence, browser reconnect/UI, load/p95, multi-replica, deployment, remote CI, push, and merge checks remain outstanding/deferred.

## S2-14 Billing APIs — local backend implementation; recommended contract

The following details are team-selected recommendations made to proceed with unspecified module decisions. Payment capture/provider integration, tax calculation, and an accounting/settlement lifecycle remain out of scope.

| Endpoint | Authorization / scope | Request and behavior | Response |
| --- | --- | --- | --- |
| `POST /api/v1/bills` | Manager/Administrator with `bills:write`; restaurant scope comes only from the signed principal. | Accept exactly `{ orderId }`. Generate only for a same-restaurant order in `Ready`, `Served`, or `Completed`. Copy persisted order-item snapshots; do not accept client totals, currency, tax, adjustments, status, or restaurant ID. One bill per restaurant/order; repeated and concurrent generation is idempotent. | `201 { bill }` when created; `200 { bill }` when an existing bill is returned; `409` when the order is not billable. |
| `GET /api/v1/bills/{id}` | Manager/Administrator read only within their signed restaurant; Customer read only when the linked order belongs to that authenticated Customer. | No query filters. Staff uses tenant-scoped lookup; Customer ownership is verified through the order's global `customerId`. | `200 { bill }`; absent or out-of-scope records return `404`. |
| `GET /api/v1/bills/order/{orderId}` | Same role/scope policy as bill-by-ID. | Customer may retrieve only an issued bill for their own order across restaurants. Staff lookups include the signed tenant. | `200 { bill }`; no bill or inaccessible order returns `404`. |

Bill lines preserve snapshot names, quantities, and unit prices. `subtotalMinor` is calculated from those snapshots and checked against the persisted order total; `taxMinor` and `adjustmentsMinor` are zero and `totalMinor` equals the subtotal until an team-approved policy says otherwise. Currency is copied from the order. The existing unique `(restaurantId, orderId)` index is the concurrency invariant. Generation does not mutate the order; bill records are not editable, deletable, settled, or paid through this API. Unknown query parameters and extra POST fields are rejected. Local unit/HTTP tests use fake repositories; live MongoDB/index behavior is deferred to the agreed final DB/deployment stage.

## S2-15 Password Reset API — locally implemented; recommended contract

S2-15 is **Ready to Push** on local `main`, not Complete. These details follow the approved authentication baseline and fill the previously unspecified HTTP contract. They are implementation recommendations. The 6-digit OTP, 10-minute expiry, 60-second cooldown, and five-attempt ceiling are already approved; password minimum/maximum reuse S1-11's 12-character/1,024-byte recommendations.

| Endpoint | Authorization / scope | Request and behavior | Response |
| --- | --- | --- | --- |
| `POST /api/v1/auth/reset-password/request` | Public; exact configured-origin policy from the existing auth router. | Accept exactly `{ email }`. For syntactically valid email, issue a reset code only for an active email/password account; unknown, disabled, pending, Google-only, and cooldown cases share the same message. Do not expose account existence. | `202 { message }` with `Cache-Control: no-store`; development mock may additionally return `developmentCode`. |
| `POST /api/v1/auth/reset-password/confirm` | Public; exact configured-origin policy from the existing auth router. | Accept exactly `{ email, code, newPassword }`. Consume a valid unexpired code once, replace the Argon2id hash, clear reset state, stamp `passwordChangedAt`, revoke the user's active refresh sessions, and clear the refresh cookie. Does not issue a new session. | `204` with `Cache-Control: no-store`; invalid/expired/locked/unissued code returns a generic `401`. |

Store a domain-separated HMAC for password-reset codes in separate per-user fields from registration OTP state. Apply process-local IP limits of five reset requests and ten confirmations per IP in each 15-minute auth window, retain the approved per-account cooldown/attempt limits, reject unknown body/query fields, and do not log secrets. The generic response prevents direct account-existence disclosure; response-time equality is not guaranteed or claimed. In local development, the mock mail adapter may return the generated code for manual testing; production fails closed until an owner-configured provider is implemented. The code is single-use, reset state is cleared on success, and no login session is issued. The password update stamps `passwordChangedAt` before the separate active-session revocation write; if bulk revocation fails, refresh rejects and lazily revokes sessions created before the password change. Stateless access JWTs cannot be revoked immediately and remain valid until their 15-minute expiry. Local tests use fake repositories; live MongoDB/Atlas persistence, index behavior, real provider delivery, remote CI, deployment, push, and merge remain unverified/deferred.

## S2-16 Staff Management API — locally implemented; recommended contract

S2-16 is **Ready to Push** on local `main`, not Complete. These request and update details are team recommendations to fill the sparse endpoint inventory. Staff invitation/creation, shifts/scheduling, payroll, deletion, and contact edits are out of scope.

| Endpoint | Authorization / scope | Request and behavior | Response |
| --- | --- | --- | --- |
| `GET /api/v1/staff` | Manager/Administrator with `staff:read`; restaurant scope from the signed principal. | No client-selected tenant or query filters. Return active and inactive memberships joined to their auth users, sorted by display name, capped at 500. | `200 { staff, truncated }`; each record contains safe IDs, name, email, auth role, active state, and timestamps only. |
| `PUT /api/v1/staff/{id}` | Manager/Administrator with `staff:write`; the path membership and linked user must both match the signed restaurant. | Accept exactly `{ role?, isActive? }`, with at least one field. Allowed roles are Reception, Kitchen Staff, Manager, and Administrator. Do not allow self-deactivation or conversion to Customer. | `200 { staff }`; malformed requests return `400`, absent/out-of-tenant records `404`, and incomplete cross-collection synchronization `503`. |

The linked `users` record is authoritative for role/account status; successful updates synchronize the staff projection and stamp `refreshSessionsInvalidBefore`. Refresh sessions issued before that timestamp are rejected and lazily revoked, including after account reactivation; stateless access JWTs remain valid until their 15-minute expiry. The user and staff collections cannot be updated transactionally in local standalone MongoDB, so retry behavior is required and no transaction-level consistency is claimed. The app is mounted and fake-backed repository/service/HTTP tests pass. Local verification via Node `24.21.0`: Biome checked 135 backend files, typecheck/build passed, all 237 tests passed, `npm audit --audit-level=high` reported zero vulnerabilities, and `git diff --check` passed. Live MongoDB/Atlas persistence/index behavior, browser workflow, remote CI, deployment, push, and merge remain unverified/deferred.

## S2-17 Waitlist Management APIs — local implementation; recommended contract

S2-17 implements the list/add inventory plus a minimal staff update operation needed to record manual resolution and seating. The update route and detailed status/input rules are team recommendations. The endpoint never automatically seats a party, estimates a wait, or notifies a guest.

| Route | Authorization / scope | Request and behavior | Success response |
| --- | --- | --- | --- |
| `GET /api/v1/waitlist` | Reception/Manager/Administrator with `waitlist:read`; restaurant comes from the signed principal. | No query filters. Return only `waiting` entries, oldest first by `(createdAt, _id)`, capped at 200. | `200 { entries, truncated }` |
| `POST /api/v1/waitlist` | Reception/Manager/Administrator with `waitlist:write`; tenant is signed. | Accept exactly `{ guestName, partySize, phone?, notes? }`. Create a `waiting` walk-in party. Guest name is trimmed and limited to 100 characters; party size is an integer from 1–12; optional phone is trimmed/capped at 20 and notes at 500. Duplicate parties are not deduplicated. | `201 { entry }` |
| `PUT /api/v1/waitlist/{id}` | Same roles and signed scope as create. | Accept exactly `{ status: "seated", tableId }`, `{ status: "cancelled" }`, or `{ status: "no_show" }`. Only a currently `waiting` party may transition. Seating is a staff-directed assignment to an available same-restaurant table with enough capacity and no current reservation/order/waitlist assignment. | `200 { entry }`; missing/out-of-tenant IDs return `404`, stale/occupied/undersized table conflicts return `409`, incomplete synchronization returns safe `503`. |

A successful seat changes the table to `occupied`, writes the entry's `tableId`/`seatedAt`, and stores its ID in `currentWaitlistId`; the S2-18 table status route verifies the seated entry and clears that pointer only when staff explicitly marks the table available. A changed table state emits `table.updated`; queue mutations emit `waitlist.updated`, each tenant-filtered by the existing `tables:read` or `waitlist:read` permission. Seating requests health-score and incident reevaluation. The waitlist API response contains party details and timestamps but does not expose `restaurantId` or staff identities. Resolved entries are not returned by the live queue route; retention/history is not selected.

The repository writes the table first with a conditional availability/capacity guard, then conditionally resolves the queue entry; stale resolution triggers a conditional compensation that returns the table to `available`. A failed/ambiguous write is read back when possible, and unverified compensation produces `503` rather than claiming success. Standalone MongoDB cannot transactionally guarantee the multi-document invariant, and existing reservation/table writers can still race in a multi-process deployment; live MongoDB/index/Atlas behavior is unverified. Queue-count incident evaluation is not introduced by this story; the wait-estimate formula remains undecided. Local verification via Node `24.21.0`: Biome checked 142 backend files, TypeScript typecheck and production build passed, all 257 backend tests passed, `npm audit --audit-level=high` found zero vulnerabilities, and `git diff --check` passed. S2-17 is **Ready to Push** on local `main`, not Complete. Live MongoDB/Atlas indexes and write behavior, cross-process allocation, browser workflow, remote CI, deployment, push, and merge remain outstanding/deferred.

## S2-18 Table Status API — local implementation; recommended contract

The existing endpoint inventory lists only `PUT /api/v1/tables/{id}/status`. Status values, transition rules, and reference cleanup below are team recommendations to proceed with the backlog; no table list/get/create operation is added. S2-18 is **Ready to Push** on local `main`, not Complete.

| Route | Authorization / scope | Request and behavior | Success response |
| --- | --- | --- | --- |
| `PUT /api/v1/tables/{id}/status` | Reception/Manager/Administrator with `tables:write`; restaurant and table are derived/scoped from the verified principal and path ID. | Accept exactly `{ status }`, with lowercase `available`, `reserved`, `occupied`, `disabled`, or `out_of_service`. Enforce `available → reserved|occupied|disabled|out_of_service`; `reserved → occupied|available`; `occupied → available`; `disabled|out_of_service → available`. Repeating the current status is idempotent. | `200 { table }` with a safe table summary (no tenant or assignment IDs); missing/out-of-tenant IDs return `404`; invalid transitions, active references, or optimistic conflicts return `409`; unexpected database failures return safe `503`. |

Before a table becomes `available`, each non-null `currentReservationId` or `currentOrderId` must reference a same-restaurant record assigned to this table and already be terminal (`Completed`/`Cancelled`/`NoShow` for reservations; `Completed`/`Cancelled` for orders). `currentWaitlistId` must reference a same-restaurant `seated` waitlist entry whose `tableId` points back. Only after these checks pass does the update unset the current pointers; the historical waitlist entry remains `seated`. A `reserved` state without a linked reservation is a manual operational hold, not a booking. `occupied` may also be staff-marked without an order/waitlist link. This endpoint does not create or update reservation/order records.

Updates match the observed tenant/table/status/`updatedAt` and current assignment pointers. Cross-collection pointer verification is read-before-write and not a transaction; a linked record can change concurrently, so multi-process consistency is not claimed. Successful state/reference changes request health-score and incident reevaluation and publish a minimal `table.updated` invalidation. Local verification via Node `24.21.0`: Biome checked 149 backend files, TypeScript typecheck and production build passed, all 272 backend tests passed, `npm audit --audit-level=high` found zero vulnerabilities, and `git diff --check` passed. Live MongoDB/Atlas cross-collection behavior, browser workflow, remote CI, deployment, push, and merge remain outstanding/deferred.
