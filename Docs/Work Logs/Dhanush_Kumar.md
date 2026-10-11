# Dhanush Kumar — Work Log

## 2026-10-10

### S1-03 — Setup Next.js

- **Branch:** `feature/S1-03-nextjs-setup`.
- Added the Next.js App Router, TypeScript, and Tailwind CSS frontend foundation, pinned Node.js `24.21.0` via root `.nvmrc` and the frontend engine constraint, and removed unused starter assets.
- Replaced the default Next.js landing page with a neutral, accessible Andhrímnir application shell. No customer or restaurant workflows, brand colors, or external assets were introduced.
- **Implementation commit:** `f75bcfe` (Dhanush). Navin's separate security commit `7d542aa` removed the generated ESLint dependency chain and configured Biome `2.5.15`.
- **Validation on Node `24.21.0`:** `npm run lint`, `npm run typecheck`, and `npm run build` passed. Both full `npm audit` and `npm audit --omit=dev` report zero vulnerabilities. The root page returned the expected static shell in the local dev-server smoke check.
- **Delivery:** committed locally; no remote push was made during this task.

### S1-09 — JWT Authentication

- **Branch:** `feature/S1-09-jwt-auth`, stacked on local `feature/S1-08-database-schema`; S1-08 is not yet merged.
- Added versioned email/password login, JWT bearer verification middleware, refresh, and logout. Access JWTs expire after 15 minutes; refresh tokens are 256-bit opaque values, stored only as SHA-256 hashes, rotated on use, replay-detected, and revoked on logout. The recommended seven-day lifetime is absolute and is not extended by rotation.
- Added Argon2id password helpers, generic invalid-credential responses, exact-origin credentialed CORS, production Secure/HttpOnly/SameSite=None cookies, local Lax cookies, and in-memory IP rate limits. The technical details are assistant-selected recommendations per owner direction, not separate owner approvals.
- Added the `refresh_sessions` collection/index/TTL baseline and `WEB_ORIGIN` example. Registration/OTP, Google OAuth, password reset, and RBAC enforcement remain assigned to their later stories.
- **Validation on Node `24.21.0`:** 14 backend tests, Biome, TypeScript typecheck, production build, and `npm audit --audit-level=high` passed; zero vulnerabilities. Tests use a fake auth repository; live MongoDB verification remains unavailable because Docker and `mongod` are absent.
- **Status:** In Progress pending live MongoDB persistence verification. Work remains local; no remote push was made.

### S1-10 — Google OAuth

- **Branch:** `feature/S1-10-google-oauth`, stacked on local `feature/S1-09-jwt-auth`; prior task branches remain unmerged.
- Added `POST /api/v1/auth/google` using Google Identity Services ID tokens and server-side signature/audience verification through `google-auth-library`. Verified Google email may link only to an existing active user; the stable Google subject is stored under a unique index. Google login does not create accounts or assign roles; Email/OTP remains the registration path.
- Reuses the S1-09 access/refresh session, cookie, origin, and rate-limit flow. Added matching public frontend/backend client-ID placeholders; no Google client secret is used or committed.
- **Validation on Node `24.21.0`:** 17 backend tests, Biome, TypeScript typecheck, production build, and `npm audit --audit-level=high` passed; zero vulnerabilities. Unit/HTTP tests use an injected fake verifier; no live Google credentials or MongoDB instance are available for end-to-end verification.
- **Status:** In Progress pending a real Google ID-token and live MongoDB check. Work remains local; no remote push was made.

### S1-11 — Email OTP registration

- **Branch:** `feature/S1-11-email-otp`, stacked on local `feature/S1-10-google-oauth`; prior task branches remain unmerged.
- Added pending Customer registration, resend and verify endpoints; OTP values are six digits, held only as domain-separated HMAC-SHA-256 values in MongoDB, with ten-minute expiry, 60-second cooldown, and five-attempt lockout. Verification activates the user and issues the standard S1-09 session. Server assigns role/tenant fields; the new-password minimum is 12 characters and maximum is 1024 UTF-8 bytes.
- The local mock email adapter never logs codes; `developmentCode` is returned only in development. Production rejects the mock provider. Real provider integration is not configured.
- **Implementation commit:** `cdf1ed8` (Dhanush).
- **Validation on Node `24.21.0`:** Biome, 21 backend tests, TypeScript typecheck, production build, and `npm audit --audit-level=high` passed; zero vulnerabilities. OTP tests use fake repositories; live MongoDB and real email delivery remain unverified because Docker/`mongod` and provider credentials are unavailable.
- **Status:** In Progress pending live MongoDB atomic-operation verification and real provider delivery. No remote push or merge was made.

### S2-01 / S2-02 / S2-07 / S3-03 / S3-05 — responsive DineSmart frontend

- **Branch:** `feature/frontend`, stacked on local `feature/ai`; area branch, not a task-scoped branch.
- Replaced the placeholder route with a responsive restaurant workspace covering overview, order queue, kitchen board, reservations, inventory, incidents, AI insights, analytics, and settings. Added mobile navigation, notifications preview, service metrics, chart/floor visuals, and initial sample-state controls; subsequent S2-03/S2-04/S2-06 integrations and the S2-07 closeout below add live reservation, customer menu/orders, inventory, staff-order, and kitchen paths.
- Added guest home, searchable/category-filtered menu with local cart, and a booking-request flow. Current live API-backed paths include the health-score read, S3 AI recommendations, reservations, customer menu/orders, inventory, and staff orders/kitchen; incident lifecycle, analytics/revenue, and several dashboard metrics remain sample-only.
- Added login and guest Email/OTP registration UI wired to the existing same-origin `/api/v1/auth/...` routes. The refresh token stays in the HttpOnly cookie and the access token stays in memory. `API_PROXY_TARGET` is server-only; no provider key is exposed to the browser.
- **Implementation commit:** `7e69d80` (Dhanush). **Validation on Node `24.21.0`:** Biome, TypeScript typecheck, Next production build, and `npm audit --audit-level=high` passed; zero vulnerabilities. `/`, `/login`, and `/register` returned HTTP 200 during the initial preview smoke check; the added `/menu` and `/book` routes were statically generated by the subsequent production build.
- **Status at initial frontend delivery:** S2-01/02 and S3-03/05 remain **In Progress** pending their remaining live workflow APIs/persistence and UX review. S2-07 has a locally integrated staff Orders/Kitchen feed and is now **Ready to Push**; remaining analytics/incidents and role-specific checks are tracked under S2-09/S2-12/S2-11. S2-11 role-based access presentation is tracked separately under Navin. No remote push or merge was made.

### S1-10 — Conditional Google sign-in UI

- Added an optional Google Identity Services button when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is configured. The returned ID token is posted to the existing same-origin `/api/v1/auth/google` endpoint; no client secret or provider key is exposed to the browser. Email/password remains available if the GIS script is blocked.
- **Implementation commit:** `6a64d1e` (Dhanush). **Validation on Node `24.21.0`:** frontend Biome, typecheck, production build, and `npm audit --audit-level=high` passed; zero vulnerabilities.
- **Status:** S1-10 remains **In Progress** pending an owner-provided client ID, live MongoDB, and a real Google ID-token test. No remote push or merge was made.

### S2-08 / S2-11 — Health-score UI integration and role-aware previews

- Wired the Overview health card to `GET /api/v1/healthscore` with the in-memory bearer token for Reception, Manager, and Administrator. It shows API component scores, insufficient-data markers, partial-sample notes, loading/unavailable states, and an on-demand retry. Signed-out mode keeps a clearly labeled sample value; no fake historical trend is shown.
- Restricted the restaurant-wide score from Kitchen Staff, hid commercial metrics outside Manager/Administrator views, and changed non-manager inventory displays to availability-only with no restock controls. A persistent preview banner now clarifies that most dashboard metrics and operations are sample-only and not persisted.
- **Frontend implementation commit:** `5d83355` (Dhanush). The companion backend route originated in `77ccd7c` and was integrated into local `main` at `70f5fb4`; the temporary area branches were later deleted at the owner's direction.
- **Validation on Node `24.21.0`:** frontend Biome, TypeScript typecheck, production build (all six app routes prerendered), and `npm audit --audit-level=high` passed; zero vulnerabilities. Live API/MongoDB testing is unavailable without Docker/MongoDB credentials.
- **Status:** S2-08 is now **Ready to Push** on local `main`: Navin completed the event/hourly recalculation cadence in the 2026-10-11 backend closeout. Live MongoDB/Atlas validation and browser E2E remain deferred. S2-11 remains **In Progress** pending full role-by-role workflow review. No remote push or merge was made.

### S2-06 — Inventory UI integration

- **Integration:** the frontend work originated on `feature/frontend`; local `integration/ci-validation` merged `feature/backend` → `feature/ai` → `feature/frontend` and was fast-forwarded to `main` at `70f5fb4`. All other local branch refs were deleted at the owner's direction; their commits are preserved in `main`.
- Added authenticated `GET /api/v1/inventory`, defensive response parsing, loading/live/unavailable/preview labels, retry, empty-list and truncation states, and sample-data disclosures. Reception and Kitchen Staff see availability without quantities or write controls. Managers and Administrators can submit an exact finite, non-negative on-hand count through `PUT /api/v1/inventory/{id}`. Preview edits remain local and are not persisted; supplier integration and automatic order deductions remain out of scope.
- **Frontend implementation commits:** `f2afac0` and `8d7f15a` (Dhanush). **Frontend README commit:** `7fdee3f` (Navin). **Integration merge commits:** `92604f7` and `b324460` (Navin).
- **CI-equivalent local validation on Node `24.21.0`:** frontend and backend `npm ci`, `npm audit`, Biome lint, typechecks, and production builds passed; backend suite passed all 45 tests. The frontend has no configured test script. `git diff --check` passed. GitHub Actions was not triggered because no push or pull request was made. Live MongoDB verification remains unavailable because Docker and `mongod` are absent.
- **2026-10-11 local closeout:** Frontend `npm ci`, Biome, TypeScript typecheck, Next.js production build, and audit (zero vulnerabilities) were rechecked with Node `24.21.0`; the frontend still has no automated test runner, so no browser E2E is claimed.
- **Status:** S2-06 is **Ready to Push** on local `main`. Live MongoDB/API persistence and index verification are deferred to the final database/deployment stage; no remote push or GitHub Actions run was made.

## 2026-10-11

### S2-03 — Reservation UI integration

- Replaced the `/book` preview-only submit with authenticated Customer reservation requests. Restaurant ID is configurable through the public demo environment variable; booking selections are interpreted in Chennai/India time and converted to a timezone-qualified UTC ISO timestamp for the API. The page shows saved status only after an API success and clearly explains that an `Awaiting` request is not a confirmed table.
- Added return-to-booking navigation after login/registration, customer next-visit loading across restaurants (using the API's restaurant display name) and pre-start cancellation, plus live staff schedule reads/status updates. Sample and unavailable data remain explicitly labeled; preview updates are not persisted.
- **Validation on Node `24.21.0`:** frontend `npm ci`, audit (zero vulnerabilities), Biome, typecheck, and Next.js production build passed. The frontend has no automated test script; no live browser interaction or MongoDB-backed UI flow was verified.
- **Implementation commit:** `9143697` (Dhanush).
- **Delivery:** frontend changes are committed locally on `main`; no remote push or GitHub Actions run was made. S2-03 remains Ready to Push pending live MongoDB and end-to-end UI verification.

### S2-04 — Live customer menu, cart, and order history

- Replaced the illustrative `/menu` catalog and preview-only checkout with a same-origin request to `GET /api/v1/menu`. Categories, currency, prices, dietary labels, allergens, and product IDs are now read from the live catalog; an unavailable catalog fails closed and never displays sample products as orderable.
- Added the bounded cart (20 distinct lines, 20 per item, 50 total units), server-verified `POST /api/v1/orders` submission for signed-in Customers, error handling, and cart restoration through login/registration using session storage containing only the restaurant/menu IDs and quantities. The UI labels new orders `Created` and discloses that payment and acceptance are not included.
- Added `/orders` customer history with cross-restaurant records, server-reported pre-bill totals, and cancellation only while status is `Created`. Login/register navigation preserves the menu/history continuation path.
- **Frontend implementation commits:** `e3b4ac2` (live menu/cart/submission), `a6bebe4` (history/cancellation UI), and `8a1d3b8` (consume the minimal customer item snapshot), Dhanush.
- **Validation on Node `24.21.0`:** frontend Biome, TypeScript typecheck, Next.js production build (including `/menu` and `/orders`), and `npm audit --audit-level=high` passed with zero vulnerabilities. The project has no automated frontend test runner. No live MongoDB-backed browser/E2E flow was verified.
- **Status:** S2-04 is Ready to Push on local `main`, pending live MongoDB persistence and browser/E2E verification. No remote push or GitHub Actions run was made.

### S2-07 — Staff Orders and Kitchen dashboard integration

- Connected the authenticated staff Orders page to `GET /api/v1/orders`; the UI maps `Created` to New, shows safe item/order fields only, offers Accept/Serve/Complete only to Reception/Manager/Administrator, and reloads after stale/unavailable responses. Kitchen Staff remain read-only on order headers.
- Connected the Kitchen page to `GET /api/v1/kitchen/queue` and item-level `PUT /api/v1/kitchen/queue/{orderId}`. Each ticket shows item preparation state and only offers `Created → Preparing → Ready` updates; it does not expose customer identities/prices or let Kitchen Staff serve/complete headers. Added live refresh, loading/unavailable/truncated states, and explicit unsaved sample actions.
- **Frontend implementation commit:** `87cb76c` (Dhanush). Local Node `24.21.0` Biome, TypeScript typecheck, and Next.js production build passed. The frontend has no automated test runner, so no browser E2E is claimed.
- **Status:** S2-07 is **Ready to Push** on local `main` after local checks. Assistant-recommended scope leaves incident/analytics views in S2-09/S2-12 and broader role-specific review in S2-11; those remain separate work. Live MongoDB validation is deferred to the final database/deployment stage; no remote push or merge was made.
