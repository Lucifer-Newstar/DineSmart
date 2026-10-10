# Andhrímnir Test Plan and Acceptance Criteria

## Andhrímnir – Test Plan & Acceptance Criteria

Project: Andhrímnir – AI Incident Intelligence Platform for Restaurants
Purpose: Define the testing strategy, test scope, test cases, and acceptance criteria for the MVP based on the finalized Product Vision, SRS, SDD, Sprint Backlog, and VibeAthon requirements.

## 1. Test Objectives

- Verify all MVP functional requirements operate correctly.
- Validate authentication, customer workflows, dashboard, incident detection, AI recommendations, and notifications.
- Ensure integration between frontend, backend, database, and AI services.
- Confirm security, performance, usability, and deployment readiness.
## 2. Test Scope

| Module | Included | Priority |
| --- | --- | --- |
| Authentication | Email/OTP registration, Email/Password login, Google OAuth, JWT, RBAC | High |
| Customer Portal | Menu, Reservations, Orders | High |
| Restaurant Dashboard | Orders, Inventory, Analytics, Health Score | High |
| Incident Detection | Delays, Congestion, Shortages | High |
| AI Engine | Recommendations & summaries | High |
| Notifications | Customer & manager alerts | Medium |
| Deployment | Frontend, Backend, Database | High |

## 3. Test Types

- Unit Testing: Individual services, utilities and APIs.
- Integration Testing: Frontend, backend, MongoDB and Gemini integration.
- System Testing: Complete end-to-end workflows.
- Performance Testing: Dashboard <2s, API <500ms, Incident detection <5s, AI response <10s.
- Security Testing: Authentication, authorization, JWT, input validation.
- User Acceptance Testing: Validate business workflows against acceptance criteria.
## 4. Functional Test Cases

| ID | Feature | Test Scenario | Expected Result | Priority |
| --- | --- | --- | --- | --- |
| TC-01 | Authentication | Register with Email/OTP; log in with Email/Password | Registration is verified and login succeeds | High |
| TC-02 | Google OAuth | Login using Google | User redirected to dashboard | High |
| TC-03 | Digital Menu | View menu and availability | Available items displayed | High |
| TC-04 | Reservations | Create reservation | Reservation saved and visible | High |
| TC-05 | Orders | Place order | Order lifecycle starts | High |
| TC-06 | Kitchen | Update order status | Status reflected in dashboard | High |
| TC-07 | Inventory | Low stock condition | Alert generated | High |
| TC-08 | Incident Engine | Kitchen delay simulation | Incident created with severity | High |
| TC-09 | AI | Generate recommendation | Explainable recommendation returned | High |
| TC-10 | Health Score | Operational changes | Score recalculated | Medium |
| TC-11 | Notifications | Critical incident | Manager notified | Medium |
| TC-12 | Analytics | View reports | Charts load correctly | Medium |

## 5. Non-Functional Testing

- Dashboard loads in under 2 seconds.
- REST API average latency below 500 ms.
- Incident detection completed within 5 seconds.
- AI recommendations returned within 10 seconds.
- Responsive UI on desktop and mobile.
- Graceful handling of AI/API failures.
## 6. Acceptance Criteria

| ID | Acceptance Criterion |
| --- | --- |
| AC-01 | Users can register with Email/OTP and log in using Email/Password or Google OAuth. |
| AC-02 | Role-based access restricts features appropriately. |
| AC-03 | Customers can browse menu, reserve tables and place orders. |
| AC-04 | Restaurant staff can manage orders, reservations and inventory. |
| AC-05 | Incident Detection Engine detects delays, shortages and congestion. |
| AC-06 | AI Recommendation Engine generates contextual recommendations. |
| AC-07 | Restaurant Health Score updates based on operational metrics. |
| AC-08 | Notifications are delivered for critical incidents. |
| AC-09 | Dashboard displays analytics, incidents and operational status. |
| AC-10 | Application is deployed publicly with working frontend and backend. |
| AC-11 | All critical defects resolved before submission. |
| AC-12 | README, documentation and presentation are complete. |

## 7. Exit Criteria

- 100% Must-Have features pass.
- No Critical or High severity defects remain.
- Core user stories demonstrated successfully.
- Application deployed and accessible.
- Documentation finalized.
