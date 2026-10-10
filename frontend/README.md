# DineSmart Frontend

A responsive restaurant workspace built with the Next.js App Router. The `/` route is an interactive, sample-data operations preview with overview, orders, kitchen, reservations, inventory, incidents, AI insights, analytics, and settings views. Customer sessions are routed to a guest home; `/menu` includes category/search filters and a local preview cart, and `/book` contains a reservation-request preview.

Login, registration, OTP verification, refresh, and logout call the versioned backend auth routes. Access tokens stay in React memory; the refresh token is handled as an HttpOnly cookie. Most dashboard metrics, order/reservation/inventory lists and local controls, menu checkout, and table-booking remain preview-only; do not treat sample metrics or local button actions as restaurant records. When signed in, Overview requests `GET /api/v1/healthscore` for Reception, Manager, and Administrator and shows the live component breakdown, loading/unavailable states, and a retry action. Kitchen Staff do not receive the restaurant-wide score. Other operational records still lack live persistence.

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
