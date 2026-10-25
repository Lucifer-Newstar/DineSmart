# Contributing to Andhrímnir

Thanks for helping build Andhrímnir (the DineSmart repository). This guide covers setup, the checks every change must pass, and how commits and pull requests are written.

## Setup

1. Install Node.js `24.21.0`, the version pinned in `.nvmrc`. With nvm: `nvm install` then `nvm use`; on Windows with nvm-windows: `nvm install 24.21.0` then `nvm use 24.21.0`.
2. Start MongoDB. The simplest route is Docker Compose from the repository root: `docker compose up -d mongodb`.
3. Install the three packages:

   ```bash
   npm ci                 # repository tooling (commitlint)
   cd backend && npm ci   # API
   cd ../frontend && npm ci
   ```

4. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`, then fill in `JWT_SECRET` (at least 32 random bytes). `EMAIL_PROVIDER=mock` is enough for local work.
5. Optional demo data: `npm run seed` in `backend/`. The demo accounts are listed in `backend/README.md`.
6. Run `npm run dev` in `backend/` (port 3001) and in `frontend/` (port 3000).

## Checks

Run these before you push. CI runs the same commands on Node `24.21.0`.

| Where | Commands |
| --- | --- |
| `backend/` | `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, `npm audit --audit-level=high` |
| `frontend/` | `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, `npm audit --audit-level=high` |
| Repository root | `node --test tools/*.test.mjs`, `node tools/demo-readiness.mjs --strict`, `node tools/api-contract-check.mjs --strict` |

`npm run format` in `backend/` or `frontend/` applies the Biome formatting. A local pass is not a GitHub Actions result, so never claim CI is green until the workflow run shows it.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are checked by commitlint (`commitlint.config.mjs`):

```text
type(TASK-ID): lowercase subject in the imperative
```

- Types: `feat`, `fix`, `test`, `docs`, `ci`, `chore`, `refactor`, `perf`, `style`, `build`, `revert`, and `demo` for presentation and demo-capture work.
- The scope is the backlog task ID, for example `feat(S4-05): add the menu manager page to the dashboard`.
- Headers stay at or under 120 characters.
- One logical change per commit, with its test in the same commit or the commit right after it. No empty, merge or "fix typo" padding commits.

Check a range locally before pushing:

```bash
npx commitlint --from origin/main --to HEAD
```

## Branches and history

- The team works directly on `main`, as recorded in [Branch-Strategy.md](Docs/Planning/Branch-Strategy.md). History stays linear: rebase or fast-forward, never a merge commit, and never rewrite commits that are already on GitHub.
- Each day's work is reviewed by the owner of a different area before Navin pushes it. Use the pull request template when a change does go through a pull request; its checklist mirrors the Definition of Done.
- Commit as the owner of the area you changed (see the table below and `.github/CODEOWNERS`).

## Ownership

| Area | Owner |
| --- | --- |
| Backend domain, API and database | Jegatheesan |
| Frontend, UI and authentication flows | Dhanush |
| CI, devops, scripts, test infrastructure, environment and notifications | Gokul |
| Incidents, AI, RBAC, security, shared documentation and releases | Navin |

## Security

Never commit `.env` files, tokens, passwords or real customer data. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
