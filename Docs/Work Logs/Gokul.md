# Gokul — Work Log

## 2026-10-10

### S1-06 — Environment Variables

- **Branch:** `feature/S1-06-environment-variables`, stacked on `feature/S1-05-mongodb-atlas` because the backend environment already includes the local database URI.
- Added frontend and backend `.env.example` files with non-secret local defaults and blank placeholders for auth, Google OAuth, email-provider, and server-side Gemini settings. `EMAIL_PROVIDER=mock` remains the approved local default; the exact email provider and Gemini model are unset.
- Confirmed real `.env` and `.env.local` files remain ignored while `.env.example` files are committable. The backend already loads its local `.env` through `dotenv`; Next.js reads its standard frontend env files.
- **Validation:** checked ignore behavior and placeholder names; no real credentials were added. Existing backend lint, tests, typecheck, build, and audit checks remain clean.
- **Delivery:** committed locally; no remote push was made during this task.

## 2026-10-11

### S2-10 — Notification Module

- Implemented a trusted server-side notification creation service, MongoDB repository, bounded recipient feed, total unread count, and idempotent mark-read operation. Added authenticated `GET /api/v1/notifications` and `PATCH /api/v1/notifications/{id}/read` routes.
- The Customer feed is filtered by the signed-in recipient across restaurants. Reception, Manager, and Administrator are filtered by both their signed restaurant and own recipient ID; Kitchen Staff has no notification access. API responses omit `recipientUserId`. These unspecified scope/read-state details are documented as assistant recommendations, not separate owner approvals.
- **Gokul-authored commits:** `33d885f` (persistence/service and tests), `35adbaf` (authenticated feed/read routes and tests), and `921c1cd` (feed-truncation and staff-scope coverage). Navin separately committed the security permission and shared app/schema/docs integration.
- **Validation:** Node 24.21.0 (invoked via `npm exec --package=node@24.21.0`) backend lint, typecheck, production build, and production-dependency audit passed; all 111 backend tests passed. Notification-specific repository/service/router/app/auth/schema coverage passed using fakes and local HTTP tests.
- **Outstanding:** Docker/`mongod` is unavailable, so MongoDB persistence and index creation were not live-tested. Automatic critical-incident-to-recipient generation, WebSocket delivery/reconnect (S2-13), retention/TTL, dashboard UI connection, and browser E2E remain outstanding; AC-08 is not claimed as met. S2-06 remains independently In Progress.
- **Delivery:** S2-10 is Ready to Push on local `main`; no remote is configured, so no push, GitHub CI run, or merge occurred.

### 2026-10-11 — S2-16 Staff Management HTTP/security tests started

- Joined S2-16's local implementation on `main` as a genuine test contribution while Jegatheesan owns the backend feature repository/service and Navin owns shared contract/app integration.
- Own the route-level security/validation tests for `GET /staff` and `PUT /staff/{id}`: Manager/Administrator permissions, signed tenant scope, strict fields/path IDs, safe serialization, self-deactivation guard, and absent/cross-tenant non-disclosure.
- This assignment adds test coverage to the documented recommendation; it does not change S2-16's primary backlog owner or imply an additional owner-approved API decision.

### 2026-10-11 — S2-16 staff API route/security test contribution

- Implemented and committed the dedicated route-level security suite for the staff-management API as an S2-16 sub-scope, while Jegatheesan retained primary feature ownership and Navin handled shared integration.
- Tests cover Manager/Administrator access, Reception/Customer denial, bearer authentication, tenant derivation from the signed principal, query/body/path validation, forged tenant rejection, safe roster serialization, active-state/role updates, and the non-enumerating 404/self-deactivation error paths.
- **Gokul test commit:** `641fcc3` (`test(staff): verify route permissions and scope`). Targeted staff/auth/app coverage passed; final Node `24.21.0` full backend verification passed all 237 tests with Biome, typecheck, build, and high-severity audit clean.
- Live MongoDB, browser UI, remote CI, deployment, push, and merge remain unverified/deferred; S2-16 is **Ready to Push** locally, not Complete.
