# Andhrímnir Backend

This package is the initial Express API foundation. It currently provides a process-liveness endpoint only; product routes, database integration, authentication, and restaurant workflows are not implemented yet.

## Requirements

- Node.js `24.21.0` (pinned in the repository root `.nvmrc`)
- npm

## Run locally

From the repository root, select the pinned Node version and run:

```bash
cd backend
npm ci
npm run dev
```

The server listens on port `3001` by default (or the value of `PORT`) and binds to `0.0.0.0`. Check `GET http://localhost:3001/health`; this endpoint reports process liveness, not database readiness.

## Quality commands

Run these from `backend/`:

```bash
npm run lint
npm run format
npm run test
npm run typecheck
npm run build
```

The test suite uses Node's built-in test runner. No database URI or other secrets are required by the scaffold.
