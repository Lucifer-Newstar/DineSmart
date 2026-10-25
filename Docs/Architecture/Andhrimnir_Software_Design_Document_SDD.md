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
- RefreshSessions
- Restaurants
- Customers
- Staff
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

The initial native-driver fields, relationships, tenancy rules, and indexes are documented in the [S1-08 Database Schema](Andhrimnir_Database_Schema.md). Exact runtime validation and workflow constraints remain pending.

## 7. API Design

The endpoint inventory is maintained in the canonical [API Specification](Andhrimnir_API_Specification.md). This SDD remains the high-level architecture document; detailed request/response schemas, authorization rules, and workflow validation decisions are listed as pending in the [Implementation Decisions](Andhrimnir_Implementation_Decisions.md).
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
### 9.1 Audit log (S4-04)

Sensitive changes are written to the `audit_logs` collection so a manager can see who changed what, and when.

- **What is recorded.** Staff role changes, activation and deactivation; inventory threshold changes; and, since S4-05, menu item create, update, archive and availability (86) changes. The action list is `AUDIT_ACTIONS` in [`backend/src/audit/audit.types.ts`](../../backend/src/audit/audit.types.ts).
- **Entry shape.** Restaurant, actor (user ID and role), action, target (type, ID and a readable label), `before` and `after` values, and `createdAt`. Entries are written by [`audit.service.ts`](../../backend/src/audit/audit.service.ts) from the service that made the change, after the change succeeds.
- **Append only.** The API has no route that edits or deletes an entry.
- **Reading.** `GET /api/v1/audit-logs` ([`audit.router.ts`](../../backend/src/audit/audit.router.ts)) needs the `audit:read` permission, which only Managers and Administrators hold, and returns only the caller's restaurant. It pages newest first with keyset pagination (`limit` 1–200, default 50; `before` is the last entry's ID) and can filter by `action`.
- **Indexes.** `audit_logs_restaurant_created` and `audit_logs_restaurant_action_created` in [`backend/src/database/schema.ts`](../../backend/src/database/schema.ts) serve the newest-first and per-action reads.

### 9.2 Session controls (S4-04)

Each sign-in creates a refresh session; the access token is short-lived and the refresh token sits in an HTTP-only cookie.

- **Signed-in devices.** `GET /api/v1/auth/sessions` lists the caller's active sessions with a device label, created, last-used and expiry times, and marks the current device. `DELETE /api/v1/auth/sessions/{id}` signs one device out, and `DELETE /api/v1/auth/sessions` signs out every device except this one. All three need a valid access token. The routes are in [`backend/src/auth/auth.router.ts`](../../backend/src/auth/auth.router.ts); the device label comes from the browser's user agent in [`device-label.ts`](../../backend/src/auth/device-label.ts). Users manage this from the "Signed-in devices" section in Settings ([`settings-page.tsx`](../../frontend/src/app/_dashboard/settings-page.tsx)).
- **Login lockout.** Five failed passwords in a row lock the account for 15 minutes (`LOGIN_LOCKOUT_THRESHOLD`, `LOGIN_LOCKOUT_MS` in [`auth.service.ts`](../../backend/src/auth/auth.service.ts)). A successful sign-in resets the count.
- **Origin check.** Refresh and logout use the cookie, so they reject requests whose `Origin` is not the web app's own origin.
- **Expiry.** Expired refresh sessions are removed by the `refresh_sessions_expiry_ttl` TTL index.

### 9.3 Other S4-04 hardening

- Security headers from the API, and a Content Security Policy plus security headers on the frontend.
- Malformed MongoDB IDs in route parameters are refused with a `400` by one shared middleware ([`backend/src/http/object-id-param.ts`](../../backend/src/http/object-id-param.ts)). It runs after authentication, so it never hides a `401` or `403`.
- CI runs a secret scan (gitleaks, checksum-verified) on pull requests and on pushes to `main`.
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
