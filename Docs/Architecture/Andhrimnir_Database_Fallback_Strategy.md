# Andhrímnir Database Fallback Strategy

## Purpose

Define the approved MVP behavior when MongoDB Atlas or the database connection is unavailable. The MVP prioritizes honest read-only degradation over accepting writes that cannot be durably stored or safely reconciled.

## Primary database

MongoDB Atlas is the primary database for Users, Customers, Restaurants, Menu Items, Orders, Reservations, Tables, Inventory, Incidents, Recommendations, Notifications, and Bills.

## Fallback levels and MVP scope

| Level | Strategy | MVP status |
| --- | --- | --- |
| 1 | Retry transient failures with backoff. | Included |
| 2 | Serve warmed, frequently used menu/configuration data from an in-memory cache. | Included |
| 3 | Queue writes for later replay. | Deferred; not supported in MVP |
| 4 | Enter visible read-only/degraded mode. | Included |
| 5 | Emergency offline operations with synchronization after recovery. | Deferred; not supported in MVP |

## Component behavior in degraded mode

- **Authentication:** Existing client sessions may remain usable if already validated. New login/OTP operations requiring database access are unavailable while the database is unreachable.
- **Menu:** Serve cached menu/availability only when a cache was previously populated; show a stale-data timestamp.
- **Dashboard:** Show cached data with a clear degraded/read-only banner and its last-updated time.
- **Orders, reservations, inventory, and tables:** Disable writes. Return a clear temporary-unavailable response; do not report the write as successful and do not queue it for replay.
- **Incidents:** Do not claim a new incident/recommendation is persisted while the database is unavailable. Cached incident data may be displayed as stale.
- **AI:** Use the approved deterministic recommendation fallback when Gemini fails; AI availability does not override database write restrictions.

## Cache and recovery

The MVP cache is in memory and may be lost on process restart. It is not a durable write queue. On recovery, reconnect and validate database availability; resume normal reads/writes. There are no queued operations to replay in MVP.

A future durable-queue design would need UUID/idempotency keys, durable storage, FIFO/retry behavior, conflict resolution, observability, and restore/replay tests. Do not implement that design without a separate approval.

## Backup and failure detection

- Use MongoDB Atlas backups appropriate to the selected deployment plan.
- Export seed data before releases and version-control schema/migration artifacts.
- Check database health periodically. A timeout above 5 seconds triggers a retry and degraded-mode evaluation.
- Log database health changes without logging secrets or customer-sensitive data.

## Recovery procedure

1. Detect database availability.
2. Reconnect and validate schema/health.
3. Refresh warmed cache data.
4. Verify read/write health.
5. Return to normal mode and clear the degraded banner.

## Risks and mitigations

| Risk | MVP mitigation |
| --- | --- |
| MongoDB outage | Cached reads and explicit read-only behavior |
| Network interruption | Bounded retry/backoff and clear user feedback |
| Stale cached data | Show last-updated time; do not accept writes against stale data |
| AI outage | Deterministic recommendation fallback |
| Deployment rollback | Restore from the configured database backup |
| Lost offline writes | Do not accept writes while database is unavailable; durable offline queue is deferred |

## Responsibilities

- Architecture and recovery behavior: Navin
- Database schema and connection behavior: Jegatheesan
- Degraded/read-only UI: Dhanush
- Monitoring, backups, and deployment checks: Gokul

## MVP acceptance criteria

- A warmed cached menu can load while the database is unavailable and shows its last-updated time.
- The dashboard clearly indicates degraded/read-only mode and the timestamp of cached data.
- Write operations fail clearly while the database is unavailable; they are not reported as successful or queued.
- After recovery, normal reads and writes resume without replaying stale local operations.
- The test plan covers the degraded behavior; queued-write replay is explicitly out of MVP scope.
