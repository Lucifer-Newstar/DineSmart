# Andhrímnir

**Andhrímnir** is a proposed AI incident-intelligence platform for restaurant operations. The GitHub repository is named **DineSmart**. The platform turns signals from orders, reservations, inventory, kitchen workflows, and staff activity into incidents, contextual recommendations, and operational insights for restaurant teams.

> This repository contains the product and technical documentation, a documentation-conversion utility, and Next.js and Express applications. The backend now has a native-driver MongoDB schema baseline and local implementations of Email/OTP registration, email/password and Google login, and rotating JWT sessions. Restaurant workflows, production email/AI provider credentials, live database verification, and deployment remain outstanding.

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

Open `http://localhost:3000`. The `/` route is a neutral application shell only; it does not yet implement customer or restaurant workflows. The optional `frontend/.env.example` contains only a local API URL placeholder; never put secrets in `NEXT_PUBLIC_` variables. See the [frontend guide](frontend/README.md) for quality commands.

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

The [GitHub Actions CI workflow](.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch. It installs from each app's lockfile, audits dependencies, checks Biome and TypeScript, runs configured tests, and builds the app. Backend coverage includes liveness, MongoDB configuration/schema, and fake-repository auth unit/HTTP flows; frontend product tests remain pending. This adds CI only—deployment/CD is not configured.

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

The MVP scope, architecture, API endpoint inventory, delivery plan, and acceptance criteria are documented. S1-03/S1-04/S1-06 and S3-11 have local commits marked **Ready to Push** on task branches. S1-05 local-first MongoDB, S1-07 CI/deployment confirmation, S1-08 schema/live-index validation, S1-09 JWT/live persistence, S1-10 Google/live credentials, and S1-11 OTP/real email-provider/live persistence remain **In Progress**. S1-11 is implemented and tested with fake repositories on `feature/S1-11-email-otp`, stacked on S1-10; Docker/`mongod`, a real email provider, and live Google credentials are not configured in this workspace. No remote push or merge has been made. The backend currently exposes health and auth endpoints; RBAC, password reset, restaurant operations, AI integration, production provider setup, and deployment remain outstanding. Track task status in the [canonical sprint backlog](Docs/Planning/Andhrimnir_Sprint_Backlog.md). The [Implementation Decisions](Docs/Architecture/Andhrimnir_Implementation_Decisions.md) and [Database Schema](Docs/Architecture/Andhrimnir_Database_Schema.md) documents record recommendations and open module-specific decisions.

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
