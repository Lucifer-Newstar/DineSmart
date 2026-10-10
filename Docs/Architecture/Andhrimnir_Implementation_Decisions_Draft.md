# Andhrímnir Implementation Decisions — Draft for Review

> **Status: PROPOSAL ONLY — NOT APPROVED FOR IMPLEMENTATION.** This document turns the high-level requirements into reviewable defaults. Do not treat a proposal below as an accepted requirement until the product owner confirms it. Unresolved choices remain explicit; code must not rely on them yet.

This draft supports the SRS, SDD, canonical API specification, sprint backlog, test plan, and database-fallback strategy. Its purpose is to let the owner approve or amend concrete decisions before application work begins.

## 1. Product identity and scope

| Topic | Proposed default | Review status |
| --- | --- | --- |
| Product name | **Andhrímnir**; **DineSmart** remains the repository name. | Proposed |
| MVP boundary | Use the SRS Must-Have scope as the baseline. Deliver the core customer and restaurant workflows, authentication, dashboard, inventory, rule-based incidents, AI recommendations, health score, notifications, and analytics. | Proposed |
| Backlog additions | Keep seed data, staff, waitlist, table-status, billing, WebSockets, and AI fallback in the canonical backlog. Confirm which additions are release-blocking before implementation. | Needs priority confirmation |
| Payments | Generate/view bills only. Do not process payments until a payment provider and payment lifecycle are specified. | Proposed |
| Deferred items | Multi-branch, POS/IoT integrations, predictive ML, supplier management, voice AI, and durable emergency-offline writes remain deferred unless explicitly re-scoped. | Proposed |
| Timeline/capacity | The planning docs schedule three one-day sprints, while the consolidated backlog totals 115 story points. Re-estimate or prioritize the Must-Have stories against the actual team capacity before treating that timeline as a commitment. | Owner confirmation needed |
| Backlog status | Distinguish locally implemented work from reviewed/merged work; do not call a task fully complete until its definition of done is met. | Status vocabulary needed |

**Status discrepancy to review:** S1-01 is still `To Do` although the remote repository exists. S1-02 is marked `Complete` on the local branch, while the global Definition of Done also mentions push and review. Confirm whether to update S1-01 and how local-only delivery should be represented in backlog status.

## 2. Roles and access control

### 2.1 Proposed MVP role set

Use the five roles named in the SRS as the canonical MVP set: **Customer, Reception, Kitchen Staff, Manager, Administrator**. Treat Restaurant Owner as Manager for the MVP. Do not create separate Waiter or Inventory Manager roles until the owner confirms distinct permissions; their duties can initially be represented by scoped Manager/Reception/Kitchen Staff permissions.

### 2.2 Proposed least-privilege matrix

| Capability | Customer | Reception | Kitchen Staff | Manager | Administrator |
| --- | --- | --- | --- | --- | --- |
| Browse menu and availability | Read | Read | Read | Read/write | Read/write |
| Create/view own orders and reservations | Own records | Read/create/update for restaurant | Read relevant orders | Read/write | Read/write |
| Manage waitlist and table assignment | — | Read/write | — | Read/write | Read/write |
| Update kitchen preparation status | — | — | Read/write queue | Read/write | Read/write |
| View/update inventory | — | Read | Read availability | Read/write | Read/write |
| View analytics, health score, incidents, recommendations | Own order status only | Operational subset | Kitchen subset | Full restaurant view | Full authorized view |
| Resolve incidents and configure thresholds | — | — | — | Read/write | Read/write |
| Manage staff and restaurant configuration | — | — | — | Read/write (same restaurant) | Read/write (authorized scope) |

**Approval required:** confirm whether Administrator is restaurant-scoped or platform-wide, and whether Reception may update inventory, staff, or thresholds. The matrix is not final.

## 3. Authentication and security

| Topic | Proposed default | Review status |
| --- | --- | --- |
| Registration | Email OTP verification, as stated in the SRS. | Proposed |
| Login | Email/password plus Google OAuth; reconcile the test-plan reference to Email/OTP login. | Proposed |
| Password reset/logout | Include both, as stated in the SRS and updated backlog. Logout revokes/invalidates the refresh session. | Proposed |
| OTP | 6 digits, 10-minute expiry, 60-second resend cooldown, and at most 5 verification attempts per OTP. | Requires approval |
| Password storage | Argon2id password hashing; never log or return credentials. | Requires approval |
| JWT | Short-lived access token (proposed 15 minutes) plus rotating refresh session (proposed 7 days). Token storage/transport must be approved before implementation. | Requires approval |
| Abuse protection | Rate-limit login, OTP request/verify, password reset, and OAuth callbacks; log security-relevant events without secrets. | Proposed |
| Secrets | Use environment variables and local secret storage. Commit only `.env.example` placeholders; never commit secret values. | Proposed |

The current API inventory does not include explicit OTP request/verification endpoints. Proposed additions for review: `POST /auth/otp/request` and `POST /auth/otp/verify`.

## 4. Tenant model, data conventions, and API contract

### 4.1 Proposed conventions

- Use restaurant-scoped records with a `restaurantId` on operational data. Customers may have no staff-role membership but each order/reservation must be associated with a restaurant.
- Use MongoDB/Mongoose IDs and UTC ISO-8601 timestamps (`createdAt`, `updatedAt`); present dates in the restaurant's configured timezone.
- Use a versioned API prefix (`/api/v1`) and JSON responses. Proposed success envelope: `{ "data": ... }`; proposed error envelope: `{ "error": { "code": "...", "message": "..." } }`.
- List endpoints should support bounded pagination and documented filters. Exact pagination style and response shapes need approval.

### 4.2 Proposed minimum entity fields

These are a schema starting point, not a final database design.

| Entity | Proposed fields to review |
| --- | --- |
| User | `name`, `email`, `role`, `restaurantId` (nullable for customers), `status`, auth-provider reference, timestamps |
| Restaurant | `name`, contact/address, timezone, currency, operating hours, configurable thresholds, status |
| MenuItem | `restaurantId`, category, name/description, price, availability, optional dietary/allergen labels |
| Customer | `userId` or guest contact, display name, contact preferences |
| Reservation | `restaurantId`, customer, party size, start/end time, table, status, notes, timestamps |
| Table | `restaurantId`, label/number, capacity, zone, status, current reservation/order references |
| Order | `restaurantId`, customer, table/reservation, item snapshots, total, lifecycle status, status timestamps |
| OrderItem | menu-item reference and name/price snapshot, quantity, notes, preparation status |
| InventoryItem | `restaurantId`, name, quantity, unit, low-stock threshold, last-adjusted timestamp |
| Staff | user reference, restaurant, role, active status; shift/schedule fields only if staff-shortage detection is approved |
| Incident | `restaurantId`, type, severity, trigger snapshot, affected entity, root cause, status, timestamps |
| Recommendation | incident reference, summary, actions, rationale, expected impact, confidence, provider, timestamp |
| Notification | recipient, restaurant, type, title/body, related entity, read/delivery timestamps |
| Bill | order reference, line-item snapshots, subtotal, tax/adjustments, total, status; payment fields only if payments are approved |

### 4.3 API inventory gaps

The canonical API table remains the endpoint inventory. Before coding, confirm whether to add detail/cancel/create operations that are currently absent, including OTP verification, reservation cancellation/table assignment, order detail/cancel, table listing, inventory creation, staff creation/deactivation, and notification read state. The API spec needs request/response schemas, validation, authorization, pagination, and error behavior.

## 5. Restaurant workflow rules

| Workflow | Proposed default | Open decision |
| --- | --- | --- |
| Reservation conflict | Reject an allocation when the same table has an overlapping active reservation or the table capacity is insufficient. | Slot length, opening hours, grace periods, cancellation/no-show policy |
| Waitlist | FIFO order; reception confirms/promotes a guest rather than auto-assigning a table. | Priority rules, expiry, notification behavior |
| Order lifecycle | Keep the documented states: `Created → Accepted → Preparing → Ready → Served → Completed`. | Who may perform each transition; cancellation/refund rules |
| Inventory deduction | Do not automatically consume inventory until menu-item ingredient/recipe mapping is specified. Record explicit stock adjustments first. | Whether recipes and order-driven deduction are MVP |
| Kitchen queue | Order by accepted/created time unless a documented priority rule is approved. | Station model and priority/expedite behavior |
| Billing | Generate and retrieve a bill; no money movement in the MVP proposal. | Currency, tax, service charge, discounts, tips, rounding |
| Staff shortage | Defer automated staff-shortage detection until staffing schedules/minimum staffing are modeled. | Whether staff scheduling is in scope |

## 6. Incident rules and lifecycle

### 6.1 Proposed thresholds for owner review

The values below are examples to make the missing rules concrete. They are not active settings. All thresholds should be configurable per restaurant if approved.

| Incident type | Proposed warning trigger | Proposed critical trigger | Notes |
| --- | --- | --- | --- |
| Kitchen delay | An item has been preparing for more than 15 minutes. | More than 25 minutes. | Uses the SRS 15-minute target as a starting point. |
| Order delay | Accepted-to-ready time exceeds 20 minutes. | Exceeds 30 minutes. | Uses the documented 20-minute baseline as a starting point. |
| Kitchen congestion | 8 or more active kitchen orders. | 12 or more active orders, or the oldest exceeds 30 minutes. | Queue/station capacity is not specified. |
| Inventory shortage | Available quantity is at/below the item threshold. | Quantity is zero or negative. | Uses the existing threshold field. |
| Reservation conflict | Table/time overlap or party exceeds capacity. | A confirmed reservation cannot be seated. | The validation should prevent the conflict where possible. |
| Queue congestion | 6 or more waiting parties or estimated wait exceeds 30 minutes. | Estimated wait exceeds 45 minutes. | Estimate method needs approval. |
| Staff shortage | No automatic trigger proposed. | No automatic trigger proposed. | Requires a staffing plan/schedule model. |
| Table congestion | Utilization is at least 85% while a waitlist exists for 15 minutes. | Utilization is at least 95% and wait exceeds 30 minutes. | Utilization definition/window needs approval. |

### 6.2 Proposed lifecycle

- Severity values: `info`, `warning`, `critical`.
- Status values: `open`, `acknowledged`, `resolved`.
- Avoid duplicate active incidents for the same restaurant, type, and source entity; retain occurrence history.
- A manager explicitly acknowledges/resolves an incident with an optional resolution note. Automatic resolution should be approved separately.

## 7. Restaurant health score and analytics

### 7.1 Proposed health score

Use a 0–100 score, recalculated after relevant operational events and at least hourly. Proposed component weights:

| Component | Weight |
| --- | ---: |
| Kitchen efficiency | 25% |
| Inventory health | 20% |
| Order completion rate | 20% |
| Reservation efficiency | 15% |
| Table utilization | 10% |
| Incident frequency | 10% |
| **Total** | **100%** |

Proposed behavior: normalize each component to 0–100 using approved thresholds; if a component has no data, exclude it and renormalize the remaining weights, while showing which components are missing. Do not display a fabricated score when no component data exists.

### 7.2 Proposed metric definitions

- Revenue: billed order totals, clearly labeled as **billed** rather than collected revenue until payments exist.
- Wait time: customer check-in/queue entry to table assignment or service start; choose one definition before coding.
- Preparation time: order accepted to ready, with per-item detail if item timestamps exist.
- Daily/weekly reporting: use the restaurant's configured timezone and currency.
- Peak hours: group completed/placed orders into configurable local-time buckets.

**Approval required:** final formulas, reporting windows, and whether the dashboard uses billed, paid, or both revenue values.

## 8. AI recommendations, real-time updates, and notifications

### 8.1 Proposed AI contract

- Gemini is called server-side only, with the API key stored as `GEMINI_API_KEY`; use a configurable model name such as `GEMINI_MODEL` rather than hard-coding a model version in the code.
- Send the incident, trigger evidence, and a small operational summary; omit customer names, emails, phone numbers, and other unnecessary personal data.
- AI remains advisory and must never mutate operational records or resolve incidents automatically.
- Proposed structured response:

```json
{
  "summary": "string",
  "rootCause": "string",
  "priority": "low | medium | high | critical",
  "actions": [
    {
      "title": "string",
      "description": "string",
      "rationale": "string",
      "expectedImpact": "string"
    }
  ],
  "confidence": 0.0
}
```

- Validate model output against a schema. On timeout, quota failure, or invalid output, return a deterministic rule-based recommendation for the incident type and mark its source as `fallback`.

### 8.2 Proposed real-time event envelope

Proposed event names: `order.created`, `order.status_changed`, `reservation.created`, `reservation.updated`, `inventory.updated`, `incident.created`, `incident.updated`, `recommendation.created`, `notification.created`, and `health_score.updated`.

Each event should include `eventId`, `restaurantId`, `occurredAt`, `entityId`, and a minimal `data` payload. Authenticate the connection and enforce restaurant scoping. Reconnect/replay and delivery guarantees need approval.

### 8.3 Proposed notification channels

Start with persisted in-app notifications and deliver them in real time over WebSockets. Email delivery is required for OTP only if the auth provider uses email; customer SMS/push and external critical-alert delivery are deferred until a provider is selected.

## 9. Database-fallback scope

**Proposed MVP:** transient retry with backoff, cached menu/configuration reads, visible degraded/read-only mode, and a timestamp on cached dashboard data. Defer durable offline write queues and emergency offline mode until persistence, replay, idempotency, and conflict-resolution details are approved.

**Conflict to resolve:** the existing fallback acceptance criteria require queued orders to synchronize after recovery. If the owner accepts the proposed MVP reduction, update those acceptance criteria and the demo plan before implementation.

## 10. Frontend, repository layout, and developer setup

| Topic | Proposed default | Review status |
| --- | --- | --- |
| Repository layout | One repository with `frontend/` (Next.js) and `backend/` (Express API), plus shared documentation/configuration. | Proposed |
| Language | TypeScript for frontend and backend. | Proposed |
| Package manager | npm with a committed lockfile; use workspace scripts if a root orchestrator is needed. | Proposed |
| Runtime | Pin a supported Node.js LTS version compatible with the selected Next.js release when implementation begins. | Version to confirm |
| Environment sample | `.env.example` contains names/placeholders only: `MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, Google OAuth variables, email-provider variables, and frontend API base URL. | Proposed |
| UI | Responsive customer portal plus role-specific restaurant views for reception, kitchen, and management; loading, empty, error, and degraded states. | Proposed |
| Visual design | Propose a high-contrast, accessible restaurant-operations design system after any existing logo/colors are supplied or confirmed absent. | Needs brand approval |

## 11. Quality, CI, deployment, and security

- CI proposal: pull requests run lint, typecheck, unit/integration tests, and production builds for both apps. Do not deploy from a pull request.
- Test plan targets retained from existing docs: dashboard under 2 seconds, API under 500 ms, incident detection under 5 seconds, and AI response under 10 seconds. Recommend interpreting latency as p95, but test environment/concurrency/dataset must be specified.
- Deployment platforms remain Vercel, Render, and MongoDB Atlas as documented. No deployment should be attempted without owner-provided accounts, domains, and secrets.
- Security proposal: HTTPS, least-privilege RBAC, input validation, rate limits for auth/OTP, password hashing, audit events that exclude secrets, and restaurant-level data scoping.
- Branch-protection and merge-policy settings remain undecided until the owner specifies required reviewers/checks and merge method.

## 12. Approval checklist

Before implementation starts, approve or edit:

- [ ] The canonical roles and permission matrix in Section 2.
- [ ] OTP/token/password policy and token transport in Section 3.
- [ ] Tenant model, entity fields, API envelope, missing endpoints, and workflow rules in Sections 4–5.
- [ ] Incident triggers/severity/lifecycle in Section 6.
- [ ] Health-score weights/formulas and analytics definitions in Section 7.
- [ ] AI response schema, fallback mapping, event contract, notification channels in Section 8.
- [ ] MVP database-fallback level and corresponding acceptance-test changes in Section 9.
- [ ] Frontend/backend layout, language, versions, environment names, UI direction in Section 10.
- [ ] CI/security/performance test conditions and deployment prerequisites in Section 11.

No implementation code should depend on an unchecked proposal above. Once approved, move accepted decisions into the canonical SRS/SDD/API/test documents and keep this draft as a decision record or archive it as directed.
