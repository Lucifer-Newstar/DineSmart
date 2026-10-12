# DineSmart Frontend

A responsive restaurant workspace and customer entry built with the Next.js App Router. Signed-out visitors see the public customer landing page at `/`; Customer sessions see their own portal, and signed-in staff see the role-based restaurant workspace. `/dashboard` keeps the sample-data operations preview available when signed out and opens the signed-in workspace for authenticated sessions. The customer `/menu` route loads the public live menu and provides a bounded cart; `/orders` shows the signed-in Customer's order history and allows cancellation before restaurant acceptance. `/book` submits a customer reservation request when the API is available.

Login, registration, OTP verification, refresh, and logout call the versioned backend auth routes. Access tokens stay in React memory; the refresh token is handled as an HttpOnly cookie. The customer menu fails closed if the public menu is unavailable and never submits illustrative items. A Customer can submit a cart to `POST /api/v1/orders`; the API rechecks availability/prices and returns a `Created` pre-bill order request. `/orders` calls `GET /api/v1/orders/history` and `PUT /api/v1/orders/{id}/cancel`; the Customer dashboard also loads a price-free recent-order summary from the authenticated history route. No payment, tax capture, fulfillment assignment, or customer-visible acceptance workflow is included yet. The staff Orders page reads `GET /api/v1/orders` and sends authorized accept/serve/complete transitions; Kitchen reads `GET /api/v1/kitchen/queue` and sends item-level preparation updates. Both expose live/loading/unavailable states; preview actions are not saved. S2-09 Analytics uses the protected tenant-scoped API for live daily/hourly order activity, outcomes, preparation, reservations, and stock. It does not report revenue from pre-bill order subtotals; incident lifecycle and other explicitly labeled preview metrics remain separate.

## Recommendation UI (S3-03)

Manager and Administrator Insights load the saved recommendation for the seeded inventory incident from `GET /api/v1/recommendations?incidentId=...`; generating a fresh advisory uses the protected incident recommendation `POST` endpoint. The browser strictly validates response shape, bounded text/actions, confidence, source, and incident identity before rendering. Loading, empty, unavailable, restricted, and sample-preview states are distinguishable; Gemini and deterministic fallback sources are labeled separately from seeded demo guidance. Requests are scoped to the signed-in workspace and are aborted when the identity/tenant changes. The browser never calls Gemini directly; the provider key remains backend-only. These API-connected UI paths are build- and unit-verified but have not been exercised with a live API/database or browser E2E.

## Incident dashboard (S3-05)

The Incidents workspace reads the bounded `GET /api/v1/incidents` feed only for Manager/Administrator sessions. It validates IDs, statuses, timestamps, root-cause text, and whitelisted trigger fields before rendering. Open and resolved records are read-only; the approved lifecycle resolves rule-managed incidents when their trigger clears, so there is no manual close control. Loading, empty, unavailable, restricted, partial-list, and sample-preview states are explicit; requests are cancelled when the workspace identity changes. The Overview incident count is driven by the loaded feed when available, and preview notification content is labelled as sample data. Local parser tests/build pass; live API/MongoDB and browser E2E remain outstanding.

## Role-based workspaces

- Customer sessions open a dedicated portal with their own order-history summary, cross-restaurant upcoming reservations, links to full order/reservation workflows, and sign-out. The API remains responsible for ownership checks.
- Reception sees Overview, Orders, Reservations, Inventory availability, and Settings; commercial analytics, incidents, and AI recommendations are hidden. Inventory remains read-only for this role.
- Kitchen Staff sees Overview, relevant Orders, Kitchen, Inventory availability, and Settings; reservation, incident, analytics, and recommendation sections are hidden. Kitchen order updates remain item-level.
- Manager and Administrator can reach the full restaurant workspace; tenant and permission enforcement remains server-side. A stale/unauthorized selected section resolves to Overview when the session role changes. Recommendation/review state is scope-keyed and falls back to preview/unreviewed immediately on an identity change; Analytics remounts for the new workspace and aborts its earlier request. Other tenant-bound feeds clear as their new session requests begin.
- `npm test` runs the frontend role/access, menu/cart, recommendation-response, incident-response, interactive-control regression, and dashboard metric suites on Node `24.21.0` (29 tests at this checkpoint). Local frontend checks pass; component-level browser E2E and live MongoDB persistence/index validation remain outstanding.

## Demo walkthrough (S3-12)

The step-by-step script lives in [`Docs/Quality/Andhrimnir_Demo_Runbook.md`](../Docs/Quality/Andhrimnir_Demo_Runbook.md). This section records the frontend surfaces it depends on so presenters know exactly what each route shows.

| Route | Audience | What to show |
| --- | --- | --- |
| `/` | Signed-out visitors | Public landing page with menu, reservation, and team sign-in entry points |
| `/login`, `/register` | Everyone | Email/password and Google sign-in, Email/OTP registration |
| `/menu` | Customers | Public live menu, bounded cart, ID/quantity-only submission |
| `/orders` | Customers | Own order history and pre-acceptance cancellation |
| `/book` | Customers | Reservation request |
| `/dashboard` (Customer) | Customers | Own recent orders and upcoming reservations, no staff sections |
| `/dashboard` → Orders, Kitchen | Kitchen Staff | Item-level `Created → Preparing → Ready` updates only |
| `/dashboard` → Orders, Reservations, Inventory | Reception | Availability-only stock; no incidents, analytics, or AI sections |
| `/dashboard` → Incidents | Manager/Administrator | Bounded feed, trigger snapshots, read-only lifecycle |
| `/dashboard` → Insights | Manager/Administrator | Advisory recommendation with Gemini/fallback/demo source labels |
| `/dashboard` → Analytics | Manager/Administrator | `7d`/`30d` operational charts with truncation notices |

Presenter rules for the UI:

- Keep sample/preview labels visible; never narrate preview cards as live operational data.
- Every section distinguishes loading, empty, unavailable, restricted, and live states — pause on one of these if a service fails, and explain the fallback.
- Incidents have no manual close control; rule-managed records resolve when their condition clears.
- Pre-bill subtotals are not revenue, and no payment is captured in the UI.

## Requirements

- Node.js `24.21.0` (pinned in the repository root `.nvmrc`)
- npm

## Run locally

From the repository root:

```bash
docker compose up -d mongodb
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cd backend && npm ci && npm run seed && npm run dev
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. For auth, set a local `JWT_SECRET`, use the mock development email provider, and set `WEB_ORIGIN=http://localhost:3000` in `backend/.env`. Demo users and the local-only password are documented in `backend/README.md`.

## API proxy and environment

- The browser requests relative `/api/v1/...` paths. `next.config.ts` proxies them server-side to `API_PROXY_TARGET`, which defaults to `http://127.0.0.1:3001`; the browser never calls a hard-coded localhost URL.
- `API_PROXY_TARGET` is server-only. Set it to the backend service origin in a deployment; never expose API secrets using a `NEXT_PUBLIC_` variable.
- The backend requires an exact `WEB_ORIGIN` match for auth writes. Set it to the actual frontend origin in each environment.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is a public OAuth client ID placeholder; no client secret is used in the browser.

Copy `.env.example` to `.env.local` for local development. Keep Gemini and email-provider keys in the backend environment only.

## Quality commands

Run these from `frontend/`:

```bash
npm run lint       # Biome check (lint, format, import organization)
npm run format     # Format supported files with Biome
npm run typecheck  # TypeScript check
npm run build      # Production build
```

The package uses Next.js `16.4.0`, React `19.3.0`, Tailwind CSS `4.3.3`, and Biome `2.5.15`. `package-lock.json` is authoritative for resolved dependency versions.
