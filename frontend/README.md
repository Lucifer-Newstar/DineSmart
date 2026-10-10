# Andhrímnir Frontend

The frontend package contains the initial Andhrímnir application shell. Product workflows and backend integration will be added in their assigned stories; the current `/` route is intentionally a neutral placeholder.

## Requirements

- Node.js `24.21.0` (pinned in the repository root `.nvmrc`)
- npm

## Run locally

From the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000` in a browser.

## Quality commands

Run these from `frontend/`:

```bash
npm run lint       # Biome check (lint, format, import organization)
npm run format     # Format supported files with Biome
npm run typecheck  # TypeScript check
npm run build      # Production build
```

The scaffold uses Next.js `16.4.0`, React `19.3.0`, Tailwind CSS `4.3.3`, and Biome `2.5.15`. `package-lock.json` is authoritative for resolved dependency versions.
