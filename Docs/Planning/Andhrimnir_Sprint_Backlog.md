# Andhrímnir Sprint Backlog

Sprint Backlog

Project: Andhrímnir – AI Incident Intelligence Platform for Restaurants

## Sprint Information

| Sprint | Duration | Goal |
| --- | --- | --- |
| Sprint 1 | Day 1 | Foundation, Authentication & Core Backend |
| Sprint 2 | Day 2 | Customer Portal, Dashboard & Incident Detection |
| Sprint 3 | Day 3 | AI Integration, Testing, Deployment & Presentation |

## Sprint Goal

Deliver a functional MVP with Authentication, Customer Portal, Restaurant Dashboard, Inventory Monitoring, Incident Detection, AI Recommendations, Restaurant Health Score, Analytics, Notifications, and Deployment.

## Product Backlog Items

| ID | Feature | Priority |
| --- | --- | --- |
| PB-01 | Authentication System | Must Have |
| PB-02 | Customer Portal | Must Have |
| PB-03 | Reservation System | Must Have |
| PB-04 | Order Management | Must Have |
| PB-05 | Kitchen Dashboard | Must Have |
| PB-06 | Inventory Monitoring | Must Have |
| PB-07 | Incident Detection Engine | Must Have |
| PB-08 | AI Recommendation Engine | Must Have |
| PB-09 | Restaurant Health Score | Must Have |
| PB-10 | Analytics Dashboard | Should Have |
| PB-11 | Notifications | Should Have |
| PB-12 | Deployment & Documentation | Must Have |

## Sprint 1 – Foundation & Core Infrastructure

Goal: Establish backend foundation and project setup.

| Task ID | Task | Owner | Priority | Story Points | Status |
| --- | --- | --- | --- | --- | --- |
| S1-01 | Create GitHub Repository | Navin | High | 1 | Complete |
| S1-02 | Branch Strategy | Navin | High | 1 | Ready to Push |
| S1-03 | Setup Next.js | Dhanush | High | 2 | Ready to Push |
| S1-04 | Setup Express Backend | Jegatheesan | High | 2 | Ready to Push |
| S1-05 | Configure MongoDB Atlas | Jegatheesan | High | 2 | In Progress |
| S1-06 | Environment Variables | Gokul | High | 1 | Ready to Push |
| S1-07 | CI/CD Pipeline | Navin & Gokul | Medium | 2 | In Progress |
| S1-08 | Database Schema | Jegatheesan | High | 3 | In Progress |
| S1-09 | JWT Authentication | Dhanush | High | 3 | Ready to Push |
| S1-10 | Google OAuth | Dhanush | Medium | 2 | Ready to Push |
| S1-11 | Email OTP | Dhanush | Medium | 2 | Ready to Push |
| S1-12 | RBAC | Navin | High | 2 | Ready to Push |
| S1-13 | Create Seed Data | Jegatheesan | Medium | 2 | Ready to Push |

## Sprint 2 – Restaurant Operations

Goal: Complete customer workflows and dashboard.

| Task ID | Task | Owner | Priority | Story Points | Status |
| --- | --- | --- | --- | --- | --- |
| S2-01 | Customer Landing Page | Dhanush | Medium | 2 | Ready to Push |
| S2-02 | Digital Menu | Dhanush | High | 3 | Ready to Push |
| S2-03 | Reservation Module | Jegatheesan | High | 3 | Ready to Push |
| S2-04 | Order Placement | Dhanush | High | 5 | Ready to Push |
| S2-05 | Kitchen Queue | Jegatheesan | High | 3 | Ready to Push |
| S2-06 | Inventory Module | Jegatheesan | High | 3 | Ready to Push |
| S2-07 | Dashboard UI | Dhanush | High | 5 | Ready to Push |
| S2-08 | Restaurant Health Score | Navin | High | 3 | Ready to Push |
| S2-09 | Analytics Charts | Jegatheesan | Medium | 3 | Ready to Push |
| S2-10 | Notification Module | Gokul | Medium | 2 | Ready to Push |
| S2-11 | Role-based Dashboards | Navin | Medium | 2 | Ready to Push |
| S2-12 | Incident Detection Rules | Navin | High | 12 | Ready to Push |
| S2-13 | WebSocket Implementation | Navin | High | 3 | Ready to Push |
| S2-14 | Billing APIs | Jegatheesan | High | 3 | Ready to Push |
| S2-15 | Password Reset API | Dhanush | High | 2 | Ready to Push |
| S2-16 | Staff Management APIs | Jegatheesan | Medium | 3 | Ready to Push |
| S2-17 | Waitlist Management APIs | Jegatheesan | Medium | 2 | Ready to Push |
| S2-18 | Table Status APIs | Jegatheesan | Medium | 2 | Ready to Push |

## Sprint 3 – AI Integration & Release

Goal: Complete AI features, testing, deployment and presentation.

| Task ID | Task | Owner | Priority | Story Points | Status |
| --- | --- | --- | --- | --- | --- |
| S3-01 | Gemini API Integration | Navin | High | 5 | Ready to Push |
| S3-02 | Prompt Engineering | Navin | High | 3 | Ready to Push |
| S3-03 | Recommendation UI | Dhanush | High | 3 | Ready to Push |
| S3-04 | Incident Context Builder | Navin | High | 4 | Ready to Push |
| S3-05 | Dashboard Polish | Dhanush | Medium | 2 | Ready to Push |
| S3-06 | Integration Testing | Entire Team | High | 5 | Ready to Push |
| S3-07 | Bug Fixing | Entire Team | High | 5 | In Progress |
| S3-08 | Frontend Deployment | Gokul | High | 2 | To Do |
| S3-09 | Backend Deployment | Gokul | High | 2 | To Do |
| S3-10 | Performance Optimization | Navin | Medium | 2 | In Progress |
| S3-11 | README | Navin | Medium | 2 | Ready to Push |
| S3-12 | Presentation & Demo | Entire Team | High | 3 | In Progress |
| S3-13 | AI Fallback Implementation | Navin | Medium | 2 | Ready to Push |

## Status Meanings

| Status | Meaning |
| --- | --- |
| To Do | Not started |
| In Progress | Work started; not yet ready for review/push |
| Ready to Push | Code is committed on `main` and passes the local checks; live verification and the deployment step in the Definition of Done are still open |
| In Review | Pull request is open and awaiting review |
| Complete | Definition of Done is met and the pull request is merged |
| Blocked | Work cannot proceed until a documented dependency or decision is resolved |

## Definition of Done

- Feature implemented and integrated.
- Code pushed to GitHub.
- Code reviewed.
- API and UI tested.
- Responsive interface verified.
- Documentation updated.
- Acceptance testing passed.
- Successfully deployed.
## Story Point Summary

| Sprint | Story Points |
| --- | --- |
| Sprint 1 | 25 |
| Sprint 2 | 49 |
| Sprint 3 | 41 |
| Total | 115 |


## Consolidation Note

- On 2026-10-10, the additions from `History/Andhrimnir_Backlog_Additions_History.md` were merged into this canonical backlog.
- Current task statuses are maintained in this file; the history file is a snapshot of the original additions.
- On 2026-10-23, the code for S1-09–S1-13 and the AI tasks (S3-01, S3-02, S3-04, S3-13) was finished (email providers, token renewal, the sign-up takeover fix, the remote seed guard, the bootstrap command and incident alerts), so they moved to Ready to Push. No task except S1-01 is Complete, because the Definition of Done needs live verification and deployment. S1-05 (Atlas), S1-07 (the first green GitHub Actions run and CD), S1-08 (live index check), S3-07, S3-10 (p95 measurement) and S3-12 (rehearsal) stay In Progress, and S3-08/S3-09 (deployment) are To Do. The inputs needed for deployment are listed in the [deployment checklist](../Developers%20Guide/Deployment.md).
