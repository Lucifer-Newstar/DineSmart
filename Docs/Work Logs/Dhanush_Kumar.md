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
- Added guest home, searchable/category-filtered menu with local cart, and a booking-request flow. At this initial delivery stage, live API-backed paths included the health-score read, S3 AI recommendations, reservations, customer menu/orders, inventory, and staff orders/kitchen. S2-09 subsequently replaced the sample analytics route with live operational charts; incident lifecycle remains separate under S2-12, and revenue/average check remain out of scope until verified billing/payment data exists.
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
- **Checkpoint before the S2-11 closeout below:** S2-08 is **Ready to Push** on local `main`; Navin completed the event/hourly recalculation cadence in the 2026-10-11 backend closeout. Live MongoDB/Atlas validation and browser E2E remain deferred. At this checkpoint S2-11 was still **In Progress** pending role-by-role workflow and tenant-state review; see the later closeout entry below.

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
- **Status:** S2-07 is **Ready to Push** on local `main` after local checks. S2-09 live operational analytics is implemented separately; incident reporting/rules remain under S2-12 and broader role-specific review under S2-11. Live MongoDB validation is deferred to the final database/deployment stage; no remote push or merge was made.

### S2-09 — Live operational analytics dashboard

- Replaced the static revenue/service-mix illustration on the Analytics page with a protected fetch to `GET /api/v1/analytics`, strict response parsing, 7-/30-day selection, and explicit loading, empty, retry/unavailable, and analytics-role states. No demo values are substituted for an unavailable API response.
- Added local-time daily/hourly order charts, fulfillment/cancellation/in-progress outcomes, preparation observations, reservation status counts, current stock alerts, and visible partial-sample disclosure. Financial revenue, average check, guest PII, and inferred fulfillment-channel mix remain excluded because the implemented data does not support those claims.
- **Frontend implementation commit:** `d25fadf` (Dhanush). **Local validation on Node `24.21.0`:** frontend Biome checked 21 files; typecheck and Next.js production build passed; `npm audit --audit-level=high` reported zero vulnerabilities; `git diff --check` passed.
- **Status:** S2-09 is **Ready to Push** on local `main`, not Complete. No frontend automated test runner/browser E2E or live API/MongoDB validation was available; those checks, remote CI, deployment, push, and merge are not claimed.

### S2-11 — Role-based dashboard and customer order-summary closeout

- Completed the five-role workspace presentation against the approved matrix: Reception sees Orders, Reservations, and read-only Inventory availability; Kitchen Staff sees relevant Orders, Kitchen, and availability-only Inventory; Managers/Administrators retain restaurant-wide navigation; Customers enter their own account portal.
- Added a price-free recent-order summary from authenticated `GET /api/v1/orders/history` to the Customer portal, retaining the full order-history workflow separately at `/orders`. Customer ownership and restaurant scope continue to be enforced by the API, not the UI.
- Added stale-section fallback and navigation-action filtering. Recommendation/review UI state is matched to the active user, restaurant, and role; mismatched state immediately falls back to demo/unreviewed. Analytics remounts with the same workspace scope key so a previous tenant report and request are discarded. These are client-state safeguards, not authorization.
- Added Node-native role/access tests, including workspace-scope isolation. **Test result:** 6 passed, 0 failed; the configured frontend test script is also picked up by CI.
- **Implementation commit:** `0ee395a` (Dhanush), local `main`.
- **Local validation on Node `24.21.0`:** frontend `npm ci`, dependency audit (zero vulnerabilities), Biome (22 files), unit tests, TypeScript typecheck, and Next.js production build all passed. No browser E2E, live MongoDB/Atlas test, remote CI run, push, or merge is claimed.
- **Status:** S2-11 is **Ready to Push** on local `main`, not Complete.

### 2026-10-11 — S2-15 Password Reset API started

- Continued sequentially on local `main` after S2-14's Ready to Push checkpoint; marked S2-15 In Progress. No branch was created.
- Reviewed the approved authentication baseline, S1-11 registration OTP controls, refresh-session lifecycle, and the draft `/auth/reset-password` inventory. Reuse the approved six-digit/10-minute/60-second/five-attempt OTP values, but keep registration OTP fields and reset flows separate.
- Implement the two-step request/confirm flow under my Git identity. The generic request response prevents account enumeration; only active password-backed accounts receive a code. Reset code remains HMAC-hashed, successful confirmation changes the Argon2id password and revokes refresh sessions. These additional contract details are recommendations, not separate owner approvals.
- Work remains local; no email-provider credentials, production provider check, live database, deployment, push, or remote CI is part of this item.

### 2026-10-11 — S2-15 password-reset implementation and local closeout

- Implemented separate reset-code state and constants, Mongo atomic issuance/consumption, HMAC-only OTP storage, active/password-backed account filtering, resend cooldown and attempt limits, Argon2id replacement, reset-state clearing, and active refresh-session revocation.
- Added strict request/confirm handlers with exact body/query validation, generic no-store request response, development-mock-only code, origin checks, five-request/ten-confirmation process-local IP limits, and refresh-cookie clearing. Refresh rejects stale families if session bulk-revocation fails; stateless access JWTs retain their existing 15-minute lifetime.
- Added repository/service/router/auth coverage for eligibility, lockout, cooldown, password/code bounds, account-enumeration-safe response bodies, origin/rate limits, cookie clearing, and session-revocation fallback. The two-step contract and security details remain assistant recommendations, not extra owner approvals.
- **Implementation commits:** `72b0322` (repository/service/schema/session policy/tests); `b33fdef` (HTTP endpoints and router tests). Shared app composition was committed separately by Navin as `1415eea`.
- **Local verification via Node `24.21.0`:** Biome checked 128 backend files with no findings; TypeScript typecheck and production build passed; all 216 backend tests passed; `npm audit --audit-level=high` found zero vulnerabilities; `git diff --check` passed. The base shell Node remains `20.20.2`.
- **Status:** S2-15 is **Ready to Push** on local `main`, not Complete. Repository tests use fakes; no live MongoDB/Atlas, real email-provider credentials/delivery, browser E2E, remote CI, deployment, push, or merge is claimed.

## 2026-10-12

### S2-01 Customer Landing Page and S2-02 Digital Menu closeout

- Added a public guest-facing landing page at `/`. The entry route now shows the Customer Portal to Customer sessions and the role-based operations workspace to staff after session restoration; `/dashboard` preserves the signed-out sample operations preview. The restaurant-team sign-in link continues to `/dashboard`, and home/back labels now describe the public home correctly.
- Extracted live menu response/cart validation into a pure utility module and added Node-native tests for safe response parsing, dietary/allergen data, cart/menu/restaurant matching, quantity/line bounds, and integer-safe totals. The menu now withholds an unsafe subtotal and blocks checkout instead of showing a rounded/overflowed amount.
- The landing/menu presentation defaults are documented as assistant-selected recommendations, not owner approvals. No restaurant directory, owner onboarding, payment capture, or reservation/order policy was added.
- **Implementation commits:** `307085d` (S2-01 landing/routing), `b385815` (S2-02 menu/cart validation and tests), both authored by Dhanush on local `main`.
- **Local verification via Node `24.21.0`:** `npm ci` installed 56 frontend packages and reported zero vulnerabilities; Biome checked 27 files; all 11 frontend unit tests passed (6 existing role/access and 5 menu/cart tests); TypeScript typecheck and Next.js production build passed, generating `/` and `/dashboard`; `npm audit --audit-level=high` found zero vulnerabilities; `git diff --check` passed.
- **Status:** S2-01 and S2-02 are locally committed and **Ready to Push**, not Complete. No browser E2E, interactive/responsive visual review, or Customer UAT was run. Docker/`mongod`, `.env` files, `MONGODB_URI`, `JWT_SECRET`, `API_PROXY_TARGET`, and local backend health are unavailable; live API/menu/auth/order/reservation persistence was not verified. No Git remote is configured, so remote CI/review/merge and deployment were not verified or attempted. No push or deployment was made.

### S3-03 — Recommendation UI and response validation

- Added strict frontend parsers for recommendation-list and generated-recommendation API payloads. They fail closed on malformed/oversized/ambiguous records, unsupported severity/source, invalid confidence, excessive/short text/action fields, and incident-ID mismatch; explicitly seeded `demo` records remain distinguishable from Gemini and deterministic fallback results.
- Connected Manager/Administrator Insights to load the saved recommendation for the seeded inventory incident with a no-store, authenticated GET. Requests abort on workspace/scope changes; the UI exposes loading, empty, unavailable, restricted, and sample-preview states and validates POST results before state changes. The Overview teaser now labels a backend fallback correctly. No Gemini key is sent to the browser.
- **Dhanush-authored commits:** `554acce` (`feat(S3-03): validate recommendation API payloads`) and `4fb28fd` (`feat(S3-03): load scoped saved recommendations in Insights`).
- **Local verification on Node `24.21.0`:** 16 frontend tests passed, including five recommendation parser cases; Biome checked 29 files; TypeScript typecheck and Next.js production build passed; high-severity npm audit reported zero vulnerabilities.
- **Limits/status:** no live backend/MongoDB/Gemini, browser E2E, responsive visual review, or customer UAT was available. S3-03's locally tested implementation is **Ready to Push**, not Complete; no remote CI, push, merge, or deployment is claimed.

### S3-05 — Dashboard polish and read-only incident feed

- Added a frontend-only Manager/Administrator Incidents view backed by the signed-tenant `GET /api/v1/incidents` response, with strict bounded parsing, request cancellation on workspace changes, manual refresh, open/resolved cards, safe trigger snapshots, truncation notices, and matching recommendation links. Live, empty, loading, unavailable, restricted, and sample-preview states remain distinguishable; client-supplied tenant filters and manual resolution controls are not introduced.
- Updated Overview incident counts/navigation and Insights incident context to use validated incident records; Insights shows status/root cause/trigger facts only when a recommendation matches an incident. Preview notification content remains explicitly labeled. The Insights claim is no longer a static inventory/paneer example.
- **Dhanush-authored commits:** `5b379df` (scoped feed, parser, role tests and dashboard/Insights integration) and `3564ea5` (incident/Insights styling), committed locally on `main`.
- **Local verification via Node `24.21.0`:** frontend tests passed 20/20; Biome checked 31 files; TypeScript typecheck and Next.js production build passed; `npm audit --audit-level=high` found zero vulnerabilities.
- **Status/limits:** S3-05 is **Ready to Push**, not Complete. No browser E2E, responsive visual review, live API/MongoDB, remote CI, push, merge, or deployment is claimed. The panel is an assistant-selected interpretation of the backlog's generic Dashboard Polish item, not separately confirmed owner design approval.

### S3-07 — Frontend bug-fix sub-scope

- During a local dashboard review, found that the overview's sample revenue card presented a “Last 7 days” button with an empty click handler and chevron. Replaced it with a static “Last 7 days · sample” label so the preview card no longer advertises an inert interaction.
- **Dhanush implementation commit:** `30f2ac4` (`fix(S3-07): make sample range read-only`).
- **Local verification via Node `24.21.0`:** all 21 frontend tests passed; Biome checked 32 files; TypeScript typecheck and Next.js production build passed; high-severity audit found zero vulnerabilities.
- **Status/limits:** this is a frontend-only S3-07 sub-scope; the overall bug-fixing item remains **In Progress** pending broader review. No browser E2E, responsive visual review, live services, remote CI, push, merge, or deployment is claimed.
