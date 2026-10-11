# DineSmart Frontend

A responsive restaurant workspace built with the Next.js App Router. The `/` route is an interactive, sample-data operations preview with overview, staff orders, kitchen, reservations, inventory, incidents, AI insights, analytics, and settings views. The customer `/menu` route loads the public live menu and provides a bounded cart; `/orders` shows the signed-in Customer's order history and allows cancellation before restaurant acceptance. `/book` submits a customer reservation request when the API is available.

Login, registration, OTP verification, refresh, and logout call the versioned backend auth routes. Access tokens stay in React memory; the refresh token is handled as an HttpOnly cookie. The customer menu fails closed if the public menu is unavailable and never submits illustrative items. A Customer can submit a cart to `POST /api/v1/orders`; the API rechecks availability/prices and returns a `Created` pre-bill order request. `/orders` calls `GET /api/v1/orders/history` and `PUT /api/v1/orders/{id}/cancel`. No payment, tax capture, fulfillment assignment, or customer-visible acceptance workflow is included yet. The staff dashboard's order queue, most other dashboard metrics, and local controls remain sample-only; do not treat sample metrics or local button actions as restaurant records. For signed-in Reception, Kitchen Staff, Manager, and Administrator users, the Inventory page requests `GET /api/v1/inventory`; Manager and Administrator can save stock-count adjustments through `PUT /api/v1/inventory/{id}`. Reception and Kitchen Staff receive availability-only data and no adjustment controls. If inventory is unauthenticated or unavailable, the interface labels its sample rows and non-persisted preview adjustments; supplier integration remains preview-only. When signed in, Overview requests `GET /api/v1/healthscore` for Reception, Manager, and Administrator and shows the live component breakdown, loading/unavailable states, and a retry action. Kitchen Staff do not receive the restaurant-wide score. Local API/UI checks pass, but live MongoDB persistence and browser E2E verification remain outstanding.

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
