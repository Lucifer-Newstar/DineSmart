# Andhrímnir

**Andhrímnir** is a proposed AI incident-intelligence platform for restaurant operations. The GitHub repository is named **DineSmart**. The platform turns signals from orders, reservations, inventory, kitchen workflows, and staff activity into incidents, contextual recommendations, and operational insights for restaurant teams.

> This repository contains product and technical documentation, a documentation-conversion utility, and Next.js and Express applications. Locally tested backend modules include authentication, public menu and customer orders, reservations, restaurant operations, analytics, notifications, billing, waitlist/table management, and advisory AI recommendations. Service and route checks use local fakes; live MongoDB/Atlas persistence, Google/email/Gemini credentials, browser acceptance, and deployment are not verified or configured here.

## Product vision

Most restaurant systems record transactions but do not proactively identify operational issues. Andhrímnir is designed as an intelligence layer that helps teams detect bottlenecks, shortages, delays, and congestion before they affect customers.

The documented MVP scope includes:

- Customer authentication, digital menu, reservations, and orders
- Restaurant operations dashboard, kitchen queue, and inventory monitoring
- Rule-based incident detection and explainable AI-assisted recommendations
- Restaurant health score, analytics, notifications, and role-based access

## Planned architecture

| Layer | Technology |
| --- | --- |
| Frontend | Next.js `16.4.0` App Router, React `19.3.0`, Tailwind CSS `4.3.3`, TypeScript, Biome `2.5.15` |
| Backend | Node.js `24.21.0` LTS, Express `5.3.0`, TypeScript |
| Data | MongoDB Atlas (planned production), local MongoDB for development via Docker Compose, official MongoDB Node driver |
| Authentication | Email/OTP registration, Email/Password login, Google OAuth, JWT, RBAC |
| AI | Gemini API |
| Deployment | Vercel (frontend), Render (backend) |

Node.js `24.21.0` is pinned in the repository-root `.nvmrc`. Each app's npm lockfile is authoritative for its resolved package versions.

## Frontend setup

From the repository root, use Node.js `24.21.0` and run:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. Signed-out visitors see the public customer landing page at `/`; once a session is restored, Customers see their own portal and staff see the role-based workspace. `/dashboard` preserves the signed-out sample operations preview. `/menu` loads the public API menu and fails closed when unavailable; `/book` submits a Customer reservation request when the API is available. Some staff/demo views remain explicitly labeled previews. The optional `frontend/.env.example` contains only local configuration placeholders; never put secrets in `NEXT_PUBLIC_` variables. See the [frontend guide](frontend/README.md) for role-specific behavior and quality commands.

## Backend setup

For local development with Docker Compose, use Node.js `24.21.0` and run from the repository root:

```bash
docker compose up -d mongodb
cp backend/.env.example backend/.env
cd backend
npm ci
npm run dev
```

The API listens on `http://localhost:3001` by default. `GET /health` reports process liveness only; it does not indicate a database connection. The local MongoDB service is bound to loopback; do not expose it to a network. See the [backend guide](backend/README.md) for quality commands and current scope.

## Continuous integration

The [GitHub Actions CI workflow](.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch. It installs from each app's lockfile, audits dependencies, checks Biome and TypeScript, runs configured tests, and builds both apps. The latest local CI-equivalent checks use Node `24.21.0`: the backend has 293 passing tests, the frontend has 38 passing unit tests, both packages pass Biome/typechecks/production builds, and both high-severity audits report zero vulnerabilities. This is local validation, not a GitHub Actions result. No remote is configured and nothing was pushed. Deployment/CD is not configured.

## Documentation

### Application setup

- [Frontend setup guide](frontend/README.md)
- [Backend setup guide](backend/README.md)

### Product and requirements

- [Product vision](Docs/Product/Andhrimnir_Product_Vision_Document.md)
- [Software requirements specification](Docs/Product/Andhrimnir_Software_Requirement_Analysis_SRS.md)

### Architecture and technical design

- [Software design document](Docs/Architecture/Andhrimnir_Software_Design_Document_SDD.md)
- [Architecture and design diagrams](Docs/Architecture/Andhrimnir_Complete_Diagrams_Document.md)
- [Canonical API specification](Docs/Architecture/Andhrimnir_API_Specification.md)
- [Database fallback strategy](Docs/Architecture/Andhrimnir_Database_Fallback_Strategy.md)
- [Implementation decisions and open items](Docs/Architecture/Andhrimnir_Implementation_Decisions.md)

### Planning and delivery

- [Project planning document](Docs/Planning/Andhrimnir_Project_Planning_Document.md)
- [Development workflow](Docs/Planning/Development-Workflow.md)
- [Branch strategy](Docs/Planning/Branch-Strategy.md)
- [Canonical sprint backlog](Docs/Planning/Andhrimnir_Sprint_Backlog.md)
- [Backlog additions history](Docs/Planning/History/Andhrimnir_Backlog_Additions_History.md)
- [Integrated phase-completion roadmap](Docs/Planning/Andhrimnir_Integrated_Phase_Completion_Roadmap.md)

### Quality and demonstration

- [Test plan and acceptance criteria](Docs/Quality/Andhrimnir_Test_Plan_and_Acceptance_Criteria.md)
- [Demo strategy and mock-data structure](Docs/Quality/Andhrimnir_Demo_Strategy_and_Mock_Data_Structure.md)

### Team guides and work logs

- [Navin Jairam execution guide](Docs/Developers%20Guide/Andhrimnir_Team_Execution_Guide_Navin_Jairam.md)
- [Dhanush execution guide](Docs/Developers%20Guide/Andhrimnir_Team_Execution_Guide_Dhanush.md)
- [Jegatheesan execution guide](Docs/Developers%20Guide/Andhrimnir_Team_Execution_Guide_Jegatheesan.md)
- [Gokul execution guide](Docs/Developers%20Guide/Andhrimnir_Team_Execution_Guide_Gokul.md)
- [Navin Jairam work log](Docs/Work%20Logs/Navin_Jairam.md)
- [Dhanush Kumar work log](Docs/Work%20Logs/Dhanush_Kumar.md)
- [Jegatheesan work log](Docs/Work%20Logs/Jegatheesan.md)
- [Gokul work log](Docs/Work%20Logs/Gokul.md)

## Development status

The MVP scope, architecture, API inventory, delivery plan, and acceptance criteria are documented. Former local feature branches were integrated into `main` at `70f5fb4`; all other local branch references were deleted at the owner's direction. No Git remote is configured and nothing was pushed. **Ready to Push** on local `main`: S1-02/S1-03/S1-04/S1-06, S2-01–S2-18, and S3-03/S3-05/S3-06/S3-11. S1-01 is marked **Complete** because the GitHub repository exists. **In Progress:** S1-05 and S1-07–S1-13, plus S3-01, S3-02, S3-04, S3-07, S3-10, S3-12, and S3-13. **To Do:** S3-08 and S3-09 (deployment), which begin after the remaining non-deployment work. S2-01/02 provide a public customer landing route, the signed-in Customer/staff home experience, a `/dashboard` sample preview, and a live-menu UI with fail-closed loading/error behavior and overflow-safe cart totals. These tasks are Ready to Push, not Complete; browser/responsive acceptance, live API/MongoDB, remote CI/review/merge, and deployment remain unverified or deferred. The S2-06 inventory API/UI, S2-07 staff Orders/Kitchen views, S2-08 health-score API/UI, S2-09 tenant-scoped operational analytics, S2-10 notification API, S2-11 role-based presentation, S2-12 incident rules, S2-13 WebSocket transport, S2-14 billing, S2-15 password reset, S2-16 staff management, and S2-17/18 waitlist/table APIs have local implementation/verification records; live database, provider, browser, or recipient-policy limits remain documented. Pre-bill order subtotals are not revenue, and payment capture is out of scope. The S3 AI flow has fake-provider tests, but live Gemini credentials and MongoDB persistence are not verified. S3-03 now loads and validates the saved seeded-incident recommendation for Manager/Administrator sessions, labels Gemini/fallback/demo sources, and distinguishes API status from sample preview. At its closeout, 16 frontend tests included five recommendation contract tests. It is Ready to Push, not Complete, pending live API/browser acceptance. S3-05 now loads the tenant-scoped incident feed for Managers/Administrators, validates bounded records, distinguishes preview/live/empty/unavailable/restricted states, and shows source-trigger snapshots; records resolve automatically when the condition clears, with no manual close action. It is Ready to Push, not Complete, pending browser and live-service acceptance. S3-07 has begun bug triage: an inert sample-range control was replaced with a static preview label, an AST regression guard rejects empty click handlers, buttons without an explicit type, and form controls without an accessible name, and a Playwright pass over 7 routes at 3 viewports found and fixed a mobile dashboard overflow and six sub-24 px controls while recording an open contrast finding; unknown `/api/v1` routes now return the JSON error envelope instead of HTML. The broader bug-fix task remains In Progress. S3-06 adds locally tested menu-to-order/history integration with fake repositories and application-level reservation/AI route-mount checks; it is Ready to Push, not Complete, and does not establish live MongoDB/Gemini, browser E2E, or full acceptance. S3-10 has begun locally verifiable performance work: gzip for the public menu, `no-store` defaults for API responses with a short public cache for menu reads, field projections for notification/inventory/recommendation/incident-context/table-status reads, memoized dashboard derivations, and a 15-second deadline on every browser request; p95 targets remain unmeasured without live services. S3-12 preparation adds an 11-slide presentation outline, a demo runbook with documented fallback paths, a dependency-free readiness preflight, and a database-free seeded-fixture summary; the deck itself, a rehearsal, and a recorded backup remain outstanding. On Node `24.21.0`, backend checks pass Biome, typecheck, build, zero-vulnerability audit, and all 293 tests; frontend checks pass Biome, 38 tests, typecheck, production build, and zero-vulnerability audit. No GitHub Actions run occurred. Docker/`mongod`, live API/MongoDB credentials/services, live Gemini checks, Atlas provisioning/database validation, deployment, and remote review remain outstanding. Atlas and deployment are intentionally deferred until non-deployment work is finished. A local commit does not satisfy Complete: documented DoD, review, merge, and deployment gates still apply. Track task status in the [canonical sprint backlog](Docs/Planning/Andhrimnir_Sprint_Backlog.md). The [Implementation Decisions](Docs/Architecture/Andhrimnir_Implementation_Decisions.md) and [Database Schema](Docs/Architecture/Andhrimnir_Database_Schema.md) documents record recommendations and open module-specific decisions.

## Repository structure

```text
.
|-- .gitignore
|-- .nvmrc
|-- compose.yaml            # local-only MongoDB development service
|-- .github/
|   `-- workflows/          # pull-request CI
|-- Docs/
|   |-- Architecture/       # SDD, diagrams, API contract, fallback, decisions
|   |-- Developers Guide/   # Role-specific execution guides and deliverables
|   |-- Planning/           # Roadmap, backlog, workflow and branch strategy
|   |   `-- History/        # Historical backlog additions
|   |-- Product/            # Product vision and SRS
|   |-- Quality/            # Test plan and demo strategy
|   `-- Work Logs/          # Member work logs
|-- backend/                # Express API shell and backend guide
|-- frontend/               # Next.js App Router shell and frontend guide
|-- tools/                  # Documentation conversion utility
`-- README.md               # Project overview and documentation index
```
