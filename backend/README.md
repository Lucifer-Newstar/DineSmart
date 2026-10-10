# Andhrímnir Backend

This package provides the Express API foundation, a process-liveness endpoint, native MongoDB connection setup, and the initial typed collection/index baseline in `src/database/schema.ts`. Product routes, authentication workflows, strict document validation, and restaurant operations remain pending.

## Requirements

- Node.js `24.21.0` (pinned in the repository root `.nvmrc`)
- npm
- Docker Compose for the local MongoDB service, or a MongoDB instance of your own

## Run locally with Docker Compose

From the repository root:

```bash
docker compose up -d mongodb
cp backend/.env.example backend/.env
cd backend
npm ci
npm run dev
```

The API listens on port `3001` by default (or the value of `PORT`) and binds to `0.0.0.0`. `GET /health` reports process liveness only; it does not indicate database readiness. The Compose service binds MongoDB to loopback on port `27017` and stores local data in a named volume. Do not expose this unauthenticated development service to a network.

To stop MongoDB while preserving data, run `docker compose down` from the repository root. Use `docker compose down --volumes` only when you intend to delete the local database volume.

## Quality commands

Run these from `backend/`:

```bash
npm run lint
npm run format
npm run test
npm run typecheck
npm run build
```

The tests use Node's built-in test runner. Connection configuration is read from `MONGODB_URI`; no Atlas credentials are committed. Atlas connectivity can be configured later by supplying a URI through a secret-safe local environment.
