# Andhrímnir

**Andhrímnir** is a proposed AI incident-intelligence platform for restaurant operations. The GitHub repository is named **DineSmart**. The platform turns signals from orders, reservations, inventory, kitchen workflows, and staff activity into incidents, contextual recommendations, and operational insights for restaurant teams.

> This repository currently contains project planning and technical documentation, plus a documentation-conversion utility. Application source code has not yet been started.

## Product vision

Most restaurant systems record transactions but do not proactively identify operational issues. Andhrímnir is designed as an intelligence layer that helps teams detect bottlenecks, shortages, delays, and congestion before they affect customers.

The documented MVP scope includes:

- Customer authentication, digital menu, reservations, and orders
- Restaurant operations dashboard, kitchen queue, and inventory monitoring
- Rule-based incident detection and explainable AI-assisted recommendations
- Restaurant health score, analytics, notifications, and role-based access

## Planned architecture

| Layer | Proposed technology |
| --- | --- |
| Frontend | Next.js App Router, React, Tailwind CSS, TypeScript |
| Backend | Node.js LTS, Express.js REST APIs, TypeScript |
| Data | MongoDB Atlas |
| Authentication | Email/OTP registration, Email/Password login, Google OAuth, JWT, RBAC |
| AI | Gemini API |
| Deployment | Vercel (frontend), Render (backend) |

## Documentation

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

## Development status

The project has a documented MVP scope, architecture, API endpoint inventory, delivery plan, and test criteria. The **S1-02 branch strategy** is documented. Frontend/backend implementation, environment setup, automated tests, and deployment configuration remain pending; track task status in the canonical sprint backlog. The [Implementation Decisions](Docs/Architecture/Andhrimnir_Implementation_Decisions.md) document records approved defaults and open module-specific decisions.

## Repository structure

```text
.
|-- Docs/
|   |-- Architecture/       # SDD, diagrams, API contract, fallback, decision drafts
|   |-- Developers Guide/   # Role-specific execution guides and deliverables
|   |-- Planning/           # Roadmap, backlog, workflow and branch strategy
|   |   `-- History/        # Historical backlog additions
|   |-- Product/            # Product vision and SRS
|   |-- Quality/            # Test plan and demo strategy
|   `-- Work Logs/          # Member work logs
|-- tools/                  # Documentation conversion utility
`-- README.md               # Project overview and documentation index
```
