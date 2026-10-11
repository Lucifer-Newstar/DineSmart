# Andhrímnir

**Andhrímnir** is a proposed AI incident-intelligence platform for restaurant operations. The GitHub repository is named **DineSmart**. The platform turns signals from orders, reservations, inventory, kitchen workflows, and staff activity into incidents, contextual recommendations, and operational insights for restaurant teams.

> This repository contains product and technical documentation, a documentation-conversion utility, and Next.js and Express applications. The backend includes native-driver MongoDB schema/index setup, Email/OTP and OAuth authentication, tenant-scoped inventory and health-score APIs, and advisory AI recommendations. These features have local automated checks; live MongoDB, email/Google/Gemini credentials, the remaining restaurant workflows, and deployment are not verified or configured here.

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

Open `http://localhost:3000`. The `/` route is a responsive restaurant workspace; inventory and health-score reads use the backend API when a signed-in role and backend are available. Other operational workflows and customer menu/cart and booking actions remain clearly labeled previews. The optional `frontend/.env.example` contains only a local API URL placeholder; never put secrets in `NEXT_PUBLIC_` variables. See the [frontend guide](frontend/README.md) for role-specific behavior and quality commands.

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

The [GitHub Actions CI workflow](.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch. It installs from each app's lockfile, audits dependencies, checks Biome and TypeScript, runs configured tests, and builds both apps. The integrated local tree passed the same checks on Node `24.21.0`: backend tests passed (45), both audits reported zero vulnerabilities, and both builds passed; the frontend has no configured test script. This was a local CI-equivalent run, not a GitHub Actions result. No remote is configured and nothing was pushed. Deployment/CD is not configured.

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

The MVP scope, architecture, API inventory, delivery plan, and acceptance criteria are documented. Former local feature branches were integrated into `main` at `70f5fb4`; all other local branch references were deleted at the owner's direction. No remote is configured and nothing was pushed. S1-02/S1-03/S1-04/S1-06, S2-03/S2-04/S2-05/S2-06/S2-07/S2-09/S2-10, and S3-11 are **Ready to Push** on local `main`; S1-01 is marked **Complete** because the GitHub repository exists. S1-05, S1-07, S1-08, S1-09/10/11, S1-12, S1-13, S2-01/02/08/11, and S3-03/05 remain **In Progress** pending their documented local database, provider, credential, workflow, or remote-CI checks. The S2-06 inventory API/UI, S2-07 staff Orders/Kitchen views, and S2-08 health-score API/UI with its event/hourly refresh cadence are locally verified; live MongoDB/index checks are deferred to the final database/deployment phase. S2-09 adds protected tenant-scoped operational analytics charts for orders, preparation, reservations, and current stock; pre-bill order subtotals are not represented as revenue, and live MongoDB/Atlas plus browser E2E remain unverified. S3-01/02/04/13 provide bounded, PII-minimized Gemini recommendations with structured-output validation and deterministic fallback; fake-provider tests pass, but live Gemini credentials and MongoDB persistence are not verified. The responsive workspace, role-filtered navigation, auth forms, customer menu/cart/order history, reservation flows, inventory, analytics charts, and staff order/kitchen workflows are integrated; incident lifecycle remains separate in-progress/to-do work. On Node `24.21.0`, backend Biome, typecheck, build, zero-vulnerability audit, and all 131 tests pass; frontend Biome, typecheck, Next production build, and zero-vulnerability audit pass. No GitHub Actions run occurred. Docker/`mongod`, provider credentials, live Gemini checks, Atlas provisioning/live database validation, deployment, and remote review remain outstanding; deployment and Atlas work are intentionally deferred until non-deployment tasks finish. Track task status in the [canonical sprint backlog](Docs/Planning/Andhrimnir_Sprint_Backlog.md). The [Implementation Decisions](Docs/Architecture/Andhrimnir_Implementation_Decisions.md) and [Database Schema](Docs/Architecture/Andhrimnir_Database_Schema.md) documents record recommendations and open module-specific decisions.

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
