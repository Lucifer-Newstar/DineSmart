# Andhrimnir

**Andhrimnir** is a proposed AI incident-intelligence platform for restaurant operations. It turns signals from orders, reservations, inventory, kitchen workflows, and staff activity into incidents, contextual recommendations, and operational insights for restaurant teams.

> This repository currently contains the project’s planning and technical documentation. The implementation is described in the specifications linked below.

## Product vision

Most restaurant systems record transactions but do not proactively identify operational issues. Andhrimnir is designed as an intelligence layer that helps teams detect bottlenecks, shortages, delays, and congestion before they affect customers.

The planned MVP includes:

- Customer authentication, digital menu, reservations, and orders
- Restaurant operations dashboard, kitchen queue, and inventory monitoring
- Rule-based incident detection and explainable AI-assisted recommendations
- Restaurant health score, analytics, notifications, and role-based access

## Planned architecture

| Layer | Proposed technology |
| --- | --- |
| Frontend | Next.js, React, Tailwind CSS |
| Backend | Node.js, Express.js REST APIs |
| Data | MongoDB Atlas |
| Authentication | Email/OTP, Google OAuth, JWT, RBAC |
| AI | Gemini API |
| Deployment | Vercel (frontend), Render (backend) |

## Documentation

### Product and technical design

- [Product vision](Docs/Andhrimnir_Product_Vision_Document.md)
- [Software requirements specification](Docs/Andhrimnir_Software_Requirement_Analysis_SRS.md)
- [Software design document](Docs/Andhrimnir_Software_Design_Document_SDD.md)
- [Architecture and design diagrams](Docs/Andhrimnir_Complete_Diagrams_Document.md)
- [API specification](Docs/Andhrimnir_Updated_API_Specification.md)
- [Database fallback strategy](Docs/Andhrimnir_Database_Fallback_Strategy.md)

### Delivery and quality

- [Project planning document](Docs/Andhrimnir_Project_Planning_Document.md)
- [Development workflow](Docs/Development-Workflow.md)
- [Branch strategy](Docs/Branch-Strategy.md)
- [Sprint backlog](Docs/Andhrimnir_Sprint_Backlog.md) and [updates](Docs/Andhrimnir_Updated_Sprint_Backlog.md)
- [Navin Jairam work log](Docs/Work%20Logs/Navin_Jairam.md)
- [Integrated phase-completion roadmap](Docs/Developers%20Guide/Andhrimnir_Integrated_Phase_Completion_Roadmap.md)
- [Test plan and acceptance criteria](Docs/Andhrimnir_Test_Plan_and_Acceptance_Criteria.md)
- [Demo strategy and mock-data structure](Docs/Andhrimnir_Demo_Strategy_and_Mock_Data_Structure.md)

### Team guides

- [Navin Jairam](Docs/Developers%20Guide/Andhrimnir_Team_Execution_Guide_Navin_Jairam.md)
- [Dhanush](Docs/Developers%20Guide/Andhrimnir_Team_Execution_Guide_Dhanush.md)
- [Jegatheesan](Docs/Developers%20Guide/Andhrimnir_Team_Execution_Guide_Jegatheesan.md)
- [Gokul](Docs/Developers%20Guide/Andhrimnir_Team_Execution_Guide_Gokul.md)

## Development status

The project has a documented MVP scope, architecture, API contract, delivery plan, and test criteria. Application source code, environment setup instructions, and deployment commands will be added when implementation begins.

## Repository structure

```text
.
|-- Docs/                 # Product, engineering, planning, and quality documentation
|-- Docs/Developers Guide/ # Role-specific execution guides and deliverables
|-- tools/                # Documentation conversion utility
`-- README.md             # Project overview and documentation entry point
```
