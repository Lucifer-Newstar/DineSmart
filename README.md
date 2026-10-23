# Andhrímnir

**Andhrímnir** is a proposed AI incident-intelligence platform for restaurant operations. The GitHub repository is named **DineSmart**. The platform turns signals from orders, reservations, inventory, kitchen workflows, and staff activity into incidents, contextual recommendations, and operational insights for restaurant teams.

> This repository contains product and technical documentation, the Next.js frontend, the Express backend, and helper tools. Implemented and locally tested modules include authentication (email + code sign-up, password and Google login, token renewal, password reset), public menu and customer orders, reservations, kitchen and order workflow, inventory, health score, incidents, analytics, live notifications, billing, staff management, floor/waitlist and tables, and advisory AI recommendations. Tests use local fakes; live MongoDB Atlas, the email provider, Google sign-in and Gemini have **not been verified live**, and the app is **not deployed yet** (see the [deployment checklist](Docs/Developers%20Guide/Deployment.md)).

## Product vision

Most restaurant systems record transactions but do not proactively identify operational issues. Andhrímnir is designed as an intelligence layer that helps teams detect bottlenecks, shortages, delays, and congestion before they affect customers.

The documented MVP scope includes:

- Customer authentication, digital menu, reservations, and orders
- Restaurant operations dashboard, kitchen queue, and inventory monitoring
- Rule-based incident detection and explainable AI-assisted recommendations
- Restaurant health score, analytics, notifications, and role-based access

## Architecture

| Layer | Technology |
| --- | --- |
| Frontend | Next.js `16.4.2` App Router, React `19.3.0`, Tailwind CSS `4.3.3`, TypeScript, Biome `2.5.15` |
| Backend | Node.js `24.21.0` LTS, Express `5.3.0`, TypeScript |
| Data | MongoDB (local via Docker Compose for development; MongoDB Atlas for production, not yet provisioned), official MongoDB Node driver |
| Authentication | Email/OTP registration, Email/Password login, Google OAuth, JWT, RBAC |
| AI | Gemini API |
| Email | SMTP (nodemailer) or Resend, selected by `EMAIL_PROVIDER`; a mock transport for development and tests |
| Deployment | Vercel (frontend), Render (backend), not deployed yet |

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

The [GitHub Actions CI workflow](.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch. It declares `contents: read` permissions and a concurrency group that cancels superseded runs, then checks the frontend, the backend, and the demo preflight as separate jobs with their own timeouts, pinned actions, `persist-credentials: false`, the Node version from `.nvmrc`, `npm ci` installation, high-severity dependency audits, and the full lint/test/typecheck/build sequence. `tools/ci-workflow.test.mjs` guards those invariants locally. Local runs of the same checks on Node `24.21.0`: backend 328 tests, frontend 50 tests, Biome, typechecks and production builds pass, and `npm audit --audit-level=high` reports no high or critical advisories in either package. Deployment (CD) is not configured; see the [deployment checklist](Docs/Developers%20Guide/Deployment.md).

## Documentation

### Application setup

- [Frontend setup guide](frontend/README.md)
- [Backend setup guide](backend/README.md)
- [Deployment inputs checklist](Docs/Developers%20Guide/Deployment.md)

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

The MVP scope, architecture, API inventory, delivery plan, and acceptance criteria are documented, and the code for the MVP features is on `main`. The canonical task statuses are in the [sprint backlog](Docs/Planning/Andhrimnir_Sprint_Backlog.md).

**Done in code and covered by local tests:** authentication and RBAC (S1-09–S1-12), the customer landing, menu, cart and order history (S2-01–S2-04), kitchen/order workflow (S2-05), inventory (S2-06), staff dashboard views (S2-07), health score (S2-08), analytics (S2-09), notifications with automatic incident alerts and the live bell (S2-10, S2-13), role-based presentation (S2-11), incident rules (S2-12), bills (S2-14), forgot password (S2-15), staff roster and the bootstrap command (S2-16), floor view, waitlist and tables (S2-17, S2-18), and the AI recommendation flow with a deterministic fallback (S3-01–S3-05, S3-13).

**Not verified live:** every test uses fakes. Nothing has run against MongoDB Atlas, a real email provider, Google sign-in, or a Gemini key, and there is no browser end-to-end suite. Rate-limit behaviour behind Vercel → Render depends on `TRUST_PROXY` and needs a check after deploying.

**Still to do:** Atlas provisioning (S1-05), deployment of the frontend and backend (S3-08, S3-09), live acceptance and the demo rehearsal (S3-12), and p95 performance measurement (S3-10), which needs live services. The [deployment checklist](Docs/Developers%20Guide/Deployment.md) lists every input needed.

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
