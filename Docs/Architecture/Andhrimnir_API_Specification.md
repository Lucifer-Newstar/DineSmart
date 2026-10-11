# Andhrímnir API Specification

## Canonical API Endpoint Inventory

This is the canonical endpoint inventory for the MVP. Paths below are relative to the approved `/api/v1` base path. The endpoint table consolidates the initial API design and later additions for authentication, reservations, billing, staff, waitlist, table management, and notifications. General request/response schemas and detailed authorization rules remain **draft** for routes not yet implemented; the locally selected S2-03 reservation and S2-04 order contracts are assistant recommendations, not separate owner approvals. See [Implementation Decisions](Andhrimnir_Implementation_Decisions.md). S1-09 implements login/refresh/logout; S1-10 adds Google ID-token login; S1-11 implements pending registration and OTP verification locally, pending real email-provider and live MongoDB validation. S2-03 adds locally unit/HTTP-tested reservation routes and a typechecked/production-built customer/staff UI; live MongoDB verification remains outstanding. S2-04 now has a locally implemented public active-menu read and customer order placement/history/cancellation with server-derived prices, plus a customer-facing menu/cart/history UI; local backend and frontend checks pass, while live MongoDB and browser E2E verification remain outstanding. S2-06 adds locally tested, tenant-scoped inventory list/manual-count routes and S2-08 adds a locally tested tenant-scoped health-score endpoint; live MongoDB verification remains outstanding for both. S3-01/02/04/13 add locally tested AI recommendation endpoints and fallback; live Gemini credentials and MongoDB persistence remain to be verified. Password reset remains S2-15.

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
| GET | /orders/history | Get own order history across restaurants | Jegatheesan |
| PUT | /orders/{id}/cancel | Cancel own order before acceptance | Jegatheesan |
| PATCH | /orders/{id}/status | Restaurant status progression (S2-05; pending) | Jegatheesan |
| GET | /kitchen/queue | Get kitchen queue | Jegatheesan |
| PUT | /kitchen/queue/{id} | Update prep status | Jegatheesan |
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
| GET | /notifications | Get notifications | Gokul |

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
| `PATCH /orders/{id}/status` | Restaurant staff | Status progression is deferred to S2-05; no staff order mutation is part of S2-04. | Pending |

The recommended cart bound is 1–20 distinct lines, quantity 1–20 per line, and 50 total units. Duplicate menu IDs are rejected; menu availability and price are rechecked at order creation. The create body accepts only `{ restaurantId, items: [{ menuItemId, quantity }] }`; caller-supplied Customer ID, price, total, status, and fulfillment fields are rejected. The order response contains item IDs/name/price snapshots, server-calculated `totalMinor`, ISO currency, status, and timestamps; it does not expose per-item kitchen preparation state. History is owner-filtered across restaurants and bounded to 100 orders; the Customer UI fails closed rather than showing or submitting preview menu data. Orders contain a pre-bill subtotal; no taxes, payment capture, table assignment, fulfillment mode, or automatic stock deduction are introduced. The cart is kept in browser session storage only to survive sign-in, and submitted orders are stored in MongoDB. Existing separate `orders` and `order_items` collections require more than one write; local MongoDB standalone mode lacks transaction support, so line items are inserted before the visible order header with best-effort cleanup. Process-crash orphan items and live persistence remain unverified; document this limitation before production. See the [S2-04 assistant recommendations](Andhrimnir_Implementation_Decisions.md#s2-04-customer-order-placement-recommendation).
