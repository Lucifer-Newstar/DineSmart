# Andhrímnir Software Design Document SDD

## Software Design Document (SDD)
Andhrímnir – AI Incident Intelligence Platform for Restaurants

Purpose
This Software Design Document defines the technical design of the Andhrímnir platform based on the finalized Product Vision, SRS, architecture diagrams, project planning, and hackathon requirements. It translates requirements into an implementable software architecture.

## 1. Design Goals

- Modular, scalable SaaS architecture.
- Real-time incident detection.
- AI-assisted decision support.
- Role-based secure access.
- Cloud-native deployment.
- Responsive web application.
## 2. System Architecture

- Frontend: Next.js + React + Tailwind CSS
- Backend: Node.js + Express.js REST APIs
- Database: MongoDB Atlas
- Authentication: Email/OTP registration and verification, Email/Password and Google OAuth login, JWT, RBAC
- AI Layer: Gemini API
- Deployment: Vercel (Frontend), Render (Backend)
## 3. High-Level Modules

- Authentication Service
- Customer Portal
- Restaurant Dashboard
- Reservation Service
- Order Service
- Kitchen Management
- Inventory Service
- Incident Detection Engine
- AI Recommendation Engine
- Analytics & Health Score
- Notification Service
## 4. Layered Architecture

- Presentation Layer – UI
- API Layer – Express REST APIs
- Business Layer – Services & Incident Rules
- AI Layer – Context Builder + Gemini
- Data Layer – MongoDB Atlas
## 5. Core Components

- Auth Service: login, OTP, OAuth, JWT.
- Order Service: order lifecycle and billing.
- Reservation Service: bookings, waitlist, table allocation.
- Kitchen Service: queue and preparation status.
- Inventory Service: stock monitoring and alerts.
- Incident Engine: detects delays, congestion, shortages, conflicts.
- AI Engine: explainable recommendations.
- Dashboard: analytics, health score and monitoring.
## 6. Database Collections

- Users
- Restaurants
- Customers
- MenuItems
- Orders
- OrderItems
- Reservations
- Tables
- InventoryItems
- Incidents
- Recommendations
- Notifications
- Bills
## 7. API Design

The endpoint inventory is maintained in the canonical [API Specification](Andhrimnir_API_Specification.md). This SDD remains the high-level architecture document; detailed request/response schemas and authorization rules are listed as pending decisions in the [Implementation Decisions](Andhrimnir_Implementation_Decisions.md).
## 8. Incident Detection Workflow

- Collect operational events.
- Evaluate business rules.
- Create incident.
- Build operational context.
- Request AI recommendation.
- Store recommendation.
- Notify manager.
- Display on dashboard.
## 9. Security Design

- HTTPS everywhere
- JWT authentication
- Role-Based Access Control
- Password hashing
- OTP verification
- Input validation
- Audit logging
## 10. Performance Design

- Dashboard <2 s
- API latency <500 ms
- Incident detection <5 s
- AI recommendation <10 s
- Real-time updates using WebSockets
## 11. Deployment

- Frontend: Vercel
- Backend: Render
- Database: MongoDB Atlas
- GitHub Actions CI/CD
- Environment secrets
- Monitoring & logs
## 12. Design Principles

- Single Responsibility
- Separation of Concerns
- Stateless APIs
- Reusable components
- AI as advisory layer
- MVP-first architecture
## 13. Future Enhancements

- POS integrations
- IoT sensors
- Predictive ML
- Multi-branch support
- Supplier integration
- Voice AI assistant
## Traceability

This design is derived from the Product Vision, Software Requirements Specification, Architecture Diagrams, Project Planning Document, Development Workflow, Team Roles, and the VibeAthon problem statement.
