# Andhrímnir Database Schema — S1-08 Baseline

**Status:** Initial native MongoDB driver schema and index baseline implemented on `feature/S1-08-database-schema` (2026-10-10), with authentication/session and pending-user OTP extensions added on S1-09/S1-10/S1-11, RBAC/seed extensions on `feature/backend`, and AI recommendation fields/index on `feature/ai`. Live MongoDB index verification is pending; this is not a claim that all workflow validation or API payloads are finalized. See [Implementation Decisions](Andhrimnir_Implementation_Decisions.md) for approved scope and remaining decisions.

## Design recommendations applied

- Use the official MongoDB Node.js driver with typed TypeScript documents; no ODM is introduced.
- MongoDB `_id` values and references use `ObjectId`. Persist timestamps as BSON `Date` values in UTC.
- Persist money as integer minor units (for example, cents/paise) and carry an explicit currency code. Snapshot item names and unit prices for historical orders and bills.
- Treat a Customer as a global identity/profile. A customer user may have `restaurantId: null`; orders, reservations, and all other operational records remain scoped to one `restaurantId`. The owner explicitly approved this scope on 2026-10-10.
- Store the entered email separately from `normalizedEmail`, which is trimmed and lowercased for global uniqueness and login lookup. Do not remove plus-tags or apply provider-specific dot rules.
- Prefix operational query indexes with `restaurantId` where applicable. Database indexes are a performance aid, not an authorization boundary: every API query must also enforce the caller's restaurant access.
- Use named, idempotent `createIndexes` calls at backend startup. S1-09 adds TTL deletion only for refresh sessions with an explicit seven-day expiry; do not add TTL to operational history or incident-deduplication uniqueness before those retention/lifecycle rules are defined.

## Collections and document fields

All documents have MongoDB `_id` and `createdAt`/`updatedAt` timestamps unless noted. References are `ObjectId`; stored temporal values are `Date`.

| Collection | Initial fields | Scope |
| --- | --- | --- |
| `users` | `name`, `email`, `normalizedEmail`, `role`, `restaurantId`, `status`, optional `authProvider`, optional `googleSubject`, optional `passwordHash`, optional `emailOtpCodeHash`/`emailOtpExpiresAt`/`emailOtpResendAt`/`emailOtpAttempts` for pending Email/OTP registration; S2-15 adds separate optional `passwordResetCodeHash`/`passwordResetExpiresAt`/`passwordResetResendAt`/`passwordResetAttempts`, `passwordChangedAt`, and `refreshSessionsInvalidBefore` | Customer users may have `restaurantId: null`; other roles require an `ObjectId` at the type level. |
| `refresh_sessions` | `userId`, current `tokenHash`, `usedTokenHashes`, absolute `expiresAt`, `revokedAt`, `lastUsedAt` | Authentication session family; token values are hashes, and the session is not restaurant-scoped. |
| `restaurants` | `name`, optional `contact`/`address`, `timezone`, `currency`, optional `operatingHours`/`thresholds`, `status` | Root tenant record. |
| `customers` | optional `userId`, `displayName`, optional guest `email`/`phone`, optional `contactPreferences` | Global profile; not tenant-scoped. |
| `staff` | `restaurantId`, `userId`, `role`, `isActive` | Restaurant membership; no shift/schedule fields in MVP. |
| `menu_items` | `restaurantId`, `category`, `name`, optional `description`, `priceMinor`, `isAvailable`, optional dietary/allergen labels | Restaurant-scoped. |
| `tables` | `restaurantId`, `tableNumber`, `capacity`, optional `zone`, `status` (`available`, `reserved`, `occupied`, `disabled`, `out_of_service`), optional current reservation/order/waitlist references | Restaurant-scoped. `currentWaitlistId` records a staff-directed walk-in seating assignment until the table is explicitly reopened; S2-18 status changes validate and clear terminal links. |
| `waitlist` | `restaurantId`, `guestName`, `partySize`, optional `phone`/`notes`, `status` (`waiting`, `seated`, `cancelled`, `no_show`), optional `tableId`/`seatedAt` | Restaurant-scoped walk-in queue item; it is not a Customer profile or reservation. The API lists only open `waiting` entries; no TTL/history policy is selected. |
| `reservations` | `restaurantId`, `customerId`, `partySize`, `startAt`, `endAt`, optional `tableId`, `status`, optional `notes` | Restaurant-scoped; customer identity may span restaurants. |
| `orders` | `restaurantId`, `customerId`, optional `reservationId`/`tableId`, `totalMinor`, `currency`, `status`, optional `statusTimestamps` | Restaurant-scoped. |
| `order_items` | `restaurantId`, `orderId`, `menuItemId`, `nameSnapshot`, `unitPriceMinor`, `quantity`, optional `notes`, `preparationStatus` | Restaurant-scoped; names and prices are snapshots. |
| `inventory_items` | `restaurantId`, `name`, `quantity`, `unit`, `lowStockThreshold`, `lastAdjustedAt` | Restaurant-scoped. |
| `incidents` | `restaurantId`, `type`, `severity`, `status`, `triggerSnapshot`, `affectedEntity`, optional `rootCause` | Restaurant-scoped. |
| `recommendations` | `restaurantId`, `incidentId`, `summary`, `rootCause`, `priority`, `actions`, `confidence`, `source`, `provider`, `generatedAt` | Restaurant-scoped; one current advisory recommendation per incident, upserted by the generator. |
| `notifications` | `restaurantId`, `recipientUserId`, `type`, `title`, `body`, optional `relatedEntity`, `deliveredAt`, `readAt` | Persisted per recipient. Customer reads may span restaurants by authenticated user ID; staff reads require both the signed restaurant and recipient IDs. The API omits `recipientUserId`. |
| `bills` | `restaurantId`, `orderId`, `lineItems`, `subtotalMinor`, `taxMinor`, `adjustmentsMinor`, `totalMinor`, `currency`, `status` | Restaurant-scoped; no payment capture or provider fields. |

The canonical TypeScript contracts are in `backend/src/database/schema.ts`. Registration OTP state is embedded on the pending User document so code consumption and status activation can be a single atomic update; only a domain-separated HMAC is stored, never the raw code. These registration fields are unset when the account becomes active. Password reset uses separate fields so registration and reset codes cannot be confused; successful reset clears the reset state and records `passwordChangedAt`. Only domain-separated HMACs are persisted. `backend/src/database/seed-data.ts` holds deterministic development fixtures; `npm run seed` is restricted to `NODE_ENV=development` and a local MongoDB hostname. Generic objects such as address, operating hours, contact, and thresholds are intentionally not given strict runtime shapes yet; those belong with the corresponding API/workflow contract.

## Relationships and constraints

- A `User` may have zero or one linked `Customer` profile and multiple refresh-session families. A guest `Customer` may have no `userId`.
- A `Customer` may have multiple reservations and orders across restaurants. Each such operational document still contains its own `restaurantId`.
- A `Restaurant` owns its staff memberships, menu items, tables, waitlist entries, reservations, orders, order items, inventory items, incidents, recommendations, notifications, and bills.
- A seated waitlist entry references one same-restaurant `Table` through both `tableId` and the table's `currentWaitlistId`; the table is conditionally changed from `available` to `occupied`. `currentWaitlistId` is cleared only when the table is explicitly reopened. This cross-document write uses conditional writes and compensation, not a MongoDB transaction.
- An `Order` has one or more `OrderItem` documents; each item snapshots the menu name and unit price. An `Order` has at most one `Bill` in this baseline.
- An `Incident` has at most one current `Recommendation` in the MVP; regenerate with an upsert keyed by `(restaurantId, incidentId)`. Historical recommendation versions are deferred.
- A `Table` may be assigned over time to reservations. The reservation conflict rule (same-table overlap and capacity) must be enforced by the service layer in a transaction/appropriate consistency strategy; a normal B-tree index cannot prevent overlapping time ranges.
- MongoDB does not enforce foreign keys. Services must validate that referenced users, customers, tables, menu items, orders, and incidents belong to the same authorized restaurant where the workflow requires it.

## Index plan

The named index specifications live alongside the document types in `backend/src/database/schema.ts` and are initialized by the backend when `MONGODB_URI` is configured.

| Collection | Indexes |
| --- | --- |
| `users` | Unique `normalizedEmail`; unique `googleSubject` only when present as a string; `(restaurantId, role, status)`. |
| `refresh_sessions` | Unique current `tokenHash`; `usedTokenHashes` for replay lookup; `(userId, revokedAt, expiresAt)`; TTL on `expiresAt`. |
| `restaurants` | `(status, name)`. |
| `customers` | Unique `userId` only when it is an `ObjectId`; permits multiple guest profiles without a linked user. |
| `staff` | Unique `(restaurantId, userId)`; `(restaurantId, isActive, role)`. |
| `menu_items` | `(restaurantId, isAvailable, category, name)`. |
| `orders` | `(restaurantId, status, createdAt desc)`; `(restaurantId, createdAt desc)` for rolling health-score snapshots; `(customerId, createdAt desc)`. |
| `order_items` | `(restaurantId, orderId)`. |
| `reservations` | `(restaurantId, startAt, status)`; `(restaurantId, tableId, startAt)`. These are non-unique. |
| `waitlist` | `(restaurantId, status, createdAt, _id)` for FIFO open-queue reads; `(restaurantId, tableId, status)` for assigned-table lookup. |
| `tables` | Unique `(restaurantId, tableNumber)`. |
| `inventory_items` | `(restaurantId, name)`; `(restaurantId, quantity)`. |
| `incidents` | `(restaurantId, status, createdAt desc)`; `(restaurantId, severity, status)`. |
| `recommendations` | Unique `(restaurantId, incidentId)` for one current recommendation per incident. |
| `notifications` | `(restaurantId, recipientUserId, readAt, createdAt desc)` for tenant-scoped unread counts; `(restaurantId, recipientUserId, createdAt desc, _id desc)` for staff feeds; `(recipientUserId, createdAt desc, _id desc)` for Customer history and per-recipient unread counts across restaurants. |
| `bills` | Unique `(restaurantId, orderId)`. |

MongoDB's built-in unique `_id` index is omitted from this table. Query plans and compound-index ordering should be revisited against measured MVP query patterns before adding more indexes.

## Bootstrap and validation scope

When `MONGODB_URI` is configured, the backend connects and creates the named indexes before reporting schema readiness. Index/bootstrap errors leave the API in liveness-only mode; the log does not expose the URI. The index initializer is unit-tested with a fake `Db`, but a live MongoDB run was not possible in this workspace because Docker and `mongod` are unavailable.

S1-08 does **not** add MongoDB JSON Schema validators or migrations. TypeScript types are compile-time guidance only. Required-field/range checks, exact enum transitions, reservation overlap enforcement, authorization, and API request validation must be implemented and tested with the corresponding workflow tasks. Any future breaking index or field change should be delivered with a migration plan rather than relying on startup to silently rewrite data.

## S2-17 waitlist schema update (local, 2026-10-11)

The `waitlist` collection and its FIFO/assigned-table indexes are now present in the native-driver schema and local demo seed manifest (empty by default). Waitlist entries retain `restaurantId`; table occupancy is acquired with a conditional write and compensated if the entry update fails. The seat/update operation spans two standalone-MongoDB documents, so this is not transactionally atomic; live MongoDB index and failure behavior remain unverified. See the [S2-17 API and team-selected contract](Andhrimnir_API_Specification.md#s2-17-waitlist-management-apis--local-implementation-recommended-contract) and [implementation decision](Andhrimnir_Implementation_Decisions.md#15-s2-17-waitlist-api-recommendations-team-selected-2026-10-11).

## S2-18 table status contract note (local implementation, 2026-10-11)

The table status API now implements the explicit `available`, `reserved`, `occupied`, `disabled`, and `out_of_service` recommendation. Returning to `available` validates current reservation/order/waitlist references before clearing them. These cross-collection reads and the status compare-and-set are not transactional; repository tests cannot establish live MongoDB or multi-process consistency. S2-18 is Ready to Push on local `main`, not Complete. See the [S2-18 table-status contract](Andhrimnir_API_Specification.md#s2-18-table-status-api--local-implementation-recommended-contract).
