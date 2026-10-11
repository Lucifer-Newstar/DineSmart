# Andhrímnir API Specification

## Canonical API Endpoint Inventory

This is the canonical endpoint inventory for the MVP. Paths below are relative to the approved `/api/v1` base path. The endpoint table consolidates the initial API design and later additions for authentication, reservations, billing, staff, waitlist, table management, and notifications. General request/response schemas and detailed authorization rules remain **draft** for routes not yet implemented; the locally selected S2-03 reservation and S2-04/S2-05 order contracts are assistant recommendations, not separate owner approvals. See [Implementation Decisions](Andhrimnir_Implementation_Decisions.md). S1-09 implements login/refresh/logout; S1-10 adds Google ID-token login; S1-11 implements pending registration and OTP verification locally, pending real email-provider and live MongoDB validation. S2-03 adds locally unit/HTTP-tested reservation routes and a typechecked/production-built customer/staff UI; live MongoDB verification remains outstanding. S2-04 now has a locally implemented public active-menu read and customer order placement/history/cancellation with server-derived prices, plus a customer-facing menu/cart/history UI; local backend and frontend checks pass, while live MongoDB and browser E2E verification remain outstanding. S2-05 now locally implements an assistant-recommended, tenant-scoped kitchen queue and role-separated order lifecycle contract; service, repository, HTTP, and app-mount tests pass locally. Live MongoDB concurrency/crash behavior remains unverified; the S2-07 Orders/Kitchen views now consume these routes locally, while broader dashboard and browser validation remain outstanding. S2-10 now locally provides recipient-scoped persisted notification retrieval and idempotent read-state APIs; fake-backed tests pass, but live MongoDB, automatic incident-event generation, WebSocket delivery, and notification UI remain outstanding. S2-06 adds locally tested, tenant-scoped inventory list/manual-count routes and S2-08 adds a locally tested tenant-scoped health-score endpoint; live MongoDB verification remains outstanding for both. S3-01/02/04/13 add locally tested AI recommendation endpoints and fallback; live Gemini credentials and MongoDB persistence remain to be verified. Password reset remains S2-15.

| Method | Endpoint | Description | Owner |
| --- | --- | --- | --- |
| POST | /auth/register | Create a pending Customer account and request Email/OTP verification | Dhanush |
| POST | /auth/otp/request | Resend a registration verification code when eligible | Dhanush |
| POST | /auth/otp/verify | Verify registration code and activate the account | Dhanush |
| POST | /auth/login | Login user | Dhanush |
| POST | /auth/refresh | Rotate refresh session and renew access token | Dhanush |
| POST | /auth/logout | Secure logout | Dhanush |
| POST | /auth/google | Verify Google Identity Services ID token and start a session | Dhanush |
| POST | /auth/reset-password | Password reset | Dhanush |
| GET | /menu?restaurantId={id} | Public read-only active menu; available items only | Dhanush |
| POST | /reservations | Create reservation | Jegatheesan |
| GET | /reservations | Get reservations | Jegatheesan |
| PUT | /reservations/{id} | Update reservation | Jegatheesan |
| GET | /waitlist | Get waitlist | Jegatheesan |
| POST | /waitlist | Add to waitlist | Jegatheesan |
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
| GET | /incidents | Get incidents | Navin |
| POST | /incidents/{id}/recommendations | Generate/regenerate an advisory AI recommendation for an incident (Manager/Administrator) | Navin |
| GET | /recommendations | Get tenant-scoped AI recommendations; optional `incidentId` filter | Navin |
| GET | /analytics | Get analytics | Jegatheesan |
| GET | /healthscore | Get tenant-scoped weighted 0–100 health score and component explanations | Navin |
| GET | /bills/{id} | Get bill | Jegatheesan |
| GET | /bills/order/{orderId} | Get bill by order | Jegatheesan |
| POST | /bills | Generate bill | Jegatheesan |
| GET | /staff | Get staff list | Jegatheesan |
| PUT | /staff/{id} | Update staff | Jegatheesan |
| PUT | /thresholds | Configure thresholds | Navin |
| PUT | /tables/{id}/status | Update table status | Jegatheesan |
| GET | /notifications | List the authenticated recipient's notifications; customer history spans restaurants, staff is scoped to its signed restaurant and own recipient ID | Gokul |
| PATCH | /notifications/{id}/read | Idempotently mark the authenticated recipient's own notification as read | Gokul |

## S2-03 Reservations — locally implemented contract

This section records the assistant's implementation recommendation, not a separate owner approval. It is backed by route/service tests but has not been verified against a live MongoDB instance.

| Route | Authorization | Request/behavior | Success response |
| --- | --- | --- | --- |
| `POST /reservations` | Customer: `reservations:own:create`; Reception/Manager/Administrator: `reservations:write` | Customer supplies `restaurantId`, `partySize`, offset-qualified `startAt`, optional `notes`. Staff supplies existing `customerId`, `partySize`, `startAt`, optional `tableId`/`notes`; restaurant scope comes from the token. Server derives a 90-minute end time. | `201 { reservation }`; customer requests start `Awaiting` and unassigned. |
| `GET /reservations` | Customer: `reservations:own:read`; Reception/Manager/Administrator: `reservations:read` | Customer sees own bookings across restaurants; staff sees only its signed restaurant. Up to 500 records, sorted by `startAt`, with a `truncated` flag and restaurant/guest display names. | `200 { reservations, truncated }` |
| `PUT /reservations/{id}` | Customer: `reservations:own:update`; Reception/Manager/Administrator: `reservations:write` | Customer may send only `{ "status": "Cancelled" }` before start. Staff may update status, table, party size, start time, or notes; tenant/ownership, status transitions, table capacity, overlap and no-show grace rules are enforced. | `200 { reservation }` |

Errors use `{ "error": { "code", "message" } }`. Key validation/conflict codes include `invalid_reservation_request`, `invalid_party_size`, `invalid_reservation_slot`, `outside_operating_hours`, `reservation_table_conflict`, `table_capacity_exceeded`, `reservation_cannot_be_cancelled`, and `reservation_no_show_too_early`. Opening-hour checks use the current static daily `opensAt`/`closesAt` configuration when present. Table-overlap validation is application-level and is not atomic across multiple API processes; live MongoDB and concurrency verification remain outstanding. See the [reservation contract and assistant recommendations](Andhrimnir_Implementation_Decisions.md#s2-03-reservation-endpoint-recommendation).

## S2-04 Orders and public menu — local implementation; recommended contract

This section records the assistant-selected contract, not separate owner approval. The API, public menu/cart, and order-history/cancellation UI are locally implemented. Backend repository/service/HTTP tests and app-mount tests pass; frontend Biome, TypeScript, and production-build checks are the locally verifiable UI coverage. Live MongoDB persistence and browser E2E verification remain outstanding.

| Route | Authorization | Request/behavior | Success response |
| --- | --- | --- | --- |
| `GET /menu?restaurantId={id}` | Public read-only | Requires one valid restaurant ID; returns an active restaurant's available menu entries, prices in minor currency units, category, dietary/allergen labels, and a bounded/truncated indicator. | `200 { restaurant, items, truncated }` |
| `POST /orders` | Customer: `orders:own:create` | Sends `restaurantId` and distinct `{ menuItemId, quantity }` lines. Customer ID is derived from the signed-in Customer; all prices/status/totals are server-derived. | `201 { order }`, initially `Created`. |
| `GET /orders/history` | Customer: `orders:own:read` | Returns at most 100 of the customer's own orders across restaurants, newest first, with restaurant name, item snapshots, status, total, currency, and creation time. | `200 { orders, truncated }` |
| `PUT /orders/{id}/cancel` | Customer: `orders:own:update` | Cancels only the caller's order while it remains `Created`; the write is conditional on the stored status to avoid racing acceptance. | `200 { order }` |

The recommended cart bound is 1–20 distinct lines, quantity 1–20 per line, and 50 total units. Duplicate menu IDs are rejected; menu availability and price are rechecked at order creation. The create body accepts only `{ restaurantId, items: [{ menuItemId, quantity }] }`; caller-supplied Customer ID, price, total, status, and fulfillment fields are rejected. The order response contains item IDs/name/price snapshots, server-calculated `totalMinor`, ISO currency, status, and timestamps; it does not expose per-item kitchen preparation state. History is owner-filtered across restaurants and bounded to 100 orders; the Customer UI fails closed rather than showing or submitting preview menu data. Orders contain a pre-bill subtotal; no taxes, payment capture, table assignment, fulfillment mode, or automatic stock deduction are introduced. The cart is kept in browser session storage only to survive sign-in, and submitted orders are stored in MongoDB. Existing separate `orders` and `order_items` collections require more than one write; local MongoDB standalone mode lacks transaction support, so line items are inserted before the visible order header with best-effort cleanup. Process-crash orphan items and live persistence remain unverified; document this limitation before production. See the [S2-04 assistant recommendations](Andhrimnir_Implementation_Decisions.md#s2-04-customer-order-placement-recommendation).

## S2-05 Kitchen Queue — local backend implementation; assistant-recommended contract

This contract is an assistant recommendation selected to proceed with the backlog, not a separate owner approval. It preserves the approved order lifecycle and separates front-of-house order acceptance/service from kitchen item preparation. Backend routes, services, tenant-scoped repository operations, and fake-backed tests are implemented locally; live MongoDB concurrency/recovery behavior and dashboard UI integration are not verified or included in this backend story.

| Route | Authorization and scope | Request/behavior | Success response |
| --- | --- | --- | --- |
| `PATCH /orders/{id}/status` | Reception/Manager/Administrator: `orders:write`; tenant from signed principal | Accepts exactly `{ status }`; permits only `Created → Accepted`, `Ready → Served`, or `Served → Completed`. Status, tenant, customer, timestamp, and item state are never client-selected beyond the requested target status. | `200 { order }` |
| `GET /kitchen/queue` | Kitchen Staff/Manager/Administrator: `kitchen:queue:read`; tenant from signed principal | Oldest-first `Accepted`, `Preparing`, and `Ready` tickets only; at most 200, with a `truncated` flag. Responses include order/ticket status and item name, quantity, and preparation status, but no customer contact data or prices. | `200 { orders, truncated }` |
| `PUT /kitchen/queue/{orderId}` | Kitchen Staff/Manager/Administrator: `kitchen:queue:update`; tenant from signed principal | Accepts exactly `{ itemId, preparationStatus }`, with target `Preparing` or `Ready`, and only advances an item `Created → Preparing → Ready`; updates only an item belonging to the same-restaurant order. Repeating the current item status is idempotent and re-synchronizes the parent order. | `200 { order }` |

Kitchen item updates derive the order header: the first item moved out of `Created` advances `Accepted → Preparing`; the order becomes `Ready` only when every item is `Ready`. Kitchen users cannot accept, serve, complete, or cancel headers. Reception, Manager, and Administrator accept/serve/complete; customers retain pre-acceptance cancellation only. Direct staff cancellation is not included. The approved role matrix assigns Reception restaurant order updates, but the pre-existing permission map lacked `orders:write`; granting that named permission to Reception is the assistant's recommendation to align enforcement with the matrix, not a separate owner approval. All reads and writes include the signed `restaurantId`; mismatched IDs and invalid transitions fail closed.

The queue is oldest-first, bounded to 200 parent orders. Conditional item status and order status/`updatedAt` matches prevent stale writes from overwriting another transition. Item and parent records are separate MongoDB documents and cannot be updated atomically in local standalone mode; item-first updates plus an idempotent retry can repair header aggregation after an interrupted request, but process-crash consistency and live MongoDB concurrency remain unverified. The customer-facing order page and staff dashboard UI are outside this API story; S2-07 later connected the Orders/Kitchen dashboard views to these routes locally. Live MongoDB and browser E2E validation remain outstanding.

## S2-06 Inventory — local API/UI implementation; assistant-recommended contract

This endpoint contract records assistant-selected details, not separate owner approvals. The tenant-scoped inventory API and dashboard UI are implemented and locally verified on `main`; S2-06 is Ready to Push. Live MongoDB persistence/index verification is deferred to the final database/deployment stage.

| Route | Authorization and scope | Request/behavior | Success response |
| --- | --- | --- | --- |
| `GET /inventory` | Reception/Kitchen Staff: `inventory:availability:read`; Manager/Administrator: same read permission; restaurant from signed principal | No client-selected tenant. Sorted by item name, capped at 2,000. Managers/Admins receive quantity, unit, low-stock threshold, and last-adjusted timestamp; Reception/Kitchen Staff receive availability only. | `200 { items, truncated }` |
| `PUT /inventory/{id}` | Manager/Administrator: `inventory:write`; restaurant from signed principal | Exact allowed fields are `quantity` and optional `lowStockThreshold`, both finite and non-negative. This sets the physical count; the server stamps `lastAdjustedAt`. No automatic order deduction or incident creation. | `200 { item }` |

The UI submits manager adjustments only after a live API response, displays unavailable/preview states clearly, and keeps supplier integration and automatic stock deduction out of this story. Low-stock incident generation belongs to S2-12, so TC-07/AC incident alerts are not claimed as complete by S2-06.

## S2-07 Staff orders feed — assistant-recommended contract; local feed/UI implementation verified

This contract is an assistant recommendation, not a separate owner approval. The existing customer history remains `GET /orders/history`; the staff feed is `GET /orders` and derives restaurant scope solely from the signed principal. There are no client-selected tenant or status filters.

| Route | Authorization and scope | Request/behavior | Success response |
| --- | --- | --- | --- |
| `GET /orders` | `orders:read` plus a valid signed restaurant scope; Customer is denied | Reception/Manager/Administrator see `Created`, `Accepted`, `Preparing`, `Ready`, and `Served`. Kitchen Staff see only `Accepted`, `Preparing`, and `Ready`. Oldest first; maximum 200 orders plus a `truncated` indicator. | `200 { orders, truncated }` |

The payload includes order and item IDs, operational status, item names/quantities/preparation status, and timestamps; it omits customer identity/contact data, prices, and totals. The Kitchen page uses `GET /kitchen/queue` and item-level `PUT /kitchen/queue/{orderId}` updates. Reception/Manager/Administrator use the staff status route for acceptance, serving, and completion. This keeps the feed tenant-scoped and the kitchen view least-privileged without pretending an unsupported all-orders endpoint exists. The feed and Orders/Kitchen integration are locally implemented; S2-07 remains In Progress for the broader dashboard scope. No live MongoDB or browser E2E result is claimed.

## S2-10 Notifications — local backend implementation; assistant-recommended contract

This contract is an assistant recommendation chosen to fill unspecified S2-10 details; it is not a separate owner approval. The authenticated API, recipient/tenant-scoped repository, server-only creation service, and fake-backed tests are implemented locally. Live MongoDB verification remains outstanding. No automatic producer/event mapping, retention period, or WebSocket delivery guarantee is selected here.

| Route | Authorization and scope | Request/behavior | Success response |
| --- | --- | --- | --- |
| `GET /notifications` | Customer: `notifications:own:read`; Reception/Manager/Administrator: `notifications:restaurant:read`; Kitchen Staff denied | No client-selected filters. Customer records are filtered by authenticated `recipientUserId` across restaurants. Staff records are filtered by both signed `restaurantId` and authenticated `recipientUserId`; no user can read another recipient's notifications. Sort newest-first by `createdAt`, then `_id`; cap at 100. | `200 { notifications, unreadCount, truncated }`; `unreadCount` counts all unread records in the same recipient scope. |
| `PATCH /notifications/{id}/read` | Customer and authorized restaurant staff: `notifications:own:update`; staff also uses the signed restaurant scope | Empty body only. Set `readAt` once; repeated requests return the existing timestamp without changing it. No mark-all operation. | `200 { notification }` |

The response exposes `id`, `restaurantId`, `type`, `title`, `body`, optional `relatedEntity`, `createdAt`, `deliveredAt`, and `readAt`; it never exposes `recipientUserId`. A missing or out-of-scope ID returns the same `404 notification_not_found` response. The trusted server-side creation service stores new notifications as unread and does not set `deliveredAt` until a delivery transport exists. There is no public create route. The authenticated retrieval/read API does not itself generate critical-incident notices or deliver WebSocket events; those event/recipient rules and S2-13 transport work remain outstanding. Retention/TTL is also undecided. See the [S2-10 assistant recommendation](Andhrimnir_Implementation_Decisions.md#s2-10-notification-api-and-read-state-recommendation-assistant-selected-2026-10-11).
