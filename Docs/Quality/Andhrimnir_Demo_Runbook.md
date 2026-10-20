# Andhrímnir – Demo Runbook

**Status:** Preparation document for S3-12 (Presentation & Demo). It describes how to run the demonstration and what to do when a dependency is unavailable. It is not evidence that a live demo has been executed: no local MongoDB, Gemini key, or deployment is configured in this workspace.

Companion documents: [Demo Strategy & Mock Data Structure](Andhrimnir_Demo_Strategy_and_Mock_Data_Structure.md), [Presentation Plan](../Planning/Andhrimnir_Presentation_Plan.md), [Test Plan & Acceptance Criteria](Andhrimnir_Test_Plan_and_Acceptance_Criteria.md).

## 1. Pre-demo setup (target: 15 minutes before the slot)

1. Start MongoDB. Local Docker Compose first (`docker compose up -d` in `backend/`); Atlas later using `MONGODB_URI`. Without a database the API stays in liveness-only mode.
2. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI`, a 32-byte `JWT_SECRET`, `WEB_ORIGIN` (exact frontend origin), and, when available, `GEMINI_API_KEY` and `GOOGLE_CLIENT_ID`. Never commit real values.
3. Copy `frontend/.env.example` to `frontend/.env.local` and set `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
4. Install and build both packages on Node `24.21.0`: `npm ci` in `frontend/` and `backend/`, then `npm run build`.
5. Seed demo data once the database is reachable: `npm run seed` in `backend/`. The command upserts fixed fixture IDs and is repeatable; it refuses production or remote targets unless explicitly overridden by the documented local-only guard.
6. Start the API (`npm run start`) and the frontend (`npm run start`), then confirm `GET /health` returns `{ "status": "ok" }`.

Run `node tools/demo-readiness.mjs` from the repository root to print the prerequisite checklist this runbook depends on.

## 2. Demo script (10 minutes)

| Step | Action | What the audience should see |
| --- | --- | --- |
| 1 | Open `/` signed out | Public landing page with menu, reservation, and team sign-in entry points |
| 2 | Register/sign in as a Customer | OTP step (mock provider locally), then the Customer portal |
| 3 | Customer: browse `/menu`, add items, place an order | Server-derived prices, ID/quantity-only cart, order appears in `/orders` history |
| 4 | Customer: `/book` a table | Reservation appears as `Awaiting`; Reception confirms it later |
| 5 | Sign in as Reception | Orders, Reservations, availability-only Inventory; no incidents/analytics/AI sections |
| 6 | Reception: confirm the reservation | Status change persists and the dashboard reflects it |
| 7 | Sign in as Kitchen Staff | Kitchen board with item-level `Created → Preparing → Ready` updates only |
| 8 | Sign in as Manager | Full workspace: Overview, Orders, Kitchen, Reservations, Inventory, Incidents, Insights, Analytics, Settings |
| 9 | Manager: place a large order / let the queue build | Incident detected with trigger snapshot and severity |
| 10 | Manager: open Insights and generate a recommendation | Advisory summary, priority, actions, confidence, and source label (`gemini`, `fallback`, or seeded demo) |
| 11 | Manager: clear the trigger condition (serve orders or restock) | Incident resolves automatically with `condition_cleared`; a recurrence creates a fresh ID |
| 12 | Manager: open Analytics | Tenant-scoped operational charts for `7d`/`30d` with truncation notices when capped |
| 13 | Show the health score card | Six weighted components with observation counts and refresh behavior |
| 14 | Sign in as Administrator | Same operational scope; staff management and role administration surfaces |

## 3. Fallback paths

| Failure | Symptom | What to do and what to say |
| --- | --- | --- |
| No MongoDB | API serves `/health` only; operational routes return unavailable | Say the database is not running; show the loading/unavailable states and the read-only degradation described in the [Database Fallback Strategy](../Architecture/Andhrimnir_Database_Fallback_Strategy.md) |
| No Gemini key | Recommendation generation returns the deterministic fallback | Emphasize the fallback: incident-specific guidance is still produced, labeled `fallback`, and remains advisory |
| Seeded data missing | Empty lists | Re-run `npm run seed`; if the database is unavailable, show the labeled sample preview and say it is preview data, not live |
| Frontend cannot reach the API | Fetch failures in every section | Show the explicit error/empty states; do not present sample cards as live results |
| WebSocket unavailable | No live push | Use manual refresh; the dashboard already supports refresh actions per section |

## 4. Demo hygiene rules

- Keep every sample/preview label visible. Sample content must never be narrated as live operational data.
- Pre-bill order subtotals are not revenue, and no payment is captured.
- AI output is advisory: the platform does not mutate orders, inventory, or incidents from model output.
- Incidents resolve automatically when their condition clears; there is no manual close control, so do not promise one.
- Role switching is the strongest evidence of the permission model: sign in per role rather than describing the matrix.

## 5. Recorded backup demo

If the live environment cannot run during the slot, present the captured walkthrough instead of narrating from memory.

- `tools/capture-demo.mjs` walks the browser-visible steps, captures one screenshot per step, and writes a single self-contained `demo-capture/index.html` whose screenshots are embedded as data URIs, so it opens offline with no network access. Playwright is deliberately not a project dependency; install it on demand with `npm i -D playwright && npx playwright install chromium`.
- Run it with the stack already up: `node tools/capture-demo.mjs --base-url http://127.0.0.1:3000 --out demo-capture`. Dashboard sections are component state rather than routes, so the tool clicks the sidebar item and records whether the navigation applied (`navigationApplied` in `demo-capture/manifest.json`).
- The committed capture was produced without MongoDB, so its dashboard steps show the labelled preview/empty states. Re-capture it after seeding the database and signing in as a Manager to replace steps 7–11 with live operational screens; the narrations already say which parts are preview-only.
- Presenter note: this replaces a video recording, which is not possible in this workspace. Say it is a captured walkthrough, not a live run.

## 6. Post-demo checklist

- Capture any defect observed during the run into S3-07 bug triage with a reproduction note.
- Record which environment variables were set (names only, never values) in the work log.
- Update the demo checklist in the Demo Strategy document with what actually worked.
